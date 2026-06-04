import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimiter } from "../rateLimiter.js";

const router = Router();
const MAX_USER_IDS = 200;
const SPOTIFY_USER_ID_BATCH_SIZE = 50;
const SPOTIFY_PROFILE_VIEW_ENDPOINT = "https://spclient.wg.spotify.com/user-profile-view/v3/profile";


interface SocialUser {
  id: string;
  displayName: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

class SpotifyRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function getAccessToken(req: Request): string {
  const requestWithToken = req as Request & { accessToken?: unknown };
  return typeof requestWithToken.accessToken === "string" ? requestWithToken.accessToken : "";
}

function getIdsFromBody(body: unknown): string[] | null {
  if (!body || typeof body !== "object" || !("ids" in body)) {
    return null;
  }

  const ids = (body as { ids: unknown }).ids;
  if (!Array.isArray(ids)) {
    return null;
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of ids) {
    if (typeof value !== "string") {
      return null;
    }

    const id = value.trim();
    if (id.length === 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push(id);
  }

  return result;
}

function validateIds(res: Response, ids: string[] | null): ids is string[] {
  if (!ids || ids.length === 0) {
    res.status(400).json({ error: "En az bir Spotify kullanıcı ID'si gerekli" });
    return false;
  }

  if (ids.length > MAX_USER_IDS) {
    res.status(400).json({ error: `Tek istekte en fazla ${MAX_USER_IDS} kullanıcı işlenebilir` });
    return false;
  }

  return true;
}

async function readSpotifyError(response: globalThis.Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const errorValue = (body as { error: unknown }).error;
      if (typeof errorValue === "string") {
        return errorValue;
      }
      if (errorValue && typeof errorValue === "object" && "message" in errorValue) {
        const message = (errorValue as { message: unknown }).message;
        if (typeof message === "string") {
          return message;
        }
      }
    }
  } catch {
    // Ignore malformed Spotify error bodies and use the status below.
  }

  return `Spotify isteği başarısız oldu (${response.status})`;
}

async function fetchSpotifyJson(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new SpotifyRequestError(response.status, await readSpotifyError(response));
  }

  return response.json();
}

function toStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toSocialUser(value: unknown): SocialUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = toStringField(record, "id");
  if (!id) {
    return null;
  }

  let imageUrl: string | null = null;
  const images = record.images;
  if (Array.isArray(images) && images.length > 0) {
    const firstImage = images[0];
    if (firstImage && typeof firstImage === "object") {
      imageUrl = toStringField(firstImage as Record<string, unknown>, "url");
    }
  }

  let externalUrl: string | null = null;
  const externalUrls = record.external_urls;
  if (externalUrls && typeof externalUrls === "object") {
    externalUrl = toStringField(externalUrls as Record<string, unknown>, "spotify");
  }

  return {
    id,
    displayName: toStringField(record, "display_name") ?? id,
    imageUrl,
    externalUrl,
  };
}

function getUserIdFromUri(uri: string): string | null {
  const parts = uri.split(":");
  if (parts.length === 3 && parts[0] === "spotify" && parts[1] === "user" && parts[2]) {
    return parts[2];
  }

  return null;
}

function getCurrentUserId(value: unknown): string {
  if (!value || typeof value !== "object" || !("id" in value)) {
    throw new SpotifyRequestError(502, "Spotify kullanıcı kimliği alınamadı");
  }

  const id = (value as { id: unknown }).id;
  if (typeof id !== "string" || id.length === 0) {
    throw new SpotifyRequestError(502, "Spotify kullanıcı kimliği alınamadı");
  }

  return id;
}

function toProfileViewUser(value: unknown): SocialUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const uri = toStringField(record, "uri");
  const idFromUri = uri ? getUserIdFromUri(uri) : null;
  const id = idFromUri ?? toStringField(record, "id");
  if (!id) {
    return null;
  }

  const imageUrl = toStringField(record, "image_url") ?? toStringField(record, "imageUrl");
  return {
    id,
    displayName: toStringField(record, "name") ?? toStringField(record, "display_name") ?? id,
    imageUrl,
    externalUrl: `https://open.spotify.com/user/${encodeURIComponent(id)}`,
  };
}

function getProfilesFromPayload(value: unknown): SocialUser[] {
  if (!value || typeof value !== "object" || !("profiles" in value)) {
    throw new SpotifyRequestError(502, "Spotify takip listesi beklenen formatta değil");
  }

  const profiles = (value as { profiles: unknown }).profiles;
  if (!Array.isArray(profiles)) {
    throw new SpotifyRequestError(502, "Spotify takip listesi beklenen formatta değil");
  }

  const seen = new Set<string>();
  const users: SocialUser[] = [];
  for (const profile of profiles) {
    const user = toProfileViewUser(profile);
    if (!user || seen.has(user.id)) {
      continue;
    }

    seen.add(user.id);
    users.push(user);
  }

  return users;
}

async function fetchProfileViewUsers(accessToken: string, userId: string, list: "followers" | "following"): Promise<SocialUser[]> {
  const payload = await rateLimiter.execute(() =>
    fetchSpotifyJson(`${SPOTIFY_PROFILE_VIEW_ENDPOINT}/${encodeURIComponent(userId)}/${list}?market=from_token`, accessToken)
  );

  return getProfilesFromPayload(payload);
}

router.get("/connections", authMiddleware, async (req, res) => {
  try {
    const accessToken = getAccessToken(req);
    const currentUser = await rateLimiter.execute(() =>
      fetchSpotifyJson("https://api.spotify.com/v1/me", accessToken)
    );
    const userId = getCurrentUserId(currentUser);
    const [following, followers] = await Promise.all([
      fetchProfileViewUsers(accessToken, userId, "following"),
      fetchProfileViewUsers(accessToken, userId, "followers"),
    ]);

    res.json({ following, followers });
  } catch (error) {
    console.error("Get social connections error:", error);
    if (error instanceof SpotifyRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Spotify takip listeleri alınamadı" });
  }
});

router.post("/users", authMiddleware, async (req, res) => {
  const ids = getIdsFromBody(req.body);
  if (!validateIds(res, ids)) {
    return;
  }

  try {
    const accessToken = getAccessToken(req);
    const users: SocialUser[] = [];
    const missing: string[] = [];

    for (const id of ids) {
      try {
        const user = await rateLimiter.execute(() =>
          fetchSpotifyJson(`https://api.spotify.com/v1/users/${encodeURIComponent(id)}`, accessToken)
        );
        const socialUser = toSocialUser(user);
        if (socialUser) {
          users.push(socialUser);
        } else {
          missing.push(id);
        }
      } catch (error) {
        if (error instanceof SpotifyRequestError && error.status === 404) {
          missing.push(id);
          continue;
        }
        throw error;
      }
    }

    res.json({ users, missing });
  } catch (error) {
    console.error("Get social users error:", error);
    if (error instanceof SpotifyRequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Spotify kullanıcıları alınamadı" });
  }
});

router.delete("/following", authMiddleware, async (req, res) => {
  const ids = getIdsFromBody(req.body);
  if (!validateIds(res, ids)) {
    return;
  }

  try {
    const accessToken = getAccessToken(req);
    for (let index = 0; index < ids.length; index += SPOTIFY_USER_ID_BATCH_SIZE) {
      const batch = ids.slice(index, index + SPOTIFY_USER_ID_BATCH_SIZE);
      const params = new URLSearchParams({ type: "user", ids: batch.join(",") });
      await rateLimiter.execute(async () => {
        const response = await fetch(`https://api.spotify.com/v1/me/following?${params.toString()}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new SpotifyRequestError(response.status, await readSpotifyError(response));
        }
      });
    }

    res.json({ success: true, removed: ids.length, ids });
  } catch (error) {
    console.error("Unfollow users error:", error);
    if (error instanceof SpotifyRequestError) {
      if (error.status === 403) {
        res.status(403).json({ error: "Takipten çıkmak için yeniden Spotify ile giriş yapın" });
        return;
      }
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Kullanıcılar takipten çıkarılamadı" });
  }
});

export default router;

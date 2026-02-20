import { Router } from "express";
import { tokenStore, createSpotifyApi } from "../config.js";

const router = Router();

// Auth Routes
router.get("/login", (req, res) => {
  const spotifyApi = createSpotifyApi();
  const scopes = [
    "user-read-private",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
  ];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, "state123");
  res.json({ url: authorizeURL });
});

router.get("/callback", async (req, res) => {
  const { code } = req.query;
  // Docker'da client aynı origin'den sunuluyor, root'a redirect yeterli
  const clientUrl = process.env.DOCKER === "true"
    ? "/"
    : (process.env.CLIENT_URL || "http://localhost:5173");

  if (!code || typeof code !== "string") {
    return res.redirect(`${clientUrl}?error=no_code`);
  }

  try {
    const spotifyApi = createSpotifyApi();
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = data.body;

    // Basit session ID oluştur
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    tokenStore.set(sessionId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
    });

    console.log(`✅ Auth successful, redirecting to ${clientUrl}?session=***`);
    res.redirect(`${clientUrl}?session=${sessionId}`);
  } catch (error) {
    console.error("❌ Auth error:", error);
    res.redirect(`${clientUrl}?error=auth_failed`);
  }
});

router.post("/logout", (req, res) => {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");
  if (sessionId) {
    tokenStore.delete(sessionId);
  }
  res.json({ success: true });
});

export default router;

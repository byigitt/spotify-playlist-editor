import SpotifyWebApi from "spotify-web-api-node";
import { rateLimiter, cache } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";

export async function getUserPlaylists(accessToken: string) {
  const cacheKey = `playlists:${accessToken.slice(-10)}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const spotifyApi = createSpotifyApi(accessToken);
  const data = await rateLimiter.execute(() =>
    spotifyApi.getUserPlaylists({ limit: 50 })
  );

  // 30 saniye cache
  cache.set(cacheKey, data.body, 30000);
  return data.body;
}

export async function getPlaylist(accessToken: string, playlistId: string) {
  const cacheKey = `playlist:${playlistId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const spotifyApi = createSpotifyApi(accessToken);
  const data = await rateLimiter.execute(() =>
    spotifyApi.getPlaylist(playlistId)
  );

  // 1 dakika cache
  cache.set(cacheKey, data.body, 60000);
  return data.body;
}

export async function createPlaylist(
  accessToken: string,
  name: string,
  description?: string,
  isPublic?: boolean
) {
  const spotifyApi = createSpotifyApi(accessToken);

  const user = await rateLimiter.execute(() => spotifyApi.getMe());
  const playlist = await rateLimiter.execute(() =>
    spotifyApi.createPlaylist(user.body.id, {
      name,
      description: description || "",
      public: isPublic ?? false,
    } as any)
  );

  // Playlist cache'ini invalidate et
  cache.deletePattern(`playlists:*`);

  return playlist.body;
}

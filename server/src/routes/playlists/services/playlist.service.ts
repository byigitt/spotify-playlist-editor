import { rateLimiter } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";

export async function getUserPlaylists(accessToken: string) {
  const spotifyApi = createSpotifyApi(accessToken);
  const data = await rateLimiter.execute(() =>
    spotifyApi.getUserPlaylists({ limit: 50 })
  );
  return data.body;
}

export async function getPlaylist(accessToken: string, playlistId: string) {
  const spotifyApi = createSpotifyApi(accessToken);
  const data = await rateLimiter.execute(() =>
    spotifyApi.getPlaylist(playlistId)
  );
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

  return playlist.body;
}

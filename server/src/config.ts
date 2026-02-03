import SpotifyWebApi from "spotify-web-api-node";

// Store tokens in memory (production'da Redis/DB kullan)
export const tokenStore = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>();

export function createSpotifyApi(accessToken?: string) {
  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });
  if (accessToken) api.setAccessToken(accessToken);
  return api;
}

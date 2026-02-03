import express from "express";
import { tokenStore, createSpotifyApi } from "../config.js";

// Middleware: Token kontrolü ve yenileme
export async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");
  if (!sessionId || !tokenStore.has(sessionId)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tokens = tokenStore.get(sessionId)!;

  // Token süresi dolmuşsa yenile
  if (Date.now() >= tokens.expiresAt - 60000) {
    try {
      const spotifyApi = createSpotifyApi();
      spotifyApi.setRefreshToken(tokens.refreshToken);
      const data = await spotifyApi.refreshAccessToken();
      tokens.accessToken = data.body.access_token;
      tokens.expiresAt = Date.now() + data.body.expires_in * 1000;
      tokenStore.set(sessionId, tokens);
    } catch (error) {
      tokenStore.delete(sessionId);
      return res.status(401).json({ error: "Token refresh failed" });
    }
  }

  (req as any).accessToken = tokens.accessToken;
  next();
}

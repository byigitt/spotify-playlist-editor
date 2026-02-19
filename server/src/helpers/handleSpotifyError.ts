import { Response } from "express";

/**
 * Shared Spotify API error handler for route handlers.
 * Handles common 403/404 status codes with Turkish messages.
 */
export function handleSpotifyError(res: Response, error: any, fallbackMessage: string): void {
  if (error?.statusCode === 403) {
    res.status(403).json({ error: "Bu playlist'i düzenleme yetkiniz yok" });
    return;
  }
  if (error?.statusCode === 404) {
    res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    return;
  }
  res.status(500).json({ error: fallbackMessage });
}

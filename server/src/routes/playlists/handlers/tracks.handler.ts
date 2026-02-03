import { Request, Response } from "express";
import { getPlaylistTrackIds, getPlaylistTracks, addTracksToPlaylist } from "../services/tracks.service.js";

export async function getTrackIdsHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const trackIds = await getPlaylistTrackIds(accessToken, req.params.id);
    res.json({ items: trackIds, total: trackIds.length });
  } catch (error) {
    console.error("Get track IDs error:", error);
    res.status(500).json({ error: "Failed to get track IDs" });
  }
}

export async function getTracksHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const tracks = await getPlaylistTracks(accessToken, req.params.id);
    res.json({ items: tracks, total: tracks.length });
  } catch (error) {
    console.error("Get tracks error:", error);
    res.status(500).json({ error: "Failed to get tracks" });
  }
}

export async function addTracksHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris } = req.body;

    await addTracksToPlaylist(accessToken, req.params.id, uris);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Add tracks error:", error);

    if (error?.statusCode === 403) {
      return res.status(403).json({ error: "Bu playlist'e şarkı ekleme yetkiniz yok" });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    }

    res.status(500).json({ error: "Failed to add tracks" });
  }
}

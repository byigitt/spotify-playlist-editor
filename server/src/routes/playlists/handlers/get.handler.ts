import { Request, Response } from "express";
import { getPlaylist } from "../services/playlist.service.js";

export async function getPlaylistHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const playlist = await getPlaylist(accessToken, req.params.id);
    res.json(playlist);
  } catch (error) {
    console.error("Get playlist error:", error);
    res.status(404).json({ error: "Playlist not found" });
  }
}

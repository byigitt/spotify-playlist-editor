import { Request, Response } from "express";
import { getUserPlaylists } from "../services/playlist.service.js";

export async function listPlaylistsHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const playlists = await getUserPlaylists(accessToken);
    res.json(playlists);
  } catch (error) {
    console.error("Get playlists error:", error);
    res.status(500).json({ error: "Failed to get playlists" });
  }
}

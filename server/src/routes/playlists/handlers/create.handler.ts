import { Request, Response } from "express";
import { createPlaylist } from "../services/playlist.service.js";

export async function createPlaylistHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { name, description, isPublic } = req.body;
    
    const playlist = await createPlaylist(accessToken, name, description, isPublic);
    res.json(playlist);
  } catch (error) {
    console.error("Create playlist error:", error);
    res.status(500).json({ error: "Failed to create playlist" });
  }
}

import { Request, Response } from "express";
import { previewReorder, reorderPlaylist } from "../services/reorder.service.js";
import { handleSpotifyError } from "../../../helpers/handleSpotifyError.js";

export async function previewReorderHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris } = req.body;
    const result = await previewReorder(accessToken, req.params.id, uris);
    res.json(result);
  } catch (error) {
    console.error("Preview error:", error);
    handleSpotifyError(res, error, "Failed to preview");
  }
}

export async function reorderHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris, fastMode = false } = req.body;
    const result = await reorderPlaylist(accessToken, req.params.id, uris, fastMode);
    res.json(result);
  } catch (error) {
    console.error("Reorder playlist error:", error);
    handleSpotifyError(res, error, "Failed to reorder playlist");
  }
}

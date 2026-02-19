import { Request, Response } from "express";
import { getUnavailableTracks, removeUnavailableTracks } from "../services/unavailable.service.js";
import { handleSpotifyError } from "../../../helpers/handleSpotifyError.js";

export async function getUnavailableHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const result = await getUnavailableTracks(accessToken, req.params.id);
    res.json(result);
  } catch (error) {
    console.error("Get unavailable tracks error:", error);
    handleSpotifyError(res, error, "Failed to get unavailable tracks");
  }
}

export async function removeUnavailableHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { positions } = req.body;

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: "positions array required" });
    }

    const result = await removeUnavailableTracks(accessToken, req.params.id, positions);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Remove unavailable tracks error:", error);
    handleSpotifyError(res, error, "Failed to remove unavailable tracks");
  }
}

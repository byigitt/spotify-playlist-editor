import { Request, Response } from "express";
import { getPlaylistTrackIds, getPlaylistTracks, addTracksToPlaylist } from "../services/tracks.service.js";
import { handleSpotifyError } from "../../../helpers/handleSpotifyError.js";

export async function getTrackIdsHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const trackIds = await getPlaylistTrackIds(accessToken, req.params.id);
    res.json({ items: trackIds, total: trackIds.length });
  } catch (error) {
    console.error("Get track IDs error:", error);
    handleSpotifyError(res, error, "Failed to get track IDs");
  }
}

export async function getTracksHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const tracks = await getPlaylistTracks(accessToken, req.params.id);
    res.json({ items: tracks, total: tracks.length });
  } catch (error) {
    console.error("Get tracks error:", error);
    handleSpotifyError(res, error, "Failed to get tracks");
  }
}

export async function addTracksHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris } = req.body;
    await addTracksToPlaylist(accessToken, req.params.id, uris);
    res.json({ success: true });
  } catch (error) {
    console.error("Add tracks error:", error);
    handleSpotifyError(res, error, "Failed to add tracks");
  }
}

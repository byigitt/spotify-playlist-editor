import { Request, Response } from "express";
import { extractGenresFromPlaylist } from "../services/extractGenres.service.js";
import { handleSpotifyError } from "../../../helpers/handleSpotifyError.js";

export async function extractGenresHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { genres, newPlaylistName, copyToNew = true, removeFromOriginal = true } = req.body;

    if (!genres || !Array.isArray(genres) || genres.length === 0) {
      return res.status(400).json({ error: "genres array required" });
    }

    if (!copyToNew && !removeFromOriginal) {
      return res.status(400).json({ error: "En az bir işlem seçmelisiniz (kopyala veya sil)" });
    }

    if (copyToNew && (!newPlaylistName || typeof newPlaylistName !== 'string')) {
      return res.status(400).json({ error: "newPlaylistName required for copy operation" });
    }

    const result = await extractGenresFromPlaylist(
      accessToken,
      req.params.id,
      genres,
      newPlaylistName,
      copyToNew,
      removeFromOriginal
    );

    res.json(result);
  } catch (error: any) {
    console.error("Extract genres error:", error);

    if (error?.message === "Seçilen genre'lara ait şarkı bulunamadı") {
      return res.status(400).json({ error: error.message });
    }

    handleSpotifyError(res, error, "Failed to extract genres");
  }
}

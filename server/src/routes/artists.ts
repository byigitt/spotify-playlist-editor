import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createSpotifyApi } from "../config.js";
import { rateLimiter, cache } from "../rateLimiter.js";

const router = Router();

// Get Artist Genres (cached, rate limited)
router.post("/genres", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const { artistIds } = req.body;

    if (!artistIds || !Array.isArray(artistIds)) {
      return res.status(400).json({ error: "artistIds required" });
    }

    const genres: Record<string, string[]> = {};
    const uncachedIds: string[] = [];

    // Önce cache'den kontrol et
    for (const id of artistIds) {
      const cached = cache.get<string[]>(`artist:${id}`);
      if (cached !== null) {
        genres[id] = cached;
      } else {
        uncachedIds.push(id);
      }
    }

    // Cache'de olmayanları API'den al
    if (uncachedIds.length > 0) {
      // Spotify max 50 artist per request
      for (let i = 0; i < uncachedIds.length; i += 50) {
        const batch = uncachedIds.slice(i, i + 50);
        const data = await rateLimiter.execute(() =>
          spotifyApi.getArtists(batch)
        );
        data.body.artists.forEach((artist: SpotifyApi.ArtistObjectFull | null) => {
          if (artist) {
            genres[artist.id] = artist.genres;
            // 7 gün cache (genre'lar neredeyse hiç değişmez)
            cache.set(`artist:${artist.id}`, artist.genres, 7 * 24 * 60 * 60 * 1000);
          }
        });
      }
    }

    res.json(genres);
  } catch (error) {
    console.error("Get genres error:", error);
    res.status(500).json({ error: "Failed to get genres" });
  }
});

export default router;

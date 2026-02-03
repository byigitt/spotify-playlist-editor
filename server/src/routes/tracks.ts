import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createSpotifyApi } from "../config.js";
import { rateLimiter } from "../rateLimiter.js";

const router = Router();

// Get multiple tracks by IDs (for filling cache)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array required" });
    }

    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const tracks: any[] = [];

    // Spotify max 50 tracks per request
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const data = await rateLimiter.execute(() =>
        spotifyApi.getTracks(batch)
      );
      tracks.push(...data.body.tracks.filter((t: any) => t !== null));
    }

    res.json({ tracks });
  } catch (error) {
    console.error("Get tracks error:", error);
    res.status(500).json({ error: "Failed to get tracks" });
  }
});

export default router;

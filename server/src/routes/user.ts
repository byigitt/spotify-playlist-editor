import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { createSpotifyApi } from "../config.js";

const router = Router();

// User Profile
router.get("/", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const data = await spotifyApi.getMe();
    res.json(data.body);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

export default router;

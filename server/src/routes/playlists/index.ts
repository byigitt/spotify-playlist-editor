import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";

// Handlers
import { listPlaylistsHandler } from "./handlers/list.handler.js";
import { getPlaylistHandler } from "./handlers/get.handler.js";
import { createPlaylistHandler } from "./handlers/create.handler.js";
import { getTrackIdsHandler, getTracksHandler, addTracksHandler } from "./handlers/tracks.handler.js";
import { getUnavailableHandler, removeUnavailableHandler } from "./handlers/unavailable.handler.js";
import { previewReorderHandler, reorderHandler } from "./handlers/reorder.handler.js";
import { extractGenresHandler } from "./handlers/extractGenres.handler.js";

const router = Router();

// Playlist CRUD
router.get("/", authMiddleware, listPlaylistsHandler);
router.get("/:id", authMiddleware, getPlaylistHandler);
router.post("/", authMiddleware, createPlaylistHandler);

// Tracks
router.get("/:id/track-ids", authMiddleware, getTrackIdsHandler);
router.get("/:id/tracks", authMiddleware, getTracksHandler);
router.post("/:id/tracks", authMiddleware, addTracksHandler);

// Unavailable tracks
router.get("/:id/unavailable", authMiddleware, getUnavailableHandler);
router.delete("/:id/unavailable", authMiddleware, removeUnavailableHandler);

// Reorder
router.post("/:id/reorder/preview", authMiddleware, previewReorderHandler);
router.put("/:id/tracks", authMiddleware, reorderHandler);

// Extract genres
router.post("/:id/extract-genres", authMiddleware, extractGenresHandler);

export default router;

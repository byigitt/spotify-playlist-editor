import { Request, Response } from "express";
import { previewReorder, reorderPlaylist } from "../services/reorder.service.js";

export async function previewReorderHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris } = req.body;

    const result = await previewReorder(accessToken, req.params.id, uris);
    res.json(result);
  } catch (error: any) {
    console.error("Preview error:", error);

    if (error?.statusCode === 403) {
      return res.status(403).json({ error: "Bu playlist'e erişim yetkiniz yok" });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    }

    res.status(500).json({ error: "Failed to preview" });
  }
}

export async function reorderHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const { uris, fastMode = false } = req.body;

    const result = await reorderPlaylist(accessToken, req.params.id, uris, fastMode);
    res.json(result);
  } catch (error: any) {
    console.error("Reorder playlist error:", error);

    if (error?.statusCode === 403) {
      return res.status(403).json({ error: "Bu playlist'i düzenleme yetkiniz yok" });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    }

    res.status(500).json({ error: "Failed to reorder playlist" });
  }
}

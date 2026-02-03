import { Request, Response } from "express";
import { getUnavailableTracks, removeUnavailableTracks } from "../services/unavailable.service.js";

export async function getUnavailableHandler(req: Request, res: Response) {
  try {
    const accessToken = (req as any).accessToken;
    const result = await getUnavailableTracks(accessToken, req.params.id);
    res.json(result);
  } catch (error: any) {
    console.error("Get unavailable tracks error:", error);

    if (error?.statusCode === 403) {
      return res.status(403).json({ error: "Bu playlist'e erişim yetkiniz yok" });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    }

    res.status(500).json({ error: "Failed to get unavailable tracks" });
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
  } catch (error: any) {
    console.error("Remove unavailable tracks error:", error);

    if (error?.statusCode === 403) {
      return res.status(403).json({ error: "Bu playlist'i düzenleme yetkiniz yok" });
    }
    if (error?.statusCode === 404) {
      return res.status(404).json({ error: "Playlist bulunamadı veya erişim yetkiniz yok" });
    }

    res.status(500).json({ error: "Failed to remove unavailable tracks" });
  }
}

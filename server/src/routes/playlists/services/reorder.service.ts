import { rateLimiter, cache } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";
import { getChangeStats, estimateTime } from "../../../reorderOptimizer.js";
import { jobQueue } from "../../../jobQueue.js";
import { formatTime, executeReorder, processReorderJob } from "../../../helpers/reorder.js";
import { getPlaylistUris, invalidatePlaylistCache } from "./tracks.service.js";

export interface ReorderPreviewResult {
  estimatedApiCalls: number;
  estimatedTimeMs: number;
  estimatedTimeFormatted: string;
  recommendFastMode: boolean;
  moves: any[];
}

export async function previewReorder(
  accessToken: string,
  playlistId: string,
  targetUris: string[]
): Promise<ReorderPreviewResult> {
  const currentUris = await getPlaylistUris(accessToken, playlistId);
  const stats = getChangeStats(currentUris, targetUris);
  const estimatedMs = estimateTime(stats.estimatedApiCalls);

  return {
    ...stats,
    estimatedTimeMs: estimatedMs,
    estimatedTimeFormatted: formatTime(estimatedMs),
    recommendFastMode: stats.estimatedApiCalls > 50
  };
}

export interface ReorderResult {
  success: boolean;
  mode: 'fast' | 'sync' | 'async';
  async?: boolean;
  jobId?: string;
  estimatedTime?: string;
  stats?: { operations: number };
}

export async function reorderPlaylist(
  accessToken: string,
  playlistId: string,
  targetUris: string[],
  fastMode: boolean = false
): Promise<ReorderResult> {
  const spotifyApi = createSpotifyApi(accessToken);
  const currentUris = await getPlaylistUris(accessToken, playlistId);
  const stats = getChangeStats(currentUris, targetUris);

  console.log(`📊 Reorder stats:`, { ...stats, moves: `${stats.estimatedApiCalls} operations` });

  // Fast mode: Sil ve yeniden ekle
  if (fastMode) {
    console.log(`⚡ Fast mode: Replacing all tracks`);

    const uniqueCurrentUris = [...new Set(currentUris)];

    // Tüm unique şarkıları sil
    if (uniqueCurrentUris.length > 0) {
      for (let i = 0; i < uniqueCurrentUris.length; i += 100) {
        const batch = uniqueCurrentUris.slice(i, i + 100).map(uri => ({ uri }));
        await rateLimiter.execute(() =>
          spotifyApi.removeTracksFromPlaylist(playlistId, batch as any)
        );
      }
    }

    // Yeni sırayla ekle
    for (let i = 0; i < targetUris.length; i += 100) {
      const batch = targetUris.slice(i, i + 100);
      await rateLimiter.execute(() =>
        spotifyApi.addTracksToPlaylist(playlistId, batch)
      );
    }

    invalidatePlaylistCache(playlistId);

    return {
      success: true,
      mode: 'fast',
      stats: { operations: Math.ceil(uniqueCurrentUris.length / 100) + Math.ceil(targetUris.length / 100) }
    };
  }

  // Çok fazla move varsa background job başlat
  if (stats.estimatedApiCalls > 20) {
    const job = jobQueue.create();

    // Background'da çalıştır
    processReorderJob(job.id, playlistId, accessToken, currentUris, targetUris, stats);

    return {
      success: true,
      mode: 'async',
      async: true,
      jobId: job.id,
      estimatedTime: formatTime(estimateTime(stats.estimatedApiCalls))
    };
  }

  // Az move varsa senkron yap
  await executeReorder(spotifyApi, playlistId, currentUris, targetUris, stats);

  invalidatePlaylistCache(playlistId);

  return {
    success: true,
    mode: 'sync',
    stats: { operations: stats.estimatedApiCalls }
  };
}

import SpotifyWebApi from "spotify-web-api-node";
import { rateLimiter } from "../rateLimiter.js";
import { getChangeStats } from "../reorderOptimizer.js";
import { jobQueue } from "../jobQueue.js";
import { createSpotifyApi } from "../config.js";

export function formatTime(ms: number): string {
  if (ms < 1000) return 'birkaç saniye';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds} saniye`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} dakika`;
}

export async function executeReorder(
  spotifyApi: SpotifyWebApi,
  playlistId: string,
  currentUris: string[],
  targetUris: string[],
  stats: ReturnType<typeof getChangeStats>,
  onProgress?: (progress: number, message: string) => void
) {
  // Duplicate'ları doğru handle etmek için count bazlı karşılaştırma
  const currentCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();

  currentUris.forEach(uri => {
    currentCounts.set(uri, (currentCounts.get(uri) || 0) + 1);
  });

  targetUris.forEach(uri => {
    targetCounts.set(uri, (targetCounts.get(uri) || 0) + 1);
  });

  // Silinecek şarkıları bul: current'ta olup target'ta olmayan veya fazla olanlar
  const toRemove: string[] = [];
  const removeTracked = new Map<string, number>();

  for (const uri of currentUris) {
    const targetCount = targetCounts.get(uri) || 0;
    const removedSoFar = removeTracked.get(uri) || 0;
    const currentCount = currentCounts.get(uri) || 0;

    // Bu URI'den silinmesi gereken miktar
    const shouldRemove = currentCount - targetCount;

    if (removedSoFar < shouldRemove) {
      toRemove.push(uri);
      removeTracked.set(uri, removedSoFar + 1);
    }
  }

  if (toRemove.length > 0) {
    onProgress?.(5, `${toRemove.length} şarkı siliniyor...`);
    for (let i = 0; i < toRemove.length; i += 100) {
      const batch = toRemove.slice(i, i + 100).map(uri => ({ uri }));
      await rateLimiter.execute(() =>
        spotifyApi.removeTracksFromPlaylist(playlistId, batch as any)
      );
    }

    // currentUris'i güncelle - silinen şarkıları çıkar
    const stillToRemove = new Map(removeTracked);
    currentUris = currentUris.filter(uri => {
      const count = stillToRemove.get(uri) || 0;
      if (count > 0) {
        stillToRemove.set(uri, count - 1);
        return false; // Bu occurrence'ı sil
      }
      return true; // Bu occurrence'ı tut
    });
  }

  // Move işlemlerini uygula
  const moves = stats.moves;

  if (moves.length > 0) {
    let snapshotId: string | undefined;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const progress = 10 + (i / moves.length) * 85;
      onProgress?.(progress, `Şarkılar taşınıyor... ${i + 1}/${moves.length}`);

      const result = await rateLimiter.execute(() =>
        spotifyApi.reorderTracksInPlaylist(
          playlistId,
          move.rangeStart,
          move.insertBefore,
          { range_length: move.rangeLength, snapshot_id: snapshotId }
        )
      );
      snapshotId = result.body.snapshot_id;
    }
  }

  onProgress?.(100, 'Tamamlandı!');
}

export async function processReorderJob(
  jobId: string,
  playlistId: string,
  accessToken: string,
  currentUris: string[],
  targetUris: string[],
  stats: ReturnType<typeof getChangeStats>
) {
  const spotifyApi = createSpotifyApi(accessToken);

  jobQueue.update(jobId, { status: 'running', progress: 0, message: 'Başlatılıyor...' });

  try {
    await executeReorder(
      spotifyApi,
      playlistId,
      currentUris,
      targetUris,
      stats,
      (progress, message) => {
        jobQueue.update(jobId, { progress, message });
      }
    );

    jobQueue.update(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Tamamlandı!',
      result: { success: true, operations: stats.estimatedApiCalls }
    });
  } catch (error) {
    console.error('Job failed:', error);
    jobQueue.update(jobId, {
      status: 'failed',
      message: 'İşlem başarısız oldu',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

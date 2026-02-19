/**
 * Playlist Reorder Optimizer v3
 * 
 * Minimum API call ile playlist'i yeniden sıralar.
 * Ardışık şarkıları gruplayarak tek seferde taşır.
 * Duplicate şarkıları doğru handle eder.
 */

export interface MoveOperation {
  rangeStart: number;
  insertBefore: number;
  rangeLength: number;
}

/**
 * Count occurrences of each URI in an array.
 */
function countUris(uris: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const uri of uris) {
    counts.set(uri, (counts.get(uri) || 0) + 1);
  }
  return counts;
}

/**
 * Extract common elements between two URI lists, respecting duplicate counts.
 * Returns items from `source` that exist in `other` (up to the count in `other`).
 */
function extractCommon(source: string[], otherCounts: Map<string, number>): string[] {
  const result: string[] = [];
  const used = new Map<string, number>();

  for (const uri of source) {
    const usedCount = used.get(uri) || 0;
    const otherCount = otherCounts.get(uri) || 0;
    if (usedCount < otherCount) {
      result.push(uri);
      used.set(uri, usedCount + 1);
    }
  }

  return result;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * İki sıralama arasındaki minimum hamleleri hesaplar.
 * Ardışık hareket eden şarkıları gruplar.
 */
export function calculateMinimumMoves(
  currentOrder: string[],
  targetOrder: string[]
): MoveOperation[] {
  const currentCounts = countUris(currentOrder);
  const targetCounts = countUris(targetOrder);

  const commonCurrent = extractCommon(currentOrder, targetCounts);
  const commonTarget = extractCommon(targetOrder, currentCounts);

  if (arraysEqual(commonCurrent, commonTarget)) {
    return [];
  }

  return simulateOptimalMoves(commonCurrent, commonTarget);
}

/**
 * Optimal hamleleri simüle ederek hesapla.
 * Greedy yaklaşım: Her adımda en çok şarkıyı doğru yere taşı.
 */
function simulateOptimalMoves(current: string[], target: string[]): MoveOperation[] {
  const moves: MoveOperation[] = [];
  const working = [...current];

  let i = 0;
  while (i < target.length && i < working.length) {
    const targetUri = target[i];

    // working[i]'den başlayarak targetUri'yi ara
    let currentIdx = -1;
    for (let j = i; j < working.length; j++) {
      if (working[j] === targetUri) {
        currentIdx = j;
        break;
      }
    }

    // Bulunamadıysa veya zaten doğru yerdeyse atla
    if (currentIdx === -1 || currentIdx === i) {
      i++;
      continue;
    }

    // Ardışık kaç şarkı birlikte taşınabilir?
    let rangeLength = 1;
    while (
      i + rangeLength < target.length &&
      currentIdx + rangeLength < working.length &&
      working[currentIdx + rangeLength] === target[i + rangeLength]
    ) {
      rangeLength++;
    }

    // Spotify API: rangeStart = mevcut pozisyon, insertBefore = hedef pozisyon (taşınmadan önce)
    moves.push({ rangeStart: currentIdx, insertBefore: i, rangeLength });

    // Working array'i güncelle (simülasyon)
    const removed = working.splice(currentIdx, rangeLength);
    working.splice(i, 0, ...removed);

    i += rangeLength;
  }

  return moves;
}

/**
 * Değişiklik istatistiklerini hesapla.
 */
export function getChangeStats(currentOrder: string[], targetOrder: string[]) {
  const currentCounts = countUris(currentOrder);
  const targetCounts = countUris(targetOrder);

  // Kaldırılacak şarkılar: current'ta fazla olanlar
  let removedCount = 0;
  for (const [uri, count] of currentCounts) {
    const targetCount = targetCounts.get(uri) || 0;
    if (count > targetCount) removedCount += count - targetCount;
  }

  // Eklenecek şarkılar: target'ta fazla olanlar
  let addedCount = 0;
  for (const [uri, count] of targetCounts) {
    const currentCount = currentCounts.get(uri) || 0;
    if (count > currentCount) addedCount += count - currentCount;
  }

  const commonCurrent = extractCommon(currentOrder, targetCounts);
  const commonTarget = extractCommon(targetOrder, currentCounts);

  // Pozisyon değişikliklerini say
  let positionChanges = 0;
  const minLen = Math.min(commonCurrent.length, commonTarget.length);
  for (let i = 0; i < minLen; i++) {
    if (commonCurrent[i] !== commonTarget[i]) positionChanges++;
  }

  const moves = calculateMinimumMoves(currentOrder, targetOrder);

  return {
    removed: removedCount,
    added: addedCount,
    reordered: positionChanges,
    total: currentOrder.length,
    targetTotal: targetOrder.length,
    estimatedApiCalls: moves.length,
    moves
  };
}

/**
 * Estimated time for reorder operation.
 */
export function estimateTime(moveCount: number): number {
  return moveCount * 150; // ~150ms per move (rate limiter + network)
}

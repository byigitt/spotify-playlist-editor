/**
 * Playlist Reorder Optimizer v2
 * 
 * Minimum API call ile playlist'i yeniden sıralar.
 * Ardışık şarkıları gruplayarak tek seferde taşır.
 */

export interface MoveOperation {
  rangeStart: number;
  insertBefore: number;
  rangeLength: number;
}

/**
 * İki sıralama arasındaki minimum hamleleri hesaplar
 * Ardışık hareket eden şarkıları gruplar
 */
export function calculateMinimumMoves(
  currentOrder: string[],
  targetOrder: string[]
): MoveOperation[] {
  // Sadece her iki listede de olan şarkıları al
  const currentSet = new Set(currentOrder);
  const targetSet = new Set(targetOrder);
  
  const commonCurrent = currentOrder.filter(uri => targetSet.has(uri));
  const commonTarget = targetOrder.filter(uri => currentSet.has(uri));
  
  // Eğer listeler aynıysa hamle yok
  if (arraysEqual(commonCurrent, commonTarget)) {
    return [];
  }

  // Simülasyon ile minimum hamleleri hesapla
  return simulateOptimalMoves(commonCurrent, commonTarget);
}

/**
 * Optimal hamleleri simüle ederek hesapla
 * Greedy yaklaşım: Her adımda en çok şarkıyı doğru yere taşı
 */
function simulateOptimalMoves(current: string[], target: string[]): MoveOperation[] {
  const moves: MoveOperation[] = [];
  const working = [...current];
  
  // Target'taki her pozisyon için kontrol et
  let i = 0;
  while (i < target.length) {
    const targetUri = target[i];
    const currentIdx = working.indexOf(targetUri);
    
    // Zaten doğru yerdeyse atla
    if (currentIdx === i) {
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
    
    // Move operation oluştur
    moves.push({
      rangeStart: currentIdx,
      insertBefore: i,
      rangeLength
    });
    
    // Working array'i güncelle
    const removed = working.splice(currentIdx, rangeLength);
    const insertAt = currentIdx < i ? i - rangeLength : i;
    working.splice(insertAt, 0, ...removed);
    
    // rangeLength kadar ileri atla (hepsi doğru yere geldi)
    i += rangeLength;
  }
  
  return moves;
}

/**
 * Değişiklik istatistiklerini hesapla
 */
export function getChangeStats(currentOrder: string[], targetOrder: string[]) {
  const currentSet = new Set(currentOrder);
  const targetSet = new Set(targetOrder);
  
  const removed = currentOrder.filter(uri => !targetSet.has(uri));
  const added = targetOrder.filter(uri => !currentSet.has(uri));
  
  const commonCurrent = currentOrder.filter(uri => targetSet.has(uri));
  const commonTarget = targetOrder.filter(uri => currentSet.has(uri));
  
  let positionChanges = 0;
  for (let i = 0; i < commonCurrent.length; i++) {
    if (commonCurrent[i] !== commonTarget[i]) {
      positionChanges++;
    }
  }
  
  // Tahmini API call sayısı
  const moves = calculateMinimumMoves(currentOrder, targetOrder);
  
  return {
    removed: removed.length,
    added: added.length,
    reordered: positionChanges,
    total: currentOrder.length,
    targetTotal: targetOrder.length,
    estimatedApiCalls: moves.length,
    moves
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Estimated time for reorder operation
 */
export function estimateTime(moveCount: number): number {
  // Her move ~150ms (rate limiter + network)
  return moveCount * 150;
}

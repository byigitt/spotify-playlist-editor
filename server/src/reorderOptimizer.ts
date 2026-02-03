/**
 * Playlist Reorder Optimizer v3
 * 
 * Minimum API call ile playlist'i yeniden sıralar.
 * Ardışık şarkıları gruplayarak tek seferde taşır.
 * 
 * ÖNEMLİ: Duplicate şarkıları doğru handle eder!
 */

export interface MoveOperation {
  rangeStart: number;
  insertBefore: number;
  rangeLength: number;
}

/**
 * İki sıralama arasındaki minimum hamleleri hesaplar
 * Ardışık hareket eden şarkıları gruplar
 * 
 * NOT: Duplicate'ları doğru handle etmek için Set yerine
 * pozisyon bazlı karşılaştırma yapılır.
 */
export function calculateMinimumMoves(
  currentOrder: string[],
  targetOrder: string[]
): MoveOperation[] {
  // Duplicate'ları doğru handle etmek için URI+index ile count tut
  const currentCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  
  currentOrder.forEach(uri => {
    currentCounts.set(uri, (currentCounts.get(uri) || 0) + 1);
  });
  
  targetOrder.forEach(uri => {
    targetCounts.set(uri, (targetCounts.get(uri) || 0) + 1);
  });
  
  // Her iki listede de olan şarkıları al (duplicate sayısına dikkat ederek)
  const commonCurrent: string[] = [];
  const usedFromCurrent = new Map<string, number>();
  
  for (const uri of currentOrder) {
    const usedCount = usedFromCurrent.get(uri) || 0;
    const targetCount = targetCounts.get(uri) || 0;
    
    // Bu URI'den target'ta kaç tane varsa o kadarını al
    if (usedCount < targetCount) {
      commonCurrent.push(uri);
      usedFromCurrent.set(uri, usedCount + 1);
    }
  }
  
  const commonTarget: string[] = [];
  const usedFromTarget = new Map<string, number>();
  
  for (const uri of targetOrder) {
    const usedCount = usedFromTarget.get(uri) || 0;
    const currentCount = currentCounts.get(uri) || 0;
    
    // Bu URI'den current'ta kaç tane varsa o kadarını al
    if (usedCount < currentCount) {
      commonTarget.push(uri);
      usedFromTarget.set(uri, usedCount + 1);
    }
  }
  
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
 * 
 * DÜZELTİLDİ: splice sonrası insertAt hesabı düzeltildi
 */
function simulateOptimalMoves(current: string[], target: string[]): MoveOperation[] {
  const moves: MoveOperation[] = [];
  const working = [...current];
  
  // Target'taki her pozisyon için kontrol et
  let i = 0;
  while (i < target.length && i < working.length) {
    const targetUri = target[i];
    
    // working[i]'den başlayarak targetUri'yi ara
    // (önceki pozisyonlarda zaten doğru elemanlar var)
    let currentIdx = -1;
    for (let j = i; j < working.length; j++) {
      if (working[j] === targetUri) {
        currentIdx = j;
        break;
      }
    }
    
    // Bulunamadıysa (target'ta var ama working'de yok) atla
    if (currentIdx === -1) {
      i++;
      continue;
    }
    
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
    
    // Spotify API'nin reorderTracksInPlaylist parametreleri:
    // - rangeStart: taşınacak ilk şarkının mevcut pozisyonu
    // - insertBefore: şarkıların taşınacağı pozisyon (taşınmadan önceki indexlere göre)
    // 
    // Önemli: insertBefore, range çıkarılmadan ÖNCE'ki pozisyonu ifade eder!
    moves.push({
      rangeStart: currentIdx,
      insertBefore: i,
      rangeLength
    });
    
    // Working array'i güncelle (simülasyon)
    // Önce elemanları çıkar
    const removed = working.splice(currentIdx, rangeLength);
    // Sonra doğru yere ekle
    // currentIdx > i olduğundan (yukarıdaki kontrol nedeniyle), 
    // splice sonrası insert pozisyonu hala i'dir
    working.splice(i, 0, ...removed);
    
    // rangeLength kadar ileri atla (hepsi doğru yere geldi)
    i += rangeLength;
  }
  
  return moves;
}

/**
 * Değişiklik istatistiklerini hesapla
 * Duplicate'ları doğru handle eder
 */
export function getChangeStats(currentOrder: string[], targetOrder: string[]) {
  // URI başına count hesapla (duplicate'lar için)
  const currentCounts = new Map<string, number>();
  const targetCounts = new Map<string, number>();
  
  currentOrder.forEach(uri => {
    currentCounts.set(uri, (currentCounts.get(uri) || 0) + 1);
  });
  
  targetOrder.forEach(uri => {
    targetCounts.set(uri, (targetCounts.get(uri) || 0) + 1);
  });
  
  // Kaldırılacak şarkılar: current'ta olup target'ta olmayan veya fazla olanlar
  let removedCount = 0;
  for (const [uri, count] of currentCounts) {
    const targetCount = targetCounts.get(uri) || 0;
    if (count > targetCount) {
      removedCount += count - targetCount;
    }
  }
  
  // Eklenecek şarkılar: target'ta olup current'ta olmayan veya fazla olanlar
  let addedCount = 0;
  for (const [uri, count] of targetCounts) {
    const currentCount = currentCounts.get(uri) || 0;
    if (count > currentCount) {
      addedCount += count - currentCount;
    }
  }
  
  // Ortak şarkıları bul (duplicate sayısına dikkat ederek)
  const commonCurrent: string[] = [];
  const usedFromCurrent = new Map<string, number>();
  
  for (const uri of currentOrder) {
    const usedCount = usedFromCurrent.get(uri) || 0;
    const targetCount = targetCounts.get(uri) || 0;
    
    if (usedCount < targetCount) {
      commonCurrent.push(uri);
      usedFromCurrent.set(uri, usedCount + 1);
    }
  }
  
  const commonTarget: string[] = [];
  const usedFromTarget = new Map<string, number>();
  
  for (const uri of targetOrder) {
    const usedCount = usedFromTarget.get(uri) || 0;
    const currentCount = currentCounts.get(uri) || 0;
    
    if (usedCount < currentCount) {
      commonTarget.push(uri);
      usedFromTarget.set(uri, usedCount + 1);
    }
  }
  
  // Pozisyon değişikliklerini say
  let positionChanges = 0;
  const minLen = Math.min(commonCurrent.length, commonTarget.length);
  for (let i = 0; i < minLen; i++) {
    if (commonCurrent[i] !== commonTarget[i]) {
      positionChanges++;
    }
  }
  
  // Tahmini API call sayısı
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

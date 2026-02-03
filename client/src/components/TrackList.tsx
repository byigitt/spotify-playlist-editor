import { useState } from 'react';
import { ArrowUp, ArrowDown, Clock, Loader2, Music, GripVertical, RefreshCw, Shuffle } from 'lucide-react';
import { TrackWithGenres, SortConfig, SortOption } from '../types/spotify';

interface LoadingState {
  isLoading: boolean;
  phase: 'idle' | 'ids' | 'tracks' | 'genres';
  progress: number;
  message: string;
}

interface TrackListProps {
  tracks: TrackWithGenres[];
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  isLoading: boolean;
  loadingState?: LoadingState;
  groupBy: 'none' | 'genre' | 'album';
  onGroupByChange: (value: 'none' | 'genre' | 'album') => void;
  onTracksReorder: (tracks: TrackWithGenres[]) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'added_at', label: 'Eklenme Tarihi' },
  { value: 'name', label: 'Şarkı Adı' },
  { value: 'artist', label: 'Sanatçı' },
  { value: 'album', label: 'Albüm' },
  { value: 'genre', label: 'Tür (Genre)' },
  { value: 'release_date', label: 'Yayın Tarihi' },
  { value: 'popularity', label: 'Popülerlik' },
  { value: 'random', label: 'Rastgele (Shuffle)' },
];

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TrackList({ 
  tracks, 
  sortConfig, 
  onSortChange, 
  isLoading,
  loadingState,
  groupBy,
  onGroupByChange,
  onTracksReorder,
  onRefresh,
  isRefreshing
}: TrackListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleSortOptionChange = (option: SortOption) => {
    onSortChange({ ...sortConfig, option });
  };

  const handleDirectionToggle = () => {
    if (sortConfig.option === 'random') {
      // Random için yeniden karıştır - aynı config'i gönder, App.tsx handle edecek
      onSortChange({ ...sortConfig, option: 'random' });
    } else {
      onSortChange({ 
        ...sortConfig, 
        direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' 
      });
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newTracks = [...tracks];
    const [draggedItem] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(dropIndex, 0, draggedItem);
    
    onTracksReorder(newTracks);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (isLoading) {
    return (
      <div className="track-list">
        <div className="loading">
          <Loader2 className="spin" size={32} />
          <p>{loadingState?.message || 'Şarkılar yükleniyor...'}</p>
          {loadingState && loadingState.progress > 0 && (
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${loadingState.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="track-list">
        <div className="empty"><Music size={48} /><p>Bir playlist seçin</p></div>
      </div>
    );
  }

  // Gruplama
  let groupedTracks: Map<string, TrackWithGenres[]> | null = null;
  if (groupBy === 'genre') {
    groupedTracks = new Map();
    tracks.forEach(t => {
      const key = t.genres[0] || 'Bilinmeyen';
      if (!groupedTracks!.has(key)) groupedTracks!.set(key, []);
      groupedTracks!.get(key)!.push(t);
    });
  } else if (groupBy === 'album') {
    groupedTracks = new Map();
    tracks.forEach(t => {
      const key = t.track?.album.name || 'Bilinmeyen';
      if (!groupedTracks!.has(key)) groupedTracks!.set(key, []);
      groupedTracks!.get(key)!.push(t);
    });
  }

  // Grupları sırala - Bilinmeyen en sona
  const sortGroups = (entries: [string, TrackWithGenres[]][]) => {
    return entries.sort(([a], [b]) => {
      if (a === 'Bilinmeyen') return 1;
      if (b === 'Bilinmeyen') return -1;
      return a.localeCompare(b);
    });
  };

  return (
    <div className="track-list">
      <div className="track-controls">
        <div className="sort-controls">
          <label>Sırala:</label>
          <select 
            value={sortConfig.option}
            onChange={(e) => handleSortOptionChange(e.target.value as SortOption)}
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button 
            className="btn btn-icon"
            onClick={handleDirectionToggle}
            title={sortConfig.option === 'random' ? 'Yeniden Karıştır' : (sortConfig.direction === 'asc' ? 'Artan' : 'Azalan')}
          >
            {sortConfig.option === 'random' ? <Shuffle size={18} /> : (sortConfig.direction === 'asc' ? <ArrowUp size={18} /> : <ArrowDown size={18} />)}
          </button>
        </div>
        
        <div className="group-controls">
          <label>Grupla:</label>
          <select 
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as 'none' | 'genre' | 'album')}
          >
            <option value="none">Grupsuz</option>
            <option value="genre">Genre'a Göre</option>
            <option value="album">Albüme Göre</option>
          </select>
        </div>
      </div>

      <div className="track-info-bar">
        <div className="track-info-left">
          <span className="track-count">{tracks.length} şarkı</span>
          {onRefresh && (
            <button 
              className="btn btn-icon btn-refresh"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Playlist'i yenile"
            >
              <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
            </button>
          )}
        </div>
        {!groupedTracks && (
          <span className="drag-hint">
            <GripVertical size={14} /> Sürükle bırak ile sıralayabilirsin
          </span>
        )}
      </div>

      {groupedTracks ? (
        <div className="grouped-tracks">
          {sortGroups(Array.from(groupedTracks.entries()))
            .map(([group, groupTracks]) => (
              <div key={group} className="track-group">
                <h3 className="group-header">
                  <span className="group-name">{group}</span>
                  <span className="group-count">{groupTracks.length} şarkı</span>
                </h3>
                <div className="tracks-table-wrapper">
                  <table className="tracks-table">
                    <thead>
                      <tr>
                        <th className="col-index">#</th>
                        <th className="col-title">Şarkı</th>
                        <th className="col-artist">Sanatçı</th>
                        <th className="col-album">Albüm</th>
                        <th className="col-duration"><Clock size={14} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupTracks.map((item, index) => {
                        if (!item.track) return null;
                        return (
                          <tr key={`${item.track.id}-${index}`} className="track-row">
                            <td className="track-index">{index + 1}</td>
                            <td className="track-title">
                              <div className="track-title-inner">
                                {item.track.album.images[2] ? (
                                  <img src={item.track.album.images[2].url} alt="" className="track-thumb" />
                                ) : (
                                  <div className="track-thumb-placeholder"><Music size={16} /></div>
                                )}
                                <span className="track-name">{item.track.name}</span>
                              </div>
                            </td>
                            <td className="track-artist">{item.track.artists.map(a => a.name).join(', ')}</td>
                            <td className="track-album">{item.track.album.name}</td>
                            <td className="track-duration">{formatDuration(item.track.duration_ms)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="tracks-table-wrapper">
          <table className="tracks-table">
            <thead>
              <tr>
                <th className="col-drag"></th>
                <th className="col-index">#</th>
                <th className="col-title">Şarkı</th>
                <th className="col-artist">Sanatçı</th>
                <th className="col-album">Albüm</th>
                <th className="col-genre">Genre</th>
                <th className="col-duration"><Clock size={14} /></th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((item, index) => {
                if (!item.track) return null;
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                
                return (
                  <tr 
                    key={`${item.track.id}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`track-row ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  >
                    <td className="drag-handle">
                      <GripVertical size={16} />
                    </td>
                    <td className="track-index">{index + 1}</td>
                    <td className="track-title">
                      <div className="track-title-inner">
                        {item.track.album.images[2] ? (
                          <img 
                            src={item.track.album.images[2].url} 
                            alt=""
                            className="track-thumb"
                            draggable={false}
                          />
                        ) : (
                          <div className="track-thumb-placeholder"><Music size={16} /></div>
                        )}
                        <span className="track-name">{item.track.name}</span>
                      </div>
                    </td>
                    <td className="track-artist">{item.track.artists.map(a => a.name).join(', ')}</td>
                    <td className="track-album">{item.track.album.name}</td>
                    <td className="track-genres">
                      <div className="genres">
                        {item.genres.length > 0 ? (
                          item.genres.slice(0, 2).map(g => (
                            <span key={g} className="genre-tag">{g}</span>
                          ))
                        ) : (
                          <span className="genre-tag genre-unknown">Bilinmeyen</span>
                        )}
                      </div>
                    </td>
                    <td className="track-duration">{formatDuration(item.track.duration_ms)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

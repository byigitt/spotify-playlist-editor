import { useState } from 'react';
import { ListMusic, Music, Loader2, Search, Link, Lock, Users } from 'lucide-react';
import { SpotifyPlaylist } from '../types/spotify';
import { useAuth } from '../context/AuthContext';

interface PlaylistListProps {
  playlists: SpotifyPlaylist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  userId: string | null;
  onPlaylistImport: (playlist: SpotifyPlaylist) => void;
}

export function PlaylistList({ playlists, selectedId, onSelect, isLoading, userId, onPlaylistImport }: PlaylistListProps) {
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const filteredPlaylists = playlists.filter(playlist =>
    playlist.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canEdit = (playlist: SpotifyPlaylist) => {
    const isOwner = userId && playlist.owner.id === userId;
    const isCollaborative = playlist.collaborative === true;
    const isManuallyMarked = playlist._markedAsCollaborator === true;
    return isOwner || isCollaborative || isManuallyMarked;
  };

  const isCollaborator = (playlist: SpotifyPlaylist) => {
    const isOwner = userId && playlist.owner.id === userId;
    const isCollaborative = playlist.collaborative === true;
    const isManuallyMarked = playlist._markedAsCollaborator === true;
    return !isOwner && (isCollaborative || isManuallyMarked);
  };

  const extractPlaylistId = (url: string): string | null => {
    // Spotify playlist URL formatları:
    // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
    const urlMatch = url.match(/playlist[\/:]([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    
    // Sadece ID verilmişse
    if (/^[a-zA-Z0-9]{22}$/.test(url.trim())) {
      return url.trim();
    }
    
    return null;
  };

  const handleImport = async () => {
    if (!session || !importUrl) return;
    
    const playlistId = extractPlaylistId(importUrl);
    if (!playlistId) {
      setImportError('Geçersiz playlist linki');
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${session}` }
      });
      
      if (!response.ok) {
        throw new Error('Playlist bulunamadı veya erişim yok');
      }
      
      const playlist = await response.json();
      onPlaylistImport(playlist);
      setShowImportModal(false);
      setImportUrl('');
      onSelect(playlistId);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Bir hata oluştu');
    } finally {
      setImportLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="playlist-list">
        <h2><ListMusic size={18} /> Playlistlerim</h2>
        <div className="loading"><Loader2 className="spin" size={24} /></div>
      </div>
    );
  }

  return (
    <div className="playlist-list">
      <h2><ListMusic size={18} /> Playlistlerim ({playlists.length})</h2>
      
      <div className="playlist-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Playlist ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <button 
        className="btn btn-import"
        onClick={() => setShowImportModal(true)}
      >
        <Link size={16} />
        <span>Link ile Playlist Ekle</span>
      </button>

      <div className="playlists">
        {filteredPlaylists.map(playlist => (
          <div
            key={playlist.id}
            className={`playlist-item ${selectedId === playlist.id ? 'selected' : ''} ${!canEdit(playlist) ? 'readonly' : ''} ${isCollaborator(playlist) ? 'collaborative' : ''}`}
            onClick={() => onSelect(playlist.id)}
          >
            <div className="playlist-image">
              {playlist.images[0] ? (
                <img src={playlist.images[0].url} alt={playlist.name} />
              ) : (
                <div className="no-image"><Music size={24} /></div>
              )}
            </div>
            <div className="playlist-info">
              <h3>
                {playlist.name}
                {!canEdit(playlist) && <Lock size={12} className="lock-icon" />}
                {isCollaborator(playlist) && <Users size={12} className="collab-icon" />}
              </h3>
              <span>
                {playlist.tracks.total} şarkı
                {!canEdit(playlist) && ' • Salt okunur'}
                {isCollaborator(playlist) && ' • İşbirlikçi'}
              </span>
            </div>
          </div>
        ))}
        
        {filteredPlaylists.length === 0 && searchQuery && (
          <div className="no-results">
            "{searchQuery}" için sonuç bulunamadı
          </div>
        )}
      </div>

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><Link size={20} /> Playlist Linki ile Ekle</h3>
            <p className="modal-desc">
              Spotify playlist linkini veya ID'sini yapıştır. 
              Başkasının playlistini kopyalayabilir veya görüntüleyebilirsin.
            </p>
            
            <input
              type="text"
              placeholder="https://open.spotify.com/playlist/... veya playlist ID"
              value={importUrl}
              onChange={(e) => {
                setImportUrl(e.target.value);
                setImportError(null);
              }}
              autoFocus
            />
            
            {importError && (
              <div className="import-error">{importError}</div>
            )}

            <div className="modal-actions">
              <button 
                className="btn btn-outline"
                onClick={() => setShowImportModal(false)}
              >
                İptal
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleImport}
                disabled={!importUrl || importLoading}
              >
                {importLoading ? <Loader2 className="spin" size={18} /> : <Link size={18} />}
                <span>Ekle</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

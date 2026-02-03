import { useState, useMemo, useEffect } from 'react';
import { Music2, Guitar, Disc3, Calendar, Star, PlusCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { PlaylistList } from './components/PlaylistList';
import { TrackList } from './components/TrackList';
import { ActionPanel } from './components/ActionPanel';
import { usePlaylists, usePlaylistTracks, sortTracks } from './hooks/usePlaylists';
import { SortConfig, TrackWithGenres } from './types/spotify';
import './App.css';

function Dashboard() {
  const { user } = useAuth();
  const { playlists, isLoading: playlistsLoading, addPlaylist, refetchPlaylists, toggleCollaboratorMark, fetchPlaylistDetails } = usePlaylists();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ option: 'custom', direction: 'asc' });
  const [groupBy, setGroupBy] = useState<'none' | 'genre' | 'album'>('none');
  const [manualTracks, setManualTracks] = useState<TrackWithGenres[] | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialSortApplied, setInitialSortApplied] = useState(false);
  
  const { 
    tracks, 
    isLoading: tracksLoading, 
    loadingState,
    refetch 
  } = usePlaylistTracks(selectedPlaylistId);

  // Playlist değişince sıfırla ve detayları al
  useEffect(() => {
    setManualTracks(null);
    setHasChanges(false);
    setInitialSortApplied(false);
    setSortConfig({ option: 'custom', direction: 'asc' });
    
    // Seçilen playlist için detaylı bilgileri al (followers vs.)
    if (selectedPlaylistId) {
      fetchPlaylistDetails(selectedPlaylistId);
    }
  }, [selectedPlaylistId, fetchPlaylistDetails]);

  // Tracks yüklendiğinde initialSortApplied'ı true yap
  useEffect(() => {
    if (tracks.length > 0 && !initialSortApplied) {
      setInitialSortApplied(true);
    }
  }, [tracks.length, initialSortApplied]);

  const selectedPlaylist = useMemo(
    () => playlists.find(p => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  const canEditPlaylist = useMemo(() => {
    if (!user || !selectedPlaylist) return false;
    const isOwner = selectedPlaylist.owner?.id === user.id;
    const isCollaborative = selectedPlaylist.collaborative === true;
    const isManuallyMarkedAsCollaborator = selectedPlaylist._markedAsCollaborator === true;
    
    // Mantık:
    // 1. Owner isen -> edit edebilirsin
    // 2. collaborative: true ise -> Spotify API diyor ki collaborator'sın
    // 3. Kullanıcı manuel olarak "ben collaborator'ım" dediyse -> edit edebilirsin
    return isOwner || isCollaborative || isManuallyMarkedAsCollaborator;
  }, [user, selectedPlaylist]);

  const isCollaborator = useMemo(() => {
    if (!user || !selectedPlaylist) return false;
    const isOwner = selectedPlaylist.owner?.id === user.id;
    const isCollaborative = selectedPlaylist.collaborative === true;
    const isManuallyMarkedAsCollaborator = selectedPlaylist._markedAsCollaborator === true;
    // Owner değilsin ama collaborator'sın (API veya manuel)
    return !isOwner && (isCollaborative || isManuallyMarkedAsCollaborator);
  }, [user, selectedPlaylist]);

  const sortedTracks = useMemo(
    () => manualTracks || sortTracks(tracks, sortConfig),
    [tracks, sortConfig, manualTracks]
  );

  const sortLabels: Record<string, string> = {
    'custom': 'Playlist Sırası',
    'added_at': 'Eklenme Tarihi',
    'name': 'Şarkı Adı',
    'artist': 'Sanatçı',
    'album': 'Albüm',
    'genre': 'Genre',
    'release_date': 'Yayın Tarihi',
    'popularity': 'Popülerlik',
    'random': 'Rastgele'
  };

  const currentSortLabel = manualTracks 
    ? (sortConfig.option === 'random' ? 'Rastgele sıralama' : 'Manuel sıralama')
    : `${sortLabels[sortConfig.option]}${(sortConfig.option !== 'random' && sortConfig.option !== 'custom') ? ` (${sortConfig.direction === 'asc' ? '↑' : '↓'})` : ''}`;

  // Drag & drop ile sıralama değişti
  const handleTracksReorder = (newTracks: TrackWithGenres[]) => {
    setManualTracks(newTracks);
    setHasChanges(true);
  };

  const handleSortByGenre = () => {
    setSortConfig({ option: 'genre', direction: 'asc' });
    setManualTracks(null);
    setHasChanges(true);
  };

  const handleSortByAlbum = () => {
    setSortConfig({ option: 'album', direction: 'asc' });
    setManualTracks(null);
    setHasChanges(true);
  };

  const handleShuffle = () => {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setManualTracks(shuffled);
    setSortConfig({ option: 'random', direction: 'asc' });
    setHasChanges(true);
  };

  if (!user) {
    return (
      <div className="landing">
        <div className="landing-content">
          <div className="landing-brand">
            <div className="brand-icon">
              <Music2 size={48} color="#fff" />
            </div>
            <div className="brand-text">
              <span className="brand-author">bariscb</span>
              <h1>Spotify Playlist Editor</h1>
            </div>
          </div>
          <p className="landing-tagline">Playlistlerini genre'lara göre ayır, albüme göre sırala, dilediğin gibi düzenle!</p>
          <ul className="features">
            <li><Guitar size={20} /> Genre'lara göre otomatik ayırma</li>
            <li><Disc3 size={20} /> Albüme göre sıralama</li>
            <li><Calendar size={20} /> Yayın tarihine göre sıralama</li>
            <li><Star size={20} /> Popülerliğe göre sıralama</li>
            <li><PlusCircle size={20} /> Yeni playlist oluşturma</li>
          </ul>
          <div className="landing-footer">
            <span>Built with 💚 by <strong>bariscb</strong></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <PlaylistList
          playlists={playlists}
          selectedId={selectedPlaylistId}
          onSelect={setSelectedPlaylistId}
          isLoading={playlistsLoading}
          userId={user?.id || null}
          onPlaylistImport={addPlaylist}
        />
      </aside>
      
      <main className="main-content">
        {selectedPlaylist && (
          <div className="playlist-header">
            <div className="playlist-cover">
              {selectedPlaylist.images[0] ? (
                <img src={selectedPlaylist.images[0].url} alt={selectedPlaylist.name} />
              ) : (
                <div className="no-cover">🎵</div>
              )}
            </div>
            <div className="playlist-details">
              <h2>{selectedPlaylist.name}</h2>
              {selectedPlaylist.description && (
                <p className="playlist-description">{selectedPlaylist.description}</p>
              )}
              <div className="playlist-meta">
                <a 
                  href={`https://open.spotify.com/user/${selectedPlaylist.owner.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="playlist-owner"
                >
                  {selectedPlaylist.owner.display_name}
                </a>
                <span className="playlist-separator">•</span>
                {selectedPlaylist.followers && selectedPlaylist.followers.total > 0 && (
                  <>
                    <span className="playlist-followers">
                      {selectedPlaylist.followers.total.toLocaleString('tr-TR')} beğenme
                    </span>
                    <span className="playlist-separator">•</span>
                  </>
                )}
                <span className="playlist-tracks">{selectedPlaylist.tracks.total} şarkı</span>
                {selectedPlaylist.public !== undefined && (
                  <>
                    <span className="playlist-separator">•</span>
                    <span className="playlist-visibility">
                      {selectedPlaylist.public ? 'Herkese Açık' : 'Gizli'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
        <ActionPanel
          tracks={sortedTracks}
          selectedPlaylist={selectedPlaylist}
          onSuccess={() => {
            setManualTracks(null); // Önce manuel sıralamayı temizle
            setSortConfig({ option: 'custom', direction: 'asc' }); // Sıralamayı sıfırla
            refetch(); // Sonra yeni veriyi çek
            refetchPlaylists();
            setHasChanges(false);
          }}
          onSortByGenre={handleSortByGenre}
          onSortByAlbum={handleSortByAlbum}
          onShuffle={handleShuffle}
          canEdit={canEditPlaylist}
          isCollaborator={isCollaborator}
          currentSort={currentSortLabel}
          hasManualChanges={hasChanges}
          onToggleCollaborator={() => selectedPlaylistId && toggleCollaboratorMark(selectedPlaylistId)}
          isOwner={selectedPlaylist?.owner?.id === user?.id}
        />
        
        <TrackList
          tracks={sortedTracks}
          sortConfig={sortConfig}
          onSortChange={(config) => {
            // Random için yeniden karıştırma: shuffle yapıp manualTracks'a kaydet
            if (config.option === 'random') {
              const shuffled = [...tracks];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              setManualTracks(shuffled);
              setSortConfig(config);
              if (initialSortApplied) {
                setHasChanges(true);
              }
              return;
            }
            
            setSortConfig(config);
            setManualTracks(null);
            if (initialSortApplied && config.option !== 'custom') {
              setHasChanges(true);
            }
          }}
          isLoading={tracksLoading}
          loadingState={loadingState}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          onTracksReorder={handleTracksReorder}
          onRefresh={() => {
            refetch();
            setManualTracks(null);
            setHasChanges(false);
          }}
          isRefreshing={tracksLoading}
        />
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <Dashboard />
      </div>
    </AuthProvider>
  );
}

export default App;

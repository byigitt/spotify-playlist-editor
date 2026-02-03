import { useState, useEffect, useCallback } from 'react';
import { SpotifyPlaylist, TrackWithGenres, SortConfig, SpotifyTrack } from '../types/spotify';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { trackCache } from '../services/trackCache';

export function usePlaylists() {
  const { session } = useAuth();
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlaylists() {
      if (!session) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await api.getPlaylists(session);
        // getUserPlaylists'ten gelen playlist'leri işaretle
        const playlistsWithFlag = data.items.map(p => ({
          ...p,
          _isFromUserLibrary: true
        }));
        setPlaylists(playlistsWithFlag);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch playlists');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPlaylists();
  }, [session]);

  const addPlaylist = (playlist: SpotifyPlaylist) => {
    setPlaylists(prev => {
      // Zaten varsa ekleme
      if (prev.some(p => p.id === playlist.id)) return prev;
      // Link ile eklenen playlist'ler _isFromUserLibrary: false
      return [{ ...playlist, _isFromUserLibrary: false }, ...prev];
    });
  };

  const toggleCollaboratorMark = (playlistId: string) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        return { ...p, _markedAsCollaborator: !p._markedAsCollaborator };
      }
      return p;
    }));
  };

  // Seçilen playlist için detaylı bilgi al (followers vs.)
  const fetchPlaylistDetails = useCallback(async (playlistId: string) => {
    if (!session) return;
    
    try {
      const details = await api.getPlaylist(session, playlistId);
      setPlaylists(prev => prev.map(p => {
        if (p.id === playlistId) {
          return { 
            ...p, 
            followers: details.followers,
            description: details.description || p.description,
            public: details.public
          };
        }
        return p;
      }));
    } catch (err) {
      console.error('Failed to fetch playlist details:', err);
    }
  }, [session]);

  const refetchPlaylists = async () => {
    if (!session) return;
    
    setIsLoading(true);
    try {
      const data = await api.getPlaylists(session);
      const playlistsWithFlag = data.items.map(p => ({
        ...p,
        _isFromUserLibrary: true
      }));
      setPlaylists(playlistsWithFlag);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch playlists');
    } finally {
      setIsLoading(false);
    }
  };

  return { playlists, isLoading, error, addPlaylist, refetchPlaylists, toggleCollaboratorMark, fetchPlaylistDetails };
}

interface LoadingState {
  isLoading: boolean;
  phase: 'idle' | 'ids' | 'tracks' | 'genres';
  progress: number; // 0-100
  message: string;
}

export function usePlaylistTracks(playlistId: string | null) {
  const { session } = useAuth();
  const [tracks, setTracks] = useState<TrackWithGenres[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    phase: 'idle',
    progress: 0,
    message: ''
  });
  const [error, setError] = useState<string | null>(null);

  const fetchTracks = useCallback(async () => {
    if (!session || !playlistId) return;
    
    setLoadingState({ isLoading: true, phase: 'ids', progress: 0, message: 'Playlist bilgileri alınıyor...' });
    setError(null);
    
    try {
      // 1. Önce sadece track ID'lerini al (hızlı)
      const idsData = await api.getPlaylistTrackIds(session, playlistId);
      const trackIds = idsData.items;
      
      if (trackIds.length === 0) {
        setTracks([]);
        setLoadingState({ isLoading: false, phase: 'idle', progress: 100, message: '' });
        return;
      }

      setLoadingState({ isLoading: true, phase: 'tracks', progress: 20, message: `${trackIds.length} şarkı bulundu, detaylar alınıyor...` });

      // 2. Cache'den mevcut track'leri al
      const ids = trackIds.map(t => t.id);
      const { cached, missing } = trackCache.getMany(ids);
      
      const cacheHitRate = ((ids.length - missing.length) / ids.length * 100).toFixed(0);
      console.log(`📦 Cache hit rate: ${cacheHitRate}% (${ids.length - missing.length}/${ids.length})`);

      // 3. Eksik track'leri API'den al
      let allTrackDetails = new Map(cached);
      
      if (missing.length > 0) {
        setLoadingState({ 
          isLoading: true, 
          phase: 'tracks', 
          progress: 30, 
          message: `${missing.length} yeni şarkı indiriliyor...` 
        });

        // Batch halinde al
        const batchSize = 50;
        for (let i = 0; i < missing.length; i += batchSize) {
          const batch = missing.slice(i, i + batchSize);
          const response = await api.getTracks(session, batch);
          
          // Cache'e ekle
          trackCache.setMany(response.tracks);
          
          // Map'e ekle
          response.tracks.forEach(track => {
            const cachedTrack = trackCache.get(track.id);
            if (cachedTrack) {
              allTrackDetails.set(track.id, cachedTrack);
            }
          });

          const progress = 30 + ((i + batch.length) / missing.length) * 40;
          setLoadingState({ 
            isLoading: true, 
            phase: 'tracks', 
            progress, 
            message: `Şarkılar indiriliyor... ${Math.min(i + batchSize, missing.length)}/${missing.length}` 
          });
        }
      }

      setLoadingState({ isLoading: true, phase: 'genres', progress: 70, message: 'Genre bilgileri alınıyor...' });

      // 4. Track'leri oluştur ve artist ID'lerini topla
      const artistIds = new Set<string>();
      const orderedTracks: { track: SpotifyTrack; added_at: string }[] = [];

      for (const trackId of trackIds) {
        const cachedTrack = allTrackDetails.get(trackId.id);
        if (cachedTrack) {
          const spotifyTrack = trackCache.toSpotifyTrack(cachedTrack);
          orderedTracks.push({ track: spotifyTrack, added_at: trackId.added_at });
          spotifyTrack.artists.forEach(artist => artistIds.add(artist.id));
        }
      }

      // 5. Genre'ları al
      const genres = await api.getArtistGenres(session, Array.from(artistIds));
      
      setLoadingState({ isLoading: true, phase: 'genres', progress: 90, message: 'Tamamlanıyor...' });

      // 6. Track'lere genre ekle
      const tracksWithGenres: TrackWithGenres[] = orderedTracks.map(item => {
        const trackGenres = new Set<string>();
        item.track?.artists.forEach(artist => {
          genres[artist.id]?.forEach(g => trackGenres.add(g));
        });
        return {
          added_at: item.added_at,
          track: item.track,
          genres: Array.from(trackGenres),
        };
      });
      
      setTracks(tracksWithGenres);
      setLoadingState({ isLoading: false, phase: 'idle', progress: 100, message: '' });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tracks');
      setLoadingState({ isLoading: false, phase: 'idle', progress: 0, message: '' });
    }
  }, [session, playlistId]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  return { 
    tracks, 
    setTracks, 
    isLoading: loadingState.isLoading, 
    loadingState,
    error, 
    refetch: fetchTracks 
  };
}

export function sortTracks(tracks: TrackWithGenres[], config: SortConfig): TrackWithGenres[] {
  // Custom (Playlist Sırası) - orijinal sırayı koru
  if (config.option === 'custom') {
    return tracks;
  }

  // Random sıralama için Fisher-Yates shuffle
  if (config.option === 'random') {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  const sorted = [...tracks].sort((a, b) => {
    if (!a.track || !b.track) return 0;
    
    let comparison = 0;
    
    switch (config.option) {
      case 'genre':
        // Bilinmeyenler en sona
        const genreA = a.genres[0] || '';
        const genreB = b.genres[0] || '';
        if (!genreA && genreB) return 1;
        if (genreA && !genreB) return -1;
        if (!genreA && !genreB) return 0;
        comparison = genreA.localeCompare(genreB);
        break;
      case 'album':
        comparison = a.track.album.name.localeCompare(b.track.album.name);
        break;
      case 'artist':
        comparison = a.track.artists[0].name.localeCompare(b.track.artists[0].name);
        break;
      case 'release_date':
        comparison = a.track.album.release_date.localeCompare(b.track.album.release_date);
        break;
      case 'added_at':
        comparison = a.added_at.localeCompare(b.added_at);
        break;
      case 'popularity':
        comparison = a.track.popularity - b.track.popularity;
        break;
      case 'name':
        comparison = a.track.name.localeCompare(b.track.name);
        break;
    }
    
    return config.direction === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
}

export function groupTracksByGenre(tracks: TrackWithGenres[]): Map<string, TrackWithGenres[]> {
  const groups = new Map<string, TrackWithGenres[]>();
  
  tracks.forEach(track => {
    const genre = track.genres[0] || 'Unknown';
    if (!groups.has(genre)) {
      groups.set(genre, []);
    }
    groups.get(genre)!.push(track);
  });
  
  return groups;
}

export function groupTracksByAlbum(tracks: TrackWithGenres[]): Map<string, TrackWithGenres[]> {
  const groups = new Map<string, TrackWithGenres[]>();
  
  tracks.forEach(track => {
    if (!track.track) return;
    const album = track.track.album.name;
    if (!groups.has(album)) {
      groups.set(album, []);
    }
    groups.get(album)!.push(track);
  });
  
  return groups;
}

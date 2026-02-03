import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Guitar, Loader2, X, Check, AlertCircle, AlertTriangle, ListOrdered, Copy, Lock, Disc3, Trash2, Users, Ban, Search } from 'lucide-react';
import { TrackWithGenres, SpotifyPlaylist, UnavailableTrack } from '../types/spotify';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface ActionPanelProps {
  tracks: TrackWithGenres[];
  selectedPlaylist: SpotifyPlaylist | null;
  onSuccess: () => void;
  onSortByGenre: () => void;
  onSortByAlbum: () => void;
  canEdit: boolean;
  isCollaborator: boolean;
  currentSort: string;
  hasManualChanges: boolean;
  onToggleCollaborator: () => void;
  isOwner: boolean;
}

type ConfirmationType = 'reorder' | 'reorder-genre' | 'reorder-album' | 'remove-duplicates' | 'remove-unavailable' | 'create-by-genre' | null;

interface ReorderPreview {
  estimatedApiCalls: number;
  estimatedTimeFormatted: string;
  recommendFastMode: boolean;
}

interface JobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
}

export function ActionPanel({ tracks, selectedPlaylist, onSuccess, onSortByGenre, onSortByAlbum, canEdit, isCollaborator, currentSort, hasManualChanges, onToggleCollaborator, isOwner }: ActionPanelProps) {
  const { session } = useAuth();
  const [isWorking, setIsWorking] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyPlaylistName, setCopyPlaylistName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mesajı otomatik kaldır
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, message.type === 'success' ? 3000 : 5000); // Success 3sn, Error 5sn
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Playlist değişince mesajı temizle
  useEffect(() => {
    setMessage(null);
  }, [selectedPlaylist?.id]);
  
  // Çift onay sistemi
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [confirmationType, setConfirmationType] = useState<ConfirmationType>(null);
  const [reorderPreview, setReorderPreview] = useState<ReorderPreview | null>(null);
  const [useFastMode, setUseFastMode] = useState(false);
  const [activeJob, setActiveJob] = useState<{ id: string; status: JobStatus } | null>(null);
  
  // Unavailable tracks state
  const [unavailableTracks, setUnavailableTracks] = useState<UnavailableTrack[]>([]);
  const [unavailableMarket, setUnavailableMarket] = useState<string>('');
  const [isCheckingUnavailable, setIsCheckingUnavailable] = useState(false);

  const resetConfirmation = () => {
    setConfirmStep(1);
    setConfirmationType(null);
    setReorderPreview(null);
    setUseFastMode(false);
    setUnavailableTracks([]);
    setUnavailableMarket('');
  };

  // 403 hatasını handle et - collaborator değilse işareti kaldır
  const handleApiError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 403) {
      setMessage({ 
        type: 'error', 
        text: 'Bu playlist\'i düzenleme yetkiniz yok. Collaborator işareti kaldırıldı.' 
      });
      // Collaborator olarak işaretlenmişse kaldır
      if (isCollaborator && !selectedPlaylist?.collaborative) {
        onToggleCollaborator();
      }
      return;
    }
    setMessage({ 
      type: 'error', 
      text: error instanceof Error ? error.message : 'Bir hata oluştu'
    });
  };

  // Job polling
  useEffect(() => {
    if (!activeJob || activeJob.status.status === 'completed' || activeJob.status.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await api.getJobStatus(activeJob.id);
        setActiveJob({ id: activeJob.id, status });
        
        if (status.status === 'completed') {
          setMessage({ type: 'success', text: 'İşlem tamamlandı!' });
          setActiveJob(null);
          onSuccess();
        } else if (status.status === 'failed') {
          setMessage({ type: 'error', text: status.error || 'İşlem başarısız oldu' });
          setActiveJob(null);
        }
      } catch (e) {
        console.error('Job polling error:', e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJob, onSuccess]);

  const handleReorderClick = async () => {
    if (!session || !selectedPlaylist) return;
    
    setIsWorking(true);
    try {
      // Preview al
      const uris = tracks.filter(t => t.track).map(t => t.track!.uri);
      const preview = await api.previewReorder(session, selectedPlaylist.id, uris);
      setReorderPreview(preview);
      setUseFastMode(preview.recommendFastMode);
      setConfirmationType('reorder');
      setConfirmStep(1);
    } catch (error) {
      setMessage({ type: 'error', text: 'Preview alınamadı' });
    } finally {
      setIsWorking(false);
    }
  };

  const handleReorderByGenreClick = () => {
    setConfirmationType('reorder-genre');
    setConfirmStep(1);
  };

  const handleReorderByAlbumClick = () => {
    setConfirmationType('reorder-album');
    setConfirmStep(1);
  };

  const handleRemoveDuplicatesClick = () => {
    setConfirmationType('remove-duplicates');
    setConfirmStep(1);
  };

  // Unavailable tracks kontrolü ve kaldırma
  const handleCheckUnavailableClick = async () => {
    if (!session || !selectedPlaylist) return;
    
    setIsCheckingUnavailable(true);
    setMessage(null);
    
    try {
      const result = await api.getUnavailableTracks(session, selectedPlaylist.id);
      setUnavailableTracks(result.unavailable);
      setUnavailableMarket(result.market);
      setConfirmationType('remove-unavailable');
      setConfirmStep(1);
      
      if (result.total === 0) {
        setMessage({ type: 'success', text: 'Tüm şarkılar erişilebilir durumda! 🎉' });
        resetConfirmation();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Kontrol sırasında bir hata oluştu' });
    } finally {
      setIsCheckingUnavailable(false);
    }
  };

  const handleRemoveUnavailableConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    if (!session || !selectedPlaylist || unavailableTracks.length === 0) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const positions = unavailableTracks.map(t => t.index);
      await api.removeUnavailableTracks(session, selectedPlaylist.id, positions);
      setMessage({ type: 'success', text: `${unavailableTracks.length} erişilemeyen şarkı kaldırıldı!` });
      onSuccess();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  // Unavailable reason'ı Türkçe'ye çevir
  const getUnavailableReasonText = (reason: UnavailableTrack['reason']): string => {
    switch (reason) {
      case 'deleted': return 'Silinmiş';
      case 'region': return 'Bölge kısıtlı';
      case 'local': return 'Yerel dosya';
      case 'restricted': return 'Kısıtlı';
      default: return 'Bilinmiyor';
    }
  };

  // Duplicate sayısını hesapla
  const getDuplicateInfo = () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    
    tracks.forEach(t => {
      if (!t.track) return;
      const uri = t.track.uri;
      if (seen.has(uri)) {
        duplicates.push(t.track.name);
      } else {
        seen.add(uri);
      }
    });
    
    return { count: duplicates.length, names: duplicates.slice(0, 5) };
  };

  const duplicateInfo = getDuplicateInfo();

  // Genre gruplarını hesapla (preview için)
  const getGenreGroupsInfo = () => {
    const genreGroups = new Map<string, number>();
    tracks.forEach(track => {
      const genre = track.genres[0] || 'Other';
      genreGroups.set(genre, (genreGroups.get(genre) || 0) + 1);
    });
    
    // En az 3 şarkısı olan genre'ları filtrele
    const validGroups = Array.from(genreGroups.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]); // Şarkı sayısına göre sırala
    
    return {
      totalGroups: validGroups.length,
      groups: validGroups.slice(0, 8), // İlk 8'ini göster
      hasMore: validGroups.length > 8
    };
  };

  const genreGroupsInfo = getGenreGroupsInfo();

  const handleCreateByGenreClick = () => {
    setConfirmationType('create-by-genre');
    setConfirmStep(1);
  };

  const handleCreateByGenreConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    if (!session || tracks.length === 0) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const genreGroups = new Map<string, TrackWithGenres[]>();
      tracks.forEach(track => {
        const genre = track.genres[0] || 'Other';
        if (!genreGroups.has(genre)) {
          genreGroups.set(genre, []);
        }
        genreGroups.get(genre)!.push(track);
      });

      let created = 0;
      const timestamp = new Date().toISOString().slice(0, 10);
      
      for (const [genre, genreTracks] of genreGroups) {
        if (genreTracks.length < 3) continue;
        
        const playlistName = `${selectedPlaylist?.name || 'Playlist'} - ${genre} (${timestamp})`;
        const playlist = await api.createPlaylist(session, playlistName, `Genre: ${genre}`, false);
        
        const uris = genreTracks.filter(t => t.track).map(t => t.track!.uri);
        await api.addTracksToPlaylist(session, playlist.id, uris);
        created++;
      }

      setMessage({ type: 'success', text: `${created} yeni playlist oluşturuldu!` });
      onSuccess();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  const handleReorderConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    if (!session || !selectedPlaylist || tracks.length === 0) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const uris = tracks
        .filter(t => t.track)
        .map(t => t.track!.uri);
      
      const result = await api.reorderPlaylist(session, selectedPlaylist.id, uris, useFastMode);
      
      if (result.async && result.jobId) {
        // Background job başladı
        setActiveJob({ 
          id: result.jobId, 
          status: { status: 'running', progress: 0, message: 'Başlatılıyor...' } 
        });
        setMessage({ type: 'success', text: `İşlem arka planda devam ediyor (${result.estimatedTime})` });
      } else {
        setMessage({ type: 'success', text: 'Playlist başarıyla yeniden sıralandı!' });
        onSuccess();
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  const handleReorderByGenreConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    const sortedTracks = [...tracks].sort((a, b) => {
      const genreA = a.genres[0] || '';
      const genreB = b.genres[0] || '';
      if (!genreA && genreB) return 1;
      if (genreA && !genreB) return -1;
      if (!genreA && !genreB) return 0;
      return genreA.localeCompare(genreB);
    });

    if (!session || !selectedPlaylist) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const uris = sortedTracks
        .filter(t => t.track)
        .map(t => t.track!.uri);
      
      await api.reorderPlaylist(session, selectedPlaylist.id, uris);
      setMessage({ type: 'success', text: 'Playlist genre\'lara göre sıralandı!' });
      onSortByGenre();
      onSuccess();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  const handleReorderByAlbumConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    // Albüme göre sırala - aynı albümler yan yana, albüm içinde track number'a göre
    const sortedTracks = [...tracks].sort((a, b) => {
      if (!a.track || !b.track) return 0;
      
      // Önce albüm adına göre
      const albumCompare = a.track.album.name.localeCompare(b.track.album.name);
      if (albumCompare !== 0) return albumCompare;
      
      // Aynı albümse, track number'a göre (disc_number ve track_number)
      // Spotify API'den track_number gelmiyor, release_date'e göre sırala
      return a.track.album.release_date.localeCompare(b.track.album.release_date);
    });

    if (!session || !selectedPlaylist) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const uris = sortedTracks
        .filter(t => t.track)
        .map(t => t.track!.uri);
      
      await api.reorderPlaylist(session, selectedPlaylist.id, uris);
      setMessage({ type: 'success', text: 'Playlist albümlere göre sıralandı!' });
      onSortByAlbum();
      onSuccess();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  const handleRemoveDuplicatesConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }

    // Duplicate'leri kaldır - sadece ilk görüneni tut
    const seen = new Set<string>();
    const uniqueTracks = tracks.filter(t => {
      if (!t.track) return false;
      const uri = t.track.uri;
      if (seen.has(uri)) {
        return false;
      }
      seen.add(uri);
      return true;
    });

    if (!session || !selectedPlaylist) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      const uris = uniqueTracks
        .filter(t => t.track)
        .map(t => t.track!.uri);
      
      await api.reorderPlaylist(session, selectedPlaylist.id, uris);
      setMessage({ type: 'success', text: `${duplicateInfo.count} duplicate kaldırıldı!` });
      onSuccess();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsWorking(false);
      resetConfirmation();
    }
  };

  const handleCreatePlaylist = async () => {
    if (!session || !newPlaylistName || tracks.length === 0) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      // Duplicate'leri filtrele
      const seen = new Set<string>();
      const uris = tracks
        .filter(t => {
          if (!t.track) return false;
          if (seen.has(t.track.uri)) return false;
          seen.add(t.track.uri);
          return true;
        })
        .map(t => t.track!.uri);
      
      const playlist = await api.createPlaylist(
        session, 
        newPlaylistName,
        `${selectedPlaylist?.name || 'Playlist'} - Düzenlenmiş`,
        false
      );
      
      await api.addTracksToPlaylist(session, playlist.id, uris);
      
      setMessage({ type: 'success', text: `"${newPlaylistName}" oluşturuldu! (${uris.length} şarkı)` });
      setShowCreateModal(false);
      setNewPlaylistName('');
      onSuccess();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Bir hata oluştu'
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopyPlaylist = async () => {
    if (!session || !copyPlaylistName || tracks.length === 0) return;
    
    setIsWorking(true);
    setMessage(null);
    
    try {
      // Duplicate'leri filtrele
      const seen = new Set<string>();
      const uris = tracks
        .filter(t => {
          if (!t.track) return false;
          if (seen.has(t.track.uri)) return false;
          seen.add(t.track.uri);
          return true;
        })
        .map(t => t.track!.uri);
      
      const playlist = await api.createPlaylist(
        session, 
        copyPlaylistName,
        `${selectedPlaylist?.name || 'Playlist'} kopyası`,
        false
      );
      
      await api.addTracksToPlaylist(session, playlist.id, uris);
      
      setMessage({ type: 'success', text: `"${copyPlaylistName}" olarak kopyalandı! (${uris.length} şarkı)` });
      setShowCopyModal(false);
      setCopyPlaylistName('');
      onSuccess();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Bir hata oluştu'
      });
    } finally {
      setIsWorking(false);
    }
  };

  if (!selectedPlaylist || tracks.length === 0) {
    return null;
  }

  return (
    <div className="action-panel">
      <div className="action-header">
        <h3>Aksiyonlar</h3>
        {hasManualChanges && (
          <div className="changes-badge">
            <AlertCircle size={14} />
            <span>Sıralama değişti - Kaydetmeyi unutma!</span>
          </div>
        )}
        {!canEdit && !isOwner && (
          <div className="readonly-badge">
            <Lock size={14} />
            <span>Bu playlist size ait değil - Sadece kopyalayabilirsiniz</span>
            <button 
              className="btn-mark-collaborator"
              onClick={onToggleCollaborator}
              title="Eğer bu playlist'te collaborator iseniz, düzenleme modunu açabilirsiniz"
            >
              <Users size={12} />
              <span>Collaborator'üm</span>
            </button>
          </div>
        )}
        {isCollaborator && (
          <div className="collaborator-badge">
            <Users size={14} />
            <span>Bu playlist size ait değil fakat editleyebilirsiniz - Dikkatli olun!</span>
            <button 
              className="btn-unmark-collaborator"
              onClick={onToggleCollaborator}
              title="Collaborator işaretini kaldır"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      
      <div className="current-sort-info">
        Mevcut sıralama: <strong>{currentSort}</strong> • {tracks.length} şarkı
        {hasManualChanges && <span className="unsaved"> (kaydedilmedi)</span>}
      </div>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="action-buttons">
        {/* Her zaman kullanılabilir aksiyonlar */}
        <button 
          className="btn btn-primary"
          onClick={() => {
            setCopyPlaylistName(selectedPlaylist.name + ' (Kopya)');
            setShowCopyModal(true);
          }}
          disabled={isWorking}
        >
          <Copy size={18} />
          <span>Playlist'i Kopyala</span>
        </button>

        <button 
          className="btn btn-secondary"
          onClick={() => setShowCreateModal(true)}
          disabled={isWorking}
        >
          <Plus size={18} />
          <span>Yeni Playlist Oluştur</span>
        </button>
        
        <button 
          className="btn btn-secondary"
          onClick={handleCreateByGenreClick}
          disabled={isWorking || genreGroupsInfo.totalGroups === 0}
        >
          <Guitar size={18} />
          <span>Genre'lara Göre Ayır {genreGroupsInfo.totalGroups > 0 && `(${genreGroupsInfo.totalGroups})`}</span>
        </button>

        {/* Sadece düzenlenebilir playlistler için */}
        {canEdit && (
          <>
            <div className="divider" />
            
            <button 
              className="btn btn-warning"
              onClick={handleReorderByGenreClick}
              disabled={isWorking}
            >
              <ListOrdered size={18} />
              <span>Genre'a Göre Sırala</span>
            </button>

            <button 
              className="btn btn-warning"
              onClick={handleReorderByAlbumClick}
              disabled={isWorking}
            >
              <Disc3 size={18} />
              <span>Albüme Göre Sırala</span>
            </button>

            <button 
              className="btn btn-danger"
              onClick={handleReorderClick}
              disabled={isWorking}
            >
              <AlertTriangle size={18} />
              <span>Sıralamayı Kaydet</span>
            </button>

            {duplicateInfo.count > 0 && (
              <button 
                className="btn btn-danger"
                onClick={handleRemoveDuplicatesClick}
                disabled={isWorking}
              >
                <Trash2 size={18} />
                <span>Duplicate Kaldır ({duplicateInfo.count})</span>
              </button>
            )}

            <button 
              className="btn btn-secondary"
              onClick={handleCheckUnavailableClick}
              disabled={isWorking || isCheckingUnavailable}
            >
              {isCheckingUnavailable ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
              <span>Erişilemeyen Şarkıları Bul</span>
            </button>
          </>
        )}
      </div>

      {/* Kopyala Modal */}
      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><Copy size={20} /> Playlist'i Kopyala</h3>
            <p className="modal-desc">
              Bu playlist'in bir kopyası senin hesabında oluşturulacak.
            </p>
            <input
              type="text"
              placeholder="Yeni playlist adı"
              value={copyPlaylistName}
              onChange={e => setCopyPlaylistName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCopyModal(false)}>
                <X size={18} /><span>İptal</span>
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleCopyPlaylist}
                disabled={!copyPlaylistName || isWorking}
              >
                {isWorking ? <Loader2 className="spin" size={18} /> : <Copy size={18} />}
                <span>Kopyala</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Playlist Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3><Plus size={20} /> Yeni Playlist Oluştur</h3>
            <p className="modal-desc">
              Mevcut sıralamaya göre yeni bir playlist oluşturulacak.
            </p>
            <input
              type="text"
              placeholder="Playlist adı"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                <X size={18} /><span>İptal</span>
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName || isWorking}
              >
                {isWorking ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                <span>Oluştur</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Reorder by Genre */}
      {confirmationType === 'reorder-genre' && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <ListOrdered size={48} color="#ffaa00" />
                </div>
                <h3>Genre'lara Göre Sırala</h3>
                <p className="modal-desc">
                  <strong>"{selectedPlaylist.name}"</strong> playlist'i genre'lara göre sıralanacak.
                  <br /><br />
                  • Aynı genre'daki şarkılar gruplanacak<br />
                  • Bilinmeyen genre'lar en sona atılacak
                  <br /><br />
                  ⚠️ Bu işlem geri alınamaz!
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-warning" onClick={handleReorderByGenreConfirm}>
                    <ListOrdered size={18} /><span>Devam Et</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ff5555" />
                </div>
                <h3>Emin misin?</h3>
                <p className="modal-desc">
                  <strong>{tracks.length} şarkı</strong> yeniden sıralanacak.
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleReorderByGenreConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                    <span>Onayla</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Remove Duplicates */}
      {confirmationType === 'remove-duplicates' && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <Trash2 size={48} color="#ff5555" />
                </div>
                <h3>Duplicate Şarkıları Kaldır</h3>
                <p className="modal-desc">
                  <strong>{duplicateInfo.count} duplicate şarkı</strong> bulundu ve kaldırılacak.
                  <br /><br />
                  {duplicateInfo.names.length > 0 && (
                    <>
                      Örnek: {duplicateInfo.names.map((n, i) => (
                        <span key={i}>"{n}"{i < duplicateInfo.names.length - 1 ? ', ' : ''}</span>
                      ))}
                      {duplicateInfo.count > 5 && <span> ve {duplicateInfo.count - 5} tane daha...</span>}
                    </>
                  )}
                  <br /><br />
                  ⚠️ Bu işlem geri alınamaz!
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-warning" onClick={handleRemoveDuplicatesConfirm}>
                    <Trash2 size={18} /><span>Devam Et</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ff5555" />
                </div>
                <h3>Emin misin?</h3>
                <p className="modal-desc">
                  <strong>{duplicateInfo.count} şarkı</strong> kalıcı olarak kaldırılacak.
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleRemoveDuplicatesConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
                    <span>Kaldır</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Create By Genre */}
      {confirmationType === 'create-by-genre' && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <Guitar size={48} color="#1db954" />
                </div>
                <h3>Genre'lara Göre Ayır</h3>
                <p className="modal-desc">
                  Her genre için ayrı bir playlist oluşturulacak.
                  <br /><br />
                  <strong>{genreGroupsInfo.totalGroups} yeni playlist</strong> oluşturulacak:
                </p>
                <div className="genre-preview-list">
                  {genreGroupsInfo.groups.map(([genre, count], i) => (
                    <div key={i} className="genre-preview-item">
                      <span className="genre-name">{genre}</span>
                      <span className="genre-count">{count} şarkı</span>
                    </div>
                  ))}
                  {genreGroupsInfo.hasMore && (
                    <div className="genre-preview-item more">
                      <span>ve {genreGroupsInfo.totalGroups - 8} tane daha...</span>
                    </div>
                  )}
                </div>
                <p className="modal-note">
                  📝 3'ten az şarkısı olan genre'lar atlanacak.
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-primary" onClick={handleCreateByGenreConfirm}>
                    <Guitar size={18} /><span>Devam Et</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ffaa00" />
                </div>
                <h3>Emin misin?</h3>
                <p className="modal-desc">
                  <strong>{genreGroupsInfo.totalGroups} yeni playlist</strong> hesabına eklenecek.
                  <br /><br />
                  Playlist adları: <em>"{selectedPlaylist?.name} - [Genre] (tarih)"</em>
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-primary" onClick={handleCreateByGenreConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                    <span>Oluştur</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Remove Unavailable */}
      {confirmationType === 'remove-unavailable' && unavailableTracks.length > 0 && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning modal-wide" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <Ban size={48} color="#ff5555" />
                </div>
                <h3>Erişilemeyen Şarkılar ({unavailableTracks.length})</h3>
                <p className="modal-desc">
                  Aşağıdaki şarkılar <strong>{unavailableMarket}</strong> bölgesinde dinlenemiyor veya kaldırılmış:
                </p>
                <div className="unavailable-list">
                  {unavailableTracks.slice(0, 10).map((track, i) => (
                    <div key={i} className="unavailable-item">
                      <div className="unavailable-info">
                        <span className="unavailable-name">{track.name}</span>
                        <span className="unavailable-artist">{track.artist}</span>
                      </div>
                      <span className={`unavailable-reason reason-${track.reason}`}>
                        {getUnavailableReasonText(track.reason)}
                      </span>
                    </div>
                  ))}
                  {unavailableTracks.length > 10 && (
                    <div className="unavailable-more">
                      ... ve {unavailableTracks.length - 10} şarkı daha
                    </div>
                  )}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleRemoveUnavailableConfirm}>
                    <Ban size={18} /><span>Hepsini Kaldır</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ff5555" />
                </div>
                <h3>Emin misin?</h3>
                <p className="modal-desc">
                  <strong>{unavailableTracks.length} şarkı</strong> playlist'ten kalıcı olarak kaldırılacak.
                  <br /><br />
                  ⚠️ Bu işlem geri alınamaz!
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleRemoveUnavailableConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
                    <span>Kaldır</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Reorder by Album */}
      {confirmationType === 'reorder-album' && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <Disc3 size={48} color="#ffaa00" />
                </div>
                <h3>Albümlere Göre Sırala</h3>
                <p className="modal-desc">
                  <strong>"{selectedPlaylist.name}"</strong> playlist'i albümlere göre sıralanacak.
                  <br /><br />
                  • Aynı albümdeki şarkılar yan yana gelecek<br />
                  • Albümler alfabetik sıralanacak
                  <br /><br />
                  ⚠️ Bu işlem geri alınamaz!
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-warning" onClick={handleReorderByAlbumConfirm}>
                    <Disc3 size={18} /><span>Devam Et</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ff5555" />
                </div>
                <h3>Emin misin?</h3>
                <p className="modal-desc">
                  <strong>{tracks.length} şarkı</strong> albümlere göre yeniden sıralanacak.
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleReorderByAlbumConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                    <span>Onayla</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Çift Onay Modal - Reorder */}
      {confirmationType === 'reorder' && (
        <div className="modal-overlay" onClick={resetConfirmation}>
          <div className="modal modal-warning" onClick={e => e.stopPropagation()}>
            {confirmStep === 1 ? (
              <>
                <div className="modal-icon">
                  <RefreshCw size={48} color="#ffaa00" />
                </div>
                <h3>Sıralamayı Kaydet</h3>
                <p className="modal-desc">
                  <strong>"{selectedPlaylist.name}"</strong> playlist'inin sıralaması değiştirilecek.
                </p>
                
                {reorderPreview && (
                  <div className="reorder-preview">
                    <div className="preview-stat">
                      <span>Tahmini süre:</span>
                      <strong>{reorderPreview.estimatedTimeFormatted}</strong>
                    </div>
                    <div className="preview-stat">
                      <span>İşlem sayısı:</span>
                      <strong>{reorderPreview.estimatedApiCalls}</strong>
                    </div>
                    
                    {reorderPreview.recommendFastMode && (
                      <div className="fast-mode-option">
                        <label>
                          <input 
                            type="checkbox" 
                            checked={useFastMode}
                            onChange={(e) => setUseFastMode(e.target.checked)}
                          />
                          <span>⚡ Hızlı mod</span>
                        </label>
                        <p className="fast-mode-note">
                          {useFastMode 
                            ? '✓ Çok hızlı, ama eklenme tarihleri sıfırlanacak'
                            : '○ Yavaş, ama eklenme tarihleri korunacak'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>Vazgeç</span>
                  </button>
                  <button className="btn btn-warning" onClick={handleReorderConfirm}>
                    <RefreshCw size={18} /><span>Devam Et</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <AlertTriangle size={48} color="#ff5555" />
                </div>
                <h3>Son Onay</h3>
                <p className="modal-desc">
                  <strong>{tracks.length} şarkı</strong> yeni sıraya göre kaydedilecek.
                  {useFastMode && <><br /><span style={{color: 'var(--warning)'}}>⚡ Hızlı mod - Eklenme tarihleri sıfırlanacak</span></>}
                </p>
                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={resetConfirmation}>
                    <X size={18} /><span>İptal</span>
                  </button>
                  <button className="btn btn-danger" onClick={handleReorderConfirm} disabled={isWorking}>
                    {isWorking ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                    <span>Kaydet</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active Job Progress */}
      {activeJob && (
        <div className="job-progress">
          <div className="job-progress-header">
            <Loader2 className="spin" size={16} />
            <span>{activeJob.status.message}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${activeJob.status.progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

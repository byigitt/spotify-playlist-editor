import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import SpotifyWebApi from "spotify-web-api-node";
import { rateLimiter, cache } from "./rateLimiter.js";
import { calculateMinimumMoves, getChangeStats, estimateTime } from "./reorderOptimizer.js";
import { jobQueue } from "./jobQueue.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

// Store tokens in memory (production'da Redis/DB kullan)
const tokenStore = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>();

function createSpotifyApi(accessToken?: string) {
  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });
  if (accessToken) api.setAccessToken(accessToken);
  return api;
}

// Auth Routes
app.get("/api/auth/login", (req, res) => {
  const spotifyApi = createSpotifyApi();
  const scopes = [
    "user-read-private",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
  ];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, "state123");
  res.json({ url: authorizeURL });
});

app.get("/api/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.redirect(`${process.env.CLIENT_URL}?error=no_code`);
  }

  try {
    const spotifyApi = createSpotifyApi();
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = data.body;

    // Basit session ID oluştur
    const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    tokenStore.set(sessionId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}?session=${sessionId}`);
  } catch (error) {
    console.error("Auth error:", error);
    res.redirect(`${process.env.CLIENT_URL}?error=auth_failed`);
  }
});

// Middleware: Token kontrolü ve yenileme
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");
  if (!sessionId || !tokenStore.has(sessionId)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tokens = tokenStore.get(sessionId)!;

  // Token süresi dolmuşsa yenile
  if (Date.now() >= tokens.expiresAt - 60000) {
    try {
      const spotifyApi = createSpotifyApi();
      spotifyApi.setRefreshToken(tokens.refreshToken);
      const data = await spotifyApi.refreshAccessToken();
      tokens.accessToken = data.body.access_token;
      tokens.expiresAt = Date.now() + data.body.expires_in * 1000;
      tokenStore.set(sessionId, tokens);
    } catch (error) {
      tokenStore.delete(sessionId);
      return res.status(401).json({ error: "Token refresh failed" });
    }
  }

  (req as any).accessToken = tokens.accessToken;
  next();
}

// User Profile
app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const data = await spotifyApi.getMe();
    res.json(data.body);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// Get User Playlists (cached)
app.get("/api/playlists", authMiddleware, async (req, res) => {
  try {
    const accessToken = (req as any).accessToken;
    const cacheKey = `playlists:${accessToken.slice(-10)}`;
    
    // Cache kontrolü
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const spotifyApi = createSpotifyApi(accessToken);
    const data = await rateLimiter.execute(() => 
      spotifyApi.getUserPlaylists({ limit: 50 })
    );
    
    // 30 saniye cache
    cache.set(cacheKey, data.body, 30000);
    res.json(data.body);
  } catch (error) {
    console.error("Get playlists error:", error);
    res.status(500).json({ error: "Failed to get playlists" });
  }
});

// Get Single Playlist (cached)
app.get("/api/playlists/:id", authMiddleware, async (req, res) => {
  try {
    const cacheKey = `playlist:${req.params.id}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const data = await rateLimiter.execute(() => 
      spotifyApi.getPlaylist(req.params.id)
    );
    
    // 1 dakika cache
    cache.set(cacheKey, data.body, 60000);
    res.json(data.body);
  } catch (error) {
    console.error("Get playlist error:", error);
    res.status(404).json({ error: "Playlist not found" });
  }
});

// Get Playlist Track IDs only (for client-side caching)
// NOT: Order değişebileceği için cache'lemiyoruz!
app.get("/api/playlists/:id/track-ids", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const trackIds: { id: string; uri: string; added_at: string }[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { 
          offset, 
          limit,
          fields: 'items(added_at,track(id,uri)),total'
        })
      );
      
      data.body.items.forEach((item: any) => {
        if (item.track?.id) {
          trackIds.push({
            id: item.track.id,
            uri: item.track.uri,
            added_at: item.added_at
          });
        }
      });
      
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    const result = { items: trackIds, total: trackIds.length };
    // Order sık değişebileceği için CACHE'LEMİYORUZ
    res.json(result);
  } catch (error) {
    console.error("Get track IDs error:", error);
    res.status(500).json({ error: "Failed to get track IDs" });
  }
});

// Get multiple tracks by IDs (for filling cache)
app.post("/api/tracks", authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "ids array required" });
    }

    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const tracks: any[] = [];

    // Spotify max 50 tracks per request
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const data = await rateLimiter.execute(() => 
        spotifyApi.getTracks(batch)
      );
      tracks.push(...data.body.tracks.filter((t: any) => t !== null));
    }

    res.json({ tracks });
  } catch (error) {
    console.error("Get tracks error:", error);
    res.status(500).json({ error: "Failed to get tracks" });
  }
});

// Get Playlist Tracks (NO CACHE - order changes frequently)
app.get("/api/playlists/:id/tracks", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const allTracks: any[] = [];
    let offset = 0;
    const limit = 100;

    // Tüm şarkıları al (pagination with rate limiting)
    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { offset, limit })
      );
      allTracks.push(...data.body.items);
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    const result = { items: allTracks, total: allTracks.length };
    // Order değişebileceği için CACHE'LEMİYORUZ
    res.json(result);
  } catch (error) {
    console.error("Get tracks error:", error);
    res.status(500).json({ error: "Failed to get tracks" });
  }
});

// Get Unavailable Tracks (deleted, region-locked, local files)
app.get("/api/playlists/:id/unavailable", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    
    // User'ın market'ini al
    const user = await rateLimiter.execute(() => spotifyApi.getMe());
    const userMarket = user.body.country;
    
    const unavailableTracks: {
      uri: string;
      name: string;
      artist: string;
      reason: 'deleted' | 'region' | 'local' | 'restricted';
      index: number;
    }[] = [];
    
    let offset = 0;
    const limit = 100;
    let index = 0;

    while (true) {
      // market parametresi ile is_playable bilgisi gelir
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { 
          offset, 
          limit,
          market: userMarket,
          fields: 'items(track(id,uri,name,artists(name),is_playable,is_local,restrictions)),total'
        })
      );
      
      for (const item of data.body.items) {
        // Track null ise - silinmiş/kaldırılmış
        if (!item.track) {
          unavailableTracks.push({
            uri: '', // null track'in uri'si yok
            name: '(Silinmiş Şarkı)',
            artist: 'Bilinmiyor',
            reason: 'deleted',
            index
          });
        } else {
          const track = item.track as any;
          
          // Local file kontrolü
          if (track.is_local) {
            unavailableTracks.push({
              uri: track.uri,
              name: track.name || 'Local File',
              artist: track.artists?.map((a: any) => a.name).join(', ') || 'Bilinmiyor',
              reason: 'local',
              index
            });
          }
          // Playable değilse - bölge kısıtlaması
          else if (track.is_playable === false) {
            unavailableTracks.push({
              uri: track.uri,
              name: track.name,
              artist: track.artists?.map((a: any) => a.name).join(', ') || 'Bilinmiyor',
              reason: 'region',
              index
            });
          }
          // Restriction varsa
          else if (track.restrictions) {
            unavailableTracks.push({
              uri: track.uri,
              name: track.name,
              artist: track.artists?.map((a: any) => a.name).join(', ') || 'Bilinmiyor',
              reason: 'restricted',
              index
            });
          }
        }
        index++;
      }
      
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    res.json({ 
      unavailable: unavailableTracks, 
      total: unavailableTracks.length,
      market: userMarket
    });
  } catch (error) {
    console.error("Get unavailable tracks error:", error);
    res.status(500).json({ error: "Failed to get unavailable tracks" });
  }
});

// Remove Unavailable Tracks from Playlist
// Strateji: Mevcut playlist'i al, unavailable pozisyonları hariç tut, playlist'i yeniden yaz
app.delete("/api/playlists/:id/unavailable", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const { positions } = req.body;
    
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ error: "positions array required" });
    }
    
    const positionsSet = new Set(positions);
    
    // Tüm mevcut track'leri al
    const allTracks: string[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { offset, limit })
      );
      
      data.body.items.forEach((item: any, idx: number) => {
        const globalIndex = offset + idx;
        // Sadece unavailable olmayan ve geçerli URI'ye sahip track'leri ekle
        if (!positionsSet.has(globalIndex) && item.track?.uri && !item.track.is_local) {
          allTracks.push(item.track.uri);
        }
      });
      
      if (data.body.items.length < limit) break;
      offset += limit;
    }
    
    // Playlist'i temizle ve yeniden yaz (Fast mode gibi)
    // Önce tüm şarkıları al (silmek için)
    const currentTracks: string[] = [];
    offset = 0;
    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { offset, limit, fields: 'items(track(uri))' })
      );
      data.body.items.forEach((item: any) => {
        if (item.track?.uri) currentTracks.push(item.track.uri);
      });
      if (data.body.items.length < limit) break;
      offset += limit;
    }
    
    // Tüm şarkıları sil
    if (currentTracks.length > 0) {
      for (let i = 0; i < currentTracks.length; i += 100) {
        const batch = currentTracks.slice(i, i + 100).map(uri => ({ uri }));
        await rateLimiter.execute(() => 
          spotifyApi.removeTracksFromPlaylist(req.params.id, batch as any)
        );
      }
    }
    
    // Temiz track'leri ekle
    for (let i = 0; i < allTracks.length; i += 100) {
      const batch = allTracks.slice(i, i + 100);
      await rateLimiter.execute(() => 
        spotifyApi.addTracksToPlaylist(req.params.id, batch)
      );
    }
    
    // Cache invalidate
    cache.delete(`tracks:${req.params.id}`);
    cache.delete(`track-ids:${req.params.id}`);
    cache.delete(`playlist:${req.params.id}`);
    cache.deletePattern(`playlists:*`);

    res.json({ success: true, removed: positions.length });
  } catch (error) {
    console.error("Remove unavailable tracks error:", error);
    res.status(500).json({ error: "Failed to remove unavailable tracks" });
  }
});

// Get Artist Genres (cached, rate limited)
app.post("/api/artists/genres", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const { artistIds } = req.body;

    if (!artistIds || !Array.isArray(artistIds)) {
      return res.status(400).json({ error: "artistIds required" });
    }

    const genres: Record<string, string[]> = {};
    const uncachedIds: string[] = [];

    // Önce cache'den kontrol et
    for (const id of artistIds) {
      const cached = cache.get<string[]>(`artist:${id}`);
      if (cached !== null) {
        genres[id] = cached;
      } else {
        uncachedIds.push(id);
      }
    }

    // Cache'de olmayanları API'den al
    if (uncachedIds.length > 0) {
      // Spotify max 50 artist per request
      for (let i = 0; i < uncachedIds.length; i += 50) {
        const batch = uncachedIds.slice(i, i + 50);
        const data = await rateLimiter.execute(() => 
          spotifyApi.getArtists(batch)
        );
        data.body.artists.forEach((artist: SpotifyApi.ArtistObjectFull | null) => {
          if (artist) {
            genres[artist.id] = artist.genres;
            // 7 gün cache (genre'lar neredeyse hiç değişmez)
            cache.set(`artist:${artist.id}`, artist.genres, 7 * 24 * 60 * 60 * 1000);
          }
        });
      }
    }

    res.json(genres);
  } catch (error) {
    console.error("Get genres error:", error);
    res.status(500).json({ error: "Failed to get genres" });
  }
});

// Create New Playlist (rate limited, invalidates cache)
app.post("/api/playlists", authMiddleware, async (req, res) => {
  try {
    const accessToken = (req as any).accessToken;
    const spotifyApi = createSpotifyApi(accessToken);
    const { name, description, isPublic } = req.body;

    const user = await rateLimiter.execute(() => spotifyApi.getMe());
    const playlist = await rateLimiter.execute(() => 
      spotifyApi.createPlaylist(user.body.id, {
        name,
        description: description || "",
        public: isPublic ?? false,
      } as any)
    );

    // Playlist cache'ini invalidate et
    cache.deletePattern(`playlists:*`);

    res.json(playlist.body);
  } catch (error) {
    console.error("Create playlist error:", error);
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

// Add Tracks to Playlist (rate limited, invalidates cache)
app.post("/api/playlists/:id/tracks", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const { uris } = req.body;

    // Spotify max 100 tracks per request
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      await rateLimiter.execute(() => 
        spotifyApi.addTracksToPlaylist(req.params.id, batch)
      );
    }

    // Cache invalidate
    cache.delete(`tracks:${req.params.id}`);
    cache.delete(`playlist:${req.params.id}`);

    res.json({ success: true });
  } catch (error) {
    console.error("Add tracks error:", error);
    res.status(500).json({ error: "Failed to add tracks" });
  }
});

// Preview reorder operation (get stats without executing)
app.post("/api/playlists/:id/reorder/preview", authMiddleware, async (req, res) => {
  try {
    const spotifyApi = createSpotifyApi((req as any).accessToken);
    const { uris } = req.body;

    // Mevcut playlist'i al
    let currentUris: string[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { offset, limit })
      );
      const batch = data.body.items
        .map((item: SpotifyApi.PlaylistTrackObject) => item.track?.uri)
        .filter((uri: string | undefined): uri is string => !!uri);
      currentUris.push(...batch);
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    const stats = getChangeStats(currentUris, uris);
    const estimatedMs = estimateTime(stats.estimatedApiCalls);

    res.json({
      ...stats,
      estimatedTimeMs: estimatedMs,
      estimatedTimeFormatted: formatTime(estimatedMs),
      recommendFastMode: stats.estimatedApiCalls > 50
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ error: "Failed to preview" });
  }
});

function formatTime(ms: number): string {
  if (ms < 1000) return 'birkaç saniye';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `~${seconds} saniye`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} dakika`;
}

// Get job status
app.get("/api/jobs/:id", (req, res) => {
  const job = jobQueue.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});

// Reorder Playlist (background job for large operations)
app.put("/api/playlists/:id/tracks", authMiddleware, async (req, res) => {
  try {
    const accessToken = (req as any).accessToken;
    const spotifyApi = createSpotifyApi(accessToken);
    const { uris, fastMode = false } = req.body;

    // Mevcut playlist'i al
    let currentUris: string[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const data = await rateLimiter.execute(() => 
        spotifyApi.getPlaylistTracks(req.params.id, { offset, limit })
      );
      const batch = data.body.items
        .map((item: SpotifyApi.PlaylistTrackObject) => item.track?.uri)
        .filter((uri: string | undefined): uri is string => !!uri);
      currentUris.push(...batch);
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    const stats = getChangeStats(currentUris, uris);
    console.log(`📊 Reorder stats:`, { ...stats, moves: `${stats.estimatedApiCalls} operations` });

    // Fast mode: Sil ve yeniden ekle (tarihler sıfırlanır ama çok hızlı)
    if (fastMode) {
      console.log(`⚡ Fast mode: Replacing all tracks`);
      
      // Tüm şarkıları sil
      if (currentUris.length > 0) {
        for (let i = 0; i < currentUris.length; i += 100) {
          const batch = currentUris.slice(i, i + 100).map(uri => ({ uri }));
          await rateLimiter.execute(() => 
            spotifyApi.removeTracksFromPlaylist(req.params.id, batch as any)
          );
        }
      }
      
      // Yeni sırayla ekle
      for (let i = 0; i < uris.length; i += 100) {
        const batch = uris.slice(i, i + 100);
        await rateLimiter.execute(() => 
          spotifyApi.addTracksToPlaylist(req.params.id, batch)
        );
      }

      cache.delete(`tracks:${req.params.id}`);
      cache.delete(`track-ids:${req.params.id}`);
      cache.delete(`playlist:${req.params.id}`);
      cache.deletePattern(`playlists:*`);

      return res.json({ success: true, mode: 'fast', stats: { operations: Math.ceil(currentUris.length / 100) + Math.ceil(uris.length / 100) } });
    }

    // Çok fazla move varsa background job başlat
    if (stats.estimatedApiCalls > 20) {
      const job = jobQueue.create();
      
      // Background'da çalıştır
      processReorderJob(job.id, req.params.id, accessToken, currentUris, uris, stats);
      
      return res.json({ 
        success: true, 
        async: true,
        jobId: job.id,
        estimatedTime: formatTime(estimateTime(stats.estimatedApiCalls))
      });
    }

    // Az move varsa senkron yap
    await executeReorder(spotifyApi, req.params.id, currentUris, uris, stats);
    
    cache.delete(`tracks:${req.params.id}`);
    cache.delete(`track-ids:${req.params.id}`);
    cache.delete(`playlist:${req.params.id}`);
    cache.deletePattern(`playlists:*`);

    res.json({ success: true, mode: 'sync', stats: { operations: stats.estimatedApiCalls } });
  } catch (error) {
    console.error("Reorder playlist error:", error);
    res.status(500).json({ error: "Failed to reorder playlist" });
  }
});

async function executeReorder(
  spotifyApi: SpotifyWebApi, 
  playlistId: string, 
  currentUris: string[], 
  targetUris: string[],
  stats: ReturnType<typeof getChangeStats>,
  onProgress?: (progress: number, message: string) => void
) {
  const currentSet = new Set(currentUris);
  const targetSet = new Set(targetUris);
  
  // Silinecek şarkıları sil
  const toRemove = currentUris.filter(uri => !targetSet.has(uri));
  if (toRemove.length > 0) {
    onProgress?.(5, `${toRemove.length} şarkı siliniyor...`);
    for (let i = 0; i < toRemove.length; i += 100) {
      const batch = toRemove.slice(i, i + 100).map(uri => ({ uri }));
      await rateLimiter.execute(() => 
        spotifyApi.removeTracksFromPlaylist(playlistId, batch as any)
      );
    }
    currentUris = currentUris.filter(uri => targetSet.has(uri));
  }

  // Sadece ortak şarkıları sırala
  const targetFiltered = targetUris.filter((uri: string) => currentSet.has(uri));
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

async function processReorderJob(
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
    
    // Cache invalidate
    cache.delete(`tracks:${playlistId}`);
    cache.delete(`track-ids:${playlistId}`);
    cache.delete(`playlist:${playlistId}`);
    cache.deletePattern(`playlists:*`);
    
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

// Logout
app.post("/api/auth/logout", (req, res) => {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");
  if (sessionId) {
    tokenStore.delete(sessionId);
  }
  res.json({ success: true });
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
});

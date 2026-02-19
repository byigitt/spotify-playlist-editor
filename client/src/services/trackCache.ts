/**
 * Client-side Track Cache
 * 
 * Track detaylarını localStorage'da saklar.
 * Playlist yüklenirken sadece order alınır, detaylar cache'den gelir.
 */

import { SpotifyTrack } from '../types/spotify';

const CACHE_KEY = 'spotify_track_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_SIZE = 5000; // Maximum track sayısı

interface CachedTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  popularity: number;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    release_date: string;
    images: { url: string; height: number; width: number }[];
  };
  cachedAt: number;
}

interface CacheData {
  version: number;
  tracks: Record<string, CachedTrack>;
}

class TrackCache {
  private cache: Map<string, CachedTrack> = new Map();
  private initialized = false;

  constructor() {
    this.load();
  }

  private load() {
    try {
      const data = localStorage.getItem(CACHE_KEY);
      if (data) {
        const parsed: CacheData = JSON.parse(data);
        if (parsed.version === CACHE_VERSION) {
          this.cache = new Map(Object.entries(parsed.tracks));
        }
      }
    } catch (e) {
      console.warn('Failed to load track cache:', e);
      this.cache = new Map();
    } finally {
      this.initialized = true;
    }
  }

  private save() {
    try {
      this.evictIfNeeded();
      const data: CacheData = {
        version: CACHE_VERSION,
        tracks: Object.fromEntries(this.cache)
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save track cache:', e);
      try { localStorage.removeItem(CACHE_KEY); } catch {}
    }
  }

  private evictIfNeeded() {
    if (this.cache.size <= MAX_CACHE_SIZE) return;
    
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE + 500);
    for (const [key] of toRemove) this.cache.delete(key);
  }

  get(trackId: string): CachedTrack | null {
    return this.cache.get(trackId) || null;
  }

  getMany(trackIds: string[]): { cached: Map<string, CachedTrack>; missing: string[] } {
    const cached = new Map<string, CachedTrack>();
    const missing: string[] = [];

    for (const id of trackIds) {
      const track = this.cache.get(id);
      if (track) {
        cached.set(id, track);
      } else {
        missing.push(id);
      }
    }

    return { cached, missing };
  }

  set(track: SpotifyTrack) {
    const cached: CachedTrack = {
      id: track.id,
      name: track.name,
      uri: track.uri,
      duration_ms: track.duration_ms,
      popularity: track.popularity,
      artists: track.artists.map(a => ({ id: a.id, name: a.name })),
      album: {
        id: track.album.id,
        name: track.album.name,
        release_date: track.album.release_date,
        images: track.album.images
      },
      cachedAt: Date.now()
    };
    this.cache.set(track.id, cached);
  }

  setMany(tracks: SpotifyTrack[]) {
    tracks.forEach(track => this.set(track));
    this.save(); // Batch save
  }

  // CachedTrack'i SpotifyTrack'e çevir
  toSpotifyTrack(cached: CachedTrack): SpotifyTrack {
    return {
      id: cached.id,
      name: cached.name,
      uri: cached.uri,
      duration_ms: cached.duration_ms,
      popularity: cached.popularity,
      artists: cached.artists.map(a => ({ ...a, genres: [] })),
      album: {
        ...cached.album,
        artists: []
      }
    };
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      initialized: this.initialized
    };
  }

  clear() {
    this.cache.clear();
    localStorage.removeItem(CACHE_KEY);
  }
}

export const trackCache = new TrackCache();

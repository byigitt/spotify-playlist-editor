import { SpotifyUser, SpotifyPlaylist, PlaylistTrackItem, SpotifyTrack, UnavailableTrack, SocialUser, SocialConnections } from '../types/spotify';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit & { session?: string }): Promise<T> {
  const { session, ...fetchOptions } = options || {};
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(session && { Authorization: `Bearer ${session}` }),
    ...fetchOptions.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => ({ error: 'Request failed' }));
    let message = 'Request failed';

    if (errorBody && typeof errorBody === 'object' && 'error' in errorBody) {
      const errorValue = (errorBody as { error: unknown }).error;
      if (typeof errorValue === 'string' && errorValue.length > 0) {
        message = errorValue;
      } else if (errorValue && typeof errorValue === 'object' && 'message' in errorValue) {
        const nestedMessage = (errorValue as { message: unknown }).message;
        if (typeof nestedMessage === 'string' && nestedMessage.length > 0) {
          message = nestedMessage;
        }
      }
    }

    if (message === 'Request failed') {
      if (response.status === 403) {
        message = 'Bu işlem için yetkiniz yok';
      } else if (response.status === 404) {
        message = 'Kaynak bulunamadı veya erişim yetkiniz yok';
      }
    }

    throw new ApiError(message, response.status);
  }

  return response.json();
}

// Response types used by multiple endpoints
interface ReorderPreviewResponse {
  removed: number;
  added: number;
  reordered: number;
  estimatedApiCalls: number;
  estimatedTimeMs: number;
  estimatedTimeFormatted: string;
  recommendFastMode: boolean;
}

interface ReorderResponse {
  success: boolean;
  async?: boolean;
  jobId?: string;
  estimatedTime?: string;
  mode?: string;
}

interface JobStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: any;
  error?: string;
}

interface ExtractGenresResponse {
  success: boolean;
  extractedCount: number;
  remainingCount: number;
  newPlaylistId: string | null;
  newPlaylistName: string | null;
  copied: boolean;
  removed: boolean;
}

/** Helper for POST/PUT/DELETE with JSON body */
function sessionPost<T>(endpoint: string, session: string, body: object, method = 'POST'): Promise<T> {
  return fetchApi<T>(endpoint, { method, session, body: JSON.stringify(body) });
}

export const api = {
  // Auth
  getLoginUrl: (showDialog = false) => fetchApi<{ url: string }>(`/auth/login${showDialog ? '?show_dialog=true' : ''}`),
  logout: (session: string) => sessionPost<{ success: boolean }>('/auth/logout', session, {}),

  // User
  getMe: (session: string) => fetchApi<SpotifyUser>('/me', { session }),

  // Playlists
  getPlaylists: (session: string) => fetchApi<{ items: SpotifyPlaylist[] }>('/playlists', { session }),
  getPlaylist: (session: string, playlistId: string) => fetchApi<SpotifyPlaylist>(`/playlists/${playlistId}`, { session }),

  getPlaylistTracks: (session: string, playlistId: string) =>
    fetchApi<{ items: PlaylistTrackItem[]; total: number }>(`/playlists/${playlistId}/tracks`, { session }),

  getPlaylistTrackIds: (session: string, playlistId: string) =>
    fetchApi<{ items: { id: string; uri: string; added_at: string }[]; total: number }>(`/playlists/${playlistId}/track-ids`, { session }),

  // Tracks & Artists
  getTracks: (session: string, ids: string[]) =>
    sessionPost<{ tracks: SpotifyTrack[] }>('/tracks', session, { ids }),

  getArtistGenres: (session: string, artistIds: string[]) =>
    sessionPost<Record<string, string[]>>('/artists/genres', session, { artistIds }),

  // Playlist mutations
  createPlaylist: (session: string, name: string, description?: string, isPublic?: boolean) =>
    sessionPost<SpotifyPlaylist>('/playlists', session, { name, description, isPublic }),

  addTracksToPlaylist: (session: string, playlistId: string, uris: string[]) =>
    sessionPost<{ success: boolean }>(`/playlists/${playlistId}/tracks`, session, { uris }),

  previewReorder: (session: string, playlistId: string, uris: string[]) =>
    sessionPost<ReorderPreviewResponse>(`/playlists/${playlistId}/reorder/preview`, session, { uris }),

  reorderPlaylist: (session: string, playlistId: string, uris: string[], fastMode = false) =>
    sessionPost<ReorderResponse>(`/playlists/${playlistId}/tracks`, session, { uris, fastMode }, 'PUT'),

  // Jobs
  getJobStatus: (jobId: string) => fetchApi<JobStatusResponse>(`/jobs/${jobId}`),

  // Unavailable tracks
  getUnavailableTracks: (session: string, playlistId: string) =>
    fetchApi<{ unavailable: UnavailableTrack[]; total: number; market: string }>(`/playlists/${playlistId}/unavailable`, { session }),

  removeUnavailableTracks: (session: string, playlistId: string, positions: number[]) =>
    sessionPost<{ success: boolean; removed: number }>(`/playlists/${playlistId}/unavailable`, session, { positions }, 'DELETE'),

  // Social followback tools
  getSocialConnections: (session: string) =>
    fetchApi<SocialConnections>('/social/connections', { session }),

  getSocialUsers: (session: string, ids: string[]) =>
    sessionPost<{ users: SocialUser[]; missing: string[] }>('/social/users', session, { ids }),

  unfollowUsers: (session: string, ids: string[]) =>
    sessionPost<{ success: boolean; removed: number; ids: string[] }>('/social/following', session, { ids }, 'DELETE'),

  // Genre extraction
  extractGenres: (
    session: string,
    playlistId: string,
    genres: string[],
    newPlaylistName: string,
    options: { copyToNew: boolean; removeFromOriginal: boolean }
  ) =>
    sessionPost<ExtractGenresResponse>(`/playlists/${playlistId}/extract-genres`, session, {
      genres,
      newPlaylistName,
      ...options
    }),
};

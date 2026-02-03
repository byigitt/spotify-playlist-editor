import { SpotifyUser, SpotifyPlaylist, PlaylistTrackItem, SpotifyTrack, UnavailableTrack } from '../types/spotify';

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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    
    // 403 Forbidden için özel mesaj
    if (response.status === 403) {
      throw new ApiError('Bu playlist\'i düzenleme yetkiniz yok', 403);
    }
    
    // 404 Not Found - Collaborator olmadığında Spotify bu hatayı veriyor
    if (response.status === 404) {
      throw new ApiError('Bu playlist\'e erişim yetkiniz yok. Collaborator değilsiniz.', 404);
    }
    
    throw new ApiError(error.error || 'Request failed', response.status);
  }

  return response.json();
}

export const api = {
  // Auth
  getLoginUrl: () => fetchApi<{ url: string }>('/auth/login'),
  
  logout: (session: string) => 
    fetchApi<{ success: boolean }>('/auth/logout', { 
      method: 'POST', 
      session 
    }),

  // User
  getMe: (session: string) => 
    fetchApi<SpotifyUser>('/me', { session }),

  // Playlists
  getPlaylists: (session: string) => 
    fetchApi<{ items: SpotifyPlaylist[] }>('/playlists', { session }),

  getPlaylist: (session: string, playlistId: string) =>
    fetchApi<SpotifyPlaylist>(`/playlists/${playlistId}`, { session }),

  getPlaylistTracks: (session: string, playlistId: string) => 
    fetchApi<{ items: PlaylistTrackItem[]; total: number }>(
      `/playlists/${playlistId}/tracks`, 
      { session }
    ),

  // Sadece track ID'lerini al (hızlı)
  getPlaylistTrackIds: (session: string, playlistId: string) =>
    fetchApi<{ items: { id: string; uri: string; added_at: string }[]; total: number }>(
      `/playlists/${playlistId}/track-ids`,
      { session }
    ),

  // Birden fazla track detayı al
  getTracks: (session: string, ids: string[]) =>
    fetchApi<{ tracks: SpotifyTrack[] }>('/tracks', {
      method: 'POST',
      session,
      body: JSON.stringify({ ids }),
    }),

  // Artist Genres
  getArtistGenres: (session: string, artistIds: string[]) => 
    fetchApi<Record<string, string[]>>('/artists/genres', {
      method: 'POST',
      session,
      body: JSON.stringify({ artistIds }),
    }),

  // Create Playlist
  createPlaylist: (session: string, name: string, description?: string, isPublic?: boolean) =>
    fetchApi<SpotifyPlaylist>('/playlists', {
      method: 'POST',
      session,
      body: JSON.stringify({ name, description, isPublic }),
    }),

  // Add Tracks to Playlist
  addTracksToPlaylist: (session: string, playlistId: string, uris: string[]) =>
    fetchApi<{ success: boolean }>(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      session,
      body: JSON.stringify({ uris }),
    }),

  // Preview Reorder (get estimated time)
  previewReorder: (session: string, playlistId: string, uris: string[]) =>
    fetchApi<{
      removed: number;
      added: number;
      reordered: number;
      estimatedApiCalls: number;
      estimatedTimeMs: number;
      estimatedTimeFormatted: string;
      recommendFastMode: boolean;
    }>(`/playlists/${playlistId}/reorder/preview`, {
      method: 'POST',
      session,
      body: JSON.stringify({ uris }),
    }),

  // Reorder Playlist
  reorderPlaylist: (session: string, playlistId: string, uris: string[], fastMode = false) =>
    fetchApi<{ 
      success: boolean; 
      async?: boolean; 
      jobId?: string;
      estimatedTime?: string;
      mode?: string;
    }>(`/playlists/${playlistId}/tracks`, {
      method: 'PUT',
      session,
      body: JSON.stringify({ uris, fastMode }),
    }),

  // Get job status
  getJobStatus: (jobId: string) =>
    fetchApi<{
      id: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      progress: number;
      message: string;
      result?: any;
      error?: string;
    }>(`/jobs/${jobId}`),

  // Get Unavailable Tracks (deleted, region-locked, local files)
  getUnavailableTracks: (session: string, playlistId: string) =>
    fetchApi<{
      unavailable: UnavailableTrack[];
      total: number;
      market: string;
    }>(`/playlists/${playlistId}/unavailable`, { session }),

  // Remove Unavailable Tracks
  removeUnavailableTracks: (session: string, playlistId: string, positions: number[]) =>
    fetchApi<{ success: boolean; removed: number }>(`/playlists/${playlistId}/unavailable`, {
      method: 'DELETE',
      session,
      body: JSON.stringify({ positions }),
    }),

  // Extract genres from playlist (remove from original, add to new playlist)
  extractGenres: (session: string, playlistId: string, genres: string[], newPlaylistName: string) =>
    fetchApi<{
      success: boolean;
      extractedCount: number;
      remainingCount: number;
      newPlaylistId: string;
      newPlaylistName: string;
    }>(`/playlists/${playlistId}/extract-genres`, {
      method: 'POST',
      session,
      body: JSON.stringify({ genres, newPlaylistName }),
    }),
};

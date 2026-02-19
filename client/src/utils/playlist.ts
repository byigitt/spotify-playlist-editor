import { SpotifyPlaylist } from '../types/spotify';

/**
 * Check if a user can edit a playlist (owner, collaborative, or manually marked).
 */
export function canEditPlaylist(userId: string | null, playlist: SpotifyPlaylist | null): boolean {
  if (!userId || !playlist) return false;
  return (
    playlist.owner?.id === userId ||
    playlist.collaborative === true ||
    playlist._markedAsCollaborator === true
  );
}

/**
 * Check if a user is a collaborator (not owner, but has edit access).
 */
export function isPlaylistCollaborator(userId: string | null, playlist: SpotifyPlaylist | null): boolean {
  if (!userId || !playlist) return false;
  const isOwner = playlist.owner?.id === userId;
  return !isOwner && (playlist.collaborative === true || playlist._markedAsCollaborator === true);
}

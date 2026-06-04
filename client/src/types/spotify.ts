export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: { url: string }[];
  country: string;
}

export interface SocialUser {
  id: string;
  displayName: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

export interface SocialConnections {
  following: SocialUser[];
  followers: SocialUser[];
}

export interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  release_date: string;
  images: SpotifyImage[];
  artists: SpotifyArtist[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  popularity: number;
  is_playable?: boolean;
  is_local?: boolean;
  restrictions?: {
    reason: string; // 'market' | 'product' | 'explicit'
  };
}

export interface UnavailableTrack {
  uri: string;
  name: string;
  artist: string;
  reason: 'deleted' | 'region' | 'local' | 'restricted';
  index: number;
}

export interface PlaylistTrackItem {
  added_at: string;
  track: SpotifyTrack | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: SpotifyImage[];
  owner: {
    id: string;
    display_name: string;
  };
  tracks: {
    total: number;
  };
  followers?: {
    total: number;
  };
  public: boolean;
  collaborative: boolean;
  /** Internal flag: true if from getUserPlaylists, false if imported via link */
  _isFromUserLibrary?: boolean;
  /** Internal flag: user manually marked this as collaborator (for public collaborative playlists where API returns false) */
  _markedAsCollaborator?: boolean;
}

export type SortOption = 'custom' | 'genre' | 'album' | 'artist' | 'release_date' | 'added_at' | 'popularity' | 'name' | 'random';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  option: SortOption;
  direction: SortDirection;
}

export interface TrackWithGenres extends PlaylistTrackItem {
  genres: string[];
}

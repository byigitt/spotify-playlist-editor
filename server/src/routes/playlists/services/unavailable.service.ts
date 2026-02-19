import { rateLimiter } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";

export interface UnavailableTrack {
  uri: string;
  name: string;
  artist: string;
  reason: 'deleted' | 'region' | 'local' | 'restricted';
  index: number;
}

export interface UnavailableTracksResult {
  unavailable: UnavailableTrack[];
  total: number;
  market: string;
}

function getArtistNames(track: any): string {
  return track.artists?.map((a: any) => a.name).join(', ') || 'Bilinmiyor';
}

function detectUnavailableTrack(item: any, index: number): UnavailableTrack | null {
  if (!item.track) {
    return { uri: '', name: '(Silinmiş Şarkı)', artist: 'Bilinmiyor', reason: 'deleted', index };
  }

  const track = item.track;
  if (track.is_local) {
    return { uri: track.uri, name: track.name || 'Local File', artist: getArtistNames(track), reason: 'local', index };
  }
  if (track.is_playable === false) {
    return { uri: track.uri, name: track.name, artist: getArtistNames(track), reason: 'region', index };
  }
  if (track.restrictions) {
    return { uri: track.uri, name: track.name, artist: getArtistNames(track), reason: 'restricted', index };
  }

  return null;
}

export async function getUnavailableTracks(
  accessToken: string,
  playlistId: string
): Promise<UnavailableTracksResult> {
  const spotifyApi = createSpotifyApi(accessToken);

  // User'ın market'ini al
  const user = await rateLimiter.execute(() => spotifyApi.getMe());
  const userMarket = user.body.country;

  const unavailableTracks: UnavailableTrack[] = [];

  let offset = 0;
  const limit = 100;
  let index = 0;

  while (true) {
    // market parametresi ile is_playable bilgisi gelir
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit,
        market: userMarket,
        fields: 'items(track(id,uri,name,artists(name),is_playable,is_local,restrictions)),total'
      })
    );

    for (const item of data.body.items) {
      const unavailable = detectUnavailableTrack(item, index);
      if (unavailable) unavailableTracks.push(unavailable);
      index++;
    }

    if (data.body.items.length < limit) break;
    offset += limit;
  }

  return {
    unavailable: unavailableTracks,
    total: unavailableTracks.length,
    market: userMarket
  };
}

export async function removeUnavailableTracks(
  accessToken: string,
  playlistId: string,
  positions: number[]
): Promise<{ removed: number }> {
  const spotifyApi = createSpotifyApi(accessToken);
  const positionsSet = new Set(positions);

  // Single pass: collect tracks to keep AND unique URIs to remove
  const tracksToKeep: string[] = [];
  const uniqueCurrentUris = new Set<string>();
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit })
    );

    data.body.items.forEach((item: any, idx: number) => {
      const globalIndex = offset + idx;
      if (item.track?.uri) {
        uniqueCurrentUris.add(item.track.uri);
        if (!positionsSet.has(globalIndex) && !item.track.is_local) {
          tracksToKeep.push(item.track.uri);
        }
      }
    });

    if (data.body.items.length < limit) break;
    offset += limit;
  }

  // Tüm unique şarkıları sil
  const urisToRemove = Array.from(uniqueCurrentUris);
  for (let i = 0; i < urisToRemove.length; i += 100) {
    const batch = urisToRemove.slice(i, i + 100).map(uri => ({ uri }));
    await rateLimiter.execute(() =>
      spotifyApi.removeTracksFromPlaylist(playlistId, batch as any)
    );
  }

  // Kalması gereken şarkıları ekle
  for (let i = 0; i < tracksToKeep.length; i += 100) {
    const batch = tracksToKeep.slice(i, i + 100);
    await rateLimiter.execute(() =>
      spotifyApi.addTracksToPlaylist(playlistId, batch)
    );
  }

  return { removed: positions.length };
}

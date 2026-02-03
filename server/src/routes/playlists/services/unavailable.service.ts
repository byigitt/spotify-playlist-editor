import { rateLimiter, cache } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";
import { invalidatePlaylistCache } from "./tracks.service.js";

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
      // Track null ise - silinmiş/kaldırılmış
      if (!item.track) {
        unavailableTracks.push({
          uri: '',
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

  // Tüm mevcut track'leri al
  const allTracks: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit })
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

  // Mevcut tüm unique URI'leri bul (silmek için)
  const uniqueCurrentUris = new Set<string>();
  offset = 0;
  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit, fields: 'items(track(uri))' })
    );
    data.body.items.forEach((item: any) => {
      if (item.track?.uri) uniqueCurrentUris.add(item.track.uri);
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
  for (let i = 0; i < allTracks.length; i += 100) {
    const batch = allTracks.slice(i, i + 100);
    await rateLimiter.execute(() =>
      spotifyApi.addTracksToPlaylist(playlistId, batch)
    );
  }

  invalidatePlaylistCache(playlistId);

  return { removed: positions.length };
}

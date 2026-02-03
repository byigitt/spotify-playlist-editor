import { rateLimiter, cache } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";
import { invalidatePlaylistCache } from "./tracks.service.js";

export interface ExtractGenresResult {
  success: boolean;
  extractedCount: number;
  remainingCount: number;
  newPlaylistId: string | null;
  newPlaylistName: string | null;
  copied: boolean;
  removed: boolean;
}

interface TrackWithArtists {
  uri: string;
  artistIds: string[];
  index: number;
}

export async function extractGenresFromPlaylist(
  accessToken: string,
  playlistId: string,
  genres: string[],
  newPlaylistName: string | null,
  copyToNew: boolean = true,
  removeFromOriginal: boolean = true
): Promise<ExtractGenresResult> {
  const spotifyApi = createSpotifyApi(accessToken);
  const genreSet = new Set(genres.map(g => g.toLowerCase()));

  // Tüm track'leri al
  const allTracks: TrackWithArtists[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit })
    );

    data.body.items.forEach((item: any, idx: number) => {
      if (item.track?.uri && !item.track.is_local) {
        allTracks.push({
          uri: item.track.uri,
          artistIds: item.track.artists?.map((a: any) => a.id).filter((id: string) => id) || [],
          index: offset + idx
        });
      }
    });

    if (data.body.items.length < limit) break;
    offset += limit;
  }

  // Tüm artist'lerin genre'larını al
  const allArtistIds = [...new Set(allTracks.flatMap(t => t.artistIds))];
  const artistGenres: Record<string, string[]> = {};

  for (let i = 0; i < allArtistIds.length; i += 50) {
    const batch = allArtistIds.slice(i, i + 50);
    const artistData = await rateLimiter.execute(() =>
      spotifyApi.getArtists(batch)
    );
    artistData.body.artists.forEach((artist: any) => {
      if (artist) {
        artistGenres[artist.id] = artist.genres || [];
      }
    });
  }

  // Track'leri genre'lara göre ayır
  const tracksToExtract: string[] = [];
  const tracksToKeep: string[] = [];

  for (const track of allTracks) {
    const trackGenres: string[] = [];
    for (const artistId of track.artistIds) {
      const genres = artistGenres[artistId] || [];
      trackGenres.push(...genres);
    }

    const matchesSelectedGenre = trackGenres.some(g => genreSet.has(g.toLowerCase()));

    if (matchesSelectedGenre) {
      tracksToExtract.push(track.uri);
    } else {
      tracksToKeep.push(track.uri);
    }
  }

  if (tracksToExtract.length === 0) {
    throw new Error("Seçilen genre'lara ait şarkı bulunamadı");
  }

  let newPlaylistId: string | null = null;
  let newPlaylistNameResult: string | null = null;

  // Yeni playlist'e kopyala
  if (copyToNew && newPlaylistName) {
    const user = await rateLimiter.execute(() => spotifyApi.getMe());
    const newPlaylist = await rateLimiter.execute(() =>
      spotifyApi.createPlaylist(user.body.id, {
        name: newPlaylistName,
        description: `Extracted genres: ${genres.join(', ')}`,
        public: false,
      } as any)
    );

    newPlaylistId = newPlaylist.body.id;
    newPlaylistNameResult = newPlaylist.body.name;

    // Şarkıları yeni playlist'e ekle
    for (let i = 0; i < tracksToExtract.length; i += 100) {
      const batch = tracksToExtract.slice(i, i + 100);
      await rateLimiter.execute(() =>
        spotifyApi.addTracksToPlaylist(newPlaylist.body.id, batch)
      );
    }
  }

  // Orijinalden sil
  if (removeFromOriginal) {
    const uniqueUrisToRemove = [...new Set([...tracksToExtract, ...tracksToKeep])];

    // Tüm şarkıları sil
    for (let i = 0; i < uniqueUrisToRemove.length; i += 100) {
      const batch = uniqueUrisToRemove.slice(i, i + 100).map(uri => ({ uri }));
      await rateLimiter.execute(() =>
        spotifyApi.removeTracksFromPlaylist(playlistId, batch as any)
      );
    }

    // Kalan şarkıları ekle
    for (let i = 0; i < tracksToKeep.length; i += 100) {
      const batch = tracksToKeep.slice(i, i + 100);
      await rateLimiter.execute(() =>
        spotifyApi.addTracksToPlaylist(playlistId, batch)
      );
    }
  }

  invalidatePlaylistCache(playlistId);

  return {
    success: true,
    extractedCount: tracksToExtract.length,
    remainingCount: removeFromOriginal ? tracksToKeep.length : allTracks.length,
    newPlaylistId,
    newPlaylistName: newPlaylistNameResult,
    copied: copyToNew,
    removed: removeFromOriginal
  };
}

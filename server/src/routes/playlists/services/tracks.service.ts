import SpotifyWebApi from "spotify-web-api-node";
import { rateLimiter } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";

export interface TrackId {
  id: string;
  uri: string;
  added_at: string;
}

const PAGE_LIMIT = 100;

/**
 * Paginate through all playlist tracks, collecting results via a mapper function.
 */
async function paginatePlaylistTracks<T>(
  spotifyApi: SpotifyWebApi,
  playlistId: string,
  options: Record<string, any>,
  mapper: (items: any[]) => T[]
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit: PAGE_LIMIT, ...options })
    );
    results.push(...mapper(data.body.items));
    if (data.body.items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return results;
}

export async function getPlaylistTrackIds(accessToken: string, playlistId: string): Promise<TrackId[]> {
  const spotifyApi = createSpotifyApi(accessToken);
  return paginatePlaylistTracks(spotifyApi, playlistId, {
    fields: 'items(added_at,track(id,uri)),total'
  }, (items) =>
    items
      .filter((item: any) => item.track?.id)
      .map((item: any) => ({
        id: item.track.id,
        uri: item.track.uri,
        added_at: item.added_at
      }))
  );
}

export async function getPlaylistTracks(accessToken: string, playlistId: string) {
  const spotifyApi = createSpotifyApi(accessToken);
  return paginatePlaylistTracks(spotifyApi, playlistId, {}, (items) => items);
}

export async function getPlaylistUris(accessToken: string, playlistId: string): Promise<string[]> {
  const spotifyApi = createSpotifyApi(accessToken);
  return paginatePlaylistTracks(spotifyApi, playlistId, {}, (items) =>
    items
      .map((item: SpotifyApi.PlaylistTrackObject) => item.track?.uri)
      .filter((uri: string | undefined): uri is string => !!uri)
  );
}

export async function addTracksToPlaylist(accessToken: string, playlistId: string, uris: string[]) {
  const spotifyApi = createSpotifyApi(accessToken);

  for (let i = 0; i < uris.length; i += PAGE_LIMIT) {
    const batch = uris.slice(i, i + PAGE_LIMIT);
    await rateLimiter.execute(() =>
      spotifyApi.addTracksToPlaylist(playlistId, batch)
    );
  }
}

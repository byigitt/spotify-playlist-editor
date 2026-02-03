import SpotifyWebApi from "spotify-web-api-node";
import { rateLimiter } from "../../../rateLimiter.js";
import { createSpotifyApi } from "../../../config.js";

export interface TrackId {
  id: string;
  uri: string;
  added_at: string;
}

export async function getPlaylistTrackIds(accessToken: string, playlistId: string): Promise<TrackId[]> {
  const spotifyApi = createSpotifyApi(accessToken);
  const trackIds: TrackId[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, {
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

  return trackIds;
}

export async function getPlaylistTracks(accessToken: string, playlistId: string) {
  const spotifyApi = createSpotifyApi(accessToken);
  const allTracks: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit })
    );
    allTracks.push(...data.body.items);
    if (data.body.items.length < limit) break;
    offset += limit;
  }

  return allTracks;
}

export async function getPlaylistUris(accessToken: string, playlistId: string): Promise<string[]> {
  const spotifyApi = createSpotifyApi(accessToken);
  const uris: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await rateLimiter.execute(() =>
      spotifyApi.getPlaylistTracks(playlistId, { offset, limit })
    );
    const batch = data.body.items
      .map((item: SpotifyApi.PlaylistTrackObject) => item.track?.uri)
      .filter((uri: string | undefined): uri is string => !!uri);
    uris.push(...batch);
    if (data.body.items.length < limit) break;
    offset += limit;
  }

  return uris;
}

export async function addTracksToPlaylist(accessToken: string, playlistId: string, uris: string[]) {
  const spotifyApi = createSpotifyApi(accessToken);

  // Spotify max 100 tracks per request
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    await rateLimiter.execute(() =>
      spotifyApi.addTracksToPlaylist(playlistId, batch)
    );
  }
}

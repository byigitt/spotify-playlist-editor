# Spotify Playlist Editor

Organize your Spotify playlists by genre, sort by album, release date, popularity, and more.

## Features

- **Spotify OAuth Login** - Secure Spotify account connection
- **Split by Genre** - Automatically separate songs by their genres
- **Sort by Album** - Group songs by their albums
- **Sort by Release Date** - Bring older or newer songs to the front
- **Sort by Popularity** - Find your most popular tracks
- **Reorder Playlist** - Reorder your existing playlist
- **Create New Playlist** - Create a new playlist with sorted tracks
- **Auto-create Genre Playlists** - Create separate playlists for each genre

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Lucide React (Icons)
- Context API

### Backend
- Bun
- Express
- spotify-web-api-node

## Setup

### 1. Create a Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app with "Create App"
3. Add `http://127.0.0.1:3001/api/auth/callback` as a Redirect URI (**use 127.0.0.1, not localhost!**)
4. Copy the Client ID and Client Secret

### 2. Install Dependencies

```bash
bun run install:all
```

### 3. Configure Environment Variables

Edit `server/.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
CLIENT_URL=http://127.0.0.1:5173
PORT=3001
```

### 4. Run

```bash
# Start both services
bun run dev
```

Or separately:

```bash
# Backend (Terminal 1)
cd server && bun run dev

# Frontend (Terminal 2)
cd client && bun run dev
```

The app will be available at: http://127.0.0.1:5173

## Usage

1. **Login** - Click "Login with Spotify"
2. **Select Playlist** - Choose a playlist from the left panel
3. **Sort** - Use sorting options (genre, album, date, etc.)
4. **Group** - Group by genre or album
5. **Actions**:
   - **Reorder** - Update the existing playlist with the new order
   - **New Playlist** - Create a new playlist with the sorted tracks
   - **Split by Genre** - Create separate playlists for each genre

## Required Permissions

The app uses the following Spotify scopes:

- `user-read-private` - User profile info
- `user-read-email` - Email address
- `playlist-read-private` - Read private playlists
- `playlist-read-collaborative` - Read collaborative playlists
- `playlist-modify-public` - Modify public playlists
- `playlist-modify-private` - Modify private playlists
- `user-follow-read` - Check follow permissions for followback tools
- `user-follow-modify` - Unfollow selected users

> Spotify's official Web API does not expose full follower/following user lists. The followback screen falls back to manual pasted lists when Spotify blocks automatic list loading.

## Project Structure

```
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # React Components
│   │   ├── context/        # Auth Context
│   │   ├── hooks/          # Custom Hooks
│   │   ├── services/       # API Service
│   │   └── types/          # TypeScript Types
│   └── vite.config.ts
│
├── server/                 # Express Backend (Bun)
│   └── src/
│       └── index.ts        # API Routes
│
└── package.json            # Root Package
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT

import { Music2, LogOut, LogIn, Loader2, Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, login, logout, isLoading } = useAuth();

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Music2 size={32} color="#1DB954" />
          <h1>bariscb <span>Playlist Editor</span></h1>
        </div>
        
        <div className="header-right">
          <a 
            href="https://github.com/byigitt/spotify-playlist-editor" 
            target="_blank" 
            rel="noopener noreferrer"
            className="github-link"
            title="GitHub'da görüntüle - Open Source"
          >
            <Github size={20} />
            <span>Open Source</span>
          </a>

          <div className="user-section">
            {isLoading ? (
              <Loader2 className="spin" size={20} />
            ) : user ? (
              <>
                <div className="user-info">
                  {user.images[0] && (
                    <img src={user.images[0].url} alt={user.display_name} className="avatar" />
                  )}
                  <span>{user.display_name}</span>
                </div>
                <button onClick={logout} className="btn btn-outline">
                  <LogOut size={18} />
                  <span>Çıkış Yap</span>
                </button>
              </>
            ) : (
              <button onClick={login} className="btn btn-primary">
                <LogIn size={18} />
                <span>Spotify ile Giriş Yap</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

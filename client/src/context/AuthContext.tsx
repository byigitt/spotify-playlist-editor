import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SpotifyUser } from '../types/spotify';
import { api } from '../services/api';

interface AuthContextType {
  user: SpotifyUser | null;
  session: string | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [session, setSession] = useState<string | null>(() => 
    localStorage.getItem('spotify_session')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // URL'den session parametresini kontrol et
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const error = params.get('error');

    if (error) {
      console.error('Auth error:', error);
      window.history.replaceState({}, '', '/');
    }

    if (sessionParam) {
      localStorage.setItem('spotify_session', sessionParam);
      setSession(sessionParam);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    async function fetchUser() {
      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        const userData = await api.getMe(session);
        setUser(userData);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        localStorage.removeItem('spotify_session');
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, [session]);

  const login = async () => {
    const { url } = await api.getLoginUrl();
    window.location.href = url;
  };

  const logout = async () => {
    if (session) {
      await api.logout(session);
    }
    localStorage.removeItem('spotify_session');
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

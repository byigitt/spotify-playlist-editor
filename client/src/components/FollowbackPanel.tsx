import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, UserMinus, Users } from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SocialUser } from '../types/spotify';

interface ParsedAccount {
  id: string;
  label: string;
}

const SPOTIFY_PROFILE_URL_PATTERN = /open\.spotify\.com\/user\/([^/?#\s]+)/i;
const SPOTIFY_PROFILE_URI_PATTERN = /spotify:user:([^:\s]+)/i;
const TRAILING_PUNCTUATION_PATTERN = /[),.;]+$/;

function cleanId(value: string): string {
  const trimmed = value.trim().replace(TRAILING_PUNCTUATION_PATTERN, '');
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function getUserId(line: string): string | null {
  const value = line.trim();
  if (value.length === 0) {
    return null;
  }

  const uriMatch = value.match(SPOTIFY_PROFILE_URI_PATTERN);
  if (uriMatch?.[1]) {
    return cleanId(uriMatch[1]);
  }

  const urlMatch = value.match(SPOTIFY_PROFILE_URL_PATTERN);
  if (urlMatch?.[1]) {
    return cleanId(urlMatch[1]);
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      const segments = url.pathname.split('/').filter(Boolean);
      const userSegmentIndex = segments.findIndex(segment => segment === 'user');
      if (userSegmentIndex >= 0 && segments[userSegmentIndex + 1]) {
        return cleanId(segments[userSegmentIndex + 1]);
      }
    } catch {
      return null;
    }
  }

  const firstToken = value.split(/\s+/)[0];
  return firstToken ? cleanId(firstToken) : null;
}

function getLabel(line: string, id: string): string {
  const value = line.trim();
  if (value === id || value.includes('open.spotify.com/user/') || value.includes('spotify:user:')) {
    return id;
  }
  return value;
}

function parseAccounts(input: string): ParsedAccount[] {
  const accounts = new Map<string, ParsedAccount>();
  for (const line of input.split(/\r?\n/)) {
    const id = getUserId(line);
    if (!id || accounts.has(id)) {
      continue;
    }

    accounts.set(id, {
      id,
      label: getLabel(line, id),
    });
  }

  return [...accounts.values()];
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function FollowbackPanel() {
  const { session } = useAuth();
  const [followingInput, setFollowingInput] = useState('');
  const [followersInput, setFollowersInput] = useState('');
  const [profiles, setProfiles] = useState<Record<string, SocialUser>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUnfollowing, setIsUnfollowing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const following = useMemo(() => parseAccounts(followingInput), [followingInput]);
  const followers = useMemo(() => parseAccounts(followersInput), [followersInput]);
  const followerIds = useMemo(() => new Set(followers.map(account => account.id)), [followers]);
  const notFollowingBack = useMemo(
    () => following.filter(account => !followerIds.has(account.id)),
    [following, followerIds]
  );
  const notFollowingBackIds = useMemo(
    () => notFollowingBack.map(account => account.id),
    [notFollowingBack]
  );
  const allSelected = notFollowingBack.length > 0 && notFollowingBack.every(account => selectedIds.has(account.id));

  const handleAnalyze = async () => {
    setMessage(null);
    setError(null);

    if (notFollowingBack.length === 0) {
      setSelectedIds(new Set());
      setMessage('Geri takip yapmayan kullanıcı bulunamadı.');
      return;
    }

    setSelectedIds(new Set(notFollowingBackIds));
    if (!session) {
      setError('Spotify oturumu bulunamadı.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const { users, missing } = await api.getSocialUsers(session, notFollowingBackIds);
      setProfiles(previous => {
        const next = { ...previous };
        for (const user of users) {
          next[user.id] = user;
        }
        return next;
      });
      const missingText = missing.length > 0 ? ` ${missing.length} profil Spotify'dan alınamadı.` : '';
      setMessage(`${notFollowingBack.length} geri takip yapmayan kullanıcı bulundu.${missingText}`);
    } catch (caughtError) {
      setError(messageFromError(caughtError, 'Profiller alınamadı.'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(notFollowingBackIds));
  };

  const removeUnfollowedFromInput = (removedIds: Set<string>) => {
    setFollowingInput(previous => previous
      .split(/\r?\n/)
      .filter(line => {
        const id = getUserId(line);
        return !id || !removedIds.has(id);
      })
      .join('\n'));
  };

  const handleUnfollow = async () => {
    const ids = notFollowingBackIds.filter(id => selectedIds.has(id));
    if (ids.length === 0) {
      setError('Takipten çıkmak için en az bir kullanıcı seçin.');
      return;
    }

    if (!session) {
      setError('Spotify oturumu bulunamadı.');
      return;
    }

    setIsUnfollowing(true);
    setMessage(null);
    setError(null);

    try {
      const result = await api.unfollowUsers(session, ids);
      const removedIds = new Set(result.ids);
      removeUnfollowedFromInput(removedIds);
      setSelectedIds(new Set());
      setMessage(`${result.removed} kullanıcı takipten çıkarıldı.`);
    } catch (caughtError) {
      setError(messageFromError(caughtError, 'Kullanıcılar takipten çıkarılamadı.'));
    } finally {
      setIsUnfollowing(false);
    }
  };

  return (
    <section className="followback-panel">
      <div className="followback-header">
        <div>
          <h2><Users size={20} /> Geri Takip Kontrolü</h2>
          <p>Spotify sosyal takipçi listelerini API'den paylaşmadığı için takip ettiklerinizi ve takipçilerinizi profil linki/ID olarak yapıştırın.</p>
        </div>
        <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing || isUnfollowing}>
          {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Users size={18} />}
          <span>Analiz Et</span>
        </button>
      </div>

      {(message || error) && (
        <div className={`message ${error ? 'error' : 'success'}`}>
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error ?? message}</span>
        </div>
      )}

      <div className="followback-inputs">
        <label>
          <span>Takip ettiklerim</span>
          <textarea
            value={followingInput}
            onChange={event => setFollowingInput(event.target.value)}
            placeholder="Her satıra bir Spotify profil linki veya kullanıcı ID'si"
            rows={6}
          />
          <small>{following.length} kullanıcı okundu</small>
        </label>
        <label>
          <span>Beni takip edenler</span>
          <textarea
            value={followersInput}
            onChange={event => setFollowersInput(event.target.value)}
            placeholder="Her satıra bir Spotify profil linki veya kullanıcı ID'si"
            rows={6}
          />
          <small>{followers.length} kullanıcı okundu</small>
        </label>
      </div>

      <div className="followback-results-header">
        <strong>{notFollowingBack.length} kişi geri takip yapmıyor</strong>
        <div className="followback-actions">
          <button className="btn btn-outline" onClick={toggleSelectAll} disabled={notFollowingBack.length === 0 || isUnfollowing}>
            {allSelected ? 'Seçimi Temizle' : 'Tümünü Seç'}
          </button>
          <button className="btn btn-danger" onClick={handleUnfollow} disabled={selectedIds.size === 0 || isUnfollowing}>
            {isUnfollowing ? <Loader2 className="spin" size={18} /> : <UserMinus size={18} />}
            <span>Seçilenleri Takipten Çık ({selectedIds.size})</span>
          </button>
        </div>
      </div>

      {notFollowingBack.length > 0 ? (
        <div className="followback-list">
          {notFollowingBack.map(account => {
            const profile = profiles[account.id];
            const displayName = profile?.displayName ?? account.label;
            const profileUrl = profile?.externalUrl ?? `https://open.spotify.com/user/${encodeURIComponent(account.id)}`;

            return (
              <label className="followback-user" key={account.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(account.id)}
                  onChange={() => toggleSelection(account.id)}
                  disabled={isUnfollowing}
                />
                {profile?.imageUrl ? (
                  <img src={profile.imageUrl} alt="" className="followback-avatar" />
                ) : (
                  <span className="followback-avatar placeholder"><Users size={18} /></span>
                )}
                <span className="followback-user-info">
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer">{displayName}</a>
                  <small>{account.id}</small>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="followback-empty">
          <Users size={32} />
          <span>Listeleri yapıştırıp analiz ettiğinizde geri takip yapmayanlar burada görünür.</span>
        </div>
      )}
    </section>
  );
}

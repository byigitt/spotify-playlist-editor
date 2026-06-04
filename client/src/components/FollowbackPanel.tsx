import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, UserMinus, Users } from 'lucide-react';
import { ApiError, api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SocialUser } from '../types/spotify';

interface ParsedAccount {
  id: string;
  label: string;
}

interface AccountListProps {
  title: string;
  emptyText: string;
  accounts: ParsedAccount[];
  profiles: Record<string, SocialUser>;
  selectedIds: Set<string>;
  selectable: boolean;
  getBadge?: (id: string) => string;
  onToggleSelection: (id: string) => void;
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

function mergeIds(first: ParsedAccount[], second: ParsedAccount[]): string[] {
  const ids = new Set<string>();
  for (const account of first) {
    ids.add(account.id);
  }
  for (const account of second) {
    ids.add(account.id);
  }
  return [...ids];
}


function AccountList({ title, emptyText, accounts, profiles, selectedIds, selectable, getBadge, onToggleSelection }: AccountListProps) {
  return (
    <div className="followback-account-list">
      <div className="followback-account-list-header">
        <strong>{title}</strong>
        <span>{accounts.length} kişi</span>
      </div>
      {accounts.length > 0 ? (
        <div className="followback-account-rows">
          {accounts.map(account => {
            const profile = profiles[account.id];
            const displayName = profile?.displayName ?? account.label;
            const badge = getBadge?.(account.id);

            return (
              <label className="followback-user compact" key={account.id}>
                {selectable && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(account.id)}
                    onChange={() => onToggleSelection(account.id)}
                  />
                )}
                {profile?.imageUrl ? (
                  <img src={profile.imageUrl} alt="" className="followback-avatar" />
                ) : (
                  <span className="followback-avatar placeholder"><Users size={18} /></span>
                )}
                <span className="followback-user-info">
                  <a href={profile?.externalUrl ?? `https://open.spotify.com/user/${encodeURIComponent(account.id)}`} target="_blank" rel="noopener noreferrer">{displayName}</a>
                  <small>{account.id}</small>
                </span>
                {badge && <span className="followback-badge">{badge}</span>}
              </label>
            );
          })}
        </div>
      ) : (
        <div className="followback-list-empty">{emptyText}</div>
      )}
    </div>
  );
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
  const followingIds = useMemo(() => new Set(following.map(account => account.id)), [following]);
  const notFollowingBack = useMemo(
    () => following.filter(account => !followerIds.has(account.id)),
    [following, followerIds]
  );
  const notFollowingBackIds = useMemo(
    () => notFollowingBack.map(account => account.id),
    [notFollowingBack]
  );
  const allNonFollowersSelected = notFollowingBack.length > 0 && notFollowingBack.every(account => selectedIds.has(account.id));

  const selectedFollowingIds = useMemo(
    () => [...selectedIds].filter(id => followingIds.has(id)),
    [selectedIds, followingIds]
  );

  const handleAnalyze = async () => {
    setMessage(null);
    setError(null);
    setSelectedIds(new Set(notFollowingBackIds));

    if (following.length === 0 && followers.length === 0) {
      setMessage('Takip edilenleri ve takipçileri görmek için listeleri yapıştırın.');
      return;
    }

    if (!session) {
      setError('Spotify oturumu bulunamadı.');
      return;
    }

    const idsToFetch = mergeIds(following, followers);
    setIsAnalyzing(true);
    try {
      if (idsToFetch.length > 0) {
        const { users, missing } = await api.getSocialUsers(session, idsToFetch);
        setProfiles(previous => {
          const next = { ...previous };
          for (const user of users) {
            next[user.id] = user;
          }
          return next;
        });
        const missingText = missing.length > 0 ? ` ${missing.length} profil Spotify'dan alınamadı.` : '';
        setMessage(`${following.length} takip edilen, ${followers.length} takipçi, ${notFollowingBack.length} geri takip yapmayan kişi bulundu.${missingText}`);
      }
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

  const toggleNonFollowerSelection = () => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      for (const id of notFollowingBackIds) {
        if (allNonFollowersSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
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
    const ids = selectedFollowingIds;
    if (ids.length === 0) {
      setError('Takipten çıkmak için takip edilenlerden en az bir kullanıcı seçin.');
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
      setSelectedIds(previous => {
        const next = new Set(previous);
        for (const id of removedIds) {
          next.delete(id);
        }
        return next;
      });
      setMessage(`${result.removed} kullanıcı takipten çıkarıldı.`);
    } catch (caughtError) {
      setError(messageFromError(caughtError, 'Kullanıcılar takipten çıkarılamadı.'));
    } finally {
      setIsUnfollowing(false);
    }
  };

  return (
    <section className="followback-panel followback-panel-page">
      <div className="followback-header">
        <div>
          <h2><Users size={20} /> Geri Takip Kontrolü</h2>
          <p>Takip edilenleri ve takipçileri profil linki ya da kullanıcı ID'si olarak yapıştırın. Listeleri yan yana görün, geri takip yapmayanları seçip hızlıca takipten çıkın.</p>
        </div>
        <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing || isUnfollowing}>
          {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Users size={18} />}
          <span>Listeleri Analiz Et</span>
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
          <span>Takip edilenler</span>
          <textarea
            value={followingInput}
            onChange={event => setFollowingInput(event.target.value)}
            placeholder="Her satıra bir Spotify profil linki veya kullanıcı ID'si"
            rows={6}
          />
          <small>{following.length} kullanıcı okundu</small>
        </label>
        <label>
          <span>Takipçiler</span>
          <textarea
            value={followersInput}
            onChange={event => setFollowersInput(event.target.value)}
            placeholder="Her satıra bir Spotify profil linki veya kullanıcı ID'si"
            rows={6}
          />
          <small>{followers.length} kullanıcı okundu</small>
        </label>
      </div>

      <div className="followback-source-lists">
        <AccountList
          title="Takip edilenler"
          emptyText="Takip edilenler listesi boş."
          accounts={following}
          profiles={profiles}
          selectedIds={selectedIds}
          selectable
          getBadge={id => followerIds.has(id) ? 'Geri takip ediyor' : 'Geri takip yok'}
          onToggleSelection={toggleSelection}
        />
        <AccountList
          title="Takipçiler"
          emptyText="Takipçi listesi boş."
          accounts={followers}
          profiles={profiles}
          selectedIds={selectedIds}
          selectable={false}
          getBadge={id => followingIds.has(id) ? 'Karşılıklı' : 'Sadece takipçi'}
          onToggleSelection={toggleSelection}
        />
      </div>

      <div className="followback-results-header">
        <strong>{notFollowingBack.length} kişi geri takip yapmıyor</strong>
        <div className="followback-actions">
          <button className="btn btn-outline" onClick={toggleNonFollowerSelection} disabled={notFollowingBack.length === 0 || isUnfollowing}>
            {allNonFollowersSelected ? 'Geri Takip Yok Seçimini Temizle' : 'Geri Takip Yapmayanları Seç'}
          </button>
          <button className="btn btn-danger" onClick={handleUnfollow} disabled={selectedFollowingIds.length === 0 || isUnfollowing}>
            {isUnfollowing ? <Loader2 className="spin" size={18} /> : <UserMinus size={18} />}
            <span>Seçilenleri Takipten Çık ({selectedFollowingIds.length})</span>
          </button>
        </div>
      </div>

      {notFollowingBack.length > 0 ? (
        <div className="followback-list">
          {notFollowingBack.map(account => {
            const profile = profiles[account.id];
            const displayName = profile?.displayName ?? account.label;

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
                  <a href={profile?.externalUrl ?? `https://open.spotify.com/user/${encodeURIComponent(account.id)}`} target="_blank" rel="noopener noreferrer">{displayName}</a>
                  <small>{account.id}</small>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="followback-empty">
          <Users size={32} />
          <span>Listeleri analiz ettiğinizde geri takip yapmayanlar burada görünür.</span>
        </div>
      )}
    </section>
  );
}

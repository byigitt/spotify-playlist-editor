import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCopy, Loader2, UserMinus, Users } from 'lucide-react';
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

const SPOTIFY_PROFILE_URL_PATTERN = /open\.spotify\.com\/user\/([^/?#\s"'<>]+)/i;
const SPOTIFY_PROFILE_PATH_PATTERN = /(?:https?:\/\/open\.spotify\.com)?\/user\/([^/?#\s"'<>]+)/gi;
const SPOTIFY_PROFILE_URI_PATTERN = /spotify:user:([^:\s"'<>]+)/i;
const SPOTIFY_PROFILE_URI_GLOBAL_PATTERN = /spotify:user:([^:\s"'<>]+)/gi;
const TRAILING_PUNCTUATION_PATTERN = /["'),.;]+$/;
const SOCIAL_USERS_BATCH_SIZE = 200;
const SPOTIFY_WEB_COPY_SCRIPT = `void (async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const found = new Map();

  function getId(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/\\/user\\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  const pageOwnerId = getId(location.href);
  const isConnectionPage = /\\/(followers|following)(?:\\/)?$/.test(location.pathname);

  function getName(anchor, id) {
    const row = anchor.closest('[role="row"], li, [data-testid="card-click-handler"], [data-testid="list-row"]');
    const text = (row?.textContent || anchor.textContent || anchor.getAttribute('aria-label') || id)
      .replace(/\\s+/g, ' ')
      .trim();
    return text || id;
  }

  function addAnchor(anchor) {
    const id = getId(anchor.getAttribute('href') || '');
    if (!id || (isConnectionPage && id === pageOwnerId)) return;

    const name = getName(anchor, id);
    found.set(id, name && name !== id ? id + ' ' + name : id);
  }

  const visibleDialogs = [...document.querySelectorAll('[role="dialog"]')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  const root = visibleDialogs.find((element) => element.querySelector('a[href*="/user/"]'))
    || visibleDialogs[0]
    || document.querySelector('main')
    || document;

  function grabVisibleUsers() {
    root.querySelectorAll('a[href*="/user/"]').forEach(addAnchor);
  }

  function getScrollTargets() {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      root,
      ...root.querySelectorAll('*'),
    ];
    const seen = new Set();
    return candidates.filter((element) => {
      if (!element || seen.has(element)) return false;
      seen.add(element);
      return element.scrollHeight > element.clientHeight + 60;
    });
  }

  function scrollTarget(element) {
    const before = element.scrollTop;
    const amount = Math.max(320, Math.floor((element.clientHeight || window.innerHeight) * 0.85));
    element.scrollTop = Math.min(element.scrollTop + amount, element.scrollHeight);
    return element.scrollTop !== before;
  }

  for (const target of getScrollTargets()) {
    target.scrollTop = 0;
  }
  window.scrollTo(0, 0);

  let lastSize = -1;
  let stuckCount = 0;
  for (let index = 0; index < 180 && stuckCount < 12; index += 1) {
    grabVisibleUsers();

    let moved = false;
    for (const target of getScrollTargets()) {
      moved = scrollTarget(target) || moved;
    }
    const previousWindowY = window.scrollY;
    window.scrollBy(0, Math.max(360, Math.floor(window.innerHeight * 0.85)));
    moved = moved || window.scrollY !== previousWindowY;

    await sleep(350);

    if (found.size === lastSize && !moved) {
      stuckCount += 1;
    } else {
      lastSize = found.size;
      stuckCount = 0;
    }
  }

  grabVisibleUsers();
  const output = [...found.values()].join('\\n');
  if (!output) {
    alert('Kullanıcı bulunamadı. Takipçi veya takip edilen listesi ekranda görünürken tekrar deneyin.');
    return;
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(output);
    copied = true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = output;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    copied = document.execCommand('copy');
    textarea.remove();
  }

  if (!copied) {
    window.prompt('Otomatik kopyalanamadı. Listeyi elle kopyalayın:', output);
    return;
  }

  alert(found.size + ' kullanıcı panoya kopyalandı. Sayı eksikse sayfanın listeyi yüklediğinden emin olup tekrar çalıştırın.');
})();`;

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
  if (!firstToken || /[<>"'=]/.test(firstToken)) {
    return null;
  }
  return cleanId(firstToken);
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
  const addAccount = (id: string | null, label: string) => {
    if (!id || accounts.has(id)) {
      return;
    }

    accounts.set(id, { id, label });
  };

  for (const line of input.split(/\r?\n/)) {
    const id = getUserId(line);
    addAccount(id, id ? getLabel(line, id) : '');
  }

  SPOTIFY_PROFILE_PATH_PATTERN.lastIndex = 0;
  for (const match of input.matchAll(SPOTIFY_PROFILE_PATH_PATTERN)) {
    addAccount(cleanId(match[1]), cleanId(match[1]));
  }

  SPOTIFY_PROFILE_URI_GLOBAL_PATTERN.lastIndex = 0;
  for (const match of input.matchAll(SPOTIFY_PROFILE_URI_GLOBAL_PATTERN)) {
    addAccount(cleanId(match[1]), cleanId(match[1]));
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

function withManualFallback(message: string): string {
  return /elle liste/i.test(message) ? message : `${message} Elle liste yapıştırabilirsiniz.`;
}

function shouldOfferReauth(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.status === 401) {
    return true;
  }

  return error.status === 403 && /izin|giriş|oturum/i.test(error.message);
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

function usersToInput(users: SocialUser[]): string {
  const lines: string[] = [];
  for (const user of users) {
    lines.push(`${user.id} ${user.displayName}`);
  }
  return lines.join('\n');
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
  const { session, login } = useAuth();
  const [followingInput, setFollowingInput] = useState('');
  const [followersInput, setFollowersInput] = useState('');
  const [profiles, setProfiles] = useState<Record<string, SocialUser>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUnfollowing, setIsUnfollowing] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const [showReauthAction, setShowReauthAction] = useState(false);
  const [showCopyHelper, setShowCopyHelper] = useState(false);
  const [scriptCopyMessage, setScriptCopyMessage] = useState<string | null>(null);
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

  const loadSpotifyConnections = useCallback(async () => {
    setMessage(null);
    setError(null);
    setShowReauthAction(false);

    if (!session) {
      setAutoLoadAttempted(true);
      setError('Spotify oturumu bulunamadı.');
      return;
    }

    setIsLoadingConnections(true);
    try {
      const { following: loadedFollowing, followers: loadedFollowers } = await api.getSocialConnections(session);
      const nextProfiles: Record<string, SocialUser> = {};
      for (const user of loadedFollowing) {
        nextProfiles[user.id] = user;
      }
      for (const user of loadedFollowers) {
        nextProfiles[user.id] = user;
      }

      const loadedFollowerIds = new Set(loadedFollowers.map(user => user.id));
      const nextSelectedIds = new Set<string>();
      for (const user of loadedFollowing) {
        if (!loadedFollowerIds.has(user.id)) {
          nextSelectedIds.add(user.id);
        }
      }

      setProfiles(previous => ({ ...previous, ...nextProfiles }));
      setFollowingInput(usersToInput(loadedFollowing));
      setFollowersInput(usersToInput(loadedFollowers));
      setSelectedIds(nextSelectedIds);
      setAutoLoadAttempted(true);
      setShowReauthAction(false);
      setMessage(`${loadedFollowing.length} takip edilen, ${loadedFollowers.length} takipçi, ${nextSelectedIds.size} geri takip yapmayan kişi Spotify'dan yüklendi.`);
    } catch (caughtError) {
      setAutoLoadAttempted(true);
      setShowReauthAction(shouldOfferReauth(caughtError));
      setError(withManualFallback(messageFromError(caughtError, 'Spotify takip listeleri alınamadı.')));
    } finally {
      setIsLoadingConnections(false);
    }
  }, [session]);

  useEffect(() => {
    void loadSpotifyConnections();
  }, [loadSpotifyConnections]);

  const copySpotifyWebScript = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(SPOTIFY_WEB_COPY_SCRIPT);
      setScriptCopyMessage('Script kopyalandı. Spotify Web konsoluna yapıştırabilirsiniz.');
    } catch {
      setScriptCopyMessage('Otomatik kopyalanamadı. Script kutusunu seçip elle kopyalayın.');
    }
  };

  const handleAnalyze = async () => {
    setMessage(null);
    setError(null);
    setShowReauthAction(false);
    setSelectedIds(new Set(notFollowingBackIds));

    if (following.length === 0 && followers.length === 0) {
      setMessage('Takip edilenleri ve takipçileri görmek için Spotify\'dan yenileyin veya listeleri elle yapıştırın.');
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
        const fetchedUsers: SocialUser[] = [];
        const missingUsers: string[] = [];
        for (let index = 0; index < idsToFetch.length; index += SOCIAL_USERS_BATCH_SIZE) {
          const batch = idsToFetch.slice(index, index + SOCIAL_USERS_BATCH_SIZE);
          const { users, missing } = await api.getSocialUsers(session, batch);
          fetchedUsers.push(...users);
          missingUsers.push(...missing);
        }

        setProfiles(previous => {
          const next = { ...previous };
          for (const user of fetchedUsers) {
            next[user.id] = user;
          }
          return next;
        });
        const missingText = missingUsers.length > 0 ? ` ${missingUsers.length} profil Spotify'dan alınamadı.` : '';
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
    setFollowingInput(previous => parseAccounts(previous)
      .filter(account => !removedIds.has(account.id))
      .map(account => account.label === account.id || account.label.startsWith(`${account.id} `)
        ? account.label
        : `${account.id} ${account.label}`)
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
    setShowReauthAction(false);

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
      setShowReauthAction(shouldOfferReauth(caughtError));
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
          <p>Spotify izin verirse takip edilenler ve takipçiler otomatik yüklenir. İzinler eksikse yeni izinleri isteyin; Spotify listeyi kapatırsa kullanıcı ID/link listelerini elle yapıştırabilirsiniz.</p>
        </div>
        <div className="followback-header-actions">
          <button className="btn btn-outline" type="button" onClick={() => setShowCopyHelper(previous => !previous)}>
            <ClipboardCopy size={18} />
            <span>Web’den kopyala</span>
          </button>
          <button className="btn btn-outline" type="button" onClick={() => void login(true, true)} disabled={isLoadingConnections || isAnalyzing || isUnfollowing}>
            Spotify izinlerini yenile
          </button>
          <button className="btn btn-primary" onClick={loadSpotifyConnections} disabled={isLoadingConnections || isAnalyzing || isUnfollowing}>
            {isLoadingConnections ? <Loader2 className="spin" size={18} /> : <Users size={18} />}
            <span>{isLoadingConnections ? 'Yükleniyor' : 'Spotify\'dan Yenile'}</span>
          </button>
        </div>
      </div>

      {(message || error) && (
        <div className={`message ${error ? 'error' : 'success'}`}>
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error ?? message}</span>
          {error && showReauthAction && (
            <button className="btn btn-outline" type="button" onClick={() => void login(true, true)}>
              Spotify izinlerini yenile
            </button>
          )}
        </div>
      )}

      {showCopyHelper && (
        <div className="followback-copy-helper">
          <div className="followback-copy-helper-header">
            <div>
              <strong>Spotify Web’den liste kopyala</strong>
              <p>Bu yöntem sadece açık Spotify sayfasındaki kullanıcı linklerini okur. Cookie veya token uygulamaya gelmez.</p>
            </div>
            <button className="btn btn-outline" type="button" onClick={() => setShowCopyHelper(false)}>
              Kapat
            </button>
          </div>
          <ol>
            <li>open.spotify.com üzerinde Takipçiler veya Takip edilenler sayfasını/penceresini açıp listenin görünmesini bekleyin.</li>
            <li>Aşağıdaki script’i kopyalayıp tarayıcı geliştirici konsolunda çalıştırın; script listeyi aşağı kaydırarak toplamaya çalışır.</li>
            <li>Sayı eksik görünürse sayfayı biraz aşağı kaydırıp script’i tekrar çalıştırın. Panodaki satırları bu ekrandaki doğru kutuya yapıştırıp analiz edin.</li>
          </ol>
          <div className="followback-copy-helper-actions">
            <button className="btn btn-primary" type="button" onClick={() => void copySpotifyWebScript()}>
              <ClipboardCopy size={18} />
              <span>Script’i kopyala</span>
            </button>
            {scriptCopyMessage && <span className="followback-copy-helper-status">{scriptCopyMessage}</span>}
          </div>
          <textarea readOnly value={SPOTIFY_WEB_COPY_SCRIPT} rows={10} aria-label="Spotify Web kopyalama scripti" />
        </div>
      )}

      <details className="followback-manual-import" open={!autoLoadAttempted || (Boolean(error) && following.length === 0 && followers.length === 0)}>
        <summary>Elle liste yapıştır</summary>
        <div className="followback-inputs">
          <label>
            <span>Takip edilenler</span>
            <textarea
              value={followingInput}
              onChange={event => setFollowingInput(event.target.value)}
              placeholder="Spotify profil linki, kullanıcı ID'si, console çıktısı veya raw HTML"
              rows={6}
            />
            <small>{following.length} kullanıcı okundu</small>
          </label>
          <label>
            <span>Takipçiler</span>
            <textarea
              value={followersInput}
              onChange={event => setFollowersInput(event.target.value)}
              placeholder="Spotify profil linki, kullanıcı ID'si, console çıktısı veya raw HTML"
              rows={6}
            />
            <small>{followers.length} kullanıcı okundu</small>
          </label>
        </div>
        <button className="btn btn-outline" onClick={handleAnalyze} disabled={isAnalyzing || isLoadingConnections || isUnfollowing}>
          {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Users size={18} />}
          <span>Girilenleri Analiz Et</span>
        </button>
      </details>

      <div className="followback-source-lists">
        <AccountList
          title="Takip edilenler"
          emptyText={isLoadingConnections ? 'Spotify’dan takip edilenler yükleniyor.' : 'Takip edilenler listesi boş.'}
          accounts={following}
          profiles={profiles}
          selectedIds={selectedIds}
          selectable
          getBadge={id => followerIds.has(id) ? 'Geri takip ediyor' : 'Geri takip yok'}
          onToggleSelection={toggleSelection}
        />
        <AccountList
          title="Takipçiler"
          emptyText={isLoadingConnections ? 'Spotify’dan takipçiler yükleniyor.' : 'Takipçi listesi boş.'}
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
          <span>Spotify'dan yenilediğinizde geri takip yapmayanlar burada görünür.</span>
        </div>
      )}
    </section>
  );
}

import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'undefined' && envUrl !== '') return envUrl;
  return window.location.origin;
};
const API_URL = getApiUrl();
const getImageUrl = (path) => path ? (path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`) : null;

// --- THEME ---
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

// --- AUTH CONTEXT ---
const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setUser(await res.json());
        else { localStorage.removeItem('token'); setToken(null); }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    checkAuth();
  }, [token]);

  const login = async (u, p) => {
    const res = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token); setToken(data.token); setUser(data.user);
  };

  const register = async (u, e, p, d) => {
    const res = await fetch(`${API_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, email: e, password: p, display_name: d }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token); setToken(data.token); setUser(data.user);
  };

  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); };

  return <AuthContext.Provider value={{ user, token, login, register, logout, loading, updateUser: setUser }}>{children}</AuthContext.Provider>
}

const useAuth = () => useContext(AuthContext)

function useApi() {
  const { token, logout } = useAuth()
  return async (endpoint, options = {}) => {
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) { logout(); throw new Error("Expired"); }
    return res.json();
  }
}

// --- NOTIFICATION ITEM ---
function NotifItem({ n, onClose }) {
  const navigate = useNavigate();
  const imgUrl = (p) => !p ? null : p.startsWith('http') ? p : `${API_URL}/${p.replace(/^\//, '')}`;

  const labels = {
    follow: 'folgt dir jetzt',
    like: 'liked deinen Post',
    comment: 'hat deinen Post kommentiert',
    reply: 'hat auf dein Thema geantwortet',
    message: 'hat dir eine Nachricht gesendet',
  };

  const links = {
    follow: `/profile/${n.actor_id}`,
    like: `/`,
    comment: `/`,
    reply: `/forum/topics/${n.content_id}`,
    message: `/messages`,
  };

  const timeAgo = (dateStr) => {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
    return `vor ${Math.floor(diff / 86400)} Tagen`;
  };

  return (
    <div onClick={() => { navigate(links[n.type] || '/'); onClose(); }}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-dark-300 cursor-pointer transition border-b border-dark-100 ${!n.read_at ? 'bg-dark-300/60' : ''}`}>
      <div className="w-9 h-9 rounded-full bg-red-950 flex items-center justify-center overflow-hidden flex-shrink-0">
        {n.actor_avatar
          ? <img src={imgUrl(n.actor_avatar)} className="w-full h-full object-cover" />
          : <span className="text-red-400 text-xs font-bold">{n.actor_username?.[0]?.toUpperCase()}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 leading-snug">
          <span className="font-bold text-white">{n.actor_display || n.actor_username}</span>{' '}
          {labels[n.type] || n.type}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{timeAgo(n.created_at)}</p>
      </div>
      {!n.read_at && <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1.5"></div>}
    </div>
  );
}

// --- NAVBAR ---
function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const apiFetch = useApi();
  const [onlineCount, setOnlineCount] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const { theme, toggle: toggleTheme } = useTheme();

  const loadNotifications = async () => {
    try {
      const data = await apiFetch('/api/notifications');
      setNotifications(data.notifications);
      setUnreadNotifs(data.unreadCount);
    } catch (e) {}
  };

  const markNotifsRead = async () => {
    if (unreadNotifs === 0) return;
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' });
      setUnreadNotifs(0);
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch (e) {}
  };

  // Heartbeat & Online Counter & Unread Messages Logik
  useEffect(() => {
    if (!user) return;
    const updateStatus = async () => {
      try {
        await apiFetch('/api/auth/heartbeat', { method: 'POST' });
        const [onlineRes, unreadRes] = await Promise.all([
          apiFetch('/api/users/online'),
          apiFetch('/api/messages/unread-count')
        ]);
        setOnlineCount(onlineRes.count);
        setUnreadMessages(unreadRes.count);
      } catch (e) { console.error("Status update failed", e); }
    };
    updateStatus();
    loadNotifications();
    const interval = setInterval(() => { updateStatus(); loadNotifications(); }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) { navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); setMobileMenuOpen(false); }
  };

  return (
    <nav className="bg-dark-200 border-b border-dark-100 sticky top-0 z-50">
      {/* Desktop & Mobile Header */}
      <div className="max-w-6xl mx-auto flex justify-between items-center h-20 px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center">
            <img src="/logo.png" alt="Sneaks & Socks Club" className="h-14 sm:h-16 w-auto object-contain" />
          </Link>

          {/* Online Counter & Nav Links - Desktop */}
          <div className="hidden md:flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 bg-dark-300 px-2.5 py-1 rounded-full border border-dark-100" title="Mitglieder online">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_6px_#22c55e]"></span>
              </span>
              <span className="text-gray-300 text-xs font-bold">{onlineCount}</span>
            </div>
            <Link to="/members" className="text-gray-400 hover:text-white transition text-sm font-medium ml-1">Members</Link>
            <Link to="/forum" className="text-gray-400 hover:text-white transition text-sm font-medium ml-3">💬 Forum</Link>
            <Link to="/market" className="text-gray-400 hover:text-white transition text-sm font-medium ml-3">🛒 Markt</Link>
            <Link to="/events" className="text-gray-400 hover:text-white transition text-sm font-medium ml-3">📅 Events</Link>
            <Link to="/groups" className="text-gray-400 hover:text-white transition text-sm font-medium ml-3">👥 Gruppen</Link>
            {user?.is_admin && <Link to="/admin" className="text-yellow-400 hover:text-yellow-300 transition text-sm font-bold ml-3">⚙️ Admin</Link>}
          </div>

          {/* Search Input - Desktop */}
          <form onSubmit={handleSearch} className="hidden lg:flex items-center">
            <div className="relative">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Suchen..."
                className="bg-dark-100 text-white text-sm px-4 py-2 pl-9 rounded-xl border border-dark-100 focus:border-red-500 outline-none w-40 transition" />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
            </div>
          </form>
        </div>

        {user && (
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notifications Bell */}
            <div className="relative">
              <button onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markNotifsRead(); }}
                className="relative text-gray-400 hover:text-white transition p-2" title="Benachrichtigungen">
                <span className="text-xl">🔔</span>
                {unreadNotifs > 0 && (
                  <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 bg-dark-200 border border-dark-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-100 flex justify-between items-center">
                    <span className="text-white font-bold text-sm">Benachrichtigungen</span>
                    <button onClick={() => setNotifOpen(false)} className="text-gray-500 hover:text-white text-xs">✕</button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-8">Keine Benachrichtigungen</p>
                    ) : notifications.map(n => (
                      <NotifItem key={n.id} n={n} onClose={() => setNotifOpen(false)} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button onClick={toggleTheme} className="text-gray-400 hover:text-white transition p-2" title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              <span className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>

            {/* Saved Posts Icon */}
            <Link to="/saved" className="text-gray-400 hover:text-yellow-400 transition p-2" title="Gespeicherte Posts">
              <span className="text-xl">🔖</span>
            </Link>

            {/* Messages Icon */}
            <Link to="/messages" className="relative text-gray-400 hover:text-white transition p-2" title="Nachrichten">
              <span className="text-xl">✉️</span>
              {unreadMessages > 0 && (
                <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </Link>

            {/* Create Post - Desktop */}
            <Link to="/create-post" className="hidden sm:flex bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition shadow-sm items-center gap-1">
              <span>+</span><span className="hidden md:inline">Post</span>
            </Link>

            {/* Profile - Desktop */}
            <Link to={`/profile/${user.username}`} className="hidden sm:flex items-center hover:opacity-80 transition">
              <div className="w-9 h-9 rounded-full bg-red-950 flex items-center justify-center overflow-hidden border border-dark-100">
                {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-sm font-bold">{user.username[0].toUpperCase()}</span>}
              </div>
            </Link>

            {/* Logout - Desktop */}
            <button onClick={() => { logout(); navigate('/login') }} className="hidden sm:block text-gray-500 hover:text-red-400 text-sm font-medium transition">Logout</button>

            {/* Hamburger Menu - Mobile */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="sm:hidden p-2 text-white">
              <span className="text-2xl">{mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {user && mobileMenuOpen && (
        <div className="sm:hidden bg-dark-300 border-t border-dark-100 px-4 py-4 space-y-4">
          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="relative">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Suchen..."
              className="w-full bg-dark-100 text-white text-sm px-4 py-3 pl-10 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          </form>

          {/* Mobile Menu Items */}
          <div className="flex flex-col gap-2">
            <Link to="/create-post" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-red-600 text-white px-4 py-3 rounded-xl font-bold">
              <span>+</span> Post erstellen
            </Link>
            <Link to={`/profile/${user.username}`} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-sm font-bold">{user.username[0].toUpperCase()}</span>}
              </div>
              Mein Profil
            </Link>
            <Link to="/members" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>👥</span> Members ({onlineCount} online)
            </Link>
            <Link to="/forum" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>💬</span> Forum
            </Link>
            <Link to="/market" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>🛒</span> Marktplatz
            </Link>
            <Link to="/events" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>📅</span> Events
            </Link>
            <Link to="/groups" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>👥</span> Gruppen
            </Link>
            <Link to="/saved" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
              <span>🔖</span> Gespeicherte Posts
            </Link>
            {user?.is_admin && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-yellow-900/40 text-yellow-400 px-4 py-3 rounded-xl font-bold border border-yellow-800">
                <span>⚙️</span> Admin-Panel
              </Link>
            )}
            <button onClick={() => { toggleTheme(); }} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl text-left">
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span> {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button onClick={() => { logout(); navigate('/login'); setMobileMenuOpen(false); }} className="flex items-center gap-3 bg-dark-100 text-red-400 px-4 py-3 rounded-xl text-left">
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}

// --- POST COMPONENT (Mit Likes & Comments) ---
function TextWithMentions({ text, className }) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        /^@[a-zA-Z0-9_]+$/.test(part)
          ? <Link key={i} to={`/profile/${part.slice(1)}`} className="text-red-400 hover:text-red-300 font-medium">{part}</Link>
          : part
      )}
    </p>
  );
}

// --- REPORT MODAL ---
const REPORT_REASONS = ['Spam', 'Beleidigung', 'Unangemessener Inhalt', 'Fehlinformation', 'Sonstiges'];

function ReportModal({ contentType, contentId, onClose }) {
  const apiFetch = useApi();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    try {
      await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify({ content_type: contentType, content_id: contentId, reason }) });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch(e) { alert('Fehler beim Melden'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-dark-300 rounded-2xl p-6 w-full max-w-sm border border-dark-100 shadow-2xl" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-white font-bold">Meldung eingereicht!</p>
            <p className="text-gray-400 text-sm mt-1">Ein Admin wird dies prüfen.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Inhalt melden 🚩</h3>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-gray-400 text-sm mb-4">Bitte wähle einen Grund für deine Meldung:</p>
            <div className="space-y-2 mb-5">
              {REPORT_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition border ${reason === r ? 'border-red-500 bg-red-950 text-white font-bold' : 'border-dark-100 text-gray-400 hover:border-gray-600'}`}>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={!reason || sending}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition">
              {sending ? 'Wird gesendet...' : 'Melden'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const REACTION_EMOJIS = ['🔥', '👟', '🧦', '❤️', '😂'];

function Post({ post, onRefresh }) {
  const { user } = useAuth(); const apiFetch = useApi();
  const [liked, setLiked] = useState(!!post.liked);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [saved, setSaved] = useState(!!post.saved);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [reactions, setReactions] = useState(post.reactions || {});
  const [myReactions, setMyReactions] = useState(post.my_reactions || []);
  const [reportTarget, setReportTarget] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);

  const handleDelete = async () => { if (window.confirm("Post löschen?")) { await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' }); onRefresh(); } }

  const handleEditSave = async () => {
    if (!editContent.trim()) return;
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'PUT', body: JSON.stringify({ content: editContent }) });
      setEditing(false);
      onRefresh();
    } catch (e) { console.error(e); }
  };
  
  const handleLike = async () => {
    try {
      const res = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' });
      setLiked(!!res.liked);
      setLikeCount(prev => res.liked ? prev + 1 : prev - 1);
    } catch (err) { console.error(err); }
  }

  const handleSave = async () => {
    try {
      const res = await apiFetch(`/api/posts/${post.id}/save`, { method: 'POST' });
      setSaved(!!res.saved);
    } catch (err) { console.error(err); }
  }

  const handleReact = async (emoji) => {
    try {
      const res = await apiFetch(`/api/posts/${post.id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
      setReactions(prev => {
        const next = { ...prev };
        if (res.reacted) { next[emoji] = (next[emoji] || 0) + 1; }
        else { next[emoji] = (next[emoji] || 1) - 1; if (next[emoji] <= 0) delete next[emoji]; }
        return next;
      });
      setMyReactions(prev => res.reacted ? [...prev, emoji] : prev.filter(e => e !== emoji));
    } catch (err) { console.error(err); }
  }

  const loadComments = async () => {
    try { setComments(await apiFetch(`/api/posts/${post.id}/comments`)); } catch(e) { console.error(e) }
  }

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const c = await apiFetch(`/api/posts/${post.id}/comments`, { method: 'POST', body: JSON.stringify({ content: newComment }) });
      setComments([...comments, c]);
      setNewComment('');
      onRefresh(); // Um den Counter anzupassen
    } catch(e) { console.error(e) }
  }

  return (
    <div className="bg-dark-200 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-dark-100 mb-4 sm:mb-6 shadow-md">
      <div className="flex justify-between items-start mb-2 sm:mb-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link to={`/profile/${post.username}`} className="flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden shadow-inner">
              {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm sm:text-base">{post.username[0].toUpperCase()}</span>}
            </div>
          </Link>
          <div className="min-w-0">
            <Link to={`/profile/${post.username}`} className="text-white font-bold hover:text-red-400 transition text-sm sm:text-base truncate block">{post.display_name || post.username}</Link>
            <p className="text-gray-500 text-xs">@{post.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(user?.id !== post.user_id || user?.is_admin) && <button onClick={() => setReportTarget({ type: 'post', id: post.id })} className="text-gray-600 hover:text-orange-400 transition p-1" title="Melden">🚩</button>}
          {user?.id === post.user_id && <button onClick={() => { setEditing(true); setEditContent(post.content); }} className="text-gray-600 hover:text-blue-400 transition p-1" title="Bearbeiten">✏️</button>}
          {user?.id === post.user_id && <button onClick={handleDelete} className="text-gray-600 hover:text-red-500 transition p-1" title="Löschen">🗑️</button>}
        </div>
      </div>
      {editing ? (
        <div className="mt-2 sm:mt-3">
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4}
            className="w-full bg-dark-300 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm resize-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={handleEditSave} className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-700 transition">Speichern</button>
            <button onClick={() => setEditing(false)} className="bg-dark-300 text-gray-400 px-4 py-1.5 rounded-lg text-sm hover:text-white transition">Abbrechen</button>
          </div>
        </div>
      ) : (
        <TextWithMentions text={post.content} className="text-gray-200 text-sm sm:text-[15px] mt-2 sm:mt-3 whitespace-pre-wrap leading-relaxed" />
      )}
      {post.image && <img src={getImageUrl(post.image)} className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl w-full max-h-[400px] sm:max-h-[500px] object-cover" />}
      
      {/* Interaction Bar */}
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-dark-100">
        <button onClick={handleLike} className={`flex items-center gap-2 transition ${liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
          <span>{liked ? '❤️' : '🤍'}</span>
          <span className="text-sm font-medium">{likeCount}</span>
        </button>
        <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments(); }} className="flex items-center gap-2 text-gray-400 hover:text-red-400 transition">
          <span>💬</span>
          <span className="text-sm font-medium">{post.comment_count || 0}</span>
        </button>
        <button onClick={handleSave} title={saved ? 'Gespeichert – klicken zum Entfernen' : 'Speichern'}
          className={`ml-auto flex items-center gap-1.5 text-sm transition ${saved ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-500 hover:text-yellow-400'}`}>
          <span>{saved ? '🔖' : '🏷️'}</span>
          <span className="hidden sm:inline font-medium">{saved ? 'Gespeichert' : 'Speichern'}</span>
        </button>
      </div>

      {/* Emoji Reactions */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {REACTION_EMOJIS.map(emoji => {
          const count = reactions[emoji] || 0;
          const reacted = myReactions.includes(emoji);
          return (
            <button key={emoji} onClick={() => handleReact(emoji)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm transition border ${reacted ? 'border-red-500 bg-red-950 text-white' : 'border-dark-100 text-gray-400 hover:border-gray-500'}`}>
              <span>{emoji}</span>
              {count > 0 && <span className="text-xs font-medium">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="mt-4 bg-dark-300 p-4 rounded-xl">
          <form onSubmit={handleCommentSubmit} className="flex gap-2 mb-4">
            {/* ÄNDERUNG: Blau-Fokus-Rand zu Rot-Fokus gewechselt */}
            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Schreibe einen Kommentar..." className="flex-1 bg-dark-100 text-white p-2.5 rounded-lg border border-dark-100 text-sm focus:border-red-500 outline-none" />
            {/* ÄNDERUNG: Blau-Button zu Rot-Button gewechselt */}
            <button className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Senden</button>
          </form>
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-dark-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {c.avatar ? <img src={getImageUrl(c.avatar)} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs font-bold">{c.username[0].toUpperCase()}</span>}
                </div>
                <div className="bg-dark-100 p-3 rounded-xl flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-white text-xs font-bold">@{c.username}</p>
                    {(user?.id !== c.user_id || user?.is_admin) && <button onClick={() => setReportTarget({ type: 'comment', id: c.id })} className="text-gray-600 hover:text-orange-400 transition text-xs" title="Melden">🚩</button>}
                  </div>
                  <TextWithMentions text={c.content} className="text-gray-300 text-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {reportTarget && <ReportModal contentType={reportTarget.type} contentId={reportTarget.id} onClose={() => setReportTarget(null)} />}
    </div>
  )
}

// --- CREATE POST PAGE (NEU) ---
function CreatePostPage() {
  const [newPost, setNewPost] = useState('');
  const [image, setImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const apiFetch = useApi();
  const navigate = useNavigate();

  const submit = async (e) => { 
    e.preventDefault(); 
    if(!newPost.trim() && !image) return; 
    setPosting(true);
    try {
      const fd = new FormData();
      if (newPost) fd.append('content', newPost);
      if (image) fd.append('image', image);
      await apiFetch('/api/posts', { method: 'POST', body: fd }); 
      navigate('/'); // Nach dem Posten zurück zur Startseite
    } catch(err) { alert("Fehler beim Posten: " + err.message) }
    finally { setPosting(false); }
  };

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Neuen Post erstellen</h1>
      <form onSubmit={submit} className="bg-dark-200 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-dark-100 shadow-lg">
        <textarea
          value={newPost}
          onChange={e => setNewPost(e.target.value)}
          className="w-full bg-dark-100 text-white p-3 sm:p-4 rounded-xl outline-none resize-none border border-dark-100 focus:border-red-500 text-sm sm:text-base"
          placeholder="Was sind deine Sneaker des Tages?"
          rows={4}
        />
        {image && (
          <div className="mt-3 sm:mt-4 relative inline-block">
            <img src={URL.createObjectURL(image)} alt="Preview" className="h-24 sm:h-32 rounded-lg object-cover border border-dark-100" />
            <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 bg-red-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center font-bold shadow-md text-sm">×</button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mt-4 sm:mt-6 pt-4 border-t border-dark-100">
          <label className="flex items-center gap-2 text-gray-400 hover:text-red-400 cursor-pointer transition">
            <span className="text-xl">📷</span>
            <span className="font-medium text-sm sm:text-base">Foto hinzufügen</span>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="hidden" />
          </label>
          <div className="flex gap-2 sm:gap-3">
            <button type="button" onClick={() => navigate('/')} className="flex-1 sm:flex-none bg-dark-100 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold hover:bg-dark-300 transition text-sm sm:text-base">Abbrechen</button>
            <button disabled={posting || (!newPost.trim() && !image)} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-2.5 rounded-xl font-bold transition disabled:opacity-50 shadow-md text-sm sm:text-base">
              {posting ? 'Postet...' : 'Posten'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// --- SEARCH PAGE ---
function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState({ users: [], posts: [] });
  const [loading, setLoading] = useState(false);
  const apiFetch = useApi();

  useEffect(() => {
    if (!query.trim()) return;
    const search = async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    search();
  }, [query]);

  const loadPosts = async () => {
    try {
      const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch (e) { console.error(e); }
  };

  if (!query.trim()) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center bg-dark-200 p-10 rounded-2xl border border-dark-100">
          <span className="text-5xl">🔍</span>
          <p className="text-gray-400 mt-4 font-medium">Gib einen Suchbegriff ein</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">Suchergebnisse für "{query}"</h1>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Suche...</div>
      ) : (
        <>
          {/* Users */}
          {results.users.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold text-white mb-4">Benutzer ({results.users.length})</h2>
              <div className="space-y-3">
                {results.users.map(user => (
                  <Link key={user.id} to={`/profile/${user.username}`} className="flex items-center gap-4 bg-dark-200 p-4 rounded-xl border border-dark-100 hover:border-red-500 transition">
                    <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                      {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{user.username[0].toUpperCase()}</span>}
                    </div>
                    <div>
                      <p className="text-white font-bold">{user.display_name || user.username}</p>
                      <p className="text-red-500 text-sm">@{user.username}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Posts */}
          {results.posts.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Posts ({results.posts.length})</h2>
              {results.posts.map(p => <Post key={p.id} post={p} onRefresh={loadPosts} />)}
            </div>
          )}

          {results.users.length === 0 && results.posts.length === 0 && (
            <div className="text-center bg-dark-200 p-10 rounded-2xl border border-dark-100">
              <span className="text-5xl">😕</span>
              <p className="text-gray-400 mt-4 font-medium">Keine Ergebnisse gefunden</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Infinite-Scroll Hook ---
const PAGE_SIZE = 20;
function useInfiniteList(buildUrl, deps = []) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const apiFetch = useApi();
  const sentinelRef = useRef(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(buildUrl(0, PAGE_SIZE));
      setItems(data);
      setOffset(data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, deps);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const data = await apiFetch(buildUrl(offset, PAGE_SIZE));
      setItems(prev => [...prev, ...data]);
      setOffset(prev => prev + data.length);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [offset, hasMore, loading]);

  return { items, setItems, loading, hasMore, sentinelRef, reload };
}

// --- STORIES ---
function StoryBar() {
  const apiFetch = useApi();
  const { user } = useAuth();
  const [stories, setStories] = useState([]);
  const [viewerIdx, setViewerIdx] = useState(null);
  const fileRef = useRef(null);

  const load = () => apiFetch('/api/stories').then(setStories).catch(() => {});
  useEffect(() => { load() }, []);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const caption = prompt('Beschriftung (optional):') || '';
    const fd = new FormData();
    fd.append('image', file);
    fd.append('caption', caption);
    try { await apiFetch('/api/stories', { method: 'POST', body: fd }); load(); }
    catch (err) { alert('Fehler'); }
    e.target.value = '';
  };

  const hasOwn = stories.length > 0 && stories[0].user_id === user?.id;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        {/* Own tile: click = view (if exists), separate + button uploads */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 relative">
          <button
            onClick={() => hasOwn ? setViewerIdx(0) : fileRef.current?.click()}
            className="group"
          >
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${hasOwn ? 'p-0.5 bg-gradient-to-tr from-red-500 via-pink-500 to-yellow-500' : 'border-2 border-dashed border-gray-500 group-hover:border-red-500 transition flex items-center justify-center bg-dark-100'}`}>
              {hasOwn ? (
                <div className="w-full h-full rounded-full bg-dark-100 p-0.5">
                  <img src={getImageUrl(stories[0].stories[0].image)} className="w-full h-full object-cover rounded-full" />
                </div>
              ) : (
                <span className="text-2xl text-gray-400">+</span>
              )}
            </div>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute top-12 sm:top-14 right-0 w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-sm border-2 border-dark-200 transition"
            title="Neue Story hochladen"
          >+</button>
          <span className="text-xs text-gray-400 truncate max-w-[80px]">Deine Story</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />

        {stories.filter(s => s.user_id !== user?.id).map((s, i) => {
          const allViewed = s.stories.every(st => st.viewed);
          const realIdx = stories.findIndex(x => x.user_id === s.user_id);
          return (
            <button key={s.user_id} onClick={() => setViewerIdx(realIdx)} className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
              <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 ${allViewed ? 'bg-gray-600' : 'bg-gradient-to-tr from-red-500 via-pink-500 to-yellow-500'}`}>
                <div className="w-full h-full rounded-full bg-dark-100 p-0.5">
                  {s.avatar ? <img src={getImageUrl(s.avatar)} className="w-full h-full object-cover rounded-full" /> : <div className="w-full h-full rounded-full bg-red-950 flex items-center justify-center text-red-400 font-bold">{s.username[0].toUpperCase()}</div>}
                </div>
              </div>
              <span className="text-xs text-gray-400 truncate max-w-[80px]">{s.username}</span>
            </button>
          );
        })}
      </div>
      {viewerIdx !== null && (
        <StoryViewer
          userStories={stories}
          startUserIdx={viewerIdx}
          onClose={() => { setViewerIdx(null); load(); }}
        />
      )}
    </>
  );
}

function StoryViewer({ userStories, startUserIdx, onClose }) {
  const apiFetch = useApi();
  const { user } = useAuth();
  const [userIdx, setUserIdx] = useState(startUserIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState(null);
  const DURATION = 5000;

  const current = userStories[userIdx];
  const story = current?.stories[storyIdx];
  const isOwn = current?.user_id === user?.id;

  useEffect(() => {
    if (!story) return;
    apiFetch(`/api/stories/${story.id}/view`, { method: 'POST' }).catch(() => {});
    setProgress(0);
    setViewers(null);
    const start = Date.now();
    const iv = setInterval(() => {
      const p = (Date.now() - start) / DURATION;
      if (p >= 1) { clearInterval(iv); next(); }
      else setProgress(p);
    }, 50);
    return () => clearInterval(iv);
  }, [userIdx, storyIdx]);

  const next = () => {
    if (!current) return;
    if (storyIdx < current.stories.length - 1) setStoryIdx(storyIdx + 1);
    else if (userIdx < userStories.length - 1) { setUserIdx(userIdx + 1); setStoryIdx(0); }
    else onClose();
  };
  const prev = () => {
    if (storyIdx > 0) setStoryIdx(storyIdx - 1);
    else if (userIdx > 0) {
      const prevUser = userStories[userIdx - 1];
      setUserIdx(userIdx - 1);
      setStoryIdx(prevUser.stories.length - 1);
    }
  };

  const loadViewers = async () => {
    try { setViewers(await apiFetch(`/api/stories/${story.id}/viewers`)); } catch {}
  };

  const deleteStory = async () => {
    if (!confirm('Story löschen?')) return;
    try { await apiFetch(`/api/stories/${story.id}`, { method: 'DELETE' }); onClose(); }
    catch { alert('Fehler'); }
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="relative w-full h-full sm:max-w-md sm:max-h-[90vh] bg-black sm:rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Progress bars */}
        <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
          {current.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-[width]" style={{ width: i < storyIdx ? '100%' : i === storyIdx ? `${progress * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        {/* Header */}
        <div className="absolute top-6 left-2 right-2 flex items-center gap-2 z-10">
          <div className="w-8 h-8 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
            {current.avatar ? <img src={getImageUrl(current.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-xs font-bold">{current.username[0].toUpperCase()}</span>}
          </div>
          <span className="text-white text-sm font-bold flex-1 truncate">{current.display_name || current.username}</span>
          <span className="text-white/60 text-xs">{new Date(story.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
          {isOwn && <button onClick={deleteStory} className="text-white/80 hover:text-red-400 text-lg">🗑️</button>}
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl">×</button>
        </div>
        {/* Image */}
        <img src={getImageUrl(story.image)} className="w-full h-full object-contain" />
        {/* Caption */}
        {story.caption && <p className="absolute bottom-16 left-4 right-4 text-white text-center drop-shadow-lg bg-black/40 rounded-lg p-2 text-sm">{story.caption}</p>}
        {/* Tap zones */}
        <button onClick={prev} className="absolute top-16 bottom-12 left-0 w-1/3" aria-label="Previous" />
        <button onClick={next} className="absolute top-16 bottom-12 right-0 w-1/3" aria-label="Next" />
        {/* Own viewers footer */}
        {isOwn && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-3">
            {viewers === null ? (
              <button onClick={loadViewers} className="text-white/70 text-xs hover:text-white">👁 Betrachter anzeigen</button>
            ) : (
              <div>
                <p className="text-white text-xs mb-2">👁 {viewers.length} Betrachter</p>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {viewers.map(v => (
                    <div key={v.id} title={v.username} className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-white/20">
                      {v.avatar ? <img src={getImageUrl(v.avatar)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-red-950 flex items-center justify-center text-[10px] text-red-400 font-bold">{v.username[0].toUpperCase()}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- HOME PAGE (Nur noch Feed) ---
function HomePage() {
  const { items: posts, loading, hasMore, sentinelRef, reload } = useInfiniteList(
    (offset, limit) => `/api/posts?offset=${offset}&limit=${limit}`
  );

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <StoryBar />
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">Dein Feed</h2>
      {!loading && posts.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl sm:rounded-2xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">👀</span>
          <p className="text-gray-400 mt-3 sm:mt-4 font-medium text-sm sm:text-base">Noch keine Posts vorhanden.<br/>Sei der Erste!</p>
          <button onClick={() => window.location.href='/create-post'} className="mt-4 bg-red-600 text-white px-5 sm:px-6 py-2 rounded-lg font-bold text-sm sm:text-base">Jetzt posten</button>
        </div>
      ) : (
        <>
          {posts.map(p => <Post key={p.id} post={p} onRefresh={reload} />)}
          {hasMore && <div ref={sentinelRef} className="h-10" />}
          {loading && <div className="text-center text-gray-500 text-sm py-4">Lade...</div>}
          {!hasMore && posts.length > 0 && <div className="text-center text-gray-600 text-xs py-4">— Ende —</div>}
        </>
      )}
    </div>
  )
}

function DataExportBox() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(null);
  const download = async (format) => {
    setLoading(format);
    try {
      const res = await fetch(`${API_URL}/api/profile/export${format === 'zip' ? '/zip' : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Fehler');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match ? match[1] : (format === 'zip' ? 'export.zip' : 'export.json');
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Export fehlgeschlagen'); }
    finally { setLoading(null); }
  };
  return (
    <div className="bg-dark-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-dark-100 mb-4 sm:mb-8 shadow-lg">
      <h2 className="text-xl font-bold text-white mb-2">Daten-Export (DSGVO)</h2>
      <p className="text-gray-400 text-sm mb-4">Lade alle deine Daten herunter – dein Profil, Posts, Kommentare, Nachrichten, Galerie etc.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={() => download('json')} disabled={loading} className="bg-dark-100 hover:bg-dark-300 text-white px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50">
          {loading === 'json' ? 'Lade...' : '📄 Als JSON'}
        </button>
        <button onClick={() => download('zip')} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50">
          {loading === 'zip' ? 'Lade...' : '🗄️ Als ZIP (inkl. Bilder)'}
        </button>
      </div>
    </div>
  );
}

// --- PROFILE PAGE ---
const PROFILE_OPTS = {
  age: ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65+'],
  height: ['150','155','160','165','170','175','180','185','190','195','200','205','210+'],
  weight: ['45–55','55–65','65–75','75–85','85–95','95–105','105–115','115+'],
  body_type: ['Schlank','Normal','Sportlich','Muskulös','Kräftig','Mollig'],
  look_type: ['Bär','Twink','Otter','Daddy','Jock','Cub','Normal','Anderes'],
  body_hair: ['Glatt','Wenig','Mittel','Behaart','Sehr behaart'],
  orientation: ['Gay','Bisexuell','Hetero','Lesbisch','Queer','Pansexuell','Asexuell'],
  smoker: ['Nein','Gelegentlich','Ja'],
  relationship: ['Single','In Beziehung','Offen','Verheiratet','Getrennt'],
};
const ALL_LANGUAGES = ['Deutsch','Englisch','Spanisch','Französisch','Italienisch','Türkisch','Arabisch','Russisch','Polnisch','Niederländisch','Portugiesisch','Japanisch','Chinesisch'];

function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editAvatar, setEditAvatar] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [externalLinkModal, setExternalLinkModal] = useState(null);
  const [visitors, setVisitors] = useState([]);
  const [stats, setStats] = useState(null);
  const galleryInputRef = useRef(null);
  const apiFetch = useApi();

  const isOwnProfile = !!profile && !!currentUser && (currentUser.id === profile.id);

  const loadData = async () => {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const resolvedId = isUUID ? id : (await apiFetch(`/api/users/by-username/${id}`)).id;
      if (!resolvedId) return;
      const isOwn = currentUser?.id === resolvedId;
      const requests = [
        apiFetch(`/api/users/${resolvedId}`),
        apiFetch(`/api/users/${resolvedId}/posts`),
        apiFetch(`/api/users/${resolvedId}/gallery`),
        apiFetch(`/api/users/${resolvedId}/stats`),
      ];
      if (isOwn) requests.push(apiFetch('/api/profile/visitors'));
      const [pData, pPosts, pGallery, pStats, pVisitors] = await Promise.all(requests);
      setProfile(pData);
      setPosts(pPosts);
      setGallery(pGallery);
      setStats(pStats);
      if (isOwn) setVisitors(pVisitors || []);
      setEditForm(pData);
      setIsFollowing(pData.is_following || false);
      setFollowerCount(pData.follower_count || 0);
      setFollowingCount(pData.following_count || 0);
    } catch(e) { console.error(e) }
  };

  const toggleLanguage = (lang) => {
    const current = (editForm.languages || '').split(',').filter(Boolean);
    const idx = current.indexOf(lang);
    if (idx >= 0) current.splice(idx, 1); else current.push(lang);
    setEditForm({ ...editForm, languages: current.join(',') });
  };

  const handleGalleryUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const item = await apiFetch('/api/profile/gallery', { method: 'POST', body: fd });
      setGallery(prev => [...prev, item]);
    } catch (err) { alert(err.message); }
    e.target.value = '';
  };

  const handleGalleryDelete = async (itemId) => {
    try {
      await apiFetch(`/api/profile/gallery/${itemId}`, { method: 'DELETE' });
      setGallery(prev => prev.filter(g => g.id !== itemId));
    } catch (err) { alert(err.message); }
  };

  useEffect(() => { loadData() }, [id]);

  const handleFollow = async () => {
    if (!profile) return;
    try {
      const res = await apiFetch(`/api/users/${profile.id}/follow`, { method: 'POST' });
      setIsFollowing(res.following);
      setFollowerCount(prev => res.following ? prev + 1 : prev - 1);
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!profile) return;
    try {
      const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ user_id: profile.id }) });
      navigate(`/messages/${conv.id}`);
    } catch (e) { console.error(e); }
  };

  const loadFollowers = async () => {
    if (!profile) return;
    try {
      const data = await apiFetch(`/api/users/${profile.id}/followers`);
      setFollowersList(data);
      setShowFollowersModal(true);
    } catch (e) { console.error(e); }
  };

  const loadFollowing = async () => {
    if (!profile) return;
    try {
      const data = await apiFetch(`/api/users/${profile.id}/following`);
      setFollowingList(data);
      setShowFollowingModal(true);
    } catch (e) { console.error(e); }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      const fields = ['display_name', 'bio', 'location', 'website', 'favorite_sneakers', 'favorite_socks', 'sneaker_size', 'sock_size', 'favorite_brands', 'age', 'height', 'weight', 'body_type', 'look_type', 'body_hair', 'orientation', 'smoker', 'languages', 'relationship'];
      fields.forEach(k => { if (editForm[k] !== null && editForm[k] !== undefined) fd.append(k, editForm[k]); });
      if (editAvatar) fd.append('avatar', editAvatar);
      
      const updated = await apiFetch(`/api/users/${profile.id}`, { method: 'PUT', body: fd });
      setProfile(updated);
      if (isOwnProfile) updateUser(updated);
      setEditing(false);
      setEditAvatar(null);
      loadData();
    } catch (err) { alert("Fehler: " + err.message); }
  };

  if (!profile) return <div className="text-white p-10 text-center">Lade Profil...</div>;

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 py-4 sm:py-8">
      <div className="bg-dark-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-dark-100 mb-4 sm:mb-8 shadow-lg">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 text-center sm:text-left">
          {/* Avatar */}
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-red-950 flex-shrink-0 flex items-center justify-center overflow-hidden border-4 border-dark-100 shadow-xl relative">
            {profile.avatar ? <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-4xl sm:text-5xl font-bold">{profile.username[0].toUpperCase()}</span>}
          </div>
          <div className="flex-1 w-full min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{profile.display_name || profile.username}</h1>
            <p className="text-red-500 font-medium text-base sm:text-lg">@{profile.username}</p>
            {profile.bio && <p className="text-gray-300 mt-3 sm:mt-4 italic text-sm sm:text-base">"{profile.bio}"</p>}

            <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-4 mt-4 sm:mt-6 text-xs sm:text-sm text-gray-400 bg-dark-100 p-3 sm:p-4 rounded-xl">
              {profile.location && <span className="flex items-center gap-1">📍 <strong className="text-white">{profile.location}</strong></span>}
              {profile.website && <span className="flex items-center gap-1 max-w-full overflow-hidden">🔗 <button onClick={() => setExternalLinkModal(profile.website)} className="text-red-400 hover:underline text-left truncate">{profile.website}</button></span>}
              <span className="flex items-center gap-1">📝 <strong className="text-white">{posts.length}</strong> Posts</span>
              <button onClick={loadFollowers} className="flex items-center gap-1 hover:text-white transition cursor-pointer">
                👥 <strong className="text-white">{followerCount}</strong> Follower
              </button>
              <button onClick={loadFollowing} className="flex items-center gap-1 hover:text-white transition cursor-pointer">
                ➡️ <strong className="text-white">{followingCount}</strong> Following
              </button>
            </div>
            
            {(profile.favorite_sneakers || profile.sneaker_size || profile.favorite_brands) && (
              <div className="mt-5 flex flex-wrap justify-center sm:justify-start gap-2">
                {profile.favorite_sneakers && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">👟 {profile.favorite_sneakers}</span>}
                {profile.sneaker_size && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">📏 {profile.sneaker_size}</span>}
                {profile.favorite_brands && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">🏷️ {profile.favorite_brands}</span>}
              </div>
            )}

            {(profile.age || profile.height || profile.weight || profile.body_type || profile.look_type || profile.body_hair || profile.orientation || profile.smoker || profile.languages || profile.relationship) && (
              <div className="mt-5 bg-dark-100 rounded-xl p-4 border border-dark-300">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Persönliche Angaben</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {profile.age && <div className="flex justify-between"><span className="text-gray-500">Alter</span><span className="text-white font-medium">{profile.age}</span></div>}
                  {profile.height && <div className="flex justify-between"><span className="text-gray-500">Größe</span><span className="text-white font-medium">{profile.height} cm</span></div>}
                  {profile.weight && <div className="flex justify-between"><span className="text-gray-500">Gewicht</span><span className="text-white font-medium">{profile.weight} kg</span></div>}
                  {profile.body_type && <div className="flex justify-between"><span className="text-gray-500">Statur</span><span className="text-white font-medium">{profile.body_type}</span></div>}
                  {profile.look_type && <div className="flex justify-between"><span className="text-gray-500">Typ</span><span className="text-white font-medium">{profile.look_type}</span></div>}
                  {profile.body_hair && <div className="flex justify-between"><span className="text-gray-500">Körperbehaarung</span><span className="text-white font-medium">{profile.body_hair}</span></div>}
                  {profile.orientation && <div className="flex justify-between"><span className="text-gray-500">Ich bin</span><span className="text-white font-medium">{profile.orientation}</span></div>}
                  {profile.smoker && <div className="flex justify-between"><span className="text-gray-500">Raucher</span><span className="text-white font-medium">{profile.smoker}</span></div>}
                  {profile.relationship && <div className="flex justify-between"><span className="text-gray-500">Beziehung</span><span className="text-white font-medium">{profile.relationship}</span></div>}
                  {profile.languages && (
                    <div className="col-span-2 flex flex-wrap gap-1.5 mt-1">
                      <span className="text-gray-500 text-sm mr-1">Sprachen</span>
                      {profile.languages.split(',').filter(Boolean).map(l => (
                        <span key={l} className="px-2 py-0.5 bg-dark-300 rounded-full text-xs text-gray-300 font-medium">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isOwnProfile && !editing && (
              <button onClick={() => setEditing(true)} className="mt-6 w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition shadow-md">Profil bearbeiten</button>
            )}
            {!isOwnProfile && (
              <div className="mt-6 flex flex-wrap gap-3 justify-center sm:justify-start">
                <button onClick={handleFollow} className={`px-6 py-2.5 rounded-xl font-bold transition shadow-md ${isFollowing ? 'bg-dark-100 hover:bg-dark-300 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {isFollowing ? 'Entfolgen' : 'Folgen'}
                </button>
                <button onClick={handleSendMessage} className="px-6 py-2.5 bg-dark-100 hover:bg-dark-300 text-white rounded-xl font-bold transition shadow-md">
                  ✉️ Nachricht
                </button>
              </div>
            )}
          </div>
        </div>

        {editing && (
          <form onSubmit={handleEditSubmit} className="mt-8 pt-8 border-t border-dark-100">
            <h3 className="text-white font-bold text-xl mb-6">Profil anpassen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Anzeigename</label>
                {/* ÄNDERUNG: Blau-Fokus-Rand zu Rot-Fokus gewechselt */}
                <input type="text" value={editForm.display_name || ''} onChange={e => setEditForm({...editForm, display_name: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Standort</label>
                <input type="text" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Bio</label>
                <textarea value={editForm.bio || ''} onChange={e => setEditForm({...editForm, bio: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" rows={3} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Website URL</label>
                <input type="url" value={editForm.website || ''} onChange={e => setEditForm({...editForm, website: e.target.value})} placeholder="Bitte https:// angeben" className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none placeholder:text-gray-600" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Lieblings Sneaker</label>
                <input type="text" value={editForm.favorite_sneakers || ''} onChange={e => setEditForm({...editForm, favorite_sneakers: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Sneaker Größe</label>
                <input type="text" value={editForm.sneaker_size || ''} onChange={e => setEditForm({...editForm, sneaker_size: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Lieblings Marken</label>
                <input type="text" value={editForm.favorite_brands || ''} onChange={e => setEditForm({...editForm, favorite_brands: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none" />
              </div>
              <div className="sm:col-span-2 mt-2 bg-dark-100 p-4 rounded-xl border border-dark-100">
                <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Profilbild ändern</label>
                <div className="flex items-center gap-6">
                  {/* ÄNDERUNG: Blau-Button zu Rot-Button gewechselt */}
                  <input type="file" accept="image/*" onChange={e => setEditAvatar(e.target.files[0])} className="text-sm text-gray-300 file:mr-4 file:py-2.5 file:px-5 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-red-600 file:text-white hover:file:bg-red-700 cursor-pointer" />
                  {/* ÄNDERUNG: Blau-Rand zu Rot-Rand gewechselt */}
                  {editAvatar && <img src={URL.createObjectURL(editAvatar)} className="w-16 h-16 rounded-full object-cover border-2 border-red-500 shadow-lg" />}
                </div>
              </div>
            </div>
            {/* Persönliche Angaben */}
            <div className="mt-6 pt-6 border-t border-dark-300">
              <h4 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Persönliche Angaben</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'age', label: 'Alter', suffix: 'Jahre' },
                  { key: 'height', label: 'Größe', suffix: 'cm' },
                  { key: 'weight', label: 'Gewicht', suffix: 'kg' },
                  { key: 'body_type', label: 'Statur', suffix: '' },
                  { key: 'look_type', label: 'Typ', suffix: '' },
                  { key: 'body_hair', label: 'Körperbehaarung', suffix: '' },
                  { key: 'orientation', label: 'Ich bin', suffix: '' },
                  { key: 'smoker', label: 'Raucher', suffix: '' },
                  { key: 'relationship', label: 'Beziehung', suffix: '' },
                ].map(({ key, label, suffix }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>
                    <select value={editForm[key] || ''} onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-red-500 outline-none">
                      <option value="">– keine Angabe –</option>
                      {PROFILE_OPTS[key].map(v => <option key={v} value={v}>{v}{suffix ? ` ${suffix}` : ''}</option>)}
                    </select>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Sprachen</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_LANGUAGES.map(lang => {
                      const selected = (editForm.languages || '').split(',').filter(Boolean).includes(lang);
                      return (
                        <button key={lang} type="button" onClick={() => toggleLanguage(lang)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${selected ? 'bg-red-600 text-white' : 'bg-dark-100 text-gray-400 hover:text-white'}`}>
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              {/* ÄNDERUNG: Blau-Button zu Rot-Button gewechselt */}
              <button type="submit" className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-bold transition shadow-md">Speichern</button>
              <button type="button" onClick={() => {setEditing(false); setEditForm(profile); setEditAvatar(null);}} className="w-full sm:w-auto bg-dark-100 hover:bg-dark-300 border border-dark-100 text-white px-8 py-3 rounded-xl font-bold transition">Abbrechen</button>
            </div>
          </form>
        )}
      </div>

      {/* Profil-Galerie */}
      {(gallery.length > 0 || isOwnProfile) && (
        <div className="bg-dark-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-dark-100 mb-4 sm:mb-8 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Galerie</h2>
            {isOwnProfile && (
              <>
                <button onClick={() => galleryInputRef.current?.click()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-xl font-bold transition">+ Bild hinzufügen</button>
                <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryUpload} />
              </>
            )}
          </div>
          {gallery.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Noch keine Bilder in der Galerie.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {gallery.map(item => (
                <div key={item.id} className="relative group aspect-square overflow-hidden rounded-xl bg-dark-100 cursor-pointer" onClick={() => setLightbox(item.image)}>
                  <img src={getImageUrl(item.image)} className="w-full h-full object-cover transition group-hover:scale-105" />
                  {isOwnProfile && (
                    <button onClick={e => { e.stopPropagation(); handleGalleryDelete(item.id); }} className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/70 hover:bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center">×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-red-400 transition">×</button>
          <img src={getImageUrl(lightbox)} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Profil-Statistiken */}
      {stats && (
        <div className="bg-dark-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-dark-100 mb-4 sm:mb-8 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Statistiken</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: 'Posts', value: stats.posts, icon: '📝' },
              { label: 'Follower', value: stats.followers, icon: '👥' },
              { label: 'Following', value: stats.following, icon: '➡️' },
              { label: 'Likes', value: stats.likes_received, icon: '❤️' },
              { label: 'Kommentare', value: stats.comments_received, icon: '💬' },
              { label: 'Reaktionen', value: stats.reactions_received, icon: '🔥' },
              { label: 'Topics', value: stats.forum_topics, icon: '📌' },
              { label: 'Replies', value: stats.forum_replies, icon: '↩️' },
              { label: 'Profilaufrufe', value: stats.profile_views, icon: '👁️' },
            ].map(s => (
              <div key={s.label} className="bg-dark-100 rounded-xl p-3 text-center">
                <div className="text-lg sm:text-xl mb-1">{s.icon}</div>
                <div className="text-lg sm:text-2xl font-bold text-white">{s.value}</div>
                <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
          {stats.member_since && (
            <p className="text-xs text-gray-500 text-center mt-4">
              Mitglied seit {new Date(stats.member_since).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Profilbesucher – nur auf eigenem Profil */}
      {isOwnProfile && (
        <div className="bg-dark-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-dark-100 mb-4 sm:mb-8 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-4">Profilbesucher <span className="text-sm font-normal text-gray-500">(letzte 30)</span></h2>
          {visitors.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Noch keine Besucher.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {visitors.map(v => (
                <a key={v.id} href={`/profile/${v.username}`} className="flex flex-col items-center gap-1.5 group" title={v.display_name || v.username}>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-dark-100 group-hover:border-red-500 transition">
                    {v.avatar
                      ? <img src={getImageUrl(v.avatar)} className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-dark-300 flex items-center justify-center text-lg font-bold text-gray-400">{(v.display_name || v.username)[0].toUpperCase()}</div>
                    }
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-white transition truncate w-full text-center">{v.display_name || v.username}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Daten-Export (DSGVO) – nur auf eigenem Profil */}
      {isOwnProfile && <DataExportBox />}

      <h2 className="text-2xl font-bold text-white mb-6 pl-2">Posts von {profile.display_name || profile.username}</h2>
      {posts.length === 0 ? <div className="text-center bg-dark-200 p-8 rounded-2xl border border-dark-100"><p className="text-gray-400 font-medium">Keine Posts vorhanden.</p></div> : posts.map(p => <Post key={p.id} post={p} onRefresh={loadData} />)}

      {/* Followers Modal */}
      {showFollowersModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowFollowersModal(false)}>
          <div className="bg-dark-200 rounded-2xl border border-dark-100 w-full max-w-md max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-dark-100">
              <h3 className="text-white font-bold text-lg">Follower</h3>
              <button onClick={() => setShowFollowersModal(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {followersList.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Noch keine Follower</p>
              ) : (
                <div className="space-y-3">
                  {followersList.map(u => (
                    <Link key={u.id} to={`/profile/${u.username}`} onClick={() => setShowFollowersModal(false)} className="flex items-center gap-3 p-3 bg-dark-100 rounded-xl hover:bg-dark-300 transition">
                      <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                        {u.avatar ? <img src={getImageUrl(u.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{u.username[0].toUpperCase()}</span>}
                      </div>
                      <div>
                        <p className="text-white font-bold">{u.display_name || u.username}</p>
                        <p className="text-red-500 text-sm">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Following Modal */}
      {showFollowingModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowFollowingModal(false)}>
          <div className="bg-dark-200 rounded-2xl border border-dark-100 w-full max-w-md max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-dark-100">
              <h3 className="text-white font-bold text-lg">Folge ich</h3>
              <button onClick={() => setShowFollowingModal(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {followingList.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Folgt niemandem</p>
              ) : (
                <div className="space-y-3">
                  {followingList.map(u => (
                    <Link key={u.id} to={`/profile/${u.username}`} onClick={() => setShowFollowingModal(false)} className="flex items-center gap-3 p-3 bg-dark-100 rounded-xl hover:bg-dark-300 transition">
                      <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                        {u.avatar ? <img src={getImageUrl(u.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{u.username[0].toUpperCase()}</span>}
                      </div>
                      <div>
                        <p className="text-white font-bold">{u.display_name || u.username}</p>
                        <p className="text-red-500 text-sm">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* External Link Warning Modal */}
      {externalLinkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setExternalLinkModal(null)}>
          <div className="bg-dark-200 rounded-2xl border border-dark-100 w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-dark-100">
              <h3 className="text-white font-bold text-lg">Externe Seite</h3>
              <button onClick={() => setExternalLinkModal(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-dark-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dark-100">
                <span className="text-3xl">🔗</span>
              </div>
              <p className="text-white font-bold text-lg mb-2">Du verlässt Sneaks & Socks</p>
              <p className="text-gray-400 text-sm mb-4">
                Du wirst zu einer externen Seite weitergeleitet. Wir sind nicht verantwortlich für die Inhalte auf dieser Seite.
              </p>
              <p className="text-gray-500 text-xs bg-dark-100 p-3 rounded-xl break-all mb-6">
                {externalLinkModal}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setExternalLinkModal(null)}
                  className="flex-1 bg-dark-100 hover:bg-dark-300 text-white px-6 py-3 rounded-xl font-bold transition"
                >
                  Abbrechen
                </button>
                <a
                  href={externalLinkModal}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setExternalLinkModal(null)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition text-center"
                >
                  Weiter zur Seite
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- MESSAGES PAGE ---
function MessagesPage() {
  const [activeTab, setActiveTab] = useState('conversations');
  const [conversations, setConversations] = useState([]);
  const [inboxMessages, setInboxMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);
  const [archivedMessages, setArchivedMessages] = useState([]);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const apiFetch = useApi();

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'conversations') {
        const data = await apiFetch('/api/conversations');
        setConversations(data);
      } else if (activeTab === 'inbox') {
        const data = await apiFetch('/api/messages/inbox');
        setInboxMessages(data);
      } else if (activeTab === 'sent') {
        const data = await apiFetch('/api/messages/sent');
        setSentMessages(data);
      } else if (activeTab === 'archived') {
        const data = await apiFetch('/api/messages/archived');
        setArchivedMessages(data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); setSelectedMessages([]); }, [activeTab]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
      setSearchResults(data.users || []);
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  };

  const startConversation = async (userId) => {
    try {
      const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
      navigate(`/messages/${conv.id}`);
    } catch (e) { console.error(e); }
  };

  const toggleSelect = (id) => {
    setSelectedMessages(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const archiveSelected = async () => {
    for (const id of selectedMessages) {
      await apiFetch(`/api/messages/${id}/archive`, { method: 'POST' });
    }
    setSelectedMessages([]);
    loadData();
  };

  const unarchiveSelected = async () => {
    for (const id of selectedMessages) {
      await apiFetch(`/api/messages/${id}/unarchive`, { method: 'POST' });
    }
    setSelectedMessages([]);
    loadData();
  };

  const downloadSelected = async () => {
    if (selectedMessages.length === 0) return;
    try {
      const data = await apiFetch(`/api/messages/export?ids=${selectedMessages.join(',')}`);
      const text = data.messages.map(m => `Von: ${m.von}\nDatum: ${m.datum}\n\n${m.nachricht}\n\n---\n`).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nachrichten_archiv_${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  };

  const tabs = [
    { id: 'conversations', label: 'Chats', icon: '💬' },
    { id: 'inbox', label: 'Empfangen', icon: '📥' },
    { id: 'sent', label: 'Gesendet', icon: '📤' },
    { id: 'archived', label: 'Archiv', icon: '📁' }
  ];

  const renderMessageItem = (msg, type) => {
    const isSelected = selectedMessages.includes(msg.id);
    const showCheckbox = activeTab !== 'conversations';
    const senderName = type === 'sent' ? (msg.recipient_display_name || msg.recipient_username) : (msg.sender_display_name || msg.sender_username || msg.display_name || msg.username);
    const senderAvatar = type === 'sent' ? msg.recipient_avatar : (msg.sender_avatar || msg.avatar);
    const senderUsername = type === 'sent' ? msg.recipient_username : (msg.sender_username || msg.username);

    return (
      <div key={msg.id} className={`flex items-center gap-2 sm:gap-3 bg-dark-200 p-3 sm:p-4 rounded-xl border transition ${isSelected ? 'border-red-500' : 'border-dark-100'}`}>
        {showCheckbox && (
          <button onClick={() => toggleSelect(msg.id)} className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition ${isSelected ? 'bg-red-600 border-red-600' : 'border-gray-600'}`}>
            {isSelected && <span className="text-white text-xs">✓</span>}
          </button>
        )}
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden flex-shrink-0">
          {senderAvatar ? <img src={getImageUrl(senderAvatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm">{(senderUsername || '?')[0].toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-bold text-sm truncate">{senderName}</p>
            {type === 'sent' && <span className="text-xs bg-dark-100 px-1.5 py-0.5 rounded text-gray-400">Gesendet</span>}
            {type === 'archived' && <span className="text-xs bg-dark-100 px-1.5 py-0.5 rounded text-gray-400">{msg.direction === 'sent' ? 'Gesendet' : 'Empfangen'}</span>}
          </div>
          <p className="text-gray-400 text-xs sm:text-sm truncate mt-0.5">{msg.content}</p>
        </div>
        <span className="text-gray-500 text-xs flex-shrink-0">{new Date(msg.created_at).toLocaleDateString('de-DE')}</span>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex justify-between items-center mb-4 gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Nachrichten</h1>
        <button onClick={() => setShowNewMessage(true)} className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-2 rounded-xl font-bold transition shadow-md flex items-center gap-1 sm:gap-2 text-sm">
          <span>+</span> <span className="hidden sm:inline">Neu</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-xl font-medium text-sm transition flex items-center gap-1.5 ${activeTab === tab.id ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
            <span>{tab.icon}</span> <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Action Bar */}
      {selectedMessages.length > 0 && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-dark-200 rounded-xl border border-dark-100">
          <span className="text-white text-sm">{selectedMessages.length} ausgewählt</span>
          <div className="flex-1" />
          {activeTab === 'archived' ? (
            <button onClick={unarchiveSelected} className="text-sm bg-dark-100 text-white px-3 py-1.5 rounded-lg hover:bg-dark-300 transition">Wiederherstellen</button>
          ) : (
            <button onClick={archiveSelected} className="text-sm bg-dark-100 text-white px-3 py-1.5 rounded-lg hover:bg-dark-300 transition">Archivieren</button>
          )}
          {activeTab === 'archived' && (
            <button onClick={downloadSelected} className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition">⬇ Download</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Lade...</div>
      ) : activeTab === 'conversations' ? (
        conversations.length === 0 ? (
          <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
            <span className="text-4xl">💬</span>
            <p className="text-gray-400 mt-3 font-medium text-sm">Noch keine Chats</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map(conv => (
              <Link key={conv.id} to={`/messages/${conv.id}`} className="flex items-center gap-3 bg-dark-200 p-3 sm:p-4 rounded-xl border border-dark-100 hover:border-red-500 transition">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                    {conv.other_avatar ? <img src={getImageUrl(conv.other_avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{conv.other_username[0].toUpperCase()}</span>}
                  </div>
                  {conv.unread_count > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{conv.other_display_name || conv.other_username}</p>
                  <p className="text-gray-400 text-xs truncate">{conv.last_message || 'Keine Nachrichten'}</p>
                </div>
                <span className="text-gray-500 text-xs">{new Date(conv.last_message_at).toLocaleDateString('de-DE')}</span>
              </Link>
            ))}
          </div>
        )
      ) : activeTab === 'inbox' ? (
        inboxMessages.length === 0 ? (
          <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
            <span className="text-4xl">📥</span>
            <p className="text-gray-400 mt-3 font-medium text-sm">Keine empfangenen Nachrichten</p>
          </div>
        ) : (
          <div className="space-y-2">{inboxMessages.map(msg => renderMessageItem(msg, 'inbox'))}</div>
        )
      ) : activeTab === 'sent' ? (
        sentMessages.length === 0 ? (
          <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
            <span className="text-4xl">📤</span>
            <p className="text-gray-400 mt-3 font-medium text-sm">Keine gesendeten Nachrichten</p>
          </div>
        ) : (
          <div className="space-y-2">{sentMessages.map(msg => renderMessageItem(msg, 'sent'))}</div>
        )
      ) : (
        archivedMessages.length === 0 ? (
          <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
            <span className="text-4xl">📁</span>
            <p className="text-gray-400 mt-3 font-medium text-sm">Archiv ist leer</p>
            <p className="text-gray-500 text-xs mt-1">Markiere Nachrichten und archiviere sie</p>
          </div>
        ) : (
          <div className="space-y-2">{archivedMessages.map(msg => renderMessageItem(msg, 'archived'))}</div>
        )
      )}

      {/* Neue Nachricht Modal */}
      {showNewMessage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setShowNewMessage(false); setSearchQuery(''); setSearchResults([]); }}>
          <div className="bg-dark-200 rounded-2xl border border-dark-100 w-full max-w-md max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-dark-100">
              <h3 className="text-white font-bold text-lg">Neue Nachricht</h3>
              <button onClick={() => { setShowNewMessage(false); setSearchQuery(''); setSearchResults([]); }} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} placeholder="Benutzer suchen..." className="w-full bg-dark-100 text-white p-3 pl-10 rounded-xl border border-dark-100 focus:border-red-500 outline-none" autoFocus />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
              </div>
              <div className="overflow-y-auto max-h-[50vh]">
                {searching ? <p className="text-gray-400 text-center py-4">Suche...</p>
                : searchQuery.trim() && searchResults.length === 0 ? <p className="text-gray-400 text-center py-4">Keine Benutzer gefunden</p>
                : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map(user => (
                      <button key={user.id} onClick={() => startConversation(user.id)} className="w-full flex items-center gap-3 p-3 bg-dark-100 rounded-xl hover:bg-dark-300 transition text-left">
                        <div className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                          {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{user.username[0].toUpperCase()}</span>}
                        </div>
                        <div>
                          <p className="text-white font-bold">{user.display_name || user.username}</p>
                          <p className="text-red-500 text-sm">@{user.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-gray-500 text-center py-4 text-sm">Gib einen Namen ein um Benutzer zu finden</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- CONVERSATION PAGE ---
function ConversationPage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const apiFetch = useApi();

  const loadConversation = async () => {
    try {
      const data = await apiFetch(`/api/conversations/${id}`);
      setConversation(data.conversation);
      setMessages(data.messages);
      setOtherUser(data.other_user);
      await apiFetch(`/api/conversations/${id}/read`, { method: 'PUT' });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadConversation();
    const interval = setInterval(loadConversation, 5000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/api/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage.trim() })
      });
      setMessages([...messages, msg]);
      setNewMessage('');
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto py-8 px-4 text-center text-gray-400">Lade Konversation...</div>;
  }

  if (!otherUser) {
    return <div className="max-w-2xl mx-auto py-8 px-4 text-center text-gray-400">Konversation nicht gefunden</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-2 sm:p-4 flex flex-col" style={{ height: 'calc(100dvh - 56px)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-4 bg-dark-200 p-3 sm:p-4 rounded-xl border border-dark-100 mb-2 sm:mb-4 flex-shrink-0">
        <Link to={`/profile/${otherUser.username}`} className="flex items-center gap-2 sm:gap-4 flex-1 hover:opacity-80 transition min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden flex-shrink-0">
            {otherUser.avatar ? <img src={getImageUrl(otherUser.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm sm:text-base">{otherUser.username[0].toUpperCase()}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm sm:text-base truncate">{otherUser.display_name || otherUser.username}</p>
            <p className="text-red-500 text-xs sm:text-sm truncate">@{otherUser.username}</p>
          </div>
        </Link>
        <Link to="/messages" className="text-gray-400 hover:text-white transition text-sm flex-shrink-0">← Zurück</Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-dark-200 rounded-xl border border-dark-100 p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-gray-400 text-center py-10">Schreibe die erste Nachricht!</p>
        ) : (
          messages.map(msg => {
            const isOwn = msg.sender_id === currentUser.id;
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${isOwn ? 'bg-red-600 text-white' : 'bg-dark-100 text-gray-200'}`}>
                  <p className="break-words text-sm sm:text-base">{msg.content}</p>
                  <p className={`text-xs mt-1 ${isOwn ? 'text-red-200' : 'text-gray-500'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="mt-2 sm:mt-4 flex gap-2 sm:gap-3 flex-shrink-0">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Nachricht..."
          className="flex-1 bg-dark-100 text-white p-3 sm:p-4 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm sm:text-base min-w-0"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-red-600 hover:bg-red-700 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold transition disabled:opacity-50 flex-shrink-0 text-sm sm:text-base"
        >
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  );
}

// --- FORUM PAGES ---
// --- MARKETPLACE ---
const MARKET_STATUS_LABELS = { active: 'Verfügbar', reserved: 'Reserviert', sold: 'Verkauft' };
const MARKET_STATUS_COLORS = { active: 'bg-green-600', reserved: 'bg-yellow-600', sold: 'bg-gray-500' };

function MarketPage() {
  const [meta, setMeta] = useState({ categories: [], conditions: [], statuses: [] });
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('active');
  const apiFetch = useApi();
  const navigate = useNavigate();

  useEffect(() => { apiFetch('/api/market/meta').then(setMeta).catch(() => {}); }, []);

  const { items: listings, loading, hasMore, sentinelRef } = useInfiniteList(
    (offset, limit) => {
      const parts = [`offset=${offset}`, `limit=${limit}`, `status=${status}`];
      if (category !== 'all') parts.push(`category=${category}`);
      return `/api/market/listings?${parts.join('&')}`;
    },
    [category, status]
  );

  const catInfo = (id) => meta.categories.find(c => c.id === id) || { name: id, icon: '📦' };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Marktplatz</h1>
          <p className="text-gray-500 text-xs sm:text-sm">Kaufen, verkaufen, tauschen</p>
        </div>
        <button onClick={() => navigate('/market/new')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm sm:text-base">
          <span>+</span> Neues Inserat
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        <button onClick={() => setCategory('all')} className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition ${category === 'all' ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>Alle</button>
        {meta.categories.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${category === c.id ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
            <span>{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 sm:mb-6">
        {['active', 'reserved', 'sold'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${status === s ? MARKET_STATUS_COLORS[s] + ' text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
            {MARKET_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading && listings.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Lade Inserate...</div>
      ) : listings.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">🛒</span>
          <p className="text-gray-400 mt-3 font-medium text-sm">Keine Inserate in dieser Kategorie</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {listings.map(l => (
              <Link key={l.id} to={`/market/${l.id}`} className="bg-dark-200 rounded-xl border border-dark-100 hover:border-red-500 overflow-hidden transition group">
                <div className="aspect-square bg-dark-100 relative overflow-hidden">
                  {l.images[0] ? <img src={getImageUrl(l.images[0])} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    : <div className="w-full h-full flex items-center justify-center text-5xl">{catInfo(l.category).icon}</div>}
                  <span className={`absolute top-2 right-2 text-xs font-bold text-white px-2 py-1 rounded ${MARKET_STATUS_COLORS[l.status]}`}>{MARKET_STATUS_LABELS[l.status]}</span>
                </div>
                <div className="p-2.5 sm:p-3">
                  <h3 className="text-white font-bold text-sm truncate">{l.title}</h3>
                  <p className="text-red-400 font-bold mt-1">{Number(l.price).toFixed(2)} €</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <span>{catInfo(l.category).icon}</span>
                    <span className="truncate">@{l.username}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} className="h-10 mt-4" />}
          {loading && listings.length > 0 && <div className="text-center text-gray-500 text-sm py-4">Lade...</div>}
          {!hasMore && <div className="text-center text-gray-600 text-xs py-4">— Ende —</div>}
        </>
      )}
    </div>
  );
}

function MarketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [meta, setMeta] = useState({ categories: [], conditions: [], statuses: [] });
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    apiFetch(`/api/market/listings/${id}`).then(l => { setListing(l); setImgIdx(0); }).catch(() => {});
    apiFetch('/api/market/meta').then(setMeta).catch(() => {});
  }, [id]);

  if (!listing) return <div className="text-white p-10 text-center">Lade Inserat...</div>;

  const isOwner = user?.id === listing.user_id;
  const catInfo = meta.categories.find(c => c.id === listing.category) || { name: listing.category, icon: '📦' };

  const changeStatus = async (newStatus) => {
    try {
      await apiFetch(`/api/market/listings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setListing({ ...listing, status: newStatus });
    } catch (e) { alert('Fehler'); }
  };

  const deleteListing = async () => {
    if (!confirm('Inserat wirklich löschen?')) return;
    try {
      await apiFetch(`/api/market/listings/${id}`, { method: 'DELETE' });
      navigate('/market');
    } catch (e) { alert('Fehler'); }
  };

  const contactSeller = async () => {
    try {
      const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ user_id: listing.user_id }) });
      navigate(`/messages/${conv.id}`);
    } catch (e) { alert('Fehler'); }
  };

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <button onClick={() => navigate('/market')} className="text-gray-400 hover:text-white text-sm mb-4">← Zurück</button>

      <div className="bg-dark-200 rounded-2xl border border-dark-100 overflow-hidden shadow-lg">
        {/* Image carousel */}
        <div className="aspect-square sm:aspect-video bg-dark-100 relative">
          {listing.images.length > 0 ? (
            <img src={getImageUrl(listing.images[imgIdx])} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-7xl">{catInfo.icon}</div>
          )}
          <span className={`absolute top-3 right-3 text-sm font-bold text-white px-3 py-1.5 rounded ${MARKET_STATUS_COLORS[listing.status]}`}>{MARKET_STATUS_LABELS[listing.status]}</span>
        </div>
        {listing.images.length > 1 && (
          <div className="flex gap-2 p-3 overflow-x-auto bg-dark-300">
            {listing.images.map((img, i) => (
              <button key={i} onClick={() => setImgIdx(i)} className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${i === imgIdx ? 'border-red-500' : 'border-transparent'}`}>
                <img src={getImageUrl(img)} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{listing.title}</h1>
          <p className="text-3xl sm:text-4xl font-bold text-red-400 mb-4">{Number(listing.price).toFixed(2)} €</p>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300 font-medium">{catInfo.icon} {catInfo.name}</span>
            <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300 font-medium">🏷️ {listing.condition}</span>
            {listing.size && <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300 font-medium">📏 {listing.size}</span>}
          </div>

          <p className="text-gray-300 whitespace-pre-wrap mb-6">{listing.description}</p>

          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-dark-100">
            <Link to={`/profile/${listing.username}`} className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
              {listing.avatar ? <img src={getImageUrl(listing.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{listing.username[0].toUpperCase()}</span>}
            </Link>
            <div>
              <Link to={`/profile/${listing.username}`} className="text-white font-bold hover:underline">{listing.display_name || listing.username}</Link>
              <p className="text-gray-500 text-xs">@{listing.username} · {new Date(listing.created_at).toLocaleDateString('de-DE')}</p>
            </div>
          </div>

          {isOwner ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['active', 'reserved', 'sold'].map(s => (
                  <button key={s} onClick={() => changeStatus(s)} disabled={listing.status === s}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition ${listing.status === s ? MARKET_STATUS_COLORS[s] + ' text-white opacity-60' : 'bg-dark-100 text-gray-300 hover:bg-dark-300'}`}>
                    {MARKET_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate(`/market/edit/${listing.id}`)} className="flex-1 bg-dark-100 hover:bg-dark-300 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">✏️ Bearbeiten</button>
                <button onClick={deleteListing} className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 px-4 py-2.5 rounded-xl text-sm font-bold transition">🗑️ Löschen</button>
              </div>
            </div>
          ) : (
            <button onClick={contactSeller} disabled={listing.status === 'sold'} className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-bold transition disabled:opacity-50">
              ✉️ Verkäufer kontaktieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketEditPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ categories: [], conditions: [], statuses: [] });
  const [form, setForm] = useState({ title: '', description: '', price: '', condition: 'Gebraucht', category: 'sneakers', size: '', status: 'active' });
  const [files, setFiles] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/market/meta').then(setMeta).catch(() => {});
    if (isEdit) {
      apiFetch(`/api/market/listings/${id}`).then(l => {
        setForm({ title: l.title, description: l.description, price: l.price, condition: l.condition, category: l.category, size: l.size || '', status: l.status });
        setExistingImages(l.images.map((img, i) => ({ image: img, position: i })));
      }).catch(() => {});
    }
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      files.forEach(f => fd.append('images', f));
      if (isEdit) {
        await apiFetch(`/api/market/listings/${id}`, { method: 'PUT', body: fd });
        navigate(`/market/${id}`);
      } else {
        const res = await apiFetch('/api/market/listings', { method: 'POST', body: fd });
        navigate(`/market/${res.id}`);
      }
    } catch (e) { alert('Fehler: ' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{isEdit ? 'Inserat bearbeiten' : 'Neues Inserat'}</h1>
      <form onSubmit={submit} className="bg-dark-200 rounded-2xl border border-dark-100 p-4 sm:p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Titel *</label>
          <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Preis (€) *</label>
            <input required type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Größe</label>
            <input value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="z.B. 42, M, One Size" className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Kategorie</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none">
              {meta.categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Zustand</label>
            <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none">
              {meta.conditions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {isEdit && (
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none">
              <option value="active">Verfügbar</option>
              <option value="reserved">Reserviert</option>
              <option value="sold">Verkauft</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Beschreibung *</label>
          <textarea required rows="5" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none resize-none" />
        </div>

        {existingImages.length > 0 && (
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Vorhandene Bilder</label>
            <div className="flex gap-2 flex-wrap">
              {existingImages.map((img, i) => (
                <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-dark-100">
                  <img src={getImageUrl(img.image)} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">{isEdit ? 'Weitere Bilder hinzufügen' : 'Bilder (max. 5)'}</label>
          <input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files).slice(0, 5))} className="w-full text-gray-400 text-sm" />
          {files.length > 0 && <p className="text-gray-500 text-xs mt-1">{files.length} Datei(en) ausgewählt</p>}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 bg-dark-100 hover:bg-dark-300 text-white py-3 rounded-xl font-bold transition">Abbrechen</button>
          <button type="submit" disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50">
            {loading ? 'Speichere...' : isEdit ? 'Speichern' : 'Inserat erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- EVENTS ---
function formatEventDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function eventMonthKey(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function EventsPage() {
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ types: [] });
  const [type, setType] = useState('all');
  const [past, setPast] = useState(false);

  useEffect(() => { apiFetch('/api/events/meta').then(setMeta).catch(() => {}); }, []);

  const { items: events, loading, hasMore, sentinelRef } = useInfiniteList(
    (offset, limit) => {
      const parts = [`offset=${offset}`, `limit=${limit}`, `past=${past}`];
      if (type !== 'all') parts.push(`type=${type}`);
      return `/api/events?${parts.join('&')}`;
    },
    [type, past]
  );

  const typeInfo = (id) => meta.types.find(t => t.id === id) || { name: id, icon: '📅' };

  const grouped = events.reduce((acc, e) => {
    const key = eventMonthKey(e.event_date);
    (acc[key] = acc[key] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Events</h1>
          <p className="text-gray-500 text-xs sm:text-sm">Meetups, Releases, Drops</p>
        </div>
        <button onClick={() => navigate('/events/new')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm sm:text-base">
          <span>+</span> Neues Event
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        <button onClick={() => setType('all')} className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition ${type === 'all' ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>Alle</button>
        {meta.types.map(t => (
          <button key={t.id} onClick={() => setType(t.id)} className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${type === t.id ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
            <span>{t.icon}</span> {t.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 sm:mb-6">
        <button onClick={() => setPast(false)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${!past ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>Kommend</button>
        <button onClick={() => setPast(true)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${past ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>Vergangen</button>
      </div>

      {loading && events.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Lade Events...</div>
      ) : events.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">📅</span>
          <p className="text-gray-400 mt-3 font-medium text-sm">{past ? 'Keine vergangenen Events' : 'Noch keine kommenden Events'}</p>
        </div>
      ) : (
        <>
          {Object.entries(grouped).map(([month, list]) => (
            <div key={month} className="mb-6">
              <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-3 pl-1">{month}</h2>
              <div className="space-y-2 sm:space-y-3">
                {list.map(e => (
                  <Link key={e.id} to={`/events/${e.id}`} className="block bg-dark-200 p-3 sm:p-4 rounded-xl border border-dark-100 hover:border-red-500 active:scale-[0.99] transition">
                    <div className="flex gap-3 sm:gap-4">
                      <div className="flex flex-col items-center justify-center bg-red-950 text-red-300 rounded-xl w-14 sm:w-16 py-2 flex-shrink-0">
                        <span className="text-[10px] uppercase tracking-wider">{new Date(e.event_date).toLocaleDateString('de-DE', { month: 'short' })}</span>
                        <span className="text-xl sm:text-2xl font-bold">{new Date(e.event_date).getDate()}</span>
                        <span className="text-[10px] text-red-400">{new Date(e.event_date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-dark-100 px-2 py-0.5 rounded">{typeInfo(e.type).icon} {typeInfo(e.type).name}</span>
                          {e.my_status === 'going' && <span className="text-xs bg-green-700 text-white px-2 py-0.5 rounded">✓ Dabei</span>}
                          {e.my_status === 'interested' && <span className="text-xs bg-yellow-700 text-white px-2 py-0.5 rounded">★ Interessiert</span>}
                        </div>
                        <h3 className="text-white font-bold text-sm sm:text-base truncate">{e.title}</h3>
                        {e.location && <p className="text-gray-400 text-xs mt-1 truncate">📍 {e.location}</p>}
                        <p className="text-gray-500 text-xs mt-1">👥 {e.going_count || 0} dabei · @{e.username}</p>
                      </div>
                      {e.image && <img src={getImageUrl(e.image)} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 hidden sm:block" />}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-10" />}
          {loading && events.length > 0 && <div className="text-center text-gray-500 text-sm py-4">Lade...</div>}
          {!hasMore && <div className="text-center text-gray-600 text-xs py-4">— Ende —</div>}
        </>
      )}
    </div>
  );
}

function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [meta, setMeta] = useState({ types: [] });

  const load = () => apiFetch(`/api/events/${id}`).then(setEvent).catch(() => {});
  useEffect(() => { load(); apiFetch('/api/events/meta').then(setMeta).catch(() => {}); }, [id]);

  if (!event) return <div className="text-white p-10 text-center">Lade Event...</div>;

  const isOwner = user?.id === event.user_id;
  const typeInfo = meta.types.find(t => t.id === event.type) || { name: event.type, icon: '📅' };
  const past = new Date(event.event_date) < new Date();

  const attend = async (status) => {
    try {
      const newStatus = event.my_status === status ? null : status;
      await apiFetch(`/api/events/${id}/attend`, { method: 'POST', body: JSON.stringify({ status: newStatus }) });
      load();
    } catch (e) { alert('Fehler'); }
  };

  const deleteEvent = async () => {
    if (!confirm('Event wirklich löschen?')) return;
    try { await apiFetch(`/api/events/${id}`, { method: 'DELETE' }); navigate('/events'); }
    catch (e) { alert('Fehler'); }
  };

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <button onClick={() => navigate('/events')} className="text-gray-400 hover:text-white text-sm mb-4">← Zurück</button>
      <div className="bg-dark-200 rounded-2xl border border-dark-100 overflow-hidden shadow-lg">
        {event.image && <img src={getImageUrl(event.image)} className="w-full aspect-video object-cover" />}
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs bg-dark-100 px-2 py-1 rounded">{typeInfo.icon} {typeInfo.name}</span>
            {past && <span className="text-xs bg-gray-700 text-white px-2 py-1 rounded">Vergangen</span>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">{event.title}</h1>
          <div className="bg-dark-100 rounded-xl p-3 sm:p-4 mb-4 space-y-2 text-sm">
            <p className="text-gray-300">📅 <strong className="text-white">{formatEventDate(event.event_date)}</strong></p>
            {event.location && <p className="text-gray-300">📍 <strong className="text-white">{event.location}</strong></p>}
          </div>
          {event.description && <p className="text-gray-300 whitespace-pre-wrap mb-6">{event.description}</p>}

          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-dark-100">
            <Link to={`/profile/${event.username}`} className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
              {event.avatar ? <img src={getImageUrl(event.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{event.username[0].toUpperCase()}</span>}
            </Link>
            <div>
              <p className="text-gray-500 text-xs">Erstellt von</p>
              <Link to={`/profile/${event.username}`} className="text-white font-bold hover:underline text-sm">{event.display_name || event.username}</Link>
            </div>
          </div>

          {!past && (
            <div className="flex gap-2 mb-6">
              <button onClick={() => attend('going')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition ${event.my_status === 'going' ? 'bg-green-600 text-white' : 'bg-dark-100 hover:bg-dark-300 text-white'}`}>
                {event.my_status === 'going' ? '✓ Dabei' : 'Dabei sein'}
              </button>
              <button onClick={() => attend('interested')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition ${event.my_status === 'interested' ? 'bg-yellow-600 text-white' : 'bg-dark-100 hover:bg-dark-300 text-white'}`}>
                {event.my_status === 'interested' ? '★ Interessiert' : 'Interessiert'}
              </button>
            </div>
          )}

          {isOwner && (
            <div className="flex gap-2 mb-6">
              <button onClick={() => navigate(`/events/edit/${event.id}`)} className="flex-1 bg-dark-100 hover:bg-dark-300 text-white px-4 py-2 rounded-xl text-sm font-bold transition">✏️ Bearbeiten</button>
              <button onClick={deleteEvent} className="flex-1 bg-red-950 hover:bg-red-900 text-red-300 px-4 py-2 rounded-xl text-sm font-bold transition">🗑️ Löschen</button>
            </div>
          )}

          <div>
            <h3 className="text-white font-bold mb-3">Teilnehmer ({event.going_count || 0} dabei · {event.interested_count || 0} interessiert)</h3>
            {event.attendees.length === 0 ? (
              <p className="text-gray-500 text-sm">Noch niemand angemeldet.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                {event.attendees.map(a => (
                  <Link key={a.id} to={`/profile/${a.username}`} className="flex flex-col items-center gap-1.5 group" title={`${a.display_name || a.username} – ${a.status === 'going' ? 'dabei' : 'interessiert'}`}>
                    <div className={`w-12 h-12 rounded-full overflow-hidden border-2 ${a.status === 'going' ? 'border-green-600' : 'border-yellow-600'}`}>
                      {a.avatar ? <img src={getImageUrl(a.avatar)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-dark-300 flex items-center justify-center text-sm font-bold text-gray-400">{(a.display_name || a.username)[0].toUpperCase()}</div>}
                    </div>
                    <span className="text-xs text-gray-400 truncate w-full text-center">{a.username}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventEditPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ types: [] });
  const [form, setForm] = useState({ title: '', description: '', type: 'meetup', location: '', event_date: '' });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/events/meta').then(setMeta).catch(() => {});
    if (isEdit) {
      apiFetch(`/api/events/${id}`).then(e => {
        const d = new Date(e.event_date);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setForm({ title: e.title, description: e.description, type: e.type, location: e.location || '', event_date: local });
      }).catch(() => {});
    }
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'event_date') fd.append(k, new Date(v).toISOString());
        else fd.append(k, v);
      });
      if (file) fd.append('image', file);
      if (isEdit) {
        await apiFetch(`/api/events/${id}`, { method: 'PUT', body: fd });
        navigate(`/events/${id}`);
      } else {
        const res = await apiFetch('/api/events', { method: 'POST', body: fd });
        navigate(`/events/${res.id}`);
      }
    } catch (e) { alert('Fehler: ' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{isEdit ? 'Event bearbeiten' : 'Neues Event'}</h1>
      <form onSubmit={submit} className="bg-dark-200 rounded-2xl border border-dark-100 p-4 sm:p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Titel *</label>
          <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Typ</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none">
              {meta.types.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Datum & Uhrzeit *</label>
            <input required type="datetime-local" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Ort</label>
          <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="z.B. Berlin, Hauptbahnhof" className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
        </div>

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Beschreibung</label>
          <textarea rows="5" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none resize-none" />
        </div>

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Bild</label>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} className="w-full text-gray-400 text-sm" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 bg-dark-100 hover:bg-dark-300 text-white py-3 rounded-xl font-bold transition">Abbrechen</button>
          <button type="submit" disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50">
            {loading ? 'Speichere...' : isEdit ? 'Speichern' : 'Event erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- GROUPS ---
function GroupsPage() {
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => { apiFetch('/api/groups').then(g => { setGroups(g); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const filtered = groups.filter(g => {
    if (tab === 'mine') return g.my_status === 'active';
    if (tab === 'pending') return g.my_status === 'pending';
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Gruppen</h1>
          <p className="text-gray-500 text-xs sm:text-sm">Communities zu Marken und Themen</p>
        </div>
        <button onClick={() => navigate('/groups/new')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm sm:text-base">
          <span>+</span> Neue Gruppe
        </button>
      </div>

      <div className="flex gap-2 mb-4 sm:mb-6">
        {[['all', 'Alle'], ['mine', 'Meine'], ['pending', 'Angefragt']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${tab === k ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Lade...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">👥</span>
          <p className="text-gray-400 mt-3 font-medium text-sm">Keine Gruppen in dieser Ansicht</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {filtered.map(g => (
            <Link key={g.id} to={`/groups/${g.slug}`} className="block bg-dark-200 rounded-xl border border-dark-100 hover:border-red-500 overflow-hidden transition">
              <div className="h-24 bg-dark-100 relative overflow-hidden">
                {g.cover_image ? <img src={getImageUrl(g.cover_image)} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-5xl">{g.icon}</div>}
                <span className="absolute top-2 right-2 text-xs font-bold text-white bg-black/60 px-2 py-1 rounded">{g.privacy === 'private' ? '🔒 Privat' : '🌐 Öffentlich'}</span>
                {g.my_status === 'active' && <span className="absolute top-2 left-2 text-xs font-bold text-white bg-green-600 px-2 py-1 rounded">Mitglied</span>}
                {g.my_status === 'pending' && <span className="absolute top-2 left-2 text-xs font-bold text-white bg-yellow-600 px-2 py-1 rounded">Angefragt</span>}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{g.icon}</span>
                  <h3 className="text-white font-bold truncate">{g.name}</h3>
                </div>
                <p className="text-gray-400 text-xs line-clamp-2">{g.description || 'Keine Beschreibung'}</p>
                <p className="text-gray-500 text-xs mt-2">👥 {g.member_count || 0} Mitglieder</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [newPostImage, setNewPostImage] = useState(null);

  const loadGroup = () => apiFetch(`/api/groups/${slug}`).then(setGroup).catch(() => setGroup(false));
  useEffect(() => { loadGroup() }, [slug]);

  const canSee = group && (group.privacy === 'public' || group.my_status === 'active' || user?.id === group.owner_id);
  const isMember = group?.my_status === 'active';
  const isOwnerOrAdmin = group && (user?.id === group.owner_id || group.my_role === 'admin' || group.my_role === 'owner');

  const { items: posts, loading, hasMore, sentinelRef, reload } = useInfiniteList(
    (offset, limit) => `/api/groups/${slug}/posts?offset=${offset}&limit=${limit}`,
    [slug, group?.my_status]
  );

  const loadMembers = async () => {
    try { setMembers(await apiFetch(`/api/groups/${slug}/members`)); setShowMembers(true); } catch {}
  };

  const join = async () => {
    try {
      const res = await apiFetch(`/api/groups/${slug}/join`, { method: 'POST' });
      await loadGroup();
      if (res.status === 'pending') alert('Anfrage gesendet – warte auf Freischaltung.');
    } catch (e) { alert('Fehler'); }
  };
  const leave = async () => {
    if (!confirm('Gruppe wirklich verlassen?')) return;
    try { await apiFetch(`/api/groups/${slug}/leave`, { method: 'POST' }); loadGroup(); } catch (e) { alert('Fehler'); }
  };
  const deleteGroup = async () => {
    if (!confirm('Gruppe wirklich löschen? Alle Posts gehen verloren.')) return;
    try { await apiFetch(`/api/groups/${slug}`, { method: 'DELETE' }); navigate('/groups'); } catch (e) { alert('Fehler'); }
  };
  const approveMember = async (userId) => {
    try { await apiFetch(`/api/groups/${slug}/members/${userId}/approve`, { method: 'POST' }); loadMembers(); loadGroup(); } catch (e) { alert('Fehler'); }
  };
  const removeMember = async (userId) => {
    if (!confirm('Mitglied entfernen?')) return;
    try { await apiFetch(`/api/groups/${slug}/members/${userId}`, { method: 'DELETE' }); loadMembers(); loadGroup(); } catch (e) { alert('Fehler'); }
  };

  const submitPost = async (e) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    const fd = new FormData();
    fd.append('content', newPost);
    if (newPostImage) fd.append('image', newPostImage);
    try {
      await apiFetch(`/api/groups/${slug}/posts`, { method: 'POST', body: fd });
      setNewPost(''); setNewPostImage(null);
      reload();
    } catch (e) { alert('Fehler'); }
  };

  if (group === null) return <div className="text-white p-10 text-center">Lade Gruppe...</div>;
  if (group === false) return <div className="text-white p-10 text-center">Gruppe nicht gefunden.</div>;

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <button onClick={() => navigate('/groups')} className="text-gray-400 hover:text-white text-sm mb-4">← Alle Gruppen</button>

      <div className="bg-dark-200 rounded-2xl border border-dark-100 overflow-hidden shadow-lg mb-4 sm:mb-6">
        <div className="h-32 sm:h-40 bg-dark-100 relative">
          {group.cover_image ? <img src={getImageUrl(group.cover_image)} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-7xl">{group.icon}</div>}
          <span className="absolute top-2 right-2 text-xs font-bold text-white bg-black/60 px-2 py-1 rounded">{group.privacy === 'private' ? '🔒 Privat' : '🌐 Öffentlich'}</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl">{group.icon}</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{group.name}</h1>
          </div>
          {group.description && <p className="text-gray-300 whitespace-pre-wrap mb-4">{group.description}</p>}
          <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
            <button onClick={loadMembers} className="hover:text-white">👥 {group.member_count} Mitglieder</button>
            {isOwnerOrAdmin && group.pending_count > 0 && <button onClick={loadMembers} className="text-yellow-400 hover:text-yellow-300">⏳ {group.pending_count} offen</button>}
            <Link to={`/profile/${group.owner_username}`} className="hover:text-white">Owner: @{group.owner_username}</Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {!group.my_status && <button onClick={join} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition">{group.privacy === 'private' ? 'Beitritt anfragen' : 'Beitreten'}</button>}
            {group.my_status === 'pending' && <span className="bg-yellow-700 text-white px-4 py-2 rounded-xl text-sm font-bold">⏳ Anfrage ausstehend</span>}
            {isMember && user?.id !== group.owner_id && <button onClick={leave} className="bg-dark-100 hover:bg-dark-300 text-white px-4 py-2 rounded-xl text-sm font-bold transition">Verlassen</button>}
            {isOwnerOrAdmin && <button onClick={() => navigate(`/groups/${slug}/edit`)} className="bg-dark-100 hover:bg-dark-300 text-white px-4 py-2 rounded-xl text-sm font-bold transition">✏️ Bearbeiten</button>}
            {user?.id === group.owner_id && <button onClick={deleteGroup} className="bg-red-950 hover:bg-red-900 text-red-300 px-4 py-2 rounded-xl text-sm font-bold transition">🗑️ Löschen</button>}
          </div>
        </div>
      </div>

      {/* Members modal */}
      {showMembers && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowMembers(false)}>
          <div className="bg-dark-200 rounded-2xl border border-dark-100 w-full max-w-md max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-dark-100">
              <h3 className="text-white font-bold">Mitglieder</h3>
              <button onClick={() => setShowMembers(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-2 bg-dark-100 rounded-xl">
                  <Link to={`/profile/${m.username}`} className="w-10 h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                    {m.avatar ? <img src={getImageUrl(m.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{m.username[0].toUpperCase()}</span>}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${m.username}`} className="text-white text-sm font-bold hover:underline">{m.display_name || m.username}</Link>
                    <p className="text-gray-500 text-xs">
                      {m.role === 'owner' && '👑 Owner'}
                      {m.role === 'admin' && '⭐ Admin'}
                      {m.role === 'member' && 'Mitglied'}
                      {m.status === 'pending' && ' · ⏳ Ausstehend'}
                    </p>
                  </div>
                  {isOwnerOrAdmin && m.status === 'pending' && <button onClick={() => approveMember(m.id)} className="bg-green-700 text-white px-2 py-1 rounded text-xs font-bold">✓</button>}
                  {isOwnerOrAdmin && m.id !== group.owner_id && m.id !== user?.id && <button onClick={() => removeMember(m.id)} className="bg-red-950 text-red-300 px-2 py-1 rounded text-xs font-bold">×</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!canSee ? (
        <div className="bg-dark-200 rounded-2xl border border-dark-100 p-6 text-center">
          <p className="text-gray-400 text-sm">🔒 Diese Gruppe ist privat. Tritt bei, um die Posts zu sehen.</p>
        </div>
      ) : (
        <>
          {isMember && (
            <form onSubmit={submitPost} className="bg-dark-200 rounded-2xl border border-dark-100 p-3 sm:p-4 mb-4">
              <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder={`Schreib etwas in ${group.name}...`} rows="2" className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none resize-none mb-2" />
              <div className="flex justify-between items-center">
                <input type="file" accept="image/*" onChange={e => setNewPostImage(e.target.files[0])} className="text-gray-400 text-xs" />
                <button disabled={!newPost.trim()} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition">Posten</button>
              </div>
            </form>
          )}

          {loading && posts.length === 0 ? (
            <div className="text-center text-gray-400 py-10">Lade Posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center bg-dark-200 p-6 rounded-xl border border-dark-100">
              <p className="text-gray-400 text-sm">Noch keine Posts in dieser Gruppe.</p>
            </div>
          ) : (
            <>
              {posts.map(p => <Post key={p.id} post={p} onRefresh={reload} />)}
              {hasMore && <div ref={sentinelRef} className="h-10" />}
              {loading && posts.length > 0 && <div className="text-center text-gray-500 text-sm py-4">Lade...</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroupEditPage() {
  const { slug } = useParams();
  const isEdit = !!slug;
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '', icon: '👥', privacy: 'public' });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) apiFetch(`/api/groups/${slug}`).then(g => setForm({ name: g.name, description: g.description, icon: g.icon, privacy: g.privacy })).catch(() => {});
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('cover_image', file);
      if (isEdit) {
        await apiFetch(`/api/groups/${slug}`, { method: 'PUT', body: fd });
        navigate(`/groups/${slug}`);
      } else {
        const res = await apiFetch('/api/groups', { method: 'POST', body: fd });
        navigate(`/groups/${res.slug}`);
      }
    } catch (e) { alert('Fehler: ' + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{isEdit ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</h1>
      <form onSubmit={submit} className="bg-dark-200 rounded-2xl border border-dark-100 p-4 sm:p-6 space-y-4">
        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Name *</label>
          <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Icon</label>
            <input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} maxLength="4" placeholder="👥" className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-center text-xl" />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Sichtbarkeit</label>
            <select value={form.privacy} onChange={e => setForm({ ...form, privacy: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none">
              <option value="public">🌐 Öffentlich</option>
              <option value="private">🔒 Privat (Beitritt per Anfrage)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Beschreibung</label>
          <textarea rows="4" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none resize-none" />
        </div>

        <div>
          <label className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 block">Cover-Bild</label>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} className="w-full text-gray-400 text-sm" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 bg-dark-100 hover:bg-dark-300 text-white py-3 rounded-xl font-bold transition">Abbrechen</button>
          <button type="submit" disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50">
            {loading ? 'Speichere...' : isEdit ? 'Speichern' : 'Gruppe erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ForumPage() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const apiFetch = useApi();
  const navigate = useNavigate();

  const { items: topics, loading, hasMore, sentinelRef } = useInfiniteList(
    (offset, limit) => {
      const cat = selectedCategory !== 'all' ? `&category=${selectedCategory}` : '';
      return `/api/forum/topics?offset=${offset}&limit=${limit}${cat}`;
    },
    [selectedCategory]
  );

  useEffect(() => {
    apiFetch('/api/forum/categories').then(setCategories).catch(e => console.error(e));
  }, []);

  const getCategoryInfo = (catId) => categories.find(c => c.id === catId) || { name: 'Allgemein', icon: '💬' };

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Forum</h1>
        <button onClick={() => navigate('/forum/new')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold transition shadow-md flex items-center justify-center gap-2 text-sm sm:text-base">
          <span>+</span> Neues Thema
        </button>
      </div>

      {/* Kategorien */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 sm:mb-6 scrollbar-hide">
        <button onClick={() => setSelectedCategory('all')} className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-xl font-medium text-sm transition ${selectedCategory === 'all' ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
          Alle
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-xl font-medium text-sm transition flex items-center gap-1.5 ${selectedCategory === cat.id ? 'bg-red-600 text-white' : 'bg-dark-200 text-gray-400 hover:text-white'}`}>
            <span>{cat.icon}</span> <span className="hidden sm:inline">{cat.name}</span>
          </button>
        ))}
      </div>

      {loading && topics.length === 0 ? (
        <div className="text-center text-gray-400 py-10">Lade Forum...</div>
      ) : topics.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl sm:rounded-2xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">💬</span>
          <p className="text-gray-400 mt-3 sm:mt-4 font-medium text-sm sm:text-base">Noch keine Themen vorhanden</p>
          <button onClick={() => navigate('/forum/new')} className="mt-4 bg-red-600 text-white px-5 py-2 rounded-lg font-bold text-sm sm:text-base">Erstes Thema erstellen</button>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {topics.map(topic => {
            const cat = getCategoryInfo(topic.category);
            return (
              <Link key={topic.id} to={`/forum/${topic.id}`} className="block bg-dark-200 p-3 sm:p-4 rounded-xl border border-dark-100 hover:border-red-500 active:scale-[0.99] transition">
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {topic.avatar ? <img src={getImageUrl(topic.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm sm:text-base">{topic.username[0].toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {topic.pinned === 1 && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded mr-2">Angepinnt</span>}
                        <h3 className="text-white font-bold text-sm sm:text-base truncate">{topic.title}</h3>
                      </div>
                      <span className="text-xs bg-dark-100 px-2 py-1 rounded-lg flex-shrink-0 hidden sm:flex items-center gap-1">
                        {cat.icon} {cat.name}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs sm:text-sm mt-1 line-clamp-1">{topic.content}</p>
                    <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-gray-500">
                      <span>@{topic.username}</span>
                      <span className="flex items-center gap-1">💬 {topic.reply_count || 0}</span>
                      <span className="flex items-center gap-1">👁 {topic.views || 0}</span>
                      <span className="hidden sm:inline">{new Date(topic.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                  {topic.image && <img src={getImageUrl(topic.image)} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 hidden sm:block" />}
                </div>
              </Link>
            );
          })}
          {hasMore && <div ref={sentinelRef} className="h-10" />}
          {loading && topics.length > 0 && <div className="text-center text-gray-500 text-sm py-4">Lade...</div>}
          {!hasMore && <div className="text-center text-gray-600 text-xs py-4">— Ende —</div>}
        </div>
      )}
    </div>
  );
}

function ForumTopicPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [topic, setTopic] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState('');
  const [replyImage, setReplyImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportTarget, setReportTarget] = useState(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editTopicContent, setEditTopicContent] = useState('');
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editReplyContent, setEditReplyContent] = useState('');
  const apiFetch = useApi();
  const navigate = useNavigate();

  const loadTopic = async () => {
    try {
      const data = await apiFetch(`/api/forum/topics/${id}`);
      setTopic(data.topic);
      setReplies(data.replies);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTopic(); }, [id]);

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!newReply.trim() || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('content', newReply);
      if (replyImage) fd.append('image', replyImage);
      const reply = await apiFetch(`/api/forum/topics/${id}/replies`, { method: 'POST', body: fd });
      setReplies([...replies, reply]);
      setNewReply('');
      setReplyImage(null);
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleDeleteTopic = async () => {
    if (!window.confirm('Thema wirklich löschen?')) return;
    try {
      await apiFetch(`/api/forum/topics/${id}`, { method: 'DELETE' });
      navigate('/forum');
    } catch (e) { console.error(e); }
  };

  const handleDeleteReply = async (replyId) => {
    if (!window.confirm('Antwort wirklich löschen?')) return;
    try {
      await apiFetch(`/api/forum/replies/${replyId}`, { method: 'DELETE' });
      setReplies(replies.filter(r => r.id !== replyId));
    } catch (e) { console.error(e); }
  };

  const handleEditTopicSave = async () => {
    if (!editTopicTitle.trim() || !editTopicContent.trim()) return;
    try {
      const updated = await apiFetch(`/api/forum/topics/${id}`, { method: 'PUT', body: JSON.stringify({ title: editTopicTitle, content: editTopicContent }) });
      setTopic(updated);
      setEditingTopic(false);
    } catch (e) { console.error(e); }
  };

  const handleEditReplySave = async (replyId) => {
    if (!editReplyContent.trim()) return;
    try {
      const updated = await apiFetch(`/api/forum/replies/${replyId}`, { method: 'PUT', body: JSON.stringify({ content: editReplyContent }) });
      setReplies(replies.map(r => r.id === replyId ? updated : r));
      setEditingReplyId(null);
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="max-w-4xl mx-auto py-8 px-4 text-center text-gray-400">Lade Thema...</div>;
  if (!topic) return <div className="max-w-4xl mx-auto py-8 px-4 text-center text-gray-400">Thema nicht gefunden</div>;

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      {/* Back Button */}
      <Link to="/forum" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition mb-4 text-sm">
        ← Zurück zum Forum
      </Link>

      {/* Topic */}
      <div className="bg-dark-200 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-dark-100 mb-4 sm:mb-6">
        <div className="flex justify-between items-start gap-3 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to={`/profile/${topic.username}`} className="flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                {topic.avatar ? <img src={getImageUrl(topic.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{topic.username[0].toUpperCase()}</span>}
              </div>
            </Link>
            <div className="min-w-0">
              <Link to={`/profile/${topic.username}`} className="text-white font-bold hover:text-red-400 transition text-sm sm:text-base">{topic.display_name || topic.username}</Link>
              <p className="text-gray-500 text-xs">@{topic.username} · {new Date(topic.created_at).toLocaleDateString('de-DE')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {(user?.id !== topic.user_id || user?.is_admin) && <button onClick={() => setReportTarget({ type: 'topic', id: topic.id })} className="text-gray-600 hover:text-orange-400 transition p-1" title="Melden">🚩</button>}
            {user?.id === topic.user_id && <button onClick={() => { setEditingTopic(true); setEditTopicTitle(topic.title); setEditTopicContent(topic.content); }} className="text-gray-600 hover:text-blue-400 transition p-1" title="Bearbeiten">✏️</button>}
            {user?.id === topic.user_id && <button onClick={handleDeleteTopic} className="text-gray-600 hover:text-red-500 transition p-1" title="Löschen">🗑️</button>}
          </div>
        </div>
        {editingTopic ? (
          <div className="mt-2">
            <input value={editTopicTitle} onChange={e => setEditTopicTitle(e.target.value)}
              className="w-full bg-dark-300 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-base font-bold mb-2" />
            <textarea value={editTopicContent} onChange={e => setEditTopicContent(e.target.value)} rows={5}
              className="w-full bg-dark-300 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm resize-none" />
            <div className="flex gap-2 mt-2">
              <button onClick={handleEditTopicSave} className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-700 transition">Speichern</button>
              <button onClick={() => setEditingTopic(false)} className="bg-dark-300 text-gray-400 px-4 py-1.5 rounded-lg text-sm hover:text-white transition">Abbrechen</button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">{topic.title}</h1>
            <p className="text-gray-200 text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{topic.content}</p>
          </>
        )}
        {topic.image && <img src={getImageUrl(topic.image)} className="mt-3 sm:mt-4 rounded-lg sm:rounded-xl w-full max-h-[400px] sm:max-h-[500px] object-cover" />}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dark-100 text-xs sm:text-sm text-gray-500">
          <span className="flex items-center gap-1">💬 {replies.length} Antworten</span>
          <span className="flex items-center gap-1">👁 {topic.views} Aufrufe</span>
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
        {replies.map(reply => (
          <div key={reply.id} className="bg-dark-200 p-3 sm:p-4 rounded-xl border border-dark-100">
            <div className="flex justify-between items-start gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Link to={`/profile/${reply.username}`} className="flex-shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                    {reply.avatar ? <img src={getImageUrl(reply.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-xs sm:text-sm">{reply.username[0].toUpperCase()}</span>}
                  </div>
                </Link>
                <div className="min-w-0">
                  <Link to={`/profile/${reply.username}`} className="text-white font-bold hover:text-red-400 transition text-sm">{reply.display_name || reply.username}</Link>
                  <p className="text-gray-500 text-xs">{new Date(reply.created_at).toLocaleDateString('de-DE')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(user?.id !== reply.user_id || user?.is_admin) && <button onClick={() => setReportTarget({ type: 'reply', id: reply.id })} className="text-gray-600 hover:text-orange-400 transition p-1 text-sm" title="Melden">🚩</button>}
                {user?.id === reply.user_id && <button onClick={() => { setEditingReplyId(reply.id); setEditReplyContent(reply.content); }} className="text-gray-600 hover:text-blue-400 transition p-1 text-sm" title="Bearbeiten">✏️</button>}
                {user?.id === reply.user_id && <button onClick={() => handleDeleteReply(reply.id)} className="text-gray-600 hover:text-red-500 transition p-1 text-sm">🗑️</button>}
              </div>
            </div>
            {editingReplyId === reply.id ? (
              <div>
                <textarea value={editReplyContent} onChange={e => setEditReplyContent(e.target.value)} rows={3}
                  className="w-full bg-dark-300 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm resize-none" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleEditReplySave(reply.id)} className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-700 transition">Speichern</button>
                  <button onClick={() => setEditingReplyId(null)} className="bg-dark-300 text-gray-400 px-4 py-1.5 rounded-lg text-sm hover:text-white transition">Abbrechen</button>
                </div>
              </div>
            ) : (
              <TextWithMentions text={reply.content} className="text-gray-200 text-sm whitespace-pre-wrap" />
            )}
            {reply.image && <img src={getImageUrl(reply.image)} className="mt-2 sm:mt-3 rounded-lg w-full max-h-[300px] object-cover" />}
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <form onSubmit={handleReplySubmit} className="bg-dark-200 p-4 sm:p-5 rounded-xl border border-dark-100">
        <h3 className="text-white font-bold mb-3 text-sm sm:text-base">Antwort schreiben</h3>
        <textarea
          value={newReply}
          onChange={e => setNewReply(e.target.value)}
          placeholder="Deine Antwort..."
          className="w-full bg-dark-100 text-white p-3 rounded-xl outline-none resize-none border border-dark-100 focus:border-red-500 text-sm"
          rows={3}
        />
        {replyImage && (
          <div className="mt-3 relative inline-block">
            <img src={URL.createObjectURL(replyImage)} alt="Preview" className="h-20 sm:h-24 rounded-lg object-cover border border-dark-100" />
            <button type="button" onClick={() => setReplyImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-md text-sm">×</button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-3">
          <label className="flex items-center gap-2 text-gray-400 hover:text-red-400 cursor-pointer transition text-sm">
            <span>📷</span> <span>Bild hinzufügen</span>
            <input type="file" accept="image/*" onChange={e => setReplyImage(e.target.files[0])} className="hidden" />
          </label>
          <button disabled={!newReply.trim() || sending} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition disabled:opacity-50 text-sm">
            {sending ? 'Sendet...' : 'Antworten'}
          </button>
        </div>
      </form>
      {reportTarget && <ReportModal contentType={reportTarget.type} contentId={reportTarget.id} onClose={() => setReportTarget(null)} />}
    </div>
  );
}

function CreateForumTopicPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [image, setImage] = useState(null);
  const [categories, setCategories] = useState([]);
  const [posting, setPosting] = useState(false);
  const apiFetch = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/api/forum/categories').then(setCategories).catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('content', content);
      fd.append('category', category);
      if (image) fd.append('image', image);
      const topic = await apiFetch('/api/forum/topics', { method: 'POST', body: fd });
      navigate(`/forum/${topic.id}`);
    } catch (e) { alert('Fehler beim Erstellen: ' + e.message); }
    finally { setPosting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <Link to="/forum" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition mb-4 text-sm">
        ← Zurück zum Forum
      </Link>
      <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Neues Thema erstellen</h1>
      <form onSubmit={handleSubmit} className="bg-dark-200 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-dark-100 shadow-lg">
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Kategorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm">
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Titel</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Worum geht es?" className="w-full bg-dark-100 text-white p-3 rounded-xl border border-dark-100 focus:border-red-500 outline-none text-sm" required />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Inhalt</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Beschreibe dein Thema..." className="w-full bg-dark-100 text-white p-3 rounded-xl outline-none resize-none border border-dark-100 focus:border-red-500 text-sm" rows={5} required />
        </div>
        {image && (
          <div className="mb-4 relative inline-block">
            <img src={URL.createObjectURL(image)} alt="Preview" className="h-24 sm:h-32 rounded-lg object-cover border border-dark-100" />
            <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-md text-sm">×</button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-dark-100">
          <label className="flex items-center gap-2 text-gray-400 hover:text-red-400 cursor-pointer transition text-sm">
            <span>📷</span> <span>Bild hinzufügen</span>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="hidden" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/forum')} className="flex-1 sm:flex-none bg-dark-100 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-dark-300 transition text-sm">Abbrechen</button>
            <button disabled={posting || !title.trim() || !content.trim()} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition disabled:opacity-50 text-sm">
              {posting ? 'Erstellt...' : 'Veröffentlichen'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// --- MEMBERS PAGE (Mit Gimmick) ---
function MembersPage() {
  const [members, setMembers] = useState([]);
  const [gallery, setGallery] = useState([]);
  const apiFetch = useApi();

  useEffect(() => {
    apiFetch('/api/users').then(setMembers).catch(console.error);
    apiFetch('/api/posts/gallery').then(setGallery).catch(console.error);
  }, []);

  return (
    <div className="max-w-6xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      {/* GIMMICK ABSCHNITT */}
      <div className="mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Community-Galerie</h1>
        <p className="text-gray-400 mb-4 sm:mb-8 font-medium text-sm sm:text-base">Die neuesten Kicks und Styles der Community 👀</p>

        {gallery.length === 0 ? (
          <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl sm:rounded-2xl border border-dark-100"><p className="text-gray-400 font-medium text-sm sm:text-base">Noch keine Bilder hochgeladen.</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
            {gallery.map(post => (
              <Link key={post.id} to={`/`} className="group relative block aspect-square rounded-xl sm:rounded-2xl overflow-hidden border border-dark-100 bg-dark-200 hover:border-red-500 transition shadow-md">
                <img src={getImageUrl(post.image)} alt={post.content} className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 sm:p-3 flex flex-col justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition duration-300">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-dark-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-dark-100 shadow-sm">
                      {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs font-bold">{post.username[0].toUpperCase()}</span>}
                    </div>
                    <p className="text-white text-xs font-bold truncate">@{post.username}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* MITGLIEDER LISTE */}
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-8 pl-1">Alle Mitglieder</h2>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
        {members.map(m => (
          <Link key={m.id} to={`/profile/${m.username}`}>
            <div className="bg-dark-200 border border-dark-100 p-3 sm:p-5 rounded-xl sm:rounded-2xl hover:border-red-500 active:scale-95 sm:hover:-translate-y-1 transition duration-200 shadow-md">
              <div className="flex flex-col items-center text-center gap-2 sm:gap-3">
                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-950 flex items-center justify-center overflow-hidden border-2 sm:border-4 border-dark-100 shadow-sm relative">
                  {m.avatar ? <img src={getImageUrl(m.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-xl sm:text-2xl font-bold">{m.username[0].toUpperCase()}</span>}
                </div>
                <div className="w-full">
                  <p className="text-white font-bold text-sm sm:text-lg truncate px-1 sm:px-2">{m.display_name || m.username}</p>
                  <p className="text-red-500 text-xs font-medium mt-0.5">@{m.username}</p>
                </div>
                {m.bio && <p className="text-gray-400 text-xs mt-1 sm:mt-2 line-clamp-2 italic px-1 sm:px-2 hidden sm:block">"{m.bio}"</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// --- SAVED POSTS PAGE ---
function SavedPostsPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const apiFetch = useApi();

  const loadSaved = async () => {
    try {
      const data = await apiFetch('/api/posts/saved');
      setPosts(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSaved(); }, []);

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 py-4 sm:py-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🔖</span>
        <h1 className="text-2xl font-bold text-white">Gespeicherte Posts</h1>
      </div>
      {loading ? (
        <p className="text-gray-400 text-center py-12">Lädt...</p>
      ) : posts.length === 0 ? (
        <div className="text-center bg-dark-200 p-10 rounded-2xl border border-dark-100">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="text-white font-bold text-lg mb-1">Noch nichts gespeichert</p>
          <p className="text-gray-500 text-sm">Klicke auf 🏷️ unter einem Post, um ihn zu speichern.</p>
        </div>
      ) : (
        posts.map(p => <Post key={p.id} post={p} onRefresh={loadSaved} />)
      )}
    </div>
  );
}

// --- AUTH PAGES ---
function VerifyEmailBanner() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  if (!user || user.email_verified || dismissed) return null;
  const resend = async () => {
    try { await apiFetch('/api/auth/resend-verification', { method: 'POST' }); setSent(true); }
    catch { alert('Fehler beim Senden'); }
  };
  return (
    <div className="bg-yellow-900/40 border-b border-yellow-800 text-yellow-200 text-sm px-4 py-2 flex items-center justify-between gap-3">
      <span>📧 Bitte bestätige deine E-Mail-Adresse ({user.email}).</span>
      <div className="flex gap-2 items-center">
        {sent ? <span className="text-green-400">Gesendet ✓</span> : <button onClick={resend} className="underline hover:text-white">Erneut senden</button>}
        <button onClick={() => setDismissed(true)} className="text-yellow-400 hover:text-white">✕</button>
      </div>
    </div>
  );
}

// --- AUTH FLOW PAGES ---
function AuthShell({ title, children }) {
  return (
    <div className="flex items-center justify-center min-h-screen px-4" style={{ backgroundImage: `url('/streetart.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="bg-black/90 p-8 sm:p-10 rounded-3xl w-full max-w-md border border-dark-100 shadow-2xl backdrop-blur-sm">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setDone(true);
    } catch {}
    finally { setLoading(false); }
  };
  return (
    <AuthShell title="Passwort vergessen">
      {done ? (
        <div className="text-center">
          <p className="text-gray-300 mb-4">Falls ein Account mit dieser E-Mail existiert, haben wir dir einen Link geschickt.</p>
          <Link to="/login" className="text-red-500 hover:underline">Zurück zum Login</Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="text-gray-400 text-sm mb-4">Gib deine E-Mail-Adresse ein, wir senden dir einen Reset-Link.</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="deine@mail.de" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500" />
          <button disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold disabled:opacity-60">{loading ? 'Sende...' : 'Link anfordern'}</button>
          <p className="text-center mt-4 text-sm"><Link to="/login" className="text-gray-500 hover:text-red-400">Zurück zum Login</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setStatus({ err: 'Mind. 6 Zeichen' });
    if (password !== confirm) return setStatus({ err: 'Passwörter stimmen nicht überein' });
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await res.json();
      if (!res.ok) return setStatus({ err: data.error });
      setStatus({ ok: true });
      setTimeout(() => nav('/login'), 2000);
    } catch { setStatus({ err: 'Fehler' }); }
  };
  if (!token) return <AuthShell title="Passwort zurücksetzen"><p className="text-gray-400 text-center">Kein Token gefunden.</p></AuthShell>;
  return (
    <AuthShell title="Neues Passwort setzen">
      {status?.ok ? (
        <p className="text-green-400 text-center">Passwort geändert. Du wirst weitergeleitet...</p>
      ) : (
        <form onSubmit={submit}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Neues Passwort" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500" />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Passwort bestätigen" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500" />
          {status?.err && <p className="text-red-400 text-sm mb-4">{status.err}</p>}
          <button className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold">Passwort speichern</button>
        </form>
      )}
    </AuthShell>
  );
}

function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    fetch(`${API_URL}/api/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => r.ok ? setStatus('ok') : setStatus('error'))
      .catch(() => setStatus('error'));
  }, [token]);
  return (
    <AuthShell title="E-Mail-Bestätigung">
      {status === 'loading' && <p className="text-gray-400 text-center">Prüfe Token...</p>}
      {status === 'ok' && <div className="text-center"><p className="text-green-400 mb-4">✅ E-Mail bestätigt!</p><Link to="/" className="text-red-500 hover:underline">Zur App</Link></div>}
      {status === 'error' && <div className="text-center"><p className="text-red-400 mb-4">❌ Token ungültig oder abgelaufen.</p><Link to="/login" className="text-red-500 hover:underline">Zum Login</Link></div>}
    </AuthShell>
  );
}

function LoginPage() {
  const [u, setU] = useState(''), [p, setP] = useState(''), { login } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await login(u, p); nav('/'); } catch (err) { alert(err.message); } };

  return (
    <div className="flex items-center justify-center min-h-screen px-4" style={{ backgroundImage: `url('/streetart.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="flex w-full max-w-2xl gap-4 items-stretch">
        {/* Login Form */}
        <form onSubmit={sub} className="bg-black/90 p-8 sm:p-10 rounded-3xl w-full border border-dark-100 shadow-2xl backdrop-blur-sm flex flex-col justify-center">
          <div className="text-center mb-8">
            <h2 className="text-white text-3xl font-bold tracking-tight">Willkommen zurück</h2>
            <p className="text-gray-500 text-sm mt-2">Einloggen und im Club bleiben</p>
          </div>
          <div className="mb-4">
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2 block">Username</label>
            <input type="text" placeholder="Dein Username" className="w-full p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition placeholder-gray-600" onChange={e => setU(e.target.value)} required />
          </div>
          <div className="mb-8">
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2 block">Passwort</label>
            <input type="password" placeholder="••••••••" className="w-full p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition placeholder-gray-600" onChange={e => setP(e.target.value)} required />
          </div>
          <button className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white py-4 rounded-xl font-bold transition shadow-lg text-lg tracking-wide">Einloggen</button>
          <p className="text-gray-500 text-xs mt-4 text-center"><Link to="/forgot-password" className="hover:text-red-400 hover:underline">Passwort vergessen?</Link></p>
          <p className="text-gray-500 text-sm mt-4 text-center">Neu im Club? <Link to="/register" className="text-red-500 font-bold hover:underline">Jetzt registrieren</Link></p>
        </form>

        {/* Logo Panel */}
        <div className="hidden sm:flex bg-black/80 rounded-3xl border border-dark-100 shadow-2xl backdrop-blur-sm w-full items-center justify-center p-6">
          <img src="/logo.png" alt="Sneaker Socks Club" className="w-full h-full object-contain max-h-80" />
        </div>
      </div>
    </div>
  )
}

function RegisterPage() {
  const [f, setF] = useState({ u: '', e: '', p: '', d: '' }), { register } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await register(f.u, f.e, f.p, f.d); nav('/'); } catch (err) { alert(err.message); } };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8" style={{ backgroundImage: `url('/streetart.png')`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* ÄNDERUNG: Container-Hintergrund verdunkelt */}
      <form onSubmit={sub} className="bg-black/90 p-8 sm:p-10 rounded-3xl w-full max-w-sm border border-dark-100 shadow-2xl backdrop-blur-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-dark-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dark-100"><span className="text-3xl">🧦</span></div>
          <h2 className="text-white text-2xl font-bold">Mitglied werden</h2>
        </div>
        {/* ÄNDERUNG: Input-Hintergrund & Fokus-Farb-Wechsel */}
        <input type="text" placeholder="Username" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition" onChange={e => setF({...f, u: e.target.value})} required />
        <input type="text" placeholder="Anzeigename (optional)" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition" onChange={e => setF({...f, d: e.target.value})} />
        <input type="email" placeholder="Email" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition" onChange={e => setF({...f, e: e.target.value})} required />
        <input type="password" placeholder="Passwort" className="w-full mb-8 p-4 rounded-xl bg-dark-100 text-white border border-gray-700 outline-none focus:border-red-500 transition" onChange={e => setF({...f, p: e.target.value})} required />
        {/* ÄNDERUNG: Blau-Button zu Rot-Button gewechselt */}
        <button className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold transition shadow-lg text-lg">Registrieren</button>
      </form>
    </div>
  )
}

// --- ADMIN PAGE ---
function AdminPage() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [topics, setTopics] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return; }
    loadTab(tab);
  }, [tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      if (t === 'dashboard') setStats(await apiFetch('/api/admin/stats'));
      else if (t === 'users') setUsers(await apiFetch('/api/admin/users'));
      else if (t === 'posts') setPosts(await apiFetch('/api/admin/posts'));
      else if (t === 'forum') setTopics(await apiFetch('/api/admin/topics'));
      else if (t === 'reports') setReports(await apiFetch('/api/admin/reports'));
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteUser = async (id, name) => {
    if (!window.confirm(`User "${name}" wirklich löschen? Alle Daten werden entfernt!`)) return;
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    setUsers(u => u.filter(x => x.id !== id));
  };

  const toggleAdmin = async (id) => {
    const res = await apiFetch(`/api/admin/users/${id}/toggle-admin`, { method: 'PUT' });
    setUsers(u => u.map(x => x.id === id ? { ...x, is_admin: res.is_admin ? 1 : 0 } : x));
  };

  const deletePost = async (id) => {
    if (!window.confirm('Post löschen?')) return;
    await apiFetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
    setPosts(p => p.filter(x => x.id !== id));
  };

  const deleteTopic = async (id) => {
    if (!window.confirm('Forum-Topic löschen?')) return;
    await apiFetch(`/api/admin/topics/${id}`, { method: 'DELETE' });
    setTopics(t => t.filter(x => x.id !== id));
  };

  const pinTopic = async (id) => {
    const res = await apiFetch(`/api/admin/topics/${id}/pin`, { method: 'PUT' });
    setTopics(t => t.map(x => x.id === id ? { ...x, pinned: res.pinned ? 1 : 0 } : x));
  };

  const dismissReport = async (id) => {
    await apiFetch(`/api/admin/reports/${id}/dismiss`, { method: 'PUT' });
    setReports(r => r.filter(x => x.id !== id));
  };

  const deleteReportContent = async (id) => {
    if (!window.confirm('Inhalt löschen und Meldung schließen?')) return;
    await apiFetch(`/api/admin/reports/${id}/delete-content`, { method: 'DELETE' });
    setReports(r => r.filter(x => x.id !== id));
  };

  const TABS = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'users', label: '👥 User' },
    { id: 'posts', label: '📝 Posts' },
    { id: 'forum', label: '💬 Forum' },
    { id: 'reports', label: '🚩 Meldungen' },
  ];

  const CATEGORY_LABELS = { general: 'Allgemein', sneakers: 'Sneakers', socks: 'Socken', collections: 'Sammlungen', trading: 'Börse', offtopic: 'Off-Topic' };

  if (!user?.is_admin) return null;

  return (
    <div className="max-w-5xl mx-auto p-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">⚙️</span>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin-Panel</h1>
          <p className="text-gray-500 text-sm">Eingeloggt als {user.username}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition ${tab === t.id ? 'bg-yellow-500 text-black' : 'bg-dark-300 text-gray-400 hover:text-white border border-dark-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-gray-400 py-10">Lade...</div>}

      {/* DASHBOARD */}
      {!loading && tab === 'dashboard' && stats && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'User', value: stats.userCount, icon: '👥', color: 'text-blue-400' },
              { label: 'Posts', value: stats.postCount, icon: '📝', color: 'text-green-400' },
              { label: 'Kommentare', value: stats.commentCount, icon: '💬', color: 'text-purple-400' },
              { label: 'Forum Topics', value: stats.topicCount, icon: '📋', color: 'text-orange-400' },
              { label: 'Nachrichten', value: stats.messageCount, icon: '✉️', color: 'text-pink-400' },
              { label: 'Gerade online', value: stats.onlineCount, icon: '🟢', color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-dark-300 rounded-2xl p-4 border border-dark-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-gray-400 text-sm">{s.label}</span>
                </div>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-dark-300 rounded-2xl p-4 border border-dark-100 text-center text-gray-500 text-sm">
            Daten werden live aus der Datenbank geladen. Klicke einen Tab um Details zu sehen.
          </div>
        </div>
      )}

      {/* USERS */}
      {!loading && tab === 'users' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">{users.length} User registriert</p>
          {users.map(u => (
            <div key={u.id} className="bg-dark-300 rounded-2xl p-4 border border-dark-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950 flex-shrink-0 flex items-center justify-center overflow-hidden border border-dark-100">
                {u.avatar ? <img src={getImageUrl(u.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm">{u.username[0].toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-sm">{u.display_name || u.username}</span>
                  <span className="text-gray-500 text-xs">@{u.username}</span>
                  {u.is_admin ? <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full border border-yellow-700 font-bold">Admin</span> : null}
                </div>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{u.email}</p>
                <p className="text-gray-600 text-xs">Registriert: {new Date(u.created_at).toLocaleDateString('de-DE')}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => toggleAdmin(u.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${u.is_admin ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800 hover:bg-yellow-900' : 'bg-dark-100 text-gray-400 border border-dark-100 hover:text-yellow-400'}`}>
                  {u.is_admin ? '★ Admin' : '☆ Admin'}
                </button>
                {u.id !== user.id && (
                  <button onClick={() => deleteUser(u.id, u.username)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 border border-red-900 hover:bg-red-900/60 font-bold transition">
                    Löschen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* POSTS */}
      {!loading && tab === 'posts' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">{posts.length} Posts (neueste 100)</p>
          {posts.map(p => (
            <div key={p.id} className="bg-dark-300 rounded-2xl p-4 border border-dark-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-red-950 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {p.avatar ? <img src={getImageUrl(p.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 text-xs font-bold">{p.username[0].toUpperCase()}</span>}
                  </div>
                  <div>
                    <span className="text-white text-sm font-bold">{p.display_name || p.username}</span>
                    <span className="text-gray-500 text-xs ml-2">{new Date(p.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>
                <button onClick={() => deletePost(p.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 border border-red-900 hover:bg-red-900/60 font-bold transition flex-shrink-0">
                  Löschen
                </button>
              </div>
              <p className="text-gray-300 text-sm line-clamp-3 mb-2">{p.content}</p>
              {p.image && <img src={getImageUrl(p.image)} className="h-16 rounded-lg object-cover" />}
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>❤️ {p.like_count}</span>
                <span>💬 {p.comment_count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FORUM */}
      {!loading && tab === 'forum' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">{topics.length} Topics (neueste 100)</p>
          {topics.map(t => (
            <div key={t.id} className="bg-dark-300 rounded-2xl p-4 border border-dark-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {t.pinned ? <span className="text-yellow-400 text-xs font-bold">📌 Gepinnt</span> : null}
                    <span className="bg-dark-100 text-gray-400 text-xs px-2 py-0.5 rounded-full">{CATEGORY_LABELS[t.category] || t.category}</span>
                  </div>
                  <p className="text-white font-bold text-sm truncate">{t.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">von {t.display_name || t.username} · {new Date(t.created_at).toLocaleDateString('de-DE')} · 👁 {t.views} · 💬 {t.reply_count}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => pinTopic(t.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${t.pinned ? 'bg-yellow-900/40 text-yellow-400 border-yellow-800' : 'bg-dark-100 text-gray-400 border-dark-100 hover:text-yellow-400'}`}>
                    {t.pinned ? '📌' : '📍'}
                  </button>
                  <button onClick={() => deleteTopic(t.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 border border-red-900 hover:bg-red-900/60 font-bold transition">
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REPORTS */}
      {!loading && tab === 'reports' && (
        <div className="space-y-3">
          <p className="text-gray-400 text-sm mb-4">{reports.length} offene Meldungen</p>
          {reports.length === 0 && (
            <div className="text-center bg-dark-300 rounded-2xl p-10 border border-dark-100">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-400">Keine offenen Meldungen</p>
            </div>
          )}
          {reports.map(r => {
            const typeLabels = { post: 'Post', comment: 'Kommentar', topic: 'Forum-Topic', reply: 'Forum-Antwort' };
            return (
              <div key={r.id} className="bg-dark-300 rounded-2xl p-4 border border-orange-900/50">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-orange-900/40 text-orange-400 text-xs px-2 py-0.5 rounded-full border border-orange-800 font-bold">🚩 {typeLabels[r.content_type]}</span>
                    <span className="bg-dark-100 text-gray-300 text-xs px-2 py-0.5 rounded-full">{r.reason}</span>
                  </div>
                  <span className="text-gray-600 text-xs flex-shrink-0">{new Date(r.created_at).toLocaleDateString('de-DE')}</span>
                </div>
                <p className="text-gray-500 text-xs mb-2">Gemeldet von: <span className="text-gray-300">@{r.reporter_username}</span></p>
                {r.content ? (
                  <div className="bg-dark-100 rounded-xl p-3 mb-3">
                    <p className="text-gray-400 text-xs mb-1 font-bold">von @{r.content.username}:</p>
                    <p className="text-gray-200 text-sm line-clamp-4 whitespace-pre-wrap">{r.content.title || r.content.content}</p>
                  </div>
                ) : (
                  <div className="bg-dark-100 rounded-xl p-3 mb-3 text-gray-500 text-xs italic">Inhalt wurde bereits gelöscht</div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => dismissReport(r.id)} className="text-xs px-3 py-2 rounded-lg bg-dark-100 text-gray-400 border border-dark-100 hover:text-white font-bold transition">
                    Ignorieren
                  </button>
                  {r.content && (
                    <button onClick={() => deleteReportContent(r.id)} className="text-xs px-3 py-2 rounded-lg bg-red-900/40 text-red-400 border border-red-900 hover:bg-red-900/70 font-bold transition">
                      Inhalt löschen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- FOOTER & LEGAL PAGES ---
const LEGAL_CONTENT = {
  impressum: {
    title: 'Impressum',
    body: `Angaben gemäß § 5 TMG

IT MEDIA DESIGN Gutberg
— Inhaber: M. Gutberg —

Kontakt:
E-Mail: deepvoiceinc@web.de

Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:
M. Gutberg

Haftungsausschluss:
Die Inhalte dieser Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.`
  },
  datenschutz: {
    title: 'Datenschutz',
    body: `Diese Datenschutzerklärung klärt dich über Art, Umfang und Zweck der Verarbeitung personenbezogener Daten auf.

1. Verantwortlicher
IT MEDIA DESIGN Gutberg, deepvoiceinc@web.de

2. Welche Daten werden erhoben?
- Bei der Registrierung: Username, E-Mail, Passwort (gehasht)
- Optional: Anzeigename, Bio, Avatar, Profilangaben
- Inhalte, die du selbst postest (Posts, Kommentare, Nachrichten, Inserate, Events)
- Profilaufrufe und -besucher

3. Rechtsgrundlage
Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) für die Nutzung der Plattform.

4. Deine Rechte
- Auskunft (Art. 15 DSGVO) — Export auf deinem Profil
- Berichtigung (Art. 16 DSGVO)
- Löschung (Art. 17 DSGVO)
- Datenübertragbarkeit (Art. 20 DSGVO) — JSON/ZIP-Export verfügbar
- Widerspruch (Art. 21 DSGVO)

5. Cookies
Diese Website verwendet nur technisch notwendige Speicherung (Login-Token im LocalStorage). Keine Tracking-Cookies.`
  },
  cookies: {
    title: 'Cookies',
    body: `Wir verwenden keine Tracking-Cookies.

Technisch notwendige Speicherung:
- Login-Token im LocalStorage des Browsers (um dich eingeloggt zu halten)
- Theme-Einstellung (Dark/Light)

Diese Einträge verbleiben bis zum Logout oder bis du sie manuell entfernst.`
  },
  agb: {
    title: 'AGB',
    body: `Allgemeine Geschäftsbedingungen von Sneaks & Socks Club

§1 Geltungsbereich
Diese AGB gelten für die Nutzung der Plattform Sneaks & Socks Club.

§2 Registrierung
Die Registrierung ist kostenlos. Mit der Registrierung akzeptierst du diese AGB.

§3 Nutzerpflichten
- Keine rechtswidrigen, beleidigenden oder diskriminierenden Inhalte
- Keine Urheberrechtsverletzungen
- Keine Spam- oder Werbung ohne Zustimmung
- Korrekte Angaben bei Inseraten im Marktplatz

§4 Marktplatz
Der Marktplatz ist reine Anzeigenplattform. Kaufverträge kommen ausschließlich zwischen den Nutzern zustande. Der Betreiber ist nicht Vertragspartei.

§5 Haftung
Der Betreiber haftet nur bei Vorsatz und grober Fahrlässigkeit.

§6 Kündigung
Du kannst deinen Account jederzeit löschen. Dein Content bleibt gelöscht.`
  },
  dsgvo: {
    title: 'DSGVO',
    body: `Hinweise zur Datenschutzgrundverordnung (DSGVO)

Wir verarbeiten deine Daten nach den Vorgaben der DSGVO.

Deine Rechte im Überblick:
• Art. 15 – Auskunftsrecht: Du kannst jederzeit eine Kopie aller über dich gespeicherten Daten anfordern. Über dein Profil → "Daten-Export (DSGVO)" als JSON oder ZIP.
• Art. 16 – Berichtigung: Du kannst dein Profil jederzeit selbst bearbeiten.
• Art. 17 – Löschung: Du kannst deinen Account löschen lassen. Anfrage per E-Mail.
• Art. 20 – Datenübertragbarkeit: Der ZIP-Export enthält alle Inhalte und Bilder im maschinenlesbaren Format.
• Art. 21 – Widerspruch: Du kannst der Verarbeitung jederzeit widersprechen.

Datenschutzbeauftragter / Kontakt:
E-Mail: deepvoiceinc@web.de`
  },
};

function LegalPage() {
  const { page } = useParams();
  const content = LEGAL_CONTENT[page];
  if (!content) return <div className="text-white p-10 text-center">Seite nicht gefunden.</div>;
  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="bg-dark-200 rounded-2xl border border-dark-100 p-4 sm:p-8 shadow-lg">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">{content.title}</h1>
        <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">{content.body}</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-black border-t border-dark-100 fixed bottom-0 left-0 right-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
        <Link to="/" className="flex-shrink-0">
          <img src="/logo.png" alt="Sneaks & Socks Club" className="h-12 sm:h-14 w-auto object-contain" />
        </Link>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-400 flex-1">
          <Link to="/legal/impressum" className="hover:text-red-400 transition">Impressum</Link>
          <Link to="/legal/datenschutz" className="hover:text-red-400 transition">Datenschutz</Link>
          <Link to="/legal/cookies" className="hover:text-red-400 transition">Cookies</Link>
          <Link to="/legal/agb" className="hover:text-red-400 transition">AGB</Link>
          <Link to="/legal/dsgvo" className="hover:text-red-400 transition">DSGVO</Link>
        </nav>
        <p className="text-gray-500 text-xs text-center sm:text-right flex-shrink-0">
          Powered by IT MEDIA DESIGN Gutberg © 2026
        </p>
      </div>
    </footer>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold text-xl">Lade Club...</div>;
  return user ? children : <Navigate to="/login" />;
}


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* ÄNDERUNG: Globaler Primär-Farben-Wechsel: selektionsfarbe von blau zu rot gewechselt */}
        <div className="min-h-screen text-gray-100 selection:bg-red-500 selection:text-white">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <div className="flex flex-col min-h-screen">
                  <Navbar />
                  <VerifyEmailBanner />
                  <main className="flex-1 pb-40 sm:pb-28">
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/create-post" element={<CreatePostPage />} />
                      <Route path="/profile/:id" element={<ProfilePage />} />
                      <Route path="/members" element={<MembersPage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/messages" element={<MessagesPage />} />
                      <Route path="/messages/:id" element={<ConversationPage />} />
                      <Route path="/forum" element={<ForumPage />} />
                      <Route path="/forum/new" element={<CreateForumTopicPage />} />
                      <Route path="/forum/:id" element={<ForumTopicPage />} />
                      <Route path="/market" element={<MarketPage />} />
                      <Route path="/market/new" element={<MarketEditPage />} />
                      <Route path="/market/edit/:id" element={<MarketEditPage />} />
                      <Route path="/market/:id" element={<MarketDetailPage />} />
                      <Route path="/events" element={<EventsPage />} />
                      <Route path="/events/new" element={<EventEditPage />} />
                      <Route path="/events/edit/:id" element={<EventEditPage />} />
                      <Route path="/events/:id" element={<EventDetailPage />} />
                      <Route path="/groups" element={<GroupsPage />} />
                      <Route path="/groups/new" element={<GroupEditPage />} />
                      <Route path="/groups/:slug/edit" element={<GroupEditPage />} />
                      <Route path="/groups/:slug" element={<GroupDetailPage />} />
                      <Route path="/saved" element={<SavedPostsPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                      <Route path="/legal/:page" element={<LegalPage />} />
                    </Routes>
                  </main>
                  <Footer />
                </div>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
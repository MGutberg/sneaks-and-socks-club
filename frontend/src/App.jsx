import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'undefined' && envUrl !== '') return envUrl;
  return window.location.origin;
};
const API_URL = getApiUrl();
const getImageUrl = (path) => path ? (path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`) : null;

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
      <div className="max-w-6xl mx-auto flex justify-between items-center h-14 px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-white font-bold text-lg sm:text-xl">👟 Sneaks & Socks</Link>

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
            <Link to={`/profile/${user.id}`} className="hidden sm:flex items-center hover:opacity-80 transition">
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
            <Link to={`/profile/${user.id}`} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-dark-100 text-white px-4 py-3 rounded-xl">
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
            {user?.is_admin && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 bg-yellow-900/40 text-yellow-400 px-4 py-3 rounded-xl font-bold border border-yellow-800">
                <span>⚙️</span> Admin-Panel
              </Link>
            )}
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
          <Link to={`/profile/${post.user_id}`} className="flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden shadow-inner">
              {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-sm sm:text-base">{post.username[0].toUpperCase()}</span>}
            </div>
          </Link>
          <div className="min-w-0">
            <Link to={`/profile/${post.user_id}`} className="text-white font-bold hover:text-red-400 transition text-sm sm:text-base truncate block">{post.display_name || post.username}</Link>
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
                  <Link key={user.id} to={`/profile/${user.id}`} className="flex items-center gap-4 bg-dark-200 p-4 rounded-xl border border-dark-100 hover:border-red-500 transition">
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

// --- HOME PAGE (Nur noch Feed) ---
function HomePage() {
  const [posts, setPosts] = useState([]);
  const apiFetch = useApi();

  const load = async () => { try { setPosts(await apiFetch('/api/posts')); } catch(e) {} };
  useEffect(() => { load() }, []);

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6">Dein Feed</h2>
      {posts.length === 0 ? (
        <div className="text-center bg-dark-200 p-6 sm:p-10 rounded-xl sm:rounded-2xl border border-dark-100">
          <span className="text-4xl sm:text-5xl">👀</span>
          <p className="text-gray-400 mt-3 sm:mt-4 font-medium text-sm sm:text-base">Noch keine Posts vorhanden.<br/>Sei der Erste!</p>
          <button onClick={() => window.location.href='/create-post'} className="mt-4 bg-red-600 text-white px-5 sm:px-6 py-2 rounded-lg font-bold text-sm sm:text-base">Jetzt posten</button>
        </div>
      ) : (
        posts.map(p => <Post key={p.id} post={p} onRefresh={load} />)
      )}
    </div>
  )
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
  const galleryInputRef = useRef(null);
  const apiFetch = useApi();

  const isOwnProfile = currentUser?.id === id;

  const loadData = async () => {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const resolvedId = isUUID ? id : (await apiFetch(`/api/users/by-username/${id}`)).id;
      if (!resolvedId) return;
      const [pData, pPosts, pGallery] = await Promise.all([
        apiFetch(`/api/users/${resolvedId}`),
        apiFetch(`/api/users/${resolvedId}/posts`),
        apiFetch(`/api/users/${resolvedId}/gallery`),
      ]);
      setProfile(pData);
      setPosts(pPosts);
      setGallery(pGallery);
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
    try {
      const res = await apiFetch(`/api/users/${id}/follow`, { method: 'POST' });
      setIsFollowing(res.following);
      setFollowerCount(prev => res.following ? prev + 1 : prev - 1);
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    try {
      const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ user_id: id }) });
      navigate(`/messages/${conv.id}`);
    } catch (e) { console.error(e); }
  };

  const loadFollowers = async () => {
    try {
      const data = await apiFetch(`/api/users/${id}/followers`);
      setFollowersList(data);
      setShowFollowersModal(true);
    } catch (e) { console.error(e); }
  };

  const loadFollowing = async () => {
    try {
      const data = await apiFetch(`/api/users/${id}/following`);
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
      
      const updated = await apiFetch(`/api/users/${id}`, { method: 'PUT', body: fd });
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
                    <Link key={u.id} to={`/profile/${u.id}`} onClick={() => setShowFollowersModal(false)} className="flex items-center gap-3 p-3 bg-dark-100 rounded-xl hover:bg-dark-300 transition">
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
                    <Link key={u.id} to={`/profile/${u.id}`} onClick={() => setShowFollowingModal(false)} className="flex items-center gap-3 p-3 bg-dark-100 rounded-xl hover:bg-dark-300 transition">
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
        <Link to={`/profile/${otherUser.id}`} className="flex items-center gap-2 sm:gap-4 flex-1 hover:opacity-80 transition min-w-0">
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
function ForumPage() {
  const [topics, setTopics] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const apiFetch = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [cats, tops] = await Promise.all([
          apiFetch('/api/forum/categories'),
          apiFetch(`/api/forum/topics${selectedCategory !== 'all' ? `?category=${selectedCategory}` : ''}`)
        ]);
        setCategories(cats);
        setTopics(tops);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    loadData();
  }, [selectedCategory]);

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

      {loading ? (
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
            <Link to={`/profile/${topic.user_id}`} className="flex-shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                {topic.avatar ? <img src={getImageUrl(topic.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold">{topic.username[0].toUpperCase()}</span>}
              </div>
            </Link>
            <div className="min-w-0">
              <Link to={`/profile/${topic.user_id}`} className="text-white font-bold hover:text-red-400 transition text-sm sm:text-base">{topic.display_name || topic.username}</Link>
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
                <Link to={`/profile/${reply.user_id}`} className="flex-shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-red-950 flex items-center justify-center overflow-hidden">
                    {reply.avatar ? <img src={getImageUrl(reply.avatar)} className="w-full h-full object-cover" /> : <span className="text-red-400 font-bold text-xs sm:text-sm">{reply.username[0].toUpperCase()}</span>}
                  </div>
                </Link>
                <div className="min-w-0">
                  <Link to={`/profile/${reply.user_id}`} className="text-white font-bold hover:text-red-400 transition text-sm">{reply.display_name || reply.username}</Link>
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
          <Link key={m.id} to={`/profile/${m.id}`}>
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

// --- AUTH PAGES ---
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
          <p className="text-gray-500 text-sm mt-6 text-center">Neu im Club? <Link to="/register" className="text-red-500 font-bold hover:underline">Jetzt registrieren</Link></p>
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
            <Route path="/*" element={
              <ProtectedRoute>
                <div className="flex flex-col min-h-screen">
                  <Navbar />
                  <main className="flex-1">
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
                      <Route path="/admin" element={<AdminPage />} />
                    </Routes>
                  </main>
                </div>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'

// KUGELSICHERER FIX: Nutze relative Pfade! 
const API_URL = '';
const getImageUrl = (path) => path;

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
    if (res.status === 401 || res.status === 403) { logout(); throw new Error("Sitzung abgelaufen"); }
    return res.json();
  }
}

// --- NAVBAR ---
function Navbar() {
  const { user, logout } = useAuth(); 
  const navigate = useNavigate();
  const apiFetch = useApi();
  const [onlineCount, setOnlineCount] = useState(1);

  useEffect(() => {
    if (!user) return;
    const updateOnlineStatus = async () => {
      try {
        await apiFetch('/api/auth/heartbeat', { method: 'POST' });
        const res = await apiFetch('/api/users/online');
        setOnlineCount(res.count);
      } catch (e) { console.error("Heartbeat failed", e); }
    };
    updateOnlineStatus();
    const interval = setInterval(updateOnlineStatus, 30000); 
    return () => clearInterval(interval);
  }, [user]);

  return (
    <nav className="bg-dark-200 border-b border-dark-100 p-4 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex justify-between items-center h-10">
        <div className="flex gap-6 items-center">
          <Link to="/" className="text-white font-bold text-xl">👟 Sneaks & Socks</Link>
          
          {user && (
            <div className="hidden sm:flex items-center gap-1.5 ml-4">
              <div className="flex items-center gap-1.5 bg-dark-300 px-2.5 py-1 rounded-full border border-dark-100" title="Mitglieder online">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_6px_#22c55e]"></span>
                </span>
                <span className="text-gray-300 text-xs font-bold">{onlineCount}</span>
              </div>
              <Link to="/members" className="text-gray-400 hover:text-white transition text-sm font-medium ml-1">Members</Link>
            </div>
          )}
        </div>
        
        {user && (
          <div className="flex gap-5 items-center">
            <Link to="/create-post" className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2">
              <span>+</span><span className="hidden sm:inline">Post erstellen</span>
            </Link>
            <div className="h-6 w-px bg-dark-100 hidden sm:block"></div>
            <Link to={`/profile/${user.id}`} className="flex items-center gap-2 hover:opacity-80 transition">
              <div className="w-9 h-9 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden border border-dark-100">
                {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-sm font-bold">{user.username[0].toUpperCase()}</span>}
              </div>
            </Link>
            <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-red-400 text-sm font-medium transition">Logout</button>
          </div>
        )}
      </div>
    </nav>
  )
}

// --- POST COMPONENT ---
function Post({ post, onRefresh }) {
  const { user } = useAuth(); const apiFetch = useApi();
  const [liked, setLiked] = useState(!!post.liked);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  const handleDelete = async () => { if (window.confirm("Post löschen?")) { await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' }); onRefresh(); } }
  
  const handleLike = async () => {
    try {
      const res = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' });
      setLiked(!!res.liked);
      setLikeCount(prev => res.liked ? prev + 1 : prev - 1);
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
      onRefresh(); 
    } catch(e) { console.error(e) }
  }

  return (
    <div className="bg-dark-200 p-5 rounded-2xl border border-dark-100 mb-6 shadow-md">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${post.user_id}`}>
            <div className="w-12 h-12 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden shadow-inner">
              {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{post.username[0].toUpperCase()}</span>}
            </div>
          </Link>
          <div>
            <Link to={`/profile/${post.user_id}`} className="text-white font-bold hover:text-primary-400 transition">{post.display_name || post.username}</Link>
            <p className="text-gray-500 text-xs">@{post.username}</p>
          </div>
        </div>
        {user?.id === post.user_id && <button onClick={handleDelete} className="text-gray-600 hover:text-red-500 transition" title="Löschen">🗑️</button>}
      </div>
      <p className="text-gray-200 text-[15px] mt-3 whitespace-pre-wrap leading-relaxed">{post.content}</p>
      {post.image && <img src={getImageUrl(post.image)} className="mt-4 rounded-xl w-full max-h-[500px] object-cover" />}
      
      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-dark-100">
        <button onClick={handleLike} className={`flex items-center gap-2 transition ${liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
          <span>{liked ? '❤️' : '🤍'}</span>
          <span className="text-sm font-medium">{likeCount}</span>
        </button>
        <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments(); }} className="flex items-center gap-2 text-gray-400 hover:text-primary-400 transition">
          <span>💬</span>
          <span className="text-sm font-medium">{post.comment_count || 0}</span>
        </button>
      </div>

      {showComments && (
        <div className="mt-4 bg-dark-300 p-4 rounded-xl">
          <form onSubmit={handleCommentSubmit} className="flex gap-2 mb-4">
            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Schreibe einen Kommentar..." className="flex-1 bg-dark-100 text-white p-2.5 rounded-lg border border-dark-100 text-sm focus:border-primary-500 outline-none" />
            <button className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Senden</button>
          </form>
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-dark-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {c.avatar ? <img src={getImageUrl(c.avatar)} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs font-bold">{c.username[0].toUpperCase()}</span>}
                </div>
                <div className="bg-dark-100 p-3 rounded-xl flex-1">
                  <p className="text-white text-xs font-bold mb-1">@{c.username}</p>
                  <p className="text-gray-300 text-sm">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- CREATE POST PAGE ---
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
      navigate('/'); 
    } catch(err) { alert("Fehler beim Posten: " + err.message) }
    finally { setPosting(false); }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">Neuen Post erstellen</h1>
      <form onSubmit={submit} className="bg-dark-200 p-6 rounded-2xl border border-dark-100 shadow-lg">
        <textarea 
          value={newPost} 
          onChange={e => setNewPost(e.target.value)} 
          className="w-full bg-dark-100 text-white p-4 rounded-xl outline-none resize-none border border-dark-100 focus:border-primary-500" 
          placeholder="Was sind deine Sneaker des Tages?" 
          rows={5} 
        />
        {image && (
          <div className="mt-4 relative inline-block">
            <img src={URL.createObjectURL(image)} alt="Preview" className="h-32 rounded-lg object-cover border border-dark-100" />
            <button type="button" onClick={() => setImage(null)} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold shadow-md">×</button>
          </div>
        )}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-dark-100">
          <label className="flex items-center gap-2 text-gray-400 hover:text-primary-400 cursor-pointer transition">
            <span className="text-xl">📷</span>
            <span className="font-medium">Foto hinzufügen</span>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="hidden" />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate('/')} className="bg-dark-100 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-dark-300 transition">Abbrechen</button>
            <button disabled={posting || (!newPost.trim() && !image)} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl font-bold transition disabled:opacity-50 shadow-md">
              {posting ? 'Postet...' : 'Veröffentlichen'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// --- HOME PAGE (Feed) ---
function HomePage() {
  const [posts, setPosts] = useState([]);
  const apiFetch = useApi();

  const load = async () => { try { setPosts(await apiFetch('/api/posts')); } catch(e) {} };
  useEffect(() => { load() }, []);

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h2 className="text-xl font-bold text-white mb-6">Dein Feed</h2>
      {posts.length === 0 ? (
        <div className="text-center bg-dark-200 p-10 rounded-2xl border border-dark-100">
          <span className="text-5xl">👀</span>
          <p className="text-gray-400 mt-4 font-medium">Noch keine Posts vorhanden.<br/>Sei der Erste!</p>
          <button onClick={() => window.location.href='/create-post'} className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-lg font-bold">Jetzt posten</button>
        </div>
      ) : (
        posts.map(p => <Post key={p.id} post={p} onRefresh={load} />)
      )}
    </div>
  )
}

// --- PROFILE PAGE ---
function ProfilePage() {
  const { id } = useParams(); 
  const { user: currentUser, updateUser } = useAuth(); 
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editAvatar, setEditAvatar] = useState(null);
  const apiFetch = useApi();

  const isOwnProfile = currentUser?.id === id;

  const loadData = async () => { 
    try {
      const [pData, pPosts] = await Promise.all([
        apiFetch(`/api/users/${id}`),
        apiFetch(`/api/users/${id}/posts`)
      ]);
      setProfile(pData);
      setPosts(pPosts);
      setEditForm(pData);
    } catch(e) { console.error(e) } 
  };
  
  useEffect(() => { loadData() }, [id]);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      const fields = ['display_name', 'bio', 'location', 'website', 'favorite_sneakers', 'favorite_socks', 'sneaker_size', 'sock_size', 'favorite_brands'];
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
    <div className="max-w-2xl mx-auto p-4 py-8">
      <div className="bg-dark-200 rounded-3xl p-8 border border-dark-100 mb-8 shadow-lg">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <div className="w-32 h-32 rounded-full bg-primary-900 flex-shrink-0 flex items-center justify-center overflow-hidden border-4 border-dark-100 shadow-xl">
            {profile.avatar ? <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-5xl font-bold">{profile.username[0].toUpperCase()}</span>}
          </div>
          <div className="flex-1 w-full">
            <h1 className="text-3xl font-bold text-white">{profile.display_name || profile.username}</h1>
            <p className="text-primary-500 font-medium text-lg">@{profile.username}</p>
            {profile.bio && <p className="text-gray-300 mt-4 italic">"{profile.bio}"</p>}
            
            <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-6 text-sm text-gray-400 bg-dark-100 p-4 rounded-xl">
              {profile.location && <span className="flex items-center gap-1">📍 <strong className="text-white">{profile.location}</strong></span>}
              {profile.website && <span className="flex items-center gap-1">🔗 <a href={profile.website} target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">{profile.website}</a></span>}
              <span className="flex items-center gap-1">📝 <strong className="text-white">{posts.length}</strong> Posts</span>
            </div>
            
            {(profile.favorite_sneakers || profile.sneaker_size || profile.favorite_brands) && (
              <div className="mt-5 flex flex-wrap justify-center sm:justify-start gap-2">
                {profile.favorite_sneakers && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">👟 {profile.favorite_sneakers}</span>}
                {profile.sneaker_size && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">📏 {profile.sneaker_size}</span>}
                {profile.favorite_brands && <span className="px-4 py-1.5 bg-dark-100 border border-dark-100 rounded-full text-xs font-bold text-gray-300">🏷️ {profile.favorite_brands}</span>}
              </div>
            )}

            {isOwnProfile && !editing && (
              <button onClick={() => setEditing(true)} className="mt-6 w-full sm:w-auto px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold transition shadow-md">Profil bearbeiten</button>
            )}
          </div>
        </div>

        {editing && (
          <form onSubmit={handleEditSubmit} className="mt-8 pt-8 border-t border-dark-100">
            <h3 className="text-white font-bold text-xl mb-6">Profil anpassen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Anzeigename</label>
                <input type="text" value={editForm.display_name || ''} onChange={e => setEditForm({...editForm, display_name: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Standort</label>
                <input type="text" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Bio</label>
                <textarea value={editForm.bio || ''} onChange={e => setEditForm({...editForm, bio: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" rows={3} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Website URL</label>
                <input type="url" value={editForm.website || ''} onChange={e => setEditForm({...editForm, website: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Lieblings Sneaker</label>
                <input type="text" value={editForm.favorite_sneakers || ''} onChange={e => setEditForm({...editForm, favorite_sneakers: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Sneaker Größe</label>
                <input type="text" value={editForm.sneaker_size || ''} onChange={e => setEditForm({...editForm, sneaker_size: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Lieblings Marken</label>
                <input type="text" value={editForm.favorite_brands || ''} onChange={e => setEditForm({...editForm, favorite_brands: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-xl p-3 text-white focus:border-primary-500 outline-none" />
              </div>
              <div className="sm:col-span-2 mt-2 bg-dark-100 p-4 rounded-xl border border-dark-100">
                <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Profilbild ändern</label>
                <div className="flex items-center gap-6">
                  <input type="file" accept="image/*" onChange={e => setEditAvatar(e.target.files[0])} className="text-sm text-gray-300 file:mr-4 file:py-2.5 file:px-5 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-600 file:text-white hover:file:bg-primary-700 cursor-pointer" />
                  {editAvatar && <img src={URL.createObjectURL(editAvatar)} className="w-16 h-16 rounded-full object-cover border-2 border-primary-500 shadow-lg" />}
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <button type="submit" className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-xl font-bold transition shadow-md">Speichern</button>
              <button type="button" onClick={() => {setEditing(false); setEditForm(profile); setEditAvatar(null);}} className="w-full sm:w-auto bg-dark-100 hover:bg-dark-300 border border-dark-100 text-white px-8 py-3 rounded-xl font-bold transition">Abbrechen</button>
            </div>
          </form>
        )}
      </div>

      <h2 className="text-2xl font-bold text-white mb-6 pl-2">Posts von {profile.display_name || profile.username}</h2>
      {posts.length === 0 ? <div className="text-center bg-dark-200 p-8 rounded-2xl border border-dark-100"><p className="text-gray-400 font-medium">Keine Posts vorhanden.</p></div> : posts.map(p => <Post key={p.id} post={p} onRefresh={loadData} />)}
    </div>
  )
}

// --- MEMBERS PAGE ---
function MembersPage() {
  const [members, setMembers] = useState([]);
  const apiFetch = useApi();
  useEffect(() => { apiFetch('/api/users').then(setMembers).catch(console.error) }, []);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-white mb-8">Club Mitglieder</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {members.map(m => (
          <Link key={m.id} to={`/profile/${m.id}`}>
            <div className="bg-dark-200 border border-dark-100 p-5 rounded-2xl hover:border-primary-500 hover:-translate-y-1 transition duration-200 shadow-md">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-20 h-20 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden border-4 border-dark-100 shadow-sm relative">
                  {m.avatar ? <img src={getImageUrl(m.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-2xl font-bold">{m.username[0].toUpperCase()}</span>}
                </div>
                <div>
                  <p className="text-white font-bold text-lg truncate w-full px-2">{m.display_name || m.username}</p>
                  <p className="text-primary-500 text-xs font-medium mt-0.5">@{m.username}</p>
                </div>
                {m.bio && <p className="text-gray-400 text-xs mt-2 line-clamp-2 italic px-2">"{m.bio}"</p>}
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
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 sm:p-10 rounded-3xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-dark-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dark-100"><span className="text-3xl">👟</span></div>
          <h2 className="text-white text-2xl font-bold">Willkommen zurück</h2>
        </div>
        <input type="text" placeholder="Username" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setU(e.target.value)} required />
        <input type="password" placeholder="Passwort" className="w-full mb-8 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setP(e.target.value)} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-xl font-bold transition shadow-lg text-lg">Einloggen</button>
        <p className="text-gray-500 text-sm mt-6 text-center">Neu im Club? <Link to="/register" className="text-primary-400 font-bold hover:underline">Registrieren</Link></p>
      </form>
    </div>
  )
}

function RegisterPage() {
  const [f, setF] = useState({ u: '', e: '', p: '', d: '' }), { register } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await register(f.u, f.e, f.p, f.d); nav('/'); } catch (err) { alert(err.message); } };
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-8">
      <form onSubmit={sub} className="bg-dark-200 p-8 sm:p-10 rounded-3xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-dark-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dark-100"><span className="text-3xl">🧦</span></div>
          <h2 className="text-white text-2xl font-bold">Mitglied werden</h2>
        </div>
        <input type="text" placeholder="Username" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setF({...f, u: e.target.value})} required />
        <input type="text" placeholder="Anzeigename (optional)" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setF({...f, d: e.target.value})} />
        <input type="email" placeholder="Email" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setF({...f, e: e.target.value})} required />
        <input type="password" placeholder="Passwort" className="w-full mb-8 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500 transition" onChange={e => setF({...f, p: e.target.value})} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-xl font-bold transition shadow-lg text-lg">Registrieren</button>
      </form>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-dark-300 flex items-center justify-center text-primary-500 font-bold text-xl">Lade Club...</div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-dark-300 text-gray-100 selection:bg-primary-500 selection:text-white">
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
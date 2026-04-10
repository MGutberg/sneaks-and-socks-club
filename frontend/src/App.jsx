import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'undefined' && envUrl !== '') return envUrl;
  return window.location.origin;
};
const API_URL = getApiUrl();
const getImageUrl = (path) => path ? (path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`) : null;

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

// --- NAVBAR ---
function Navbar() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  return (
    <nav className="bg-dark-200 border-b border-dark-100 p-4 sticky top-0 z-50 flex justify-between items-center">
      <div className="flex gap-4 items-center">
        <Link to="/" className="text-white font-bold text-lg">👟 Sneaks & Socks</Link>
        <Link to="/members" className="text-gray-400 hover:text-white transition text-sm ml-4 hidden sm:block">Members</Link>
      </div>
      {user && (
        <div className="flex gap-4 items-center">
          <Link to={`/profile/${user.id}`} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
              {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-xs font-bold">{user.username[0].toUpperCase()}</span>}
            </div>
            <span className="text-white text-sm hidden sm:block font-medium">{user.display_name || user.username}</span>
          </Link>
          <button onClick={() => { logout(); navigate('/login') }} className="text-red-400 hover:text-red-300 text-sm font-medium transition">Logout</button>
        </div>
      )}
    </nav>
  )
}

// --- POST COMPONENT ---
function Post({ post, onRefresh }) {
  const { user } = useAuth(); const apiFetch = useApi();
  const handleDelete = async () => { if (window.confirm("Post löschen?")) { await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' }); onRefresh(); } }
  return (
    <div className="bg-dark-200 p-4 rounded-xl border border-dark-100 mb-4 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${post.user_id}`}>
            <div className="w-10 h-10 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
              {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{post.username[0].toUpperCase()}</span>}
            </div>
          </Link>
          <div>
            <Link to={`/profile/${post.user_id}`} className="text-white text-sm font-bold hover:underline">{post.display_name || post.username}</Link>
            <p className="text-gray-500 text-xs">@{post.username}</p>
          </div>
        </div>
        {user?.id === post.user_id && <button onClick={handleDelete} className="text-gray-600 hover:text-red-500 transition">🗑️</button>}
      </div>
      <p className="text-gray-200 text-sm mt-2 whitespace-pre-wrap">{post.content}</p>
      {post.image && <img src={getImageUrl(post.image)} className="mt-3 rounded-lg w-full max-h-96 object-cover" />}
    </div>
  )
}

// --- HOME PAGE ---
function HomePage() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [image, setImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const apiFetch = useApi();

  const load = async () => { try { setPosts(await apiFetch('/api/posts')); } catch(e) {} };
  useEffect(() => { load() }, []);

  const submit = async (e) => { 
    e.preventDefault(); 
    if(!newPost.trim() && !image) return; 
    setPosting(true);
    try {
      const fd = new FormData();
      if (newPost) fd.append('content', newPost);
      if (image) fd.append('image', image);
      await apiFetch('/api/posts', { method: 'POST', body: fd }); 
      setNewPost(''); 
      setImage(null);
      load(); 
    } catch(err) { console.error(err) }
    finally { setPosting(false); }
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <form onSubmit={submit} className="mb-6 bg-dark-200 p-4 rounded-xl border border-dark-100">
        <textarea value={newPost} onChange={e => setNewPost(e.target.value)} className="w-full bg-dark-100 text-white p-3 rounded-lg outline-none resize-none border border-dark-100 focus:border-primary-500" placeholder="Was gibt's Neues?" rows={3} />
        {image && (
          <div className="mt-3 relative inline-block">
            <img src={URL.createObjectURL(image)} alt="Preview" className="h-20 rounded-lg object-cover border border-dark-100" />
            <button type="button" onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
          </div>
        )}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-dark-100">
          <label className="flex items-center gap-2 text-gray-400 hover:text-primary-400 cursor-pointer transition text-sm">
            <span>📷 Foto hinzufügen</span>
            <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="hidden" />
          </label>
          <button disabled={posting || (!newPost.trim() && !image)} className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-lg font-bold transition disabled:opacity-50">{posting ? 'Postet...' : 'Posten'}</button>
        </div>
      </form>
      {posts.length === 0 ? <div className="text-center text-gray-500 py-10">Keine Posts vorhanden</div> : posts.map(p => <Post key={p.id} post={p} onRefresh={load} />)}
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
    <div className="max-w-2xl mx-auto p-4 py-6">
      <div className="bg-dark-200 rounded-2xl p-6 border border-dark-100 mb-6">
        <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-primary-900 flex-shrink-0 flex items-center justify-center overflow-hidden border-4 border-dark-100 shadow-lg">
            {profile.avatar ? <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-4xl font-bold">{profile.username[0].toUpperCase()}</span>}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{profile.display_name || profile.username}</h1>
            <p className="text-primary-500 font-medium">@{profile.username}</p>
            {profile.bio && <p className="text-gray-300 mt-3">{profile.bio}</p>}
            
            <div className="flex flex-wrap gap-3 mt-4 text-sm text-gray-400">
              {profile.location && <span>📍 {profile.location}</span>}
              {profile.website && <span>🔗 <a href={profile.website} target="_blank" rel="noreferrer" className="text-primary-400 hover:underline">{profile.website}</a></span>}
              <span>📝 {posts.length} Posts</span>
            </div>
            
            {(profile.favorite_sneakers || profile.sneaker_size || profile.favorite_brands) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.favorite_sneakers && <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300">👟 {profile.favorite_sneakers}</span>}
                {profile.sneaker_size && <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300">📏 {profile.sneaker_size}</span>}
                {profile.favorite_brands && <span className="px-3 py-1 bg-dark-100 rounded-full text-xs text-gray-300">🏷️ {profile.favorite_brands}</span>}
              </div>
            )}

            {isOwnProfile && !editing && (
              <button onClick={() => setEditing(true)} className="mt-5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg font-medium transition">Profil bearbeiten</button>
            )}
          </div>
        </div>

        {editing && (
          <form onSubmit={handleEditSubmit} className="mt-8 pt-6 border-t border-dark-100">
            <h3 className="text-white font-bold mb-4">Profil bearbeiten</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Anzeigename</label>
                <input type="text" value={editForm.display_name || ''} onChange={e => setEditForm({...editForm, display_name: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Standort</label>
                <input type="text" value={editForm.location || ''} onChange={e => setEditForm({...editForm, location: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Bio</label>
                <textarea value={editForm.bio || ''} onChange={e => setEditForm({...editForm, bio: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" rows={2} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Website URL</label>
                <input type="url" value={editForm.website || ''} onChange={e => setEditForm({...editForm, website: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Lieblings Sneaker</label>
                <input type="text" value={editForm.favorite_sneakers || ''} onChange={e => setEditForm({...editForm, favorite_sneakers: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Sneaker Größe</label>
                <input type="text" value={editForm.sneaker_size || ''} onChange={e => setEditForm({...editForm, sneaker_size: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Lieblings Marken</label>
                <input type="text" value={editForm.favorite_brands || ''} onChange={e => setEditForm({...editForm, favorite_brands: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div className="sm:col-span-2 mt-2">
                <label className="block text-xs text-gray-400 mb-2">Profilbild ändern</label>
                <div className="flex items-center gap-4">
                  <input type="file" accept="image/*" onChange={e => setEditAvatar(e.target.files[0])} className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700" />
                  {editAvatar && <img src={URL.createObjectURL(editAvatar)} className="w-12 h-12 rounded-full object-cover" />}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition">Speichern</button>
              <button type="button" onClick={() => {setEditing(false); setEditForm(profile); setEditAvatar(null);}} className="bg-dark-100 hover:bg-dark-300 border border-dark-100 text-white px-6 py-2 rounded-lg font-medium transition">Abbrechen</button>
            </div>
          </form>
        )}
      </div>

      <h2 className="text-xl font-bold text-white mb-4 ml-1">Posts</h2>
      {posts.length === 0 ? <p className="text-gray-500 ml-1">Keine Posts vorhanden.</p> : posts.map(p => <Post key={p.id} post={p} onRefresh={loadData} />)}
    </div>
  )
}

// --- MEMBERS PAGE ---
function MembersPage() {
  const [members, setMembers] = useState([]);
  const apiFetch = useApi();
  useEffect(() => { apiFetch('/api/users').then(setMembers).catch(console.error) }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">Alle Mitglieder</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(m => (
          <Link key={m.id} to={`/profile/${m.id}`}>
            <div className="bg-dark-200 border border-dark-100 p-4 rounded-xl hover:border-primary-500 transition flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                {m.avatar ? <img src={getImageUrl(m.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{m.username[0].toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold truncate">{m.display_name || m.username}</p>
                <p className="text-gray-500 text-xs truncate">@{m.username}</p>
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
    <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-dark-300 px-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-xl">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">👟 Login</h2>
        <input type="text" placeholder="Username" className="w-full mb-4 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setU(e.target.value)} required />
        <input type="password" placeholder="Passwort" className="w-full mb-6 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setP(e.target.value)} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition">Einloggen</button>
        <p className="text-gray-500 text-xs mt-4 text-center">Neu? <Link to="/register" className="text-primary-400">Account erstellen</Link></p>
      </form>
    </div>
  )
}

function RegisterPage() {
  const [f, setF] = useState({ u: '', e: '', p: '', d: '' }), { register } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await register(f.u, f.e, f.p, f.d); nav('/'); } catch (err) { alert(err.message); } };
  return (
    <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-dark-300 px-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-xl">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">Registrieren</h2>
        <input type="text" placeholder="Username" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setF({...f, u: e.target.value})} required />
        <input type="text" placeholder="Anzeigename (optional)" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setF({...f, d: e.target.value})} />
        <input type="email" placeholder="Email" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setF({...f, e: e.target.value})} required />
        <input type="password" placeholder="Passwort" className="w-full mb-6 p-3 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:border-primary-500" onChange={e => setF({...f, p: e.target.value})} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition">Mitglied werden</button>
      </form>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-dark-300 flex items-center justify-center text-primary-500">Lade...</div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-dark-300">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<ProtectedRoute><Navbar /><Routes><Route path="/" element={<HomePage />} /><Route path="/profile/:id" element={<ProfilePage />} /><Route path="/members" element={<MembersPage />} /></Routes></ProtectedRoute>} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
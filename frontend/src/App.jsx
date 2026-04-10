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
      <Link to="/" className="text-white font-bold text-lg">👟 Sneaks & Socks</Link>
      {user && (
        <div className="flex gap-4 items-center">
          <Link to={`/profile/${user.id}`} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
              {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-xs font-bold">{user.username[0].toUpperCase()}</span>}
            </div>
            <span className="text-white text-sm hidden sm:block">{user.display_name || user.username}</span>
          </Link>
          <button onClick={() => { logout(); navigate('/login') }} className="text-red-400 text-sm">Logout</button>
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
            {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{post.username[0].toUpperCase()}</span>}
          </div>
          <div>
            <p className="text-white text-sm font-bold">{post.display_name || post.username}</p>
            <p className="text-gray-500 text-xs">@{post.username}</p>
          </div>
        </div>
        {user?.id === post.user_id && <button onClick={handleDelete} className="text-gray-600 hover:text-red-500">🗑️</button>}
      </div>
      <p className="text-gray-200 text-sm">{post.content}</p>
      {post.image && <img src={getImageUrl(post.image)} className="mt-3 rounded-lg w-full max-h-80 object-cover" />}
    </div>
  )
}

// --- PAGES ---
function HomePage() {
  const [posts, setPosts] = useState([]), [newPost, setNewPost] = useState(''), apiFetch = useApi();
  const load = async () => { try { setPosts(await apiFetch('/api/posts')); } catch(e) {} };
  useEffect(() => { load() }, []);
  const submit = async (e) => { e.preventDefault(); if(!newPost.trim()) return; await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ content: newPost }) }); setNewPost(''); load(); };
  return (
    <div className="max-w-xl mx-auto p-4">
      <form onSubmit={submit} className="mb-6 bg-dark-200 p-4 rounded-xl border border-dark-100">
        <textarea value={newPost} onChange={e => setNewPost(e.target.value)} className="w-full bg-dark-100 text-white p-3 rounded-lg outline-none" placeholder="Was gibt's Neues?" rows={3} />
        <div className="flex justify-end mt-2"><button className="bg-primary-600 text-white px-4 py-2 rounded-lg font-bold">Posten</button></div>
      </form>
      {posts.map(p => <Post key={p.id} post={p} onRefresh={load} />)}
    </div>
  )
}

function ProfilePage() {
  const { id } = useParams(); const [profile, setProfile] = useState(null), apiFetch = useApi();
  useEffect(() => { apiFetch(`/api/users/${id}`).then(setProfile).catch(console.error) }, [id]);
  if (!profile) return <div className="text-white p-10 text-center">Lade Profil...</div>;
  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="bg-dark-200 rounded-2xl p-8 border border-dark-100 text-center">
        <div className="w-24 h-24 rounded-full bg-primary-900 mx-auto mb-4 flex items-center justify-center overflow-hidden border-2 border-primary-500">
          {profile.avatar ? <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-3xl font-bold">{profile.username[0].toUpperCase()}</span>}
        </div>
        <h1 className="text-2xl font-bold text-white">{profile.display_name || profile.username}</h1>
        <p className="text-primary-500">@{profile.username}</p>
        {profile.bio && <p className="text-gray-300 mt-4 italic">{profile.bio}</p>}
      </div>
    </div>
  )
}

function LoginPage() {
  const [u, setU] = useState(''), [p, setP] = useState(''), { login } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await login(u, p); nav('/'); } catch (err) { alert(err.message); } };
  return (
    <div className="flex items-center justify-center h-screen bg-dark-300 p-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">👟 Login</h2>
        <input type="text" placeholder="Username" className="w-full mb-4 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setU(e.target.value)} required />
        <input type="password" placeholder="Passwort" className="w-full mb-6 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setP(e.target.value)} required />
        <button className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold">Einloggen</button>
        <p className="text-gray-500 text-xs mt-4 text-center">Noch kein Mitglied? <Link to="/register" className="text-primary-400">Registrieren</Link></p>
      </form>
    </div>
  )
}

function RegisterPage() {
  const [f, setF] = useState({ u: '', e: '', p: '', d: '' }), { register } = useAuth(), nav = useNavigate();
  const sub = async (e) => { e.preventDefault(); try { await register(f.u, f.e, f.p, f.d); nav('/'); } catch (err) { alert(err.message); } };
  return (
    <div className="flex items-center justify-center h-screen bg-dark-300 p-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">Registrieren</h2>
        <input type="text" placeholder="Username" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, u: e.target.value})} required />
        <input type="email" placeholder="Email" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, e: e.target.value})} required />
        <input type="password" placeholder="Passwort" className="w-full mb-6 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, p: e.target.value})} required />
        <button className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold">Mitglied werden</button>
      </form>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-dark-300 flex items-center justify-center text-primary-500 font-bold">Lade Club...</div>;
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
            <Route path="/*" element={<ProtectedRoute><Navbar /><Routes><Route path="/" element={<HomePage />} /><Route path="/profile/:id" element={<ProfilePage />} /></Routes></ProtectedRoute>} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
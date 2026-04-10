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
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (err) {
        console.error("Auth server unreachable", err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username, password }) 
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  )
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

// --- Komponenten ---

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="bg-dark-200 border-b border-dark-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">👟🧦</span>
            <span className="font-bold text-lg text-white">Sneaks & Socks Club</span>
          </Link>
          
          {user && (
            <div className="flex items-center gap-4">
              <Link to={`/profile/${user.id}`} className="flex items-center gap-3 hover:opacity-80 transition">
                <div className="w-9 h-9 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden border border-primary-500/30">
                  {user.avatar ? (
                    <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <span className="text-primary-400 font-bold text-sm">
                      {(user.display_name || user.username || "U")[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-white font-medium hidden sm:block">
                  {user.display_name || user.username}
                </span>
              </Link>
              <button 
                onClick={() => { logout(); navigate('/login') }} 
                className="text-gray-500 hover:text-red-400 transition text-sm font-medium"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

function Post({ post, onRefresh }) {
  const { user } = useAuth();
  const apiFetch = useApi();

  const handleDelete = async () => {
    if (window.confirm("Post löschen?")) {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      onRefresh();
    }
  }

  return (
    <div className="bg-dark-200 p-5 rounded-xl border border-dark-100 mb-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
            {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{post.username[0].toUpperCase()}</span>}
          </div>
          <div>
            <p className="text-white font-bold leading-none">{post.display_name || post.username}</p>
            <p className="text-gray-500 text-xs mt-1">@{post.username}</p>
          </div>
        </div>
        {user?.id === post.user_id && (
          <button onClick={handleDelete} className="text-gray-600 hover:text-red-500 transition">
            🗑️
          </button>
        )}
      </div>
      <p className="text-gray-200 whitespace-pre-wrap">{post.content}</p>
      {post.image && <img src={getImageUrl(post.image)} className="mt-4 rounded-lg w-full object-cover max-h-96" alt="Post" />}
    </div>
  )
}

function HomePage() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const apiFetch = useApi();

  const load = async () => {
    try {
      const data = await apiFetch('/api/posts');
      setPosts(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load() }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    await apiFetch('/api/posts', { 
      method: 'POST', 
      body: JSON.stringify({ content: newPost }) 
    });
    setNewPost('');
    load();
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <form onSubmit={submit} className="mb-8 bg-dark-200 p-4 rounded-xl border border-dark-100">
        <textarea 
          value={newPost} 
          onChange={e => setNewPost(e.target.value)} 
          className="w-full bg-dark-100 text-white p-4 rounded-lg border border-dark-100 focus:ring-2 focus:ring-primary-500 outline-none resize-none" 
          placeholder="Was gibt's Neues im Club?" 
          rows={3}
        />
        <div className="flex justify-end mt-3">
          <button className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-bold transition">Posten</button>
        </div>
      </form>
      {posts.length === 0 ? (
        <p className="text-center text-gray-500 mt-10">Noch keine Posts vorhanden...</p>
      ) : (
        posts.map(p => <Post key={p.id} post={p} onRefresh={load} />)
      )}
    </div>
  )
}

function ProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const apiFetch = useApi();

  useEffect(() => {
    apiFetch(`/api/users/${id}`).then(setProfile).catch(console.error);
  }, [id]);

  if (!profile) return <div className="text-white p-10 text-center">Lade Profil...</div>;

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="bg-dark-200 rounded-2xl p-8 border border-dark-100 text-center">
        <div className="w-32 h-32 rounded-full bg-primary-900 mx-auto mb-6 flex items-center justify-center overflow-hidden border-4 border-dark-100 shadow-xl">
          {profile.avatar ? (
            <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" />
          ) : (
            <span className="text-primary-400 text-5xl font-bold">{profile.username[0].toUpperCase()}</span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-white">{profile.display_name || profile.username}</h1>
        <p className="text-primary-500 font-medium mt-1">@{profile.username}</p>
        {profile.bio && <p className="text-gray-300 mt-4 italic">"{profile.bio}"</p>}
        
        <div className="grid grid-cols-2 gap-4 mt-8">
          <div className="bg-dark-100 p-3 rounded-xl border border-dark-100">
            <p className="text-gray-500 text-xs uppercase font-bold">Location</p>
            <p className="text-white">{profile.location || 'Unbekannt'}</p>
          </div>
          <div className="bg-dark-100 p-3 rounded-xl border border-dark-100">
            <p className="text-gray-500 text-xs uppercase font-bold">Website</p>
            <p className="text-primary-400 truncate">{profile.website || 'Keine Angabe'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  const [u, setU] = useState(''), [p, setP] = useState(''), { login } = useAuth(), nav = useNavigate();
  const sub = async (e) => {
    e.preventDefault();
    try { await login(u, p); nav('/'); } catch (err) { alert("Fehler: " + err.message); }
  };
  return (
    <div className="flex items-center justify-center h-screen bg-dark-300 px-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <div className="text-center mb-8">
          <span className="text-5xl">👟</span>
          <h2 className="text-white text-2xl font-bold mt-4">Willkommen zurück</h2>
        </div>
        <input type="text" placeholder="Benutzername" className="w-full mb-4 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:ring-2 focus:ring-primary-500" onChange={e => setU(e.target.value)} required />
        <input type="password" placeholder="Passwort" className="w-full mb-8 p-4 rounded-xl bg-dark-100 text-white border border-dark-100 outline-none focus:ring-2 focus:ring-primary-500" onChange={e => setP(e.target.value)} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-xl font-bold transition shadow-lg">Einloggen</button>
        <p className="text-gray-500 text-sm mt-6 text-center">Neu hier? <Link to="/register" className="text-primary-400 font-bold">Account erstellen</Link></p>
      </form>
    </div>
  )
}

function RegisterPage() {
  const [f, setF] = useState({ u: '', e: '', p: '', d: '' }), { register } = useAuth(), nav = useNavigate();
  const sub = async (e) => {
    e.preventDefault();
    try { await register(f.u, f.e, f.p, f.d); nav('/'); } catch (err) { alert(err.message); }
  };
  return (
    <div className="flex items-center justify-center h-screen bg-dark-300 px-4">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-2xl w-full max-w-sm border border-dark-100 shadow-2xl">
        <h2 className="text-white text-2xl font-bold mb-8 text-center">Mitglied werden 🧦</h2>
        <input type="text" placeholder="Username" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, u: e.target.value})} required />
        <input type="text" placeholder="Anzeigename (optional)" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, d: e.target.value})} />
        <input type="email" placeholder="Email" className="w-full mb-3 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, e: e.target.value})} required />
        <input type="password" placeholder="Passwort" className="w-full mb-8 p-3 rounded-xl bg-dark-100 text-white border border-dark-100" onChange={e => setF({...f, p: e.target.value})} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-xl font-bold transition shadow-lg">Registrieren</button>
      </form>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-dark-300 flex items-center justify-center text-primary-500 font-bold">Lade Club-Daten...</div>;
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
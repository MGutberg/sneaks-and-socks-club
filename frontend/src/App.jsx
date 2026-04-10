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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="text-white p-8">Lade Club-Daten...</div>;
  return user ? children : <Navigate to="/login" />;
}

function LoginPage() {
  const [u, setU] = useState(''), [p, setP] = useState(''), { login } = useAuth(), nav = useNavigate();
  const sub = async (e) => {
    e.preventDefault();
    try { await login(u, p); nav('/'); } catch (err) { alert("Fehler: " + err.message); }
  };
  return (
    <div className="flex items-center justify-center h-screen bg-dark-300">
      <form onSubmit={sub} className="bg-dark-200 p-8 rounded-xl w-80 border border-dark-100">
        <h2 className="text-white text-2xl font-bold mb-6 text-center">👟 Login</h2>
        <input type="text" placeholder="Username" className="w-full mb-3 p-3 rounded bg-dark-100 text-white border border-dark-100" onChange={e => setU(e.target.value)} required />
        <input type="password" placeholder="Passwort" className="w-full mb-6 p-3 rounded bg-dark-100 text-white border border-dark-100" onChange={e => setP(e.target.value)} required />
        <button className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg font-bold transition">Einloggen</button>
        <p className="text-gray-500 text-xs mt-4 text-center">Noch kein Mitglied? <Link to="/register" className="text-primary-400">Registrieren</Link></p>
      </form>
    </div>
  )
}

// Hier folgen die restlichen Seiten (HomePage, Navbar etc.) - der Kürze halber zusammengefasst
function Navbar() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  return (
    <nav className="bg-dark-200 border-b border-dark-100 p-4 flex justify-between items-center">
      <Link to="/" className="text-white font-bold">👟 Sneaks & Socks</Link>
      <div className="flex gap-4 items-center">
        <span className="text-gray-400 text-sm">{user?.username}</span>
        <button onClick={() => { logout(); navigate('/login') }} className="text-red-400 text-sm">Logout</button>
      </div>
    </nav>
  )
}

function HomePage() {
  const [posts, setPosts] = useState([]), [newPost, setNewPost] = useState(''), apiFetch = useApi();
  const load = async () => { try { setPosts(await apiFetch('/api/posts')); } catch(e) {} };
  useEffect(() => { load() }, []);
  const submit = async (e) => { e.preventDefault(); await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ content: newPost }) }); setNewPost(''); load(); };
  return (
    <div className="max-w-xl mx-auto p-4">
      <form onSubmit={submit} className="mb-6">
        <textarea value={newPost} onChange={e => setNewPost(e.target.value)} className="w-full bg-dark-100 text-white p-3 rounded-lg border border-dark-100" placeholder="Was gibt's Neues?" />
        <button className="bg-primary-600 text-white px-4 py-2 mt-2 rounded-lg">Posten</button>
      </form>
      {posts.map(p => (
        <div key={p.id} className="bg-dark-200 p-4 rounded-xl border border-dark-100 mb-4 text-white">
          <p className="font-bold">@{p.username}</p>
          <p className="mt-2">{p.content}</p>
        </div>
      ))}
    </div>
  )
}

// ... RegisterPage und ProfilePage analog dazu ...
function RegisterPage() { return <div className="text-white p-8">Register Seite (analog zu Login)</div> }
function ProfilePage() { return <div className="text-white p-8">Profil Seite</div> }

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
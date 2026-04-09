import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'

// Get API URL - properly handle undefined env var
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'undefined' && envUrl !== '') {
    return envUrl;
  }
  return window.location.origin;
};
const API_URL = getApiUrl();

// Helper to get full image URL from relative path
const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
};

// ============ AUTH CONTEXT ============
const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            const data = await res.json()
            setUser(data)
          } else {
            // Nur bei echtem 401/403 ausloggen, nicht bei Server-Schluckauf
            if (res.status === 401 || res.status === 403) {
              logout()
            }
          }
        } catch (err) {
          console.error("Auth check failed", err)
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [token])

  const login = async (username, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }

  const register = async (username, email, password, display_name) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, display_name })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  const updateUser = (userData) => {
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

const useAuth = () => useContext(AuthContext)

// ============ API HELPER ============
function useApi() {
  const { token, logout } = useAuth()
  
  const apiFetch = async (endpoint, options = {}) => {
    // Dynamische Header-Erstellung
    const headers = { ...options.headers }
    
    // WICHTIG: Bei FormData darf KEIN Content-Type gesetzt werden!
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
    
    if (res.status === 401 || res.status === 403) {
      logout()
      throw new Error("Sitzung abgelaufen")
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || 'Server Fehler')
    }
    
    return res.json()
  }
  return apiFetch
}

// ============ NAVBAR ============
function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <nav className="bg-dark-200 border-b border-dark-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-14">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">👟🧦</span>
            <span className="font-bold text-lg text-white">Sneaks & Socks Club</span>
          </Link>
          
          {user && (
            <div className="flex items-center gap-4">
              <Link to="/members" className="text-gray-400 hover:text-white transition">
                Members
              </Link>
              <Link to={`/profile/${user.id}`} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center">
                  {user.avatar ? (
                    <img src={getImageUrl(user.avatar)} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-primary-400 font-semibold">{user.username[0].toUpperCase()}</span>
                  )}
                </div>
                <span className="text-white font-medium">{user.display_name || user.username}</span>
              </Link>
              <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-red-400 transition">
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

// ============ AUTH PAGES ============
function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-300 px-4">
      <div className="max-w-md w-full bg-dark-200 rounded-xl shadow-lg p-8 border border-dark-100">
        <div className="text-center mb-8">
          <span className="text-5xl">👟🧦</span>
          <h1 className="text-2xl font-bold text-white mt-2">Welcome Back</h1>
          <p className="text-gray-400">Login to Sneaks & Socks Club</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-900/30 text-red-400 p-3 rounded-lg text-sm border border-red-900">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username or Email</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-dark-100 border border-dark-100 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-dark-100 border border-dark-100 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <p className="text-center text-gray-400 mt-6">
          Don't have an account? <Link to="/register" className="text-primary-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

function RegisterPage() {
  const [formData, setFormData] = useState({ username: '', email: '', password: '', display_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading]

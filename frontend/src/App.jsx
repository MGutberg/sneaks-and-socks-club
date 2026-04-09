import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'

// Get API URL
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'undefined' && envUrl !== '') return envUrl;
  return window.location.origin;
};
const API_URL = getApiUrl();

const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
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
          if (res.ok) setUser(await res.json())
          else if (res.status === 401 || res.status === 403) logout()
        } catch (err) { console.error("Auth check failed", err) }
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

  const updateUser = (userData) => setUser(userData)

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
  return async (endpoint, options = {}) => {
    const headers = { ...options.headers }
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
    if (res.status === 401 || res.status === 403) { logout(); throw new Error("Session expired") }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || 'Server error')
    }
    return res.json()
  }
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
              <Link to="/members" className="text-gray-400 hover:text-white transition">Members</Link>
              <Link to={`/profile/${user.id}`} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
                  {user.avatar ? <img src={getImageUrl(user.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-semibold">{user.username[0].toUpperCase()}</span>}
                </div>
                <span className="text-white font-medium">{user.display_name || user.username}</span>
              </Link>
              <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-red-400 transition">Logout</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

// ============ COMPONENTS ============
function Post({ post, onRefresh }) {
  const { user } = useAuth()
  const apiFetch = useApi()
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [liked, setLiked] = useState(!!post.liked)
  const [likeCount, setLikeCount] = useState(post.like_count || 0)

  const handleLike = async () => {
    try {
      const result = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' })
      setLiked(!!result.liked)
      setLikeCount(prev => result.liked ? prev + 1 : prev - 1)
    } catch (err) { console.error('Like error:', err) }
  }

  const handleDelete = async () => {
    if (!window.confirm("Möchtest du diesen Post wirklich löschen?")) return;
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      onRefresh && onRefresh();
    } catch (err) { alert("Fehler beim Löschen: " + err.message); }
  }

  const loadComments = async () => {
    try { setComments(await apiFetch(`/api/posts/${post.id}/comments`)) }
    catch (err) { console.error('Load comments error:', err) }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return
    try {
      const comment = await apiFetch(`/api/posts/${post.id}/comments`, { method: 'POST', body: JSON.stringify({ content: newComment }) })
      setComments([...comments, comment])
      setNewComment('')
      onRefresh && onRefresh()
    } catch (err) { console.error('Comment error:', err) }
  }

  return (
    <div className="bg-dark-200 rounded-xl shadow-lg border border-dark-100 p-4">
      <div className="flex items-start gap-3">
        <Link to={`/profile/${post.user_id}`}>
          <div className="w-10 h-10 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden flex-shrink-0">
            {post.avatar ? <img src={getImageUrl(post.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-semibold">{post.username[0].toUpperCase()}</span>}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={`/profile/${post.user_id}`} className="font-semibold text-white hover:underline">{post.display_name || post.username}</Link>
              <span className="text-gray-500 text-sm">@{post.username}</span>
            </div>
            {user?.id === post.user_id && (
              <button onClick={handleDelete} className="text-gray-500 hover:text-red-500 transition text-sm" title="Post löschen">🗑️</button>
            )}
          </div>
          <p className="mt-1 text-gray-200 whitespace-pre-wrap">{post.content}</p>
          {post.image && <img src={getImageUrl(post.image)} alt="Post" className="mt-3 rounded-xl max-h-96 w-full object-cover" />}
          <div className="flex items-center gap-6 mt-3">
            <button onClick={handleLike} className={`flex items-center gap-1.5 transition ${liked ? 'text-red-400' : 'text-gray-400 hover:text-red-400'}`}>
              <span className="text-lg">{liked ? '❤️' : '🤍'}</span>
              <span className="text-sm">{likeCount}</span>
            </button>
            <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments() }} className="flex items-center gap-1.5 text-gray-400 hover:text-primary-400">
              <span className="text-lg">💬</span>
              <span className="text-sm">{post.comment_count || 0}</span>
            </button>
          </div>
          {showComments && (
            <div className="mt-4 pt-4 border-t border-dark-100">
              <form onSubmit={handleComment} className="flex gap-2 mb-4">
                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Schreibe einen Kommentar..." className="flex-1 px-3 py-2 bg-dark-100 border border-dark-100 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary-500" />
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">Senden</button>
              </form>
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-dark-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {c.avatar ? <img src={getImageUrl(c.avatar)} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs font-semibold">{c.username[0].toUpperCase()}</span>}
                    </div>
                    <div className="bg-dark-100 rounded-lg px-3 py-2 flex-1">
                      <p className="font-semibold text-xs text-white">@{c.username}</p>
                      <p className="text-gray-300 text-sm">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ PAGES ============

function HomePage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [image, setImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const apiFetch = useApi();

  const loadPosts = async () => {
    try { setPosts(await apiFetch('/api/posts')) }
    catch (err) { console.error('Load posts error:', err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPosts() }, [])

  const handlePost = async (e) => {
    e.preventDefault();
    if (!newPost.trim() && !image) return;
    setPosting(true);
    try {
      const formData = new FormData();
      if (newPost) formData.append('content', newPost);
      if (image) formData.append('image', image);
      await apiFetch('/api/posts', { method: 'POST', body: formData });
      setNewPost(''); setImage(null); loadPosts();
    } catch (err) { console.error('Post error:', err) }
    finally { setPosting(false) }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <form onSubmit={handlePost} className="bg-dark-200 rounded-xl border border-dark-100 p-4 mb-6">
        <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Was gibt's Neues?" className="w-full bg-dark-100 border border-dark-100 rounded-lg p-3 text-white resize-none" rows={3} />
        {image && <div className="mt-2 relative inline-block"><img src={URL.createObjectURL(image)} className="h-20 rounded" /><button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button></div>}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-dark-100">
          <label className="text-gray-400 hover:text-primary-400 cursor-pointer text-sm">📷 Foto hinzufügen <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="hidden" /></label>
          <button type="submit" disabled={posting} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">{posting ? 'Postet...' : 'Posten'}</button>
        </div>
      </form>
      {loading ? <div className="text-center text-gray-500">Lade Posts...</div> : <div className="space-y-4">{posts.map(p => <Post key={p.id} post={p} onRefresh={loadPosts} />)}</div>}
    </div>
  )
}

function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editAvatar, setEditAvatar] = useState(null);
  const apiFetch = useApi();

  const loadData = async () => {
    try {
      const [p, ps] = await Promise.all([apiFetch(`/api/users/${id}`), apiFetch(`/api/users/${id}/posts`)]);
      setProfile(p); setPosts(ps); setEditForm(p);
    } catch (err) { console.error(err) }
  }

  useEffect(() => { loadData() }, [id]);

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      ['display_name', 'bio', 'location', 'website', 'favorite_sneakers', 'favorite_socks', 'sneaker_size', 'sock_size', 'favorite_brands'].forEach(k => fd.append(k, editForm[k] || ''));
      if (editAvatar) fd.append('avatar', editAvatar);
      const updated = await apiFetch(`/api/users/${id}`, { method: 'PUT', body: fd });
      setProfile(updated); if (currentUser.id === id) updateUser(updated);
      setEditing(false); setEditAvatar(null); loadData();
    } catch (err) { alert(err.message) }
  }

  if (!profile) return <div className="text-center py-12 text-gray-500">Lade Profil...</div>

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-dark-200 rounded-xl border border-dark-100 p-6 mb-8">
        <div className="flex gap-4 items-start">
          <div className="w-24 h-24 rounded-full bg-primary-900 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {profile.avatar ? <img src={getImageUrl(profile.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 text-3xl font-bold">{profile.username[0].toUpperCase()}</span>}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{profile.display_name || profile.username}</h1>
            <p className="text-gray-500">@{profile.username}</p>
            {profile.bio && <p className="text-gray-300 mt-2">{profile.bio}</p>}
            {currentUser?.id === id && !editing && <button onClick={() => setEditing(true)} className="mt-4 px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm">Profil bearbeiten</button>}
          </div>
        </div>
        {editing && (
          <form onSubmit={handleEdit} className="mt-6 space-y-4 border-t border-dark-100 pt-6">
            <input type="text" value={editForm.display_name} onChange={e => setEditForm({...editForm, display_name: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2 text-white" placeholder="Anzeigename" />
            <textarea value={editForm.bio} onChange={e => setEditForm({...editForm, bio: e.target.value})} className="w-full bg-dark-100 border border-dark-100 rounded-lg p-2 text-white" placeholder="Bio" />
            <div className="flex items-center gap-4"><label className="text-xs text-gray-400">Neues Profilbild:</label><input type="file" accept="image/*" onChange={e => setEditAvatar(e.target.files[0])} className="text-xs text-gray-500" /></div>
            <div className="flex gap-2"><button type="submit" className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm">Speichern</button><button type="button" onClick={() => setEditing(false)} className="bg-dark-100 text-white px-4 py-2 rounded-lg text-sm">Abbrechen</button></div>
          </form>
        )}
      </div>
      <h2 className="text-xl font-bold text-white mb-4">Posts</h2>
      <div className="space-y-4">{posts.map(p => <Post key={p.id} post={p} onRefresh={loadData} />)}</div>
    </div>
  )
}

function MembersPage() {
  const [members, setMembers] = useState([]);
  const apiFetch = useApi();
  useEffect(() => { apiFetch('/api/users').then(setMembers) }, []);
  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold text-white mb-6">Mitglieder</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {members.map(m => (
          <Link key={m.id} to={`/profile/${m.id}`} className="bg-dark-200 border border-dark-100 p-4 rounded-xl hover:border-primary-500 transition">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-900 flex items-center justify-center overflow-hidden">
                {m.avatar ? <img src={getImageUrl(m.avatar)} className="w-full h-full object-cover" /> : <span className="text-primary-400 font-bold">{m.username[0].toUpperCase()}</span>}
              </div>
              <div><p className="text-white font-semibold">{m.display_name || m.username}</p><p className="text-gray-500 text-xs">@{m.username}</p></div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function App() {
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

function LoginPage() { /* ... wie zuvor ... */ }
function RegisterPage() { /* ... wie zuvor ... */ }
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
}

export default App
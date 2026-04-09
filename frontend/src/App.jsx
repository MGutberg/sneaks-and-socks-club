import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || ''

// ============ AUTH CONTEXT ============
const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setUser(data)
          else {
            localStorage.removeItem('token')
            setToken(null)
          }
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
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

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

const useAuth = () => useContext(AuthContext)

// ============ API HELPER ============
function useApi() {
  const { token } = useAuth()
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      ...options.headers,
      'Content-Type': options.body instanceof FormData ? undefined : 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error)
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
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-14">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">👟🧦</span>
            <span className="font-bold text-lg text-gray-800">Sneaks & Socks Club</span>
          </Link>
          
          {user && (
            <div className="flex items-center gap-4">
              <Link to="/members" className="text-gray-600 hover:text-primary-600 transition">
                Members
              </Link>
              <Link to={`/profile/${user.id}`} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  {user.avatar ? (
                    <img src={user.avatar} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-primary-600 font-semibold">{user.username[0].toUpperCase()}</span>
                  )}
                </div>
                <span className="text-gray-700 font-medium">{user.display_name || user.username}</span>
              </Link>
              <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-red-500 transition">
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <span className="text-5xl">👟🧦</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Welcome Back</h1>
          <p className="text-gray-500">Login to Sneaks & Socks Club</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
        
        <p className="text-center text-gray-500 mt-6">
          Don't have an account? <Link to="/register" className="text-primary-600 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

function RegisterPage() {
  const [formData, setFormData] = useState({ username: '', email: '', password: '', display_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(formData.username, formData.email, formData.password, formData.display_name)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <span className="text-5xl">👟🧦</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Join the Club</h1>
          <p className="text-gray-500">Create your Sneaks & Socks account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={e => setFormData({ ...formData, display_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        
        <p className="text-center text-gray-500 mt-6">
          Already have an account? <Link to="/login" className="text-primary-600 hover:underline">Login</Link>
        </p>
      </div>
    </div>
  )
}

// ============ POST COMPONENT ============
function Post({ post, onRefresh }) {
  const { user } = useAuth()
  const apiFetch = useApi()
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [liked, setLiked] = useState(post.liked)
  const [likeCount, setLikeCount] = useState(post.like_count)

  const handleLike = async () => {
    try {
      const result = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' })
      setLiked(result.liked)
      setLikeCount(prev => result.liked ? prev + 1 : prev - 1)
    } catch (err) {
      console.error('Like error:', err)
    }
  }

  const loadComments = async () => {
    try {
      const data = await apiFetch(`/api/posts/${post.id}/comments`)
      setComments(data)
    } catch (err) {
      console.error('Load comments error:', err)
    }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return
    try {
      const comment = await apiFetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment })
      })
      setComments([...comments, comment])
      setNewComment('')
      onRefresh && onRefresh()
    } catch (err) {
      console.error('Comment error:', err)
    }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <Link to={`/profile/${post.user_id}`}>
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            {post.avatar ? (
              <img src={post.avatar} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-primary-600 font-semibold">{post.username[0].toUpperCase()}</span>
            )}
          </div>
        </Link>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/profile/${post.user_id}`} className="font-semibold text-gray-800 hover:underline">
              {post.display_name || post.username}
            </Link>
            <span className="text-gray-400 text-sm">@{post.username}</span>
            <span className="text-gray-400 text-sm">· {formatDate(post.created_at)}</span>
          </div>
          
          <p className="mt-1 text-gray-700 whitespace-pre-wrap">{post.content}</p>
          
          {post.image && (
            <img 
              src={post.image} 
              alt="Post image" 
              className="mt-3 rounded-lg max-h-96 w-full object-cover"
            />
          )}
          
          <div className="flex items-center gap-6 mt-3">
            <button 
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition ${liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
            >
              <span className="text-lg">{liked ? '❤️' : '🤍'}</span>
              <span className="text-sm">{likeCount}</span>
            </button>
            
            <button 
              onClick={() => { setShowComments(!showComments); if (!showComments) loadComments() }}
              className="flex items-center gap-1.5 text-gray-500 hover:text-primary-500 transition"
            >
              <span className="text-lg">💬</span>
              <span className="text-sm">{post.comment_count}</span>
            </button>
          </div>
          
          {showComments && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <form onSubmit={handleComment} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button 
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition"
                >
                  Post
                </button>
              </form>
              
              <div className="space-y-3">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-2">
                    <Link to={`/profile/${comment.user_id}`}>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {comment.avatar ? (
                          <img src={comment.avatar} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-gray-600 text-sm font-semibold">{comment.username[0].toUpperCase()}</span>
                        )}
                      </div>
                    </Link>
                    <div>
                      <div className="bg-gray-50 rounded-lg px-3 py-2">
                        <Link to={`/profile/${comment.user_id}`} className="font-semibold text-sm text-gray-800 hover:underline">
                          {comment.display_name || comment.username}
                        </Link>
                        <p className="text-gray-700 text-sm mt-0.5">{comment.content}</p>
                      </div>
                      <span className="text-xs text-gray-400 ml-2">{formatDate(comment.created_at)}</span>
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

// ============ HOME PAGE ============
function HomePage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [newPost, setNewPost] = useState('')
  const [image, setImage] = useState(null)
  const [posting, setPosting] = useState(false)
  const apiFetch = useApi()

  const loadPosts = async () => {
    try {
      const data = await apiFetch('/api/posts')
      setPosts(data)
    } catch (err) {
      console.error('Load posts error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPosts() }, [])

  const handlePost = async (e) => {
    e.preventDefault()
    if (!newPost.trim() && !image) return
    
    setPosting(true)
    try {
      const formData = new FormData()
      if (newPost) formData.append('content', newPost)
      if (image) formData.append('image', image)
      
      await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      })
      
      setNewPost('')
      setImage(null)
      loadPosts()
    } catch (err) {
      console.error('Post error:', err)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <form onSubmit={handlePost}>
          <textarea
            value={newPost}
            onChange={e => setNewPost(e.target.value)}
            placeholder="What's new with your sneaks or socks?"
            className="w-full resize-none border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            rows={3}
          />
          
          {image && (
            <div className="mt-3 relative inline-block">
              <img src={URL.createObjectURL(image)} alt="Preview" className="h-24 rounded-lg object-cover" />
              <button 
                type="button"
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm"
              >
                ×
              </button>
            </div>
          )}
          
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
            <label className="flex items-center gap-2 text-gray-500 hover:text-primary-600 cursor-pointer transition">
              <span className="text-lg">📷</span>
              <span className="text-sm">Add Photo</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={e => setImage(e.target.files[0])}
                className="hidden"
              />
            </label>
            
            <button 
              type="submit"
              disabled={posting || (!newPost.trim() && !image)}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </div>
      
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-6xl">👟🧦</span>
          <p className="text-gray-500 mt-4">No posts yet. Be the first to share!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <Post key={post.id} post={post} onRefresh={loadPosts} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============ PROFILE PAGE ============
function ProfilePage() {
  const { id } = useParams()
  const { user: currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const apiFetch = useApi()

  const isOwnProfile = currentUser?.id === id

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [profileData, postsData] = await Promise.all([
          apiFetch(`/api/users/${id}`),
          apiFetch(`/api/users/${id}/posts`)
        ])
        setProfile(profileData)
        setPosts(postsData)
      } catch (err) {
        console.error('Load profile error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [id])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>
  if (!profile) return <div className="text-center py-12 text-gray-500">User not found</div>

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center">
            {profile.avatar ? (
              <img src={profile.avatar} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-primary-600 text-4xl font-bold">{profile.username[0].toUpperCase()}</span>
            )}
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-800">{profile.display_name || profile.username}</h1>
            <p className="text-gray-500">@{profile.username}</p>
            {profile.bio && <p className="text-gray-700 mt-2">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-3 text-gray-500 text-sm">
              <span>📝 {profile.post_count} posts</span>
              <span>📅 Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
      
      <h2 className="text-xl font-bold text-gray-800 mt-8 mb-4">Posts</h2>
      
      {posts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {isOwnProfile ? "You haven't posted yet." : "No posts yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <Post key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============ MEMBERS PAGE ============
function MembersPage() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const apiFetch = useApi()

  useEffect(() => {
    apiFetch('/api/users')
      .then(setMembers)
      .catch(err => console.error('Load members error:', err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading members...</div>

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Community Members</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {members.map(member => (
          <Link key={member.id} to={`/profile/${member.id}`}>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                  {member.avatar ? (
                    <img src={member.avatar} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-primary-600 font-bold">{member.username[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{member.display_name || member.username}</p>
                  <p className="text-gray-500 text-sm">@{member.username}</p>
                </div>
              </div>
              {member.bio && <p className="text-gray-600 text-sm mt-2 line-clamp-2">{member.bio}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ============ PROTECTED ROUTE ============
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  
  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  
  return children
}

// ============ MAIN APP ============
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <>
                    <Navbar />
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/profile/:id" element={<ProfilePage />} />
                      <Route path="/members" element={<MembersPage />} />
                    </Routes>
                  </>
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

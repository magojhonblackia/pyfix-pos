import { createContext, useContext, useState, useCallback } from 'react'

const TOKEN_KEY = 'pyfix_token'
const USER_KEY  = 'pyfix_user'

const AuthContext = createContext(null)

function loadStored() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const user  = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }) {
  const stored = loadStored()
  const [token, setToken] = useState(stored.token)
  const [user,  setUser]  = useState(stored.user)

  const login = useCallback((tokenData) => {
    // tokenData = { access_token, user_id, username, full_name, role, permissions }
    const userInfo = {
      id:          tokenData.user_id,
      username:    tokenData.username,
      full_name:   tokenData.full_name,
      role:        tokenData.role,
      permissions: tokenData.permissions ?? [],
    }
    localStorage.setItem(TOKEN_KEY, tokenData.access_token)
    localStorage.setItem(USER_KEY,  JSON.stringify(userInfo))
    setToken(tokenData.access_token)
    setUser(userInfo)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export { TOKEN_KEY }

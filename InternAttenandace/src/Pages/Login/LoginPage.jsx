import { useState } from 'react'
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import './LoginPage.css'
import { loginUser, resetInternPassword } from '../../firebase'

/* ── Small inline icons (no extra packages needed) ── */
function Icon({ size = 18, children }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const CapIcon = () => (
  <Icon size={22}>
    <path d="M22 10 12 5 2 10l10 5 10-5Z" />
    <path d="M6 12v5c0 1.2 2.7 3 6 3s6-1.8 6-3v-5" />
    <path d="M22 10v6" />
  </Icon>
)
const UserIcon = () => (
  <Icon>
    <path d="M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
)
const LockIcon = () => (
  <Icon>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)
const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
const EyeOffIcon = () => (
  <Icon>
    <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
    <path d="m2 2 20 20" />
  </Icon>
)
const ArrowIcon = () => (
  <Icon size={16}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
)

export default function LoginPage({ onLogin }) {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [resetting, setResetting]       = useState(false)
  const [error, setError]               = useState('')
  const [notice, setNotice]             = useState('')
  // remember: true keeps the current behavior (stay signed in after closing the browser).
  // Set to false if you want interns to be signed out when they close the tab.
  const [form, setForm] = useState({ email: '', password: '', remember: true })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      // "Remember me": keep the session across browser restarts, or only for this tab.
      try {
        await setPersistence(
          getAuth(),
          form.remember ? browserLocalPersistence : browserSessionPersistence
        )
      } catch (persistErr) {
        console.error(persistErr) // fall back to Firebase's default
      }
      const user = await loginUser(form.email.trim(), form.password)
      onLogin(user.role, user)
    } catch (err) {
      setError(getFriendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async () => {
    setError('')
    setNotice('')
    if (!form.email.trim()) {
      setError('Enter your email above, then select Forgot password.')
      return
    }
    setResetting(true)
    try {
      await resetInternPassword(form.email.trim())
      setNotice('If an account exists for that email, a reset link is on its way. Check your inbox.')
    } catch (err) {
      setError(getFriendlyError(err.code))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="lp">
      {/* ── Brand panel ── */}
      <aside className="lp-panel">
        <div className="lp-brand">
          <span className="lp-brand-mark"><CapIcon /></span>
          <span className="lp-brand-text">
            <span className="lp-brand-name">OJTracker</span>
            <span className="lp-brand-tag">Your training. Connected.</span>
          </span>
        </div>

        <h2 className="lp-headline">Make every training hour count.</h2>
        <p className="lp-lede">
          One place to track OJT attendance, keep your hours in check,
          and move closer to your goals.
        </p>
      </aside>

      {/* ── Sign-in ── */}
      <main className="lp-main">
        <section className="lp-form-wrap">
          <p className="lp-eyebrow">Your OJT workspace</p>
          <h1 className="lp-title">Welcome back.</h1>

          <form onSubmit={handleSubmit}>
            <div className="lp-field">
              <label htmlFor="email">Email</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon"><UserIcon /></span>
                <input
                  id="email" name="email" type="email"
                  className="lp-input"
                  placeholder="Enter your email"
                  value={form.email} onChange={handleChange}
                  autoComplete="email" required
                />
              </div>
            </div>

            <div className="lp-field">
              <label htmlFor="password">Password</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon"><LockIcon /></span>
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="lp-input lp-input-pw"
                  placeholder="Enter your password"
                  value={form.password} onChange={handleChange}
                  autoComplete="current-password" required
                />
                <button
                  type="button" className="lp-toggle-pw"
                  onClick={() => setShowPassword(p => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error  && <div className="lp-alert lp-alert-error" role="alert">{error}</div>}
            {notice && <div className="lp-alert lp-alert-ok" role="status">{notice}</div>}

            <div className="lp-row">
              <label className="lp-remember">
                <input
                  type="checkbox" name="remember"
                  checked={form.remember} onChange={handleChange}
                />
                Remember me
              </label>
              <button
                type="button" className="lp-forgot"
                onClick={handleForgot} disabled={resetting}
              >
                {resetting ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>

            <button type="submit" className="lp-submit" disabled={loading}>
              {loading ? 'Signing in…' : <>Sign in <ArrowIcon /></>}
            </button>
          </form>
        </section>

        <footer className="lp-foot">© {new Date().getFullYear()} OJTracker</footer>
      </main>
    </div>
  )
}

function getFriendlyError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.'
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your admin.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
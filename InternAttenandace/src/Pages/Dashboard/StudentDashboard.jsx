import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import './StudentDashboard.css'
import AttendancePage from '../Attendance/AttendancePage'
import { timeIn, timeOut, getAttendanceLogs, getTasksForInternAll, updateTaskStatus, getUser, logoutUser, changePassword } from '../../firebase'
import ThemePicker from '../../components/ThemePicker'

/* ── Helpers ── */
function useClockTime() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function formatClock(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function formatDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}
function formatLogTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function toLocalDate(d) {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// GY shift: before noon, the active shift belongs to yesterday
function getActiveShiftDate(shift) {
  const now = new Date()
  if (shift === 'gy' && now.getHours() < 12) {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return toLocalDate(y)
  }
  return toLocalDate(now)
}
function formatLog(log) {
  const timeInStr  = log.timeIn?.toDate  ? formatLogTime(log.timeIn.toDate())  : '—'
  const timeOutStr = log.timeOut?.toDate ? formatLogTime(log.timeOut.toDate()) : '—'
  const dateStr    = log.date ? new Date(log.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }) : '—'
  return { date: dateStr, timeIn: timeInStr, timeOut: timeOutStr, duration: log.duration || '—' }
}

// Runs a state change inside a browser view transition (smooth morph) when supported;
// otherwise (older browsers, reduced-motion) it just applies the change instantly.
function withViewTransition(update) {
  const apply   = () => flushSync(update)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduced) { apply(); return }
  document.startViewTransition(apply)
}

const STATUS_LABELS   = { pending: 'Pending', 'in-progress': 'In Progress', done: 'Done' }
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' }
const SHIFT_LABELS    = { morning: 'Morning Shift', mid: 'Mid Shift', gy: 'GY Shift' }
const FILTERS         = ['All', 'Pending', 'In Progress', 'Done']

/* ── Small inline icons ── */
function Icon({ size = 16, children }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {children}
    </svg>
  )
}
const LogoutIcon = () => (
  <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>
)
const LockIcon = () => (
  <Icon><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
)
const MoonIcon = () => (
  <Icon><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></Icon>
)
const ArrowRightIcon = () => (
  <Icon size={15}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>
)
const ArrowDownIcon = () => (
  <Icon><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Icon>
)
const ArrowUpIcon = () => (
  <Icon><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Icon>
)
const ArrowLeftIcon = () => (
  <Icon size={15}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Icon>
)
const ChevronDownIcon = () => (
  <Icon size={14}><path d="m6 9 6 6 6-6" /></Icon>
)
const MinusIcon = () => (
  <Icon size={14}><path d="M5 12h14" /></Icon>
)
const BriefcaseIcon = () => (
  <Icon size={18}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></Icon>
)
const FileIcon = () => (
  <Icon size={18}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
    <path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </Icon>
)
const CheckCircleIcon = () => (
  <Icon size={18}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Icon>
)
function TaskIcon({ status }) {
  if (status === 'done')        return <CheckCircleIcon />
  if (status === 'in-progress') return <FileIcon />
  return <BriefcaseIcon />
}

/* ── Task row used in the expanded Tasks card ── */
function FullTaskRow({ task, uid, onStatusChange }) {
  const isGroup   = task.type === 'group'
  const isLeader  = isGroup && task.leaderUid === uid
  const canUpdate = !isGroup || isLeader
  const kindText  = !isGroup
    ? 'Solo task'
    : `Group task • ${isLeader ? 'You are the leader' : `Leader: ${task.leaderName || 'Group leader'}`} • ${task.memberUids?.length || 0} members`

  return (
    <div className="sd-task sd-task--full">
      <span className="sd-task-icon"><TaskIcon status={task.status} /></span>

      <div className="sd-task-body">
        <div className="sd-task-title">{task.title}</div>
        <div className="sd-task-sub">
          <span className={`sd-dot sd-dot--${task.priority}`} aria-hidden="true" />
          {PRIORITY_LABELS[task.priority] || 'Normal'} priority
          {task.assignedBy ? ` • Assigned by ${task.assignedBy}` : ''}
        </div>
        <div className="sd-task-sub">{kindText}</div>
        {task.desc && <p className="sd-task-desc">{task.desc}</p>}
      </div>

      <div className="sd-task-side">
        {canUpdate ? (
          <span className="sd-select-wrap">
            <select
              className="sd-select"
              value={task.status}
              onChange={e => onStatusChange(task.id, e.target.value)}
              aria-label={`Status for ${task.title}`}
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <span className="sd-select-chev"><ChevronDownIcon /></span>
          </span>
        ) : (
          <>
            <span className="sd-chip">{STATUS_LABELS[task.status] || task.status}</span>
            <span className="sd-lock-note"><LockIcon /> Only the leader can update this</span>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Change Password Modal (unchanged; styled by the shared modal CSS) ── */
function ChangePwModal({ onClose }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)

  const handleSubmit = async () => {
    if (newPw.length < 6)       { setError('New password must be at least 6 characters.'); return }
    if (newPw !== confirmPw)    { setError('New passwords do not match.'); return }
    if (newPw === currentPw)    { setError('New password must be different from current.'); return }
    setLoading(true); setError('')
    try {
      await changePassword(currentPw, newPw)
      setSuccess(true)
    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') setError('Current password is incorrect.')
      else setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal">
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✅</div>
            <div className="modal-title">Password Changed!</div>
            <div className="modal-sub">Your password has been updated successfully.</div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn-modal-confirm" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-title">🔑 Change Password</div>
            <div className="modal-sub">Enter your current password to set a new one.</div>
            <div className="modal-form">
              <div className="modal-field">
                <label>Current Password</label>
                <input type="password" placeholder="Your current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              </div>
              <div className="modal-field">
                <label>New Password</label>
                <input type="password" placeholder="Min. 6 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
              </div>
              <div className="modal-field">
                <label>Confirm New Password</label>
                <input type="password" placeholder="Repeat new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
              {error && <div style={{ color: '#ff5f57', fontSize: '0.75rem' }}>{error}</div>}
              <div className="modal-actions">
                <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
                <button className="btn-modal-confirm" onClick={handleSubmit} disabled={loading}>
                  {loading ? 'Saving...' : 'Change Password'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Dashboard ── */
export default function StudentDashboard({ user, onLogout }) {
  const now = useClockTime()
  const [page, setPage]                 = useState('dashboard')
  const [filter, setFilter]             = useState('All')
  const [timeState, setTimeState]       = useState('idle')
  const [timeInAt, setTimeInAt]         = useState(null)
  const [logs, setLogs]                 = useState([])
  const [tasks, setTasks]               = useState([])
  const [logsLoading, setLogsLoading]   = useState(true)
  const [tasksLoading, setTasksLoading] = useState(true)
  const [loadingIn, setLoadingIn]       = useState(false)
  const [loadingOut, setLoadingOut]     = useState(false)
  const [error, setError]               = useState('')
  const [hours, setHours]               = useState(user?.hoursRendered || 0)
  const [showChangePw, setShowChangePw] = useState(false)
  const [showTheme, setShowTheme]       = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(false)
  const [taskError, setTaskError]       = useState('')
  const tasksRef    = useRef(null)
  const backRef     = useRef(null)
  const viewAllRef  = useRef(null)

  const shift      = user?.shift || 'morning'
  const shiftLabel = SHIFT_LABELS[shift] || SHIFT_LABELS.morning

  useEffect(() => {
    if (!user?.uid) return
    const checkDate = getActiveShiftDate(shift)

    getAttendanceLogs(user.uid).then(fetched => {
      setLogs(fetched)
      // Only today's record counts — strictly match the active shift date
      const todayLog = fetched.find(l => l.date === checkDate)
      if (todayLog) {
        if (todayLog.timeOut) setTimeState('timed-out')
        else { setTimeState('timed-in'); setTimeInAt(todayLog.timeIn?.toDate?.() || null) }
      } else {
        setTimeState('idle')
        setTimeInAt(null)
      }
    }).catch(console.error).finally(() => setLogsLoading(false))

    getTasksForInternAll(user.uid).then(setTasks).catch(console.error).finally(() => setTasksLoading(false))
  }, [user?.uid, shift])

  const handleTimeIn = async () => {
    setLoadingIn(true); setError('')
    try {
      await timeIn(user.uid, shift)
      setTimeInAt(new Date())
      setTimeState('timed-in')
      const updated = await getAttendanceLogs(user.uid)
      setLogs(updated)
    } catch (err) {
      setError(err.message)
    } finally { setLoadingIn(false) }
  }

  const handleTimeOut = async () => {
    setLoadingOut(true); setError('')
    try {
      await timeOut(user.uid, shift)
      setTimeState('timed-out')
      const updated = await getAttendanceLogs(user.uid)
      setLogs(updated)
      // Refresh total hours so the card updates without a page reload
      try {
        const fresh = await getUser(user.uid)
        if (fresh) setHours(fresh.hoursRendered || 0)
      } catch (e) { console.error(e) }
    } catch (err) {
      setError(err.message)
    } finally { setLoadingOut(false) }
  }

  const handleLogout = async () => { await logoutUser(); onLogout() }

  // Expand / collapse the Tasks card (smooth morph where the browser supports it)
  const setTasksOpen = (open) => {
    withViewTransition(() => setTasksExpanded(open))
  }

  // Status change with instant UI update and rollback if saving fails
  const handleStatusChange = async (id, newStatus) => {
    const previous = tasks
    setTaskError('')
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
    try {
      await updateTaskStatus(id, newStatus)
    } catch (err) {
      console.error(err)
      setTasks(previous)
      setTaskError('Could not update that task. Check your connection and try again.')
    }
  }

  // Keep keyboard focus sensible and scroll position sane after each toggle
  const prevExpanded = useRef(tasksExpanded)
  useLayoutEffect(() => {
    if (prevExpanded.current === tasksExpanded) return   // ignore first load
    prevExpanded.current = tasksExpanded
    const isMobile = window.matchMedia('(max-width: 900px)').matches
    if (tasksExpanded) {
      if (isMobile) window.scrollTo(0, 0)
      backRef.current?.focus({ preventScroll: true })
    } else {
      if (isMobile) tasksRef.current?.scrollIntoView({ block: 'start' })
      viewAllRef.current?.focus({ preventScroll: true })
    }
  }, [tasksExpanded])

  // Escape closes the expanded card (unless a popup is open)
  useEffect(() => {
    if (!tasksExpanded || showTheme || showChangePw) return
    const onKey = (e) => { if (e.key === 'Escape') setTasksOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tasksExpanded, showTheme, showChangePw])

  // Overtime indicator — timed in and past shift end time
  const isOvertime = (() => {
    if (timeState !== 'timed-in' || !timeInAt) return false
    const shiftEnd = { morning: '15:00', mid: '22:00', gy: '07:00' }
    const [eh, em] = (shiftEnd[shift] || '15:00').split(':').map(Number)
    const n = new Date()
    if (shift === 'gy') return n.getHours() >= 7 && n.getHours() < 12
    return n.getHours() > eh || (n.getHours() === eh && n.getMinutes() >= em)
  })()

  if (page === 'attendance') return <AttendancePage uid={user?.uid} user={user} onBack={() => setPage('dashboard')} />

  /* ── Derived display values ── */
  const todayLog     = logs.find(l => l.date === getActiveShiftDate(shift))
  const timeInShown  = todayLog?.timeIn?.toDate  ? formatLogTime(todayLog.timeIn.toDate())  : (timeInAt ? formatLogTime(timeInAt) : '—')
  const timeOutShown = todayLog?.timeOut?.toDate ? formatLogTime(todayLog.timeOut.toDate()) : '—'
  const statusText   = isOvertime
    ? 'On overtime'
    : { idle: 'Not clocked in', 'timed-in': 'Clocked in', 'timed-out': 'Clocked out' }[timeState]

  const filteredTasks = tasks.filter(t => filter === 'All' || STATUS_LABELS[t.status] === filter)
  const remaining     = tasks.filter(t => t.status !== 'done').length
  const counts = {
    total:      tasks.length,
    pending:    tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    done:       tasks.filter(t => t.status === 'done').length,
  }
  const recent        = logs.slice(0, 4)

  let action
  if (timeState === 'idle') {
    action = (
      <button type="button" className="sd-btn" onClick={handleTimeIn} disabled={loadingIn}>
        {loadingIn ? 'Timing in…' : <><ArrowDownIcon /> Time in</>}
      </button>
    )
  } else if (timeState === 'timed-in') {
    action = (
      <button type="button" className="sd-btn sd-btn--out" onClick={handleTimeOut} disabled={loadingOut}>
        {loadingOut ? 'Timing out…' : <><ArrowUpIcon /> Time out</>}
      </button>
    )
  } else {
    action = <button type="button" className="sd-btn" disabled>Done for today</button>
  }

  return (
    <>
      <div className="sd">
        <div className="sd-wrap">

          {/* ── Header ── */}
          <header className="sd-head">
            <div className="sd-head-text">
              <p className="sd-welcome">Welcome!</p>
              <h1 className="sd-name">{user?.name || 'Intern'}</h1>
              <p className="sd-role">OJT Student</p>
            </div>

            <div className="sd-head-actions">
              <span className="sd-shift-pill">{shiftLabel}</span>
              <div className="sd-toolbar" role="toolbar" aria-label="Account actions">
                <button type="button" className="sd-tool" onClick={handleLogout} title="Logout">
                  <LogoutIcon /><span className="sd-tool-label">Logout</span>
                </button>
                <span className="sd-tool-sep" aria-hidden="true" />
                <button type="button" className="sd-tool" onClick={() => setShowChangePw(true)} title="Change password">
                  <LockIcon /><span className="sd-tool-label">Change Password</span>
                </button>
                <span className="sd-tool-sep" aria-hidden="true" />
                <button type="button" className="sd-tool" onClick={() => setShowTheme(true)} title="Theme choice">
                  <MoonIcon /><span className="sd-tool-label">Theme Choice</span>
                </button>
              </div>
            </div>
          </header>

          <div className={`sd-grid ${tasksExpanded ? 'is-expanded' : ''}`}>

            {/* ── Total hours ── */}
            <section className="sd-card sd-card--navy sd-hours" aria-label="Total hours rendered">
              <h2 className="sd-label">Total Hours Rendered</h2>
              <div className="sd-hours-number">{Math.floor(hours)}</div>
              <div className="sd-hours-foot">
                <span>{user?.hoursRequired ? `of ${user.hoursRequired} required` : ''}</span>
                <span className="sd-hours-unit">Hrs</span>
              </div>
            </section>

            {/* ── Time in / out ── */}
            <section className="sd-card sd-card--outline sd-time" aria-label="Time in and out">
              <div className="sd-time-head">
                <div>
                  <h2 className="sd-card-title">Time In / Out</h2>
                  <p className="sd-card-sub">{formatDate(now)}</p>
                </div>
                <div className="sd-clock" aria-label="Current time">{formatClock(now)}</div>
              </div>

              <div className="sd-tiles">
                <div className="sd-tile">
                  <span className="sd-tile-label">Time In</span>
                  <span className="sd-tile-value">{timeInShown}</span>
                </div>
                <div className="sd-tile">
                  <span className="sd-tile-label">Time Out</span>
                  <span className="sd-tile-value">{timeOutShown}</span>
                </div>
                <div className="sd-tile sd-tile--status">
                  <span className="sd-tile-label">Status</span>
                  <span className="sd-tile-value">{statusText}</span>
                </div>
              </div>

              {error && <div className="sd-alert" role="alert">{error}</div>}

              <div className="sd-time-foot">
                <span className="sd-shift-note">Current shift: {shiftLabel}</span>
                {action}
              </div>
            </section>

            {/* ── Recent attendance ── */}
            <section className="sd-card sd-card--navy sd-recent" aria-label="Recent attendance">
              <div className="sd-card-head">
                <h2 className="sd-label">Recent Attendance</h2>
                <button type="button" className="sd-btn sd-btn--light sd-btn--sm" onClick={() => setPage('attendance')}>
                  View all <ArrowRightIcon />
                </button>
              </div>

              <div className="sd-recent-list">
                {logsLoading ? (
                  <div className="sd-recent-row"><div className="sd-recent-title">Loading…</div></div>
                ) : recent.length === 0 ? (
                  <div className="sd-recent-row">
                    <div>
                      <div className="sd-recent-title">No attendance records yet</div>
                      <div className="sd-recent-sub">{shiftLabel}</div>
                    </div>
                    <span className="sd-dash" aria-hidden="true"><MinusIcon /></span>
                  </div>
                ) : (
                  recent.map((log, i) => {
                    const f = formatLog(log)
                    return (
                      <div className="sd-recent-row" key={log.id || i}>
                        <div>
                          <div className="sd-recent-title">{f.date}</div>
                          <div className="sd-recent-sub">{f.timeIn} – {f.timeOut}</div>
                        </div>
                        <span className="sd-chip">{f.duration}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            {/* ── Tasks (expands over the Time In / Out card) ── */}
            <section
              ref={tasksRef}
              className={`sd-card sd-card--outline sd-tasks ${tasksExpanded ? 'is-expanded' : ''}`}
              aria-label="Tasks and activities"
            >
              {tasksExpanded ? (
                <div className="sd-tasks-top">
                  <button ref={backRef} type="button" className="sd-btn sd-btn--sm" onClick={() => setTasksOpen(false)}>
                    <ArrowLeftIcon /> Back
                  </button>
                  <h2 className="sd-card-title">Task &amp; Activities</h2>
                </div>
              ) : (
                <div className="sd-card-head">
                  <div>
                    <h2 className="sd-card-title">Task &amp; Activities</h2>
                    <p className="sd-card-sub">{remaining} remaining</p>
                  </div>
                  <button
                    ref={viewAllRef} type="button" className="sd-btn sd-btn--sm"
                    aria-expanded="false" onClick={() => setTasksOpen(true)}
                  >
                    View all <ArrowRightIcon />
                  </button>
                </div>
              )}

              <div className="sd-filters">
                {FILTERS.map(f => (
                  <button
                    key={f} type="button"
                    className={`sd-filter ${filter === f ? 'is-active' : ''}`}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {tasksExpanded && (
                <div className="sd-stats">
                  {[
                    ['Total Tasks', counts.total],
                    ['Pending',     counts.pending],
                    ['In Progress', counts.inProgress],
                    ['Done',        counts.done],
                  ].map(([label, value]) => (
                    <div className="sd-tile" key={label}>
                      <span className="sd-tile-label">{label}</span>
                      <span className="sd-tile-value">{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {taskError && <div className="sd-alert sd-alert--tight" role="alert">{taskError}</div>}

              <div className="sd-task-list">
                {tasksLoading ? (
                  <div className="sd-empty">Loading tasks…</div>
                ) : filteredTasks.length === 0 ? (
                  <div className="sd-empty">No tasks in this category.</div>
                ) : tasksExpanded ? (
                  filteredTasks.map(task => (
                    <FullTaskRow key={task.id} task={task} uid={user?.uid} onStatusChange={handleStatusChange} />
                  ))
                ) : (
                  filteredTasks.map(task => (
                    <div className="sd-task" key={task.id} title={task.desc || undefined}>
                      <span className="sd-task-icon"><TaskIcon status={task.status} /></span>
                      <div className="sd-task-body">
                        <div className="sd-task-title">{task.title}</div>
                        <div className="sd-task-sub">
                          <span className={`sd-dot sd-dot--${task.priority}`} aria-hidden="true" />
                          {PRIORITY_LABELS[task.priority] || 'Normal'} priority
                          {task.assignedBy ? ` • ${task.assignedBy}` : ''}
                        </div>
                      </div>
                      <span className="sd-chip">{STATUS_LABELS[task.status] || task.status}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Modals live outside .sd so they keep their own styling */}
      {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
      {showChangePw && <ChangePwModal onClose={() => setShowChangePw(false)} />}
    </>
  )
}
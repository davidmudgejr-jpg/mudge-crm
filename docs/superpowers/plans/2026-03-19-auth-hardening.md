# Auth Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down the IE CRM for production use — restrict CORS, add rate limiting, enforce role-based access control, and build a user management UI in Settings.

**Architecture:** Extend the existing JWT auth stack (middleware/auth.js, AuthContext.jsx, Login.jsx). Add CORS origin whitelist, express-rate-limit middleware, a `requireRole()` middleware that checks `req.user.role`, and a new "Team" section in Settings.jsx with CRUD for users. Admin-only routes get `requireRole('admin')`.

**Tech Stack:** Express, express-rate-limit, cors (with origin whitelist), bcryptjs, jsonwebtoken, React 18, Tailwind CSS

**Spec:** Skipped (scope is clear hardening work, not new feature design)

---

## File Structure

```
ie-crm/
├── server/
│   ├── index.js                    — MODIFY: CORS config, rate limiter, role-gated routes, user CRUD endpoints
│   └── middleware/
│       └── auth.js                 — MODIFY: add requireRole() and role to JWT payload
├── src/
│   ├── contexts/AuthContext.jsx    — MODIFY: expose role, add updateUser helper
│   ├── pages/Settings.jsx         — MODIFY: add Team Management section (admin-only)
│   └── components/shared/
│       └── UserManagement.jsx     — CREATE: team member CRUD UI
└── package.json                    — MODIFY: add express-rate-limit
```

---

## Chunk 1: CORS Lockdown + Rate Limiting

### Task 1: Lock down CORS to known origins

**Files:**
- Modify: `ie-crm/server/index.js` (lines 17-19)

- [ ] **Step 1: Replace open CORS with origin whitelist**

Replace:
```javascript
app.use(cors());
```

With:
```javascript
const ALLOWED_ORIGINS = [
  'https://ie-crm.vercel.app',
  'https://ie-crm-davidmudgejr-3693s-projects.vercel.app',
];

// Allow localhost in development
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "security: lock down CORS to known Vercel + localhost origins"
```

### Task 2: Add rate limiting

**Files:**
- Modify: `ie-crm/package.json`
- Modify: `ie-crm/server/index.js`

- [ ] **Step 1: Install express-rate-limit**

```bash
cd ie-crm && npm install express-rate-limit
```

- [ ] **Step 2: Add rate limiter middleware**

After the CORS setup in server/index.js, add:

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limit: 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limiter for auth endpoints: 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});

app.use('/api', apiLimiter);
```

- [ ] **Step 3: Apply auth limiter to login endpoint**

Change the login route at line 76 to include the auth limiter:

```javascript
app.post('/api/auth/login', authLimiter, async (req, res) => {
```

Also apply to change-password:
```javascript
app.post('/api/auth/change-password', authLimiter, requireAuth, async (req, res) => {
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/package.json ie-crm/package-lock.json ie-crm/server/index.js
git commit -m "security: add rate limiting (200/min general, 10/15min auth)"
```

---

## Chunk 2: Role Enforcement Middleware

### Task 3: Add requireRole middleware and include role in JWT

**Files:**
- Modify: `ie-crm/server/middleware/auth.js`

- [ ] **Step 1: Add role to extractUser and JWT payload**

Update `extractUser` to include role from the JWT payload:

```javascript
function extractUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      user_id: payload.user_id,
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role || 'broker',
    };
  } catch {
    return null;
  }
}
```

Update `signToken` to include role:

```javascript
function signToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      display_name: user.display_name,
      role: user.role || 'broker',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
```

- [ ] **Step 2: Add requireRole factory function**

After `optionalAuth`, add:

```javascript
// Factory: returns middleware that checks user has one of the allowed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

- [ ] **Step 3: Export requireRole**

Update exports:
```javascript
module.exports = { requireAuth, optionalAuth, requireRole, signToken };
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/server/middleware/auth.js
git commit -m "feat: add requireRole middleware with role in JWT payload"
```

### Task 4: Apply role enforcement to sensitive routes

**Files:**
- Modify: `ie-crm/server/index.js`

- [ ] **Step 1: Import requireRole**

Update the import at line 73:
```javascript
const { requireAuth, optionalAuth, requireRole, signToken } = require('./middleware/auth');
```

- [ ] **Step 2: Protect destructive and admin-only routes**

Add `requireRole('admin')` to these routes (as second middleware after requireAuth):

```javascript
// Bulk delete — admin only
app.post('/api/bulk-delete', requireRole('admin'), async (req, res) => { ... });

// User management endpoints (will be added in Task 5) — admin only
// AI sandbox approval — admin only (already exists)
// TPE config updates — admin only
```

For read-only role, add a `denyReadOnly` middleware helper in index.js:
```javascript
const denyReadOnly = requireRole('admin', 'broker');
```

Apply `denyReadOnly` before all write endpoints (POST/PUT/DELETE for entities):
- `POST /api/db/insert`
- `POST /api/db/update`
- `POST /api/db/delete`
- `POST /api/bulk-delete`
- `POST /api/import/batch`

The pattern: insert `denyReadOnly` between `requireAuth` (applied globally at line 147) and the route handler:

```javascript
app.post('/api/db/insert', denyReadOnly, async (req, res) => { ... });
app.post('/api/db/update', denyReadOnly, async (req, res) => { ... });
app.post('/api/db/delete', denyReadOnly, async (req, res) => { ... });
app.post('/api/bulk-delete', requireRole('admin'), async (req, res) => { ... });
app.post('/api/import/batch', denyReadOnly, async (req, res) => { ... });
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: enforce role-based access on write + admin routes"
```

---

## Chunk 3: User Management API Endpoints

### Task 5: Add user CRUD API endpoints

**Files:**
- Modify: `ie-crm/server/index.js`

- [ ] **Step 1: Add GET /api/users endpoint (admin only)**

After the auth routes (around line 148), add:

```javascript
// ============================================================
// USER MANAGEMENT (admin only)
// ============================================================

// GET /api/users — list all team members
app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const result = await pool.query(
      'SELECT user_id, email, display_name, role, avatar_color, created_at, last_login FROM users ORDER BY created_at'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[users] List error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});
```

- [ ] **Step 2: Add POST /api/users endpoint (create user)**

```javascript
// POST /api/users — create a new team member
app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { email, display_name, password, role, avatar_color } = req.body;
    if (!email || !display_name || !password) {
      return res.status(400).json({ error: 'Email, name, and password required' });
    }
    if (!['admin', 'broker', 'readonly'].includes(role || 'broker')) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check for duplicate email
    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, email, display_name, role, avatar_color, created_at`,
      [email.toLowerCase().trim(), display_name, password_hash, role || 'broker', avatar_color || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[users] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});
```

- [ ] **Step 3: Add PUT /api/users/:id endpoint (update user)**

```javascript
// PUT /api/users/:id — update a team member (admin only)
app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { id } = req.params;
    const { display_name, role, avatar_color } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (display_name !== undefined) { sets.push(`display_name = $${idx++}`); params.push(display_name); }
    if (role !== undefined) {
      if (!['admin', 'broker', 'readonly'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      sets.push(`role = $${idx++}`); params.push(role);
    }
    if (avatar_color !== undefined) { sets.push(`avatar_color = $${idx++}`); params.push(avatar_color); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${idx}
       RETURNING user_id, email, display_name, role, avatar_color, created_at, last_login`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[users] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});
```

- [ ] **Step 4: Add POST /api/users/:id/reset-password endpoint**

```javascript
// POST /api/users/:id/reset-password — admin resets another user's password
app.post('/api/users/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id',
      [hash, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[users] Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: add user management CRUD API endpoints (admin only)"
```

---

## Chunk 4: User Management UI

### Task 6: Create UserManagement component

**Files:**
- Create: `ie-crm/src/components/shared/UserManagement.jsx`

- [ ] **Step 1: Build the component**

```jsx
// Team member management — admin only
// Shows user list with role badges, edit/reset-password/add forms
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'text-red-400 bg-red-400/10' },
  { value: 'broker', label: 'Broker', color: 'text-blue-400 bg-blue-400/10' },
  { value: 'readonly', label: 'Read Only', color: 'text-gray-400 bg-gray-400/10' },
];

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#a78bfa'];

function RoleBadge({ role }) {
  const r = ROLES.find(r => r.value === role) || ROLES[1];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.color}`}>
      {r.label}
    </span>
  );
}

function AvatarCircle({ name, color }) {
  const initials = (name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color || '#3b82f6' }}
    >
      {initials}
    </div>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [resetId, setResetId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [form, setForm] = useState({ email: '', display_name: '', password: '', role: 'broker', avatar_color: '#3b82f6' });
  const [resetPw, setResetPw] = useState('');

  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers });
      if (!res.ok) throw new Error('Failed to load users');
      setUsers(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST', headers, body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowAdd(false);
      setForm({ email: '', display_name: '', password: '', role: 'broker', avatar_color: '#3b82f6' });
      flash('Team member added');
      loadUsers();
    } catch (err) { setError(err.message); }
  };

  const handleUpdate = async (id, updates) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/${id}`, {
        method: 'PUT', headers, body: JSON.stringify(updates),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setEditingId(null);
      flash('User updated');
      loadUsers();
    } catch (err) { setError(err.message); }
  };

  const handleResetPassword = async (id) => {
    setError(null);
    if (!resetPw || resetPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/users/${id}/reset-password`, {
        method: 'POST', headers, body: JSON.stringify({ newPassword: resetPw }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setResetId(null);
      setResetPw('');
      flash('Password reset');
    } catch (err) { setError(err.message); }
  };

  if (loading) return <p className="text-xs text-crm-muted">Loading team...</p>;

  return (
    <div className="space-y-3">
      {/* Feedback */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-100">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-xs text-green-400">
          {success}
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.user_id} className="bg-crm-card border border-crm-border rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AvatarCircle name={u.display_name} color={u.avatar_color} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{u.display_name}</span>
                    <RoleBadge role={u.role} />
                    {u.user_id === currentUser?.user_id && (
                      <span className="text-[9px] text-crm-muted border border-crm-border rounded px-1">You</span>
                    )}
                  </div>
                  <p className="text-[11px] text-crm-muted">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Edit role */}
                {editingId === u.user_id ? (
                  <select
                    value={u.role}
                    onChange={(e) => handleUpdate(u.user_id, { role: e.target.value })}
                    className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2 py-1 rounded"
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                ) : (
                  <button
                    onClick={() => setEditingId(u.user_id)}
                    className="text-[10px] text-crm-muted hover:text-crm-text px-2 py-1"
                    title="Edit role"
                  >
                    Edit
                  </button>
                )}
                {/* Reset password */}
                <button
                  onClick={() => setResetId(resetId === u.user_id ? null : u.user_id)}
                  className="text-[10px] text-crm-muted hover:text-crm-text px-2 py-1"
                >
                  Reset PW
                </button>
              </div>
            </div>

            {/* Reset password form */}
            {resetId === u.user_id && (
              <div className="mt-2 pt-2 border-t border-crm-border/50 flex items-center gap-2">
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  className="[color-scheme:dark] flex-1 bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none"
                />
                <button
                  onClick={() => handleResetPassword(u.user_id)}
                  className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white px-3 py-1.5 rounded"
                >
                  Reset
                </button>
                <button onClick={() => { setResetId(null); setResetPw(''); }} className="text-xs text-crm-muted px-2 py-1.5">
                  Cancel
                </button>
              </div>
            )}

            {/* Last login */}
            <p className="text-[10px] text-crm-muted/60 mt-1.5">
              Last login: {u.last_login ? new Date(u.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}
            </p>
          </div>
        ))}
      </div>

      {/* Add user form */}
      {showAdd ? (
        <form onSubmit={handleCreate} className="bg-crm-card border border-crm-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-crm-muted uppercase tracking-wider">Add Team Member</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Full name"
              required
              className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none"
            />
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              required
              className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none"
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Temp password"
              required
              minLength={6}
              className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] text-crm-muted mb-1.5">Avatar color</p>
            <div className="flex gap-1.5">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, avatar_color: c })}
                  className={`w-6 h-6 rounded-full transition-all ${form.avatar_color === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-4 py-1.5 rounded">
              Add Member
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-crm-muted px-3 py-1.5">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full border border-dashed border-crm-border rounded-lg py-2.5 text-xs text-crm-muted hover:text-crm-accent hover:border-crm-accent transition-colors"
        >
          + Add Team Member
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/src/components/shared/UserManagement.jsx
git commit -m "feat: create UserManagement component with CRUD + role editing + password reset"
```

### Task 7: Add Team section to Settings page

**Files:**
- Modify: `ie-crm/src/pages/Settings.jsx`
- Modify: `ie-crm/src/contexts/AuthContext.jsx`

- [ ] **Step 1: Update AuthContext to expose role**

In AuthContext.jsx, the `user` object from `/api/auth/me` already includes `role`. No changes needed — `user.role` is already accessible via `useAuth()`. Just verify.

- [ ] **Step 2: Import UserManagement and useAuth in Settings.jsx**

At the top of Settings.jsx:
```javascript
import UserManagement from '../components/shared/UserManagement';
import { useAuth } from '../contexts/AuthContext';
```

Inside the component:
```javascript
const { user } = useAuth();
const isAdmin = user?.role === 'admin';
```

- [ ] **Step 3: Add Team Management section**

After the "Connections" section and before "Database Records", add:

```jsx
{/* Team Management — admin only */}
{isAdmin && (
  <section>
    <h2 className="text-sm font-medium text-crm-muted uppercase tracking-wider mb-3">Team Management</h2>
    <UserManagement />
  </section>
)}
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/pages/Settings.jsx ie-crm/src/contexts/AuthContext.jsx
git commit -m "feat: add Team Management section to Settings (admin only)"
```

---

## Chunk 5: Update David's Role to Admin + Final Polish

### Task 8: Seed David as admin

**Files:**
- Modify: `ie-crm/scripts/seed-users.js` (or run SQL directly)

- [ ] **Step 1: Update David's role to admin**

Run against Neon:
```sql
UPDATE users SET role = 'admin' WHERE email = 'davidmudgejr@gmail.com';
```

This ensures David Jr has full admin access to manage the team.

- [ ] **Step 2: Commit seed script update if applicable**

### Task 9: Verify end-to-end

- [ ] **Step 1: Test CORS** — From browser dev tools on `localhost:5173`, verify API calls succeed. From a different origin (e.g., `curl -H "Origin: https://evil.com"` against the Railway URL), verify CORS blocks.

- [ ] **Step 2: Test rate limiting** — Hit `/api/auth/login` rapidly with wrong credentials, verify 429 after 10 attempts.

- [ ] **Step 3: Test role enforcement** — Log in as a broker-role user, verify:
  - Can read data (GET endpoints work)
  - Cannot bulk delete (POST /api/bulk-delete returns 403)
  - Cannot access user management API (GET /api/users returns 403)

- [ ] **Step 4: Test admin features** — Log in as David (admin), verify:
  - Settings page shows Team Management section
  - Can see all team members with roles
  - Can change a user's role
  - Can reset a user's password
  - Can add a new team member

- [ ] **Step 5: Test read-only role** — If a read-only user exists, verify they can browse data but all create/update/delete returns 403.

### Task 10: Deploy

- [ ] **Step 1: Commit any remaining changes**
- [ ] **Step 2: Merge to main and push**

```bash
git checkout main
git merge feature/ai-ops-dashboard
git push origin main
```

- [ ] **Step 3: Set JWT_SECRET as proper environment variable on Railway** — ensure it's not using the dev default

- [ ] **Step 4: Verify deployment** — Check Vercel + Railway builds succeed, test login on production URL

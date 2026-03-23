# Prompts 57-60: RBAC, Audit Trail, CI/CD & Disaster Recovery

**Round 5 — Implementation Bridge**
**Date:** 2026-03-13
**Scope:** Multi-user access control, comprehensive change tracking, deployment pipeline, and operational resilience for IE CRM.

---

## Table of Contents

1. [Prompt 57 — Multi-User RBAC & Permission System](#prompt-57--multi-user-rbac--permission-system)
2. [Prompt 58 — Comprehensive Audit Trail & Change Tracking](#prompt-58--comprehensive-audit-trail--change-tracking)
3. [Prompt 59 — CI/CD Pipeline & Database Branching](#prompt-59--cicd-pipeline--database-branching)
4. [Prompt 60 — Performance Monitoring, Health Checks & Disaster Recovery](#prompt-60--performance-monitoring-health-checks--disaster-recovery)

---

## Prompt 57 — Multi-User RBAC & Permission System

### 57.1 User Roles

IE CRM supports four distinct roles, each scoped to the team's actual usage patterns:

| Role | User(s) | Summary |
|------|---------|---------|
| **Admin** | David Mudge Jr | Full access — all CRUD, AI Ops, Settings, User Management, Agent Configuration |
| **Agent** | Missy | Full CRM access (contacts, properties, deals, etc.), can view AI recommendations, cannot configure agents or manage users |
| **Observer** | Houston (David's dad) | Read-only CRM access + filtered action items assigned to him, cannot modify records except completing his own action items |
| **AI Agent** | System accounts | API-only access via `X-Agent-Key` header, scoped to specific endpoints per the existing `ai_api_keys` table in migration 007 |

### 57.2 Permission Matrix

| Resource | Admin | Agent | Observer | AI Agent |
|----------|-------|-------|----------|----------|
| Contacts CRUD | Full | Full | Read | Sandbox only |
| Properties CRUD | Full | Full | Read | Sandbox only |
| Companies CRUD | Full | Full | Read | Sandbox only |
| Deals CRUD | Full | Full | Read | None |
| Interactions CRUD | Full | Full | Read | Create only |
| Campaigns | Full | Full | Read | None |
| Import | Full | Full | None | None |
| AI Ops Dashboard | Full | View only | None | None |
| Approval Queue | Approve/Reject | View only | None | Submit only |
| Settings | Full | Own profile | Own profile | None |
| User Management | Full | None | None | None |
| Agent Configuration | Full | None | None | None |
| Action Items | Full | Full | Own assignments | Create only |
| Reports/Export | Full | Full | Limited | None |

### 57.3 Database Schema

#### Migration 008: `008_rbac.sql`

```sql
-- Migration 008: RBAC — Users, Sessions, Preferences
-- Adds multi-user authentication and role-based access control.

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,  -- bcrypt, 12 rounds
  role TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('admin', 'agent', 'observer')),
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(active) WHERE active = TRUE;

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,     -- SHA-256 of JWT for revocation lookup
  refresh_token_hash TEXT,      -- SHA-256 of refresh token
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- ============================================================
-- SEED: Admin user (David)
-- Password set via environment variable on first deploy
-- ============================================================
-- INSERT INTO users (email, name, password_hash, role)
-- VALUES ('david@mudgeteamcre.com', 'David Mudge Jr', '$BCRYPT_HASH', 'admin');

COMMENT ON TABLE users IS 'CRM user accounts with role-based access control';
COMMENT ON TABLE sessions IS 'Active JWT sessions — supports revocation and refresh';
COMMENT ON TABLE user_preferences IS 'Per-user JSONB preferences — notification settings, default views, UI preferences';
```

### 57.4 Authentication Flow

```
┌──────────┐     POST /api/auth/login      ┌──────────────┐
│  Login   │ ─────────────────────────────→ │ Express      │
│  Page    │     { email, password }        │ auth.js      │
└──────────┘                                └──────┬───────┘
                                                   │
                                          bcrypt.compare()
                                                   │
                                          ┌────────▼────────┐
                                          │ Generate JWT    │
                                          │ (24h expiry)    │
                                          │ + Refresh token │
                                          │ (7d expiry)     │
                                          └────────┬────────┘
                                                   │
                                          Set httpOnly cookie
                                          (secure, sameSite=strict)
                                                   │
     ┌──────────┐     { user, role }      ┌────────▼────────┐
     │  React   │ ←───────────────────── │ 200 OK          │
     │  App     │                         └─────────────────┘
     └──────────┘
```

**JWT payload:**
```json
{
  "sub": "uuid-of-user",
  "email": "david@mudgeteamcre.com",
  "role": "admin",
  "name": "David Mudge Jr",
  "iat": 1710288000,
  "exp": 1710374400
}
```

**Key decisions:**
- JWT stored in `httpOnly` cookie, not `localStorage` (XSS protection)
- Refresh token in a separate `httpOnly` cookie with `/api/auth/refresh` path restriction
- CSRF protection via `SameSite=Strict` + double-submit cookie pattern
- AI agent auth uses a separate path: `X-Agent-Key` header, validated against the existing `ai_api_keys` table (migration 007)
- Failed login attempts logged to `audit_log` (see Prompt 58)

### 57.5 Server-Side Middleware

#### `ie-crm/server/middleware/auth.js`

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_ROUNDS = 12;

// ---------- Core Middleware ----------

/**
 * authenticate — Validates JWT from httpOnly cookie.
 * Attaches req.user = { id, email, role, name }.
 * Returns 401 if missing/invalid/expired.
 */
function authenticate(req, res, next) {
  const token = req.cookies?.ie_crm_token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * authorize — Role-gating middleware.
 * Usage: authorize('admin', 'agent')
 * Returns 403 if user role not in allowed list.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }
    next();
  };
}

/**
 * authenticateAgent — Validates AI agent API key from X-Agent-Key header.
 * Looks up key in ai_api_keys table, checks active status and permissions.
 * Attaches req.agent = { name, tier, permissions }.
 */
async function authenticateAgent(pool) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-agent-key'];
    if (!apiKey) return next(); // Not an agent request — fall through

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const result = await pool.query(
      'SELECT agent_name, tier, permissions, active FROM ai_api_keys WHERE api_key = $1',
      [keyHash]
    );

    if (result.rows.length === 0 || !result.rows[0].active) {
      return res.status(401).json({ error: 'Invalid or revoked agent key' });
    }

    const agent = result.rows[0];
    req.agent = {
      name: agent.agent_name,
      tier: agent.tier,
      permissions: agent.permissions,
    };
    req.user = { id: null, role: 'ai_agent', name: agent.agent_name };

    // Update last_used_at
    pool.query(
      'UPDATE ai_api_keys SET last_used_at = NOW() WHERE api_key = $1',
      [keyHash]
    ).catch(() => {}); // Fire-and-forget

    next();
  };
}

module.exports = { authenticate, authorize, authenticateAgent, JWT_SECRET, BCRYPT_ROUNDS };
```

#### Route protection examples on existing `server/index.js`:

```javascript
// Before (current — no auth):
app.post('/api/db/query', async (req, res) => { ... });

// After (with RBAC):
app.post('/api/db/query',
  authenticate,
  authorize('admin'),  // Only admin can run raw SQL
  async (req, res) => { ... }
);

// Entity CRUD routes — Admin + Agent full, Observer read-only:
app.get('/api/contacts',       authenticate, authorize('admin', 'agent', 'observer'), ...);
app.post('/api/contacts',      authenticate, authorize('admin', 'agent'), ...);
app.put('/api/contacts/:id',   authenticate, authorize('admin', 'agent'), ...);
app.delete('/api/contacts/:id', authenticate, authorize('admin'), ...);

// AI Ops — Admin full, Agent view-only:
app.get('/api/ai-ops/dashboard', authenticate, authorize('admin', 'agent'), ...);
app.post('/api/ai-ops/approve',  authenticate, authorize('admin'), ...);

// Settings — Admin full access; Agent/Observer own profile only:
app.get('/api/settings',        authenticate, authorize('admin'), ...);
app.get('/api/settings/profile', authenticate, ...); // All authenticated users
app.put('/api/settings/profile', authenticate, ...); // All authenticated users

// Action items — Observer can update only their own assignments:
app.put('/api/action-items/:id',
  authenticate,
  async (req, res, next) => {
    if (req.user.role === 'observer') {
      const item = await pool.query(
        'SELECT assigned_to FROM action_items WHERE id = $1', [req.params.id]
      );
      if (!item.rows[0] || item.rows[0].assigned_to !== req.user.id) {
        return res.status(403).json({ error: 'Can only update your own action items' });
      }
    }
    next();
  },
  ...
);
```

### 57.6 Auth Routes

#### `ie-crm/server/routes/auth.js`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | None | Email + password login, returns JWT in httpOnly cookie |
| `/api/auth/logout` | POST | Any | Clears cookie, deletes session from DB |
| `/api/auth/refresh` | POST | Refresh cookie | Issues new JWT using refresh token |
| `/api/auth/me` | GET | Any | Returns current user profile |
| `/api/auth/register` | POST | Admin only | Create new user account |
| `/api/auth/change-password` | POST | Any | Change own password (requires current password) |

### 57.7 Frontend Integration

#### `ie-crm/src/contexts/AuthContext.jsx`

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, check if user is already authenticated
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  // Permission helpers
  const can = (action, resource) => {
    if (!user) return false;
    return PERMISSION_MATRIX[user.role]?.[resource]?.[action] ?? false;
  };

  const isAdmin = user?.role === 'admin';
  const isAgent = user?.role === 'agent';
  const isObserver = user?.role === 'observer';

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, can, isAdmin, isAgent, isObserver,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

#### `ie-crm/src/components/ProtectedRoute.jsx`

```javascript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
```

### 57.8 Houston-Specific Adaptations

Houston's Observer role triggers several UI adaptations in the existing components:

**Sidebar filtering** (modify `ie-crm/src/components/Sidebar.jsx`):
```javascript
// Observer sees only: Properties (read-only), Action Items (own), Reports
const { isObserver } = useAuth();
const navItems = isObserver
  ? [
      { label: 'Properties', path: '/properties', icon: BuildingIcon },
      { label: 'My Action Items', path: '/action-items?mine=true', icon: CheckCircleIcon },
      { label: 'Reports', path: '/reports', icon: ChartIcon },
    ]
  : fullNavItems; // Admin/Agent see all items
```

**Action Items — quick complete** (modify `ie-crm/src/pages/ActionItems.jsx`):
- Observer view filters to `assigned_to = current_user.id`
- Each row shows a one-click "Complete" button
- Clicking opens a small popover: optional note + "Mark Complete" confirmation
- No create/delete/reassign buttons visible

**Properties — read-only mode** (modify `ie-crm/src/pages/Properties.jsx` and `PropertyDetail.jsx`):
- `InlineField` components receive `readOnly={isObserver}` prop
- Edit buttons, delete buttons hidden via `{!isObserver && <button>...}</button>}`
- Import tab hidden entirely

**Accessibility preferences** (stored in `user_preferences`):
```json
{
  "key": "ui_preferences",
  "value": {
    "font_size": "large",     // Renders text at 18px base instead of 14px
    "simplified_nav": true,
    "high_contrast": false
  }
}
```

### 57.9 Implementation Files

| File | Purpose |
|------|---------|
| `ie-crm/migrations/008_rbac.sql` | Users, sessions, preferences tables |
| `ie-crm/server/middleware/auth.js` | JWT validation, role checking, agent auth |
| `ie-crm/server/routes/auth.js` | Login, logout, refresh, register, change-password |
| `ie-crm/src/contexts/AuthContext.jsx` | React auth state + permission helpers |
| `ie-crm/src/components/ProtectedRoute.jsx` | Route guards with role checking |
| `ie-crm/src/pages/Login.jsx` | Login page |
| `ie-crm/src/pages/Settings/Users.jsx` | User management (admin only) |
| `ie-crm/src/components/Sidebar.jsx` | Modified for role-based nav filtering |

### 57.10 Electron Compatibility

The current app runs in both Electron (desktop) and browser (Vercel) modes via the IPC bridge (`ie-crm/src/api/bridge.js`). Auth must work in both:

- **Browser mode:** Standard cookie-based auth as described above
- **Electron mode:** On desktop, the app is single-user. Auth is bypassed by setting `req.user` to the configured admin user in `electron/main.js` IPC handlers. The Electron app stores credentials in the system keychain via `safeStorage`.
- **Transition:** When Electron starts, it calls `/api/auth/me` against the Railway backend. If the user has stored credentials, it auto-logs in. If not, it shows the Login page.

---

## Prompt 58 — Comprehensive Audit Trail & Change Tracking

### 58.1 What Gets Tracked

| Category | Examples | Logging Layer |
|----------|----------|---------------|
| Data changes | INSERT/UPDATE/DELETE on contacts, properties, companies, deals, interactions, campaigns, action_items | PostgreSQL trigger |
| Sandbox operations | Sandbox submission, approval, rejection, promotion | PostgreSQL trigger + application |
| Auth events | Login, logout, failed login, password change, session revocation | Application (auth routes) |
| Configuration changes | Settings update, agent config change, user role change | Application |
| Bulk operations | Batch approve, batch delete, CSV import | Application (with batch_id) |
| Export events | CSV/PDF export of contacts, properties, reports | Application |

### 58.2 Audit Log Table

#### Migration 009: `009_audit_trail.sql`

```sql
-- Migration 009: Audit Trail — Comprehensive change tracking
-- Hybrid approach: PostgreSQL triggers for data changes, application logging for auth/config.

-- ============================================================
-- AUDIT LOG — Core table (partitioned by month)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_name TEXT,                            -- Non-null for AI agent actions
  action TEXT NOT NULL,                       -- 'create', 'update', 'delete', 'approve',
                                              -- 'reject', 'promote', 'login', 'logout',
                                              -- 'login_failed', 'password_change', 'export',
                                              -- 'import', 'config_change', 'bulk_approve'
  entity_type TEXT,                           -- 'contact', 'property', 'company', 'deal',
                                              -- 'interaction', 'campaign', 'action_item',
                                              -- 'sandbox_contact', 'sandbox_enrichment',
                                              -- 'sandbox_signal', 'sandbox_outreach',
                                              -- 'user', 'setting', 'session'
  entity_id TEXT,                             -- UUID or integer ID as text
  changes JSONB,                              -- For updates: { "field": { "old": "x", "new": "y" } }
  metadata JSONB DEFAULT '{}',                -- IP, user_agent, batch_id, import_filename, etc.
  ip_address INET,
  session_id UUID,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for current + next 12 months
-- (In practice, a cron job creates future partitions monthly)
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- ... (script generates 12 months ahead)

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_log (user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log (action, timestamp DESC);
CREATE INDEX idx_audit_timestamp ON audit_log USING BRIN (timestamp);

-- ============================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- ============================================================
-- Attaches to any table. Captures INSERT, UPDATE, DELETE.
-- Computes a field-level diff for UPDATE operations.

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  _changes JSONB;
  _entity_id TEXT;
  _action TEXT;
  _old_data JSONB;
  _new_data JSONB;
  _key TEXT;
  _user_id UUID;
  _agent_name TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    _action := 'create';
    _new_data := to_jsonb(NEW);
    -- Extract entity ID (try common column names)
    _entity_id := COALESCE(
      _new_data->>'id',
      _new_data->>'contact_id',
      _new_data->>'property_id',
      _new_data->>'company_id',
      _new_data->>'deal_id'
    );
    _changes := _new_data;

  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _entity_id := COALESCE(
      _new_data->>'id',
      _new_data->>'contact_id',
      _new_data->>'property_id',
      _new_data->>'company_id',
      _new_data->>'deal_id'
    );
    -- Compute diff: only changed fields
    _changes := '{}';
    FOR _key IN SELECT jsonb_object_keys(_new_data) LOOP
      IF _old_data->_key IS DISTINCT FROM _new_data->_key
         AND _key NOT IN ('updated_at', 'last_modified', 'modified') THEN
        _changes := _changes || jsonb_build_object(
          _key, jsonb_build_object('old', _old_data->_key, 'new', _new_data->_key)
        );
      END IF;
    END LOOP;
    -- Skip if nothing actually changed
    IF _changes = '{}' THEN RETURN NEW; END IF;

  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _old_data := to_jsonb(OLD);
    _entity_id := COALESCE(
      _old_data->>'id',
      _old_data->>'contact_id',
      _old_data->>'property_id',
      _old_data->>'company_id',
      _old_data->>'deal_id'
    );
    _changes := _old_data; -- Store full record for recovery
  END IF;

  -- Try to get user context from session variable (set by application)
  BEGIN
    _user_id := current_setting('app.current_user_id', true)::UUID;
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;
  BEGIN
    _agent_name := current_setting('app.current_agent_name', true);
  EXCEPTION WHEN OTHERS THEN
    _agent_name := NULL;
  END;

  -- Insert audit record
  INSERT INTO audit_log (user_id, agent_name, action, entity_type, entity_id, changes)
  VALUES (_user_id, _agent_name, _action, TG_TABLE_NAME, _entity_id, _changes);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ATTACH TRIGGERS TO ENTITY TABLES
-- ============================================================
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_properties
  AFTER INSERT OR UPDATE OR DELETE ON properties
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_interactions
  AFTER INSERT OR UPDATE OR DELETE ON interactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_action_items
  AFTER INSERT OR UPDATE OR DELETE ON action_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Sandbox tables
CREATE TRIGGER audit_sandbox_contacts
  AFTER INSERT OR UPDATE OR DELETE ON sandbox_contacts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_sandbox_enrichments
  AFTER INSERT OR UPDATE OR DELETE ON sandbox_enrichments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_sandbox_signals
  AFTER INSERT OR UPDATE OR DELETE ON sandbox_signals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_sandbox_outreach
  AFTER INSERT OR UPDATE OR DELETE ON sandbox_outreach
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

COMMENT ON TABLE audit_log IS 'Comprehensive change tracking — partitioned by month, populated by triggers and application logging';
```

### 58.3 Application-Level Logging

#### Express middleware — `ie-crm/server/middleware/auditLogger.js`

```javascript
/**
 * Audit logging middleware and helper functions.
 * Handles auth events, config changes, bulk ops, and exports
 * that cannot be captured by database triggers.
 */

// Set PostgreSQL session variables so triggers can capture user context
async function setAuditContext(pool, userId, agentName) {
  const client = await pool.connect();
  try {
    if (userId) await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    if (agentName) await client.query(`SET LOCAL app.current_agent_name = '${agentName}'`);
    return client;
  } catch (err) {
    client.release();
    throw err;
  }
}

// Log an event directly (for non-trigger events)
async function logAuditEvent(pool, {
  userId = null,
  agentName = null,
  action,
  entityType = null,
  entityId = null,
  changes = null,
  metadata = {},
  ipAddress = null,
  sessionId = null,
}) {
  await pool.query(
    `INSERT INTO audit_log
      (user_id, agent_name, action, entity_type, entity_id, changes, metadata, ip_address, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, agentName, action, entityType, entityId, changes, metadata, ipAddress, sessionId]
  );
}

module.exports = { setAuditContext, logAuditEvent };
```

**Usage in auth routes:**
```javascript
// Successful login
await logAuditEvent(pool, {
  userId: user.id,
  action: 'login',
  entityType: 'session',
  metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
  ipAddress: req.ip,
});

// Failed login
await logAuditEvent(pool, {
  action: 'login_failed',
  entityType: 'session',
  metadata: { email: req.body.email, ip: req.ip, reason: 'invalid_password' },
  ipAddress: req.ip,
});

// Bulk import
const batchId = crypto.randomUUID();
await logAuditEvent(pool, {
  userId: req.user.id,
  action: 'import',
  entityType: 'contact',
  metadata: { batch_id: batchId, filename: 'contacts.csv', row_count: 150 },
  ipAddress: req.ip,
});

// Data export
await logAuditEvent(pool, {
  userId: req.user.id,
  action: 'export',
  entityType: 'contact',
  metadata: { format: 'csv', record_count: 500, filters: req.query },
  ipAddress: req.ip,
});
```

**Configurable exclusions** (don't log noise):
```javascript
const SKIP_AUDIT_ROUTES = [
  'GET /api/health',
  'GET /api/health/deep',
  'GET /api/auth/me',
];
```

### 58.4 Audit Trail UI

#### History Tab on Entity Details

Modify each detail component (`ContactDetail.jsx`, `PropertyDetail.jsx`, etc.) to include a "History" tab:

```javascript
// In ContactDetail.jsx — new "History" section
<Section title="Change History" defaultOpen={false}>
  <AuditTimeline entityType="contact" entityId={contact.contact_id} />
</Section>
```

#### `ie-crm/src/components/shared/AuditTimeline.jsx`

Renders a vertical timeline of changes:
- Each entry: timestamp, user name or agent name, action badge, field changes
- UPDATE entries show field-level diffs: `owner_name: "Smith LLC" → "Smith Holdings LLC"`
- CREATE entries show "Record created"
- DELETE entries show "Record deleted"
- Filter controls: user, date range, action type
- "Load more" pagination (20 entries per page)

#### Global Audit Log Page (admin only)

New page at `ie-crm/src/pages/AuditLog.jsx`:
- Accessible from Settings sidebar (admin only)
- Full-text search across changes JSONB
- Filters: entity type, user, action, date range
- Export as CSV for compliance
- Columns: Timestamp, User/Agent, Action, Entity, Changes Summary

### 58.5 Undo Capability

The existing `undo_log` table (used by Claude AI for reversing write operations) is extended:

```sql
-- Add user tracking to existing undo_log
ALTER TABLE undo_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE undo_log ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'claude'
  CHECK (source IN ('claude', 'approval', 'manual'));
ALTER TABLE undo_log ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
  DEFAULT (NOW() + INTERVAL '24 hours');
```

**Undo flow for approvals:**
1. When a sandbox item is promoted, the reverse operation is stored in `undo_log`
2. The Approval Queue UI shows an "Undo" button on recently approved items (within 24 hours)
3. Clicking "Undo" executes the reverse SQL and logs the undo as a new audit entry
4. The original audit entry is preserved (never deleted)

### 58.6 Retention Policy

| Data Category | Active Retention | Archive After | Delete After |
|---------------|-----------------|---------------|-------------|
| Contact/Property changes | 2 years | 6 months | 2 years |
| Auth events | 90 days | 30 days | 90 days |
| AI agent operations | 1 year | 6 months | 1 year |
| Action item changes | 1 year | 6 months | 1 year |
| Export events | 2 years | 6 months | 2 years |

**Archive process** (monthly cron):
1. Query partitions older than 6 months
2. Export to NDJSON
3. Upload to R2 bucket: `audit-archive/YYYY/MM/audit_log_YYYY_MM.ndjson.gz`
4. Drop old partition (after verifying R2 upload)

### 58.7 Performance Considerations

- **Partitioning:** Monthly partitions keep individual table sizes manageable. Neon handles partition routing automatically.
- **Indexes:** Composite index on `(entity_type, entity_id, timestamp DESC)` for per-entity history lookups; BRIN index on timestamp for range scans.
- **Trigger overhead:** AFTER triggers do not block the original operation. The audit INSERT is lightweight (single row, no foreign key checks).
- **Batch operations:** For imports of 500+ rows, the trigger fires per row. If this causes performance issues, temporarily disable triggers during bulk import and log a single batch audit entry instead.
- **JSONB size:** For large records (properties with 70+ columns), the CREATE action stores the full row. Consider compressing or storing only non-null fields.

---

## Prompt 59 — CI/CD Pipeline & Database Branching

### 59.1 Current State

| Component | Deployment | CI/CD | Tests |
|-----------|-----------|-------|-------|
| Frontend (React/Vite) | Vercel auto-deploy on push to `main` | None | None |
| Backend (Express) | Railway auto-deploy on push to `main` | None | None |
| Database (Neon PostgreSQL) | Manual migrations | None | None |
| Desktop (Electron) | Manual `npm run dist` | None | None |

No staging environment. No automated tests. No linting in CI. Migrations applied manually.

### 59.2 GitHub Actions Workflow

#### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
  NEON_API_KEY: ${{ secrets.NEON_API_KEY }}

jobs:
  # ────────────────────────────────────────────────
  # Job 1: Lint + Unit Tests
  # ────────────────────────────────────────────────
  lint-and-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ie-crm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: ie-crm/package-lock.json
      - run: npm ci
      - run: npx eslint src/ server/ --ext .js,.jsx --max-warnings 0
      - run: npx vitest run --reporter=verbose

  # ────────────────────────────────────────────────
  # Job 2: Build Frontend
  # ────────────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: lint-and-test
    defaults:
      run:
        working-directory: ie-crm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: ie-crm/package-lock.json
      - run: npm ci
      - run: npm run build
      - name: Check bundle size
        run: |
          MAX_SIZE_KB=2048
          ACTUAL=$(du -sk dist/ | cut -f1)
          echo "Bundle size: ${ACTUAL}KB (max: ${MAX_SIZE_KB}KB)"
          if [ "$ACTUAL" -gt "$MAX_SIZE_KB" ]; then
            echo "::error::Bundle size ${ACTUAL}KB exceeds ${MAX_SIZE_KB}KB limit"
            exit 1
          fi

  # ────────────────────────────────────────────────
  # Job 3: Integration Tests (Neon branch database)
  # ────────────────────────────────────────────────
  integration:
    runs-on: ubuntu-latest
    needs: lint-and-test
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: ie-crm/package-lock.json

      - name: Create Neon branch
        id: neon-branch
        run: |
          BRANCH_NAME="pr-${{ github.event.pull_request.number }}"
          RESPONSE=$(curl -s -X POST \
            "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches" \
            -H "Authorization: Bearer ${NEON_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"branch\":{\"name\":\"${BRANCH_NAME}\"},\"endpoints\":[{\"type\":\"read_write\"}]}")
          BRANCH_ID=$(echo $RESPONSE | jq -r '.branch.id')
          ENDPOINT_HOST=$(echo $RESPONSE | jq -r '.endpoints[0].host')
          DB_URL="postgresql://neondb_owner:${{ secrets.NEON_DB_PASSWORD }}@${ENDPOINT_HOST}/neondb?sslmode=require"
          echo "branch_id=${BRANCH_ID}" >> $GITHUB_OUTPUT
          echo "database_url=${DB_URL}" >> $GITHUB_OUTPUT
          echo "branch_name=${BRANCH_NAME}" >> $GITHUB_OUTPUT

      - name: Run migrations on branch
        working-directory: ie-crm
        env:
          DATABASE_URL: ${{ steps.neon-branch.outputs.database_url }}
        run: |
          npm ci
          node scripts/migrate.js up

      - name: Run integration tests
        working-directory: ie-crm
        env:
          DATABASE_URL: ${{ steps.neon-branch.outputs.database_url }}
          JWT_SECRET: test-secret-for-ci
        run: npx vitest run --config vitest.integration.config.js

      - name: Cleanup Neon branch
        if: always()
        run: |
          curl -s -X DELETE \
            "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${{ steps.neon-branch.outputs.branch_id }}" \
            -H "Authorization: Bearer ${NEON_API_KEY}"

  # ────────────────────────────────────────────────
  # Job 4: Deploy (only on main push)
  # ────────────────────────────────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: [lint-and-test, build]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: ie-crm/package-lock.json

      - name: Run production migrations
        working-directory: ie-crm
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
        run: |
          npm ci
          node scripts/migrate.js up

      # Vercel and Railway auto-deploy on push — no explicit step needed.
      # This job ensures migrations run before the new code goes live.

      - name: Verify deployment health
        run: |
          sleep 30  # Wait for Railway/Vercel deploy
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://ie-crm-api.up.railway.app/api/health)
          if [ "$STATUS" != "200" ]; then
            echo "::error::Health check failed with status $STATUS"
            exit 1
          fi
```

#### PR Cleanup — `.github/workflows/pr-cleanup.yml`

```yaml
name: PR Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup-neon-branch:
    runs-on: ubuntu-latest
    steps:
      - name: Delete Neon branch
        run: |
          BRANCH_NAME="pr-${{ github.event.pull_request.number }}"
          # List branches, find matching one, delete it
          BRANCHES=$(curl -s \
            "https://console.neon.tech/api/v2/projects/${{ secrets.NEON_PROJECT_ID }}/branches" \
            -H "Authorization: Bearer ${{ secrets.NEON_API_KEY }}")
          BRANCH_ID=$(echo $BRANCHES | jq -r ".branches[] | select(.name==\"${BRANCH_NAME}\") | .id")
          if [ -n "$BRANCH_ID" ] && [ "$BRANCH_ID" != "null" ]; then
            curl -s -X DELETE \
              "https://console.neon.tech/api/v2/projects/${{ secrets.NEON_PROJECT_ID }}/branches/${BRANCH_ID}" \
              -H "Authorization: Bearer ${{ secrets.NEON_API_KEY }}"
            echo "Deleted Neon branch: ${BRANCH_NAME} (${BRANCH_ID})"
          fi
```

### 59.3 Migration Runner

#### `ie-crm/scripts/migrate.js`

```javascript
#!/usr/bin/env node
/**
 * Migration runner for IE CRM.
 * Usage:
 *   node scripts/migrate.js up        # Apply all pending migrations
 *   node scripts/migrate.js down [N]   # Rollback last N migrations (default 1)
 *   node scripts/migrate.js status     # Show applied/pending migrations
 *
 * Reads .sql files from ie-crm/migrations/ in numeric order.
 * Tracks applied migrations in schema_migrations table.
 * Runs each migration in a transaction — rolls back on error.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const command = process.argv[2] || 'status';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Ensure schema_migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum TEXT
      )
    `);

    const applied = await pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(applied.rows.map(r => r.version));

    // Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (command === 'status') {
      console.log('\nMigration Status:');
      console.log('─'.repeat(60));
      for (const file of files) {
        const version = file.replace('.sql', '');
        const status = appliedVersions.has(version) ? 'APPLIED' : 'PENDING';
        const icon = status === 'APPLIED' ? '[+]' : '[ ]';
        console.log(`  ${icon} ${file}  (${status})`);
      }
      const pending = files.filter(f => !appliedVersions.has(f.replace('.sql', '')));
      console.log(`\n  ${pending.length} pending migration(s)\n`);
    }

    else if (command === 'up') {
      const pending = files.filter(f => !appliedVersions.has(f.replace('.sql', '')));
      if (pending.length === 0) {
        console.log('No pending migrations.');
        return;
      }
      for (const file of pending) {
        const version = file.replace('.sql', '');
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const checksum = require('crypto').createHash('md5').update(sql).digest('hex');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`Applying ${file}...`);
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
            [version, file, checksum]
          );
          await client.query('COMMIT');
          console.log(`  Applied ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  FAILED ${file}: ${err.message}`);
          process.exit(1);
        } finally {
          client.release();
        }
      }
      console.log(`\nApplied ${pending.length} migration(s).`);
    }

    else if (command === 'down') {
      const count = parseInt(process.argv[3] || '1', 10);
      const appliedList = applied.rows.map(r => r.version).reverse().slice(0, count);
      if (appliedList.length === 0) {
        console.log('No migrations to rollback.');
        return;
      }
      for (const version of appliedList) {
        const downFile = `${version}.down.sql`;
        const downPath = path.join(MIGRATIONS_DIR, downFile);
        if (!fs.existsSync(downPath)) {
          console.error(`No down migration found: ${downFile}`);
          process.exit(1);
        }
        const sql = fs.readFileSync(downPath, 'utf8');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`Rolling back ${version}...`);
          await client.query(sql);
          await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
          await client.query('COMMIT');
          console.log(`  Rolled back ${version}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ROLLBACK FAILED ${version}: ${err.message}`);
          process.exit(1);
        } finally {
          client.release();
        }
      }
    }

    else {
      console.error(`Unknown command: ${command}`);
      console.error('Usage: migrate.js [up|down|status]');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

### 59.4 Environment Management

| Environment | Frontend | Backend | Database | Branch |
|-------------|----------|---------|----------|--------|
| Development | `localhost:5173` | `localhost:3001` | Neon `dev` branch | `feature/*` |
| Staging | `staging.ie-crm.vercel.app` | Railway staging service | Neon `staging` branch | `staging` |
| Production | `ie-crm.vercel.app` | Railway production | Neon `main` branch | `main` |
| PR Preview | Vercel preview URL | Railway preview (or shared staging) | Neon `pr-{N}` branch | `pr-*` |

**Environment files** (checked into repo with placeholder values):
```
ie-crm/.env.development    # VITE_API_URL=http://localhost:3001
ie-crm/.env.staging        # VITE_API_URL=https://ie-crm-staging.up.railway.app
ie-crm/.env.production     # VITE_API_URL=https://ie-crm-api.up.railway.app
```

**Secrets stored in GitHub Actions** (never in repo):
- `PRODUCTION_DATABASE_URL`
- `NEON_PROJECT_ID`
- `NEON_API_KEY`
- `NEON_DB_PASSWORD`
- `JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `POSTMARK_API_KEY`
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

### 59.5 Staging Environment Setup

**Railway:** Create a second service `ie-crm-staging` in the same Railway project. Configure it to auto-deploy on pushes to the `staging` branch. Set `DATABASE_URL` to the Neon `staging` branch connection string.

**Neon:** Create a persistent `staging` branch from `main`. This branch persists between deployments (unlike ephemeral PR branches). Refresh it from `main` weekly or on-demand:
```bash
# Refresh staging branch from main (destroys staging data, copies production structure + sanitized data)
neon branches reset staging --parent main
node scripts/migrate.js up  # Apply any new migrations
node scripts/seed-staging.js  # Sanitize PII
```

**Data sanitization** (`ie-crm/scripts/seed-staging.js`):
```javascript
// Replace real PII in staging with synthetic data
// Keeps record counts and relationships intact
await pool.query(`
  UPDATE contacts SET
    email = 'contact-' || contact_id || '@staging.test',
    phone_1 = '909-555-' || LPAD(contact_id::text, 4, '0'),
    phone_2 = NULL, phone_3 = NULL,
    home_address = '123 Staging St'
  WHERE email IS NOT NULL
`);
```

### 59.6 Rollback Strategy

| Component | Method | RTO | Steps |
|-----------|--------|-----|-------|
| Frontend (Vercel) | Instant rollback | < 1 min | Vercel dashboard > Deployments > promote previous |
| Backend (Railway) | Rollback deployment | < 2 min | Railway dashboard > Deployments > rollback |
| Database (schema) | Down migration | 5 min | `node scripts/migrate.js down 1` |
| Database (data) | Neon point-in-time restore | 15 min | Neon dashboard > Restore > select timestamp |
| Full rollback | All three above | 20 min | Follow runbook (see below) |

**Rollback runbook** (store in `docs/runbooks/rollback.md`):
1. Identify the failing deployment (check `/api/health`, error logs)
2. If frontend-only: rollback Vercel deployment
3. If backend-only: rollback Railway deployment
4. If database migration caused issues: run `node scripts/migrate.js down 1`
5. If data corruption: restore Neon to point-in-time before the deployment
6. Verify health: `curl https://ie-crm-api.up.railway.app/api/health/deep`
7. Post-incident: document in `docs/incidents/` with root cause and fix

### 59.7 npm Scripts

Add to `ie-crm/package.json`:
```json
{
  "scripts": {
    "migrate:up": "node scripts/migrate.js up",
    "migrate:down": "node scripts/migrate.js down",
    "migrate:status": "node scripts/migrate.js status",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.js",
    "lint": "eslint src/ server/ --ext .js,.jsx",
    "lint:fix": "eslint src/ server/ --ext .js,.jsx --fix"
  }
}
```

---

## Prompt 60 — Performance Monitoring, Health Checks & Disaster Recovery

### 60.1 API Response Time Tracking

#### Express Middleware — `ie-crm/server/middleware/metrics.js`

```javascript
/**
 * API metrics middleware.
 * Logs response time for every request (except health checks).
 * Stores to api_metrics table in batches (flush every 10 seconds).
 */

const SKIP_ROUTES = ['/api/health', '/robots.txt', '/favicon.ico'];
const buffer = [];
let flushTimer = null;

function metricsMiddleware(pool) {
  // Flush buffer to database every 10 seconds
  flushTimer = setInterval(async () => {
    if (buffer.length === 0 || !pool) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      const values = batch.map((m, i) => {
        const offset = i * 6;
        return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6})`;
      }).join(', ');
      const params = batch.flatMap(m => [
        m.route, m.method, m.statusCode, m.responseTimeMs, m.timestamp, m.userId
      ]);
      await pool.query(
        `INSERT INTO api_metrics (route, method, status_code, response_time_ms, timestamp, user_id)
         VALUES ${values}`, params
      );
    } catch (err) {
      console.error('[metrics] Flush failed:', err.message);
    }
  }, 10000);

  return (req, res, next) => {
    if (SKIP_ROUTES.some(r => req.path.startsWith(r))) return next();

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms
      buffer.push({
        route: req.route?.path || req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseTimeMs: Math.round(elapsed),
        timestamp: new Date().toISOString(),
        userId: req.user?.id || null,
      });
    });
    next();
  };
}

module.exports = { metricsMiddleware };
```

#### Migration 010: `010_monitoring.sql`

```sql
-- Migration 010: Performance Monitoring & Health Infrastructure

-- ============================================================
-- API METRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_metrics (
  id BIGSERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_api_metrics_route ON api_metrics (route, timestamp DESC);
CREATE INDEX idx_api_metrics_timestamp ON api_metrics USING BRIN (timestamp);
CREATE INDEX idx_api_metrics_slow ON api_metrics (response_time_ms DESC)
  WHERE response_time_ms > 2000;

-- Aggregation view: p50, p95, p99 per route per hour
CREATE OR REPLACE VIEW api_metrics_hourly AS
SELECT
  route,
  method,
  date_trunc('hour', timestamp) AS hour,
  COUNT(*) AS request_count,
  ROUND(AVG(response_time_ms)) AS avg_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) AS p99_ms,
  COUNT(*) FILTER (WHERE status_code >= 500) AS error_count
FROM api_metrics
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY route, method, date_trunc('hour', timestamp);

-- ============================================================
-- SLOW QUERY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS slow_query_log (
  id BIGSERIAL PRIMARY KEY,
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  rows_returned INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slow_queries_hash ON slow_query_log (query_hash);
CREATE INDEX idx_slow_queries_time ON slow_query_log (execution_time_ms DESC);
CREATE INDEX idx_slow_queries_timestamp ON slow_query_log USING BRIN (timestamp);

-- ============================================================
-- FRONTEND ERRORS
-- ============================================================
CREATE TABLE IF NOT EXISTS frontend_errors (
  id BIGSERIAL PRIMARY KEY,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  page_url TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  browser TEXT,
  os TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_frontend_errors_timestamp ON frontend_errors USING BRIN (timestamp);
CREATE INDEX idx_frontend_errors_user ON frontend_errors (user_id);

-- ============================================================
-- RETENTION: Auto-cleanup for metrics (keep 30 days)
-- ============================================================
-- Run daily via cron or pg_cron:
-- DELETE FROM api_metrics WHERE timestamp < NOW() - INTERVAL '30 days';
-- DELETE FROM slow_query_log WHERE timestamp < NOW() - INTERVAL '30 days';
-- DELETE FROM frontend_errors WHERE timestamp < NOW() - INTERVAL '30 days';

COMMENT ON TABLE api_metrics IS 'API response time tracking — flushed in batches from Express middleware';
COMMENT ON TABLE slow_query_log IS 'Queries exceeding 500ms threshold — logged for index optimization';
COMMENT ON TABLE frontend_errors IS 'Client-side errors reported via /api/telemetry/error endpoint';
```

### 60.2 Database Query Monitoring

Add to `server/index.js` — wrap the existing `pool.query` to detect slow queries:

```javascript
// Monkey-patch pool.query to log slow queries
const originalQuery = pool.query.bind(pool);
pool.query = async function(text, params) {
  const start = Date.now();
  const result = await originalQuery(text, params);
  const elapsed = Date.now() - start;

  if (elapsed > 500) {
    const queryHash = require('crypto')
      .createHash('md5').update(text).digest('hex');
    originalQuery(
      `INSERT INTO slow_query_log (query_hash, query_text, execution_time_ms, rows_returned)
       VALUES ($1, $2, $3, $4)`,
      [queryHash, text.substring(0, 2000), elapsed, result.rowCount]
    ).catch(() => {}); // Fire-and-forget
    console.warn(`[SLOW QUERY] ${elapsed}ms: ${text.substring(0, 100)}...`);
  }
  return result;
};
```

### 60.3 Frontend Performance

#### Web Vitals — `ie-crm/src/utils/telemetry.js`

```javascript
import { onCLS, onFID, onLCP } from 'web-vitals';

const API_URL = import.meta.env.VITE_API_URL || '';

// Report Web Vitals to backend
function reportVital(metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,   // 'good', 'needs-improvement', 'poor'
    page: window.location.hash,
  });
  // Use sendBeacon for reliability (fires even on page unload)
  navigator.sendBeacon(`${API_URL}/api/telemetry/vital`, body);
}

export function initTelemetry() {
  onCLS(reportVital);
  onFID(reportVital);
  onLCP(reportVital);

  // Global error handler
  window.onerror = (message, source, lineno, colno, error) => {
    fetch(`${API_URL}/api/telemetry/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        error_message: message,
        stack_trace: error?.stack,
        page_url: window.location.hash,
        browser: navigator.userAgent,
      }),
    }).catch(() => {});
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    fetch(`${API_URL}/api/telemetry/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        error_message: `Unhandled rejection: ${event.reason}`,
        stack_trace: event.reason?.stack,
        page_url: window.location.hash,
        browser: navigator.userAgent,
      }),
    }).catch(() => {});
  };
}
```

### 60.4 Health Check Endpoints

Replace the current minimal health check in `server/index.js`:

```javascript
// ============================================================
// HEALTH CHECKS
// ============================================================

// Basic health — returns 200 if server is running
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Deep health — checks all dependencies
app.get('/api/health/deep', async (_req, res) => {
  const checks = {};
  let overallStatus = 'healthy';

  // Database
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', latency_ms: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'error', error: err.message };
    overallStatus = 'unhealthy';
  }

  // Database connection pool
  checks.db_pool = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    status: pool.waitingCount > 5 ? 'degraded' : 'ok',
  };
  if (checks.db_pool.status === 'degraded') overallStatus = 'degraded';

  // Ollama (if configured — local AI models)
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const ollamaRes = await fetch(`${ollamaUrl}/api/version`, { signal: controller.signal });
    checks.ollama = ollamaRes.ok
      ? { status: 'ok', version: (await ollamaRes.json()).version }
      : { status: 'unreachable' };
  } catch {
    checks.ollama = { status: 'unreachable' };
    // Ollama being down is degraded, not unhealthy (AI features optional)
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  // Postmark (email service)
  if (process.env.POSTMARK_API_KEY) {
    try {
      const pmRes = await fetch('https://api.postmarkapp.com/server', {
        headers: { 'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY },
      });
      checks.postmark = pmRes.ok ? { status: 'ok' } : { status: 'error' };
    } catch {
      checks.postmark = { status: 'unreachable' };
    }
  } else {
    checks.postmark = { status: 'not_configured' };
  }

  // Anthropic API
  if (anthropic) {
    checks.anthropic = { status: 'configured' };
  } else {
    checks.anthropic = { status: 'not_configured' };
  }

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
    status: overallStatus,
    checks,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});
```

**External monitoring:**
- UptimeRobot (free tier): ping `GET /api/health` every 5 minutes
- Alert via email + SMS if down for > 2 consecutive checks (10 minutes)
- Monthly uptime report

### 60.5 Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| API p95 response time | > 1000ms | > 2000ms | Check slow query log, consider caching |
| API error rate (5xx) | > 1% | > 5% | Check logs, consider rollback |
| DB connection pool waiting | > 3 | > 8 | Increase pool size or check for leaks |
| Frontend error rate | > 10/hour | > 50/hour | Check frontend_errors table |
| Disk usage (Neon) | > 70% | > 90% | Archive old data, review partitions |
| Health check failure | 1 consecutive | 2 consecutive | Page on-call (David) |

Alerts delivered via:
1. Postmark email to `david@mudgeteamcre.com`
2. Future: Slack webhook or SMS via Twilio

### 60.6 Disaster Recovery Plan

#### Scenario 1: Database Corruption or Loss

| Aspect | Detail |
|--------|--------|
| **Protection** | Neon automated daily backups, 7-day retention, WAL streaming for PITR |
| **RPO** | 0 seconds (Neon WAL ensures no data loss up to the second) |
| **RTO** | 15 minutes |
| **Recovery steps** | 1. Neon dashboard > Project > Restore > Pick timestamp. 2. Verify data integrity. 3. Update `DATABASE_URL` if endpoint changed. 4. Restart Railway service. |

#### Scenario 2: Railway Backend Goes Down

| Aspect | Detail |
|--------|--------|
| **Protection** | Railway auto-restart on crash, deployment rollback |
| **RTO** | 5 min (auto-restart) to 30 min (manual migration to Render/Fly.io) |
| **Recovery steps** | 1. Check Railway status page. 2. If crash: Railway auto-restarts. 3. If bad deploy: rollback to previous. 4. If Railway outage: deploy to backup provider (Render). |

**Backup provider prep** (Render):
- `render.yaml` blueprint checked into repo
- Environment variables documented in secure vault
- One-command deploy: `render deploy` with the same `DATABASE_URL`

#### Scenario 3: Vercel Frontend Goes Down

| Aspect | Detail |
|--------|--------|
| **Protection** | Vercel instant rollback, CDN edge caching |
| **RTO** | < 1 minute |
| **Recovery steps** | 1. Vercel dashboard > Deployments > Promote previous. 2. Verify at production URL. |

#### Scenario 4: Mac Mini Hardware Failure (Agent Host)

| Aspect | Detail |
|--------|--------|
| **Protection** | All agent state in Neon DB (not local). Agent instructions in git. |
| **RTO** | 2-4 hours (mostly Ollama model download) |
| **Recovery steps** | 1. Provision replacement Mac (Mini or Studio). 2. Clone repo. 3. Install Ollama + pull models (~30GB). 4. Configure .env with existing API keys. 5. Start agent orchestrator. 6. Verify agent heartbeats in DB. |
| **Mitigation** | Pre-download models on Mac Studio as hot standby. Keep model list in `ai-system/models.txt`. |

#### Scenario 5: Data Breach / Security Incident

| Phase | Action |
|-------|--------|
| **Immediate (0-15 min)** | 1. Rotate all API keys (Anthropic, Postmark, Neon, R2). 2. Revoke all sessions: `DELETE FROM sessions`. 3. Force password reset for all users. |
| **Assessment (15-60 min)** | 4. Query `audit_log` for suspicious activity: unusual IPs, bulk exports, role escalations. 5. Check `ai_api_keys` for unauthorized keys. 6. Review Railway/Vercel deploy logs. |
| **Notification (1-4 hours)** | 7. If contact PII exposed: notify affected contacts per CCPA/CAN-SPAM requirements. 8. Document scope of exposure. |
| **Post-mortem (24-72 hours)** | 9. Write incident report: timeline, root cause, impact, remediation. 10. Update security controls. 11. Store in `docs/incidents/YYYY-MM-DD-description.md`. |

### 60.7 Backup Strategy

| Data | Method | Frequency | Retention | Verification |
|------|--------|-----------|-----------|-------------|
| Database (PostgreSQL) | Neon automated backups | Continuous (WAL) + daily snapshots | 7 days PITR | Quarterly restore test |
| Agent instructions | Git repo (GitHub) | Every commit | Indefinite | Always available |
| Agent memory files | Sync to R2 bucket | Daily (cron) | 90 days | Monthly spot check |
| Email attachments | R2 (primary storage) | N/A (source of truth) | Indefinite | R2 durability: 99.999999999% |
| Configuration/secrets | GitHub Actions secrets + 1Password | On change | Indefinite | Annual review |
| Audit log archive | R2 export | Monthly | 2 years | Quarterly restore test |

**Quarterly restore test procedure:**
1. Create Neon branch from 7-day-old backup
2. Run all migrations
3. Verify record counts match expected
4. Run health check suite against restored branch
5. Document results in `docs/runbooks/restore-test-log.md`
6. Delete test branch

### 60.8 Monitoring Dashboard

New admin-only page: `ie-crm/src/pages/Settings/SystemHealth.jsx`

**Sections:**

1. **Service Status** — Real-time status from `/api/health/deep` with green/yellow/red indicators for each dependency (DB, Ollama, Postmark, Anthropic)

2. **API Performance** (last 24h) — Chart showing p50/p95/p99 response times per hour. Table of top 10 slowest routes with avg response time and error rate.

3. **Database Stats** — Connection pool utilization, slow query count (last 24h), table sizes, index usage stats.

4. **Frontend Errors** (last 24h) — Error count by page, most common errors, affected users.

5. **Agent Fleet Status** — Reuses existing `agent_heartbeats` data: agent name, status, last heartbeat, items processed today.

6. **Uptime History** — Last 30 days, pulled from UptimeRobot API or internal health check log.

7. **Alerts Configuration** — Threshold settings for each metric, notification preferences.

### 60.9 Telemetry Endpoints

Add to `server/index.js`:

```javascript
// Telemetry: frontend errors
app.post('/api/telemetry/error', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { error_message, stack_trace, page_url, browser } = req.body;
  await pool.query(
    `INSERT INTO frontend_errors (error_message, stack_trace, page_url, user_id, browser)
     VALUES ($1, $2, $3, $4, $5)`,
    [error_message, stack_trace, page_url, req.user?.id || null, browser]
  );
  res.json({ ok: true });
});

// Telemetry: web vitals (stored as api_metrics with special route prefix)
app.post('/api/telemetry/vital', express.text(), async (req, res) => {
  // Stored in api_metrics with route = 'vital:{name}'
  try {
    const data = JSON.parse(req.body);
    await pool.query(
      `INSERT INTO api_metrics (route, method, status_code, response_time_ms, timestamp)
       VALUES ($1, 'VITAL', 0, $2, NOW())`,
      [`vital:${data.name}`, Math.round(data.value)]
    );
  } catch {} // Best-effort
  res.json({ ok: true });
});
```

### 60.10 Metrics Cleanup Cron

Add to the nightly cron schedule (referenced in existing security-hardening docs):

```sql
-- Run nightly at 3:00 AM PT
-- Cleanup old metrics (keep 30 days)
DELETE FROM api_metrics WHERE timestamp < NOW() - INTERVAL '30 days';
DELETE FROM slow_query_log WHERE timestamp < NOW() - INTERVAL '30 days';
DELETE FROM frontend_errors WHERE timestamp < NOW() - INTERVAL '30 days';

-- Cleanup expired sessions
DELETE FROM sessions WHERE expires_at < NOW();

-- Create next month's audit_log partition if needed
-- (handled by scripts/create-audit-partitions.js)
```

---

## Implementation Priority

| Priority | Item | Migration | Effort | Dependencies |
|----------|------|-----------|--------|-------------|
| P0 | RBAC (users, sessions, auth middleware) | 008 | 3-4 days | None |
| P0 | Migration runner (`scripts/migrate.js`) | N/A | 1 day | None |
| P1 | Audit trail (triggers, audit_log) | 009 | 2-3 days | 008 (users table) |
| P1 | Health checks (deep health endpoint) | N/A | 0.5 day | None |
| P1 | CI/CD pipeline (GitHub Actions) | N/A | 1-2 days | Migration runner |
| P2 | API metrics + monitoring tables | 010 | 1-2 days | 008 (users table) |
| P2 | Frontend auth (AuthContext, Login, ProtectedRoute) | N/A | 2-3 days | 008 (backend auth) |
| P2 | Houston UI adaptations | N/A | 1-2 days | Frontend auth |
| P2 | Staging environment | N/A | 1 day | CI/CD pipeline |
| P3 | Audit trail UI (History tab, global log) | N/A | 2-3 days | 009 (audit tables) |
| P3 | System Health dashboard | N/A | 2-3 days | 010 (metrics tables) |
| P3 | Frontend telemetry (Web Vitals, error tracking) | N/A | 1 day | 010 |
| P3 | Disaster recovery runbooks | N/A | 0.5 day | None |

**Total estimated effort:** 18-25 days

---

## Migration Summary

| Migration | File | Tables/Objects Created |
|-----------|------|----------------------|
| 008 | `008_rbac.sql` | `users`, `sessions`, `user_preferences` |
| 009 | `009_audit_trail.sql` | `audit_log` (partitioned), `audit_trigger_fn()`, triggers on 11 tables |
| 010 | `010_monitoring.sql` | `api_metrics`, `slow_query_log`, `frontend_errors`, `api_metrics_hourly` view |

---

## New Files Created

| File | Purpose |
|------|---------|
| `ie-crm/migrations/008_rbac.sql` | Users, sessions, preferences |
| `ie-crm/migrations/009_audit_trail.sql` | Audit log + triggers |
| `ie-crm/migrations/010_monitoring.sql` | Performance monitoring tables |
| `ie-crm/server/middleware/auth.js` | JWT + role middleware |
| `ie-crm/server/middleware/auditLogger.js` | Application-level audit logging |
| `ie-crm/server/middleware/metrics.js` | API response time tracking |
| `ie-crm/server/routes/auth.js` | Auth endpoints |
| `ie-crm/scripts/migrate.js` | Migration runner |
| `ie-crm/scripts/seed-staging.js` | Staging data sanitization |
| `ie-crm/src/contexts/AuthContext.jsx` | React auth state |
| `ie-crm/src/components/ProtectedRoute.jsx` | Route guards |
| `ie-crm/src/components/shared/AuditTimeline.jsx` | Change history UI |
| `ie-crm/src/pages/Login.jsx` | Login page |
| `ie-crm/src/pages/Settings/Users.jsx` | User management |
| `ie-crm/src/pages/Settings/SystemHealth.jsx` | Monitoring dashboard |
| `ie-crm/src/pages/AuditLog.jsx` | Global audit log (admin) |
| `ie-crm/src/utils/telemetry.js` | Frontend error + vitals tracking |
| `.github/workflows/ci.yml` | CI/CD pipeline |
| `.github/workflows/pr-cleanup.yml` | Neon branch cleanup |
| `docs/runbooks/rollback.md` | Rollback procedure |

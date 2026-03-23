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
  const r = ROLES.find(x => x.value === role) || ROLES[1];
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
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setResetId(resetId === u.user_id ? null : u.user_id)}
                  className="text-[10px] text-crm-muted hover:text-crm-text px-2 py-1"
                >
                  Reset PW
                </button>
              </div>
            </div>
            {resetId === u.user_id && (
              <div className="mt-2 pt-2 border-t border-crm-border/50 flex items-center gap-2">
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  className="[color-scheme:dark] flex-1 bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none"
                />
                <button onClick={() => handleResetPassword(u.user_id)} className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white px-3 py-1.5 rounded">
                  Reset
                </button>
                <button onClick={() => { setResetId(null); setResetPw(''); }} className="text-xs text-crm-muted px-2 py-1.5">
                  Cancel
                </button>
              </div>
            )}
            <p className="text-[10px] text-crm-muted/60 mt-1.5">
              Last login: {u.last_login ? new Date(u.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}
            </p>
          </div>
        ))}
      </div>

      {showAdd ? (
        <form onSubmit={handleCreate} className="bg-crm-card border border-crm-border rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-medium text-crm-muted uppercase tracking-wider">Add Team Member</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Full name" required className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none" />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none" />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Temp password" required minLength={6} className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md outline-none" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] text-crm-muted mb-1.5">Avatar color</p>
            <div className="flex gap-1.5">
              {AVATAR_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, avatar_color: c })}
                  className={`w-6 h-6 rounded-full transition-all ${form.avatar_color === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-4 py-1.5 rounded">Add Member</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-crm-muted px-3 py-1.5">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full border border-dashed border-crm-border rounded-lg py-2.5 text-xs text-crm-muted hover:text-crm-accent hover:border-crm-accent transition-colors">
          + Add Team Member
        </button>
      )}
    </div>
  );
}

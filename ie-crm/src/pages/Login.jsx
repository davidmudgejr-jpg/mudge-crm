import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-crm-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-crm-accent/20 border border-crm-accent/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-crm-accent text-lg font-bold">IE</span>
          </div>
          <h1 className="text-xl font-semibold text-crm-text">IE CRM</h1>
          <p className="text-crm-muted text-sm mt-1">Leanne Associates</p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-crm-card border border-crm-border rounded-xl p-6 space-y-4"
        >
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-crm-muted text-xs font-medium mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoFocus
              required
              className="w-full px-3 py-2 rounded-lg bg-crm-bg border border-crm-border text-crm-text text-sm placeholder:text-crm-muted/50 focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30 transition-colors"
            />
          </div>

          <div>
            <label className="block text-crm-muted text-xs font-medium mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className="w-full px-3 py-2 rounded-lg bg-crm-bg border border-crm-border text-crm-text text-sm placeholder:text-crm-muted/50 focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-crm-accent hover:bg-crm-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

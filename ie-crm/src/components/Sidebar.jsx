import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDevMode } from './shared/DevModeContext';
import { useAuth } from '../contexts/AuthContext';
import mcIcon from '../assets/mc-icon.png';

const NAV_ITEMS = [
  { path: '/properties', label: 'Properties', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { path: '/contacts', label: 'Contacts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { path: '/companies', label: 'Companies', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { path: '/deals', label: 'Deals', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { path: '/tpe', label: 'TPE', title: 'Transaction Probability Engine', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { path: '/tpe-enrichment', label: 'Enrichment', title: 'TPE Data Enrichment', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { path: '/verification', label: 'Verify', title: 'Verification Queue', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', badge: 'verification' },
  { path: '/interactions', label: 'Activity', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { path: '/campaigns', label: 'Campaigns', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { path: '/action-items', label: 'Tasks', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { path: '/comps', label: 'Comps', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { path: '/ai-ops', label: 'AI Ops', title: 'Mission Control', icon: 'M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.59.659H9.06a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4.5' },
  { path: '/dedup', label: 'Dedup', title: 'Duplicate Review', icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { path: '/import', label: 'Import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function Sidebar({ onTableChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [verificationCount, setVerificationCount] = useState(0);

  // Fetch pending verification count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const token = localStorage.getItem('crm-auth-token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API}/api/verification/queue?status=pending&limit=1`, { headers });
        if (res.ok) {
          const data = await res.json();
          setVerificationCount(data.total || 0);
        }
      } catch { /* silently fail */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);
  const { devMode, toggleDevMode } = useDevMode();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Track whether the OS is in dark mode
  const [isDark, setIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleClick = (item) => {
    navigate(item.path);
    if (onTableChange) {
      const table = item.path.replace('/', '') || 'properties';
      onTableChange(table);
    }
  };

  return (
    <aside className="relative w-16 bg-crm-sidebar glass-sidebar flex flex-col items-center pt-10 pb-4 z-10 flex-shrink-0 border-r border-crm-border/50">
      {/* Logo */}
      <img src={mcIcon} alt="MC" className="mb-6 w-10 h-10 rounded-lg object-cover" />

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-1 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path || (location.pathname === '/' && item.path === '/properties');
          return (
            <button
              key={item.path}
              onClick={() => handleClick(item)}
              className={`no-drag relative group flex flex-col items-center justify-center py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-white shadow-[0_0_20px_rgba(0,122,255,0.3)]'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover hover:scale-[1.08] active:scale-[0.92]'
              }`}
              style={isActive ? { background: 'linear-gradient(135deg, #007AFF, #5856D6)', borderRadius: '12px' } : undefined}
              title={item.title || item.label}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d={item.icon} />
              </svg>
              <span className="text-[9px] mt-0.5 leading-none">{item.label}</span>
              {item.badge === 'verification' && verificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
                  {verificationCount > 9 ? '9+' : verificationCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User avatar + sign out */}
      {user && (
        <div className="relative mb-2">
          <button
            onClick={() => setShowUserMenu(prev => !prev)}
            className="no-drag w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-colors hover:ring-1 hover:ring-white/20"
            style={{ background: user.avatar_color || '#3b82f6' }}
            title={user.display_name}
          >
            {(user.display_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
          </button>
          {showUserMenu && (
            <div className="absolute left-12 bottom-0 bg-crm-card border border-crm-border rounded-lg shadow-xl py-1 w-44 z-50">
              <div className="px-3 py-2 border-b border-crm-border">
                <p className="text-crm-text text-sm font-medium">{user.display_name}</p>
                <p className="text-crm-muted text-xs truncate">{user.email}</p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); logout(); }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dev Mode toggle — only visible in dark mode */}
      {isDark && (
        <button
          onClick={toggleDevMode}
          className={`no-drag mb-2 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-bold transition-colors ${
            devMode
              ? 'bg-[#0e7ad3]/20 text-[#569cd6] ring-1 ring-[#569cd6]/40'
              : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
          }`}
          title={devMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
        >
          {'{ }'}
        </button>
      )}
    </aside>
  );
}

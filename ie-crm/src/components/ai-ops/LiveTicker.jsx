import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// LiveTicker — Scrolling news-style ticker at the bottom of the war room
// Shows recent agent activity logs in a continuous horizontal scroll.
// Pure CSS animation — no JS RAF loop needed.
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const LOG_TYPE_ICONS = {
  info: '●',
  success: '✓',
  error: '✗',
  warning: '⚠',
  discovery: '◆',
};

const LOG_TYPE_COLORS = {
  info: '#60a5fa',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  discovery: '#a78bfa',
};

export default function LiveTicker({ logs = [], visible = true }) {
  // Build ticker items from logs
  const items = useMemo(() => {
    if (!logs || logs.length === 0) {
      return ['Awaiting agent activity...'];
    }
    return logs.map((log) => {
      const agent = (log.agent_name || 'system').toUpperCase();
      const icon = LOG_TYPE_ICONS[log.log_type] || '●';
      const color = LOG_TYPE_COLORS[log.log_type] || '#60a5fa';
      const time = formatTimeAgo(log.created_at);
      const content = log.content || 'No details';
      // Truncate long content for ticker readability
      const truncated = content.length > 80 ? content.slice(0, 77) + '...' : content;
      return { text: `${icon} ${agent}: ${truncated}`, time, color };
    });
  }, [logs]);

  if (!visible) return null;

  // Duplicate items for seamless loop
  const allItems = [...items, ...items];

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 32,
      background: 'linear-gradient(to right, rgba(4,4,10,0.95), rgba(4,4,10,0.85), rgba(4,4,10,0.95))',
      borderTop: '1px solid rgba(59, 130, 246, 0.2)',
      overflow: 'hidden',
      zIndex: 45,
      display: 'flex',
      alignItems: 'center',
    }}>
      {/* LIVE indicator */}
      <div style={{
        flexShrink: 0,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRight: '1px solid rgba(59, 130, 246, 0.2)',
        height: '100%',
        background: 'rgba(4,4,10,0.95)',
        zIndex: 2,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#10b981',
          boxShadow: '0 0 6px #10b981',
          animation: 'tickerPulse 2s ease-in-out infinite',
        }} />
        <span style={{
          color: '#10b981',
          fontSize: 10,
          fontFamily: 'monospace',
          fontWeight: 600,
          letterSpacing: 1,
        }}>LIVE</span>
      </div>

      {/* Scrolling content */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          animation: `tickerScroll ${Math.max(items.length * 8, 30)}s linear infinite`,
        }}>
          {allItems.map((item, i) => (
            <span key={i} style={{
              padding: '0 24px',
              fontSize: 11,
              fontFamily: 'monospace',
              color: typeof item === 'string' ? '#64748b' : item.color,
              flexShrink: 0,
            }}>
              {typeof item === 'string' ? item : (
                <>
                  {item.text}
                  <span style={{ color: '#475569', marginLeft: 8 }}>{item.time}</span>
                </>
              )}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes tickerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

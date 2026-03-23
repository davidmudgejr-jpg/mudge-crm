import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Agent color palette
// ---------------------------------------------------------------------------
const AGENT_COLORS = {
  enricher:   '#10b981',
  researcher: '#3b82f6',
  scout:      '#f59e0b',
  matcher:    '#8b5cf6',
  ralph:      '#ef4444',
  houston:    '#fbbf24',
};

function agentColor(name) {
  return AGENT_COLORS[name?.toLowerCase()] || '#94a3b8';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function truncate(str, len = 28) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ---------------------------------------------------------------------------
// LiveFeedTicker
// ---------------------------------------------------------------------------
export default function LiveFeedTicker({ logs = [] }) {
  const entries = useMemo(() => (logs || []).slice(0, 8), [logs]);
  const shouldScroll = entries.length > 3;

  // Each entry is roughly 180px wide; total content width
  const contentWidth = entries.length * 185;

  return (
    <g transform="translate(130,586)">
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-scroll {
          animation: tickerScroll ${Math.max(20, entries.length * 6)}s linear infinite;
        }
        @keyframes livePulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        .live-dot { animation: livePulse 1.2s ease-in-out infinite; }
      `}</style>

      {/* Background */}
      <rect
        x={0} y={0}
        width={640} height={28}
        rx={4}
        fill="#080812"
        stroke="#1a1a2e"
        strokeWidth={0.8}
        opacity={0.92}
      />

      {/* LIVE badge area */}
      <rect
        x={2} y={2}
        width={42} height={24}
        rx={3}
        fill="#1a0a0a"
        opacity={0.8}
      />
      <circle cx={12} cy={14} r={3.5} fill="#ef4444" className="live-dot" />
      <text
        x={20} y={18}
        fill="#ef4444"
        fontSize={7}
        fontFamily="monospace"
        fontWeight="bold"
        letterSpacing={0.5}
      >
        LIVE
      </text>

      {/* Divider */}
      <line x1={46} y1={4} x2={46} y2={24} stroke="#1e1e3a" strokeWidth={0.8} />

      {/* Clip region for scroll area */}
      <defs>
        <clipPath id="tickerClip">
          <rect x={48} y={2} width={588} height={24} />
        </clipPath>
      </defs>

      {/* Scrolling content */}
      <g clipPath="url(#tickerClip)">
        {entries.length === 0 ? (
          <text
            x={60} y={18}
            fill="#334155"
            fontSize={7}
            fontFamily="monospace"
            opacity={0.6}
          >
            Waiting for agent activity...
          </text>
        ) : (
          <g className={shouldScroll ? 'ticker-scroll' : undefined}>
            {/* Render entries twice for seamless loop when scrolling */}
            {(shouldScroll ? [...entries, ...entries] : entries).map((log, i) => {
              const color = agentColor(log.agent_name);
              const xOffset = 58 + i * 185;
              return (
                <g key={`${log.id ?? i}-${i}`} transform={`translate(${xOffset},0)`}>
                  {/* Colored dot */}
                  <circle cx={0} cy={14} r={3} fill={color} opacity={0.85} />
                  {/* Agent name */}
                  <text
                    x={6} y={18}
                    fill={color}
                    fontSize={6.5}
                    fontFamily="monospace"
                    fontWeight="bold"
                    opacity={0.9}
                  >
                    {log.agent_name}
                  </text>
                  {/* Content snippet */}
                  <text
                    x={6} y={10}
                    fill="#94a3b8"
                    fontSize={6}
                    fontFamily="monospace"
                    opacity={0.75}
                  >
                    {truncate(log.message || log.content || log.action || '...', 26)}
                  </text>
                  {/* Time ago */}
                  <text
                    x={140} y={10}
                    fill="#475569"
                    fontSize={5.5}
                    fontFamily="monospace"
                    opacity={0.7}
                    textAnchor="end"
                  >
                    {timeAgo(log.created_at || log.timestamp)}
                  </text>
                  {/* Separator */}
                  <line
                    x1={175} y1={6}
                    x2={175} y2={22}
                    stroke="#1e1e3a"
                    strokeWidth={0.6}
                    opacity={0.5}
                  />
                </g>
              );
            })}
          </g>
        )}
      </g>
    </g>
  );
}

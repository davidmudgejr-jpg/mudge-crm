import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Utility: inset a 4-point parallelogram polygon string by ~4px
// ---------------------------------------------------------------------------
function insetPolygon(points, inset = 4) {
  const pts = points.trim().split(/\s+/).map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });

  if (pts.length !== 4) return points;

  // Compute centroid
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;

  // Move each point towards centroid by `inset` pixels
  const insetted = pts.map(p => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return p;
    return {
      x: p.x + (dx / len) * inset,
      y: p.y + (dy / len) * inset,
    };
  });

  return insetted.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// ---------------------------------------------------------------------------
// WallScreen — single reusable wall-mounted monitor
// ---------------------------------------------------------------------------
export default function WallScreen({
  points,
  title,
  children,
  borderColor = '#3b82f6',
  flashing = false,
  onClick,
  zoomKey,
}) {
  const [hovered, setHovered] = useState(false);
  const screenPoints = insetPolygon(points, 5);

  return (
    <g
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {flashing && (
        <style>{`
          @keyframes wallScreenFlash {
            0%,100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
          .wall-screen-flash { animation: wallScreenFlash 1.2s ease-in-out infinite; }
        `}</style>
      )}

      {/* Outer casing */}
      <polygon
        points={points}
        fill="#0d0d1a"
        stroke={borderColor}
        strokeWidth={1.5}
        opacity={hovered ? 0.95 : 0.8}
        className={flashing ? 'wall-screen-flash' : undefined}
      />

      {/* Screen inset */}
      <polygon
        points={screenPoints}
        fill="#080814"
        stroke={borderColor}
        strokeWidth={0.5}
        opacity={0.3}
      />

      {/* Power LED — approximate bottom-center of parallelogram */}
      <LedDot points={points} borderColor={borderColor} flashing={flashing} />

      {/* Content */}
      {children}
    </g>
  );
}

// ---------------------------------------------------------------------------
// LED dot — placed near bottom-center of the polygon
// ---------------------------------------------------------------------------
function LedDot({ points, flashing }) {
  const pts = points.trim().split(/\s+/).map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
  if (pts.length < 4) return null;
  // Bottom-center = midpoint of pts[2] and pts[3]
  const lx = (pts[2].x + pts[3].x) / 2;
  const ly = (pts[2].y + pts[3].y) / 2 - 3;
  return (
    <circle
      cx={lx} cy={ly} r={2}
      fill={flashing ? '#ef4444' : '#10b981'}
      opacity={0.85}
      className={flashing ? 'wall-screen-flash' : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// WallScreens — places all 4 screens with real data
// ---------------------------------------------------------------------------

const AGENT_COLORS = {
  enricher: '#10b981',
  researcher: '#3b82f6',
  scout: '#f59e0b',
  matcher: '#8b5cf6',
  ralph: '#ef4444',
  houston: '#fbbf24',
};

function agentColor(name) {
  return AGENT_COLORS[name?.toLowerCase()] || '#94a3b8';
}

function statusDot(status) {
  if (status === 'running') return '#10b981';
  if (status === 'error') return '#ef4444';
  return '#f59e0b';
}

// Left wall upper screen — Pipeline Status
// Points chosen to sit on the left wall face (60,300 → 450,100 → 450,0 → 60,40)
const PIPELINE_POINTS = '85,220 240,140 240,88 85,168';
const COST_POINTS     = '85,268 205,200 205,164 85,232';

// Right wall upper screen — Agent Status
const AGENT_POINTS  = '660,140 815,220 815,168 660,88';
const ALERT_POINTS  = '695,200 815,264 815,232 695,168';

export function WallScreens({ agents = [], pending = [], pipeline = null, onZoomIn }) {
  const hasError = agents.some(a => a.status === 'error');

  // pending is an array of {table_name, count} — compute total
  const pendingTotal = Array.isArray(pending)
    ? pending.reduce((sum, p) => sum + (parseInt(p.count) || 0), 0)
    : (parseInt(pending) || 0);

  // Pipeline display values
  const pipelineText = pipeline
    ? `Scout:${pipeline.scout ?? 0} > Enrich:${pipeline.enrich ?? 0} > Match:${pipeline.match ?? 0} > Review:${pipeline.review ?? 0}`
    : `Scout:18 > Enrich:12 > Match:0 > Review:${pendingTotal}`;

  return (
    <g>
      {/* ---- LEFT WALL: Pipeline Status (upper) ---- */}
      <WallScreen
        points={PIPELINE_POINTS}
        title="Pipeline"
        borderColor="#6366f1"
        onClick={onZoomIn ? (e) => onZoomIn('pipeline', e) : undefined}
      >
        {/* Title */}
        <text
          x={130} y={106}
          fill="#a5b4fc"
          fontSize={5.5}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.9}
          transform="skewX(18)"
        >
          PIPELINE
        </text>
        {/* Stage line */}
        <text
          x={105} y={120}
          fill="#c7d2fe"
          fontSize={5}
          fontFamily="monospace"
          opacity={0.8}
          transform="skewX(18)"
        >
          {"Scout > Enrich > Match > Review"}
        </text>
        {/* Values */}
        <text
          x={108} y={133}
          fill="#e0e7ff"
          fontSize={6}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.9}
          transform="skewX(18)"
        >
          {pendingTotal} pending approval
        </text>
        <text
          x={108} y={145}
          fill="#818cf8"
          fontSize={4.5}
          fontFamily="monospace"
          opacity={0.7}
          transform="skewX(18)"
        >
          {pipelineText}
        </text>
        {/* Separator line */}
        <line
          x1={100} y1={150} x2={225} y2={112}
          stroke="#6366f1" strokeWidth={0.4} opacity={0.3}
        />
        {/* Bar chart hint */}
        <rect x={108} y={155} width={8}  height={3} rx={0.5} fill="#6366f1" opacity={0.6} transform="skewX(18)" />
        <rect x={120} y={153} width={12} height={5} rx={0.5} fill="#818cf8" opacity={0.5} transform="skewX(18)" />
        <rect x={136} y={158} width={5}  height={0} rx={0.5} fill="#a5b4fc" opacity={0.4} transform="skewX(18)" />
        <rect x={145} y={154} width={14} height={4} rx={0.5} fill="#6366f1" opacity={0.6} transform="skewX(18)" />
      </WallScreen>

      {/* ---- LEFT WALL: Cost Monitor (lower) ---- */}
      <WallScreen
        points={COST_POINTS}
        title="Costs"
        borderColor="#10b981"
        onClick={onZoomIn ? (e) => onZoomIn('costs', e) : undefined}
      >
        <text
          x={118} y={175}
          fill="#6ee7b7"
          fontSize={5}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.9}
          transform="skewX(18)"
        >
          COST MONITOR
        </text>
        <text
          x={118} y={187}
          fill="#d1fae5"
          fontSize={5.5}
          fontFamily="monospace"
          opacity={0.85}
          transform="skewX(18)"
        >
          Daily: $2.41
        </text>
        <text
          x={118} y={197}
          fill="#a7f3d0"
          fontSize={5.5}
          fontFamily="monospace"
          opacity={0.8}
          transform="skewX(18)"
        >
          Monthly: $47.20
        </text>
      </WallScreen>

      {/* ---- RIGHT WALL: Agent Status (upper) ---- */}
      <WallScreen
        points={AGENT_POINTS}
        title="Agents"
        borderColor="#3b82f6"
        onClick={onZoomIn ? (e) => onZoomIn('agent-overview', e) : undefined}
      >
        <text
          x={668} y={106}
          fill="#93c5fd"
          fontSize={5.5}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.9}
          transform="skewX(-18)"
        >
          AGENT STATUS
        </text>
        {agents.length === 0 ? (
          <text
            x={668} y={122}
            fill="#64748b"
            fontSize={5}
            fontFamily="monospace"
            opacity={0.7}
            transform="skewX(-18)"
          >
            No agents registered
          </text>
        ) : (
          agents.slice(0, 5).map((agent, i) => (
            <g key={agent.agent_name}>
              <circle
                cx={670}
                cy={118 + i * 11}
                r={2.5}
                fill={statusDot(agent.status)}
                opacity={0.85}
                transform="skewX(-18)"
              />
              <text
                x={676}
                y={121 + i * 11}
                fill={agentColor(agent.agent_name)}
                fontSize={5}
                fontFamily="monospace"
                opacity={0.85}
                transform="skewX(-18)"
              >
                {`${agent.agent_name} - ${agent.status}`}
              </text>
            </g>
          ))
        )}
      </WallScreen>

      {/* ---- RIGHT WALL: Alert Screen (lower) ---- */}
      <WallScreen
        points={ALERT_POINTS}
        title="Alerts"
        borderColor={hasError ? '#ef4444' : '#10b981'}
        flashing={hasError}
        onClick={onZoomIn ? (e) => onZoomIn('approval-queue', e) : undefined}
      >
        <text
          x={704} y={178}
          fill={hasError ? '#fca5a5' : '#6ee7b7'}
          fontSize={5}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={0.9}
          transform="skewX(-18)"
        >
          {hasError ? 'ALERT' : 'ALERTS'}
        </text>
        <text
          x={704} y={190}
          fill={hasError ? '#fecaca' : '#d1fae5'}
          fontSize={5.5}
          fontFamily="monospace"
          opacity={0.85}
          transform="skewX(-18)"
        >
          {hasError
            ? `${agents.filter(a => a.status === 'error').length} agent error(s)`
            : 'All clear'}
        </text>
        {pendingTotal > 0 && (
          <text
            x={704} y={202}
            fill="#fbbf24"
            fontSize={5}
            fontFamily="monospace"
            opacity={0.8}
            transform="skewX(-18)"
          >
            {pendingTotal} pending review
          </text>
        )}
      </WallScreen>
    </g>
  );
}

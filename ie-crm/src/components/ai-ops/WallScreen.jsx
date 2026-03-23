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

// Left wall: (60,300) bottom → (450,100) top — slope ≈ -27°
// Two screens per wall, vertically separated with ~15px gap
// Polygon order: bottom-left, bottom-right, top-right, top-left
const PIPELINE_POINTS = '140,215 320,123 320,55 140,147';
const COST_POINTS     = '80,290 220,218 220,162 80,234';

// Right wall: (840,300) bottom → (450,100) top — slope ≈ +27°
const AGENT_POINTS  = '580,123 760,215 760,147 580,55';
const ALERT_POINTS  = '680,218 820,290 820,234 680,162';

// Left wall text: skewY(-27) pivoted at mid-x of screens
const L_WALL_SKEW = 'translate(200, 0) skewY(-27) translate(-200, 0)';
// Right wall text: skewY(27) pivoted at mid-x of screens
const R_WALL_SKEW = 'translate(700, 0) skewY(27) translate(-700, 0)';

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
        <g transform={L_WALL_SKEW}>
          <text x={190} y={100} fill="#a5b4fc" fontSize={8} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
            PIPELINE
          </text>
          <text x={183} y={115} fill="#c7d2fe" fontSize={6} fontFamily="monospace" opacity={0.8}>
            {"Scout > Enrich > Match > Review"}
          </text>
          <text x={176} y={132} fill="#e0e7ff" fontSize={8} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
            {pendingTotal} pending
          </text>
          {/* Bar chart hint */}
          <rect x={170} y={140} width={12} height={5} rx={0.5} fill="#6366f1" opacity={0.6} />
          <rect x={186} y={138} width={16} height={7} rx={0.5} fill="#818cf8" opacity={0.5} />
          <rect x={206} y={140} width={8}  height={5} rx={0.5} fill="#a5b4fc" opacity={0.4} />
          <rect x={218} y={138} width={18} height={7} rx={0.5} fill="#6366f1" opacity={0.6} />
        </g>
      </WallScreen>

      {/* ---- LEFT WALL: Cost Monitor (lower) ---- */}
      <WallScreen
        points={COST_POINTS}
        title="Costs"
        borderColor="#10b981"
        onClick={onZoomIn ? (e) => onZoomIn('costs', e) : undefined}
      >
        <g transform={L_WALL_SKEW}>
          <text x={118} y={195} fill="#6ee7b7" fontSize={7} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
            COST MONITOR
          </text>
          <text x={113} y={208} fill="#d1fae5" fontSize={6.5} fontFamily="monospace" opacity={0.85}>
            Daily: $2.41
          </text>
          <text x={108} y={220} fill="#a7f3d0" fontSize={6.5} fontFamily="monospace" opacity={0.8}>
            Monthly: $47.20
          </text>
        </g>
      </WallScreen>

      {/* ---- RIGHT WALL: Agent Status (upper) ---- */}
      <WallScreen
        points={AGENT_POINTS}
        title="Agents"
        borderColor="#3b82f6"
        onClick={onZoomIn ? (e) => onZoomIn('agent-overview', e) : undefined}
      >
        <g transform={R_WALL_SKEW}>
          <text x={670} y={100} fill="#93c5fd" fontSize={8} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
            AGENT STATUS
          </text>
          {agents.length === 0 ? (
            <text x={675} y={116} fill="#64748b" fontSize={6} fontFamily="monospace" opacity={0.7}>
              No agents registered
            </text>
          ) : (
            agents.slice(0, 4).map((agent, i) => (
              <g key={agent.agent_name}>
                <circle
                  cx={673 + i * 1.5}
                  cy={112 + i * 12}
                  r={2.5}
                  fill={statusDot(agent.status)}
                  opacity={0.85}
                />
                <text
                  x={679 + i * 1.5}
                  y={116 + i * 12}
                  fill={agentColor(agent.agent_name)}
                  fontSize={6}
                  fontFamily="monospace"
                  opacity={0.85}
                >
                  {`${agent.agent_name} - ${agent.status}`}
                </text>
              </g>
            ))
          )}
        </g>
      </WallScreen>

      {/* ---- RIGHT WALL: Alert Screen (lower) ---- */}
      <WallScreen
        points={ALERT_POINTS}
        title="Alerts"
        borderColor={hasError ? '#ef4444' : '#10b981'}
        flashing={hasError}
        onClick={onZoomIn ? (e) => onZoomIn('approval-queue', e) : undefined}
      >
        <g transform={R_WALL_SKEW}>
          <text x={720} y={195} fill={hasError ? '#fca5a5' : '#6ee7b7'} fontSize={7} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
            {hasError ? 'ALERT' : 'ALERTS'}
          </text>
          <text x={725} y={208} fill={hasError ? '#fecaca' : '#d1fae5'} fontSize={6.5} fontFamily="monospace" opacity={0.85}>
            {hasError
              ? `${agents.filter(a => a.status === 'error').length} agent error(s)`
              : 'All systems clear'}
          </text>
          {pendingTotal > 0 && (
            <text x={728} y={220} fill="#fbbf24" fontSize={6} fontFamily="monospace" opacity={0.8}>
              {pendingTotal} pending review
            </text>
          )}
        </g>
      </WallScreen>
    </g>
  );
}

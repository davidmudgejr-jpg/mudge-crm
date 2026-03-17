import React from 'react';

export default function WorkstationDesk({ x, y, monitorColor = '#3b82f6', label }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* === CHAIR (behind desk) === */}
      {/* Seat */}
      <polygon points="0,-30 14,-24 0,-18 -14,-24" fill="#1a1a2e" />
      <polygon points="-14,-24 -14,-20 0,-14 0,-18" fill="#141428" />
      <polygon points="14,-24 14,-20 0,-14 0,-18" fill="#101024" />
      {/* Back rest */}
      <polygon points="0,-48 12,-42 12,-30 0,-36" fill="#141428" />
      <polygon points="0,-48 -12,-42 -12,-30 0,-36" fill="#1a1a2e" />
      {/* Seat pedestal */}
      <line x1={0} y1={-14} x2={0} y2={-6} stroke="#0e0e20" strokeWidth={2} />
      {/* Chair wheels (small dots) */}
      <circle cx={-4} cy={-5} r={1.5} fill="#0e0e20" />
      <circle cx={4} cy={-5} r={1.5} fill="#0e0e20" />
      <circle cx={0} cy={-3} r={1.5} fill="#0e0e20" />

      {/* === DESK SURFACE === */}
      {/* Top face */}
      <polygon points="0,10 30,24 0,38 -30,24" fill="#1a1a2e" />
      {/* Left face */}
      <polygon points="-30,24 -30,30 0,44 0,38" fill="#141428" />
      {/* Right face */}
      <polygon points="30,24 30,30 0,44 0,38" fill="#101024" />

      {/* Desk legs */}
      <line x1={-30} y1={24} x2={-30} y2={38} stroke="#0e0e20" strokeWidth={1.5} />
      <line x1={30} y1={24} x2={30} y2={38} stroke="#0e0e20" strokeWidth={1.5} />
      <line x1={0} y1={10} x2={0} y2={24} stroke="#0e0e20" strokeWidth={1.5} />
      <line x1={0} y1={38} x2={0} y2={52} stroke="#0e0e20" strokeWidth={1.5} />

      {/* === MONITOR === */}
      {/* Stand base */}
      <polygon points="0,8 8,12 0,16 -8,12" fill="#16162e" />
      {/* Neck */}
      <rect x={-1.5} y={-8} width={3} height={16} fill="#12122a" />
      {/* Screen — isometric box */}
      {/* Front face (screen) */}
      <polygon points="-18,-8 18,-8 18,-32 -18,-32" fill="#0a0a1a" />
      {/* Screen bezel top */}
      <polygon points="-20,-34 20,-34 22,-32 -18,-32" fill="#1c1c38" />
      {/* Screen inset with glow */}
      <rect x={-15} y={-30} width={30} height={20} rx={1} fill="#06061a" />
      <rect
        x={-15} y={-30} width={30} height={20} rx={1}
        fill={monitorColor} opacity={0.12}
      />
      {/* Screen glow edge */}
      <rect
        x={-15} y={-30} width={30} height={20} rx={1}
        fill="none" stroke={monitorColor} strokeWidth={0.5} opacity={0.3}
      />
      {/* Label text */}
      {label && (
        <text
          x={0} y={-18}
          textAnchor="middle"
          fill={monitorColor}
          fontSize={5}
          fontFamily="monospace"
          opacity={0.7}
        >
          {label}
        </text>
      )}

      {/* === KEYBOARD === */}
      <polygon points="0,18 10,22 0,26 -10,22" fill="#16162e" />
      <polygon points="0,18 10,22 0,24 -10,20" fill="#1a1a34" />
      {/* Key row lines */}
      <line x1={-6} y1={20.5} x2={6} y2={23} stroke="#20203e" strokeWidth={0.4} />
      <line x1={-7} y1={21.5} x2={5} y2={24} stroke="#20203e" strokeWidth={0.4} />

      {/* === MOUSE === */}
      <ellipse cx={16} cy={22} rx={3} ry={2} fill="#1a1a34" />
      <ellipse cx={16} cy={21.5} rx={2} ry={1} fill="#20203e" />
    </g>
  );
}

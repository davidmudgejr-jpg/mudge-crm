import React from 'react';

export default function ControlConsole({ onClick }) {
  return (
    <g
      transform="translate(370,310)"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <style>{`
        .console-btn-0 { animation: cBlink0 2.2s ease-in-out infinite; }
        .console-btn-1 { animation: cBlink1 3.0s ease-in-out infinite; }
        .console-btn-2 { animation: cBlink2 1.6s ease-in-out infinite; }
        .console-btn-3 { animation: cBlink3 2.8s ease-in-out infinite; }

        @keyframes cBlink0 { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes cBlink1 { 0%,100%{opacity:0.9} 45%{opacity:0.2} }
        @keyframes cBlink2 { 0%,100%{opacity:0.85} 55%{opacity:0.15} }
        @keyframes cBlink3 { 0%,100%{opacity:0.95} 40%{opacity:0.3} }
      `}</style>

      {/* === CONSOLE — hexagonal-ish isometric desk === */}
      {/* Top surface (wide isometric diamond) */}
      <polygon
        points="80,0 160,40 80,80 0,40"
        fill="#1a1a2e"
      />
      {/* Front face */}
      <polygon
        points="0,40 0,58 80,98 80,80"
        fill="#141428"
      />
      {/* Right face */}
      <polygon
        points="160,40 160,58 80,98 80,80"
        fill="#101024"
      />

      {/* Console surface detail — embedded screens */}
      <rect x={30} y={28} width={28} height={16} rx={1} fill="#0a0a1a" transform="skewY(-26.5)" />
      <rect x={30} y={28} width={28} height={16} rx={1} fill="#3b82f6" opacity={0.08} transform="skewY(-26.5)" />
      <rect x={72} y={28} width={28} height={16} rx={1} fill="#0a0a1a" transform="skewY(26.5)" />
      <rect x={72} y={28} width={28} height={16} rx={1} fill="#6366f1" opacity={0.08} transform="skewY(26.5)" />

      {/* Front face — control panel inset */}
      <rect x={20} y={52} width={40} height={14} rx={1} fill="#0c0c1e" />
      {/* Front panel buttons */}
      <circle cx={28} cy={58} r={2} fill="#10b981" className="console-btn-0" />
      <circle cx={36} cy={58} r={2} fill="#3b82f6" className="console-btn-1" />
      <circle cx={44} cy={58} r={2} fill="#f59e0b" className="console-btn-2" />
      <circle cx={52} cy={58} r={2} fill="#ef4444" className="console-btn-3" />

      {/* Right face — control panel inset */}
      <polygon
        points="100,52 100,66 130,52 130,38"
        fill="#0c0c1e"
      />
      {/* Right panel buttons */}
      <circle cx={108} cy={48} r={1.5} fill="#3b82f6" className="console-btn-1" />
      <circle cx={114} cy={45} r={1.5} fill="#10b981" className="console-btn-3" />
      <circle cx={120} cy={42} r={1.5} fill="#f59e0b" className="console-btn-0" />

      {/* Top surface accent lines */}
      <line x1={40} y1={20} x2={80} y2={40} stroke="#22224a" strokeWidth={0.5} opacity={0.6} />
      <line x1={120} y1={20} x2={80} y2={40} stroke="#22224a" strokeWidth={0.5} opacity={0.6} />

      {/* Edge highlight */}
      <line x1={0} y1={40} x2={80} y2={80} stroke="#2a2a50" strokeWidth={0.5} opacity={0.4} />
      <line x1={160} y1={40} x2={80} y2={80} stroke="#24244a" strokeWidth={0.5} opacity={0.35} />
    </g>
  );
}

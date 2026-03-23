import React from 'react';

export default function ControlConsole({ onClick }) {
  return (
    <g
      transform="translate(370,360)"
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

      {/* Front face — recessed control panel */}
      <rect x={18} y={50} width={44} height={18} rx={2} fill="#08081a" />
      <rect x={19} y={51} width={42} height={16} rx={1.5} fill="#0e0e22" />
      {/* Front panel buttons — with bezels to look inset */}
      {[
        { cx: 28, color: '#10b981', cls: 'console-btn-0' },
        { cx: 36, color: '#3b82f6', cls: 'console-btn-1' },
        { cx: 44, color: '#f59e0b', cls: 'console-btn-2' },
        { cx: 52, color: '#ef4444', cls: 'console-btn-3' },
      ].map(({ cx, color, cls }) => (
        <g key={cls}>
          {/* Button socket (dark ring) */}
          <circle cx={cx} cy={58} r={3} fill="#050510" />
          {/* Button face */}
          <circle cx={cx} cy={58} r={2} fill={color} className={cls} />
          {/* Specular highlight */}
          <circle cx={cx - 0.5} cy={57} r={0.6} fill="#fff" opacity={0.25} />
        </g>
      ))}

      {/* Right face — recessed control panel */}
      <polygon
        points="98,50 98,68 132,53 132,35"
        fill="#08081a"
      />
      <polygon
        points="99,51 99,67 131,52.5 131,36"
        fill="#0c0c20"
      />
      {/* Right panel buttons — with bezels */}
      {[
        { cx: 108, cy: 49, color: '#3b82f6', cls: 'console-btn-1' },
        { cx: 115, cy: 45.5, color: '#10b981', cls: 'console-btn-3' },
        { cx: 122, cy: 42, color: '#f59e0b', cls: 'console-btn-0' },
      ].map(({ cx, cy, color, cls }) => (
        <g key={`r-${cls}`}>
          <circle cx={cx} cy={cy} r={2.5} fill="#050510" />
          <circle cx={cx} cy={cy} r={1.5} fill={color} className={cls} />
          <circle cx={cx - 0.3} cy={cy - 0.5} r={0.4} fill="#fff" opacity={0.2} />
        </g>
      ))}

      {/* Top surface accent lines */}
      <line x1={40} y1={20} x2={80} y2={40} stroke="#22224a" strokeWidth={0.5} opacity={0.6} />
      <line x1={120} y1={20} x2={80} y2={40} stroke="#22224a" strokeWidth={0.5} opacity={0.6} />

      {/* Edge highlight */}
      <line x1={0} y1={40} x2={80} y2={80} stroke="#2a2a50" strokeWidth={0.5} opacity={0.4} />
      <line x1={160} y1={40} x2={80} y2={80} stroke="#24244a" strokeWidth={0.5} opacity={0.35} />
    </g>
  );
}

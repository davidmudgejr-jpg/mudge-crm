import React from 'react';

export default function HolographicSphere({ onClickSphere }) {
  return (
    <g>
      <defs>
        {/* Sphere radial gradient */}
        <radialGradient id="sphereGrad" cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#60a5fa" stopOpacity="0.7" />
          <stop offset="55%" stopColor="#2563eb" stopOpacity="0.45" />
          <stop offset="80%" stopColor="#1e3a8a" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0c1a3d" stopOpacity="0.15" />
        </radialGradient>

        {/* Sphere rim glow filter */}
        <filter id="sphereRimGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>

        {/* Energy beam glow filter */}
        <filter id="beamGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>

        {/* Signal pulse glow */}
        <filter id="signalGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>

      <style>{`
        .signal-red { animation: sigPulseRed 1.8s ease-in-out infinite; }
        .signal-amber { animation: sigPulseAmber 2.4s ease-in-out infinite; }
        .signal-green { animation: sigPulseGreen 3.0s ease-in-out infinite; }
        .beam-ring { animation: beamPulse 2.5s ease-in-out infinite; }
        .beam-ring-2 { animation: beamPulse 2.5s ease-in-out 0.8s infinite; }
        .beam-ring-3 { animation: beamPulse 2.5s ease-in-out 1.6s infinite; }
        .orbital-ring-1 { animation: orbitalSpin 20s linear infinite; transform-origin: 450px 240px; }
        .orbital-ring-2 { animation: orbitalSpin 28s linear infinite reverse; transform-origin: 450px 240px; }

        @keyframes sigPulseRed {
          0%,100% { opacity: 1; r: 4; }
          50% { opacity: 0.3; r: 3; }
        }
        @keyframes sigPulseAmber {
          0%,100% { opacity: 0.9; r: 3.5; }
          50% { opacity: 0.25; r: 2.5; }
        }
        @keyframes sigPulseGreen {
          0%,100% { opacity: 0.85; r: 3; }
          50% { opacity: 0.3; r: 2; }
        }
        @keyframes beamPulse {
          0%,100% { opacity: 0.5; }
          50% { opacity: 0.15; }
        }
        @keyframes orbitalSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* === ENERGY BEAM (console to sphere) === */}
      <g>
        {/* Main beam line */}
        <rect x={448} y={298} width={4} height={50} fill="#3b82f6" opacity={0.15} />
        <rect x={448} y={298} width={4} height={50} fill="#60a5fa" opacity={0.08} filter="url(#beamGlow)" />
        {/* Center bright line */}
        <rect x={449.5} y={298} width={1} height={50} fill="#93c5fd" opacity={0.4} />

        {/* Beam rings */}
        <ellipse cx={450} cy={320} rx={14} ry={5} fill="none"
          stroke="#3b82f6" strokeWidth={1} className="beam-ring" />
        <ellipse cx={450} cy={308} rx={10} ry={3.5} fill="none"
          stroke="#60a5fa" strokeWidth={0.8} className="beam-ring-2" />
        <ellipse cx={450} cy={334} rx={18} ry={6} fill="none"
          stroke="#2563eb" strokeWidth={0.7} className="beam-ring-3" />
      </g>

      {/* === FLOOR LIGHT POOL === */}
      <ellipse
        cx={450} cy={400}
        rx={130} ry={55}
        fill="#3b82f6" opacity={0.06}
      />
      <ellipse
        cx={450} cy={400}
        rx={80} ry={35}
        fill="#60a5fa" opacity={0.04}
      />

      {/* === SPHERE RIM GLOW === */}
      <circle
        cx={450} cy={240} r={66}
        fill="#3b82f6" opacity={0.12}
        filter="url(#sphereRimGlow)"
      />

      {/* === MAIN SPHERE === */}
      <circle
        cx={450} cy={240} r={58}
        fill="url(#sphereGrad)"
        style={{ cursor: onClickSphere ? 'pointer' : 'default' }}
        onClick={onClickSphere}
      />

      {/* === GRID LINES (latitude) === */}
      {[
        { cy: 220, rx: 52, ry: 12 },
        { cy: 232, rx: 56, ry: 16 },
        { cy: 244, rx: 58, ry: 18 },
        { cy: 256, rx: 54, ry: 14 },
        { cy: 264, rx: 46, ry: 10 },
      ].map(({ cy, rx, ry }, i) => (
        <ellipse
          key={`lat${i}`}
          cx={450} cy={cy}
          rx={rx} ry={ry}
          fill="none"
          stroke="#93c5fd"
          strokeWidth={0.5}
          opacity={0.25}
        />
      ))}

      {/* Grid lines (longitude — rotated) */}
      <ellipse cx={450} cy={240} rx={20} ry={58}
        fill="none" stroke="#93c5fd" strokeWidth={0.5} opacity={0.2} />
      <ellipse cx={450} cy={240} rx={20} ry={58}
        fill="none" stroke="#93c5fd" strokeWidth={0.5} opacity={0.18}
        transform="rotate(60,450,240)" />
      <ellipse cx={450} cy={240} rx={20} ry={58}
        fill="none" stroke="#93c5fd" strokeWidth={0.5} opacity={0.18}
        transform="rotate(-60,450,240)" />

      {/* === RADAR SWEEP === */}
      <line x1={450} y1={240} x2={450} y2={182} stroke="#60a5fa" strokeWidth={1.2} opacity={0.6}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 450 240"
          to="360 450 240"
          dur="10s"
          repeatCount="indefinite"
        />
      </line>
      {/* Radar sweep trail */}
      <path d="M450,240 L450,182 A58,58 0 0,1 490,196 Z" fill="#3b82f6" opacity={0.08}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 450 240"
          to="360 450 240"
          dur="10s"
          repeatCount="indefinite"
        />
      </path>

      {/* === ORBITAL RINGS === */}
      <ellipse
        cx={450} cy={240} rx={72} ry={22}
        fill="none" stroke="#6366f1" strokeWidth={0.8} opacity={0.2}
        className="orbital-ring-1"
        transform="rotate(-15,450,240)"
      />
      <ellipse
        cx={450} cy={240} rx={80} ry={18}
        fill="none" stroke="#818cf8" strokeWidth={0.6} opacity={0.15}
        className="orbital-ring-2"
        transform="rotate(25,450,240)"
      />

      {/* === SIGNAL DOTS === */}
      {/* Hot leads — red pulsing */}
      <circle cx={430} cy={218} r={4} fill="#ef4444" className="signal-red" filter="url(#signalGlow)" />
      <circle cx={470} cy={256} r={3.5} fill="#ef4444" className="signal-red" filter="url(#signalGlow)" />
      {/* Warm leads — amber */}
      <circle cx={480} cy={228} r={3.5} fill="#f59e0b" className="signal-amber" filter="url(#signalGlow)" />
      <circle cx={425} cy={260} r={3} fill="#f59e0b" className="signal-amber" filter="url(#signalGlow)" />
      {/* Verified — green */}
      <circle cx={458} cy={210} r={3} fill="#10b981" className="signal-green" filter="url(#signalGlow)" />

      {/* === SPECULAR HIGHLIGHT === */}
      <ellipse
        cx={435} cy={215}
        rx={16} ry={10}
        fill="#ffffff"
        opacity={0.1}
        transform="rotate(-20,435,215)"
      />
    </g>
  );
}

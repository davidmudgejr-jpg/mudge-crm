import React from 'react';

export const ROOM = {
  FLOOR_DIAMOND: '450,500 840,300 450,100 60,300',
  CENTER: { x: 450, y: 300 },
  CONSOLE_POS: { x: 370, y: 310 },
  SPHERE_POS: { x: 450, y: 240 },
};

export default function RoomShell({ children }) {
  return (
    <svg
      viewBox="0 0 900 640"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        {/* Ceiling track light glow gradients */}
        <radialGradient id="trackLight1" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#6366f1" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#04040a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="trackLight2" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#c7d2fe" stopOpacity="0.14" />
          <stop offset="60%" stopColor="#6366f1" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#04040a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="trackLight3" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.16" />
          <stop offset="60%" stopColor="#6366f1" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#04040a" stopOpacity="0" />
        </radialGradient>

        {/* Floor glow pool under sphere */}
        <radialGradient id="floorGlowPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
          <stop offset="50%" stopColor="#1e40af" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#0c0c18" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* === CEILING === */}
      <polygon
        points="0,0 900,0 900,100 840,40 450,0 60,40 0,100"
        fill="#04040a"
      />
      <polygon
        points="0,100 60,40 450,0 840,40 900,100 840,100 450,20 60,100"
        fill="#06060e"
      />

      {/* === CEILING TRACK BAR === */}
      <line x1={180} y1={52} x2={720} y2={52} stroke="#18182e" strokeWidth={3} />
      <line x1={180} y1={55} x2={720} y2={55} stroke="#0e0e1c" strokeWidth={1} />

      {/* Track light cans + glow cones */}
      {[
        { cx: 270, label: 'trackLight1' },
        { cx: 450, label: 'trackLight2' },
        { cx: 630, label: 'trackLight3' },
      ].map(({ cx, label }) => (
        <g key={label}>
          {/* Light can housing */}
          <rect x={cx - 8} y={48} width={16} height={10} rx={2} fill="#1e1e36" />
          <rect x={cx - 5} y={56} width={10} height={4} rx={1} fill="#2a2a4a" />
          {/* Light bulb */}
          <ellipse cx={cx} cy={62} rx={4} ry={2} fill="#a5b4fc" opacity={0.6} />
          {/* Glow cone */}
          <polygon
            points={`${cx},62 ${cx - 80},260 ${cx + 80},260`}
            fill={`url(#${label})`}
          />
        </g>
      ))}

      {/* === LEFT WALL === */}
      <polygon
        points="60,300 60,40 450,0 450,100"
        fill="#0a0a16"
      />
      {/* Left wall panel grooves */}
      {[80, 160, 240, 320, 390].map((xOff, i) => {
        const x = 60 + (xOff / 390) * (450 - 60);
        const yTop = 40 + (xOff / 390) * (0 - 40 + (100 - 0));
        const yBot = 300 + (xOff / 390) * (100 - 300);
        return (
          <line
            key={`lpg${i}`}
            x1={x}
            y1={yTop}
            x2={x}
            y2={yBot}
            stroke="#12122a"
            strokeWidth={0.7}
            opacity={0.5}
          />
        );
      })}
      {/* Left wall horizontal panel lines */}
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line
          key={`lph${i}`}
          x1={60}
          y1={40 + t * (300 - 40)}
          x2={450}
          y2={t * 100}
          stroke="#12122a"
          strokeWidth={0.5}
          opacity={0.35}
        />
      ))}

      {/* === RIGHT WALL === */}
      <polygon
        points="840,300 840,40 450,0 450,100"
        fill="#080814"
      />
      {/* Right wall panel grooves */}
      {[80, 160, 240, 320, 390].map((xOff, i) => {
        const x = 840 - (xOff / 390) * (840 - 450);
        const yTop = 40 + (xOff / 390) * (0 - 40 + (100 - 0));
        const yBot = 300 + (xOff / 390) * (100 - 300);
        return (
          <line
            key={`rpg${i}`}
            x1={x}
            y1={yTop}
            x2={x}
            y2={yBot}
            stroke="#0e0e22"
            strokeWidth={0.7}
            opacity={0.4}
          />
        );
      })}
      {/* Right wall horizontal panel lines */}
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line
          key={`rph${i}`}
          x1={840}
          y1={40 + t * (300 - 40)}
          x2={450}
          y2={t * 100}
          stroke="#0e0e22"
          strokeWidth={0.5}
          opacity={0.3}
        />
      ))}

      {/* === WALL BASE MOLDING === */}
      <line
        x1={60} y1={300} x2={450} y2={100}
        stroke="#1e1e3a" strokeWidth={1.5} opacity={0.5}
      />
      <line
        x1={840} y1={300} x2={450} y2={100}
        stroke="#1a1a34" strokeWidth={1.5} opacity={0.45}
      />

      {/* === FLOOR === */}
      <polygon
        points={ROOM.FLOOR_DIAMOND}
        fill="#0c0c18"
      />

      {/* Floor tile grid — lines parallel to left edge (SW-NE) */}
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i + 1) / 13;
        // Interpolate along bottom-left and bottom-right edges
        const x1 = 450 + t * (60 - 450);
        const y1 = 500 + t * (300 - 500);
        const x2 = 840 + t * (450 - 840);
        const y2 = 300 + t * (100 - 300);
        return (
          <line
            key={`fg1-${i}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#14142a" strokeWidth={0.7} opacity={0.45}
          />
        );
      })}
      {/* Floor tile grid — lines parallel to right edge (SE-NW) */}
      {Array.from({ length: 12 }, (_, i) => {
        const t = (i + 1) / 13;
        const x1 = 450 + t * (840 - 450);
        const y1 = 500 + t * (300 - 500);
        const x2 = 60 + t * (450 - 60);
        const y2 = 300 + t * (100 - 300);
        return (
          <line
            key={`fg2-${i}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#14142a" strokeWidth={0.7} opacity={0.45}
          />
        );
      })}

      {/* === FLOOR GLOW POOL (under sphere) === */}
      <ellipse
        cx={450} cy={400}
        rx={120} ry={50}
        fill="url(#floorGlowPool)"
      />

      {/* === CHILDREN (room contents) === */}
      {children}
    </svg>
  );
}

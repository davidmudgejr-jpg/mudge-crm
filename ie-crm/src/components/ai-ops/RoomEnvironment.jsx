import React from 'react';

// LED colors for server rack blinking
const LED_COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#10b981', '#10b981', '#f59e0b', '#3b82f6'];

function ServerRack({ x, y, shade = 0 }) {
  // Isometric box: top, left, right faces
  const w = 36;
  const h = 70;
  const d = 18; // depth (isometric offset)
  const topColor = shade === 0 ? '#1c1c34' : '#1a1a30';
  const leftColor = shade === 0 ? '#141428' : '#121226';
  const rightColor = shade === 0 ? '#0e0e20' : '#0c0c1e';

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Right face */}
      <polygon
        points={`${d},0 ${d},${h} ${d + w / 2},${h + d / 2} ${d + w / 2},${d / 2}`}
        fill={rightColor}
      />
      {/* Left face */}
      <polygon
        points={`${-w / 2 + d},${d / 2} ${-w / 2 + d},${h + d / 2} ${d},${h} ${d},0`}
        fill={leftColor}
      />
      {/* Top face */}
      <polygon
        points={`${d},0 ${d + w / 2},${-d / 2 + d} ${w / 2 + d + w / 2 - w / 2},${d / 2} ${-w / 2 + d},${d / 2}`}
        fill={topColor}
      />
      {/* Front face LEDs */}
      {LED_COLORS.map((color, i) => (
        <rect
          key={i}
          x={-w / 2 + d + 4}
          y={d / 2 + 4 + i * 6}
          width={3}
          height={2}
          rx={0.5}
          fill={color}
          className={`rack-led rack-led-${(i + shade * 3) % 5}`}
        />
      ))}
      {/* Front face panel lines */}
      {[0, 1, 2].map((i) => (
        <line
          key={`pl${i}`}
          x1={-w / 2 + d + 2}
          y1={d / 2 + 2 + i * 22}
          x2={d - 2}
          y2={d / 2 + 2 + i * 22}
          stroke="#1a1a32"
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
    </g>
  );
}

function CableConduit() {
  return (
    <g>
      <path
        d="M 165,230 C 200,260 280,290 370,310"
        fill="none"
        stroke="#1a1a3a"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M 165,230 C 200,260 280,290 370,310"
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.15}
      />
    </g>
  );
}

function PottedPlant({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Pot — isometric box */}
      {/* Right face */}
      <polygon points="8,0 8,18 22,24 22,6" fill="#3d2b1a" />
      {/* Left face */}
      <polygon points="-6,6 -6,24 8,18 8,0" fill="#4a3520" />
      {/* Top face (soil) */}
      <polygon points="8,0 22,6 8,12 -6,6" fill="#2d1f12" />
      {/* Soil */}
      <ellipse cx={8} cy={6} rx={14} ry={6} fill="#3a2a18" opacity={0.5} />

      {/* Leaves */}
      <ellipse cx={2} cy={-12} rx={6} ry={14} fill="#166534" opacity={0.85}
        transform="rotate(-20,2,-12)" />
      <ellipse cx={12} cy={-16} rx={5} ry={12} fill="#15803d" opacity={0.8}
        transform="rotate(15,12,-16)" />
      <ellipse cx={7} cy={-20} rx={5} ry={13} fill="#22c55e" opacity={0.6}
        transform="rotate(5,7,-20)" />
      <ellipse cx={-2} cy={-8} rx={4} ry={10} fill="#16a34a" opacity={0.7}
        transform="rotate(-35,-2,-8)" />
    </g>
  );
}

function WaterCooler({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Base cabinet — isometric box */}
      {/* Right face */}
      <polygon points="10,0 10,30 24,36 24,6" fill="#12122a" />
      {/* Left face */}
      <polygon points="-4,6 -4,36 10,30 10,0" fill="#16162e" />
      {/* Top face */}
      <polygon points="10,0 24,6 10,12 -4,6" fill="#1c1c38" />

      {/* Jug — cylinder on top */}
      <ellipse cx={10} cy={-4} rx={8} ry={4} fill="#1e3a5f" opacity={0.7} />
      <rect x={2} y={-24} width={16} height={20} rx={3} fill="#1e40af" opacity={0.35} />
      <ellipse cx={10} cy={-24} rx={8} ry={4} fill="#2563eb" opacity={0.3} />
      {/* Water highlight */}
      <rect x={5} y={-18} width={4} height={10} rx={2} fill="#60a5fa" opacity={0.2} />

      {/* Tap nozzle */}
      <rect x={18} y={10} width={6} height={3} rx={1} fill="#1e1e36" />
      <circle cx={22} cy={14} r={1.5} fill="#3b82f6" opacity={0.5} />
    </g>
  );
}

export default function RoomEnvironment() {
  return (
    <g>
      <style>{`
        .rack-led-0 { animation: ledBlink0 2.4s ease-in-out infinite; }
        .rack-led-1 { animation: ledBlink1 3.1s ease-in-out infinite; }
        .rack-led-2 { animation: ledBlink2 1.8s ease-in-out infinite; }
        .rack-led-3 { animation: ledBlink3 2.7s ease-in-out infinite; }
        .rack-led-4 { animation: ledBlink4 3.5s ease-in-out infinite; }

        @keyframes ledBlink0 {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes ledBlink1 {
          0%, 100% { opacity: 0.9; }
          40% { opacity: 0.15; }
        }
        @keyframes ledBlink2 {
          0%, 100% { opacity: 1; }
          60% { opacity: 0.1; }
        }
        @keyframes ledBlink3 {
          0%, 100% { opacity: 0.85; }
          55% { opacity: 0.2; }
        }
        @keyframes ledBlink4 {
          0%, 100% { opacity: 0.7; }
          45% { opacity: 0.3; }
        }
      `}</style>

      {/* Server racks — back-left area */}
      <ServerRack x={130} y={165} shade={0} />
      <ServerRack x={175} y={148} shade={1} />

      {/* Cable conduit from racks to console */}
      <CableConduit />

      {/* Potted plant — back-right area */}
      <PottedPlant x={720} y={170} />

      {/* Water cooler — right side */}
      <WaterCooler x={700} y={310} />
    </g>
  );
}

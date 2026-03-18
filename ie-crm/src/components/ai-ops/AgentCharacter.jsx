import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// AgentCharacter
// Renders a single Sims-style isometric human character in SVG.
// ---------------------------------------------------------------------------

const STATUS_CLASSES = {
  running: 'agent--typing',
  idle: 'agent--idle',
  error: 'agent--idle',
  offline: '',
};

export default function AgentCharacter({
  agentName = '',
  color = '#3b82f6',
  status = 'idle',
  position = { x: 0, y: 0 },
  facing = 'front-left',
  isWalking = false,
  isSeated = false,
  accessories = [],
  isHouston = false,
  onClick,
}) {
  const [hovered, setHovered] = useState(false);

  const isSide = facing.startsWith('side');
  const isFront = !isSide && facing.startsWith('front');
  const isBack = !isSide && facing.startsWith('back');
  const isLeft = facing.endsWith('left');
  const flipX = isLeft ? 1 : -1;
  const scale = isHouston ? 1.15 : 1;
  const animClass = isWalking ? 'agent--walking' : (STATUS_CLASSES[status] || '');

  // Darken a hex color
  const darken = (hex, amt = 40) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  };

  const skinColor = '#d4a574';
  const skinShadow = '#b8885a';
  const hairColor = '#2a1a0e';
  const shoeColor = '#1a1a2e';
  const pantColor = '#1e293b';

  // Arm and leg offsets based on state
  const walkPhaseClass = isWalking ? 'agent-walk-phase' : '';

  return (
    <g
      transform={`translate(${position.x},${position.y})`}
      className={`agent-character ${animClass}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Scale wrapper */}
      <g transform={`scale(${scale})`}>
        {/* Hover glow ring */}
        {hovered && (
          <ellipse
            cx={0} cy={2}
            rx={16} ry={8}
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            opacity={0.5}
            className="agent-glow"
          />
        )}

        {/* Shadow on floor */}
        <ellipse cx={0} cy={2} rx={10} ry={5} fill="#000" opacity={0.2} />

        {/* === LEGS === */}
        <g className={isWalking ? 'agent-legs-walk' : ''}>
          {isSeated ? (
            /* Seated: legs bent forward */
            <>
              <path
                d={`M-4,0 L-6,8 L-4,14`}
                stroke={pantColor} strokeWidth={3} fill="none" strokeLinecap="round"
              />
              <path
                d={`M4,0 L6,8 L4,14`}
                stroke={pantColor} strokeWidth={3} fill="none" strokeLinecap="round"
              />
              {/* Shoes */}
              <ellipse cx={-4} cy={14} rx={3} ry={1.5} fill={shoeColor} />
              <ellipse cx={4} cy={14} rx={3} ry={1.5} fill={shoeColor} />
            </>
          ) : (
            /* Standing or walking */
            <>
              <g className={isWalking ? 'agent-leg-left' : ''}>
                <path
                  d={isWalking ? `M-3,0 L-5,6 L-4,12` : `M-3,0 L-4,12`}
                  stroke={pantColor} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <ellipse cx={-4} cy={12} rx={3.5} ry={1.8} fill={shoeColor} />
              </g>
              <g className={isWalking ? 'agent-leg-right' : ''}>
                <path
                  d={isWalking ? `M3,0 L5,6 L4,12` : `M3,0 L4,12`}
                  stroke={pantColor} strokeWidth={3} fill="none" strokeLinecap="round"
                />
                <ellipse cx={4} cy={12} rx={3.5} ry={1.8} fill={shoeColor} />
              </g>
            </>
          )}
        </g>

        {/* === TORSO === */}
        <g className={!isWalking && status !== 'offline' ? 'agent-torso-breathe' : ''}>
          {isHouston ? (
            /* Houston: suit jacket */
            <>
              <ellipse cx={0} cy={-8} rx={9} ry={10} fill={darken('#fbbf24', 60)} />
              {/* Suit lapels */}
              <path d="M-3,-15 L0,-10 L3,-15" stroke="#1a1a2e" strokeWidth={1} fill="none" />
              {/* Tie */}
              <polygon points="0,-15 -2,-10 0,-3 2,-10" fill="#dc2626" />
              {/* Shirt collar visible */}
              <path d="M-4,-15 L0,-13 L4,-15" stroke="#e2e8f0" strokeWidth={0.8} fill="none" />
            </>
          ) : (
            /* Normal agent torso */
            <ellipse cx={0} cy={-8} rx={8} ry={10} fill={color} />
          )}

          {/* Labcoat accessory */}
          {accessories.includes('labcoat') && (
            <>
              <ellipse cx={0} cy={-8} rx={9} ry={11} fill="none" stroke="#e2e8f0" strokeWidth={1.2} opacity={0.7} />
              {/* White collar */}
              <path d="M-5,-16 L0,-14 L5,-16" stroke="#f1f5f9" strokeWidth={1.5} fill="none" />
            </>
          )}
        </g>

        {/* === ARMS === */}
        <g className={isWalking ? 'agent-arms-walk' : (status === 'running' && isSeated ? 'agent-hands-type' : '')}>
          {isSeated && status === 'running' ? (
            /* Typing at desk — hands forward */
            <>
              <g className="agent-hand-left">
                <path
                  d={`M-8,-6 Q-10,2 -6,8`}
                  stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
                />
                <circle cx={-6} cy={8} r={2} fill={skinColor} />
              </g>
              <g className="agent-hand-right">
                <path
                  d={`M8,-6 Q10,2 6,8`}
                  stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
                />
                <circle cx={6} cy={8} r={2} fill={skinColor} />
              </g>
            </>
          ) : isWalking ? (
            /* Walking — arms swing */
            <>
              <g className="agent-arm-left-swing">
                <path
                  d={`M-8,-6 L-9,4`}
                  stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
                />
                <circle cx={-9} cy={4} r={2} fill={skinColor} />
              </g>
              <g className="agent-arm-right-swing">
                <path
                  d={`M8,-6 L9,4`}
                  stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
                />
                <circle cx={9} cy={4} r={2} fill={skinColor} />
              </g>
            </>
          ) : (
            /* Idle standing/seated — arms at sides */
            <>
              <path
                d={`M-8,-6 L-8,3`}
                stroke={isHouston ? darken('#fbbf24', 60) : color}
                strokeWidth={2.5} fill="none" strokeLinecap="round"
              />
              <circle cx={-8} cy={3} r={2} fill={skinColor} />
              <path
                d={`M8,-6 L8,3`}
                stroke={isHouston ? darken('#fbbf24', 60) : color}
                strokeWidth={2.5} fill="none" strokeLinecap="round"
              />
              <circle cx={8} cy={3} r={2} fill={skinColor} />
            </>
          )}

          {/* Clipboard accessory — held in left hand when not typing */}
          {accessories.includes('clipboard') && !(isSeated && status === 'running') && (
            <g transform="translate(-10,0)">
              <rect x={-3} y={-2} width={6} height={8} rx={0.5} fill="#c4b5a0" />
              <rect x={-2} y={-0.5} width={4} height={5} rx={0.3} fill="#f5f0e8" />
              <line x1={-1} y1={1} x2={1} y2={1} stroke="#999" strokeWidth={0.3} />
              <line x1={-1} y1={2.5} x2={1} y2={2.5} stroke="#999" strokeWidth={0.3} />
            </g>
          )}

          {/* Tablet accessory — held in right hand */}
          {accessories.includes('tablet') && !(isSeated && status === 'running') && (
            <g transform="translate(10,0) rotate(-10)">
              <rect x={-3} y={-2} width={6} height={9} rx={1} fill="#1e293b" />
              <rect x={-2} y={-1} width={4} height={6} rx={0.5} fill="#0f172a" />
              <rect x={-2} y={-1} width={4} height={6} rx={0.5} fill={color} opacity={0.15} />
            </g>
          )}
        </g>

        {/* === HEAD === */}
        <g transform={`translate(0,-20)`}>
          {/* Hair (back, slightly wider) */}
          <ellipse cx={0} cy={-1} rx={8} ry={7} fill={hairColor} />
          {/* Head/face */}
          <ellipse cx={0} cy={1} rx={7} ry={6} fill={skinColor} />

          {isSide ? (
            /* Side-facing profile */
            <>
              {/* Hair covers back half */}
              <ellipse cx={2 * flipX} cy={0} rx={6} ry={6.5} fill={hairColor} />
              {/* One visible eye */}
              <circle cx={-3 * flipX} cy={0} r={1.1} fill="#1a1a2e" />
              <circle cx={-2.5 * flipX} cy={-0.5} r={0.3} fill="#fff" />
              {/* Nose bump */}
              <ellipse cx={-5.5 * flipX} cy={1.5} rx={1.2} ry={0.8} fill={skinShadow} opacity={0.4} />
              {/* Mouth */}
              <path
                d={`M${-3 * flipX},3 Q${-4.5 * flipX},4 ${-3 * flipX},4.5`}
                stroke={skinShadow} strokeWidth={0.6} fill="none"
              />
              {/* Ear */}
              <ellipse cx={4 * flipX} cy={1} rx={1.5} ry={2.2} fill={skinShadow} opacity={0.5} />
            </>
          ) : isFront ? (
            /* Front-facing details */
            <>
              {/* Eyes */}
              <circle cx={-2.5 * flipX} cy={0} r={1} fill="#1a1a2e" />
              <circle cx={2.5 * flipX} cy={0} r={1} fill="#1a1a2e" />
              {/* Eye highlights */}
              <circle cx={-2 * flipX} cy={-0.5} r={0.3} fill="#fff" />
              <circle cx={3 * flipX} cy={-0.5} r={0.3} fill="#fff" />
              {/* Mouth */}
              <path
                d={status === 'error' ? 'M-1.5,3 Q0,2 1.5,3' : 'M-1.5,3 Q0,4.5 1.5,3'}
                stroke={skinShadow}
                strokeWidth={0.6}
                fill="none"
              />
              {/* Cheek blush when running */}
              {status === 'running' && (
                <>
                  <circle cx={-4} cy={2} r={1.5} fill="#e8a0a0" opacity={0.3} />
                  <circle cx={4} cy={2} r={1.5} fill="#e8a0a0" opacity={0.3} />
                </>
              )}
            </>
          ) : (
            /* Back-facing — just hair, no face */
            <ellipse cx={0} cy={0} rx={7.5} ry={6.5} fill={hairColor} />
          )}

          {/* Headset accessory */}
          {accessories.includes('headset') && (
            <>
              {/* Headband arc */}
              <path
                d="M-7,-2 Q0,-10 7,-2"
                stroke="#555" strokeWidth={1.5} fill="none"
              />
              {/* Ear piece */}
              <circle cx={isFront ? -7 * flipX : 7} cy={0} r={2} fill="#333" />
              <circle cx={isFront ? -7 * flipX : 7} cy={0} r={1.2} fill="#555" />
              {/* Mic boom */}
              {isFront && (
                <path
                  d={`M${-7 * flipX},1 Q${-5 * flipX},5 ${-3 * flipX},4`}
                  stroke="#444" strokeWidth={0.8} fill="none"
                />
              )}
            </>
          )}

          {/* Houston hair — slicked back, slightly thicker on top */}
          {isHouston && (
            <path
              d="M-6,-6 Q0,-10 6,-6"
              stroke="#2a1a0e" strokeWidth={2} fill="none"
            />
          )}
        </g>

        {/* === STATUS INDICATOR (tiny dot above head) === */}
        <circle
          cx={0} cy={-32}
          r={2}
          fill={
            status === 'running' ? '#22c55e' :
            status === 'idle' ? '#facc15' :
            status === 'error' ? '#ef4444' :
            '#6b7280'
          }
        >
          {status === 'running' && (
            <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
          )}
        </circle>

        {/* === NAME LABEL === */}
        <text
          x={0} y={-35}
          textAnchor="middle"
          fill={color}
          fontSize={5}
          fontFamily="monospace"
          fontWeight="bold"
          opacity={hovered ? 0.9 : 0}
          className="agent-name-label"
        >
          {agentName}
        </text>

        {/* Offline overlay */}
        {status === 'offline' && (
          <ellipse
            cx={0} cy={-5}
            rx={12} ry={20}
            fill="#000"
            opacity={0.35}
          />
        )}
      </g>

      {/* CSS animations via <style> in SVG */}
      <style>{`
        .agent-character { transition: opacity 0.3s; }
        .agent-name-label { transition: opacity 0.2s; }

        /* Typing — subtle hand bob */
        .agent--typing .agent-hand-left {
          animation: agentTypeL 0.4s ease-in-out infinite alternate;
        }
        .agent--typing .agent-hand-right {
          animation: agentTypeR 0.4s ease-in-out infinite alternate;
          animation-delay: 0.15s;
        }
        @keyframes agentTypeL {
          0% { transform: translateY(0); }
          100% { transform: translateY(-1.5px); }
        }
        @keyframes agentTypeR {
          0% { transform: translateY(0); }
          100% { transform: translateY(-1.5px); }
        }

        /* Breathing — very subtle torso scale */
        .agent--idle .agent-torso-breathe {
          animation: agentBreathe 4s ease-in-out infinite;
          transform-origin: center -8px;
        }
        @keyframes agentBreathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.02); }
        }

        /* Walking — leg stride (contralateral natural gait)
           Left leg forward = translate up+forward, right leg back
           Uses translate instead of rotate to avoid bug-like lateral motion */
        .agent--walking .agent-leg-left {
          animation: agentLegL 0.9s ease-in-out infinite;
        }
        .agent--walking .agent-leg-right {
          animation: agentLegR 0.9s ease-in-out infinite;
        }
        @keyframes agentLegL {
          0%, 100% { transform: translate(-1.5px, -2px); }
          50%  { transform: translate(1.5px, 0px); }
        }
        @keyframes agentLegR {
          0%, 100% { transform: translate(1.5px, 0px); }
          50%  { transform: translate(-1.5px, -2px); }
        }

        /* Walking — body bob (subtle up-down) */
        .agent--walking .agent-torso-breathe {
          animation: agentWalkBob 0.45s ease-in-out infinite;
        }
        @keyframes agentWalkBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-0.8px); }
        }

        /* Walking — arm swing (contralateral: left arm syncs with right leg)
           Opposite arm+leg move together, like human walking */
        .agent--walking .agent-arm-left-swing {
          animation: agentArmSwingL 0.9s ease-in-out infinite;
        }
        .agent--walking .agent-arm-right-swing {
          animation: agentArmSwingR 0.9s ease-in-out infinite;
        }
        @keyframes agentArmSwingL {
          0%, 100% { transform: translate(1px, 0px); }
          50%  { transform: translate(-1px, -1.5px); }
        }
        @keyframes agentArmSwingR {
          0%, 100% { transform: translate(-1px, -1.5px); }
          50%  { transform: translate(1px, 0px); }
        }

        /* Glow ring pulse */
        .agent-glow {
          animation: agentGlowPulse 1.5s ease-in-out infinite;
        }
        @keyframes agentGlowPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </g>
  );
}

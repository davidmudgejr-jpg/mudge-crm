import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Agent3D — Sims-style mesh composite character
// Body = capsule, head = sphere, limbs = cylinders
// Walks with natural human gait: opposite arm/leg swing
// ---------------------------------------------------------------------------

const SKIN_COLOR = '#d4a574';

// Facing direction → Y rotation (radians)
const FACING_ROTATIONS = {
  'front-left':  Math.PI * 0.75,
  'front-right': Math.PI * 0.25,
  'side-left':   Math.PI,
  'side-right':  0,
  'back-left':   Math.PI * 1.25,
  'back-right':  Math.PI * 1.75,
};

function Limb({ position, color, size = [0.05, 0.35, 0.05], rotationRef, axis = 'x' }) {
  const ref = useRef();

  useFrame(() => {
    if (ref.current && rotationRef?.current !== undefined) {
      if (axis === 'x') ref.current.rotation.x = rotationRef.current;
    }
  });

  return (
    <mesh ref={ref} position={position} castShadow receiveShadow>
      <cylinderGeometry args={[size[0], size[0], size[1], 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.025} roughness={0.8} metalness={0.1} />
    </mesh>
  );
}

export default function Agent3D({
  name,
  color,
  emissiveColor,
  status = 'idle',
  position3D = [0, 0, 0],
  facing = 'front-left',
  isWalking = false,
  isSeated = false,
  isHouston = false,
  onClick,
}) {
  const glow = emissiveColor || color;
  const groupRef = useRef();
  const leftLegRot = useRef(0);
  const rightLegRot = useRef(0);
  const leftArmRot = useRef(0);
  const rightArmRot = useRef(0);
  const [hovered, setHovered] = React.useState(false);

  // When not walking, face toward the orb center (0,0,0)
  // When walking, use the movement engine's facing direction
  const yRotation = isWalking
    ? (FACING_ROTATIONS[facing] ?? 0)
    : Math.atan2(position3D[0], position3D[2]) + Math.PI;
  const agentScale = isHouston ? 1.15 : 1.0;

  // Status dot color
  const statusColor = useMemo(() => {
    switch (status) {
      case 'running': return '#10b981';
      case 'error': return '#ef4444';
      case 'offline': return '#6b7280';
      default: return '#f59e0b';
    }
  }, [status]);

  // Walking animation — human gait: opposite arm/leg
  useFrame((state) => {
    if (isWalking) {
      const t = state.clock.elapsedTime * 4; // walking speed
      const swing = Math.sin(t) * 0.4;
      // Left leg forward = right arm forward (human gait)
      leftLegRot.current = swing;
      rightLegRot.current = -swing;
      leftArmRot.current = -swing * 0.6;  // arms swing less than legs
      rightArmRot.current = swing * 0.6;
    } else {
      // Idle breathing — subtle bob
      leftLegRot.current = 0;
      rightLegRot.current = 0;
      leftArmRot.current = 0;
      rightArmRot.current = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position3D}
      scale={agentScale}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {/* Rotate entire character to face direction */}
      <group rotation={[0, yRotation, 0]}>
        {/* Head */}
        <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial color={SKIN_COLOR} emissive={SKIN_COLOR} emissiveIntensity={0.025} roughness={0.8} metalness={0.1} />
        </mesh>

        {/* Body (torso) */}
        <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.14, 0.45, 4, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.025} roughness={0.8} metalness={0.1} />
        </mesh>

        {/* Left leg */}
        <Limb
          position={[-0.08, 0.35, 0]}
          color="#1e293b"
          size={[0.055, 0.4, 0.055]}
          rotationRef={leftLegRot}
        />
        {/* Right leg */}
        <Limb
          position={[0.08, 0.35, 0]}
          color="#1e293b"
          size={[0.055, 0.4, 0.055]}
          rotationRef={rightLegRot}
        />

        {/* Left arm */}
        <Limb
          position={[-0.22, 0.95, 0]}
          color={color}
          size={[0.04, 0.35, 0.04]}
          rotationRef={leftArmRot}
        />
        {/* Right arm */}
        <Limb
          position={[0.22, 0.95, 0]}
          color={color}
          size={[0.04, 0.35, 0.04]}
          rotationRef={rightArmRot}
        />

        {/* Hands */}
        <mesh position={[-0.22, 0.75, 0]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
        </mesh>
        <mesh position={[0.22, 0.75, 0]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
        </mesh>
      </group>

      {/* Status dot — floating above head */}
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.2} />
      </mesh>

      {/* Name label — HTML overlay */}
      {hovered && (
        <Html position={[0, 1.85, 0]} center distanceFactor={8}>
          <div style={{
            background: 'rgba(4,4,10,0.85)',
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '2px 8px',
            color: '#e2e8f0',
            fontSize: 11,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            textTransform: 'capitalize',
          }}>
            {name}
          </div>
        </Html>
      )}
    </group>
  );
}

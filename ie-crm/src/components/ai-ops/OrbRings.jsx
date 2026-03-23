import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =========================================================================
// OrbRings.jsx — STANDALONE RING FILE
// 3 orbital rings with primary spin + gyroscopic precession
// Each ring spins on one axis while its tilt wobbles on another
// =========================================================================

function Ring({ radius, tubeRadius, tilt, primaryAxis, primarySpeed, precessionAxis, precessionSpeed, precessionAmplitude, precessionOffset, color }) {
  const ref = useRef();

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;

    // Primary spin — continuous rotation on the main axis
    ref.current.rotation[primaryAxis] += primarySpeed;

    // Gyroscopic precession — oscillating tilt on a secondary axis
    const axisIndex = { x: 0, y: 1, z: 2 }[precessionAxis];
    ref.current.rotation[precessionAxis] = tilt[axisIndex] + Math.sin(t * precessionSpeed + precessionOffset) * precessionAmplitude;
  });

  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[radius, tubeRadius, 12, 80]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function OrbRings() {
  return (
    <group>
      {/* Ring 1: spins on Z, precesses on X — fast energetic spin */}
      <Ring
        radius={0.9} tubeRadius={0.015}
        tilt={[Math.PI / 4, 0, 0]}
        primaryAxis="z" primarySpeed={0.012}
        precessionAxis="x" precessionSpeed={0.3} precessionAmplitude={0.8} precessionOffset={0}
        color="#22d3ee"
      />
      {/* Ring 2: spins on X, precesses on Z — counter-rhythm */}
      <Ring
        radius={0.95} tubeRadius={0.012}
        tilt={[Math.PI / 2, 0, Math.PI / 3]}
        primaryAxis="x" primarySpeed={0.018}
        precessionAxis="z" precessionSpeed={0.5} precessionAmplitude={0.6} precessionOffset={1.0}
        color="#60a5fa"
      />
      {/* Ring 3: spins on X reversed, precesses on Y — unique wobble */}
      <Ring
        radius={0.85} tubeRadius={0.01}
        tilt={[Math.PI / 12, Math.PI / 2, Math.PI / 4]}
        primaryAxis="x" primarySpeed={-0.015}
        precessionAxis="y" precessionSpeed={0.4} precessionAmplitude={0.7} precessionOffset={2.0}
        color="#818cf8"
      />
    </group>
  );
}

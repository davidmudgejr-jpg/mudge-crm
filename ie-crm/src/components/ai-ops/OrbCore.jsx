import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import OrbRings from './OrbRings';

// ---------------------------------------------------------------------------
// OrbCore — Central holographic sphere + point lights
// Rings are in OrbRings.jsx (standalone, never edited)
// ---------------------------------------------------------------------------

export default function OrbCore({ onClick }) {
  const sphereRef = useRef();
  const groupRef = useRef();

  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.0, 0]} scale={1.8}>
      {/* Primary orb light — main light source */}
      <pointLight
        color="#4488ff"
        intensity={8.0}
        distance={30}
        decay={2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.001}
      />

      {/* Secondary orb light — slightly different color for depth */}
      <pointLight
        color="#88ccff"
        intensity={2.0}
        distance={15}
        decay={2}
        position={[0, 0.2, 0]}
      />

      {/* Core sphere — contained holographic energy */}
      <mesh
        ref={sphereRef}
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshPhysicalMaterial
          color="#1e4a9a"
          emissive="#4488ff"
          emissiveIntensity={2.0}
          transmission={0.3}
          roughness={0.1}
          metalness={0.0}
          transparent
          opacity={0.7}
          thickness={0.5}
        />
      </mesh>

      {/* Inner bright core */}
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#aaddff" transparent opacity={0.7} />
      </mesh>

      {/* Holographic haze — 1.3x scale outer sphere, no depth write */}
      <mesh>
        <sphereGeometry args={[0.72, 24, 24]} />
        <meshBasicMaterial color="#88aaff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Outer haze — larger, barely visible */}
      <mesh>
        <sphereGeometry args={[1.0, 24, 24]} />
        <meshBasicMaterial color="#4466aa" transparent opacity={0.03} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Orbital rings — imported from standalone OrbRings.jsx */}
      <OrbRings />
    </group>
  );
}

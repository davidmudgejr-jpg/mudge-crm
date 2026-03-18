import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import OrbRings from './OrbRings';

// ---------------------------------------------------------------------------
// OrbCore — Central holographic sphere + point lights
// Rings are in OrbRings.jsx (standalone, never edited)
// ---------------------------------------------------------------------------

export default function OrbCore({ onClick, houstonActive = false }) {
  const sphereRef = useRef();
  const groupRef = useRef();
  const materialRef = useRef();
  const lightRef = useRef();
  const emissiveTarget = useRef(2.0);
  const currentEmissive = useRef(2.0);
  const activationTime = useRef(0);

  useFrame((state, delta) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }

    // Houston activation pulse — smooth emissive intensity transitions
    if (houstonActive) {
      const elapsed = state.clock.elapsedTime - activationTime.current;
      if (elapsed < 1.5) {
        // Phase 1: surge to 5.0 during camera swoop
        emissiveTarget.current = 5.0;
      } else {
        // Phase 2: settle to active glow at 3.0
        emissiveTarget.current = 3.0;
      }
    } else {
      emissiveTarget.current = 2.0;
    }

    // Lerp toward target
    currentEmissive.current += (emissiveTarget.current - currentEmissive.current) * 3.0 * delta;

    if (materialRef.current) {
      materialRef.current.emissiveIntensity = currentEmissive.current;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 6.0 + (currentEmissive.current - 2.0) * 2.0;
    }

    // Subtle scale pulse when active
    if (groupRef.current) {
      const baseScale = 1.8;
      if (houstonActive) {
        const pulse = Math.sin(state.clock.elapsedTime * 2.0) * 0.02;
        groupRef.current.scale.setScalar(baseScale + pulse);
      } else {
        // Lerp scale back to normal
        const s = groupRef.current.scale.x;
        groupRef.current.scale.setScalar(s + (baseScale - s) * 3.0 * delta);
      }
    }
  });

  // Record activation time for surge timing
  const prevActive = useRef(false);
  useFrame((state) => {
    if (houstonActive && !prevActive.current) {
      activationTime.current = state.clock.elapsedTime;
    }
    prevActive.current = houstonActive;
  });

  return (
    <group ref={groupRef} position={[0, 2.0, 0]} scale={1.8}>
      {/* Primary orb light — main light source */}
      <pointLight
        ref={lightRef}
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
          ref={materialRef}
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

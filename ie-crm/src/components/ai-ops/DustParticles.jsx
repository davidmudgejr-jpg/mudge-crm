import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// DustParticles — 200 floating motes in the orb's light cone
// Start at platform level, drift upward and slightly outward
// Only visible within ~3 units of center (the orb light zone)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 200;
const dummy = new THREE.Object3D();

export default function DustParticles() {
  const meshRef = useRef();

  const particles = useMemo(() => {
    const data = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Start within the orb light cone — cylindrical distribution
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 2.5; // within 2.5 units of center
      data.push({
        x: Math.cos(angle) * radius,
        y: 0.5 + Math.random() * 3.5, // platform level to above orb
        z: Math.sin(angle) * radius,
        speed: 0.015 + Math.random() * 0.04,
        wobbleSpeed: 0.3 + Math.random() * 1.0,
        wobbleAmp: 0.05 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        scale: 0.4 + Math.random() * 0.8,
        driftOut: 0.002 + Math.random() * 0.005, // slight outward drift
      });
    }
    return data;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      p.y += p.speed * 0.16;

      // Slight outward drift as particles rise
      const currentRadius = Math.sqrt(p.x * p.x + p.z * p.z);
      if (currentRadius > 0.01) {
        p.x += (p.x / currentRadius) * p.driftOut;
        p.z += (p.z / currentRadius) * p.driftOut;
      }

      // Reset when too high or drifted too far out
      if (p.y > 4.0 || currentRadius > 3.0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 1.5;
        p.y = 0.3 + Math.random() * 0.5;
        p.x = Math.cos(angle) * radius;
        p.z = Math.sin(angle) * radius;
      }

      const wobbleX = Math.sin(t * p.wobbleSpeed + p.phase) * p.wobbleAmp * 0.08;
      const wobbleZ = Math.cos(t * p.wobbleSpeed * 0.7 + p.phase) * p.wobbleAmp * 0.08;

      dummy.position.set(p.x + wobbleX, p.y, p.z + wobbleZ);
      dummy.scale.setScalar(0.008 * p.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#88bbff" transparent opacity={0.3} />
    </instancedMesh>
  );
}

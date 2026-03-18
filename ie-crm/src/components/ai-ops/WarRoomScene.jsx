import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
// No HDRI — all lighting from manual sources only
import * as THREE from 'three';
import useRoomTextures from './useRoomTextures';

// ---------------------------------------------------------------------------
// WarRoomScene — Clone Wars briefing room
// No HDRI — pure black background, manual lights only
// All surfaces dark-tinted, orb is primary light source
// ---------------------------------------------------------------------------

function FloorGrid() {
  const rings = [
    { r: 1.8, op: 0.2 }, { r: 2.5, op: 0.15 }, { r: 3.2, op: 0.10 },
    { r: 4.0, op: 0.07 }, { r: 4.8, op: 0.04 }, { r: 5.6, op: 0.03 }, { r: 6.4, op: 0.02 },
  ];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      {rings.map(({ r, op }) => (
        <mesh key={r}>
          <ringGeometry args={[r - 0.012, r + 0.012, 96]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={op} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function WallTrimLines() {
  const trims = [];
  const heights = [0.5, 1.5, 2.8, 3.3];
  heights.forEach((y, i) => {
    trims.push(
      <mesh key={'bwt' + i} position={[0, y, -5.89]}>
        <planeGeometry args={[11.8, 0.006]} />
        <meshBasicMaterial color="#00cccc" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
    );
    trims.push(
      <mesh key={'lwt' + i} position={[-5.39, y, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10.8, 0.006]} />
        <meshBasicMaterial color="#00cccc" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    );
    trims.push(
      <mesh key={'rwt' + i} position={[5.39, y, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[10.8, 0.006]} />
        <meshBasicMaterial color="#00cccc" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    );
  });
  return <group>{trims}</group>;
}

// War table — exactly 3 stepped stone rings + center glow bowl
function CommandDais({ textures }) {
  const bowlGlowRef = useRef();
  const { platform } = textures;

  useFrame(({ clock }) => {
    if (bowlGlowRef.current) {
      bowlGlowRef.current.material.emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 0.6) * 0.05;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Ring 1 — outer, widest, TALLEST (amphitheater lip) */}
      <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[3.2, 3.3, 0.15, 64]} />
        <meshStandardMaterial
          map={platform.map}
          aoMap={platform.aoMap}
          roughnessMap={platform.armMap}
          color="#b0a898"
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>

      {/* Ring 2 — middle step */}
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.6, 2.7, 0.25, 64]} />
        <meshStandardMaterial
          map={platform.map}
          aoMap={platform.aoMap}
          roughnessMap={platform.armMap}
          color="#b0a898"
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>

      {/* Ring 3 — inner, lowest step (stepping down toward bowl) */}
      <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.0, 2.1, 0.35, 64]} />
        <meshStandardMaterial
          map={platform.map}
          aoMap={platform.aoMap}
          roughnessMap={platform.armMap}
          color="#b0a898"
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>

      {/* Center bowl — recessed to floor level, glow emits upward */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 0.15, 64, 1, true]} />
        <meshStandardMaterial color="#a09888" roughness={0.6} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={bowlGlowRef} position={[0, 0.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 64]} />
        <meshStandardMaterial
          color="#fff8ee"
          emissive="#fff0dd"
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.0}
        />
      </mesh>
      {/* Warm upward light from bowl */}
      <pointLight position={[0, 0.05, 0]} color="#fff0dd" intensity={2.0} distance={5} decay={2} />
    </group>
  );
}

export default function WarRoomScene({ onZoomIn }) {
  const textures = useRoomTextures();

  return (
    <group>
      {/* No HDRI — pure black background, all lighting from manual sources */}

      {/* Fog — deep dark blue */}
      <fogExp2 attach="fog" args={['#000814', 0.04]} />

      {/* === LIGHTING — cinematic war room === */}
      <ambientLight intensity={0.0} />
      <hemisphereLight args={['#000814', '#000000', 0.1]} />

      {/* 4 ceiling corner spots — dim industrial overheads */}
      <spotLight position={[-4, 3.5, -4]} target-position={[-4, 0, -4]} intensity={0.3} angle={0.5} penumbra={0.8} color="#ffffff" />
      <spotLight position={[4, 3.5, -4]} target-position={[4, 0, -4]} intensity={0.3} angle={0.5} penumbra={0.8} color="#ffffff" />
      <spotLight position={[-4, 3.5, 2]} target-position={[-4, 0, 2]} intensity={0.3} angle={0.5} penumbra={0.8} color="#ffffff" />
      <spotLight position={[4, 3.5, 2]} target-position={[4, 0, 2]} intensity={0.3} angle={0.5} penumbra={0.8} color="#ffffff" />

      {/* === FLOOR — painted_concrete_02, dark tint #111111 === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial
          map={textures.floor.map}
          aoMap={textures.floor.aoMap}
          roughnessMap={textures.floor.armMap}
          normalMap={textures.floor.normalMap}
          normalScale={[0.4, 0.4]}
          color="#111111"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
      <FloorGrid />
      <CommandDais textures={textures} />

      {/* === WALLS === */}
      {/* Back wall — painted_plaster_wall */}
      <mesh position={[0, 1.75, -6]} receiveShadow>
        <boxGeometry args={[12, 3.5, 0.2]} />
        <meshStandardMaterial
          map={textures.backWall.map}
          aoMap={textures.backWall.aoMap}
          roughnessMap={textures.backWall.armMap}
          normalMap={textures.backWall.normalMap}
          normalScale={[0.5, 0.5]}
          color="#0a0c10"
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>
      {/* Left wall — plastered_wall_03 */}
      <mesh position={[-5.5, 1.75, -0.5]} receiveShadow>
        <boxGeometry args={[0.2, 3.5, 11]} />
        <meshStandardMaterial
          map={textures.leftWall.map}
          aoMap={textures.leftWall.aoMap}
          roughnessMap={textures.leftWall.armMap}
          normalMap={textures.leftWall.normalMap}
          normalScale={[0.5, 0.5]}
          color="#0a0c10"
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>
      {/* Right wall — plastered_wall_04 */}
      <mesh position={[5.5, 1.75, -0.5]} receiveShadow>
        <boxGeometry args={[0.2, 3.5, 11]} />
        <meshStandardMaterial
          map={textures.rightWall.map}
          aoMap={textures.rightWall.aoMap}
          roughnessMap={textures.rightWall.armMap}
          normalMap={textures.rightWall.normalMap}
          normalScale={[0.5, 0.5]}
          color="#0a0c10"
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>

      {/* Side wall accent panels — corrugated_iron_03 */}
      <mesh position={[-5.44, 0.6, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[8, 0.8]} />
        <meshStandardMaterial
          map={textures.corrugated.map}
          aoMap={textures.corrugated.aoMap}
          roughnessMap={textures.corrugated.armMap}
          normalMap={textures.corrugated.normalMap}
          normalScale={[0.6, 0.6]}
          color="#0a0c10"
          roughness={0.5}
          metalness={0.4}
        />
      </mesh>
      <mesh position={[5.44, 0.6, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[8, 0.8]} />
        <meshStandardMaterial
          map={textures.corrugated.map}
          aoMap={textures.corrugated.aoMap}
          roughnessMap={textures.corrugated.armMap}
          normalMap={textures.corrugated.normalMap}
          normalScale={[0.6, 0.6]}
          color="#0a0c10"
          roughness={0.5}
          metalness={0.4}
        />
      </mesh>

      <WallTrimLines />

      {/* Wall base trim — faint cyan */}
      {[
        { pos: [-5.5, 0.02, -0.5], size: [0.03, 11] },
        { pos: [5.5, 0.02, -0.5], size: [0.03, 11] },
        { pos: [0, 0.02, -6], size: [12, 0.03] },
      ].map((s, i) => (
        <mesh key={'trim' + i} position={s.pos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={s.size} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* === CEILING — grey_tiles, very dark #080808 === */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.5, -0.5]}>
        <planeGeometry args={[12, 11]} />
        <meshStandardMaterial
          map={textures.ceiling.map}
          aoMap={textures.ceiling.aoMap}
          roughnessMap={textures.ceiling.armMap}
          color="#050505"
          roughness={0.9}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}

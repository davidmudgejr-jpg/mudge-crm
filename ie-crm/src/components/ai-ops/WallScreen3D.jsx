import React, { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// WallScreen3D — Glowing wall monitor with scanline animation, bright cyan
// border frame, and RectAreaLight casting colored light into the room.
// ---------------------------------------------------------------------------

// Scanline overlay — static thin horizontal lines over screen
function ScanlineOverlay({ width, height }) {
  const texture = React.useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 4, 64);
    for (let y = 0; y < 64; y += 4) {
      ctx.fillStyle = 'rgba(0,255,255,0.04)';
      ctx.fillRect(0, y, 4, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, height * 8);
    return tex;
  }, [height]);

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width - 0.05, height - 0.05]} />
      <meshBasicMaterial map={texture} transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function WallScreen3D({
  position = [0, 2, 0],
  rotation = [0, 0, 0],
  width = 2.2,
  height = 1.3,
  title = 'SCREEN',
  borderColor = '#3b82f6',
  glowColor,
  dataLines = [],
  onClick,
}) {
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef();
  const effectiveGlow = glowColor || borderColor;

  useFrame((state) => {
    if (glowRef.current) {
      glowRef.current.material.emissiveIntensity = hovered
        ? 0.8 + Math.sin(state.clock.elapsedTime * 3) * 0.15
        : 0.6;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* RectAreaLight — casts colored light INTO the room, hitting agents and floor */}
      <rectAreaLight
        color={effectiveGlow}
        intensity={3.0}
        width={width}
        height={height}
        position={[0, 0, 0.15]}
      />

      {/* PointLight — casts glow onto the wall behind the screen */}
      <pointLight
        color={effectiveGlow}
        intensity={3}
        distance={4}
        decay={2}
        position={[0, 0, -0.2]}
      />

      {/* Haze glow behind screen — larger transparent plane */}
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[width + 0.4, height + 0.4]} />
        <meshBasicMaterial color={effectiveGlow} transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>

      {/* Screen face */}
      <mesh
        ref={glowRef}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#060810"
          emissive={borderColor}
          emissiveIntensity={0.6}
          roughness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Scanline overlay */}
      <ScanlineOverlay width={width} height={height} />

      {/* Bright cyan border frame — thin emissive lines */}
      {[
        { pos: [0, height / 2 + 0.02, 0.01], scale: [width + 0.08, 0.03, 1] },
        { pos: [0, -height / 2 - 0.02, 0.01], scale: [width + 0.08, 0.03, 1] },
        { pos: [-width / 2 - 0.02, 0, 0.01], scale: [0.03, height + 0.08, 1] },
        { pos: [width / 2 + 0.02, 0, 0.01], scale: [0.03, height + 0.08, 1] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.pos} scale={edge.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Title */}
      <Text
        position={[0, height / 2 - 0.18, 0.03]}
        fontSize={0.18}
        color={borderColor}
        anchorX="center"
        anchorY="top"
        letterSpacing={0.12}
      >
        {title}
      </Text>

      {/* Data lines */}
      {dataLines.map((line, i) => (
        <Text
          key={i}
          position={[0, height / 2 - 0.45 - i * 0.2, 0.03]}
          fontSize={0.126}
          color="#e2e8f0"
          anchorX="center"
          anchorY="top"
        >
          {line}
        </Text>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// WallScreenLayout — Positions all 4 screens with proper glow colors
// Blue screens cast #2244ff, green screens cast #004400
// ---------------------------------------------------------------------------

export function WallScreenLayout({ agents = [], pending = [], onZoomIn }) {
  const pendingTotal = Array.isArray(pending)
    ? pending.reduce((sum, p) => sum + (parseInt(p.count) || 0), 0)
    : parseInt(pending) || 0;

  const errorAgents = agents.filter((a) => a.status === 'error');
  const hasErrors = errorAgents.length > 0;

  return (
    <group>
      {/* BACK WALL — Pipeline */}
      <WallScreen3D
        position={[-3, 2.2, -5.88]}
        rotation={[0, 0, 0]}
        width={4.2}
        height={2.24}
        title="PIPELINE"
        borderColor="#6366f1"
        glowColor="#2244ff"
        dataLines={[
          'Scout > Enrich > Match > Review',
          `${pendingTotal} pending`,
        ]}
        onClick={() => onZoomIn?.('pipeline')}
      />

      {/* BACK WALL — Agent Status */}
      <WallScreen3D
        position={[3, 2.2, -5.88]}
        rotation={[0, 0, 0]}
        width={4.2}
        height={2.24}
        title="AGENT STATUS"
        borderColor="#3b82f6"
        glowColor="#2244ff"
        dataLines={
          agents.slice(0, 5).map((a) => {
            const name = (a.agent_name || a.name || '').toLowerCase();
            const status = a.status || 'idle';
            return `${name} - ${status}`;
          })
        }
        onClick={() => onZoomIn?.('agent-overview')}
      />

      {/* LEFT WALL — Cost Monitor */}
      <WallScreen3D
        position={[-5.38, 2.2, -1.5]}
        rotation={[0, Math.PI / 2, 0]}
        width={4.2}
        height={2.24}
        title="COST MONITOR"
        borderColor="#10b981"
        glowColor="#004400"
        dataLines={[
          'Daily: $2.41',
          'Monthly: $47.20',
        ]}
        onClick={() => onZoomIn?.('costs')}
      />

      {/* RIGHT WALL — Alerts */}
      <WallScreen3D
        position={[5.38, 2.2, -1.5]}
        rotation={[0, -Math.PI / 2, 0]}
        width={4.2}
        height={2.24}
        title="ALERTS"
        borderColor={hasErrors ? '#ef4444' : '#10b981'}
        glowColor={hasErrors ? '#440000' : '#004400'}
        dataLines={hasErrors
          ? errorAgents.map((a) => `${a.agent_name || a.name}: ERROR`)
          : ['All systems clear']
        }
        onClick={() => onZoomIn?.('approval-queue')}
      />
    </group>
  );
}

import React, { useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import WarRoomScene from './WarRoomScene';
import OrbCore from './OrbCore';
import DustParticles from './DustParticles';
import { WallScreenLayout } from './WallScreen3D';
import Agent3D from './Agent3D';
import CameraController from './CameraController';

// ---------------------------------------------------------------------------
// RoamingAgents — 5 agents with 3-state machine: WALKING / PAUSING / LOOKING
// Pure useFrame logic, no external libs. Ref-based position mutation at 60fps.
// ---------------------------------------------------------------------------
const ROAMING_AGENTS = [
  { name: 'enricher',   color: '#6bcb77', emissive: '#6bcb77', isHouston: false },
  { name: 'scout',      color: '#ffd93d', emissive: '#ffd93d', isHouston: false },
  { name: 'matcher',    color: '#c77dff', emissive: '#c77dff', isHouston: false },
  { name: 'researcher', color: '#4d96ff', emissive: '#4d96ff', isHouston: false },
  { name: 'houston',    color: '#ff6b6b', emissive: '#ff6b6b', isHouston: true },
];

// Screen positions for LOOKING state — agents glance at nearest screen
const SCREEN_POSITIONS = [
  { x: -5.3, z: -2.5 },  // left upper (pipeline)
  { x: -5.3, z: 1.0 },   // left lower (costs)
  { x: 5.3, z: -2.5 },   // right upper (agent status)
  { x: 5.3, z: 1.0 },    // right lower (alerts)
];

const PLATFORM_AVOID_RADIUS = 3.8; // agents cannot be closer than this to center

function getRandomRoamTarget() {
  let x, z;
  do {
    const angle = Math.random() * Math.PI * 2;
    const radius = PLATFORM_AVOID_RADIUS + Math.random() * 3.0;
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  } while (Math.sqrt(x * x + z * z) < PLATFORM_AVOID_RADIUS);
  return { x, z };
}

// Does the line segment from (ax,az) to (bx,bz) pass within PLATFORM_AVOID_RADIUS of (0,0)?
function pathCrossesplatform(ax, az, bx, bz) {
  // Vector from a to b
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.001) return false;
  // Project origin onto line, clamped to segment [0,1]
  const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / lenSq));
  // Closest point on segment to origin
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.sqrt(cx * cx + cz * cz) < PLATFORM_AVOID_RADIUS;
}

// Compute a waypoint that routes around the platform.
// Finds which side of the platform is shorter to go around, then places
// a waypoint on the platform edge tangent on that side.
function computeDetourWaypoint(ax, az, bx, bz) {
  // Angles of start and end relative to center
  const angleA = Math.atan2(az, ax);
  const angleB = Math.atan2(bz, bx);

  // Two possible midpoint angles: going clockwise vs counter-clockwise
  let midCW = angleA + ((angleB - angleA + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 0.5;
  // Pick the midpoint angle, then place waypoint at platform edge + buffer
  const waypointRadius = PLATFORM_AVOID_RADIUS + 0.5;
  return {
    x: Math.cos(midCW) * waypointRadius,
    z: Math.sin(midCW) * waypointRadius,
  };
}

// Build a path from (ax,az) to target. If the direct line clips the platform,
// insert 1 waypoint to route around it. Returns array of {x,z} points to visit in order.
function buildPath(ax, az, tx, tz) {
  if (!pathCrossesplatform(ax, az, tx, tz)) {
    return [{ x: tx, z: tz }];
  }
  const wp = computeDetourWaypoint(ax, az, tx, tz);
  // Verify waypoint itself doesn't create a clip (rare edge case)
  // If it does, just use the waypoint as sole destination
  if (pathCrossesplatform(ax, az, wp.x, wp.z)) {
    // Push waypoint further out
    const angle = Math.atan2(wp.z, wp.x);
    wp.x = Math.cos(angle) * (PLATFORM_AVOID_RADIUS + 1.5);
    wp.z = Math.sin(angle) * (PLATFORM_AVOID_RADIUS + 1.5);
  }
  return [wp, { x: tx, z: tz }];
}

// Find the nearest screen to a position
function nearestScreen(x, z) {
  let best = SCREEN_POSITIONS[0], bestDist = Infinity;
  for (const s of SCREEN_POSITIONS) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// Smooth angle interpolation (always shortest path)
function lerpAngle(current, target, factor) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

function createAgentState(index) {
  const angle = (index / 5) * Math.PI * 2;
  const startX = Math.cos(angle) * 5;
  const startZ = Math.sin(angle) * 5;
  const t = getRandomRoamTarget();
  const path = buildPath(startX, startZ, t.x, t.z);
  return {
    state: 'walking',      // 'walking' | 'pausing' | 'looking'
    x: startX,
    z: startZ,
    waypoints: path,       // array of {x,z} — walk to each in order
    wpIndex: 0,            // current waypoint index
    finalTargetX: t.x,
    finalTargetZ: t.z,
    stateTimer: 0,
    pauseDuration: 0,
    lookTargetX: 0,
    lookTargetZ: 0,
  };
}

function RoamingAgent({ agent, index, heartbeatAgents, onZoomIn }) {
  const groupRef = useRef();
  const s = useRef(createAgentState(index));
  const walkingRef = useRef(true);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const a = s.current;
    const now = clock.elapsedTime;

    if (a.state === 'walking') {
      // Current waypoint target
      const wp = a.waypoints[a.wpIndex];
      if (!wp) { a.state = 'pausing'; a.stateTimer = now; a.pauseDuration = 3; }
      else {
        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.3) {
          // Reached this waypoint — advance to next or arrive
          a.wpIndex++;
          if (a.wpIndex >= a.waypoints.length) {
            // Arrived at final destination
            if (Math.random() < 0.2) {
              a.state = 'looking';
              a.stateTimer = now;
              a.pauseDuration = 2;
              const screen = nearestScreen(a.x, a.z);
              a.lookTargetX = screen.x;
              a.lookTargetZ = screen.z;
            } else {
              a.state = 'pausing';
              a.stateTimer = now;
              a.pauseDuration = 3 + Math.random() * 5;
            }
            walkingRef.current = false;
          }
          // else: continue walking to next waypoint (loop will pick it up next frame)
        } else {
          // Step toward current waypoint
          const nx = dx / dist;
          const nz = dz / dist;
          a.x += nx * 0.008;
          a.z += nz * 0.008;

          // Face movement direction (smooth)
          const moveAngle = Math.atan2(nx, nz);
          groupRef.current.rotation.y = lerpAngle(groupRef.current.rotation.y, moveAngle, 0.1);
        }
      }
    } else if (a.state === 'pausing') {
      // Stand still, slowly rotate to face orb
      const orbAngle = Math.atan2(-a.x, -a.z);
      groupRef.current.rotation.y = lerpAngle(groupRef.current.rotation.y, orbAngle, 0.04);

      if (now - a.stateTimer > a.pauseDuration) {
        // Pick new target, build safe path around platform
        const t = getRandomRoamTarget();
        a.waypoints = buildPath(a.x, a.z, t.x, t.z);
        a.wpIndex = 0;
        a.state = 'walking';
        walkingRef.current = true;
      }
    } else if (a.state === 'looking') {
      // Slowly rotate to look at nearest screen
      const screenAngle = Math.atan2(a.lookTargetX - a.x, a.lookTargetZ - a.z);
      groupRef.current.rotation.y = lerpAngle(groupRef.current.rotation.y, screenAngle, 0.04);

      if (now - a.stateTimer > a.pauseDuration) {
        // Done looking — pause briefly then walk
        a.state = 'pausing';
        a.stateTimer = now;
        a.pauseDuration = 1.0 + Math.random() * 1.0;
      }
    }

    // Safety clamp — if somehow inside platform, push outward
    const distFromCenter = Math.sqrt(a.x * a.x + a.z * a.z);
    if (distFromCenter < PLATFORM_AVOID_RADIUS && distFromCenter > 0.01) {
      const pushAngle = Math.atan2(a.z, a.x);
      a.x = Math.cos(pushAngle) * PLATFORM_AVOID_RADIUS;
      a.z = Math.sin(pushAngle) * PLATFORM_AVOID_RADIUS;
    }

    // Update group position
    groupRef.current.position.x = a.x;
    groupRef.current.position.z = a.z;
    groupRef.current.position.y = 0;
  });

  const heartbeat = heartbeatAgents?.find(
    (h) => (h.agent_name || h.name || '').toLowerCase() === agent.name
  );

  return (
    <group ref={groupRef} position={[s.current.x, 0, s.current.z]}>
      <Agent3D
        name={agent.name}
        color={agent.color}
        emissiveColor={agent.emissive}
        status={heartbeat?.status || 'idle'}
        position3D={[0, 0, 0]}
        facing="front-left"
        isWalking={true}
        isSeated={false}
        isHouston={agent.isHouston}
        onClick={() => onZoomIn?.('agent-' + agent.name)}
      />
    </group>
  );
}

function RoamingAgentGroup({ heartbeatAgents, onZoomIn }) {
  return ROAMING_AGENTS.map((agent, i) => (
    <RoamingAgent
      key={agent.name}
      agent={agent}
      index={i}
      heartbeatAgents={heartbeatAgents}
      onZoomIn={onZoomIn}
    />
  ));
}

// ---------------------------------------------------------------------------
// Desk3D
// ---------------------------------------------------------------------------
function Desk3D({ position, monitorColor }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.8, 0.03, 0.5]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.6} />
      </mesh>
      {[[-0.35, 0.35, -0.2], [0.35, 0.35, -0.2], [-0.35, 0.35, 0.2], [0.35, 0.35, 0.2]].map((pos, i) => (
        <mesh key={i} position={pos}>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 4]} />
          <meshStandardMaterial color="#0d0d1a" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.93, -0.15]}>
        <boxGeometry args={[0.35, 0.22, 0.02]} />
        <meshStandardMaterial color="#080814" emissive={monitorColor} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.8, -0.15]}>
        <cylinderGeometry args={[0.02, 0.03, 0.12, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// WarRoom3D
// ---------------------------------------------------------------------------
export default function WarRoom3D({
  agents = [],
  pending = [],
  recentLogs = [],
  onZoomIn,
  activeView,
  onBack,
  onCameraReady,
  houstonActive = false,
  onHoustonActivate,
}) {
  const handleTransitionComplete = useCallback(() => {
    onCameraReady?.();
  }, [onCameraReady]);

  // Desks removed — briefing room layout, agents stand around the dais

  return (
    <Canvas
      camera={{ position: [0, 10, 18], fov: 52, near: 0.1, far: 100 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.8 }}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      style={{ background: '#04040a' }}
    >
      <Suspense fallback={null}>
        <CameraController activeView={activeView} onTransitionComplete={handleTransitionComplete} />
        <WarRoomScene onZoomIn={onZoomIn} />
        <OrbCore onClick={() => onHoustonActivate?.()} houstonActive={houstonActive} />
        <DustParticles />
        <WallScreenLayout agents={agents} pending={pending} onZoomIn={onZoomIn} />
        {/* Desks removed — clean briefing room */}
        <RoamingAgentGroup heartbeatAgents={agents} onZoomIn={onZoomIn} />

        {/* Post-processing — Bloom makes orb, rings, and screen edges bleed light */}
        <EffectComposer>
          <Bloom
            intensity={1.5}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}

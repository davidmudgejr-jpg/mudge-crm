import React, { useRef, useEffect, useState, useCallback } from 'react';
import RoomShell from './RoomShell';
import RoomEnvironment from './RoomEnvironment';
import WorkstationDesk from './WorkstationDesk';
import ControlConsole from './ControlConsole';
import HolographicSphere from './HolographicSphere';
import { WallScreens } from './WallScreen';
import LiveFeedTicker from './LiveFeedTicker';
import AgentCharacter from './AgentCharacter';
import { createMovementEngine } from './AgentMovementEngine';

// ---------------------------------------------------------------------------
// Agent configuration — 7 agents across 3 tiers
// ---------------------------------------------------------------------------
const AGENT_CONFIGS = [
  { name: 'enricher', color: '#10b981', accessories: ['labcoat'], homeDesk: { x: 210, y: 340 }, tier: 3 },
  { name: 'researcher', color: '#3b82f6', accessories: ['headset'], homeDesk: { x: 630, y: 335 }, tier: 3 },
  { name: 'scout', color: '#f59e0b', accessories: [], homeDesk: { x: 248, y: 232 }, tier: 3 },
  { name: 'matcher', color: '#8b5cf6', accessories: ['tablet'], homeDesk: { x: 620, y: 225 }, tier: 3 },
  { name: 'ralph', color: '#ef4444', accessories: ['clipboard'], standing: { x: 400, y: 370 }, tier: 2 },
  { name: 'gemini', color: '#06b6d4', accessories: [], standing: { x: 440, y: 385 }, tier: 2 },
  { name: 'houston', color: '#fbbf24', accessories: [], standing: { x: 370, y: 420 }, tier: 1, isHouston: true },
];

// ---------------------------------------------------------------------------
// MissionControlRoom
// Orchestrates all room elements into the complete isometric scene.
// ---------------------------------------------------------------------------
export default function MissionControlRoom({ agents = [], pending = 0, recentLogs = [], onZoomIn }) {
  const engineRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const [agentStates, setAgentStates] = useState({});

  // Initialize movement engine once
  if (!engineRef.current) {
    engineRef.current = createMovementEngine(AGENT_CONFIGS);
    // Set initial states
    const initial = engineRef.current.getAllStates();
    // We set this synchronously for the first render
    if (Object.keys(agentStates).length === 0) {
      // Will be picked up on next render via useEffect
    }
  }

  // Animation loop
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Set initial state
    setAgentStates(engine.getAllStates());

    const animate = (timestamp) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      engine.tick(delta);
      setAgentStates(engine.getAllStates());

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Sync heartbeat data to movement engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !agents.length) return;

    agents.forEach((a) => {
      const name = (a.agent_name || a.name || '').toLowerCase();
      if (name) {
        engine.onHeartbeatUpdate(name, a.status || 'idle');
      }
    });
  }, [agents]);

  // Build sorted agent list for depth ordering (ascending y = rendered first = behind)
  const sortedAgents = AGENT_CONFIGS
    .map((cfg) => {
      const state = agentStates[cfg.name] || {};
      const heartbeat = agents.find(
        (a) => (a.agent_name || a.name || '').toLowerCase() === cfg.name
      );
      return {
        ...cfg,
        ...state,
        position: state.position || cfg.homeDesk || cfg.standing,
        status: heartbeat?.status || state.status || 'idle',
      };
    })
    .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  const handleAgentClick = useCallback(
    (name, e) => {
      if (onZoomIn) onZoomIn(`agent-${name}`, e);
    },
    [onZoomIn]
  );

  return (
    <div className="w-full h-full flex items-center justify-center">
      <RoomShell>
        {/* 1. RoomEnvironment — server racks, plant, cooler at back of room */}
        <RoomEnvironment />

        {/* 2. WallScreens — mounted on left + right walls */}
        <WallScreens agents={agents} pending={pending} onZoomIn={onZoomIn} />

        {/* 3. WorkstationDesks — back desks first (higher y = farther back in iso) */}
        {/* Scout (back-left) */}
        <WorkstationDesk
          x={200}
          y={250}
          monitorColor="#f59e0b"
          label="Scout"
        />
        {/* Matcher (back-right) */}
        <WorkstationDesk
          x={590}
          y={245}
          monitorColor="#8b5cf6"
          label="Matcher"
        />
        {/* Enricher (front-left) */}
        <WorkstationDesk
          x={160}
          y={360}
          monitorColor="#10b981"
          label="Enricher"
        />
        {/* Researcher (front-right) */}
        <WorkstationDesk
          x={590}
          y={355}
          monitorColor="#3b82f6"
          label="Researcher"
        />

        {/* 4. ControlConsole — center of room */}
        <ControlConsole
          onClick={onZoomIn ? (e) => onZoomIn('health', e) : undefined}
        />

        {/* 5. HolographicSphere — above the console */}
        <HolographicSphere
          onClickSphere={onZoomIn ? (e) => onZoomIn('territory', e) : undefined}
        />

        {/* 6. Agent characters — depth-sorted by y position */}
        {sortedAgents.map((agent) => (
          <AgentCharacter
            key={agent.name}
            agentName={agent.name}
            color={agent.color}
            status={agent.status}
            position={agent.position}
            facing={agent.facing || 'front-left'}
            isWalking={agent.isWalking || false}
            isSeated={agent.isSeated || false}
            accessories={agent.accessories || []}
            isHouston={agent.isHouston || false}
            onClick={(e) => handleAgentClick(agent.name, e)}
          />
        ))}

        {/* 7. LiveFeedTicker — bottom overlay inside floor diamond */}
        <LiveFeedTicker logs={recentLogs} />
      </RoomShell>
    </div>
  );
}

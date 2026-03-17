import React from 'react';
import RoomShell from './RoomShell';
import RoomEnvironment from './RoomEnvironment';
import WorkstationDesk from './WorkstationDesk';
import ControlConsole from './ControlConsole';
import HolographicSphere from './HolographicSphere';
import { WallScreens } from './WallScreen';
import LiveFeedTicker from './LiveFeedTicker';

// ---------------------------------------------------------------------------
// MissionControlRoom
// Orchestrates all room elements into the complete isometric scene.
// ---------------------------------------------------------------------------
export default function MissionControlRoom({ agents = [], pending = 0, recentLogs = [], onZoomIn }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <RoomShell>
        {/* 1. RoomEnvironment — server racks, plant, cooler at back of room */}
        <RoomEnvironment />

        {/* 2. WallScreens — mounted on left + right walls */}
        <WallScreens
          agents={agents}
          pending={pending}
          onZoomIn={onZoomIn}
        />

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

        {/* 6. Agent characters — placeholder for Task 14 */}
        {/* TODO Task 14: render AgentCharacter components here, one per agent */}

        {/* 7. LiveFeedTicker — bottom overlay inside floor diamond */}
        <LiveFeedTicker logs={recentLogs} />
      </RoomShell>
    </div>
  );
}

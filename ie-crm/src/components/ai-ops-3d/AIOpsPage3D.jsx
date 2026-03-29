/**
 * AIOpsPage3D.jsx
 * Main React component — mounts Three.js scene, overlay buttons, data fetching, raycasting.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { createCommandCenterScene } from './CommandCenterScene.js';
import { createAgentFigures } from './AgentFigures.js';
import { createWallDisplays } from './WallDisplays.js';

// ─── Styles ───
const overlayStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 10,
};

const btnBase = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: "'Courier New', monospace",
  fontWeight: 'bold',
  fontSize: 14,
  letterSpacing: '0.05em',
  color: '#fff',
  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
  transition: 'transform 0.15s, box-shadow 0.15s',
};

const councilBtnStyle = {
  ...btnBase,
  background: 'linear-gradient(135deg, #0a6e3a, #10b060)',
};

const proposalsBtnStyle = {
  ...btnBase,
  background: 'linear-gradient(135deg, #8a5a00, #d4920a)',
};

// ─── API helpers ───
function getHeaders() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function safeFetch(url, headers) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[3D Command Center] Fetch failed: ${url}`, err.message);
    return null;
  }
}

// ─── Component ───
export default function AIOpsPage3D({
  onAgentClick,
  onScreenClick,
  onCouncilClick,
  onProposalsClick,
  onMeetingsClick,
  onSchedulesClick,
  apiBaseUrl = '',
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  // ─── Mount Three.js scene ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create scene
    const sceneCtx = createCommandCenterScene(container);
    const { scene, camera, renderer, tickCallbacks } = sceneCtx;

    // Create agents
    const agentCtx = createAgentFigures(scene);
    tickCallbacks.push(agentCtx.createAnimationTick());

    // Create wall displays
    const displayCtx = createWallDisplays(scene);
    tickCallbacks.push(displayCtx.createAnimationTick());

    // Store refs for data updates + raycasting
    sceneRef.current = { sceneCtx, agentCtx, displayCtx };

    // ─── Raycasting ───
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check agents
      const agentHits = raycaster.intersectObjects(agentCtx.agentMeshes, false);
      if (agentHits.length > 0) {
        const agentId = agentCtx.getAgentIdFromMesh(agentHits[0].object);
        if (agentId && onAgentClick) {
          onAgentClick(agentId);
          return;
        }
      }

      // Check screens
      const screenHits = raycaster.intersectObjects(displayCtx.displayMeshes, false);
      if (screenHits.length > 0) {
        const screenId = displayCtx.getScreenIdFromMesh(screenHits[0].object);
        if (screenId && onScreenClick) {
          onScreenClick(screenId);
          return;
        }
      }
    }

    // Pointer cursor on hover
    function onMouseMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const allClickable = [...agentCtx.agentMeshes, ...displayCtx.displayMeshes];
      const hits = raycaster.intersectObjects(allClickable, false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    }

    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // Cleanup
    return () => {
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      sceneCtx.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Data fetching ───
  useEffect(() => {
    let cancelled = false;

    async function fetchAllData() {
      if (!sceneRef.current) return;
      const { displayCtx } = sceneRef.current;
      const headers = getHeaders();
      const base = apiBaseUrl.replace(/\/$/, '');

      const [agentData, crmData, pipelineData, campaignData] = await Promise.all([
        safeFetch(`${base}/api/ai/agent/heartbeat`, headers),
        safeFetch(`${base}/api/ai/stats`, headers),
        safeFetch(`${base}/api/ai/queue/pending`, headers),
        safeFetch(`${base}/api/ai/campaign/analytics`, headers),
      ]);

      if (cancelled) return;

      if (agentData) displayCtx.updateDisplayData('agent-status', agentData);
      if (crmData) displayCtx.updateDisplayData('crm-stats', crmData);
      if (pipelineData) displayCtx.updateDisplayData('pipeline', pipelineData);
      if (campaignData) displayCtx.updateDisplayData('campaign', campaignData);

      // System health — synthesize from available data or fetch a dedicated endpoint
      const healthData = {
        uptime: formatUptime(performance.now()),
        status: 'ONLINE',
        version: 'v3.7.1',
        tokensUsed: agentData?.tokensUsed ?? 'N/A',
        tokenBudget: agentData?.tokenBudget ?? 'N/A',
      };
      displayCtx.updateDisplayData('system-health', healthData);
    }

    // Initial fetch
    fetchAllData();

    // Refresh every 30s
    const interval = setInterval(fetchAllData, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBaseUrl]);

  // ─── Render ───
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {/* Overlay buttons */}
      <div style={overlayStyle}>
        <button
          style={councilBtnStyle}
          onClick={onCouncilClick}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Open AI Council"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          COUNCIL
        </button>
        <button
          style={proposalsBtnStyle}
          onClick={onProposalsClick}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="View Proposals"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
          </svg>
          PROPOSALS
        </button>
        <button
          style={{
            ...proposalsBtnStyle,
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: '#3b82f6',
          }}
          onClick={onMeetingsClick}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Council of Minds Meetings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          MEETINGS
        </button>
        <button
          style={{
            ...proposalsBtnStyle,
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid rgba(34,197,94,0.3)',
            color: '#22c55e',
          }}
          onClick={onSchedulesClick}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title="Agent Schedules"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          SCHEDULES
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───
function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${m}m ${s}s`;
}

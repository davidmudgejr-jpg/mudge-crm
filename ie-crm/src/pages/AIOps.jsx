import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import RoomBreadcrumb from '../components/ai-ops/RoomBreadcrumb';
import WarRoom3D from '../components/ai-ops/WarRoom3D';
import DetailOverlay from '../components/ai-ops/DetailOverlay';
import HoustonVoice from '../components/ai-ops/HoustonVoice';
import LiveTicker from '../components/ai-ops/LiveTicker';
import PipelineDashboard from '../components/ai-ops/detail-views/PipelineDashboard';
import AgentDossier from '../components/ai-ops/detail-views/AgentDossier';
import ApprovalQueue from '../components/ai-ops/detail-views/ApprovalQueue';
import LogViewer from '../components/ai-ops/detail-views/LogViewer';
import CostBreakdown from '../components/ai-ops/detail-views/CostBreakdown';
import TerritoryIntel from '../components/ai-ops/detail-views/TerritoryIntel';
import SystemHealth from '../components/ai-ops/detail-views/SystemHealth';
import CouncilChat from '../components/ai-ops/detail-views/CouncilChat';

// ─────────────────────────────────────────────────────────────
// Detail view registry — maps zone IDs from WarRoom3D clicks
// to the React component that renders inside DetailOverlay.
// ─────────────────────────────────────────────────────────────
const DETAIL_VIEWS = {
  pipeline:         PipelineDashboard,
  'approval-queue': ApprovalQueue,
  logs:             LogViewer,
  costs:            CostBreakdown,
  territory:        TerritoryIntel,
  health:           SystemHealth,
  council:          CouncilChat,
};

// ─────────────────────────────────────────────────────────────
// AIOps — 3D War Room page
// ─────────────────────────────────────────────────────────────
export default function AIOps() {
  const navigate = useNavigate();
  const { agents, pending, recentLogs, pipeline, costs, loading, error, stale } = useAgentHeartbeats();

  // Which detail view is open (null = room overview)
  const [activeView, setActiveView] = useState(null);
  // Whether the camera animation is done (so we can show the overlay)
  const [cameraReady, setCameraReady] = useState(false);
  // Houston voice panel toggle
  const [houstonActive, setHoustonActive] = useState(false);

  // Keyboard shortcut: Escape to go back
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (activeView) {
          setActiveView(null);
          setCameraReady(false);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeView]);

  // Zoom into a detail view (called by WarRoom3D screen clicks)
  const handleZoomIn = (viewId) => {
    // Agent clicks come as "agent-<name>" — route to dossier
    if (viewId?.startsWith('agent-')) {
      setActiveView(viewId);
      return;
    }
    setActiveView(viewId);
  };

  const handleBack = () => {
    setActiveView(null);
    setCameraReady(false);
  };

  // Resolve the detail component to render
  let detailContent = null;
  if (activeView) {
    if (activeView.startsWith('agent-')) {
      const agentName = activeView.replace('agent-', '');
      const agentData = agents.find(
        (a) => (a.agent_name || a.name || '').toLowerCase() === agentName.toLowerCase()
      );
      detailContent = <AgentDossier agent={agentData} agentName={agentName} />;
    } else {
      const ViewComponent = DETAIL_VIEWS[activeView];
      if (ViewComponent) {
        detailContent = (
          <ViewComponent
            agents={agents}
            pending={pending}
            recentLogs={recentLogs}
            pipeline={pipeline}
            costs={costs}
          />
        );
      }
    }
  }

  return (
    <div className="h-full w-full relative overflow-hidden bg-[#04040a]">
      {/* Breadcrumb */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <RoomBreadcrumb activeView={activeView} onBack={handleBack} />
        </div>
      </div>

      {/* Live Ticker — bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <LiveTicker agents={agents} recentLogs={recentLogs} stale={stale} error={error} />
        </div>
      </div>

      {/* Council button overlay — top right */}
      {!activeView && (
        <div className="absolute top-14 right-4 z-20">
          <button
            onClick={() => handleZoomIn('council')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 text-xs font-medium transition-all backdrop-blur-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
            Council
          </button>
        </div>
      )}

      {/* 3D Canvas — fills the entire page */}
      <WarRoom3D
        agents={agents}
        pending={pending}
        recentLogs={recentLogs}
        pipeline={pipeline}
        costs={costs}
        onZoomIn={handleZoomIn}
        activeView={activeView}
        onBack={handleBack}
        onCameraReady={() => setCameraReady(true)}
        houstonActive={houstonActive}
        onHoustonActivate={() => setHoustonActive(true)}
      />

      {/* Detail Overlay — HTML on top of 3D */}
      <DetailOverlay
        activeView={activeView}
        detailContent={detailContent}
        onBack={handleBack}
      />

      {/* Houston Voice */}
      {houstonActive && (
        <HoustonVoice onClose={() => setHoustonActive(false)} />
      )}
    </div>
  );
}

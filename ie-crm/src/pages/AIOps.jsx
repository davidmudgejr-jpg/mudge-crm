import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import RoomBreadcrumb from '../components/ai-ops/RoomBreadcrumb';
import WarRoom3D from '../components/ai-ops/WarRoom3D';
import DetailOverlay from '../components/ai-ops/DetailOverlay';
import HoustonVoice from '../components/ai-ops/HoustonVoice';
import PipelineDashboard from '../components/ai-ops/detail-views/PipelineDashboard';
import AgentDossier from '../components/ai-ops/detail-views/AgentDossier';
import ApprovalQueue from '../components/ai-ops/detail-views/ApprovalQueue';
import LogViewer from '../components/ai-ops/detail-views/LogViewer';
import CostBreakdown from '../components/ai-ops/detail-views/CostBreakdown';
import TerritoryIntel from '../components/ai-ops/detail-views/TerritoryIntel';
import SystemHealth from '../components/ai-ops/detail-views/SystemHealth';

const DETAIL_VIEWS = {
  pipeline:        PipelineDashboard,
  'approval-queue': ApprovalQueue,
  logs:            LogViewer,
  costs:           CostBreakdown,
  territory:       TerritoryIntel,
  health:          SystemHealth,
};

export default function AIOps() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState(null);
  const [houstonActive, setHoustonActive] = useState(false);
  const { agents, pending, recentLogs, pipeline, costs, loading, error, stale } = useAgentHeartbeats();

  // Simplified — no more DOM element / getBoundingClientRect needed
  const handleZoomIn = (viewKey) => {
    setActiveView(viewKey);
  };

  const handleZoomOut = () => {
    setActiveView(null);
  };

  // Houston orb activation — separate from detail view system
  const handleHoustonActivate = () => {
    setActiveView('houston');
    setHoustonActive(true);
  };

  const handleHoustonDeactivate = () => {
    setHoustonActive(false);
    setActiveView(null);
  };

  // Escape key handler — Houston mode takes priority
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (houstonActive) {
          handleHoustonDeactivate();
        } else if (activeView) {
          handleZoomOut();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView, houstonActive]);

  // Build detail content
  let detailContent = null;
  if (activeView) {
    if (activeView.startsWith('agent-')) {
      detailContent = (
        <div className="max-w-6xl mx-auto">
          <AgentDossier agentName={activeView.replace('agent-', '')} agents={agents} />
        </div>
      );
    } else if (DETAIL_VIEWS[activeView]) {
      detailContent = (
        <div className="max-w-6xl mx-auto">
          {React.createElement(DETAIL_VIEWS[activeView], { agents, pending, recentLogs })}
        </div>
      );
    }
  }

  return (
    <div className="fixed inset-0 bg-[#04040a] overflow-hidden z-40">
      {stale && (
        <div className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
          Connection lost - showing last known state
        </div>
      )}

      {/* Back to CRM */}
      <button
        onClick={() => navigate('/properties')}
        className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs transition-all"
        style={{ display: stale ? 'none' : undefined }}
      >
        {'<-'} Back to CRM
      </button>

      <RoomBreadcrumb activeView={activeView} onBack={handleZoomOut} />

      {/* 3D War Room Canvas — fills entire viewport */}
      <WarRoom3D
        agents={agents}
        pending={pending}
        recentLogs={recentLogs}
        pipeline={pipeline}
        costs={costs}
        onZoomIn={handleZoomIn}
        activeView={activeView}
        onBack={handleZoomOut}
        houstonActive={houstonActive}
        onHoustonActivate={handleHoustonActivate}
      />

      {/* HTML detail panel overlay — on top of 3D canvas */}
      <DetailOverlay
        activeView={activeView}
        detailContent={detailContent}
        onBack={handleZoomOut}
      />

      {/* Houston voice conversation overlay */}
      <HoustonVoice active={houstonActive} />
    </div>
  );
}

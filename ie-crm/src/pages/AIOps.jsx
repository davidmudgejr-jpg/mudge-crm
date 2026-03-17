import React, { useState, useEffect } from 'react';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import RoomBreadcrumb from '../components/ai-ops/RoomBreadcrumb';
import MissionControlRoom from '../components/ai-ops/MissionControlRoom';
import ZoomTransition from '../components/ai-ops/ZoomTransition';
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
  const [activeView, setActiveView] = useState(null);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const { agents, pending, recentLogs, loading, error, stale } = useAgentHeartbeats();

  const handleZoomIn = (viewKey, originElement) => {
    if (originElement) {
      const rect = originElement.getBoundingClientRect();
      const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
      const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
      setZoomOrigin({ x, y });
    }
    setActiveView(viewKey);
  };

  const handleZoomOut = () => {
    setActiveView(null);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && activeView) handleZoomOut();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView]);

  return (
    <div className="fixed inset-0 bg-[#04040a] overflow-hidden">
      {stale && (
        <div className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
          Connection lost — showing last known state
        </div>
      )}

      <RoomBreadcrumb activeView={activeView} onBack={handleZoomOut} />

      <ZoomTransition
        activeView={activeView}
        zoomOrigin={zoomOrigin}
        roomContent={
          <MissionControlRoom
            agents={agents}
            pending={pending}
            recentLogs={recentLogs}
            onZoomIn={handleZoomIn}
          />
        }
        detailContent={
          activeView ? (
            <div className="max-w-6xl mx-auto">
              {activeView.startsWith('agent-') ? (
                <AgentDossier
                  agentName={activeView.replace('agent-', '')}
                  agents={agents}
                />
              ) : DETAIL_VIEWS[activeView] ? (
                React.createElement(DETAIL_VIEWS[activeView], { agents, pending, recentLogs })
              ) : (
                <div className="text-crm-muted text-center py-20">
                  View not found: {activeView}
                </div>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import AIOpsPage3D from '../components/ai-ops-3d/AIOpsPage3D';
import DetailOverlay from '../components/ai-ops/DetailOverlay';
import LiveTicker from '../components/ai-ops/LiveTicker';
import PipelineDashboard from '../components/ai-ops/detail-views/PipelineDashboard';
import AgentDossier from '../components/ai-ops/detail-views/AgentDossier';
import ApprovalQueue from '../components/ai-ops/detail-views/ApprovalQueue';
import LogViewer from '../components/ai-ops/detail-views/LogViewer';
import CostBreakdown from '../components/ai-ops/detail-views/CostBreakdown';
import TerritoryIntel from '../components/ai-ops/detail-views/TerritoryIntel';
import SystemHealth from '../components/ai-ops/detail-views/SystemHealth';
import CouncilChat from '../components/ai-ops/detail-views/CouncilChat';
import ImprovementProposals from '../components/ai-ops/detail-views/ImprovementProposals';
import CouncilMeetings from '../components/ai-ops/detail-views/CouncilMeetings';

// ─────────────────────────────────────────────────────────────
// Detail view registry — maps screen/agent IDs to components
// ─────────────────────────────────────────────────────────────
const DETAIL_VIEWS = {
  pipeline:         PipelineDashboard,
  'approval-queue': ApprovalQueue,
  'agent-status':   null, // handled by AgentDossier below
  'crm-stats':      PipelineDashboard,
  'campaign':       CostBreakdown,
  'system-health':  SystemHealth,
  logs:             LogViewer,
  costs:            CostBreakdown,
  territory:        TerritoryIntel,
  health:           SystemHealth,
  council:          CouncilChat,
  proposals:        ImprovementProposals,
  meetings:         CouncilMeetings,
};

// ─────────────────────────────────────────────────────────────
// AIOps — Houston Command's 3D Command Center
// ─────────────────────────────────────────────────────────────
export default function AIOps() {
  const { agents, pending, recentLogs, pipeline, costs, loading, error, stale } = useAgentHeartbeats();
  const [activeView, setActiveView] = useState(null);

  // Keyboard shortcut: Escape to go back
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && activeView) {
        setActiveView(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeView]);

  const handleBack = () => setActiveView(null);

  // When an agent figure is clicked in the 3D scene
  const handleAgentClick = (agentId) => {
    setActiveView(`agent-${agentId}`);
  };

  // When a wall screen is clicked in the 3D scene
  const handleScreenClick = (screenId) => {
    setActiveView(screenId);
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
      {/* Houston Command's 3D Command Center */}
      <AIOpsPage3D
        onAgentClick={handleAgentClick}
        onScreenClick={handleScreenClick}
        onCouncilClick={() => setActiveView('council')}
        onProposalsClick={() => setActiveView('proposals')}
        onMeetingsClick={() => setActiveView('meetings')}
      />

      {/* Live Ticker — bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto">
          <LiveTicker agents={agents} recentLogs={recentLogs} stale={stale} error={error} />
        </div>
      </div>

      {/* Detail Overlay — HTML on top of 3D */}
      <DetailOverlay
        activeView={activeView}
        detailContent={detailContent}
        onBack={handleBack}
      />
    </div>
  );
}

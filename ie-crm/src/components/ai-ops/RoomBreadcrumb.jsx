import React from 'react';
import { useNavigate } from 'react-router-dom';

const VIEW_LABELS = {
  pipeline: 'Pipeline Dashboard',
  'approval-queue': 'Approval Queue',
  logs: 'Log Viewer',
  costs: 'Cost Breakdown',
  territory: 'Territory Intelligence',
  health: 'System Health',
};

export default function RoomBreadcrumb({ activeView, onBack }) {
  const navigate = useNavigate();

  const label = activeView?.startsWith('agent-')
    ? `Agent: ${activeView.replace('agent-', '')}`
    : VIEW_LABELS[activeView] || activeView;

  // No activeView = top level, click exits to CRM
  // With activeView = inside a detail, click goes back to war room
  const handleClick = () => {
    if (activeView) {
      onBack();
    } else {
      navigate('/properties');
    }
  };

  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2 text-sm">
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all bg-white/5 hover:bg-white/10 text-white/60 hover:text-white cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Mission Control
      </button>
      {activeView && (
        <>
          <span className="text-white/20">/</span>
          <span className="text-white/60">{label}</span>
        </>
      )}
    </div>
  );
}

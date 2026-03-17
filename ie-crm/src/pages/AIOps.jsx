import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import RoomBreadcrumb from '../components/ai-ops/RoomBreadcrumb';

const DETAIL_VIEWS = {};

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

  return (
    <div className="fixed inset-0 bg-[#04040a] overflow-hidden">
      {stale && (
        <div className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
          Connection lost — showing last known state
        </div>
      )}

      <RoomBreadcrumb activeView={activeView} onBack={handleZoomOut} />

      <AnimatePresence mode="wait">
        {activeView === null ? (
          <motion.div
            key="room"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full"
            style={{ transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🎮</div>
                <h1 className="text-2xl font-bold text-white mb-2">Mission Control</h1>
                <p className="text-crm-muted text-sm mb-6">
                  {loading ? 'Connecting to agents...' : `${agents.length} agents registered`}
                </p>
                {agents.length > 0 && (
                  <div className="flex gap-3 justify-center flex-wrap">
                    {agents.map(a => (
                      <div
                        key={a.agent_name}
                        className="px-3 py-2 rounded-lg border cursor-pointer hover:scale-105 transition-transform"
                        style={{
                          borderColor: a.status === 'running' ? '#10b981' : a.status === 'error' ? '#ef4444' : '#f59e0b',
                          background: 'rgba(255,255,255,0.03)'
                        }}
                        onClick={(e) => handleZoomIn('agent-' + a.agent_name, e.currentTarget)}
                      >
                        <div className="text-xs text-crm-muted">{a.agent_name}</div>
                        <div className="text-sm font-semibold" style={{
                          color: a.status === 'running' ? '#10b981' : a.status === 'error' ? '#ef4444' : '#f59e0b'
                        }}>
                          {a.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-crm-muted text-xs mt-6">Room scene coming soon — click an agent to test zoom</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={activeView}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full h-full overflow-auto p-8"
          >
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl font-bold text-white mb-4">
                {activeView.startsWith('agent-') ? `Agent: ${activeView.replace('agent-', '')}` : activeView}
              </h2>
              <pre className="text-crm-muted text-xs bg-crm-card rounded-lg p-4 overflow-auto">
                {JSON.stringify(
                  activeView.startsWith('agent-')
                    ? agents.find(a => a.agent_name === activeView.replace('agent-', ''))
                    : { view: activeView, pending, recentLogs: recentLogs?.slice(0, 5) },
                  null, 2
                )}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';

// Opt into React Router v7 future flags to silence warnings
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
import Sidebar from './components/Sidebar';
import ClaudePanel from './components/ClaudePanel';
import Properties from './pages/Properties';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';
import Deals from './pages/Deals';
import Interactions from './pages/Interactions';
import Campaigns from './pages/Campaigns';
import ActionItems from './pages/ActionItems';
import Comps from './pages/Comps';
import Import from './pages/Import';
import Settings from './pages/Settings';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { SlideOverProvider, useSlideOver } from './components/shared/SlideOverContext';
import { ToastProvider } from './components/shared/Toast';
import { DevModeProvider, useDevMode } from './components/shared/DevModeContext';
import SlideOver, { SlideOverHeader } from './components/shared/SlideOver';
import CommandPalette from './components/shared/CommandPalette';
import PropertyDetail from './pages/PropertyDetail';
import ContactDetail from './pages/ContactDetail';
import CompanyDetail from './pages/CompanyDetail';
import DealDetail from './pages/DealDetail';
import InteractionDetail from './pages/InteractionDetail';
import ActionItemDetail from './pages/ActionItemDetail';
import CompDetail from './pages/CompDetail';
import CampaignDetail from './pages/CampaignDetail';

const DETAIL_COMPONENTS = {
  property: PropertyDetail,
  contact: ContactDetail,
  company: CompanyDetail,
  deal: DealDetail,
  interaction: InteractionDetail,
  action_item: ActionItemDetail,
  campaign: CampaignDetail,
  lease_comp: CompDetail,
  sale_comp: CompDetail,
};

function SlideOverRenderer() {
  const { stack, close } = useSlideOver();
  return stack.map((item, idx) => {
    const DetailComponent = DETAIL_COMPONENTS[item.entityType];
    if (!DetailComponent) return null;
    return (
      <SlideOver key={`${item.entityType}-${item.entityId}-${idx}`} onClose={close} level={idx}>
        <Suspense fallback={<div className="p-6 text-crm-muted text-sm">Loading...</div>}>
          <DetailComponent id={item.entityId} onClose={close} isSlideOver />
        </Suspense>
      </SlideOver>
    );
  });
}

function AppShell() {
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [currentTable, setCurrentTable] = useState('properties');
  const [rowCount, setRowCount] = useState(0);
  const { devMode } = useDevMode();
  const { hasAnyPanel } = useSlideOver();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useKeyboardShortcuts({
    onNewRecord: () => { /* wired in Task 7 */ },
    onFocusSearch: () => { /* wired in Task 7 */ },
    onOpenCommandPalette: () => setCommandPaletteOpen(prev => !prev),
    onDeleteSelected: () => { /* wired in Task 7 */ },
  });

  return (
    <div className={`flex h-screen bg-crm-bg text-crm-text overflow-hidden ${devMode ? 'dev-mode' : ''}`}>
      {/* Titlebar drag region */}
      <div className="drag-region fixed top-0 left-0 right-0 h-8 z-50" />

      {/* Left Sidebar */}
      <Sidebar onTableChange={setCurrentTable} />

      {/* Main Content */}
      <main className={`flex-1 pt-8 overflow-hidden transition-all duration-200 ${claudeOpen ? 'mr-[420px]' : ''}`}>
        <Routes>
          <Route path="/" element={<Properties onCountChange={setRowCount} />} />
          <Route path="/properties" element={<Properties onCountChange={setRowCount} />} />
          <Route path="/contacts" element={<Contacts onCountChange={setRowCount} />} />
          <Route path="/companies" element={<Companies onCountChange={setRowCount} />} />
          <Route path="/deals" element={<Deals onCountChange={setRowCount} />} />
          <Route path="/interactions" element={<Interactions onCountChange={setRowCount} />} />
          <Route path="/campaigns" element={<Campaigns onCountChange={setRowCount} />} />
          <Route path="/action-items" element={<ActionItems onCountChange={setRowCount} />} />
          <Route path="/comps" element={<Comps onCountChange={setRowCount} />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Claude AI Panel */}
      <ClaudePanel
        isOpen={claudeOpen}
        onToggle={() => setClaudeOpen(!claudeOpen)}
        currentTable={currentTable}
        rowCount={rowCount}
        hasAnyPanel={hasAnyPanel}
      />

      {/* Nested SlideOver panels */}
      <SlideOverRenderer />

      {/* Command Palette */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Toggle button when panel is closed — rendered AFTER SlideOver so it sits on top */}
      {!claudeOpen && (
        <button
          onClick={(e) => { e.stopPropagation(); setClaudeOpen(true); }}
          className={`fixed bottom-4 z-[45] bg-crm-accent hover:bg-crm-accent-hover text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all duration-200 ${hasAnyPanel ? 'right-[540px]' : 'right-4'}`}
          title="Open Claude"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router future={routerFutureFlags}>
      <DevModeProvider>
      <ToastProvider>
        <SlideOverProvider>
          <AppShell />
        </SlideOverProvider>
      </ToastProvider>
      </DevModeProvider>
    </Router>
  );
}

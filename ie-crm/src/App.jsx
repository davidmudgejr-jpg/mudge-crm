import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';

// Opt into React Router v7 future flags to silence warnings
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
import Sidebar from './components/Sidebar';
// ClaudePanel removed — Houston Direct in TeamChat replaces it
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
import TPE from './pages/TPE';
import TPEEnrichment from './pages/TPEEnrichment';
import AIOps from './pages/AIOps';
import VerificationQueue from './pages/VerificationQueue';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { SlideOverProvider, useSlideOver } from './components/shared/SlideOverContext';
import { ToastProvider } from './components/shared/Toast';
import { DevModeProvider, useDevMode } from './components/shared/DevModeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import SlideOver, { SlideOverHeader } from './components/shared/SlideOver';
import CommandPalette from './components/shared/CommandPalette';
import TeamChat, { ChatToggleButton } from './components/TeamChat';
import { fetchUnreadCount } from './hooks/useChat';
import PropertyDetail from './pages/PropertyDetail';
import ContactDetail from './pages/ContactDetail';
import CompanyDetail from './pages/CompanyDetail';
import DealDetail from './pages/DealDetail';
import InteractionDetail from './pages/InteractionDetail';
import ActionItemDetail from './pages/ActionItemDetail';
import CompDetail from './pages/CompDetail';
import CampaignDetail from './pages/CampaignDetail';
import MobileChat from './pages/MobileChat';
import DesktopChat from './pages/DesktopChat';

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
  // Claude panel removed — Houston Direct in TeamChat replaces it
  const [currentTable, setCurrentTable] = useState('properties');
  const [rowCount, setRowCount] = useState(0);
  const { devMode } = useDevMode();
  const { hasAnyPanel } = useSlideOver();
  const { user } = useAuth();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  // Poll unread chat count when chat is closed
  useEffect(() => {
    if (!user?.user_id || chatOpen) { setChatUnread(0); return; }
    const poll = async () => {
      try {
        const { unread } = await fetchUnreadCount(user.user_id);
        setChatUnread(unread);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [user?.user_id, chatOpen]);

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
      <main className="flex-1 pt-8 overflow-hidden">
        <Routes>
          <Route path="/" element={<Properties onCountChange={setRowCount} />} />
          <Route path="/properties" element={<Properties onCountChange={setRowCount} />} />
          <Route path="/contacts" element={<Contacts onCountChange={setRowCount} />} />
          <Route path="/companies" element={<Companies onCountChange={setRowCount} />} />
          <Route path="/deals" element={<Deals onCountChange={setRowCount} />} />
          <Route path="/tpe" element={<TPE onCountChange={setRowCount} />} />
          <Route path="/tpe-enrichment" element={<TPEEnrichment />} />
          <Route path="/verification" element={<VerificationQueue />} />
          <Route path="/interactions" element={<Interactions onCountChange={setRowCount} />} />
          <Route path="/campaigns" element={<Campaigns onCountChange={setRowCount} />} />
          <Route path="/action-items" element={<ActionItems onCountChange={setRowCount} />} />
          <Route path="/comps" element={<Comps onCountChange={setRowCount} />} />
          <Route path="/ai-ops" element={<AIOps />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Claude Panel removed — Houston Direct in TeamChat replaces it */}

      {/* Nested SlideOver panels */}
      <SlideOverRenderer />

      {/* Command Palette */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      {/* Team Chat */}
      <TeamChat isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      {!chatOpen && <ChatToggleButton onClick={() => setChatOpen(true)} unreadCount={chatUnread} />}

      {/* Claude toggle button removed — Houston is in the Team Chat widget */}
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-crm-bg flex items-center justify-center">
        <div className="text-crm-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <DevModeProvider>
      <ToastProvider>
        <SlideOverProvider>
          <Routes>
            <Route path="/chat" element={<MobileChat />} />
            <Route path="/houston" element={<DesktopChat />} />
            <Route path="*" element={<AppShell />} />
          </Routes>
        </SlideOverProvider>
      </ToastProvider>
    </DevModeProvider>
  );
}

// ============================================================
// ERROR BOUNDARY — prevents white screen on render errors
// ============================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-crm-bg flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4">&#x26A0;&#xFE0F;</div>
            <h1 className="text-xl font-semibold text-crm-text mb-2">Something went wrong</h1>
            <p className="text-sm text-crm-muted mb-6">
              Houston hit a snag. Try refreshing — if it keeps happening, let David know.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-6 py-2.5 bg-crm-accent text-white rounded-lg text-sm font-medium hover:bg-crm-accent-hover transition-colors"
            >
              Refresh App
            </button>
            <p className="text-[10px] text-crm-muted/40 mt-4 font-mono">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router future={routerFutureFlags}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

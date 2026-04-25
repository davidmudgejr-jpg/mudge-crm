import React, { useState, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';

// Opt into React Router v7 future flags to silence warnings
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
import Sidebar from './components/Sidebar';

// Lazy-loaded page routes — each becomes its own chunk, loaded on demand
const Properties = lazy(() => import('./pages/Properties'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Companies = lazy(() => import('./pages/Companies'));
const Deals = lazy(() => import('./pages/Deals'));
const Interactions = lazy(() => import('./pages/Interactions'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const ActionItems = lazy(() => import('./pages/ActionItems'));
const Comps = lazy(() => import('./pages/Comps'));
const Import = lazy(() => import('./pages/Import'));
const Settings = lazy(() => import('./pages/Settings'));
const TPE = lazy(() => import('./pages/TPE'));
const TPEEnrichment = lazy(() => import('./pages/TPEEnrichment'));
const VerificationQueue = lazy(() => import('./pages/VerificationQueue'));
const DedupReview = lazy(() => import('./pages/DedupReview'));
const Contracts = lazy(() => import('./pages/Contracts'));
const ContractEditor = lazy(() => import('./pages/ContractEditor'));
const Knowledge = lazy(() => import('./pages/Knowledge'));

// Lazy-loaded detail panels (only rendered inside slide-overs)
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const DealDetail = lazy(() => import('./pages/DealDetail'));
const InteractionDetail = lazy(() => import('./pages/InteractionDetail'));
const ActionItemDetail = lazy(() => import('./pages/ActionItemDetail'));
const CompDetail = lazy(() => import('./pages/CompDetail'));
const CampaignDetail = lazy(() => import('./pages/CampaignDetail'));

// Eagerly loaded (always needed)
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { SlideOverProvider, useSlideOver } from './components/shared/SlideOverContext';
import { ToastProvider } from './components/shared/Toast';
import { DevModeProvider, useDevMode } from './components/shared/DevModeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import SlideOver, { SlideOverHeader } from './components/shared/SlideOver';
import CommandPalette from './components/shared/CommandPalette';

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
    <div className={`flex h-screen bg-crm-bg text-crm-text overflow-hidden ${devMode ? 'light-mode' : ''}`}>
      {/* Titlebar drag region */}
      <div className="drag-region fixed top-0 left-0 right-0 h-8 z-50" />

      {/* Left Sidebar */}
      <Sidebar onTableChange={setCurrentTable} />

      {/* Main Content */}
      <main className="flex-1 pt-8 overflow-hidden">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-crm-muted text-sm">Loading...</div></div>}>
          <Routes>
            <Route path="/" element={<Properties onCountChange={setRowCount} />} />
            <Route path="/properties" element={<Properties onCountChange={setRowCount} />} />
            <Route path="/contacts" element={<Contacts onCountChange={setRowCount} />} />
            <Route path="/companies" element={<Companies onCountChange={setRowCount} />} />
            <Route path="/deals" element={<Deals onCountChange={setRowCount} />} />
            <Route path="/tpe" element={<TPE onCountChange={setRowCount} />} />
            <Route path="/tpe-enrichment" element={<TPEEnrichment />} />
            <Route path="/verification" element={<VerificationQueue onCountChange={setRowCount} />} />
            <Route path="/interactions" element={<Interactions onCountChange={setRowCount} />} />
            <Route path="/campaigns" element={<Campaigns onCountChange={setRowCount} />} />
            <Route path="/action-items" element={<ActionItems onCountChange={setRowCount} />} />
            <Route path="/comps" element={<Comps onCountChange={setRowCount} />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/import" element={<Import />} />
            <Route path="/dedup" element={<DedupReview onCountChange={setRowCount} />} />
            <Route path="/contracts" element={<Contracts onCountChange={setRowCount} />} />
            <Route path="/contracts/:packageId" element={<ContractEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </main>

      {/* Nested SlideOver panels */}
      <SlideOverRenderer />

      {/* Command Palette */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
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
              The app hit a snag. Try refreshing. If it keeps happening, let David know.
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

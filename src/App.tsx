import React, { useState, useEffect, useCallback } from 'react';
import { Radio, ArrowLeft, XCircle, Loader2, Menu, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAppStore } from './store';
import { TagsInfiniteListView } from './TagsInfiniteListView';
import { DebugView } from './DebugView';
import { Modal } from './Modal';
import { NavigationDrawer } from './NavigationDrawer';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';
import { DataSchemaModal } from './DataSchemaModal';
import { SearchModal } from './SearchModal';
import { usePWAUpdate } from './usePWAUpdate';
import { ToastProvider, useToast } from './toast';

function AppContent() {
  const store = useAppStore();
  const { showSuccess, showWarning, showInfo, showNFCError } = useToast();
  // Auto-activates ServiceWorker updates seamlessly in background
  usePWAUpdate();

  // Helper to parse initial route from URL (supports #/debug, /debug, etc.)
  const getRouteFromUrl = (): 'tags' | 'debug' => {
    if (typeof window === 'undefined') return 'tags';
    const hash = window.location.hash.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    if (hash.includes('debug') || pathname === '/debug' || pathname.endsWith('/debug')) {
      return 'debug';
    }
    return 'tags';
  };

  const [activeTab, setActiveTab] = useState<'tags' | 'debug'>(getRouteFromUrl);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDataSchemaOpen, setIsDataSchemaOpen] = useState(false);

  // Sync navigation with URL hash & browser history
  const navigateTo = useCallback((tab: 'tags' | 'debug') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const targetHash = tab === 'debug' ? '#/debug' : '#/tags';
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  }, []);

  // Listen to browser Back / Forward and manual URL hash edits
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getRouteFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#0F172A] text-slate-200 font-sans overflow-hidden">
      
      {/* Top Header / Menubar - Clean, streamlined and modern */}
      <header className={`flex items-center justify-between px-3 sm:px-4 md:px-5 bg-[#1E293B] border-b border-slate-700/80 flex-shrink-0 z-30 transition-all duration-300 ease-in-out ${
        store.isHeaderVisible
          ? 'h-12 sm:h-13 translate-y-0 opacity-100'
          : '-mt-12 sm:mt-0 h-12 sm:h-13 opacity-0 pointer-events-none sm:opacity-100 sm:pointer-events-auto overflow-hidden sm:overflow-visible'
      }`}>
        {/* Left: Hamburger Menu Button & App Identity */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left hover:bg-slate-800 active:scale-95 transition-all focus:outline-none group cursor-pointer border border-transparent hover:border-slate-700"
            title="メニューを開く (Open Menu)"
            aria-label="Open navigation menu drawer"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-800 group-hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:text-cyan-300 shadow-sm transition-colors">
              <Menu className="w-4 h-4" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
              NFC Connect
            </h1>
          </button>
        </div>

        {/* Right: Search & Primary Scan Action */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search Icon Button */}
          <button
            type="button"
            onClick={() => store.openSearchModal()}
            className={`relative flex items-center justify-center w-8 h-8 rounded-xl transition-all cursor-pointer border ${
              store.searchQuery
                ? 'bg-blue-600/30 text-cyan-300 border-blue-500/50 shadow-sm shadow-blue-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
            }`}
            title={store.searchQuery ? `検索中: "${store.searchQuery}" (クリックで変更/解除)` : 'タグを検索 (Search)'}
            aria-label="Search NFC tags"
          >
            <Search className="w-4 h-4" />
            {store.searchQuery && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full ring-2 ring-slate-900 animate-pulse" />
            )}
          </button>

          {store.isScanning ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-blue-950/90 border border-blue-500/40 rounded-xl text-xs text-blue-300 font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>かざしてください</span>
              </div>
              <button
                onClick={() => store.stopScanning()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-900/40 transition-all cursor-pointer animate-pulse"
                title="Stop NFC Scan"
                aria-label="Stop NFC Scan"
              >
                <XCircle className="w-3.5 h-3.5 text-white" />
                <span>スキャン停止</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-medium text-emerald-400 whitespace-nowrap">
                  Ready
                </span>
              </div>
              <button
                onClick={() => store.startScanning({
                  onSuccess: showSuccess,
                  onWarning: showWarning,
                  onInfo: showInfo,
                  onError: (err) => showNFCError(err, 'read')
                })}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white shadow-md shadow-blue-900/30 transition-all cursor-pointer"
                title="Start NFC Tag Scan"
                aria-label="Start NFC Tag Scan"
              >
                <Radio className="w-3.5 h-3.5 text-cyan-300" />
                <span>スキャン開始</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area - Completely zero padding and full width with no outer margins */}
      <main className="flex-1 overflow-hidden p-0 bg-[#0F172A] w-full">
        {activeTab === 'tags' && (
          <div className="w-full h-full">
            <TagsInfiniteListView 
              store={store} 
            />
          </div>
        )}

        {activeTab === 'debug' && (
          <div className="max-w-4xl mx-auto space-y-4 p-3 sm:p-4 overflow-y-auto h-full">
            {/* Back to Tags button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigateTo('tags')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span>タグ一覧に戻る</span>
              </button>
              <span className="text-xs font-mono text-slate-500">
                Path: <code className="text-cyan-400">#/debug</code>
              </span>
            </div>
            <DebugView store={store} />
          </div>
        )}
      </main>

      {/* QR Code Modal for sharing URL */}
      <Modal isOpen={showQRModal} onClose={() => setShowQRModal(false)} title="アプリ共有 (Share App)">
        <div className="flex flex-col items-center justify-center p-4 text-center">
          <div className="p-4 bg-white rounded-2xl shadow-md mb-4">
            <QRCodeSVG 
              value={typeof window !== 'undefined' ? window.location.href : 'https://example.com'} 
              size={200}
              level="M"
            />
          </div>
          <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
            スマートフォン (Android Chromeなど) のカメラでスキャンして、Web NFC対応環境で開いてください。
          </p>
          <div className="mt-3 font-mono text-[11px] text-cyan-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 break-all select-all">
            {typeof window !== 'undefined' ? window.location.href : ''}
          </div>
        </div>
      </Modal>

      {/* Slide-out Hamburger Menu Drawer */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        onNavigate={navigateTo}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenDataSchema={() => setIsDataSchemaOpen(true)}
        onOpenQRModal={() => setShowQRModal(true)}
        onOpenSearch={() => store.openSearchModal()}
        onSeedSamples={() => store.seedMockTags(20)}
        tagsCount={store.tags.length}
        isScanning={store.isScanning}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={store.isSearchModalOpen}
        onClose={store.closeSearchModal}
        store={store}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        tags={store.tags}
        onOpenSchema={() => setIsDataSchemaOpen(true)}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        localTags={store.tags}
        onCommitImport={store.importTagsRegistry}
        onOpenSchema={() => setIsDataSchemaOpen(true)}
      />

      {/* Data Schema Modal */}
      <DataSchemaModal
        isOpen={isDataSchemaOpen}
        onClose={() => setIsDataSchemaOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

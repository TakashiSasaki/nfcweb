import React, { useEffect } from 'react';
import { 
  X, 
  Radio, 
  Download, 
  Upload, 
  Layers, 
  Bug, 
  ShieldCheck, 
  HardDrive, 
  Sparkles,
  ChevronRight,
  Menu,
  QrCode,
  Clock,
  Info,
  FileCode,
  Search
} from 'lucide-react';
import { APP_VERSION_TAG } from './version';

export interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'tags' | 'debug';
  onNavigate: (tab: 'tags' | 'debug') => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenDataSchema: () => void;
  onOpenQRModal: () => void;
  onOpenSearch?: () => void;
  onSeedSamples?: () => void;
  tagsCount: number;
  isScanning: boolean;
}

export function NavigationDrawer({
  isOpen,
  onClose,
  activeTab,
  onNavigate,
  onOpenExport,
  onOpenImport,
  onOpenDataSchema,
  onOpenQRModal,
  onOpenSearch,
  onSeedSamples,
  tagsCount,
  isScanning
}: NavigationDrawerProps) {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation Menu">
      {/* Scrim / Backdrop with smooth fade */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div 
        className="relative w-80 max-w-[85vw] h-full bg-[#1E293B] border-r border-slate-700/80 shadow-2xl flex flex-col justify-between z-10 transition-transform duration-300 ease-out transform translate-x-0 overflow-y-auto"
      >
        {/* Top Section */}
        <div className="p-4 sm:p-5 space-y-5">
          
          {/* Drawer Header (Sticky top so title and close button remain visible when scrolling) */}
          <div className="sticky top-0 z-20 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 px-4 sm:px-5 py-3.5 bg-[#1E293B]/95 backdrop-blur-md border-b border-slate-700/80 flex items-center justify-between shadow-md shadow-black/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/25 flex-shrink-0">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-bold text-base tracking-tight text-white truncate">
                    NFC Connect
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-blue-500/30">
                    {APP_VERSION_TAG}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">Menu & Navigation</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 shadow-sm transition-colors cursor-pointer flex-shrink-0"
              aria-label="Close navigation menu"
              title="Close Menu"
            >
              <X className="w-5 h-5 text-slate-300 hover:text-white transition-colors" />
            </button>
          </div>

          {/* Navigation Views */}
          <div className="space-y-1">
            <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase px-3 py-1">
              Views
            </div>

            <button
              type="button"
              onClick={() => {
                onNavigate('tags');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'tags'
                  ? 'bg-blue-600/20 text-cyan-300 font-semibold border border-blue-500/40 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers className={`w-4 h-4 ${activeTab === 'tags' ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>Tags</span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                {tagsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate('debug');
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'debug'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Bug className={`w-4 h-4 ${activeTab === 'debug' ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>Debug Log</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">#/debug</span>
            </button>

            {onOpenSearch && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSearch();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Search className="w-4 h-4 text-cyan-400" />
                  <span>Search</span>
                </div>
              </button>
            )}
          </div>

          {/* Data Management Section */}
          <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                Data Management
              </span>
              <span className="text-[10px] text-emerald-400/90 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                v1
              </span>
            </div>

            {/* Export Entry */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExport();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer group border border-transparent hover:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform flex-shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div className="text-left min-w-0">
                  <div className="truncate text-white font-medium">
                    Export
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">Export Registry (Canonical v1 JSON)</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </button>

            {/* Import Entry */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenImport();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer group border border-transparent hover:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform flex-shrink-0">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-left min-w-0">
                  <div className="truncate text-white font-medium">
                    Import
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">Restore backup (Merge / Replace)</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </button>

            {/* Data Schema Entry */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDataSchema();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer group border border-transparent hover:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform flex-shrink-0">
                  <FileCode className="w-4 h-4" />
                </div>
                <div className="text-left min-w-0">
                  <div className="truncate text-white font-medium">
                    Data Schema
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">JSON Schema (Draft 2020-12) Spec</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </button>
          </div>

          {/* Tools & Sharing Section */}
          <div className="space-y-1.5 pt-2 border-t border-slate-700/60">
            <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase px-3 py-1">
              Tools & Share
            </div>

            {/* QR Code Share Button */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenQRModal();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer group border border-transparent hover:border-slate-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform flex-shrink-0">
                  <QrCode className="w-4 h-4" />
                </div>
                <div className="text-left min-w-0">
                  <div className="truncate text-white font-medium">
                    Share App (QR)
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">Share URL with other devices</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
            </button>

            {/* Seed Sample Tags (if provided) */}
            {onSeedSamples && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSeedSamples();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800/80 hover:text-white transition-all cursor-pointer group border border-transparent hover:border-slate-700"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform flex-shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="truncate text-white font-medium">
                      Generate Sample Tags
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">Populate 20 demo tags</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0" />
              </button>
            )}
          </div>

          {/* Quick Hardware & Storage Status */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Device & Storage Status</span>
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                isScanning ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {isScanning ? 'SCANNING' : 'STANDBY'}
              </span>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Registered Tags:</span>
                <span className="font-mono text-slate-200 font-semibold">{tagsCount} tags</span>
              </div>
              <div className="flex justify-between">
                <span>UID Protection:</span>
                <span className="text-emerald-400 font-medium">Enabled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Bottom Footer */}
        <div className="p-4 border-t border-slate-700/70 bg-slate-900/60 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Web NFC Inspector</span>
            </span>
            <span className="font-mono text-[11px] text-cyan-300">{APP_VERSION_TAG}</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Open or close this navigation menu anytime using the top-left menu icon.
          </p>
        </div>
      </div>
    </div>
  );
}

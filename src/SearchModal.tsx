import React, { useEffect, useRef } from 'react';
import { Search, X, Sparkles, Tag as TagIcon, ArrowRight } from 'lucide-react';
import { AppStore } from './store';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: AppStore;
}

const QUICK_SEARCH_PRESETS = [
  { label: 'URL', query: 'url' },
  { label: 'テキスト', query: 'text' },
  { label: 'vCard', query: 'vcard' },
  { label: 'Wi-Fi', query: 'wifi' },
  { label: 'NTAG215', query: 'ntag215' },
  { label: 'NTAG213', query: 'ntag213' },
  { label: 'MIFARE', query: 'mifare' },
  { label: 'Asset', query: 'asset' }
];

export function SearchModal({ isOpen, onClose, store }: SearchModalProps) {
  const { searchQuery, setSearchQuery, tags } = store;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Global Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate matching tags
  const q = searchQuery.trim().toLowerCase();
  const matchedCount = q
    ? tags.filter(t => {
        if (t.uid.toLowerCase().includes(q)) return true;
        if (t.name && t.name.toLowerCase().includes(q)) return true;
        if (t.notes && t.notes.toLowerCase().includes(q)) return true;
        if (t.tagType && t.tagType.toLowerCase().includes(q)) return true;
        if (t.records && t.records.some(r => r.data && r.data.toLowerCase().includes(q))) return true;
        return false;
      }).length
    : tags.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#1E293B] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-700 bg-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <Search className="w-4 h-4 text-cyan-400" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Search Tags
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-slate-300">
          
          {/* Main Search Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              キーワード / UID / データ内容
            </label>
            <div className="relative w-full">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="UID、タグ名、NDEFデータ、チップ種別..."
                className="w-full bg-slate-950 border border-slate-700/90 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                  title="検索ワードをクリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Real-time Match Stats */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900/70 border border-slate-800 rounded-xl text-xs">
            <span className="text-slate-400">
              検索結果:
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`font-bold font-mono ${matchedCount > 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                {matchedCount}
              </span>
              <span className="text-slate-500 font-mono">
                / {tags.length} 件
              </span>
            </div>
          </div>

          {/* Quick Keyword Preset Chips */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>クイック絞り込みキーワード:</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SEARCH_PRESETS.map(preset => {
                const isActive = searchQuery.toLowerCase() === preset.query;
                return (
                  <button
                    key={preset.query}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setSearchQuery('');
                      } else {
                        setSearchQuery(preset.query);
                      }
                      inputRef.current?.focus();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/10 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Helpful Tips */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <TagIcon className="w-3 h-3 text-blue-400" />
              <span>検索のヒント:</span>
            </div>
            <p className="leading-relaxed">
              UIDの一部（例: <code className="text-cyan-300">04:a1</code>）、メモ内容、書き込んだURLやJSONテキストなどでリアルタイムに該当タグを絞り込めます。
            </p>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-t border-slate-700 bg-slate-800/40">
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                onClose();
              }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
            >
              検索を解除
            </button>
          ) : (
            <span className="text-xs text-slate-500">
              Enter または 完了 で閉じる
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-900/30 transition-all cursor-pointer ml-auto"
          >
            <span>完了</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}

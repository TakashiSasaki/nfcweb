import React, { useState, useRef, useEffect } from 'react';
import { Filter, Check, Sparkles, Layers, FileText, Ban, ChevronDown } from 'lucide-react';
import { AppStore } from './store';

interface FilterDropdownProps {
  store: AppStore;
}

export function FilterDropdown({ store }: FilterDropdownProps) {
  const { recordFilter, setRecordFilter, tags, seedMockTags } = store;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Counts for each filter
  const totalCount = tags.length;
  const multiCount = tags.filter((t: any) => t.records && t.records.length > 1).length;
  const singleCount = tags.filter((t: any) => t.records && t.records.length === 1).length;
  const emptyCount = tags.filter((t: any) => !t.records || t.records.length === 0 || !t.hasNdef).length;

  const isFiltered = recordFilter !== 'all';

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const options: Array<{
    id: 'all' | 'multi' | 'single' | 'empty';
    label: string;
    sublabel: string;
    count: number;
    icon: React.ReactNode;
  }> = [
    {
      id: 'all',
      label: 'すべてのタグ',
      sublabel: 'All Tags',
      count: totalCount,
      icon: <Layers className="w-3.5 h-3.5 text-blue-400" />
    },
    {
      id: 'multi',
      label: '複数レコード',
      sublabel: 'Multi-Record',
      count: multiCount,
      icon: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
    },
    {
      id: 'single',
      label: '単一レコード',
      sublabel: 'Single Record',
      count: singleCount,
      icon: <FileText className="w-3.5 h-3.5 text-indigo-400" />
    },
    {
      id: 'empty',
      label: '空 / IDのみ',
      sublabel: 'ID-Only / Empty',
      count: emptyCount,
      icon: <Ban className="w-3.5 h-3.5 text-slate-400" />
    }
  ];

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative flex items-center justify-center gap-1 w-7 h-7 sm:w-auto sm:px-2.5 sm:py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-sm ${
          isFiltered
            ? 'bg-blue-600/30 text-cyan-300 border-cyan-500/60 shadow-cyan-500/20 ring-1 ring-cyan-400/40'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
        }`}
        title="表示フィルター (Filter Tags)"
        aria-label="Filter Tags"
        aria-expanded={isOpen}
      >
        <Filter className={`w-3.5 h-3.5 ${isFiltered ? 'text-cyan-300' : 'text-slate-300'}`} />
        <span className="hidden sm:inline font-medium">
          {isFiltered ? options.find(o => o.id === recordFilter)?.sublabel : 'Filter'}
        </span>
        <ChevronDown className="hidden sm:inline w-3 h-3 text-slate-400" />
        {isFiltered && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full ring-2 ring-slate-900 animate-pulse" />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-60 sm:w-64 bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden py-1.5 animate-scale-in">
          <div className="px-3.5 py-2 border-b border-slate-700/80 bg-slate-800/50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 tracking-wider">
              タグ絞り込み
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => {
                  setRecordFilter('all');
                  setIsOpen(false);
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
              >
                リセット
              </button>
            )}
          </div>

          <div className="p-1 space-y-0.5">
            {options.map(opt => {
              const isSelected = recordFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRecordFilter(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/20 text-cyan-300 font-bold border border-blue-500/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex-shrink-0">{opt.icon}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{opt.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{opt.sublabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="px-1.5 py-0.5 bg-slate-900/80 border border-slate-700/70 rounded-md font-mono text-[10px] text-slate-400">
                      {opt.count}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sample Data action if empty */}
          {tags.length === 0 && (
            <div className="p-2 border-t border-slate-700/80 bg-slate-900/40">
              <button
                type="button"
                onClick={() => {
                  seedMockTags(20);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>サンプルデータを読み込む</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { 
  Tag, 
  Copy, 
  Check, 
  Edit3, 
  Clock, 
  Globe, 
  FileCode, 
  Type, 
  Sparkles, 
  HardDrive, 
  Cpu, 
  PenTool, 
  Trash2, 
  Eye, 
  RotateCw, 
  Layers, 
  ShieldCheck, 
  ArrowRight, 
  Radio,
  ScanLine
} from 'lucide-react';
import { NFCTagItem } from './types';
import { analyzeNTAGCapacity } from './store';
import { renderControlCharContent, ControlCharViewer, analyzeControlChars } from './ControlCharViewer';

export interface TagCardItemProps {
  key?: React.Key;
  tag: NFCTagItem;
  copiedUid: string | null;
  onCopyUid: (uid: string, e?: React.MouseEvent) => void;
  editingNameUid: string | null;
  tempName: string;
  onSetTempName: (name: string) => void;
  onStartEditName: (tag: NFCTagItem, e?: React.MouseEvent) => void;
  onSaveName: (uid: string) => void;
  onOpenSafeWrite: (tag: NFCTagItem) => void;
  onOpenSafeErase: (tag: NFCTagItem) => void;
  onDeleteTag: (uid: string) => void;
  onShowInfo: (title: string, message: string) => void;
}

export function TagCardItem({
  tag,
  copiedUid,
  onCopyUid,
  editingNameUid,
  tempName,
  onSetTempName,
  onStartEditName,
  onSaveName,
  onOpenSafeWrite,
  onOpenSafeErase,
  onDeleteTag,
  onShowInfo
}: TagCardItemProps) {
  // Mobile side: 'front' (表面) or 'back' (裏面)
  const [mobileSide, setMobileSide] = useState<'front' | 'back'>('front');

  // Swipe gesture tracking for mobile (touch + mouse drag fallback for desktop mobile mode)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mouseStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Trigger if horizontal movement is greater than vertical and exceeds 35px threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
      if (deltaX < 0) {
        // Swiped left -> Switch to Back
        setMobileSide('back');
      } else {
        // Swiped right -> Switch to Front
        setMobileSide('front');
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) return;
    mouseStartX.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (mouseStartX.current === null) return;
    const deltaX = e.clientX - mouseStartX.current;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        setMobileSide('back');
      } else {
        setMobileSide('front');
      }
    }
    mouseStartX.current = null;
  };

  const isEditingThis = editingNameUid === tag.uid;
  const hasRecords = tag.records && tag.records.length > 0;
  const capacity = analyzeNTAGCapacity(tag.records || []);

  // FRONT VIEW COMPONENT (表面: Material 3 スマートカード表面)
  const renderFrontSide = (isDesktopPane = false) => (
    <div className={`flex flex-col justify-between h-full space-y-3.5 ${isDesktopPane ? '' : 'p-4 sm:p-5'}`}>
      <div>
        {/* Top Physical Card Header: IC Chip Emblem + Contactless Wave Icon */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            {/* Contactless Smart Card Gold-tone Chip Emblem */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono tracking-wider font-semibold shadow-inner">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>IC CHIP</span>
            </div>

            {/* Editable Custom Tag Name */}
            {isEditingThis ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={tempName}
                  onChange={e => onSetTempName(e.target.value)}
                  autoFocus
                  placeholder="Tag nickname..."
                  onKeyDown={e => e.key === 'Enter' && onSaveName(tag.uid)}
                  className="bg-slate-950 border border-sky-400 rounded-full px-2.5 py-0.5 text-xs text-white focus:outline-none shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => onSaveName(tag.uid)}
                  className="px-2.5 py-0.5 bg-sky-400 text-slate-950 rounded-full text-[10px] font-bold shadow hover:bg-sky-300 transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => onStartEditName(tag, e)}
                className="text-sm font-semibold text-slate-100 hover:text-sky-300 flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-slate-800/80 transition-all max-w-[180px] truncate group/name cursor-pointer"
                title="Click to rename tag"
              >
                <span className="truncate">{tag.name || 'Unnamed NFC Card'}</span>
                <Edit3 className="w-3 h-3 text-slate-500 group-hover/name:text-sky-400 flex-shrink-0 transition-colors" />
              </button>
            )}
          </div>

          {/* Contactless Wave Emblem (Physical Card Feature) */}
          <div className="flex items-center gap-1 text-slate-400/90" title="Contactless NFC Standard">
            <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 hidden sm:inline">NFC</span>
          </div>
        </div>

        {/* UID Pill (M3 Assist Chip) + Metadata Chips */}
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* UID M3 Assist Chip */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-cyan-500/35 px-2.5 py-1 rounded-full shadow-sm">
              <Tag className="w-3 h-3 text-cyan-400 flex-shrink-0" />
              <span className="font-mono text-xs font-bold text-cyan-200 select-all tracking-wider">
                {tag.uid}
              </span>
              <button
                type="button"
                onClick={(e) => onCopyUid(tag.uid, e)}
                className="ml-0.5 p-0.5 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
                title="Copy UID"
                aria-label="Copy UID"
              >
                {copiedUid === tag.uid ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* Tag Type Badge */}
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700 font-medium">
              {tag.tagType || 'NFC Type 2'}
            </span>

            {/* Sample Badge */}
            {tag.isSample && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono font-medium">
                Sample
              </span>
            )}

            {/* Memory Capacity Badge */}
            <span 
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-semibold border flex items-center gap-1 ${
                !hasRecords ? 'bg-slate-800 text-slate-400 border-slate-700' :
                capacity.badgeColor === 'emerald' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                capacity.badgeColor === 'amber' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                capacity.badgeColor === 'blue' ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
                'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
              title={hasRecords ? `${capacity.bytes} Bytes - ${capacity.detailDescription}` : 'No NDEF payload (0 Bytes)'}
            >
              <span>{hasRecords ? `${capacity.bytes}B` : '0B'}</span>
            </span>
          </div>

          {/* Read Timestamp */}
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
            <Clock className="w-3 h-3 text-emerald-400/90" />
            <span>{new Date(tag.lastRead).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>

        {/* Middle Card Body: Surface Container with NDEF glance */}
        <div className="mt-3.5 p-3 rounded-2xl bg-slate-900/85 border border-slate-800/90 shadow-inner">
          {hasRecords ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-200 font-medium">
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  <span>NDEF Payload: <strong className="text-white font-semibold">{tag.records.length} レコード</strong></span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {capacity.recommendedChip} 推奨
                </span>
              </div>

              {/* Quick 1st record snippet */}
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mb-1">
                  <span className="flex items-center gap-1 text-sky-400 font-semibold uppercase">
                    {tag.records[0].recordType === 'url' ? <Globe className="w-3 h-3" /> :
                     tag.records[0].recordType === 'mime' ? <FileCode className="w-3 h-3" /> :
                     <Type className="w-3 h-3" />}
                    <span>{tag.records[0].recordType} #1</span>
                  </span>
                  {tag.records.length > 1 && (
                    <span className="text-[9px] text-slate-500 font-mono">ほか {tag.records.length - 1} 件あり</span>
                  )}
                </div>
                <p className="text-slate-200 font-mono text-xs break-all line-clamp-1 select-all">
                  {tag.records[0].data ? renderControlCharContent(tag.records[0].data) : <span className="text-slate-500 italic">&lt;Empty payload&gt;</span>}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic py-1.5 px-2 flex items-center justify-between">
              <span>NDEFレコードなし (UIDのみ認識)</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                Empty
              </span>
            </div>
          )}
        </div>
      </div>

      {/* M3 Card Action Row: Filled Primary Button, Tonal Destructive, and Icon Button */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          {/* M3 Filled Button (Write / Edit) */}
          <button
            type="button"
            onClick={() => onOpenSafeWrite(tag)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-sky-400 hover:bg-sky-300 active:bg-sky-500 text-slate-950 rounded-full text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer group/write"
            title={`Write / Edit Records (UID: ${tag.uid})`}
            aria-label={`Write or edit records for tag ${tag.uid}`}
          >
            <PenTool className="w-3.5 h-3.5 text-slate-950 group-hover/write:rotate-12 transition-transform" />
            <span>Write (書込)</span>
          </button>

          {/* M3 Tonal Destructive Button (Safe Erase) */}
          <button
            type="button"
            onClick={() => onOpenSafeErase(tag)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/30 text-rose-300 hover:text-rose-100 rounded-full text-xs font-semibold border border-rose-500/30 transition-all active:scale-95 cursor-pointer group/erase"
            title={`Safe Erase (UID: ${tag.uid})`}
            aria-label={`Erase records for tag ${tag.uid}`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover/erase:scale-110 transition-transform" />
            <span>Erase (消去)</span>
          </button>
        </div>

        {/* M3 Standard Icon Button (Delete from registry) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteTag(tag.uid);
              onShowInfo('Tag Removed', `Card [${tag.uid}] removed from list.`);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 active:scale-90 transition-all cursor-pointer"
            title="Remove this card from local registry"
            aria-label="Remove card"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Flip Indicator Pill Button */}
          {!isDesktopPane && (
            <button
              type="button"
              onClick={() => setMobileSide('back')}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold transition-all border border-slate-700 active:scale-95 cursor-pointer ml-1"
            >
              <RotateCw className="w-3 h-3" />
              <span>裏面 (詳細)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // BACK VIEW COMPONENT (裏面: Material 3 透視・X-Rayインスペクター)
  const renderBackSide = (isDesktopPane = false) => (
    <div className={`flex flex-col justify-between h-full space-y-3 ${isDesktopPane ? '' : 'p-4 sm:p-5'}`}>
      <div className="space-y-2.5">
        {/* Back Header: Title, X-Ray indicator, and Back button on mobile */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 shadow-sm">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-cyan-200 tracking-wide">
                  裏面: 透視 X-Ray インスペクター
                </span>
                <span className="text-[9px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full font-mono font-bold">
                  SCHEMATIC
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {tag.uid} • ISO/IEC 14443 Type 2
              </p>
            </div>
          </div>

          {/* Flip back to Front button (mobile only) */}
          {!isDesktopPane && (
            <button
              type="button"
              onClick={() => setMobileSide('front')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer border border-slate-700"
            >
              <RotateCw className="w-3 h-3 text-cyan-400" />
              <span>表面へ戻る</span>
            </button>
          )}
        </div>

        {/* Chip Memory & Capacity Analysis Bar */}
        <div className="bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800 shadow-inner space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>NDEF総容量: <strong className="text-white font-mono">{capacity.bytes} B</strong></span>
            </span>
            <span className={`font-mono font-semibold text-[10px] ${
              capacity.badgeColor === 'emerald' ? 'text-emerald-400' :
              capacity.badgeColor === 'amber' ? 'text-amber-300' :
              capacity.badgeColor === 'blue' ? 'text-sky-300' :
              'text-rose-400'
            }`}>
              {capacity.recommendedChip} ({capacity.detailDescription})
            </span>
          </div>

          {/* M3 Visual Capacity Gauge */}
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/80 p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                capacity.badgeColor === 'emerald' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' :
                capacity.badgeColor === 'amber' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                capacity.badgeColor === 'blue' ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' :
                'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, (capacity.bytes / 888) * 100))}%` }}
            />
          </div>
        </div>

        {/* Detailed NDEF Records List */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {hasRecords ? (
            tag.records.map((rec, rIdx) => {
              const recStats = analyzeControlChars(rec.data || '');
              const isMultiLine = recStats.lineCount > 1 || rec.data.includes('\t') || rec.data.includes('\r');
              return (
                <div 
                  key={rec.id || rIdx} 
                  className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800/90 text-xs space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase">
                    <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                      {rec.recordType === 'url' ? <Globe className="w-3.5 h-3.5" /> :
                       rec.recordType === 'mime' ? <FileCode className="w-3.5 h-3.5" /> :
                       <Type className="w-3.5 h-3.5 text-cyan-400" />}
                      <span>{rec.recordType} Record #{rIdx + 1}</span>
                      {rec.mediaType && <span className="font-mono text-slate-400 lowercase font-normal">({rec.mediaType})</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {recStats.dominantEnding !== 'NONE' && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
                          recStats.dominantEnding === 'CRLF' ? 'bg-purple-950/80 text-purple-300 border-purple-500/40' :
                          recStats.dominantEnding === 'LF' ? 'bg-sky-950/80 text-sky-300 border-sky-500/40' :
                          'bg-amber-950/80 text-amber-300 border-amber-500/40'
                        }`}>
                          {recStats.dominantEnding === 'CRLF' ? `␍␊ CRLF` :
                           recStats.dominantEnding === 'LF' ? `␊ LF` : 'Mixed'}
                        </span>
                      )}
                      {rec.lang && <span className="font-mono text-slate-500 text-[10px]">{rec.lang}</span>}
                    </div>
                  </div>

                  {isMultiLine ? (
                    <ControlCharViewer 
                      text={rec.data || ''} 
                      maxHeight="max-h-28"
                      showControlsBar={true}
                    />
                  ) : (
                    <div className="bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800/80 font-mono text-xs break-all select-all text-slate-200">
                      {renderControlCharContent(rec.data || '')}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-400 italic bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
              このタグにはNDEFペイロードが記録されていません。
            </div>
          )}
        </div>
      </div>

      {/* Back Bottom Bar (Mobile vs Desktop) */}
      {!isDesktopPane ? (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 ring-2 ring-purple-400/30"></span>
            <span className="font-semibold text-purple-300">裏面（詳細）</span>
            <span className="text-slate-500 text-[10px]">（👉 スワイプで表面）</span>
          </div>

          <button
            type="button"
            onClick={() => setMobileSide('front')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
          >
            <RotateCw className="w-3 h-3 text-cyan-400" />
            <span>表面へ戻る</span>
          </button>
        </div>
      ) : (
        <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5 text-cyan-400/90 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>UID 照合安全ロック有効</span>
          </span>
          <span className="text-slate-400 text-[9px] font-mono">
            X-RAY INSPECTION ACTIVE
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="group relative select-none md:select-text"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* 
        ========================================================================
        DESKTOP LAYOUT (md: and above):
        Material 3 Elevated Card Shell (rounded-3xl) with Dual-Pane X-Ray View
        ========================================================================
      */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 bg-[#1B2436] border border-slate-700/60 hover:border-sky-500/50 rounded-3xl p-4 transition-all duration-200 shadow-md shadow-black/30 hover:shadow-xl relative overflow-hidden">
        
        {/* Subtle decorative circuit antenna loop for desktop */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* LEFT PANE: 表面 (Front Card - M3 Surface Container High) */}
        <div className="bg-[#202C42] border border-slate-600/60 rounded-2xl p-4 shadow-sm flex flex-col justify-between relative">
          <div className="absolute top-3 right-3 text-[9px] font-mono px-2 py-0.5 bg-slate-800/90 text-slate-400 rounded-full border border-slate-700/80 font-semibold pointer-events-none">
            表面 / FRONT
          </div>
          {renderFrontSide(true)}
        </div>

        {/* RIGHT PANE: 裏面 (Back Card - M3 X-Ray Inspection Translucent Surface) */}
        <div className="bg-slate-950/70 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-4 shadow-inner relative flex flex-col justify-between overflow-hidden">
          {/* Subtle blueprint grid watermark for X-ray effect */}
          <div className="absolute inset-0 bg-[radial-gradient(#06b6d418_1px,transparent_1px)] [background-size:14px_14px] pointer-events-none" />
          <div className="absolute top-3 right-3 text-[9px] font-mono px-2 py-0.5 bg-cyan-950/90 text-cyan-300 rounded-full border border-cyan-500/40 font-semibold pointer-events-none flex items-center gap-1 z-10">
            <ScanLine className="w-2.5 h-2.5 text-cyan-400" />
            <span>透視 / X-RAY</span>
          </div>
          <div className="relative z-10 h-full flex flex-col justify-between">
            {renderBackSide(true)}
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        MOBILE LAYOUT (< md):
        Material 3 Rounded-3xl Card with Swipe & Flip Gesture
        ========================================================================
      */}
      <div className="block md:hidden bg-[#1B2436] border border-slate-700/60 hover:border-sky-500/50 rounded-3xl shadow-md shadow-black/30 overflow-hidden relative">
        {/* Mobile View Switcher: Animated Side Switch */}
        {mobileSide === 'front' ? (
          <div className="animate-fade-in">
            {renderFrontSide(false)}
          </div>
        ) : (
          <div className="animate-fade-in bg-slate-950/70 backdrop-blur-md relative">
            <div className="absolute inset-0 bg-[radial-gradient(#06b6d415_1px,transparent_1px)] [background-size:14px_14px] pointer-events-none" />
            <div className="relative z-10">
              {renderBackSide(false)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

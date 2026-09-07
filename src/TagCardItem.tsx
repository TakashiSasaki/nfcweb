import React, { useState, useRef, useEffect } from 'react';
import { 
  Tag, 
  Copy, 
  Check, 
  Edit3, 
  Globe, 
  FileCode, 
  Type, 
  PenTool, 
  Trash2, 
  MoreHorizontal, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  AlertTriangle, 
  ExternalLink, 
  Radio, 
  Package,
  Clock,
  HardDrive
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
  /** Optional thumbnail override for future photo support */
  thumbnailUrl?: string;
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
  onShowInfo,
  thumbnailUrl
}: TagCardItemProps) {
  // Progressive disclosure state (technical details accordion)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  // Overflow menu state (⋯ actions)
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  // Thumbnail load error fallback state
  const [imageError, setImageError] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isEditingThis = editingNameUid === tag.uid;
  const hasRecords = Boolean(tag.records && tag.records.length > 0);
  const capacity = analyzeNTAGCapacity(tag.records || []);
  const photo = thumbnailUrl || tag.photoUrl;

  // Clean canonical UID metrics
  const cleanHex = tag.uid.replace(/[:-]/g, '');
  const uidByteCount = Math.round(cleanHex.length / 2);
  const isCopied = copiedUid === tag.uid;

  // Close overflow menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  // Primary record for quick common-case glance
  const primaryRecord = hasRecords ? tag.records[0] : null;

  // Format tech label (e.g. "NTAG213")
  const techLabel = (tag.tagType || 'NFC Type 2').split('/')[0].trim();
  const sizeLabel = hasRecords ? `${capacity.bytes} B` : '0 B';

  return (
    <div 
      className="group relative bg-[#162032] hover:bg-[#1A263B] border border-slate-700/60 hover:border-slate-600/80 rounded-2xl transition-all duration-150 shadow-sm"
      id={`inventory-item-${tag.uid}`}
    >
      {/* 
        ========================================================================
        COMPACT INVENTORY ROW (Always visible, highly scannable)
        ========================================================================
      */}
      <div className="p-3 sm:p-3.5">
        <div className="flex items-start sm:items-center gap-3">
          
          {/* Optional Item Photo Thumbnail with Accessible Fallback */}
          <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-xl overflow-hidden flex-shrink-0 bg-slate-800/80 border border-slate-700/60 shadow-inner flex items-center justify-center select-none">
            {photo && !imageError ? (
              <img
                src={photo}
                alt={tag.name ? `Photo of ${tag.name}` : `Item photo for UID ${tag.uid}`}
                onError={() => setImageError(true)}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              /* Lightweight, quiet fallback (not an oversized broken placeholder) */
              <div 
                className="w-full h-full flex flex-col items-center justify-center text-slate-400/90 group-hover:text-slate-300 transition-colors"
                title={tag.name ? `Item: ${tag.name}` : `UID: ${tag.uid}`}
                aria-label="No photo available"
              >
                {tag.name ? (
                  <span className="font-semibold text-xs sm:text-sm uppercase tracking-wider text-slate-400">
                    {tag.name.trim().slice(0, 2)}
                  </span>
                ) : (
                  <Radio className="w-5 h-5 text-slate-400/80" />
                )}
              </div>
            )}
          </div>

          {/* Core Content Body: Identity, Metadata, and Primary NDEF Glance */}
          <div className="flex-1 min-w-0 space-y-1">
            
            {/* Row 1: Item Name + Exceptional States & Secondary Metadata */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {/* Editable Item Name */}
                {isEditingThis ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={tempName}
                      onChange={e => onSetTempName(e.target.value)}
                      autoFocus
                      placeholder="Item name..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') onSaveName(tag.uid);
                        if (e.key === 'Escape') onStartEditName(tag);
                      }}
                      className="bg-slate-950 border border-sky-400 rounded-lg px-2.5 py-0.5 text-xs text-white focus:outline-none shadow-sm min-w-[140px]"
                    />
                    <button
                      type="button"
                      onClick={() => onSaveName(tag.uid)}
                      className="px-2.5 py-0.5 bg-sky-400 text-slate-950 rounded-lg text-xs font-bold hover:bg-sky-300 transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => onStartEditName(tag, e)}
                    className="text-xs sm:text-sm font-semibold text-slate-100 hover:text-sky-300 flex items-center gap-1.5 transition-colors truncate text-left cursor-pointer group/name focus-visible:ring-1 focus-visible:ring-sky-400 rounded px-1 -ml-1"
                    title="Click to rename item"
                  >
                    <span className="truncate">{tag.name || 'Unnamed Item'}</span>
                    <Edit3 className="w-3 h-3 text-slate-500 group-hover/name:text-sky-400 flex-shrink-0 transition-colors opacity-60 group-hover/name:opacity-100" />
                  </button>
                )}

                {/* Exceptional State: Capacity Exceeded Warning */}
                {capacity.isOverLimit && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Capacity exceeded</span>
                  </span>
                )}

                {/* Quiet Sample Identifier */}
                {tag.isSample && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/80">
                    Sample
                  </span>
                )}
              </div>

              {/* Desktop Quick Secondary Stats (UID & Tech / Size) */}
              <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 flex-shrink-0">
                <div className="flex items-center gap-1 bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-800">
                  <span className="select-all">{tag.uid}</span>
                  <button
                    type="button"
                    onClick={(e) => onCopyUid(tag.uid, e)}
                    className="p-0.5 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                    title="Copy UID"
                    aria-label="Copy UID"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300 font-medium">
                  {techLabel} · {sizeLabel}
                </span>
              </div>
            </div>

            {/* Mobile Secondary Metadata (shown directly below name on small screens) */}
            <div className="flex sm:hidden items-center gap-1.5 text-[11px] font-mono text-slate-400 flex-wrap">
              <span className="select-all text-slate-300">{tag.uid}</span>
              <button
                type="button"
                onClick={(e) => onCopyUid(tag.uid, e)}
                className="p-0.5 text-slate-400 hover:text-white rounded transition-colors"
                title="Copy UID"
                aria-label="Copy UID"
              >
                {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
              <span className="text-slate-600">·</span>
              <span>{techLabel} · {sizeLabel}</span>
            </div>

            {/* Row 2: NDEF Primary Content (Single-record common case optimized) */}
            <div className="pt-0.5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {primaryRecord ? (
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    {/* Record Type Identifier */}
                    <span className="text-[10px] font-semibold tracking-wider text-sky-400/90 uppercase px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-500/20 flex-shrink-0 flex items-center gap-1">
                      {primaryRecord.recordType === 'url' ? <Globe className="w-2.5 h-2.5 text-sky-400" /> :
                       primaryRecord.recordType === 'mime' ? <FileCode className="w-2.5 h-2.5 text-sky-400" /> :
                       <Type className="w-2.5 h-2.5 text-sky-400" />}
                      <span>{primaryRecord.recordType}</span>
                    </span>

                    {/* Primary Payload Display */}
                    {primaryRecord.recordType === 'url' ? (
                      <a
                        href={primaryRecord.data}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-xs text-sky-300/90 hover:text-sky-200 hover:underline truncate select-all"
                        title={primaryRecord.data}
                      >
                        {primaryRecord.data}
                      </a>
                    ) : (
                      <span className="font-mono text-xs text-slate-300 truncate select-all">
                        {primaryRecord.data 
                          ? renderControlCharContent(primaryRecord.data) 
                          : <span className="text-slate-500 italic">&lt;empty&gt;</span>}
                      </span>
                    )}

                    {/* Multi-record Badge (only shown when multiple records exist) */}
                    {tag.records.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-[10px] text-slate-400 hover:text-sky-300 px-1.5 py-0.2 rounded bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 font-mono transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer"
                        title="Click to view all records"
                      >
                        +{tag.records.length - 1} more
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    No NDEF records
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Group: Write (Primary Action) + Details Toggle + Overflow Menu (⋯) */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 self-center">
            
            {/* Primary Action: Write */}
            <button
              type="button"
              onClick={() => onOpenSafeWrite(tag)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 active:bg-sky-500/30 text-sky-300 hover:text-white rounded-lg text-xs font-semibold border border-sky-500/30 transition-all active:scale-95 cursor-pointer"
              title={`Write or edit records for tag ${tag.uid}`}
              aria-label={`Write tag ${tag.uid}`}
            >
              <PenTool className="w-3.5 h-3.5 text-sky-400" />
              <span>Write</span>
            </button>

            {/* Progressive Disclosure Toggle Button */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-controls={`details-${tag.uid}`}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-center ${
                isExpanded 
                  ? 'bg-slate-800 text-sky-300 border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border-transparent'
              }`}
              title={isExpanded ? "Hide details" : "Show technical details"}
              aria-label={isExpanded ? "Hide details" : "Show technical details"}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-sky-400" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {/* Overflow Menu (⋯ for Rename, Details, Destructive Erase, Remove) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isMenuOpen 
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
                title="More actions"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Overflow Menu Dropdown */}
              {isMenuOpen && (
                <div 
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-44 bg-[#0F172A] border border-slate-700/90 rounded-xl shadow-xl shadow-black/60 p-1 z-30 animate-fade-in text-xs font-medium"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      setIsMenuOpen(false);
                      onStartEditName(tag, e);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rename</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      setIsMenuOpen(false);
                      onCopyUid(tag.uid, e);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy UID</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsExpanded(!isExpanded);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isExpanded ? 'Hide details' : 'Tag details'}</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  {/* Destructive Action: Erase Tag */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSafeErase(tag);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Erase</span>
                  </button>

                  {/* Remove from Registry */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDeleteTag(tag.uid);
                      onShowInfo('Item Removed', `Removed [${tag.uid}] from list.`);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Remove from list</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        PROGRESSIVE DISCLOSURE PANEL (Revealed on Demand)
        Structured technical specifications & complete multi-record breakdown
        ========================================================================
      */}
      {isExpanded && (
        <div 
          id={`details-${tag.uid}`}
          className="px-3 sm:px-3.5 pb-3.5 pt-2.5 border-t border-slate-700/60 bg-slate-950/40 rounded-b-2xl space-y-3 animate-fade-in"
        >
          {/* Header row with section title & hide button */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Technical details</span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline cursor-pointer"
            >
              Hide
            </button>
          </div>

          {/* Structured Specification Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">UID</span>
              <span className="font-mono text-slate-200 font-semibold select-all break-all">{tag.uid}</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Technology</span>
              <span className="text-slate-200 font-medium truncate block">{techLabel}</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Protocol</span>
              <span className="text-slate-200 font-medium">ISO/IEC 14443 Type 2</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">UID Length</span>
              <span className="font-mono text-slate-200 font-medium">{uidByteCount} bytes</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">NDEF Memory</span>
              <span className="font-mono text-slate-200 font-medium">{capacity.bytes} / {capacity.recommendedChip === 'NTAG215' ? '504' : capacity.recommendedChip === 'NTAG216' ? '888' : '144'} B</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Records</span>
              <span className="font-mono text-slate-200 font-medium">{tag.records?.length || 0}</span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Last scanned</span>
              <span className="font-mono text-slate-300 text-[11px]">
                {new Date(tag.lastRead).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div className="bg-[#111928] p-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block">Read count</span>
              <span className="font-mono text-slate-200 font-medium">{tag.readCount || 1}</span>
            </div>
          </div>

          {/* Detailed NDEF Records List */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400">
              NDEF Records ({tag.records?.length || 0})
            </div>

            {hasRecords ? (
              tag.records.map((rec, rIdx) => {
                const recStats = analyzeControlChars(rec.data || '');
                const isMultiLine = recStats.lineCount > 1 || rec.data.includes('\t') || rec.data.includes('\r');

                return (
                  <div 
                    key={rec.id || rIdx} 
                    className="p-2.5 rounded-xl bg-[#111928] border border-slate-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5 text-slate-200 font-semibold">
                        {rec.recordType === 'url' ? <Globe className="w-3 h-3 text-sky-400" /> :
                         rec.recordType === 'mime' ? <FileCode className="w-3 h-3 text-sky-400" /> :
                         <Type className="w-3 h-3 text-sky-400" />}
                        <span className="uppercase">{rec.recordType} Record #{rIdx + 1}</span>
                        {rec.mediaType && (
                          <span className="font-mono text-slate-400 lowercase font-normal">
                            ({rec.mediaType})
                          </span>
                        )}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {recStats.dominantEnding !== 'NONE' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                            {recStats.dominantEnding}
                          </span>
                        )}
                        {rec.lang && (
                          <span className="font-mono text-slate-400 text-[10px]">{rec.lang}</span>
                        )}
                      </div>
                    </div>

                    {isMultiLine ? (
                      <ControlCharViewer 
                        text={rec.data || ''} 
                        maxHeight="max-h-36"
                        showControlsBar={true}
                      />
                    ) : (
                      <div className="bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 font-mono text-xs break-all select-all text-slate-200">
                        {renderControlCharContent(rec.data || '')}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-400 italic bg-[#111928] p-2.5 rounded-xl border border-slate-800 text-center">
                No NDEF records present on this tag.
              </div>
            )}
          </div>

          {/* Secondary Actions in Details View */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenSafeErase(tag)}
                className="px-2.5 py-1 rounded-lg text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Erase tag</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onDeleteTag(tag.uid);
                onShowInfo('Item Removed', `Card [${tag.uid}] removed from list.`);
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer text-[11px]"
            >
              Remove from list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

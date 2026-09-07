import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Radio, Search, Trash2, Copy, Check, Tag, Globe, Type, FileCode, Edit3,
  Clock, ChevronDown, ChevronUp, Sparkles, ShieldCheck, HardDrive, Cpu,
  Loader2, AlertTriangle, XCircle, X, Plus, PenTool, Save, Lock, Unlock
} from 'lucide-react';
import { NFCTagItem, EditableNDEFRecord } from './types';
import { analyzeNTAGCapacity, getTagTypeHint, formatNDEFPayloadForNFC, parseRawNDEFToEditable } from './store';
import { normalizeUid } from './domain/uid';
import { useToast } from './toast';
import { renderControlCharContent, ControlCharViewer, analyzeControlChars } from './ControlCharViewer';
import { Modal } from './Modal';
import { TagCardItem } from './TagCardItem';

interface TagsInfiniteListViewProps { store: any; }
const PAGE_SIZE = 25;

export function TagsInfiniteListView({ store }: TagsInfiniteListViewProps) {
  const {
    tags, updateTagName, updateTagPhoto, deleteTag, upsertTag, addLog, seedMockTags,
    searchQuery, setSearchQuery, openSearchModal, isScanning,
    startScanning: storeStartScanning, stopScanning
  } = store;
  const { showSuccess, showWarning, showInfo, showNFCError } = useToast();
  const isWebNFCSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [editingNameUid, setEditingNameUid] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const [safeEraseTarget, setSafeEraseTarget] = useState<NFCTagItem | null>(null);
  const [isErasingActive, setIsErasingActive] = useState<boolean>(false);
  const [eraseStatusMessage, setEraseStatusMessage] = useState<string | null>(null);
  const [eraseErrorWarning, setEraseErrorWarning] = useState<string | null>(null);
  const eraseAbortControllerRef = useRef<AbortController | null>(null);

  const [safeWriteTarget, setSafeWriteTarget] = useState<NFCTagItem | null>(null);
  const [editRecords, setEditRecords] = useState<EditableNDEFRecord[]>([]);
  const [isWritingActive, setIsWritingActive] = useState<boolean>(false);
  const [writeStatusMessage, setWriteStatusMessage] = useState<string | null>(null);
  const [writeErrorWarning, setWriteErrorWarning] = useState<string | null>(null);
  const writeAbortControllerRef = useRef<AbortController | null>(null);

  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    const diff = currentScrollTop - lastScrollTopRef.current;
    if (Math.abs(diff) > 6) {
      if (currentScrollTop > 30 && diff > 0) {
        if (store.isHeaderVisible) store.setIsHeaderVisible(false);
      } else if (diff < 0 || currentScrollTop <= 10) {
        if (!store.isHeaderVisible) store.setIsHeaderVisible(true);
      }
      lastScrollTopRef.current = currentScrollTop;
    }
  }, [store.isHeaderVisible, store.setIsHeaderVisible]);

  const handleStartScanning = () => {
    storeStartScanning({
      onSuccess: showSuccess,
      onWarning: showWarning,
      onInfo: showInfo,
      onError: (err: any) => showNFCError(err, 'read')
    });
  };

  const stopSafeErase = useCallback(() => {
    if (eraseAbortControllerRef.current) {
      eraseAbortControllerRef.current.abort();
      eraseAbortControllerRef.current = null;
    }
    setIsErasingActive(false);
    setEraseStatusMessage(null);
  }, []);

  const openSafeEraseModal = (tag: NFCTagItem) => {
    stopScanning();
    stopSafeWrite();
    stopSafeErase();
    setSafeEraseTarget(tag);
    setEraseErrorWarning(null);
    setEraseStatusMessage(null);
  };

  const closeSafeEraseModal = () => {
    stopSafeErase();
    setSafeEraseTarget(null);
    setEraseErrorWarning(null);
    setEraseStatusMessage(null);
  };

  const executeSafeErase = async () => {
    if (!safeEraseTarget) return;
    if (!isWebNFCSupported) {
      showNFCError(new DOMException('Web NFC is not supported in this browser.', 'NotSupportedError'), 'erase');
      return;
    }

    stopSafeErase();
    setIsErasingActive(true);
    setEraseErrorWarning(null);
    setEraseStatusMessage(`Hold target tag (UID: ${safeEraseTarget.uid}) against your device...`);
    const targetNormalized = normalizeUid(safeEraseTarget.uid);

    try {
      eraseAbortControllerRef.current = new AbortController();
      const signal = eraseAbortControllerRef.current.signal;
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal });

      ndef.onreading = async (event: any) => {
        const scannedSerial = event.serialNumber;
        const scannedNormalized = normalizeUid(scannedSerial);
        if (!scannedSerial || scannedNormalized !== targetNormalized) {
          stopSafeErase();
          const errorMsg = `❌ Erase Blocked: Detected tag UID [${scannedSerial || 'Unknown'}] does not match target [${safeEraseTarget.uid}]. Erase aborted to protect tag data.`;
          setEraseErrorWarning(errorMsg);
          addLog({ action: 'erase', serialNumber: scannedSerial || 'Unknown', messageSummary: `Erase Blocked: UID Mismatch (expected: ${safeEraseTarget.uid}, scanned: ${scannedSerial})`, rawRecords: [] });
          showWarning('Erase Blocked (UID Mismatch)', `Target: ${safeEraseTarget.uid} / Detected: ${scannedSerial || 'Unknown'}`);
          return;
        }

        try {
          setEraseStatusMessage(`UID verified (${scannedSerial}). Erasing tag...`);
          await ndef.write({ records: [{ recordType: 'empty' }] }, { signal });
          const persistResult = await upsertTag({ uid: scannedSerial, records: [], hasNdef: false, action: 'erase' });
          addLog({ action: 'erase', serialNumber: scannedSerial, messageSummary: `Tag Cleared / Erased successfully (UID: ${scannedSerial})`, rawRecords: [] });

          if (persistResult.success) {
            showSuccess('Tag Erased', `Successfully cleared all data from UID [${scannedSerial}].`);
          } else {
            showWarning('Tag Erased, Registry Save Failed', persistResult.error || `Physical tag [${scannedSerial}] was erased, but the local registry could not be updated.`);
          }
          closeSafeEraseModal();
        } catch (writeErr: any) {
          setEraseErrorWarning(`Erase error: ${writeErr.message}`);
          showNFCError(writeErr, 'erase');
          stopSafeErase();
        }
      };

      ndef.onreadingerror = (errEvent: any) => {
        const eventSerial = errEvent?.serialNumber;
        if (eventSerial && normalizeUid(eventSerial) !== targetNormalized) {
          stopSafeErase();
          const errorMsg = `❌ Erase Blocked: Detected tag UID [${eventSerial}] does not match target [${safeEraseTarget.uid}].`;
          setEraseErrorWarning(errorMsg);
          showWarning('Erase Blocked (UID Mismatch)', errorMsg);
        } else {
          setEraseErrorWarning('Tag reading error occurred. Keep the tag steady and try again.');
          showNFCError(new DOMException('Tag was removed too quickly during UID verification', 'NetworkError'), 'erase');
          stopSafeErase();
        }
      };
    } catch (err: any) {
      setEraseErrorWarning(`Failed to start scan: ${err.message}`);
      showNFCError(err, 'erase');
      setIsErasingActive(false);
    }
  };

  const stopSafeWrite = useCallback(() => {
    if (writeAbortControllerRef.current) {
      writeAbortControllerRef.current.abort();
      writeAbortControllerRef.current = null;
    }
    setIsWritingActive(false);
    setWriteStatusMessage(null);
  }, []);

  const openSafeWriteModal = (tag: NFCTagItem) => {
    stopScanning();
    stopSafeErase();
    stopSafeWrite();
    setSafeWriteTarget(tag);
    setEditRecords(tag.records && tag.records.length > 0 ? JSON.parse(JSON.stringify(tag.records)) : [{ id: `rec-${Date.now()}`, recordType: 'text', data: 'Hello NFC!', lang: 'en' }]);
    setWriteErrorWarning(null);
    setWriteStatusMessage(null);
  };

  const closeSafeWriteModal = () => {
    stopSafeWrite();
    setSafeWriteTarget(null);
    setWriteErrorWarning(null);
    setWriteStatusMessage(null);
  };

  const handleAddRecord = () => setEditRecords(prev => [...prev, { id: `rec-${Date.now()}-${prev.length}`, recordType: 'text', data: '', lang: 'en' }]);
  const handleRemoveRecord = (id: string) => setEditRecords(prev => prev.filter(r => r.id !== id));
  const handleUpdateRecord = (id: string, updates: Partial<EditableNDEFRecord>) => setEditRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

  const executeSafeWrite = async () => {
    if (!safeWriteTarget) return;
    if (!isWebNFCSupported) {
      showNFCError(new DOMException('Web NFC is not supported in this browser.', 'NotSupportedError'), 'write');
      return;
    }
    if (editRecords.length === 0) {
      showWarning('No Records', 'Please add at least one NDEF record.');
      return;
    }

    stopSafeWrite();
    setIsWritingActive(true);
    setWriteErrorWarning(null);
    setWriteStatusMessage(`Hold target tag (UID: ${safeWriteTarget.uid}) against your device...`);
    const targetNormalized = normalizeUid(safeWriteTarget.uid);
    const nfcPayload = formatNDEFPayloadForNFC(editRecords);

    try {
      writeAbortControllerRef.current = new AbortController();
      const signal = writeAbortControllerRef.current.signal;
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal });

      ndef.onreading = async (event: any) => {
        const scannedSerial = event.serialNumber;
        const scannedNormalized = normalizeUid(scannedSerial);
        if (!scannedSerial || scannedNormalized !== targetNormalized) {
          stopSafeWrite();
          const errorMsg = `❌ Write Blocked: Detected tag UID [${scannedSerial || 'Unknown'}] does not match target [${safeWriteTarget.uid}]. Write aborted to protect tag data.`;
          setWriteErrorWarning(errorMsg);
          addLog({ action: 'write', serialNumber: scannedSerial || 'Unknown', messageSummary: `Write Blocked: UID Mismatch (expected: ${safeWriteTarget.uid}, scanned: ${scannedSerial})`, rawRecords: [] });
          showWarning('Write Blocked (UID Mismatch)', `Target: ${safeWriteTarget.uid} / Detected: ${scannedSerial || 'Unknown'}`);
          return;
        }

        try {
          setWriteStatusMessage(`UID verified (${scannedSerial}). Writing to tag...`);
          await ndef.write(nfcPayload, { signal });
          const persistResult = await upsertTag({ uid: scannedSerial, records: editRecords, hasNdef: true, action: 'write' });
          addLog({ action: 'write', serialNumber: scannedSerial, messageSummary: `Wrote ${editRecords.length} record(s) to UID: ${scannedSerial}`, rawRecords: editRecords });

          if (persistResult.success) {
            showSuccess('Tag Written', `Successfully wrote ${editRecords.length} record(s) to UID [${scannedSerial}].`);
          } else {
            showWarning('Tag Written, Registry Save Failed', persistResult.error || `Physical tag [${scannedSerial}] was written, but the local registry could not be updated.`);
          }
          closeSafeWriteModal();
        } catch (writeErr: any) {
          setWriteErrorWarning(`Write error: ${writeErr.message}`);
          showNFCError(writeErr, 'write');
          stopSafeWrite();
        }
      };

      ndef.onreadingerror = (errEvent: any) => {
        const eventSerial = errEvent?.serialNumber;
        if (eventSerial && normalizeUid(eventSerial) !== targetNormalized) {
          stopSafeWrite();
          const errorMsg = `❌ Write Blocked: Detected tag UID [${eventSerial}] does not match target [${safeWriteTarget.uid}].`;
          setWriteErrorWarning(errorMsg);
          showWarning('Write Blocked (UID Mismatch)', errorMsg);
        } else {
          setWriteErrorWarning('Tag reading error occurred. Keep the tag steady and try again.');
          showNFCError(new DOMException('Tag was removed too quickly during UID verification', 'NetworkError'), 'write');
          stopSafeWrite();
        }
      };
    } catch (err: any) {
      setWriteErrorWarning(`Failed to start scan: ${err.message}`);
      showNFCError(err, 'write');
      setIsWritingActive(false);
    }
  };

  useEffect(() => () => { stopScanning(); stopSafeErase(); stopSafeWrite(); }, [stopScanning, stopSafeErase, stopSafeWrite]);

  const filteredTags = useMemo(() => {
    let result = tags as NFCTagItem[];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t => t.uid.toLowerCase().includes(q) || Boolean(t.name?.toLowerCase().includes(q)) || Boolean(t.notes?.toLowerCase().includes(q)) || Boolean(t.tagType?.toLowerCase().includes(q)) || Boolean(t.records?.some(r => r.data?.toLowerCase().includes(q))));
    }
    return [...result].sort((a, b) => b.lastRead - a.lastRead);
  }, [tags, searchQuery]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [searchQuery]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(prev => prev < filteredTags.length ? Math.min(prev + PAGE_SIZE, filteredTags.length) : prev);
    }, { root: scrollContainerRef.current, rootMargin: '400px', threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredTags.length]);

  const currentlyRenderedTags = useMemo(() => filteredTags.slice(0, visibleCount), [filteredTags, visibleCount]);

  const handleCopyUid = (uid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(uid).then(() => {
      setCopiedUid(uid);
      showInfo('UID Copied', uid);
      setTimeout(() => setCopiedUid(null), 1800);
    }).catch(() => {});
  };

  const handleStartEditName = (tag: NFCTagItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingNameUid(tag.uid);
    setTempName(tag.name || '');
  };

  const handleSaveName = async (uid: string) => {
    const result = await updateTagName(uid, tempName.trim());
    if (!result.success) {
      showWarning('Rename Failed', result.error || 'Failed to save the item name.');
      return result;
    }
    setEditingNameUid(null);
    return result;
  };

  const writeCapacity = useMemo(() => analyzeNTAGCapacity(editRecords), [editRecords]);

  return (
    <div className="flex flex-col h-full bg-[#0F172A] rounded-none border-0 overflow-hidden shadow-none w-full">
      {isScanning && (
        <div className="p-2 sm:p-3 border-b border-blue-500/30 bg-blue-950/80 flex-shrink-0 animate-fade-in">
          <div className="flex items-center justify-between px-3.5 py-2 bg-blue-900/50 border border-blue-500/50 rounded-xl text-xs text-blue-200 font-medium shadow-sm">
            <div className="flex items-center gap-2 min-w-0"><Loader2 className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" /><span className="truncate">NFC Scan in Progress: Hold a tag near your device's NFC antenna</span></div>
            <button type="button" onClick={stopScanning} className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex-shrink-0 ml-2"><XCircle className="w-3.5 h-3.5" /><span>Stop</span></button>
          </div>
        </div>
      )}

      {searchQuery.trim().length > 0 && (
        <div className="px-3 py-2 bg-blue-950/70 border-b border-blue-900/50 flex items-center justify-between text-xs text-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0"><Search className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" /><span className="truncate">Filter: <span className="font-semibold text-white">"{searchQuery}"</span><span className="text-slate-400 ml-1.5 font-mono">({filteredTags.length} matches)</span></span></div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2"><button type="button" onClick={openSearchModal} className="text-[11px] text-cyan-300 hover:text-white px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 border border-blue-500/30 transition-colors cursor-pointer">Edit Filter</button><button type="button" onClick={() => setSearchQuery('')} className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer" title="Clear Search"><X className="w-3 h-3" /><span>Clear</span></button></div>
        </div>
      )}

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-5 space-y-2.5 sm:space-y-3.5 will-change-scroll">
        {store.isHydrated === false ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-3"><Loader2 className="w-7 h-7 text-cyan-400 animate-spin" /></div><p className="text-sm font-semibold text-slate-200">Loading local tag registry...</p><p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">Hydrating NFC tag inventory and photo assets from local IndexedDB storage.</p></div>
        ) : filteredTags.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-3"><Radio className="w-7 h-7 text-slate-500 opacity-60" /></div>
            <p className="text-sm font-semibold text-slate-300">No NFC inventory items found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">{searchQuery ? 'No tags matched your search criteria. Try modifying or clearing the filter.' : 'Tap "Scan NFC Tag" above and hold a tag near your phone to automatically register its item here.'}</p>
            {searchQuery && tags.length > 0 && <button type="button" onClick={() => setSearchQuery('')} className="mt-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors cursor-pointer shadow-sm">Clear Search Filter</button>}
            {tags.length === 0 && <button type="button" onClick={async () => { const result = await seedMockTags(20); if (!result.success) showWarning('Sample Load Failed', result.error || 'Failed to create sample inventory.'); }} className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer"><Sparkles className="w-3.5 h-3.5" /><span>Load Sample Inventory (20 items)</span></button>}
          </div>
        ) : (
          <>
            {currentlyRenderedTags.map((tag: NFCTagItem) => (
              <TagCardItem key={tag.uid} tag={tag} copiedUid={copiedUid} onCopyUid={handleCopyUid} editingNameUid={editingNameUid} tempName={tempName} onSetTempName={setTempName} onStartEditName={handleStartEditName} onSaveName={handleSaveName} onOpenSafeWrite={openSafeWriteModal} onOpenSafeErase={openSafeEraseModal} onDeleteTag={deleteTag} onShowInfo={showInfo} onUpdatePhoto={updateTagPhoto} />
            ))}
            <div ref={sentinelRef} className="py-4 flex items-center justify-center">{visibleCount < filteredTags.length ? <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700"><div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div><span>Loading more tags ({visibleCount} of {filteredTags.length} shown)...</span></div> : <div className="text-[11px] text-slate-500 font-mono">— End of tag registry ({filteredTags.length} total) —</div>}</div>
          </>
        )}
      </div>

      {safeWriteTarget && (
        <Modal isOpen={true} onClose={closeSafeWriteModal} title="Safe Write">
          <div className="p-3 sm:p-4 space-y-4">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" />Target Tag (UID Lock Verification)</span><span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded text-[10px] font-mono font-bold">UID LOCKED</span></div>
              <div className="flex items-center justify-between text-xs font-mono"><span className="text-cyan-300 font-bold select-all">{safeWriteTarget.uid}</span>{safeWriteTarget.name && <span className="text-slate-300 font-sans">{safeWriteTarget.name}</span>}</div>
              <p className="text-[11px] text-emerald-300 bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/20 leading-relaxed">🔒 <b>Write Protection:</b> Verifies the scanned tag UID and only writes to <b>{safeWriteTarget.uid}</b>. If another tag is presented, the operation is blocked to preserve data.</p>
            </div>
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between"><h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">NDEF Records ({editRecords.length})</h5><button type="button" onClick={handleAddRecord} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors"><Plus className="w-3.5 h-3.5" /><span>Add Record</span></button></div>
              {editRecords.map((rec, idx) => (
                <div key={rec.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-[10px] font-mono font-bold text-cyan-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">#{idx + 1}</span><select value={rec.recordType} onChange={e => handleUpdateRecord(rec.id, { recordType: e.target.value as any })} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"><option value="text">Text</option><option value="url">URL</option><option value="mime">MIME</option></select></div>{rec.recordType === 'text' && <input type="text" value={rec.lang || 'en'} onChange={e => handleUpdateRecord(rec.id, { lang: e.target.value })} placeholder="lang" className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-center font-mono text-slate-300" title="Language code (e.g. en, ja)" />}{rec.recordType === 'mime' && <input type="text" value={rec.mediaType || 'application/json'} onChange={e => handleUpdateRecord(rec.id, { mediaType: e.target.value })} placeholder="mime/type" className="w-32 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-slate-300" />}<button type="button" onClick={() => handleRemoveRecord(rec.id)} disabled={editRecords.length <= 1} className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors" title="Delete this record"><Trash2 className="w-3.5 h-3.5" /></button></div>
                  <textarea value={rec.data} onChange={e => handleUpdateRecord(rec.id, { data: e.target.value })} rows={rec.recordType === 'text' && (rec.data.includes('\n') || rec.data.length > 50) ? 3 : 2} placeholder={rec.recordType === 'url' ? 'https://example.com' : rec.recordType === 'mime' ? '{"key": "value"}' : 'Enter payload text...'} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 font-mono placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"><span className="text-slate-400 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5 text-cyan-400" />Estimated Payload: <span className="font-mono text-white font-bold">{writeCapacity.bytes} B</span></span><span className={`font-semibold ${writeCapacity.badgeColor === 'emerald' ? 'text-emerald-400' : writeCapacity.badgeColor === 'amber' ? 'text-amber-300' : writeCapacity.badgeColor === 'blue' ? 'text-blue-300' : 'text-red-400'}`}>{writeCapacity.recommendedChip} ({writeCapacity.detailDescription})</span></div>
            {isWritingActive && <div className="p-3 rounded-xl bg-blue-950/80 border border-blue-500/40 flex items-center gap-2.5 text-xs text-blue-200 animate-pulse"><Loader2 className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" /><span>{writeStatusMessage || 'Hold target tag against device...'}</span></div>}
            {writeErrorWarning && <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-xs text-red-200 leading-relaxed">{writeErrorWarning}</div>}
            <div className="flex gap-2.5 pt-1"><button type="button" onClick={closeSafeWriteModal} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-colors">Close</button>{isWritingActive ? <button type="button" onClick={stopSafeWrite} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors">Stop Waiting</button> : <button type="button" onClick={executeSafeWrite} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-lg shadow-blue-950/40 flex items-center justify-center gap-1.5"><PenTool className="w-4 h-4" /><span>Scan to Write</span></button>}</div>
          </div>
        </Modal>
      )}

      {safeEraseTarget && (
        <Modal isOpen={true} onClose={closeSafeEraseModal} title="Erase / Reset NFC Tag">
          <div className="p-3 sm:p-4 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-400" /></div>
            <div><h4 className="text-base sm:text-lg font-bold text-white mb-1">Erase this NFC Tag?</h4><p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">This will clear all NDEF records on the tag and reset it to an empty (<code className="text-cyan-300 font-mono">empty</code>) state.</p></div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-left space-y-2.5">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-400" />UID Pre-Verification Safety Lock</span><span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded text-[10px] font-mono font-bold">UID LOCKED</span></div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 space-y-1"><div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Target Tag UID:</div><div className="font-mono text-sm font-bold text-cyan-300 select-all">{safeEraseTarget.uid}</div>{safeEraseTarget.name && <div className="text-xs text-slate-300">Item Name: <span className="font-semibold text-white">{safeEraseTarget.name}</span></div>}</div>
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 leading-relaxed">🔒 <b>Accidental Erase Prevention:</b> Scans the tag UID prior to erasing. It will only erase if the detected UID exactly matches <b>{safeEraseTarget.uid}</b>. If any other tag is presented, the operation is automatically blocked.</div>
              {isErasingActive && <div className="p-3 rounded-lg bg-blue-950/60 border border-blue-500/40 flex items-center gap-2.5 text-xs text-blue-200 animate-pulse"><Loader2 className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" /><span>{eraseStatusMessage || 'Hold target tag against device...'}</span></div>}
              {eraseErrorWarning && <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/50 text-xs text-red-200 leading-relaxed">{eraseErrorWarning}</div>}
            </div>
            <div className="flex gap-2.5 w-full pt-1"><button type="button" onClick={closeSafeEraseModal} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-colors">Cancel</button>{isErasingActive ? <button type="button" onClick={stopSafeErase} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors">Stop Waiting</button> : <button type="button" onClick={executeSafeErase} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-colors shadow-lg shadow-red-950/40 flex items-center justify-center gap-1.5"><Trash2 className="w-4 h-4" /><span>Scan to Erase</span></button>}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

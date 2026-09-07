import React, { useState, useEffect } from 'react';
import {
  Bug, Terminal, CheckCircle, AlertTriangle, Sparkles, Trash2, Copy, Check,
  Bell, WifiOff, ShieldAlert, Lock, Database, Cpu
} from 'lucide-react';
import { APP_VERSION_TAG } from './version';
import { useToast } from './toast';
import { NTAG_LIMITS } from './store';
import { Modal } from './Modal';
import { buildTagRegistryExportV1, serializeExportDocument } from './data-format';

interface DebugViewProps { store: any; }
type MutationResult = { success: boolean; error?: string };

export function DebugView({ store }: DebugViewProps) {
  const { tags, clearAllTags, clearSampleTags, seedMockTags } = store;
  const { showNFCError, showSuccess, showWarning, showInfo } = useToast();
  const [copiedInfo, setCopiedInfo] = useState<string | null>(null);
  const [swState, setSwState] = useState<string>('Checking...');
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<'none' | 'samples' | 'all'>('none');

  const isSampleTag = (t: any) => {
    if (t.isSample) return true;
    if (t.notes && (t.notes.includes('sample') || t.notes.includes('Multi-record sample') || t.notes.includes('Unformatted / ID-only hardware tag'))) return true;
    return Boolean(t.name && (
      t.name.startsWith('Office Asset Tag') ||
      t.name.startsWith('Conference Room Smart Sign') ||
      t.name.startsWith('Digital Namecard') ||
      t.name.startsWith('Warehouse Shelf Tag') ||
      t.name.startsWith('Guest Wi-Fi Smart Point') ||
      t.name.startsWith('Device Unit ') ||
      t.name.startsWith('Raw ID Tag ')
    ));
  };

  const sampleTagsCount = tags.filter((t: any) => isSampleTag(t)).length;
  const realTagsCount = Math.max(0, tags.length - sampleTagsCount);
  const isSupported = typeof window !== 'undefined' && 'NDEFReader' in window;
  const isPWA = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) setSwState('No active registration');
        else if (reg.active) setSwState(`Active (${reg.scope})`);
        else if (reg.installing) setSwState('Installing...');
        else if (reg.waiting) setSwState('Waiting');
      }).catch(() => setSwState('Unavailable'));
    } else {
      setSwState('Not supported');
    }
  }, []);

  const handleCopyDiagnostics = () => {
    const diag = {
      appVersion: APP_VERSION_TAG,
      timestamp: new Date().toISOString(),
      webNfcSupported: isSupported,
      pwaMode: isPWA,
      serviceWorker: swState,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      registeredTagsCount: tags.length,
      realTagsCount,
      sampleTagsCount,
      multiRecordTagsCount: tags.filter((t: any) => t.records?.length > 1).length,
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'
    };
    navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).then(() => {
      setCopiedInfo('Diagnostics copied');
      showInfo('Diagnostics Copied', 'System information copied to clipboard.');
      setTimeout(() => setCopiedInfo(null), 2000);
    });
  };

  const handleExportTagsJson = () => {
    const json = serializeExportDocument(buildTagRegistryExportV1(tags, APP_VERSION_TAG));
    navigator.clipboard.writeText(json).then(() => {
      setCopiedInfo('Tags JSON copied');
      showSuccess('Registry Exported (v1)', `Copied ${tags.length} tag records as Canonical v1 JSON.`);
      setTimeout(() => setCopiedInfo(null), 2000);
    });
  };

  const reportFailure = (message: string) => showNFCError(new Error(message), 'write');

  const handleSeed = async (count: number) => {
    try {
      const result: MutationResult = await seedMockTags(count);
      if (!result.success) {
        reportFailure(result.error || 'Failed to generate sample tags.');
        return;
      }
      showSuccess('Sample Tags Generated', `Added ${count} mock tags to the IndexedDB registry.`);
    } catch (err: any) {
      reportFailure(err?.message || 'Failed to generate sample tags.');
    }
  };

  const handleConfirmClearSamples = async () => {
    const count = sampleTagsCount;
    try {
      const result: MutationResult = await clearSampleTags();
      if (!result.success) {
        reportFailure(result.error || 'Failed to delete sample tags.');
        return;
      }
      setConfirmDeleteModal('none');
      showSuccess('Sample Tags Deleted', `Removed ${count} sample tag(s). ${realTagsCount} real tag(s) preserved.`);
    } catch (err: any) {
      reportFailure(err?.message || 'Failed to delete sample tags.');
    }
  };

  const handleConfirmClearAll = async () => {
    const count = tags.length;
    try {
      const result: MutationResult = await clearAllTags();
      if (!result.success) {
        reportFailure(result.error || 'Failed to clear tag registry.');
        return;
      }
      setConfirmDeleteModal('none');
      showSuccess('All Tags Cleared', `Successfully deleted all ${count} tags from IndexedDB.`);
    } catch (err: any) {
      reportFailure(err?.message || 'Failed to clear tag registry.');
    }
  };

  return (
    <div className="max-w-4xl h-full space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-950/80 border border-cyan-500/40 rounded-xl flex items-center justify-center text-cyan-400 shadow-sm"><Bug className="w-5 h-5" /></div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>Debug & Diagnostics</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{APP_VERSION_TAG}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">Web NFC runtime inspection, error simulation, and storage telemetry.</p>
          </div>
        </div>
        <button type="button" onClick={handleCopyDiagnostics} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors">
          {copiedInfo === 'Diagnostics copied' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
          <span>{copiedInfo === 'Diagnostics copied' ? 'Copied!' : 'Copy Diagnostics'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1E293B] border border-slate-700 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><Terminal className="w-4 h-4 text-cyan-400" /><span>Web NFC & Runtime Diagnostics</span></h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800">
              <span className="text-slate-400">Web NFC (NDEFReader)</span>
              <span className={`font-mono font-bold flex items-center gap-1.5 ${isSupported ? 'text-emerald-400' : 'text-amber-400'}`}>{isSupported ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{isSupported ? 'Supported' : 'Not Available (Need Android Chrome)'}</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800"><span className="text-slate-400">PWA Standalone Mode</span><span className={`font-mono font-bold ${isPWA ? 'text-emerald-400' : 'text-slate-300'}`}>{isPWA ? 'Active (Installed PWA)' : 'Browser Tab'}</span></div>
            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800"><span className="text-slate-400">Service Worker</span><span className="font-mono text-cyan-300 truncate max-w-[180px]" title={swState}>{swState}</span></div>
            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800"><span className="text-slate-400">App Build Version</span><span className="font-mono font-bold text-slate-200">{APP_VERSION_TAG}</span></div>
          </div>
        </div>

        <div className="bg-[#1E293B] border border-slate-700 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between"><h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2"><Database className="w-4 h-4 text-blue-400" /><span>Tag Registry Telemetry</span></h3><span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/30">{tags.length} Total Tags</span></div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800"><div className="text-slate-400 text-[11px]">Real Scanned Tags</div><div className="text-lg font-bold font-mono text-emerald-400 mt-1">{realTagsCount}</div></div>
            <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800"><div className="text-slate-400 text-[11px]">Sample / Mock Tags</div><div className="text-lg font-bold font-mono text-cyan-400 mt-1">{sampleTagsCount}</div></div>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs"><span className="text-slate-400">Storage Architecture</span><span className="font-mono font-bold text-cyan-300">Unified IndexedDB (nfcweb_db)</span></div>
          <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs"><span className="text-slate-400">Attached Photos</span><span className="font-mono font-bold text-slate-200">{tags.filter((t: any) => t.photoAssetId || t.photoUrl).length} tags with photos</span></div>
          <div className="flex gap-2">
            <button type="button" onClick={handleExportTagsJson} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors" title="Copy tags registry as JSON"><Copy className="w-3.5 h-3.5 text-slate-400" /><span>Export All as JSON</span></button>
            <button type="button" onClick={() => tags.length > 0 && setConfirmDeleteModal('all')} disabled={tags.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-red-300 hover:text-red-200 bg-red-950/60 hover:bg-red-900/80 disabled:opacity-40 rounded-xl border border-red-500/40 text-xs font-bold transition-all"><Trash2 className="w-4 h-4 text-red-400" /><span>Clear All ({tags.length})</span></button>
          </div>
        </div>
      </div>

      <div className="bg-[#1E293B] border border-cyan-500/30 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-base font-bold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" /><span>Sample Data Generator & Cleaner</span></h3><p className="text-xs text-slate-400 mt-1">Generate simulated tags or delete mock data while keeping scanned hardware tags intact.</p></div>
          <div className="flex items-center gap-2">{sampleTagsCount > 0 && <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-500/40">{sampleTagsCount} Sample</span>}<span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">{tags.length} Total</span></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => void handleSeed(50)} className="flex items-center justify-center gap-2 p-3 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 rounded-xl border border-cyan-500/40 text-xs font-bold"><Sparkles className="w-4 h-4" /><span>+ Load 50 Samples</span></button>
          <button type="button" onClick={() => void handleSeed(10)} className="flex items-center justify-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold"><Sparkles className="w-4 h-4" /><span>+ Load 10 Samples</span></button>
          <button type="button" onClick={() => sampleTagsCount > 0 && setConfirmDeleteModal('samples')} disabled={sampleTagsCount === 0} className="flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold bg-amber-950/60 text-amber-300 border-amber-500/40 disabled:opacity-40"><Trash2 className="w-4 h-4" /><span>Delete Samples Only ({sampleTagsCount})</span></button>
        </div>
      </div>

      <div className="bg-[#1E293B] border border-slate-700 p-5 sm:p-6 rounded-2xl space-y-4">
        <div><h3 className="text-base font-bold text-white flex items-center gap-2"><Bell className="w-5 h-5 text-cyan-400" /><span>NFC Error & Feedback Toast Simulator</span></h3><p className="text-xs text-slate-400 mt-1">Trigger simulated Web NFC errors and feedback without physical hardware.</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <button type="button" onClick={() => showNFCError(new DOMException('Tag was lost during scan', 'NetworkError'), 'read')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><WifiOff className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold text-white">Tag Removed Mid-Scan</span></button>
          <button type="button" onClick={() => showNFCError(new DOMException('NFC permission was denied by user', 'NotAllowedError'), 'write')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><ShieldAlert className="w-4 h-4 text-red-400" /><span className="text-xs font-bold text-white">Write Permission Denied</span></button>
          <button type="button" onClick={() => showNFCError(new Error('Tag is read-only and cannot be overwritten'), 'write')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><Lock className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold text-white">Tag Read-Only / Locked</span></button>
          <button type="button" onClick={() => showNFCError(new Error('NDEF payload capacity exceeded for NTAG213'), 'write')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><AlertTriangle className="w-4 h-4 text-red-400" /><span className="text-xs font-bold text-white">Tag Memory Full</span></button>
          <button type="button" onClick={() => showWarning('Write Blocked: UID Mismatch', 'Expected UID does not match detected tag.')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><Lock className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold text-white">UID Mismatch Safety Block</span></button>
          <button type="button" onClick={() => showSuccess('NFC Tag Written Successfully', 'Simulated operation completed.')} className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left"><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-xs font-bold text-white">Operation Success Toast</span></button>
        </div>
      </div>

      <div className="bg-[#1E293B] border border-slate-700 p-5 sm:p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2"><Cpu className="w-5 h-5 text-indigo-400" /><span>NTAG IC Capacity & Hardware Reference</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['NTAG213', 'NTAG215', 'NTAG216'] as const).map(chip => <div key={chip} className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800"><div className="text-xs font-bold text-white flex items-center justify-between"><span>{chip}</span><span className="font-mono text-cyan-400">{NTAG_LIMITS[chip]} Bytes</span></div></div>)}
        </div>
      </div>

      <Modal isOpen={confirmDeleteModal !== 'none'} onClose={() => setConfirmDeleteModal('none')} title={confirmDeleteModal === 'samples' ? 'Delete Mock / Sample Tags' : 'Wipe All Registered Tags'}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-white">{confirmDeleteModal === 'samples' ? `Delete ${sampleTagsCount} sample tag(s)?` : `Delete ALL ${tags.length} registered tags?`}</p>
              <p className="text-slate-300 leading-relaxed">{confirmDeleteModal === 'samples' ? `This removes ${sampleTagsCount} simulated tags from IndexedDB. ${realTagsCount} scanned tag(s) remain.` : `This deletes all ${tags.length} registered tags and attached local photo assets from IndexedDB. This action cannot be undone.`}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button type="button" onClick={() => setConfirmDeleteModal('none')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700">Cancel</button>
            {confirmDeleteModal === 'samples' ? (
              <button type="button" onClick={() => void handleConfirmClearSamples()} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"><Trash2 className="w-4 h-4" /><span>Yes, Delete Samples</span></button>
            ) : (
              <button type="button" onClick={() => void handleConfirmClearAll()} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold"><Trash2 className="w-4 h-4" /><span>Yes, Delete All</span></button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

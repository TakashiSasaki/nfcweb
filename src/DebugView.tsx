import React, { useState, useEffect } from 'react';
import { 
  Bug, 
  Terminal,
  Info, 
  Smartphone, 
  CheckCircle, 
  AlertTriangle, 
  Sparkles, 
  Trash2,
  Copy,
  Check,
  Bell,
  WifiOff,
  ShieldAlert,
  Lock,
  HardDrive,
  Database,
  Cpu,
  Radio
} from 'lucide-react';
import { APP_VERSION_TAG } from './version';
import { useToast } from './toast';
import { NTAG_LIMITS, SAMPLE_NDEF_TEMPLATES } from './store';
import { Modal } from './Modal';

interface DebugViewProps {
  store: any;
}

export function DebugView({ store }: DebugViewProps) {
  const { tags, clearAllTags, clearSampleTags, seedMockTags } = store;
  const { showNFCError, showSuccess, showWarning, showInfo } = useToast();

  const [copiedInfo, setCopiedInfo] = useState<string | null>(null);
  const [swState, setSwState] = useState<string>('Checking...');
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<'none' | 'samples' | 'all'>('none');

  const isSampleTag = (t: any) => {
    if (t.isSample) return true;
    if (t.notes && (t.notes.includes('sample') || t.notes.includes('Multi-record sample') || t.notes.includes('Unformatted / ID-only hardware tag'))) return true;
    if (t.name && (
      t.name.startsWith('Office Asset Tag') ||
      t.name.startsWith('Conference Room Smart Sign') ||
      t.name.startsWith('Digital Namecard') ||
      t.name.startsWith('Warehouse Shelf Tag') ||
      t.name.startsWith('Guest Wi-Fi Smart Point') ||
      t.name.startsWith('Device Unit ') ||
      t.name.startsWith('Raw ID Tag ')
    )) return true;
    return false;
  };

  const sampleTagsCount = tags.filter((t: any) => isSampleTag(t)).length;
  const realTagsCount = Math.max(0, tags.length - sampleTagsCount);

  const isSupported = typeof window !== 'undefined' && 'NDEFReader' in window;
  const isPWA = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || 
    (window.navigator as any).standalone === true
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          if (reg.active) {
            setSwState(`Active (${reg.scope})`);
          } else if (reg.installing) {
            setSwState('Installing...');
          } else if (reg.waiting) {
            setSwState('Waiting (Auto-updating)');
          }
        } else {
          setSwState('No active registration');
        }
      }).catch(() => {
        setSwState('Unavailable');
      });
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
      realTagsCount: realTagsCount,
      sampleTagsCount: sampleTagsCount,
      multiRecordTagsCount: tags.filter((t: any) => t.records && t.records.length > 1).length,
      screenResolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'
    };

    navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).then(() => {
      setCopiedInfo('Diagnostics copied');
      showInfo('Diagnostics Copied', 'System information copied to clipboard.');
      setTimeout(() => setCopiedInfo(null), 2000);
    });
  };

  const handleExportTagsJson = () => {
    navigator.clipboard.writeText(JSON.stringify(tags, null, 2)).then(() => {
      setCopiedInfo('Tags JSON copied');
      showSuccess('Registry Exported', `Copied ${tags.length} tag records as JSON.`);
      setTimeout(() => setCopiedInfo(null), 2000);
    });
  };

  const handleDeleteSampleOnly = () => {
    if (sampleTagsCount === 0) return;
    setConfirmDeleteModal('samples');
  };

  const handleDeleteAllTags = () => {
    if (tags.length === 0) return;
    setConfirmDeleteModal('all');
  };

  // Estimate localStorage bytes
  const storageUsageBytes = typeof window !== 'undefined' 
    ? new Blob([localStorage.getItem('nfc_tags_registry') || '']).size 
    : 0;

  return (
    <div className="max-w-4xl h-full space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-950/80 border border-cyan-500/40 rounded-xl flex items-center justify-center text-cyan-400 shadow-sm">
            <Bug className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>Debug & Diagnostics</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {APP_VERSION_TAG}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Web NFC runtime inspection, error simulation, and storage telemetry.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyDiagnostics}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
        >
          {copiedInfo === 'Diagnostics copied' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
          <span>{copiedInfo === 'Diagnostics copied' ? 'Copied!' : 'Copy Diagnostics'}</span>
        </button>
      </div>

      {/* Grid: Runtime Status & Storage Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Runtime Diagnostics Card */}
        <div className="bg-[#1E293B] border border-slate-700 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Web NFC & Runtime Diagnostics</span>
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800">
              <span className="text-slate-400">Web NFC (NDEFReader)</span>
              <span className={`font-mono font-bold flex items-center gap-1.5 ${isSupported ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isSupported ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {isSupported ? 'Supported' : 'Not Available (Need Android Chrome 89+)'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800">
              <span className="text-slate-400">PWA Standalone Mode</span>
              <span className={`font-mono font-bold ${isPWA ? 'text-emerald-400' : 'text-slate-300'}`}>
                {isPWA ? 'Active (Installed PWA)' : 'Browser Tab'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800">
              <span className="text-slate-400">Service Worker & Auto-Update</span>
              <span className="font-mono text-cyan-300 truncate max-w-[180px]" title={swState}>
                {swState}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800">
              <span className="text-slate-400">App Build Version</span>
              <span className="font-mono font-bold text-slate-200">
                {APP_VERSION_TAG} (Auto-Reload Active)
              </span>
            </div>
          </div>
        </div>

        {/* Registry & Storage Telemetry */}
        <div className="bg-[#1E293B] border border-slate-700 p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span>Tag Registry Telemetry</span>
            </h3>
            <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/30">
              {tags.length} Total Tags
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
              <div className="text-slate-400 text-[11px]">Real Scanned Tags</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                {realTagsCount}
              </div>
            </div>

            <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
              <div className="text-slate-400 text-[11px]">Sample / Mock Tags</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {sampleTagsCount}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-900/70 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">LocalStorage Footprint</span>
            <span className="font-mono font-bold text-slate-200">
              {(storageUsageBytes / 1024).toFixed(1)} KB
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExportTagsJson}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
              title="Copy tags registry as JSON"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Export All as JSON</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteAllTags}
              disabled={tags.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-red-300 hover:text-red-200 bg-red-950/60 hover:bg-red-900/80 active:bg-red-950 disabled:opacity-40 disabled:hover:text-red-300 rounded-xl border border-red-500/40 hover:border-red-400 text-xs font-bold transition-all"
              title="Clear all registered tags from storage and memory"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Clear All ({tags.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sample Data Generator & Bulk Deletion Section */}
      <div className="bg-[#1E293B] border border-cyan-500/30 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span>Sample Data Generator & Cleaner (模擬データ管理)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Generate simulated multi-record tags for testing or delete mock sample data in bulk while keeping physical tags intact.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {sampleTagsCount > 0 && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                {sampleTagsCount} Sample {sampleTagsCount === 1 ? 'Tag' : 'Tags'}
              </span>
            )}
            {tags.length > 0 && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                {tags.length} Total
              </span>
            )}
          </div>
        </div>

        {/* Action Button Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Seed 50 Tags */}
          <button
            type="button"
            onClick={() => {
              seedMockTags(50);
              showSuccess('Sample Tags Generated', 'Added 50 mock tags with multi-record, single-record, and ID-only payloads.');
            }}
            className="flex items-center justify-center gap-2 p-3 bg-cyan-950 hover:bg-cyan-900 active:bg-cyan-950 text-cyan-300 rounded-xl border border-cyan-500/40 hover:border-cyan-400 text-xs font-bold transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>+ Load 50 Samples</span>
          </button>

          {/* Seed 10 Tags */}
          <button
            type="button"
            onClick={() => {
              seedMockTags(10);
              showSuccess('Sample Tags Generated', 'Added 10 mock tags to registry.');
            }}
            className="flex items-center justify-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold transition-all"
          >
            <Sparkles className="w-4 h-4 text-slate-400" />
            <span>+ Load 10 Samples</span>
          </button>

          {/* Delete Sample Tags Only */}
          <button
            type="button"
            onClick={handleDeleteSampleOnly}
            disabled={sampleTagsCount === 0}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
              sampleTagsCount > 0
                ? 'bg-amber-950/60 hover:bg-amber-900/80 active:bg-amber-950 text-amber-300 border-amber-500/40 hover:border-amber-400 shadow-sm cursor-pointer'
                : 'bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
            }`}
            title="Delete sample tags only while preserving scanned hardware tags"
          >
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>Delete Samples Only ({sampleTagsCount})</span>
          </button>
        </div>
      </div>

      {/* NFC Error & Feedback Toast Simulator */}
      <div className="bg-[#1E293B] border border-slate-700 p-5 sm:p-6 rounded-2xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <span>NFC Error & Feedback Toast Simulator</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Trigger simulated Web NFC error exceptions and feedback toasts to verify UI responsiveness without requiring physical hardware triggers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => showNFCError(new DOMException('Tag was lost during scan', 'NetworkError'), 'read')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <WifiOff className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Tag Removed Mid-Scan</div>
              <div className="text-[10px] text-slate-400 truncate">NetworkError / Tag lost</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => showNFCError(new DOMException('NFC permission was denied by user', 'NotAllowedError'), 'write')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Write Permission Denied</div>
              <div className="text-[10px] text-slate-400 truncate">NotAllowedError / Blocked</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => showNFCError(new Error('Tag is read-only and cannot be overwritten'), 'write')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Tag Read-Only / Locked</div>
              <div className="text-[10px] text-slate-400 truncate">Write-protected tag</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => showNFCError(new Error('NDEF payload capacity exceeded for NTAG213'), 'write')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Tag Memory Full (Overflow)</div>
              <div className="text-[10px] text-slate-400 truncate">NDEF payload capacity exceeded</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => showWarning('Write Blocked: UID Mismatch', 'Expected UID [04:A1:B2:C3], but detected [04:F8:99:12].')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">UID Mismatch Safety Block</div>
              <div className="text-[10px] text-slate-400 truncate">Target UID Lock enforced</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => showSuccess('NFC Tag Written Successfully', 'Wrote 3 multi-records to UID [04:12:34:AB]')}
            className="flex items-center gap-2.5 p-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white">Operation Success Toast</div>
              <div className="text-[10px] text-slate-400 truncate">Multi-record write completed</div>
            </div>
          </button>
        </div>
      </div>

      {/* Hardware Limits & Protocol Reference Card */}
      <div className="bg-[#1E293B] border border-slate-700 p-5 sm:p-6 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <span>NTAG IC Capacity & Hardware Reference</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span>NTAG213</span>
              <span className="font-mono text-cyan-400">{NTAG_LIMITS.NTAG213} Bytes</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Standard 7-byte UID. Ideal for single short URL or short plain text.
            </p>
          </div>

          <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span>NTAG215</span>
              <span className="font-mono text-cyan-400">{NTAG_LIMITS.NTAG215} Bytes</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Medium capacity. Ideal for multi-record (URL + vCard / JSON payload).
            </p>
          </div>

          <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800 space-y-1">
            <div className="text-xs font-bold text-white flex items-center justify-between">
              <span>NTAG216</span>
              <span className="font-mono text-cyan-400">{NTAG_LIMITS.NTAG216} Bytes</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              High capacity. Supports full vCards, multi-language descriptions, and rich MIME JSON.
            </p>
          </div>
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      <Modal
        isOpen={confirmDeleteModal !== 'none'}
        onClose={() => setConfirmDeleteModal('none')}
        title={confirmDeleteModal === 'samples' ? 'Delete Mock / Sample Tags' : 'Wipe All Registered Tags'}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-white">
                {confirmDeleteModal === 'samples' 
                  ? `Delete ${sampleTagsCount} sample tag(s)?` 
                  : `Delete ALL ${tags.length} registered tags?`}
              </p>
              <p className="text-slate-300 leading-relaxed">
                {confirmDeleteModal === 'samples'
                  ? `This will remove all ${sampleTagsCount} simulated mock tags from local storage and memory. Any physically scanned hardware tags (${realTagsCount} tags) will remain safely intact.`
                  : `This will completely delete all ${tags.length} registered tags (both sample data and physically scanned tags) from local storage and memory. This action cannot be undone.`}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteModal('none')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              Cancel
            </button>

            {confirmDeleteModal === 'samples' ? (
              <button
                type="button"
                onClick={() => {
                  const count = sampleTagsCount;
                  clearSampleTags();
                  setConfirmDeleteModal('none');
                  showSuccess('Sample Tags Deleted', `Removed ${count} sample tag(s). ${realTagsCount} real tag(s) preserved.`);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete {sampleTagsCount} Sample Tags</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const count = tags.length;
                  clearAllTags();
                  setConfirmDeleteModal('none');
                  showSuccess('All Tags Cleared', `Successfully deleted all ${count} tags from local registry.`);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete All {tags.length} Tags</span>
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

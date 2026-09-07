import React, { useState } from 'react';
import { Modal } from './Modal';
import { 
  Download, 
  Copy, 
  Check, 
  Layers, 
  Code, 
  FileCode, 
  FileCheck,
  HardDrive
} from 'lucide-react';
import { useToast } from './toast';
import { NFCTagItem } from './types';
import { APP_VERSION } from './version';
import { 
  buildTagRegistryExportV1, 
  serializeExportDocument, 
  generateExportFilename, 
  downloadJsonFile,
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION
} from './data-format';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: readonly NFCTagItem[];
  onOpenSchema: () => void;
}

export function ExportModal({
  isOpen,
  onClose,
  tags,
  onOpenSchema
}: ExportModalProps) {
  const { showSuccess, showInfo, showError } = useToast();
  const [copied, setCopied] = useState(false);

  // Generate transport export document safely
  const { exportDoc, serializedJson, exportError } = React.useMemo(() => {
    try {
      const doc = buildTagRegistryExportV1(tags, APP_VERSION);
      const json = serializeExportDocument(doc);
      return { exportDoc: doc, serializedJson: json, exportError: null };
    } catch (err: any) {
      return { exportDoc: null, serializedJson: '', exportError: err?.message || 'Failed to generate export document.' };
    }
  }, [tags]);

  const totalTagsCount = tags.length;
  const sampleCount = tags.filter(t => t.isSample).length;
  const physicalCount = totalTagsCount - sampleCount;

  const handleCopyClipboard = async () => {
    if (!serializedJson || exportError) return;
    try {
      await navigator.clipboard.writeText(serializedJson);
      setCopied(true);
      showSuccess('JSON Copied', `Copied ${totalTagsCount} tag(s) to clipboard.`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      showError('Copy Failed', err?.message || 'Failed to access clipboard.');
    }
  };

  const handleDownload = () => {
    if (!serializedJson || exportError) return;
    try {
      const filename = generateExportFilename();
      downloadJsonFile(filename, serializedJson);
      showSuccess('Download Started', `Saved ${filename} (${totalTagsCount} tag(s)).`);
      onClose();
    } catch (err: any) {
      showError('Download Failed', err?.message || 'Failed to save export file.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Tags">
      <div className="space-y-4 text-slate-200">

        {/* Current State Summary Card */}
        <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2.5">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Export Registry Target</span>
            </span>
            <span className="font-mono text-emerald-400 font-bold text-sm">
              {totalTagsCount} tags
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">Scanned Tags:</span>
              <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                {physicalCount}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">Sample Tags:</span>
              <div className="font-mono font-bold text-cyan-400 text-sm mt-0.5">
                {sampleCount}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Exports all tags (UIDs, NDEF records, item nicknames, timestamps) currently stored in device local registry into a canonical v1 backup document.
          </p>
        </div>

        {/* Format & Schema Badge */}
        <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Code className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">
                  Standard JSON Format (Canonical v1)
                </span>
                <span className="ml-2 text-[9px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
                  Official Backup Spec
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Strictly validated against JSON Schema (Draft 2020-12). Ephemeral diagnostic logs and hardware settings are omitted to produce a portable tag registry file.
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Item photos are stored locally and are not included in Canonical v1 JSON exports.
          </p>

          <div className="pt-1 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono">
              format: {CANONICAL_FORMAT} (v{CANONICAL_SCHEMA_VERSION})
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSchema();
              }}
              className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline hover:no-underline"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>View Data Schema Specification</span>
            </button>
          </div>
        </div>

        {/* Export Invariant Error Banner if corrupted data */}
        {exportError && (
          <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs space-y-1">
            <div className="font-bold text-red-300 flex items-center gap-1.5">
              <span>Export Invariant Error</span>
            </div>
            <p className="text-red-200 font-mono text-[11px]">{exportError}</p>
          </div>
        )}

        {/* JSON Preview Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">JSON Preview</span>
            <span className="font-mono text-[10px]">UTF-8 / 2-space indented</span>
          </div>
          <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 max-h-36 overflow-auto select-all leading-relaxed whitespace-pre">
            {serializedJson ? (serializedJson.slice(0, 800) + (serializedJson.length > 800 ? '\n  ...\n}' : '')) : '(No export data)'}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCopyClipboard}
            disabled={!serializedJson || !!exportError}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 disabled:cursor-not-allowed text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!serializedJson || !!exportError}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 disabled:cursor-not-allowed text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-900/30"
          >
            <Download className="w-4 h-4" />
            <span>Download JSON (.json)</span>
          </button>
        </div>

      </div>
    </Modal>
  );
}

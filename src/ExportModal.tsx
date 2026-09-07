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
  downloadJsonFile 
} from './data-transfer/export';
import { CANONICAL_FORMAT, CANONICAL_SCHEMA_VERSION } from './data-transfer/types';

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

  // Generate transport export document
  const exportDoc = buildTagRegistryExportV1(tags, APP_VERSION);
  const serializedJson = serializeExportDocument(exportDoc);
  const totalTagsCount = tags.length;
  const sampleCount = tags.filter(t => t.isSample).length;
  const physicalCount = totalTagsCount - sampleCount;

  const handleCopyClipboard = async () => {
    try {
      await navigator.clipboard.writeText(serializedJson);
      setCopied(true);
      showSuccess('JSONをコピーしました', `${totalTagsCount}件のタグレジストリをクリップボードにコピーしました。`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      showError('コピー失敗', err?.message || 'クリップボードへのアクセスに失敗しました。');
    }
  };

  const handleDownload = () => {
    try {
      const filename = generateExportFilename();
      downloadJsonFile(filename, serializedJson);
      showSuccess('ダウンロード開始', `${filename} を保存しました (${totalTagsCount} 件のタグ)。`);
      onClose();
    } catch (err: any) {
      showError('ダウンロード失敗', err?.message || 'ファイル保存処理中にエラーが発生しました。');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="タグデータのエクスポート (Export)">
      <div className="space-y-4 text-slate-200">

        {/* Current State Summary Card */}
        <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2.5">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>エクスポート対象データ</span>
            </span>
            <span className="font-mono text-emerald-400 font-bold text-sm">
              {totalTagsCount} 件
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">実測スキャンタグ:</span>
              <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                {physicalCount} 件
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">サンプル模擬タグ:</span>
              <div className="font-mono font-bold text-cyan-400 text-sm mt-0.5">
                {sampleCount} 件
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            端末のローカルレジストリに保存されている全タグ（UID、NDEFレコード、カスタム表示名、タイムスタンプ）を標準互換v1形式で出力します。
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
                  標準JSONフォーマット (Canonical v1)
                </span>
                <span className="ml-2 text-[9px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
                  公式バックアップ仕様
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            厳格なJSON Schema (Draft 2020-12) で検証可能な形式です。診断ログや端末設定は除外され、ポータブルなタグ台帳のみが出力されます。
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
              <span>データ仕様・スキーマを確認</span>
            </button>
          </div>
        </div>

        {/* JSON Preview Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">プレビュー (先頭部分)</span>
            <span className="font-mono text-[10px]">UTF-8 / 2-space indented</span>
          </div>
          <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 max-h-36 overflow-auto select-all leading-relaxed whitespace-pre">
            {serializedJson.slice(0, 800) + (serializedJson.length > 800 ? '\n  ...\n}' : '')}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
          >
            キャンセル
          </button>

          <button
            type="button"
            onClick={handleCopyClipboard}
            disabled={totalTagsCount === 0}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>コピー完了</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>クリップボードにコピー</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={totalTagsCount === 0}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-900/30"
          >
            <Download className="w-4 h-4" />
            <span>JSONダウンロード (.json)</span>
          </button>
        </div>

      </div>
    </Modal>
  );
}

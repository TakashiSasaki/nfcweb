import React, { useState } from 'react';
import { Modal } from './Modal';
import { 
  Download, 
  Upload, 
  FileText, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Clock, 
  HardDrive,
  FileSpreadsheet,
  Code
} from 'lucide-react';

interface ExportPlaceholderModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagsCount: number;
}

export function ExportPlaceholderModal({
  isOpen,
  onClose,
  tagsCount
}: ExportPlaceholderModalProps) {
  const [copied, setCopied] = useState(false);

  const handleSimulateCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="エクスポート (Export) - UIプレースホルダー">
      <div className="space-y-4">
        {/* Placeholder Badge & Banner */}
        <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-300">UI Placeholder</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                機能準備中
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              エクスポート機能の画面インターフェイス枠です。登録されているNFCタグデータをバックアップ・連携するためのフォーマット仕様とUIレイアウトをプレビューしています。
            </p>
          </div>
        </div>

        {/* Current State Summary Card */}
        <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>エクスポート対象データ</span>
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              {tagsCount} 件のタグ
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            端末のローカルストレージに保存されている全タグ（UID、NDEFレコード、カスタム名、タイムスタンプ）が出力対象となります。
          </p>
        </div>

        {/* Formats Placeholder Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            出力フォーマット（予定）
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 flex items-start gap-2.5">
              <Code className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1">
                  <span>JSON バックアップ</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-mono">推奨</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  スキーマ定義付きの完全なNDEF構造バックアップ
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-700 bg-slate-900/60 opacity-80 flex items-start gap-2.5">
              <FileSpreadsheet className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-300">
                  CSV / スプレッドシート
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  UIDと基本メタデータの一覧集計用
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (UI Placeholders) */}
        <div className="pt-2 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSimulateCopy}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>クリップボードにコピー（模擬）</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>クリップボードにコピー (予定)</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600/50 text-emerald-200/70 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-not-allowed border border-emerald-500/30"
          >
            <Download className="w-4 h-4" />
            <span>JSONダウンロード (準備中)</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface ImportPlaceholderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportPlaceholderModal({
  isOpen,
  onClose
}: ImportPlaceholderModalProps) {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="インポート (Import) - UIプレースホルダー">
      <div className="space-y-4">
        {/* Placeholder Badge & Banner */}
        <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-300">UI Placeholder</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                機能準備中
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              インポート機能の画面インターフェイス枠です。以前保存したバックアップJSONや外部NDEF定義の読み込みフローをプレビューしています。
            </p>
          </div>
        </div>

        {/* Drag & Drop File Zone Placeholder */}
        <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-2xl p-6 text-center bg-slate-900/40 transition-colors flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Upload className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-slate-200">
              JSONファイルをここにドロップ
            </p>
            <p className="text-[11px] text-slate-400">
              または <span className="text-sky-400 font-medium underline">ファイルを選択</span> (UI枠)
            </p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            対応形式: .json (Web NFC Backup Schema)
          </span>
        </div>

        {/* Import Policy / Merge Strategy */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 block">
            取り込みモード（予定）
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                importMode === 'merge'
                  ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>マージ (Merge)</span>
                {importMode === 'merge' && <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">既存タグを保持し新規・重複を更新</p>
            </button>

            <button
              type="button"
              onClick={() => setImportMode('replace')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                importMode === 'replace'
                  ? 'border-red-500/50 bg-red-500/10 text-red-200'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>置換 (Replace)</span>
                {importMode === 'replace' && <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">既存データを全消去して完全入れ替え</p>
            </button>
          </div>
        </div>

        {/* Action Button (UI Placeholder) */}
        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            閉じる
          </button>
          <button
            type="button"
            disabled
            className="px-4 py-2 rounded-xl bg-sky-600/50 text-sky-200/70 text-xs font-bold transition-all flex items-center gap-1.5 cursor-not-allowed border border-sky-500/30"
          >
            <Upload className="w-4 h-4" />
            <span>インポート実行 (準備中)</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

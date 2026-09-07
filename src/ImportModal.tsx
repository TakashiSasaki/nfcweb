import React, { useState, useRef } from 'react';
import { Modal } from './Modal';
import { 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  FileCode, 
  ShieldAlert, 
  Info
} from 'lucide-react';
import { useToast } from './toast';
import { NFCTagItem } from './types';
import { 
  validateImportPayload, 
  buildImportPlan, 
  applyImportPlan, 
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportPlan,
  ImportMode,
  ImportValidationError,
  TagRegistryExportDocumentV1
} from './data-format';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  localTags: readonly NFCTagItem[];
  onCommitImport: (tags: NFCTagItem[]) => { success: boolean; error?: string };
  onOpenSchema: () => void;
}

export function ImportModal({
  isOpen,
  onClose,
  localTags,
  onCommitImport,
  onOpenSchema
}: ImportModalProps) {
  const { showSuccess, showError, showInfo } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);

  // Staged State
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [validatedDoc, setValidatedDoc] = useState<TagRegistryExportDocumentV1 | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [validationErrors, setValidationErrors] = useState<ImportValidationError[]>([]);
  const [, setIsProcessing] = useState(false);

  const resetImportState = () => {
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setValidatedDoc(null);
    setImportPlan(null);
    setValidationErrors([]);
    setConfirmReplaceChecked(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleModalClose = () => {
    resetImportState();
    onClose();
  };

  const handleModeChange = (newMode: ImportMode) => {
    setImportMode(newMode);
    if (validatedDoc) {
      const plan = buildImportPlan(validatedDoc, localTags, newMode);
      setImportPlan(plan);
    }
  };

  const processRawFile = (file: File) => {
    resetImportState();
    setSelectedFileName(file.name);
    setSelectedFileSize(file.size);

    // 1. Size check
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      const mbLimit = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
      const actualMb = (file.size / (1024 * 1024)).toFixed(2);
      setValidationErrors([
        {
          path: '#/fileSize',
          message: `ファイルサイズ超過: ${actualMb} MiB (上限は ${mbLimit} MiB です)。`
        }
      ]);
      showError('サイズ超過', `インポート可能なファイル上限は ${mbLimit} MiB です。`);
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      setIsProcessing(false);
      const text = e.target?.result;
      if (typeof text !== 'string') {
        setValidationErrors([{ path: '#', message: 'ファイルの読み込みに失敗しました。' }]);
        return;
      }

      // 2. JSON parse check
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err: any) {
        setValidationErrors([
          {
            path: '#/syntax',
            message: `不正なJSON構文です: ${err?.message || '構文解析に失敗しました'}`
          }
        ]);
        showError('JSON構文エラー', 'ファイルのJSON構文が壊れているため解析できませんでした。');
        return;
      }

      // 3. Schema & Canonical Validation (Draft 2020-12 SSOT)
      const result = validateImportPayload(parsed);
      if (!result.ok || !result.document) {
        const errors = result.errors || [{ path: '#', message: '検証エラーが発生しました' }];
        setValidationErrors(errors);
        showError('検証失敗', `スキーマまたはデータの不整合が ${errors.length} 件検出されました。`);
        return;
      }

      // 4. Staged validation success & Preflight Plan calculation
      const validDoc = result.document;
      setValidatedDoc(validDoc);
      const plan = buildImportPlan(validDoc, localTags, importMode);
      setImportPlan(plan);

      showInfo('検証完了', `${validDoc.tags.length} 件のタグデータをプレビュー準備しました。`);
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setValidationErrors([{ path: '#', message: 'ファイル読み込み中にI/Oエラーが発生しました。' }]);
    };

    reader.readAsText(file, 'utf-8');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processRawFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processRawFile(file);
  };

  const handleExecuteImport = () => {
    if (!importPlan) return;

    if (importMode === 'replace' && !confirmReplaceChecked) {
      showError('確認が必要です', '置換モードを実行するには、既存データ消去への同意チェックが必要です。');
      return;
    }

    try {
      const resultingTags = applyImportPlan(importPlan);

      // Mutate through store and handle storage quota safety
      const commitRes = onCommitImport(resultingTags);
      if (!commitRes.success) {
        showError('ストレージ保存エラー', commitRes.error || 'ローカルストレージへの永続化に失敗しました。');
        return;
      }

      showSuccess(
        importMode === 'merge' ? 'マージ完了' : '置換完了',
        `${importPlan.importCount} 件を取り込みました (登録タグ総数: ${resultingTags.length} 件)。`
      );
      handleModalClose();
    } catch (err: any) {
      showError('インポート失敗', err?.message || 'インポート適用中に予期しないエラーが発生しました。');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleModalClose} title="Import Tags">
      <div className="space-y-4 text-slate-200">

        {/* Physical NFC Safety Notice */}
        <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-2xl flex items-start gap-2.5 text-xs">
          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed text-slate-300">
            <span className="font-bold text-cyan-300">安全確認: </span>
            インポートは端末のローカルレジストリ（ブラウザ内ストレージ）のみを変更します。物理的なNFCタグへの無線通信・書き込みは一切行いません。
          </div>
        </div>

        {/* Step 1: File Selection Area (Dropzone) */}
        {!validatedDoc && (
          <div className="space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2.5 ${
                isDragging 
                  ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01]' 
                  : 'border-slate-700 hover:border-cyan-500/60 bg-slate-900/40'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm">
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-bold text-slate-100">
                  JSONファイルをここにドロップ
                </p>
                <p className="text-xs text-slate-400">
                  または <span className="text-cyan-400 font-semibold underline">ファイルを選択</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono text-slate-500">
                <span>対応形式: .json (Canonical v1 / Draft 2020-12)</span>
                <span>•</span>
                <span>上限: 5 MiB</span>
              </div>
            </div>

            {/* Validation Errors Box */}
            {validationErrors.length > 0 && (
              <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>バリデーションエラー ({validationErrors.length} 件)</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="p-2 bg-slate-950/80 rounded-xl border border-red-500/20 text-[11px] font-mono text-red-200">
                      <span className="text-red-400 font-bold">{err.path}:</span> {err.message}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  既存のタグデータは保護されており、変更されていません。スキーマ仕様を満たす正しいファイルを選択してください。
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preflight Preview & Import Execution Mode */}
        {validatedDoc && importPlan && (
          <div className="space-y-4">
            
            {/* File Info Bar with Re-select button */}
            <div className="flex items-center justify-between p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div className="truncate">
                  <div className="font-bold text-white truncate">{selectedFileName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {selectedFileSize ? `${(selectedFileSize / 1024).toFixed(1)} KB` : ''} • format: {validatedDoc.format} (v{validatedDoc.schemaVersion})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={resetImportState}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors border border-slate-700 cursor-pointer flex-shrink-0"
              >
                ファイルを再選択
              </button>
            </div>

            {/* Preflight Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">現在 / 取込総数</div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                  {importPlan.currentCount} → {importPlan.importCount} 件
                </div>
              </div>
              <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">新規追加</div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                  +{importPlan.newCount} 件
                </div>
              </div>
              <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">
                  {importMode === 'merge' ? '上書き更新' : '消去対象'}
                </div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${
                  importMode === 'merge' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {importMode === 'merge' ? `${importPlan.updateCount} 件` : `-${importPlan.removedCount} 件`}
                </div>
              </div>
              <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">反映後タグ総数</div>
                <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                  {importPlan.resultingCount} 件
                </div>
              </div>
            </div>

            {/* Detailed Delta Breakdown */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-950/40 rounded-lg border border-slate-800/80 text-[10px] font-mono text-slate-400">
              <span>維持: {importPlan.unchangedCount} 件</span>
              <span>•</span>
              <span>更新: {importPlan.updateCount} 件</span>
              <span>•</span>
              <span>削除: {importPlan.removedCount} 件</span>
              <span>•</span>
              <span className="text-cyan-400 font-bold">差分合計: {importPlan.actions.length} 件</span>
            </div>

            {/* Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                取り込みモードを選択
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Merge Option */}
                <button
                  type="button"
                  onClick={() => handleModeChange('merge')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'merge'
                      ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-100 shadow-sm'
                      : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>マージ (推奨)</span>
                    {importMode === 'merge' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">
                    既存データを維持しながら新規UIDを追加。重複時はファイル側レコードで上書き更新。
                  </p>
                  <div className="mt-2 text-[10px] font-mono text-cyan-300/80">
                    反映後: {importPlan.resultingCount} 件
                  </div>
                </button>

                {/* Replace Option */}
                <button
                  type="button"
                  onClick={() => handleModeChange('replace')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    importMode === 'replace'
                      ? 'border-red-500/60 bg-red-950/40 text-red-100 shadow-sm'
                      : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>置換 (完全置換)</span>
                    {importMode === 'replace' && <CheckCircle2 className="w-4 h-4 text-red-400" />}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">
                    既存レジストリを全消去し、ファイル内の登録データのみに完全入れ替え。
                  </p>
                  <div className="mt-2 text-[10px] font-mono text-red-300/80">
                    反映後: {importPlan.resultingCount} 件
                  </div>
                </button>
              </div>
            </div>

            {/* Replace Mode Safety Confirmation Checkbox */}
            {importMode === 'replace' && (
              <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl space-y-2">
                <div className="flex items-start gap-2 text-xs text-red-200">
                  <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    注意: 置換モードは既存の全登録タグ ({localTags.length} 件) を消去します。この操作は取り消せません。
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-200 font-semibold cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={confirmReplaceChecked}
                    onChange={(e) => setConfirmReplaceChecked(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 bg-slate-900 border-slate-600 focus:ring-red-500"
                  />
                  <span>既存データを消去して完全置換することに同意します</span>
                </label>
              </div>
            )}

            {/* Diff Preview List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold">取り込み対象アクションプレビュー</span>
                <span>全 {importPlan.actions.length} 件</span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {importPlan.actions.slice(0, 15).map((action, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-1.5 bg-slate-950/60 rounded-lg border border-slate-800 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        action.status === 'new' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : action.status === 'update' 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                          : action.status === 'remove'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {action.status === 'new' ? '新規追加' : action.status === 'update' ? '更新' : action.status === 'remove' ? '削除' : '維持'}
                      </span>
                      <span className="font-mono text-slate-300">{action.uid}</span>
                      {action.name && <span className="text-slate-400 truncate">({action.name})</span>}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                      {action.recordCount} recs
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Modal Footer / Navigation & Actions */}
        <div className="pt-2 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              handleModalClose();
              onOpenSchema();
            }}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline hover:no-underline"
          >
            <FileCode className="w-4 h-4" />
            <span>データ仕様・スキーマを確認</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleModalClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
            >
              閉じる
            </button>

            {validatedDoc && importPlan && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importMode === 'replace' && !confirmReplaceChecked}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                  importMode === 'replace'
                    ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-40 text-white shadow-red-900/30'
                    : 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white shadow-cyan-900/30'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>
                  {importMode === 'merge' ? 'マージを実行' : '置換を実行'}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}

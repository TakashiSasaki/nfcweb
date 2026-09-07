import React, { useState } from 'react';
import { Modal } from './Modal';
import { 
  FileCode, 
  Copy, 
  Check, 
  Download, 
  Info, 
  BookOpen, 
  CheckCircle2, 
  Layers, 
  FileJson,
  ExternalLink
} from 'lucide-react';
import { registrySchema } from './data-transfer/validate';
import { EXAMPLE_TAG_REGISTRY_V1 } from './data-transfer/example';
import { downloadJsonFile } from './data-transfer/export';
import { CANONICAL_FORMAT, CANONICAL_SCHEMA_VERSION } from './data-transfer/types';
import { APP_VERSION_TAG } from './version';

interface DataSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DataSchemaModal({ isOpen, onClose }: DataSchemaModalProps) {
  const [activeTab, setActiveTab] = useState<'docs' | 'schema' | 'example'>('docs');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const rawSchemaString = JSON.stringify(registrySchema, null, 2);
  const rawExampleString = JSON.stringify(EXAMPLE_TAG_REGISTRY_V1, null, 2);

  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  };

  const handleDownloadSchema = () => {
    downloadJsonFile('nfcweb-tag-registry.schema.json', rawSchemaString);
  };

  const handleDownloadExample = () => {
    downloadJsonFile('nfcweb-tags-example-v1.json', rawExampleString);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="データ仕様・スキーマ定義 (Data Schema)">
      <div className="space-y-4 text-slate-200">
        
        {/* Header Badges & Provenance Info */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">フォーマット:</span>
            <span className="font-mono text-cyan-300 font-bold bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-500/30">
              {CANONICAL_FORMAT}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">スキーマ版数:</span>
              <span className="font-mono text-emerald-300 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/30">
                v{CANONICAL_SCHEMA_VERSION}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">規格:</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                Draft 2020-12
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700/80 text-xs font-semibold gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`pb-2 px-3 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'docs'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>フィールド仕様リファレンス</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`pb-2 px-3 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'schema'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>JSON Schema (定義)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('example')}
            className={`pb-2 px-3 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'example'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>サンプルデータ (v1)</span>
          </button>
        </div>

        {/* Tab 1: Human-Readable Field Reference */}
        {activeTab === 'docs' && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-xs">
            {/* Versioning & Compatibility explanation */}
            <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl space-y-1.5">
              <div className="font-bold text-blue-300 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>互換性ポリシー & バージョニング設計</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                <code>schemaVersion</code> (現在 <code>1</code>) は外部連携仕様の契約バージョンを示し、後方互換性のない変更時にのみインクリメントされます。
                <code>appVersion</code> は出力時のアプリ版数（記録用）であり、インポート時の互換性判定には使用されません。
                将来の拡張フィールドに対応するため、未知のプロパティの混入を防ぐ厳格な検証が適用されます。
              </p>
            </div>

            {/* Top-Level Document Structure */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>トップレベル・ドキュメント構造 (Root Document)</span>
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/60">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-300 border-b border-slate-700">
                      <th className="p-2 font-mono">フィールド名</th>
                      <th className="p-2 font-mono">型</th>
                      <th className="p-2">必須</th>
                      <th className="p-2">説明・制約</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-sans">
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">format</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">固定値: <code>"nfcweb-tag-registry"</code>。フォーマット識別子。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">schemaVersion</td>
                      <td className="p-2 font-mono text-amber-300">integer</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">固定値: <code>1</code>。スキーマ仕様バージョン。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">exportedAt</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">ISO 8601 UTCタイムスタンプ (例: <code>2026-09-07T01:23:45.678Z</code>)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">appVersion</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">エクスポート時のアプリバージョン (出所記録用)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">tags</td>
                      <td className="p-2 font-mono text-amber-300">array</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">NFCタグ登録レコードの配列。空配列も許容。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tag Item Structure */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>NFCタグ構造体 (NFCTagItem)</span>
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/60">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-300 border-b border-slate-700">
                      <th className="p-2 font-mono">フィールド名</th>
                      <th className="p-2 font-mono">型</th>
                      <th className="p-2">必須</th>
                      <th className="p-2">説明・制約</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">uid</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">1文字以上のNFCタグ固有UID (レジストリの一意キー)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">name</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">ユーザー定義のタグ表示名・ニックネーム。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">firstSeen</td>
                      <td className="p-2 font-mono text-amber-300">integer</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">初回検出エポックミリ秒 (0以上)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">lastRead</td>
                      <td className="p-2 font-mono text-amber-300">integer</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">最終読み取りエポックミリ秒 (0以上)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">readCount</td>
                      <td className="p-2 font-mono text-amber-300">integer</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">読み取り累計回数 (0以上)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">lastAction</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">最終操作種別: <code>"read" | "write" | "erase"</code>。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">tagType</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">ICチップ種別ヒント (例: NTAG213, MIFARE Ultralight)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">hasNdef</td>
                      <td className="p-2 font-mono text-amber-300">boolean</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">有効なNDEFレコードが存在するかどうかのフラグ。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">records</td>
                      <td className="p-2 font-mono text-amber-300">array</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">NDEFレコード構造体の配列。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">notes</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">タグに関するメモ・備考。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">isSample</td>
                      <td className="p-2 font-mono text-amber-300">boolean</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">模擬生成されたサンプルタグかどうかの識別フラグ。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* NDEF Record Structure */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>NDEFレコード構造体 (EditableNDEFRecord)</span>
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/60">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-300 border-b border-slate-700">
                      <th className="p-2 font-mono">フィールド名</th>
                      <th className="p-2 font-mono">型</th>
                      <th className="p-2">必須</th>
                      <th className="p-2">説明・制約</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">id</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">レコードの一意識別子 (1文字以上)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">recordType</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">種別: <code>"text" | "url" | "mime" | "empty"</code>。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">data</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-emerald-400 font-bold">必須</td>
                      <td className="p-2">ペイロードデータ。URL、テキスト、またはシリアライズ文字列。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">mediaType</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-indigo-400 font-bold">条件付必須</td>
                      <td className="p-2"><code>recordType="mime"</code> の時のみ必須 (例: <code>application/json</code>)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">lang</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">言語コード (例: <code>"ja"</code>, <code>"en"</code>)。</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono text-cyan-300">encoding</td>
                      <td className="p-2 font-mono text-amber-300">string</td>
                      <td className="p-2 text-slate-500">任意</td>
                      <td className="p-2">文字エンコーディング (例: <code>"utf-8"</code>)。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Raw JSON Schema */}
        {activeTab === 'schema' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                src/data-transfer/nfcweb-tag-registry.schema.json
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopy(rawSchemaString, 'schema')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  {copiedSection === 'schema' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedSection === 'schema' ? 'コピー完了' : 'スキーマをコピー'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSchema}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-500/40 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.schema.json 保存</span>
                </button>
              </div>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 max-h-[55vh] overflow-auto select-all leading-relaxed whitespace-pre">
              {rawSchemaString}
            </pre>
          </div>
        )}

        {/* Tab 3: Canonical Example Document */}
        {activeTab === 'example' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                Canonical v1 Export Document Example
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopy(rawExampleString, 'example')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  {copiedSection === 'example' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedSection === 'example' ? 'コピー完了' : 'サンプルをコピー'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExample}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.json 保存</span>
                </button>
              </div>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-300 max-h-[55vh] overflow-auto select-all leading-relaxed whitespace-pre">
              {rawExampleString}
            </pre>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-700/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
          >
            閉じる
          </button>
        </div>

      </div>
    </Modal>
  );
}

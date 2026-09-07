import React, { useState } from 'react';
import { Modal } from './Modal';
import { 
  FileCode, 
  Copy, 
  Check, 
  Download, 
  Info, 
  BookOpen, 
  FileJson,
  ExternalLink
} from 'lucide-react';
import { 
  nfcTagRegistrySchema, 
  nfcTagSchema, 
  ndefRecordSchema 
} from './data-format/schema-registry';
import { EXAMPLE_TAG_REGISTRY_V1 } from './data-format/example';
import { downloadJsonFile } from './data-format';
import { CANONICAL_FORMAT, CANONICAL_SCHEMA_VERSION } from './data-format/types';

interface DataSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SchemaPropertyInfo {
  name: string;
  type: string;
  isRequired: boolean;
  description: string;
  constraints?: string[];
  example?: string;
}

function extractPropertiesFromSchema(
  schemaDef: any,
  requiredList: string[] = []
): SchemaPropertyInfo[] {
  if (!schemaDef || !schemaDef.properties) return [];

  const requiredSet = new Set(schemaDef.required || requiredList);
  return Object.entries<any>(schemaDef.properties).map(([name, prop]) => {
    const isRequired = requiredSet.has(name);
    let typeDisplay = prop.type || (prop.const !== undefined ? 'constant' : (prop.$ref ? 'ref' : 'any'));

    if (prop.const !== undefined) {
      typeDisplay = `const: ${JSON.stringify(prop.const)}`;
    } else if (prop.enum) {
      typeDisplay = prop.enum.map((v: any) => JSON.stringify(v)).join(' | ');
    } else if (prop.type === 'array' && prop.items) {
      const itemType = prop.items.$ref ? prop.items.$ref.split('/').pop() : prop.items.type || 'item';
      typeDisplay = `${itemType}[]`;
    }

    const constraints: string[] = [];
    if (prop.pattern) constraints.push(`pattern: ${prop.pattern}`);
    if (prop.minimum !== undefined) constraints.push(`min: ${prop.minimum}`);
    if (prop.maximum !== undefined) constraints.push(`max: ${prop.maximum}`);
    if (prop.minLength !== undefined) constraints.push(`minLength: ${prop.minLength}`);
    if (prop.maxLength !== undefined) constraints.push(`maxLength: ${prop.maxLength}`);

    let exampleStr: string | undefined;
    if (prop.examples && prop.examples.length > 0) {
      exampleStr = JSON.stringify(prop.examples[0]);
    } else if (prop.default !== undefined) {
      exampleStr = `default: ${JSON.stringify(prop.default)}`;
    }

    return {
      name,
      type: typeDisplay,
      isRequired,
      description: prop.description || '',
      constraints: constraints.length > 0 ? constraints : undefined,
      example: exampleStr
    };
  });
}

function SchemaPropertyTable({
  title,
  dotColor,
  properties
}: {
  title: string;
  dotColor: string;
  properties: SchemaPropertyInfo[];
}) {
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span>{title}</span>
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/60">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-800/80 text-slate-300 border-b border-slate-700">
              <th className="p-2 font-mono">Field Name</th>
              <th className="p-2 font-mono">Type / Constant</th>
              <th className="p-2">Required</th>
              <th className="p-2">Description / Constraints</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {properties.map((p) => (
              <tr key={p.name} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-2 font-mono text-cyan-300 font-medium">{p.name}</td>
                <td className="p-2 font-mono text-amber-300 text-[10px] break-all">{p.type}</td>
                <td className="p-2">
                  {p.isRequired ? (
                    <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 text-[10px]">
                      Required
                    </span>
                  ) : (
                    <span className="text-slate-500 text-[10px]">Optional</span>
                  )}
                </td>
                <td className="p-2 space-y-1">
                  <div>{p.description}</div>
                  {p.constraints && (
                    <div className="flex flex-wrap gap-1">
                      {p.constraints.map((c, i) => (
                        <span key={i} className="font-mono text-[9px] bg-slate-800 text-cyan-300 px-1 py-0.2 rounded border border-slate-700">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.example && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Example: <code className="text-slate-300">{p.example}</code>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DataSchemaModal({ isOpen, onClose }: DataSchemaModalProps) {
  const [activeTab, setActiveTab] = useState<'docs' | 'schema' | 'example'>('docs');
  const [selectedSchemaFamily, setSelectedSchemaFamily] = useState<'registry' | 'tag' | 'ndef'>('registry');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const currentSchemaObj = 
    selectedSchemaFamily === 'registry' 
      ? nfcTagRegistrySchema 
      : selectedSchemaFamily === 'tag' 
        ? nfcTagSchema 
        : ndefRecordSchema;

  const currentSchemaFilename = 
    selectedSchemaFamily === 'registry' 
      ? 'nfc-tag-registry.schema.json' 
      : selectedSchemaFamily === 'tag' 
        ? 'nfc-tag.schema.json' 
        : 'ndef-record.schema.json';

  const rawSchemaString = JSON.stringify(currentSchemaObj, null, 2);
  const rawExampleString = JSON.stringify(EXAMPLE_TAG_REGISTRY_V1, null, 2);

  // Derive field specs dynamically from Single Source of Truth schemas
  const rootProperties = extractPropertiesFromSchema(nfcTagRegistrySchema);
  const tagProperties = extractPropertiesFromSchema(nfcTagSchema);
  const textRecordProperties = extractPropertiesFromSchema(ndefRecordSchema?.$defs?.TextRecord);
  const urlRecordProperties = extractPropertiesFromSchema(ndefRecordSchema?.$defs?.UrlRecord);
  const mimeRecordProperties = extractPropertiesFromSchema(ndefRecordSchema?.$defs?.MimeRecord);
  const emptyRecordProperties = extractPropertiesFromSchema(ndefRecordSchema?.$defs?.EmptyRecord);

  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  };

  const handleDownloadSchema = () => {
    downloadJsonFile(currentSchemaFilename, rawSchemaString);
  };

  const handleDownloadExample = () => {
    downloadJsonFile('nfcweb-tags-example-v1.json', rawExampleString);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Data Schema & Interchange Specification">
      <div className="space-y-4 text-slate-200">
        
        {/* Header Badges & Provenance Info */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Format:</span>
            <span className="font-mono text-cyan-300 font-bold bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-500/30">
              {CANONICAL_FORMAT}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">Version:</span>
              <span className="font-mono text-emerald-300 font-bold bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/30">
                v{CANONICAL_SCHEMA_VERSION}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">Standard:</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                Draft 2020-12
              </span>
            </div>
            <a 
              href="/schemas" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline font-medium"
            >
              <span>Web Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
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
            <span>Schema Reference</span>
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
            <span>JSON Schemas</span>
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
            <span>Example Document (v1)</span>
          </button>
        </div>

        {/* Tab 1: Human-Readable Field Reference Derived from Schema */}
        {activeTab === 'docs' && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 text-xs">
            {/* Versioning & Single Source of Truth Note */}
            <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl space-y-1.5">
              <div className="font-bold text-blue-300 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Modular Architecture & Single Source of Truth</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                NFCWeb uses modular, independently reusable JSON Schema resources (Draft 2020-12):
                <code>NfcTagRegistryV1</code> → <code>NfcTagV1</code> → <code>NdefRecordV1</code>.
                Each resource defines its canonical <code>$id</code> dereferenceable via HTTPS.
              </p>
            </div>

            {/* Top-Level Document Structure */}
            <SchemaPropertyTable
              title="Root Document Structure (NfcTagRegistryV1)"
              dotColor="bg-cyan-400"
              properties={rootProperties}
            />

            {/* Tag Item Structure */}
            <SchemaPropertyTable
              title="Tag Item Structure (NfcTagV1)"
              dotColor="bg-emerald-400"
              properties={tagProperties}
            />

            {/* NDEF Record Variants */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs border-b border-slate-700/60 pb-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>NDEF Record Types (NdefRecordV1: oneOf & $anchor)</span>
              </h4>
              
              <SchemaPropertyTable
                title="1. Text Record (#text: recordType='text')"
                dotColor="bg-sky-400"
                properties={textRecordProperties}
              />

              <SchemaPropertyTable
                title="2. URL Record (#url: recordType='url')"
                dotColor="bg-teal-400"
                properties={urlRecordProperties}
              />

              <SchemaPropertyTable
                title="3. MIME Record (#mime: recordType='mime')"
                dotColor="bg-amber-400"
                properties={mimeRecordProperties}
              />

              <SchemaPropertyTable
                title="4. Empty Record (#empty: recordType='empty')"
                dotColor="bg-slate-400"
                properties={emptyRecordProperties}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Raw JSON Schema with selector for each modular resource */}
        {activeTab === 'schema' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedSchemaFamily('registry')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer border ${
                    selectedSchemaFamily === 'registry'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  nfc-tag-registry (v1)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSchemaFamily('tag')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer border ${
                    selectedSchemaFamily === 'tag'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  nfc-tag (v1)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSchemaFamily('ndef')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer border ${
                    selectedSchemaFamily === 'ndef'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  ndef-record (v1)
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCopy(rawSchemaString, 'schema')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  {copiedSection === 'schema' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copiedSection === 'schema' ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSchema}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-500/40 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
              <span>$id: {currentSchemaObj.$id}</span>
              <a 
                href={currentSchemaObj.$id.replace('https://nfcweb.ai.studio', '')}
                target="_blank" 
                rel="noreferrer"
                className="text-cyan-400 hover:underline"
              >
                Direct HTTP Endpoint →
              </a>
            </div>

            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 max-h-[50vh] overflow-auto select-all leading-relaxed whitespace-pre">
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
                  <span>{copiedSection === 'example' ? 'Copied' : 'Copy Example'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExample}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold border border-emerald-500/40 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
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
            Close
          </button>
        </div>

      </div>
    </Modal>
  );
}

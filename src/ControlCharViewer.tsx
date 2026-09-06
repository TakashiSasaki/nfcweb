import React, { useState } from 'react';
import { Eye, Code, Terminal, FileText, Check, Copy, ArrowRightLeft } from 'lucide-react';

export interface ControlCharStats {
  crlfCount: number;
  lfCount: number;
  crCount: number;
  tabCount: number;
  nulCount: number;
  lineCount: number;
  totalBytes: number;
  dominantEnding: 'CRLF' | 'LF' | 'CR' | 'MIXED' | 'NONE';
}

/**
 * Analyzes string control characters and line breaks
 */
export function analyzeControlChars(text: string): ControlCharStats {
  if (!text) {
    return {
      crlfCount: 0,
      lfCount: 0,
      crCount: 0,
      tabCount: 0,
      nulCount: 0,
      lineCount: 0,
      totalBytes: 0,
      dominantEnding: 'NONE',
    };
  }

  // Count CRLF
  const crlfMatches = text.match(/\r\n/g);
  const crlfCount = crlfMatches ? crlfMatches.length : 0;

  // Replace CRLF temporarily to accurately count standalone LF and CR
  const textWithoutCrlf = text.replace(/\r\n/g, '');
  const lfMatches = textWithoutCrlf.match(/\n/g);
  const lfCount = lfMatches ? lfMatches.length : 0;

  const crMatches = textWithoutCrlf.match(/\r/g);
  const crCount = crMatches ? crMatches.length : 0;

  const tabMatches = text.match(/\t/g);
  const tabCount = tabMatches ? tabMatches.length : 0;

  const nulMatches = text.match(/\0/g);
  const nulCount = nulMatches ? nulMatches.length : 0;

  const lines = text.split(/\r\n|\r|\n/);
  const totalBytes = new TextEncoder().encode(text).length;

  let dominantEnding: 'CRLF' | 'LF' | 'CR' | 'MIXED' | 'NONE' = 'NONE';
  if (crlfCount > 0 && lfCount === 0 && crCount === 0) {
    dominantEnding = 'CRLF';
  } else if (lfCount > 0 && crlfCount === 0 && crCount === 0) {
    dominantEnding = 'LF';
  } else if (crCount > 0 && crlfCount === 0 && lfCount === 0) {
    dominantEnding = 'CR';
  } else if (crlfCount > 0 || lfCount > 0 || crCount > 0) {
    dominantEnding = 'MIXED';
  }

  return {
    crlfCount,
    lfCount,
    crCount,
    tabCount,
    nulCount,
    lineCount: lines.length,
    totalBytes,
    dominantEnding,
  };
}

/**
 * Convert string to standard CRLF (\r\n) for vCard RFC standards
 */
export function toCRLF(text: string): string {
  if (!text) return text;
  return text.replace(/\r\n|\r|\n/g, '\r\n');
}

/**
 * Convert string to standard LF (\n) for UNIX standards
 */
export function toLF(text: string): string {
  if (!text) return text;
  return text.replace(/\r\n|\r|\n/g, '\n');
}

/**
 * Generate formatted Hex Dump representation of a string
 */
export function toHexDump(text: string): string {
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  const lines: string[] = [];
  const bytesPerLine = 16;

  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const chunk = bytes.slice(i, i + bytesPerLine);
    const offset = i.toString(16).padStart(4, '0').toUpperCase();
    
    // Hex representation
    const hexParts: string[] = [];
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < chunk.length) {
        const hex = chunk[j].toString(16).padStart(2, '0').toUpperCase();
        // Highlight CR (0D) and LF (0A)
        if (chunk[j] === 0x0D) {
          hexParts.push(`${hex}*`); // CR
        } else if (chunk[j] === 0x0A) {
          hexParts.push(`${hex}$`); // LF
        } else {
          hexParts.push(hex);
        }
      } else {
        hexParts.push('  ');
      }
    }
    
    const hexStr1 = hexParts.slice(0, 8).join(' ');
    const hexStr2 = hexParts.slice(8, 16).join(' ');
    
    // ASCII representation (replace control chars with dot)
    let asciiStr = '';
    for (let j = 0; j < chunk.length; j++) {
      const byte = chunk[j];
      if (byte >= 32 && byte <= 126) {
        asciiStr += String.fromCharCode(byte);
      } else if (byte === 0x0D) {
        asciiStr += '␍';
      } else if (byte === 0x0A) {
        asciiStr += '␊';
      } else if (byte === 0x09) {
        asciiStr += '␉';
      } else {
        asciiStr += '·';
      }
    }

    lines.push(`${offset}  ${hexStr1}  ${hexStr2}  |${asciiStr}|`);
  }

  return lines.join('\n');
}

/**
 * Formats a single string line or token with visible control character badges
 */
export function renderControlCharContent(text: string): React.ReactNode {
  if (!text) return <span className="text-slate-500 italic">&lt;Empty&gt;</span>;

  // Split by control sequences while preserving delimiters
  // Delimiters: \r\n, \n, \r, \t, \0
  const parts = text.split(/(\r\n|\n|\r|\t|\0)/);

  return (
    <span className="font-mono text-xs">
      {parts.map((part, index) => {
        if (part === '\r\n') {
          return (
            <React.Fragment key={index}>
              <span className="control-char-glyph control-char-crlf" title="CRLF: Carriage Return + Line Feed (\r\n) [0x0D 0x0A]">
                ␍␊ CRLF
              </span>
              <br />
            </React.Fragment>
          );
        }
        if (part === '\n') {
          return (
            <React.Fragment key={index}>
              <span className="control-char-glyph control-char-lf" title="LF: Line Feed (\n) [0x0A]">
                ␊ LF
              </span>
              <br />
            </React.Fragment>
          );
        }
        if (part === '\r') {
          return (
            <span key={index} className="control-char-glyph control-char-cr" title="CR: Carriage Return (\r) [0x0D]">
              ␍ CR
            </span>
          );
        }
        if (part === '\t') {
          return (
            <span key={index} className="control-char-glyph control-char-tab" title="TAB: Horizontal Tab (\t) [0x09]">
              ␉ TAB
            </span>
          );
        }
        if (part === '\0') {
          return (
            <span key={index} className="control-char-glyph control-char-nul" title="NUL: Null Byte (\0) [0x00]">
              ␀ NUL
            </span>
          );
        }
        return <span key={index} className="text-slate-200">{part}</span>;
      })}
    </span>
  );
}

interface ControlCharViewerProps {
  text: string;
  maxHeight?: string;
  compact?: boolean;
  showControlsBar?: boolean;
  onTextChange?: (newText: string) => void;
  title?: string;
}

export const ControlCharViewer: React.FC<ControlCharViewerProps> = ({
  text,
  maxHeight = 'max-h-60',
  compact = false,
  showControlsBar = true,
  onTextChange,
  title,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'escaped' | 'hexdump' | 'plain'>('visual');
  const [copied, setCopied] = useState(false);

  const stats = analyzeControlChars(text);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getEscapedString = (str: string) => {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/\r\n/g, '\\r\\n\n')
      .replace(/\n/g, '\\n\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\0/g, '\\0');
  };

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden space-y-0 text-xs">
      {/* Header Toolbar */}
      {showControlsBar && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 px-3 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {title && <span className="font-bold text-slate-300 text-xs">{title}</span>}
            
            {/* Ending Status Badge */}
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                stats.dominantEnding === 'CRLF'
                  ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                  : stats.dominantEnding === 'LF'
                  ? 'bg-blue-950/80 text-blue-300 border-blue-500/40'
                  : stats.dominantEnding === 'MIXED'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
              title={`CRLF: ${stats.crlfCount}, LF: ${stats.lfCount}, CR: ${stats.crCount}, TAB: ${stats.tabCount}`}
            >
              {stats.dominantEnding === 'CRLF' && `␍␊ CRLF (x${stats.crlfCount})`}
              {stats.dominantEnding === 'LF' && `␊ LF (x${stats.lfCount})`}
              {stats.dominantEnding === 'CR' && `␍ CR (x${stats.crCount})`}
              {stats.dominantEnding === 'MIXED' && `Mixed (${stats.crlfCount} CRLF / ${stats.lfCount} LF)`}
              {stats.dominantEnding === 'NONE' && 'Single Line'}
            </span>

            <span className="text-slate-500 font-mono text-[11px]">
              {stats.totalBytes} B
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('visual')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  viewMode === 'visual' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Visible Control Glyphs (␍␊ ␊ ␉)"
              >
                <Eye className="w-3 h-3" />
                <span>Symbols</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('escaped')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  viewMode === 'escaped' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Literal Escapes (\r\n \n)"
              >
                <Code className="w-3 h-3" />
                <span>\r\n</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hexdump')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  viewMode === 'hexdump' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Hex Dump View (0D 0A)"
              >
                <Terminal className="w-3 h-3" />
                <span>HEX</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('plain')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  viewMode === 'plain' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Plain raw text"
              >
                <FileText className="w-3 h-3" />
                <span>Plain</span>
              </button>
            </div>

            {/* Quick Conversion Actions (when mutable) */}
            {onTextChange && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => onTextChange(toCRLF(text))}
                  className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900 text-purple-300 rounded text-[10px] font-bold border border-purple-500/30 transition-colors"
                  title="Normalize all line breaks to CRLF (\r\n) [vCard RFC Standard]"
                >
                  To CRLF
                </button>
                <button
                  type="button"
                  onClick={() => onTextChange(toLF(text))}
                  className="px-2 py-1 bg-blue-950/60 hover:bg-blue-900 text-blue-300 rounded text-[10px] font-bold border border-blue-500/30 transition-colors"
                  title="Normalize all line breaks to LF (\n) [UNIX Standard]"
                >
                  To LF
                </button>
              </div>
            )}

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors ml-0.5"
              title="Copy Raw Text"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className={`p-3 overflow-auto ${maxHeight} font-mono leading-relaxed select-all`}>
        {viewMode === 'visual' && (
          <div className="whitespace-pre-wrap break-all">
            {renderControlCharContent(text)}
          </div>
        )}

        {viewMode === 'escaped' && (
          <pre className="text-purple-300 whitespace-pre-wrap break-all text-xs font-mono">
            {getEscapedString(text) || <span className="text-slate-500 italic">&lt;Empty&gt;</span>}
          </pre>
        )}

        {viewMode === 'hexdump' && (
          <pre className="text-emerald-400 whitespace-pre text-[11px] font-mono leading-tight">
            {toHexDump(text) || <span className="text-slate-500 italic">&lt;Empty&gt;</span>}
          </pre>
        )}

        {viewMode === 'plain' && (
          <pre className="text-slate-300 whitespace-pre-wrap break-all text-xs font-mono">
            {text || <span className="text-slate-500 italic">&lt;Empty&gt;</span>}
          </pre>
        )}
      </div>
    </div>
  );
};

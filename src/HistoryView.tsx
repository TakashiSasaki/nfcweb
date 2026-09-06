import React, { useState } from 'react';
import { History, Trash2, Eye, Copy, Check, Tag, FileCode } from 'lucide-react';
import { NFCLog } from './types';
import { Modal } from './Modal';
import { ControlCharViewer, renderControlCharContent } from './ControlCharViewer';

export function HistoryView({ store }: { store: any }) {
  const { logs, clearLogs, deleteLog } = store;
  const [selectedLog, setSelectedLog] = useState<NFCLog | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const handleCopyId = (id: string) => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full bg-[#1E293B] rounded-2xl border border-slate-700 overflow-hidden shadow-sm">
      <div className="p-4 sm:p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/30">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Action History</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Chronological record of NFC scans and writes.</p>
        </div>
        {logs.length > 0 && (
          <button 
            onClick={clearLogs} 
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-red-500/20"
          >
            <Trash2 className="w-4 h-4" /> 
            <span className="hidden sm:inline">Clear History</span>
            <span className="sm:hidden">Clear</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 text-center">
            <History className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-400">No history available</p>
            <p className="text-xs text-slate-500 mt-1">Scanned tags and write operations will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {logs.map((log: NFCLog) => {
              const hasRecords = log.rawRecords && log.rawRecords.length > 0;
              return (
                <div key={log.id} className="flex items-center justify-between p-3.5 sm:p-4 bg-slate-800/50 border border-slate-700/80 rounded-xl hover:bg-slate-800/80 transition-colors gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs uppercase ${
                      log.action === 'read' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                      log.action === 'write' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {log.action[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-slate-200 truncate">{log.messageSummary}</h4>
                        {log.action === 'read' && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                            hasRecords ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {hasRecords ? `${log.rawRecords.length} records` : 'ID only'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                        <span className="text-[11px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.serialNumber && (
                          <span className="font-mono bg-slate-900/90 text-cyan-300 border border-cyan-500/20 px-1.5 py-0.5 rounded text-[10px]">
                            {log.serialNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button 
                      onClick={() => setSelectedLog(log)} 
                      className="p-2 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors" 
                      title="View Details"
                      aria-label="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteLog(log.id)} 
                      className="p-2 text-slate-400 hover:text-red-400 bg-slate-700/50 hover:bg-slate-600 rounded-lg transition-colors" 
                      title="Delete Entry"
                      aria-label="Delete Entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="History Details">
        {selectedLog && (
          <div className="space-y-3.5 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/80">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</div>
                <div className="text-sm font-semibold text-slate-200 capitalize mt-0.5">{selectedLog.action}</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/80">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Timestamp</div>
                <div className="text-xs sm:text-sm text-slate-200 mt-0.5">{new Date(selectedLog.timestamp).toLocaleString()}</div>
              </div>
            </div>

            {selectedLog.serialNumber && (
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/80">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3 text-cyan-400" />
                    Tag ID (Serial / UID)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyId(selectedLog.serialNumber!)}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-semibold text-slate-300 transition-colors"
                  >
                    {copiedId ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-300" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-sm font-mono font-bold text-cyan-300 bg-slate-950 p-2 rounded-lg border border-slate-800 break-all select-all">
                  {selectedLog.serialNumber}
                </div>
              </div>
            )}

            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/80 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>NDEF Records</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  selectedLog.rawRecords && selectedLog.rawRecords.length > 0 
                    ? 'bg-blue-500/20 text-blue-300' 
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {selectedLog.rawRecords?.length || 0} found
                </span>
              </div>
              <div>
                {selectedLog.rawRecords && selectedLog.rawRecords.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedLog.rawRecords.map((r: any, idx: number) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-cyan-400 font-mono font-bold">
                          <span>{r.recordType || 'record'} #{idx + 1} {r.mediaType ? `(${r.mediaType})` : ''}</span>
                        </div>
                        {typeof r.data === 'string' && (r.data.includes('\n') || r.data.includes('\r') || r.data.includes('\t')) ? (
                          <ControlCharViewer text={r.data} maxHeight="max-h-40" />
                        ) : (
                          <div className="text-xs font-mono text-slate-200 bg-slate-900/90 p-2 rounded border border-slate-800 break-all">
                            {typeof r.data === 'string' ? renderControlCharContent(r.data) : JSON.stringify(r.data)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-amber-400 font-medium">No NDEF records stored.</span>
                    <p className="text-[11px] text-slate-500 mt-1">This tag was read by UID / Serial only.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  X, 
  WifiOff, 
  ShieldAlert, 
  Lock, 
  Smartphone,
  Radio
} from 'lucide-react';

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // ms (0 = persistent)
  actionLabel?: string;
  onAction?: () => void;
  iconType?: 'nfc' | 'lock' | 'shield' | 'signal' | 'smartphone' | 'default';
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  showNFCError: (error: any, context?: 'read' | 'write' | 'erase' | 'general') => string;
  showSuccess: (title: string, message: string, duration?: number) => string;
  showWarning: (title: string, message: string, duration?: number) => string;
  showInfo: (title: string, message: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

/**
 * Intelligent parser for common Web NFC DOMExceptions and real-world mobile NFC errors
 */
export function parseNFCError(
  err: any, 
  context: 'read' | 'write' | 'erase' | 'general' = 'general'
): { title: string; message: string; type: ToastType; iconType: ToastItem['iconType'] } {
  const errorName = err?.name || '';
  const errorMsg = (err?.message || String(err || '')).toLowerCase();

  // 1. Abort / Cancelled
  if (errorName === 'AbortError' || errorMsg.includes('aborted') || errorMsg.includes('cancelled')) {
    return {
      title: 'NFC Operation Cancelled',
      message: 'The NFC scan or write session was stopped.',
      type: 'info',
      iconType: 'default'
    };
  }

  // 2. Permission Denied / Not Allowed
  if (
    errorName === 'NotAllowedError' || 
    errorName === 'SecurityError' || 
    errorMsg.includes('permission') || 
    errorMsg.includes('not allowed') ||
    errorMsg.includes('user gesture')
  ) {
    return {
      title: 'NFC Permission Denied',
      message: 'NFC permission was denied or not granted. Please check browser and system settings, and ensure NFC is toggled ON.',
      type: 'error',
      iconType: 'shield'
    };
  }

  // 3. Not Supported
  if (
    errorName === 'NotSupportedError' || 
    errorMsg.includes('not supported') || 
    errorMsg.includes('undef') || 
    errorMsg.includes('ndefreader is not defined')
  ) {
    return {
      title: 'Web NFC Not Supported',
      message: 'Web NFC API is not available in this browser. Please use Chrome 89+ on an NFC-enabled Android device over HTTPS.',
      type: 'error',
      iconType: 'smartphone'
    };
  }

  // 4. Tag Removed Prematurely / Network / I/O Disconnect
  if (
    errorName === 'NetworkError' || 
    errorMsg.includes('io') || 
    errorMsg.includes('tag was lost') || 
    errorMsg.includes('connection lost') || 
    errorMsg.includes('transfer failed') ||
    errorMsg.includes('disconnected') ||
    errorMsg.includes('removed')
  ) {
    if (context === 'write') {
      return {
        title: 'Tag Removed During Write',
        message: 'The NFC tag was moved away before writing finished. Hold the tag firmly against your phone until confirmation appears.',
        type: 'error',
        iconType: 'signal'
      };
    }
    return {
      title: 'Tag Removed During Scan',
      message: 'Tag connection was lost during read. Keep the NFC tag in contact with the back of the device for 1-2 seconds.',
      type: 'warning',
      iconType: 'signal'
    };
  }

  // 5. Read-only / Locked Tag on write
  if (
    errorMsg.includes('read-only') || 
    errorMsg.includes('readonly') || 
    errorMsg.includes('locked') || 
    errorMsg.includes('write-protected')
  ) {
    return {
      title: 'Tag is Read-Only',
      message: 'This NFC tag is permanently locked or write-protected and cannot be overwritten.',
      type: 'error',
      iconType: 'lock'
    };
  }

  // 6. Capacity Exceeded
  if (
    errorMsg.includes('capacity') || 
    errorMsg.includes('overflow') || 
    errorMsg.includes('too large') || 
    errorMsg.includes('exceed') ||
    errorMsg.includes('quota')
  ) {
    return {
      title: 'Tag Memory Full',
      message: 'The NDEF payload is too large to fit in this tag memory (e.g. NTAG213 144-byte limit). Reduce payload size or use an NTAG215/216.',
      type: 'error',
      iconType: 'nfc'
    };
  }

  // 7. Not Readable / Corrupted NDEF
  if (
    errorName === 'NotReadableError' || 
    errorMsg.includes('corrupt') || 
    errorMsg.includes('parse') || 
    errorMsg.includes('format') ||
    errorMsg.includes('checksum')
  ) {
    return {
      title: 'Tag Read Error',
      message: 'Detected an NFC tag, but its NDEF data could not be parsed or is unformatted.',
      type: 'warning',
      iconType: 'nfc'
    };
  }

  // 8. Invalid State
  if (errorName === 'InvalidStateError' || errorMsg.includes('busy')) {
    return {
      title: 'NFC Reader Busy',
      message: 'An existing NFC scan or write operation is already running. Please cancel or wait for it to finish.',
      type: 'warning',
      iconType: 'default'
    };
  }

  // Fallback generic error
  return {
    title: context === 'write' ? 'NFC Write Error' : context === 'erase' ? 'NFC Erase Error' : 'NFC Error',
    message: err?.message || 'An unexpected NFC operation error occurred. Please try again.',
    type: 'error',
    iconType: 'default'
  };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const duration = toast.duration !== undefined ? toast.duration : (toast.type === 'error' ? 6000 : 4500);

    const newItem: ToastItem = {
      ...toast,
      id,
      duration
    };

    setToasts(prev => [newItem, ...prev.slice(0, 4)]); // Keep max 5 active toasts
    return id;
  }, []);

  const showNFCError = useCallback((err: any, context: 'read' | 'write' | 'erase' | 'general' = 'general') => {
    const parsed = parseNFCError(err, context);
    return addToast({
      type: parsed.type,
      title: parsed.title,
      message: parsed.message,
      iconType: parsed.iconType,
      duration: parsed.type === 'error' ? 7000 : 5000
    });
  }, [addToast]);

  const showSuccess = useCallback((title: string, message: string, duration: number = 4000) => {
    return addToast({
      type: 'success',
      title,
      message,
      duration
    });
  }, [addToast]);

  const showWarning = useCallback((title: string, message: string, duration: number = 5000) => {
    return addToast({
      type: 'warning',
      title,
      message,
      duration
    });
  }, [addToast]);

  const showInfo = useCallback((title: string, message: string, duration: number = 4000) => {
    return addToast({
      type: 'info',
      title,
      message,
      duration
    });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, showNFCError, showSuccess, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastItemCardProps {
  key?: string;
  toast: ToastItem;
  onRemove: (id: string) => void;
}

function ToastItemCard({ toast, onRemove }: ToastItemCardProps) {
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onRemove]);

  const getIcon = () => {
    if (toast.iconType === 'lock') return <Lock className="w-5 h-5 text-amber-400" />;
    if (toast.iconType === 'shield') return <ShieldAlert className="w-5 h-5 text-red-400" />;
    if (toast.iconType === 'signal') return <WifiOff className="w-5 h-5 text-amber-400" />;
    if (toast.iconType === 'smartphone') return <Smartphone className="w-5 h-5 text-red-400" />;
    if (toast.iconType === 'nfc') return <Radio className="w-5 h-5 text-blue-400" />;

    switch (toast.type) {
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case 'error':
        return {
          bg: 'bg-[#1E1B2E] border-red-500/50 shadow-red-950/50',
          iconBg: 'bg-red-500/20 border-red-500/30 text-red-400',
          titleColor: 'text-red-300',
          barColor: 'bg-red-500'
        };
      case 'warning':
        return {
          bg: 'bg-[#2A2318] border-amber-500/50 shadow-amber-950/50',
          iconBg: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
          titleColor: 'text-amber-300',
          barColor: 'bg-amber-500'
        };
      case 'success':
        return {
          bg: 'bg-[#162923] border-emerald-500/50 shadow-emerald-950/50',
          iconBg: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
          titleColor: 'text-emerald-300',
          barColor: 'bg-emerald-500'
        };
      default:
        return {
          bg: 'bg-[#1A2436] border-blue-500/50 shadow-blue-950/50',
          iconBg: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
          titleColor: 'text-blue-300',
          barColor: 'bg-blue-500'
        };
    }
  };

  const styles = getStyles();

  return (
    <div 
      className={`relative w-full max-w-sm sm:max-w-md ${styles.bg} border rounded-2xl p-4 shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in slide-in-from-top-3 duration-250 transition-all pointer-events-auto`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${styles.iconBg} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <h4 className={`text-sm font-bold ${styles.titleColor} leading-tight`}>
            {toast.title}
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">
            {toast.message}
          </p>

          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                onRemove(toast.id);
              }}
              className="mt-2 text-xs font-semibold px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors inline-block"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(toast.id)}
          className="p-1 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
          title="Dismiss toast"
          aria-label="Dismiss toast"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      {toast.duration && toast.duration > 0 && (
        <div 
          className={`absolute bottom-0 left-0 right-0 h-1 ${styles.barColor} opacity-70 origin-left`}
          style={{
            animation: `toast-progress ${toast.duration}ms linear forwards`
          }}
        />
      )}
    </div>
  );
}

export function ToastContainer({ 
  toasts, 
  onRemove 
}: { 
  toasts: ToastItem[]; 
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed top-16 sm:top-20 right-3 sm:right-6 left-3 sm:left-auto z-50 flex flex-col gap-2.5 pointer-events-none items-end max-w-full"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <ToastItemCard key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

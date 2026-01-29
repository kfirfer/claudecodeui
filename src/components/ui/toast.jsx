import { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const toastVariants = {
  default: 'bg-background border-border',
  success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  warning: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
  info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
};

const iconVariants = {
  default: null,
  success: <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />,
  info: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
};

function Toast({ id, message, variant = 'default', onClose }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-top-2 fade-in duration-200',
        toastVariants[variant]
      )}
      role="alert"
    >
      {iconVariants[variant]}
      <p className="flex-1 text-sm text-foreground">{message}</p>
      <button
        type="button"
        onClick={() => onClose(id)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'default', duration = 5000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, variant }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, variant = 'default', duration = 5000) => {
    return addToast(message, variant, duration);
  }, [addToast]);

  toast.success = (message, duration) => addToast(message, 'success', duration);
  toast.error = (message, duration) => addToast(message, 'error', duration);
  toast.warning = (message, duration) => addToast(message, 'warning', duration);
  toast.info = (message, duration) => addToast(message, 'info', duration);

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-md">
        {toasts.map(t => (
          <Toast
            key={t.id}
            id={t.id}
            message={t.message}
            variant={t.variant}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

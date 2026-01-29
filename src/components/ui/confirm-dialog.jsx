import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

const ConfirmContext = createContext(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

function ConfirmDialog({ isOpen, title, message, confirmText, cancelText, variant, onConfirm, onCancel }) {
  if (!isOpen) return null;

  const isDestructive = variant === 'destructive';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 fade-in duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            {isDestructive && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
            )}
            <div className="flex-1">
              {title && (
                <h3 className={cn(
                  'text-lg font-semibold',
                  isDestructive ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                )}>
                  {title}
                </h3>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-muted/50 rounded-b-lg">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            {cancelText || 'Cancel'}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmText || 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const resolveRef = useRef(null);
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
  });

  const confirm = useCallback((options) => {
    // oxlint-disable-next-line eslint-plugin-promise(avoid-new) -- Promise is required for async confirm dialog pattern
    return new Promise((resolve) => {
      const config = typeof options === 'string'
        ? { message: options }
        : options;

      resolveRef.current = resolve;
      setDialogState({
        isOpen: true,
        title: config.title || '',
        message: config.message || '',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        variant: config.variant || 'default',
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        variant={dialogState.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

import { useTranslation } from 'react-i18next';
import './Modal.css';

interface ProgressModalProps {
  open: boolean;
  message?: string;
  onCancel?: () => void;
}

/**
 * A blocking modal that shows a spinner and message during long-running operations.
 * The user can only cancel — no other interaction is possible while open.
 */
export default function ProgressModal({ open, message, onCancel }: ProgressModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="modal-overlay modal-open">
      <div className="modal-dialog modal-dialog-open progress-modal">
        <div className="progress-modal-body">
          <div className="progress-modal-spinner" />
          <span className="progress-modal-message">{message || t('pleaseWait')}</span>
          {onCancel && (
            <button className="progress-modal-cancel" onClick={onCancel}>
              {t('cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

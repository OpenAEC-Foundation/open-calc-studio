import React from 'react';
import { uiText } from '@/i18n/uiText';

/** A message above a list (library and price update dialogs), with a close button. */
export const Banner: React.FC<{
  kind: 'note' | 'info' | 'warn' | 'error';
  role?: 'status' | 'alert';
  className?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ kind, role, className, onClose, children }) => (
  <div role={role} className={`rp-banner ${kind}${className ? ` ${className}` : ''}`}>
    <span className="rp-banner-text">{children}</span>
    <button type="button" className="rp-banner-close" aria-label={uiText('close', 'Close')} title={uiText('close', 'Close')} onClick={onClose}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M12.78 4.28a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72z" />
      </svg>
    </button>
  </div>
);

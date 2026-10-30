import { useEffect, useRef, type RefObject } from 'react';

const dialogs: HTMLElement[] = [];
const selector = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** One keyboard scope for both shared desktop dialogs and mobile sheets. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement;
  wasOpen.current = open;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = opener.current;
    dialogs.push(dialog);
    const top = () => dialogs[dialogs.length - 1] === dialog;
    const focusables = () => [...dialog.querySelectorAll<HTMLElement>('*')].filter(el => el.matches(selector) && el.tabIndex >= 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden').sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Number.MAX_SAFE_INTEGER) - (b.tabIndex > 0 ? b.tabIndex : Number.MAX_SAFE_INTEGER));
    const focusFirst = () => (dialog.querySelector<HTMLElement>('[autofocus]') ?? focusables()[0] ?? dialog).focus();
    if (!dialog.contains(document.activeElement)) focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (!top()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const entries = focusables();
      const index = entries.indexOf(document.activeElement as HTMLElement);
      if (!entries.length || (event.shiftKey && index <= 0) || (!event.shiftKey && (index === entries.length - 1 || index === -1))) {
        event.preventDefault(); (event.shiftKey ? entries[entries.length - 1] : entries[0])?.focus();
        if (!entries.length) dialog.focus();
      }
    };
    const focusin = (event: FocusEvent) => { if (top() && !dialog.contains(event.target as Node)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      const wasTop = top();
      const index = dialogs.indexOf(dialog); if (index !== -1) dialogs.splice(index, 1);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      if (wasTop && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, ref]);
}

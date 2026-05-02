import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  className?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, className, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasBeenDragged = useRef(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      hasBeenDragged.current = false;
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else if (visible) {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Reset position when dialog becomes visible
  useEffect(() => {
    if (visible && dialogRef.current) {
      dialogRef.current.style.left = "";
      dialogRef.current.style.top = "";
      dialogRef.current.style.transform = "";
    }
  }, [visible]);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".modal-close-btn")) return;
    if (!dialogRef.current || !overlayRef.current) return;

    isDragging.current = true;
    hasBeenDragged.current = true;

    // Capture current visual position and convert to left/top
    const dialogRect = dialogRef.current.getBoundingClientRect();
    const overlayRect = overlayRef.current.getBoundingClientRect();
    const currentX = dialogRect.left - overlayRect.left;
    const currentY = dialogRect.top - overlayRect.top;

    // Switch from CSS centering to absolute positioning
    dialogRef.current.style.left = currentX + "px";
    dialogRef.current.style.top = currentY + "px";
    dialogRef.current.style.transform = "none";
    dialogRef.current.classList.add("modal-dragged");

    dragOffset.current = { x: e.clientX - dialogRect.left, y: e.clientY - dialogRect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dialogRef.current || !overlayRef.current) return;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const dialogRect = dialogRef.current.getBoundingClientRect();
      let newX = e.clientX - overlayRect.left - dragOffset.current.x;
      let newY = e.clientY - overlayRect.top - dragOffset.current.y;
      newX = Math.max(0, Math.min(newX, overlayRect.width - dialogRect.width));
      newY = Math.max(0, Math.min(newY, overlayRect.height - dialogRect.height));
      dialogRef.current.style.left = newX + "px";
      dialogRef.current.style.top = newY + "px";
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className={`modal-overlay${animating ? ' modal-open' : ''}`} ref={overlayRef}>
      <div
        className={`modal-dialog${className ? ` ${className}` : ''}${animating ? ' modal-dialog-open' : ''}`}
        ref={dialogRef}
      >
        <div className="modal-header" onMouseDown={handleHeaderMouseDown}>
          <h2>{title}</h2>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

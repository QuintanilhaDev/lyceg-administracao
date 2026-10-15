'use client';
import { fx } from '@/lib/fx';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';

/** Janela que sobe de baixo no celular e fica no centro no computador. */
export function Sheet({
  title,
  lead,
  onClose,
  children,
  wide,
}: {
  title: string;
  lead?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="overlay sheet-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className={`modal sheet${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...fx.modal}
      >
        <div className="sheet-head">
          <div>
            <h3>{title}</h3>
            {lead ? <p>{lead}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

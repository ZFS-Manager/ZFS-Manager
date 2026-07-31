import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

/**
 * Unified application modal — single source of truth for pop-up styling
 * (centered dialog, border radius 14, blur backdrop, framer-motion entry).
 * Wrap usage in <AnimatePresence> for exit animations.
 */
export default function Modal({ title, onClose, children, maxWidth = 440 }: ModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="card"
        style={{ width: '100%', maxWidth, padding: 28, borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.4)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', margin: 0 }}>
            {title}
          </h3>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, background: 'transparent',
            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

import React from 'react';
import { motion } from 'framer-motion';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  if (localStorage.getItem('page_animations') === 'false') return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

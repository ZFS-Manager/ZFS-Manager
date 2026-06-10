import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function get(): Breakpoint {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1200) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(get);
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return bp;
}

export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

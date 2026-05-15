import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Lock, ArrowRight, AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [isError, setIsError]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/v1/health');
        if (res.ok) setBackendStatus('online');
        else setBackendStatus('offline');
      } catch {
        setBackendStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);
    try {
      await onLogin(password);
    } catch {
      setIsError(true);
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* Animated grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      {/* Radial glow spots */}
      {[
        { top: '10%',  left: '15%',  size: 480, delay: '0s',   dur: '4s'  },
        { top: '65%',  left: '5%',   size: 360, delay: '1s',   dur: '5s'  },
        { top: '20%',  left: '75%',  size: 400, delay: '2s',   dur: '4.5s'},
        { top: '80%',  left: '60%',  size: 320, delay: '0.5s', dur: '6s'  },
        { top: '45%',  left: '40%',  size: 280, delay: '1.5s', dur: '3.5s'},
      ].map((g, i) => (
        <div key={i} className="glow-pulse" style={{
          position: 'absolute',
          top: g.top, left: g.left,
          width: g.size, height: g.size,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none', zIndex: 0,
          animationDelay: g.delay,
          animationDuration: g.dur,
        }} />
      ))}
      {/* ── Left panel ── */}
      <div style={{
        display: 'none',
        width: '52%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        position: 'relative',
        overflow: 'hidden',
        zIndex: 1,
      }} className="lg:flex">

        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.4,
          backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
            borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HardDrive size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600,
            color: 'var(--text-secondary)', letterSpacing: '-0.01em',
          }}>
            ZFS Manager
          </span>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative' }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.2em',
            marginBottom: 20,
          }}>
            Infrastructure Control
          </p>
          <h1 style={{
            fontFamily: 'var(--font-ui)', fontSize: 52, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.03em',
            lineHeight: 1.08, marginBottom: 20,
          }}>
            Storage<br />
            <span style={{ color: 'var(--text-muted)', fontWeight: 300 }}>at scale.</span>
          </h1>
          <p style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-muted)',
            lineHeight: 1.7, maxWidth: 340,
          }}>
            Real-time ZFS pool management, performance telemetry, and storage analytics for production infrastructure.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 40 }}>
          {['ZFS Native', 'OpenZFS', 'REST API'].map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <div style={{ width: 1, height: 28, background: 'var(--border)' }} />}
              <div>
                <div style={{
                  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2,
                }}>
                  {label === 'ZFS Native' ? 'Kernel module' : label === 'OpenZFS' ? 'Compatible' : 'v1 — stable'}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Right panel (login form) ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Status pill top-right */}
        <div style={{
          position: 'absolute', top: 24, right: 24,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 20,
          background: backendStatus === 'online' ? 'rgba(34,197,94,0.1)' : backendStatus === 'offline' ? 'rgba(239,68,68,0.1)' : 'rgba(156,163,175,0.1)',
          border: '1px solid',
          borderColor: backendStatus === 'online' ? 'rgba(34,197,94,0.2)' : backendStatus === 'offline' ? 'rgba(239,68,68,0.2)' : 'rgba(156,163,175,0.2)',
          transition: 'all 0.3s ease',
        }}>
          {backendStatus === 'online' ? (
            <Wifi size={12} style={{ color: 'var(--success)' }} />
          ) : (
            <WifiOff size={12} style={{ color: backendStatus === 'offline' ? 'var(--danger)' : 'var(--text-muted)' }} />
          )}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            color: backendStatus === 'online' ? 'var(--success)' : backendStatus === 'offline' ? 'var(--danger)' : 'var(--text-muted)',
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {backendStatus === 'online' ? 'Backend Online' : backendStatus === 'offline' ? 'Backend Offline' : 'Checking...'}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ width: '100%', maxWidth: 420 }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 40,
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>
          {/* Logo inside card — always visible */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)',
              borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HardDrive size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
              ZFS Manager
            </span>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-ui)', fontSize: 24, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
            marginBottom: 6,
          }}>
            Welcome back
          </h2>
          <p style={{
            fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-muted)',
            marginBottom: 32,
          }}>
            Enter your access key to continue
          </p>

          <AnimatePresence>
            {backendStatus === 'offline' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginBottom: 24, padding: '10px 14px', borderRadius: 'var(--radius)',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem'
                }}
              >
                <WifiOff size={16} />
                <span>Cannot reach backend server. Check connection.</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontFamily: 'var(--font-ui)',
                fontSize: 11, fontWeight: 500, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
              }}>
                Password
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--bg-elevated)',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '0 12px',
                transition: 'border-color 0.12s',
              }}
              onFocus={() => {}}
              >
                <Lock size={14} style={{ color: isError ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1, height: 40,
                    background: 'transparent', border: 'none', outline: 'none',
                    fontFamily: 'var(--font-ui)', fontSize: 14,
                    color: 'var(--text-primary)',
                  }}
                  onFocus={e => {
                    const parent = e.currentTarget.parentElement as HTMLElement;
                    if (parent) parent.style.borderColor = 'var(--accent)';
                    if (parent) parent.style.boxShadow = '0 0 0 3px var(--accent-dim)';
                  }}
                  onBlur={e => {
                    const parent = e.currentTarget.parentElement as HTMLElement;
                    if (parent) parent.style.borderColor = isError ? 'rgba(239,68,68,0.5)' : 'var(--border)';
                    if (parent) parent.style.boxShadow = 'none';
                  }}
                />
              </div>
              <AnimatePresence>
                {isError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginTop: 8, fontSize: 12,
                      color: 'var(--danger)', fontFamily: 'var(--font-ui)',
                    }}
                  >
                    <AlertCircle size={12} />
                    Incorrect password — access denied
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={isLoading || !password}
              style={{
                width: '100%', height: 40,
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontFamily: 'var(--font-ui)',
                fontSize: 14, fontWeight: 600,
                color: '#fff',
                cursor: isLoading || !password ? 'not-allowed' : 'pointer',
                opacity: isLoading || !password ? 0.5 : 1,
                transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!isLoading && password) (e.currentTarget as HTMLElement).style.background = '#4f52e8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
            >
              {isLoading ? (
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                <>
                  Continue
                  <ArrowRight size={15} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <p style={{
            marginTop: 24, textAlign: 'center',
            fontFamily: 'var(--font-ui)', fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            Password-protected · TLS encrypted
          </p>
          </div>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.03; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.07; transform: translate(-50%, -50%) scale(1.15); }
        }
        .glow-pulse { animation: glowPulse 4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

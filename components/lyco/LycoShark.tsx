'use client';
import { useEffect, useRef, useState } from 'react';
import { getFx } from '@/lib/fx';
import type { Shark, SharkState } from './sharkScene';
import './lyco.css';

export type OrbState = SharkState;

function webgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * O Lyco, tubarão assistente da Lyceg, em 3D. Enquanto o 3D carrega (ou em aparelho sem WebGL),
 * aparece o desenho do mesmo tubarão, então nada "pisca" na tela.
 */
export function LycoShark({ size, state, alert = false, className }: { size: number; state: OrbState; alert?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shark = useRef<Shark | null>(null);
  const [ready, setReady] = useState(false);
  const live = useRef({ state, alert });
  live.current = { state, alert };

  useEffect(() => {
    if (!canvas.current || !webgl()) return;
    let alive = true;
    const c = canvas.current;
    // o three.js chega num arquivo separado: não atrasa a abertura da tela
    void import('./sharkScene').then(({ createShark }) => {
      if (!alive) return;
      try {
        shark.current = createShark(c, { reduced: getFx() === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches, pixelRatio: Math.min(window.devicePixelRatio || 1, size < 160 ? 2.5 : 2) });
        shark.current.setState(live.current.state, live.current.alert);
        requestAnimationFrame(() => alive && setReady(true));
      } catch {
        /* sem 3D: fica o desenho */
      }
    });
    return () => {
      alive = false;
      shark.current?.dispose();
      shark.current = null;
    };
  }, [size]);

  useEffect(() => {
    shark.current?.setState(state, alert);
  }, [state, alert]);

  return (
    <span className={`lyco-shark is-${state}${alert ? ' is-alert' : ''}${ready ? ' is-3d' : ''}${className ? ' ' + className : ''}`} style={{ width: size, height: size }} aria-hidden>
      <canvas ref={canvas} className="lyco-shark-canvas" />
      <SharkPoster />
    </span>
  );
}

/** O mesmo tubarão, desenhado (aparece enquanto o 3D carrega e onde não há WebGL). */
export function SharkPoster() {
  return (
    <svg className="lyco-shark-poster" viewBox="0 0 200 200" role="presentation">
      <defs>
        <linearGradient id="lyS-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07123a" />
          <stop offset="0.5" stopColor="#0f2766" />
          <stop offset="0.6" stopColor="#dfe3ea" />
          <stop offset="1" stopColor="#c9ced8" />
        </linearGradient>
        <radialGradient id="lyS-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="160" rx="78" ry="8" fill="url(#lyS-shadow)" />
      <path d="M30 104 L10 66 q14 22 22 30 q-8 14 -18 40z" fill="#07123a" />
      <path d="M78 76 q8 -30 26 -40 q-4 22 2 40z" fill="#07123a" />
      <path d="M26 104 q40 -40 112 -30 q30 6 44 30 q-18 26 -60 32 q-60 6 -96 -32z" fill="url(#lyS-body)" />
      <path d="M96 120 q-6 18 -20 26 q20 -2 32 -18z" fill="#0f2766" />
      <g stroke="#05060a" strokeWidth="2.2" strokeLinecap="round">
        <path d="M84 96 v16" /><path d="M89 95 v17" /><path d="M94 95 v17" /><path d="M99 95 v16" />
      </g>
      <circle cx="146" cy="92" r="5.5" fill="#05060a" />
      <circle cx="146" cy="92" r="3.6" fill="none" stroke="#e3a92f" strokeWidth="1.2" />
      <path d="M136 84 q10 -2 18 6" stroke="#07123a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M128 112 q22 8 50 -6" stroke="#05060a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M140 114 l2 5 l2 -5 M150 114 l2 5 l2 -5 M160 112 l2 5 l2 -5 M169 109 l2 4 l2 -4" stroke="#f5f3ea" strokeWidth="1.6" fill="none" />
      <path d="M104 66 q4 -24 32 -24 q26 2 28 24z" fill="#07070a" />
      <path d="M136 66 q22 -4 38 6 q-18 2 -38 0z" fill="#07070a" />
      <circle cx="134" cy="42" r="2.4" fill="#e3a92f" />
      <text x="142" y="60" textAnchor="middle" fontFamily="Sora, system-ui, sans-serif" fontWeight="800" fontSize="11" fill="#4c7dff">
        Lyceg
      </text>
    </svg>
  );
}

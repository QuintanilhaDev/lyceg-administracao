'use client';
import { canvasColors, rgb } from '@/lib/canvasColors';
import { getFx, useFx } from '@/lib/fx';
import { useEffect, useRef } from 'react';

/* =====================================================================
 * Fundo "Abismo" da Lyceg: o mar profundo visto de dentro. Feixes de luz
 * descem da superfície e balançam devagar, partículas em várias
 * profundidades sobem (paralaxe com o mouse) e se afastam do cursor, e
 * pulsos de sonar azul royal atravessam a tela de tempos em tempos.
 * Canvas 2D com projeção própria (sem bibliotecas): ~30 quadros por segundo,
 * pausa com a aba escondida e vira um quadro parado para quem pede menos movimento.
 * ===================================================================== */

interface Mote {
  x: number;
  y: number;
  z: number; // 0.15 (longe) .. 1 (perto)
  vx: number;
  vy: number;
  gold: boolean;
  tw: number;
}

export function AbyssField({ variant = 'app' }: { variant?: 'app' | 'login' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fx = useFx();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || fx === 'off') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const login = variant === 'login';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let running = true;
    const ptr = { x: -9999, y: -9999, px: 0, py: 0, tx: 0, ty: 0 };
    const motes: Mote[] = [];
    const pings: { x: number; y: number; t0: number }[] = [];
    let nextPing = performance.now() + 900;

    const seed = () => {
      motes.length = 0;
      const n = Math.round(Math.min(170, (w * h) / (login ? 9000 : 13000)));
      for (let i = 0; i < n; i++) {
        const z = 0.15 + Math.random() * 0.85;
        motes.push({ x: Math.random() * w, y: Math.random() * h, z, vx: (Math.random() - 0.5) * 0.08, vy: -(0.05 + Math.random() * 0.22) * z, gold: Math.random() < 0.12, tw: Math.random() * 6.28 });
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (now: number, dt: number) => {
      const C = canvasColors();
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      ptr.px += (ptr.tx - ptr.px) * 0.05;
      ptr.py += (ptr.ty - ptr.py) * 0.05;

      // feixes de luz vindos da superfície
      const beams = login ? 6 : 4;
      for (let i = 0; i < beams; i++) {
        const base = (i + 0.5) / beams;
        const sway = Math.sin(t * 0.18 + i * 1.7) * 0.06;
        const x = (base + sway) * w - ptr.px * 18;
        const spread = w * (0.08 + 0.05 * Math.sin(t * 0.3 + i));
        const g = ctx.createLinearGradient(x, 0, x - w * 0.12, h * 0.95);
        const a = (login ? 0.075 : 0.045) * C.boost * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 2.1));
        g.addColorStop(0, `rgba(${rgb(C.royal)},${a})`);
        g.addColorStop(0.6, `rgba(${rgb(C.royal)},${a * 0.35})`);
        g.addColorStop(1, `rgba(${rgb(C.royal)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - spread * 0.25, -10);
        ctx.lineTo(x + spread * 0.25, -10);
        ctx.lineTo(x - w * 0.12 + spread, h);
        ctx.lineTo(x - w * 0.12 - spread, h);
        ctx.closePath();
        ctx.fill();
      }

      // sonar: um pulso de vez em quando, de onde o tubarão costuma ficar
      if (!reduce && now > nextPing) {
        const ox = login ? w * 0.5 : w - 90;
        const oy = login ? h * 0.24 : h - 90;
        pings.push({ x: ox, y: oy, t0: now });
        nextPing = now + (login ? 3800 : 6500) + Math.random() * 1500;
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i];
        const k = (now - p.t0) / 4200;
        if (k >= 1) {
          pings.splice(i, 1);
          continue;
        }
        const r = k * Math.hypot(w, h) * 0.75;
        ctx.strokeStyle = `rgba(${rgb(C.royal)},${(1 - k) * 0.28 * C.boost})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(${rgb(C.mustard)},${(1 - k) * 0.12 * C.boost})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.86, 0, Math.PI * 2);
        ctx.stroke();
      }

      // partículas em profundidade (as de perto andam mais com o mouse e são maiores)
      for (const m of motes) {
        if (!reduce) {
          m.x += m.vx * dt * 0.06;
          m.y += m.vy * dt * 0.06;
          const dx = m.x - ptr.x;
          const dy = m.y - ptr.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 140 * 140) {
            const f = (1 - Math.sqrt(d2) / 140) * 0.9 * m.z;
            m.x += (dx / (Math.sqrt(d2) + 1)) * f * 2.2;
            m.y += (dy / (Math.sqrt(d2) + 1)) * f * 2.2;
          }
          if (m.y < -10) {
            m.y = h + 10;
            m.x = Math.random() * w;
          }
          if (m.x < -10) m.x = w + 10;
          if (m.x > w + 10) m.x = -10;
        }
        const px = m.x - ptr.px * 40 * m.z;
        const py = m.y - ptr.py * 26 * m.z;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.4 + m.tw);
        const a = (0.08 + 0.42 * m.z * m.z) * tw * C.boost;
        const col = m.gold ? C.mustard : m.z > 0.75 ? C.fg : C.royal;
        ctx.fillStyle = `rgba(${rgb(col)},${Math.min(0.85, a)})`;
        const r = 0.5 + m.z * (login ? 2 : 1.6);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // véu de profundidade: escurece embaixo (o fundo do mar)
      const v = ctx.createLinearGradient(0, h * 0.45, 0, h);
      v.addColorStop(0, `rgba(${rgb(C.bg)},0)`);
      v.addColorStop(1, `rgba(${rgb(C.bg)},${login ? 0.55 : 0.4})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
    };

    const loop = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 32) return;
      const dt = Math.min(64, now - (last || now));
      last = now;
      draw(now, dt);
    };
    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.tx = e.clientX / Math.max(1, w) - 0.5;
      ptr.ty = e.clientY / Math.max(1, h) - 0.5;
    };
    const onLeave = () => {
      ptr.x = ptr.y = -9999;
    };
    const onVis = () => {
      running = !document.hidden && getFx() !== 'off';
      cancelAnimationFrame(raf);
      if (running && !reduce) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    if (reduce) draw(performance.now(), 0);
    else raf = requestAnimationFrame(loop);
    const onTheme = () => reduce && draw(performance.now(), 0);
    window.addEventListener('lyceg:theme', onTheme);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('lyceg:theme', onTheme);
    };
  }, [fx, variant]);

  if (fx === 'off') return null;
  return <canvas ref={ref} className={variant === 'login' ? 'abyss abyss-login' : 'abyss'} aria-hidden />;
}

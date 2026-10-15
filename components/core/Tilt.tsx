'use client';
import { useEffect } from 'react';
import { useFx } from '@/lib/fx';

/* =====================================================================
 * Inclinação 3D: cartões, linhas e botões se erguem e giram levemente na
 * direção do mouse, com um reflexo azul e mostarda que acompanha o cursor. Um só ouvinte
 * para a página inteira (barato) e só no modo "full" com mouse.
 * ===================================================================== */
const TILT =
  '.stat, .p-row, .stock-row:not(.head), .g-card, .hub-card, .posto-card, .o-item, .o-term, .n-line, .move-row, .user-row, .mini-stats > div, .blank-tool, .login-card, .req-card, .o-plan, .p-item, .kit-card, .t-wrap, .empty, .banner, .o-routing, .contact, .detail-hero, .mt-card, .lyco-card, .btn, .nav-item, .tab, .chip, .cat-chip, .filter-seg button, .pbadge, .avatar';

export function TiltField() {
  const fx = useFx();
  useEffect(() => {
    if (fx !== 'full' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let el: HTMLElement | null = null;
    let raf = 0;
    let px = 0;
    let py = 0;
    const reset = (x: HTMLElement) => {
      x.classList.remove('is-tilting');
      x.style.removeProperty('--rx');
      x.style.removeProperty('--ry');
      // volta ao lugar com suavidade
      x.classList.add('tilt-out');
      setTimeout(() => x.classList.remove('tilt-out'), 460);
    };
    const apply = () => {
      raf = 0;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = (px - r.left) / r.width - 0.5;
      const ny = (py - r.top) / r.height - 0.5;
      // elementos largos giram menos (uma linha de tabela não pode "virar")
      const max = Math.max(1.2, Math.min(9, 2600 / Math.max(r.width, 1)));
      el.style.setProperty('--rx', `${(-ny * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(nx * max).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${((nx + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((ny + 0.5) * 100).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      const t = e.target instanceof Element ? (e.target.closest(TILT) as HTMLElement | null) : null;
      if (t !== el) {
        if (el) reset(el);
        el = t;
        if (el) {
          el.classList.remove('tilt-out');
          el.classList.add('is-tilting');
        }
      }
      if (el && !raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (el) reset(el);
      el = null;
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (el) reset(el);
      cancelAnimationFrame(raf);
    };
  }, [fx]);
  return null;
}

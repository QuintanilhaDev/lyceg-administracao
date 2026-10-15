'use client';
import { useEffect, useState } from 'react';
const EVENT = 'lyceg:fx';

/** Animações 3D da Lyceg Administração (sempre ligadas; "off" só para quem pede menos movimento). */
export type { FxMode } from './fxScript';
import type { FxMode } from './fxScript';
export function getFx(): FxMode {
  if (typeof document === 'undefined') return 'full';
  const m = document.documentElement.dataset.fx;
  return m === 'lite' || m === 'off' ? m : 'full';
}

export function useFx(): FxMode {
  const [mode, setMode] = useState<FxMode>('full');
  useEffect(() => {
    const read = () => setMode(getFx());
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  return mode;
}

/** valores 3D para as animações do framer (zero quando o 3D está desligado) */
export const deg = (d: number) => (getFx() === 'off' ? 0 : d);

/*
 * Linguagem de movimento da Lyceg: as peças "emergem" da profundidade, como quem
 * sobe do fundo do mar. Janelas se levantam a partir da borda de baixo (como uma tampa),
 * gavetas avançam em profundidade (efeito "dolly" de câmera), telas sobem do fundo.
 */
const springIn = { type: 'spring' as const, stiffness: 340, damping: 30, mass: 0.9 };

export const fx = {
  /** gaveta lateral: avança da profundidade, levemente inclinada para a frente */
  get drawer() {
    return {
      initial: { opacity: 0, x: 36, z: deg(-260), rotateX: deg(6), transformPerspective: 1300 },
      animate: { opacity: 1, x: 0, z: 0, rotateX: 0, transitionEnd: { transform: 'none' } },
      exit: { opacity: 0, x: 28, z: deg(-200), rotateX: deg(-4), transition: { duration: 0.2 } },
      transition: springIn,
    };
  },
  /** janela central: levanta a partir da borda de baixo, como uma tampa que abre */
  get modal() {
    return {
      initial: { opacity: 0, y: 34, rotateX: deg(-38), scale: 0.94, transformPerspective: 1100, transformOrigin: '50% 100%' },
      animate: { opacity: 1, y: 0, rotateX: 0, scale: 1, transitionEnd: { transform: 'none' } },
      exit: { opacity: 0, y: 18, rotateX: deg(-22), scale: 0.97, transition: { duration: 0.18 } },
      transition: springIn,
    };
  },
  /** troca de aba: a tela nova sobe do fundo, a antiga afunda e se afasta */
  get page() {
    return {
      initial: { opacity: 0, y: 44, rotateX: deg(12), z: deg(-140), transformPerspective: 1500 },
      animate: { opacity: 1, y: 0, rotateX: 0, z: 0, transitionEnd: { transform: 'none' } },
      exit: { opacity: 0, y: -24, rotateX: deg(-8), z: deg(-90) },
      transition: { duration: 0.44, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    };
  },
  /** painel do Lyco: nasce do botão do tubarão, girando de baixo para cima */
  get bubble() {
    return {
      initial: { opacity: 0, y: 26, scale: 0.9, rotateX: deg(-30), transformPerspective: 1100, transformOrigin: '100% 100%' },
      animate: { opacity: 1, y: 0, scale: 1, rotateX: 0, transitionEnd: { transform: 'none' } },
      exit: { opacity: 0, y: 14, scale: 0.95, rotateX: deg(-16), transition: { duration: 0.16 } },
      transition: springIn,
    };
  },
  /** avisos: descem do topo virando como uma placa */
  get toast() {
    return {
      initial: { opacity: 0, y: -18, rotateX: deg(70), transformPerspective: 700, transformOrigin: '50% 0%' },
      animate: { opacity: 1, y: 0, rotateX: 0, transitionEnd: { transform: 'none' } },
      exit: { opacity: 0, y: -10, rotateX: deg(-50), transition: { duration: 0.18 } },
      transition: springIn,
    };
  },
};

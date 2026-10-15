'use client';
/**
 * Modo claro / escuro.
 *
 * A troca gira a tela como a face de um cubo: a tela atual vira para a esquerda e some
 * na profundidade enquanto a nova chega pela direita, com um reflexo azul passando por ela.
 * Usa a "View Transition" do navegador (a página antiga e a nova viram imagens animadas);
 * sem ela, as cores mudam com um esmaecimento simples.
 */
export type Theme = 'dark' | 'light';
import { THEME_KEY as KEY } from './themeScript';
const META: Record<Theme, string> = { dark: '#0b0b0d', light: '#f4f4f1' };
const DURATION = 1100;


export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* modo privado: vale só nesta visita */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
  window.dispatchEvent(new CustomEvent('lyceg:theme', { detail: t }));
}

let running = false;

export function toggleTheme(): Promise<Theme> {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  return setTheme(next);
}

export async function setTheme(next: Theme): Promise<Theme> {
  if (running || next === currentTheme()) return currentTheme();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    document.documentElement.classList.add('theme-fade');
    apply(next);
    setTimeout(() => document.documentElement.classList.remove('theme-fade'), 900);
    return next;
  }
  running = true;
  document.documentElement.classList.add('theme-cube');
  const vt = doc.startViewTransition(() => apply(next));
  try {
    await vt.ready;
    const root = document.documentElement;
    const ease = 'cubic-bezier(0.65, 0, 0.25, 1)';
    const w = window.innerWidth;
    // a tela atual é a face da frente do cubo: gira para a esquerda em volta da aresta esquerda
    root.animate(
      [
        { transform: 'perspective(1600px) translateZ(0) rotateY(0deg)', transformOrigin: '0% 50%', filter: 'brightness(1)' },
        { transform: `perspective(1600px) translateZ(${-w * 0.25}px) rotateY(-45deg)`, transformOrigin: '0% 50%', filter: 'brightness(0.75)', offset: 0.5 },
        { transform: 'perspective(1600px) translateZ(0) rotateY(-90deg)', transformOrigin: '0% 50%', filter: 'brightness(0.4)' },
      ],
      { duration: DURATION, easing: ease, fill: 'both', pseudoElement: '::view-transition-old(root)' },
    );
    // a nova é a face da direita chegando
    root.animate(
      [
        { transform: 'perspective(1600px) translateZ(0) rotateY(90deg)', transformOrigin: '100% 50%', filter: 'brightness(0.4)' },
        { transform: `perspective(1600px) translateZ(${-w * 0.25}px) rotateY(45deg)`, transformOrigin: '100% 50%', filter: 'brightness(0.85)', offset: 0.5 },
        { transform: 'perspective(1600px) translateZ(0) rotateY(0deg)', transformOrigin: '100% 50%', filter: 'brightness(1)' },
      ],
      { duration: DURATION, easing: ease, fill: 'both', pseudoElement: '::view-transition-new(root)' },
    );
    await vt.finished;
  } catch {
    /* a troca já foi aplicada; só a animação falhou */
  } finally {
    document.documentElement.classList.remove('theme-cube');
    running = false;
  }
  return next;
}

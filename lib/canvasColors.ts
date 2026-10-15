'use client';
/**
 * Cores dos desenhos em canvas (fundo 3D das telas e do login) para o tema atual.
 * No escuro: azul royal e mostarda brilhando no ônix; no claro: tons mais fechados para aparecerem no branco.
 */
export interface CanvasColors {
  fg: [number, number, number];
  royal: [number, number, number];
  mustard: [number, number, number];
  /** fundo (para os véus de profundidade) */
  bg: [number, number, number];
  /** multiplica a opacidade (no claro os traços precisam de um pouco mais) */
  boost: number;
}
const DARK: CanvasColors = { fg: [247, 247, 244], royal: [76, 125, 255], mustard: [227, 169, 47], bg: [11, 11, 13], boost: 1 };
const LIGHT: CanvasColors = { fg: [11, 11, 13], royal: [37, 70, 201], mustard: [176, 125, 10], bg: [244, 244, 241], boost: 1.5 };

export function canvasColors(): CanvasColors {
  if (typeof document === 'undefined') return DARK;
  return document.documentElement.dataset.theme === 'light' ? LIGHT : DARK;
}
export const rgb = (c: [number, number, number]) => `${c[0]},${c[1]},${c[2]}`;

/** Formatação da Frota (navegador e servidor). */
import { TZ } from './types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const int = new Intl.NumberFormat('pt-BR');
const cmp = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtBRL = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '—' : brl.format(n));
export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '—' : int.format(n));
export const fmtKmLim = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n >= 9999 ? 'Ilimitado' : int.format(n));
export const fmtCompact = (n: number) => cmp.format(n);
export const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
export const fmtDateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const fmtMes = (s: string) => {
  const [y, m] = String(s).slice(0, 7).split('-');
  return `${MESES[+m - 1] ?? m}/${y.slice(2)}`;
};
/** valor para o campo datetime-local, no horário da Bahia */
export const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16) : '');

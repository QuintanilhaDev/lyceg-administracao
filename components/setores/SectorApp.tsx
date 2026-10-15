'use client';
import dynamic from 'next/dynamic';
import { PanelSkeleton } from '../core/lazy';
import type { SectorSlug } from '@/lib/sectors';

/**
 * Cada setor carrega só o próprio código: quem abre o RH não baixa o Almoxarifado inteiro.
 */
export const loadAlmox = () => import('../almoxarifado/Dashboard');
export const loadCompras = () => import('../compras/ComprasApp');
export const loadFrota = () => import('../frota/FrotaApp');
export const loadShell = () => import('./SectorShell');

const Dashboard = dynamic(() => loadAlmox().then((m) => m.Dashboard), { loading: PanelSkeleton });
const ComprasApp = dynamic(() => loadCompras().then((m) => m.ComprasApp), { loading: PanelSkeleton });
const FrotaApp = dynamic(() => loadFrota().then((m) => m.FrotaApp), { loading: PanelSkeleton });
const SectorShell = dynamic(() => loadShell().then((m) => m.SectorShell), { loading: PanelSkeleton });

export function SectorApp({ slug }: { slug: SectorSlug }) {
  if (slug === 'almoxarifado') return <Dashboard />;
  if (slug === 'compras') return <ComprasApp />;
  if (slug === 'frota') return <FrotaApp />;
  return <SectorShell slug={slug} />;
}

/** baixa antes o código de um setor (ex.: o Lyco vai abrir esse setor) */
export function preloadSector(slug: string) {
  (slug === 'almoxarifado' ? loadAlmox() : slug === 'compras' ? loadCompras() : slug === 'frota' ? loadFrota() : loadShell()).catch(() => undefined);
}

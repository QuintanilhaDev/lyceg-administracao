'use client';
import { Bike, CarFront } from 'lucide-react';
import { SIT_TONE, type Situacao, type TipoVeiculo } from '@/lib/frota/types';

/** Placa no estilo Mercosul (faixa azul com "BR"). */
export function Plate({ placa, onClick, off, big, title }: { placa: string; onClick?: () => void; off?: boolean; big?: boolean; title?: string }) {
  const cls = `plate${big ? ' big' : ''}${off ? ' off' : ''}${onClick ? ' click' : ''}`;
  const inner = (
    <>
      <i aria-hidden>BR</i>
      <span>{placa}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title ?? `Abrir a ficha da ${placa}`}>
      {inner}
    </button>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

export function Sit({ s }: { s: Situacao }) {
  return (
    <span className={`sit sit-${SIT_TONE[s] ?? 'off'}`}>
      <i aria-hidden />
      {s}
    </span>
  );
}

export function TipoIcon({ t, size = 15 }: { t: TipoVeiculo | null; size?: number }) {
  if (t === 'MOTO') return <Bike size={size} aria-label="Moto" />;
  if (t === 'CARRO') return <CarFront size={size} aria-label="Carro" />;
  return null;
}

/** Colunas em 3D (cada barra é um prisma com topo e lateral). */
export function Columns({ items, fmt, empty = 'Sem dados ainda.' }: { items: { l: string; v: number }[]; fmt: (n: number, short?: boolean) => string; empty?: string }) {
  if (!items.length) return <p className="help">{empty}</p>;
  const mx = Math.max(1e-9, ...items.map((i) => i.v));
  return (
    <div className="cols3d" role="img" aria-label={items.map((i) => `${i.l}: ${fmt(i.v)}`).join('; ')}>
      {items.map((i, k) => (
        <div key={i.l + k} className="col3d" title={`${i.l}: ${fmt(i.v)}`} style={{ ['--h' as string]: `${Math.max(3, (i.v / mx) * 100)}%`, ['--d' as string]: `${k * 40}ms` }}>
          <span className="col3d-v">{fmt(i.v, true)}</span>
          <span className="col3d-bar">
            <b />
          </span>
          <span className="col3d-l">{i.l}</span>
        </div>
      ))}
    </div>
  );
}

/** Barras deitadas (ranking). */
export function Ranking({ items, fmt }: { items: { l: string; v: number }[]; fmt: (n: number) => string }) {
  if (!items.length) return <p className="help">Sem dados ainda.</p>;
  const mx = Math.max(1, ...items.map((i) => i.v));
  return (
    <div className="rank">
      {items.map((i) => (
        <div key={i.l} className="rank-row">
          <span className="rank-l" title={i.l}>
            {i.l}
          </span>
          <span className="rank-t">
            <i style={{ width: `${Math.max(2, (i.v / mx) * 100)}%` }} />
          </span>
          <b>{fmt(i.v)}</b>
        </div>
      ))}
    </div>
  );
}

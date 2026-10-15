'use client';
import { Pencil, Trash2 } from 'lucide-react';
import type { Despesa, FrotaData, Lavagem, Multa, Revisao } from '@/lib/frota/types';
import { fmtBRL, fmtDate, fmtDateTime, fmtNum } from '@/lib/frota/format';
import { Plate } from './ui';

export type OpKind = 'despesas' | 'multas' | 'revisoes' | 'lavagens';
type Row = Despesa | Multa | Revisao | Lavagem;
type Col = { h: string; cell: (r: Row) => React.ReactNode; cls?: string; placa?: boolean };

export const OPS: Record<OpKind, { t: string; one: string; arr: (d: FrotaData) => Row[]; dt: (r: Row) => string; val: (r: Row) => number; hay: (r: Row) => (string | null)[]; cols: Col[] }> = {
  despesas: {
    t: 'Despesas',
    one: 'despesa',
    arr: (d) => d.despesas,
    dt: (r) => (r as Despesa).data,
    val: (r) => (r as Despesa).valor,
    hay: (r) => {
      const x = r as Despesa;
      return [x.empresa, x.tipo, x.placa, x.prestador, x.cliente, x.servico, x.obs];
    },
    cols: [
      { h: 'Data', cell: (r) => fmtDate((r as Despesa).data) },
      { h: 'Placa', cell: (r) => (r as Despesa).placa ?? '—', placa: true },
      { h: 'Serviço', cell: (r) => <><b>{(r as Despesa).servico || '—'}</b>{(r as Despesa).prestador ? <small>{(r as Despesa).prestador}</small> : null}</>, cls: 'wrap' },
      { h: 'Empresa / tipo', cell: (r) => [(r as Despesa).empresa, (r as Despesa).tipo].filter(Boolean).join(' · ') || '—', cls: 'wrap' },
      { h: 'Valor', cell: (r) => fmtBRL((r as Despesa).valor), cls: 'r' },
    ],
  },
  multas: {
    t: 'Multas',
    one: 'multa',
    arr: (d) => d.multas,
    dt: (r) => (r as Multa).data_hora,
    val: (r) => (r as Multa).valor,
    hay: (r) => {
      const x = r as Multa;
      return [x.placa, x.condutor, x.local, x.municipio, x.infracao, x.ait, x.locadora];
    },
    cols: [
      { h: 'Data/hora', cell: (r) => fmtDateTime((r as Multa).data_hora) },
      { h: 'Placa', cell: (r) => (r as Multa).placa, placa: true },
      { h: 'Infração', cell: (r) => <><b>{(r as Multa).infracao || '—'}</b><small>{[(r as Multa).local, (r as Multa).municipio].filter(Boolean).join(' · ')}</small></>, cls: 'wrap' },
      { h: 'Condutor', cell: (r) => (r as Multa).condutor || '—', cls: 'wrap' },
      { h: 'Valor', cell: (r) => fmtBRL((r as Multa).valor), cls: 'r' },
    ],
  },
  revisoes: {
    t: 'Revisões',
    one: 'revisão',
    arr: (d) => d.revisoes,
    dt: (r) => (r as Revisao).data,
    val: (r) => (r as Revisao).custo_total ?? 0,
    hay: (r) => {
      const x = r as Revisao;
      return [x.placa, x.servico, x.descricao, x.item1, x.item2, x.item3, x.obs];
    },
    cols: [
      { h: 'Data', cell: (r) => fmtDate((r as Revisao).data) },
      { h: 'Placa', cell: (r) => (r as Revisao).placa, placa: true },
      { h: 'Serviço', cell: (r) => <><b>{(r as Revisao).servico || '—'}</b>{(r as Revisao).descricao ? <small>{(r as Revisao).descricao}</small> : null}</>, cls: 'wrap' },
      { h: 'Próxima (km)', cell: (r) => fmtNum((r as Revisao).prox_rev), cls: 'r' },
      { h: 'Custo', cell: (r) => fmtBRL((r as Revisao).custo_total), cls: 'r' },
    ],
  },
  lavagens: {
    t: 'Lavagens',
    one: 'lavagem',
    arr: (d) => d.lavagens,
    dt: (r) => (r as Lavagem).data,
    val: (r) => (r as Lavagem).valor,
    hay: (r) => {
      const x = r as Lavagem;
      return [x.placa, x.posto, x.vtr];
    },
    cols: [
      { h: 'Data', cell: (r) => fmtDate((r as Lavagem).data) },
      { h: 'Placa', cell: (r) => (r as Lavagem).placa, placa: true },
      { h: 'Posto', cell: (r) => (r as Lavagem).posto || '—', cls: 'wrap' },
      { h: 'VTR', cell: (r) => (r as Lavagem).vtr || '—' },
      { h: 'Valor', cell: (r) => fmtBRL((r as Lavagem).valor), cls: 'r' },
    ],
  },
};

/** Tabela de registros da operação (vira cartões no celular). */
export function OpTable({
  kind,
  rows,
  mini,
  canEdit,
  knownPlates,
  onPlate,
  onEdit,
  onDelete,
}: {
  kind: OpKind;
  rows: Row[];
  /** dentro da ficha do veículo: sem a coluna da placa */
  mini?: boolean;
  canEdit: boolean;
  knownPlates: Set<string>;
  onPlate?: (placa: string) => void;
  onEdit: (r: Row) => void;
  onDelete: (r: Row) => void;
}) {
  const cols = OPS[kind].cols.filter((c) => !(mini && c.placa));
  if (!rows.length) return <p className="empty-line">Nenhum registro.</p>;
  return (
    <div className={`fr-table op-table cols-${cols.length + 1}`} role="table">
      <div className="fr-tr fr-th" role="row">
        {cols.map((c) => (
          <span key={c.h} role="columnheader" className={c.cls}>
            {c.h}
          </span>
        ))}
        <span role="columnheader" className="r edit-only">
          Ações
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="fr-tr is-static" role="row">
          {cols.map((c) => (
            <span key={c.h} role="cell" className={c.cls} data-label={c.h}>
              {c.placa ? (() => {
                const p = String(c.cell(r));
                return p === '—' ? '—' : <Plate placa={p} off={!knownPlates.has(p)} onClick={knownPlates.has(p) && onPlate ? () => onPlate(p) : undefined} title={knownPlates.has(p) ? undefined : 'Placa não cadastrada na frota'} />;
              })() : c.cell(r)}
            </span>
          ))}
          <span role="cell" className="r fr-acts edit-only">
            <button className="icon-btn" onClick={() => onEdit(r)} aria-label="Editar" title="Editar" disabled={!canEdit}>
              <Pencil size={15} />
            </button>
            <button className="icon-btn danger" onClick={() => onDelete(r)} aria-label="Excluir" title="Excluir" disabled={!canEdit}>
              <Trash2 size={15} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

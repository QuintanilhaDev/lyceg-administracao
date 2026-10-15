'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../core/Modal';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { ativo, daysTo, postoLabel, type FrotaData, type KmMes, type RecordKind, type Veiculo } from '@/lib/frota/types';
import { fmtBRL, fmtCompact, fmtDate, fmtKmLim, fmtMes, fmtNum } from '@/lib/frota/format';
import { fx } from '@/lib/fx';
import { OPS, OpTable, type OpKind } from './OpTable';
import { RecordForm, recordPath } from './RecordForm';
import { Columns, Plate, Sit, TipoIcon } from './ui';

export type FichaTab = 'resumo' | 'contrato' | 'km' | OpKind;

/** Gaveta com tudo de um veículo: resumo, contrato, quilometragem e o que já foi gasto com ele. */
export function FichaVeiculo({
  id,
  tab: initialTab,
  data,
  canEdit,
  canOp,
  canAlloc,
  reload,
  onClose,
}: {
  id: string;
  tab?: FichaTab;
  data: FrotaData;
  canEdit: boolean;
  canOp: boolean;
  canAlloc: boolean;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const v = data.veiculos.find((x) => x.id === id) ?? null;
  const [tab, setTab] = useState<FichaTab>(initialTab ?? 'resumo');
  const [form, setForm] = useState<{ kind: RecordKind; record?: Record<string, unknown> | null; prefill?: Record<string, unknown> } | null>(null);
  const [del, setDel] = useState<{ kind: RecordKind; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !form && !del && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, form, del]);

  const mine = useMemo(() => {
    if (!v) return null;
    const by = <T extends { placa: string | null }>(l: T[]) => l.filter((r) => r.placa === v.placa);
    return {
      despesas: by(data.despesas),
      multas: by(data.multas),
      revisoes: by(data.revisoes),
      lavagens: by(data.lavagens),
      km: data.km.filter((k) => k.veiculo_id === v.id).sort((a, b) => b.mes.localeCompare(a.mes)),
    };
  }, [v, data]);
  const known = useMemo(() => new Set(data.veiculos.map((x) => x.placa)), [data.veiculos]);

  if (!v || !mine) return null;
  const lastRev = [...mine.revisoes].sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
  const falta = lastRev?.prox_rev != null && v.km_atual != null ? lastRev.prox_rev - v.km_atual : null;
  const dd = daysTo(v.devolucao_prevista);
  const sum = (l: { valor?: number | null; custo_total?: number | null }[], f: 'valor' | 'custo_total' = 'valor') => l.reduce((t, r) => t + (Number(r[f]) || 0), 0);
  const posto = v.posto_id ? data.postos.find((p) => p.id === v.posto_id) : null;

  const TABS: { id: FichaTab; l: string; n?: number }[] = [
    { id: 'resumo', l: 'Resumo' },
    { id: 'contrato', l: 'Contrato' },
    { id: 'km', l: 'Quilometragem', n: mine.km.length },
    { id: 'revisoes', l: 'Revisões', n: mine.revisoes.length },
    { id: 'despesas', l: 'Despesas', n: mine.despesas.length },
    { id: 'multas', l: 'Multas', n: mine.multas.length },
    { id: 'lavagens', l: 'Lavagens', n: mine.lavagens.length },
  ];

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await api(recordPath(del.kind, del.id), { method: 'DELETE' });
      toast({ kind: 'success', title: 'Excluído', text: del.label });
      if (del.kind === 'veiculos') onClose();
      setDel(null);
      await reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Não foi possível excluir', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const kv = (rows: [string, React.ReactNode][]) => (
    <div className="kv-list">
      {rows.map(([k, val]) => (
        <div key={k} className="kv-row">
          <span>{k}</span>
          <b>{val === null || val === undefined || val === '' ? '—' : val}</b>
        </div>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (tab === 'resumo') {
    body = (
      <>
        {falta !== null && falta <= 1500 ? (
          <div className={`fr-alert${falta <= 0 ? ' bad' : ''}`}>
            <Wrench size={16} /> {falta <= 0 ? 'Revisão vencida' : 'Revisão próxima'}: faltam {fmtNum(Math.max(0, falta))} km para {fmtNum(lastRev!.prox_rev)} km.
          </div>
        ) : null}
        {dd !== null && dd <= 60 && ativo(v) ? (
          <div className={`fr-alert${dd < 0 ? ' bad' : ''}`}>
            <CalendarClock size={16} /> Devolução prevista {fmtDate(v.devolucao_prevista)} ({dd < 0 ? `vencida há ${-dd} dias` : `em ${dd} dias`}).
          </div>
        ) : null}
        <div className="mini-stats fr-mini">
          {(
            [
              [fmtNum(v.km_atual), 'KM atual'],
              [fmtKmLim(v.km_contratado), 'KM contratado/mês'],
              [lastRev?.prox_rev ? fmtNum(lastRev.prox_rev) : '—', 'Próxima revisão (km)'],
              [fmtBRL(sum(mine.despesas)), 'Despesas'],
              [fmtBRL(sum(mine.multas)), 'Multas'],
              [fmtBRL(sum(mine.lavagens)), 'Lavagens'],
            ] as const
          ).map(([n, t]) => (
            <div key={t}>
              <small>{t}</small>
              <b>{n}</b>
            </div>
          ))}
        </div>
        {kv([
          ['Tipo', v.tipo ? (v.tipo === 'MOTO' ? 'Moto' : 'Carro') : null],
          ['Marca/modelo', v.modelo],
          ['Empresa', v.empresa],
          ['Nº na frota', v.numero_frota],
          ['Posto (mapa)', posto ? postoLabel(posto) : 'Sem posto'],
          ['Posto na planilha', v.posto_planilha],
          ['Supervisor', v.supervisor],
          ['Fornecedor', v.fornecedor],
          ['Atualizado', v.updated_by ? `${v.updated_by}, ${new Date(v.updated_at).toLocaleDateString('pt-BR')}` : null],
        ])}
        {v.obs ? <p className="fr-obs">{v.obs}</p> : null}
      </>
    );
  } else if (tab === 'contrato') {
    const marg = v.valor_contratado != null && v.valor_locacao != null ? v.valor_contratado - v.valor_locacao : null;
    body = kv([
      ['Fornecedor/locadora', v.fornecedor],
      ['Empresa', v.empresa],
      ['Situação do contrato', v.situacao_contrato],
      ['Prazo', v.prazo_meses ? `${v.prazo_meses} meses` : null],
      ['Valor da locação', fmtBRL(v.valor_locacao)],
      ['Valor contratado', fmtBRL(v.valor_contratado)],
      ['Margem (contratado − locação)', marg === null ? null : <span className={marg < 0 ? 'bad' : 'ok'}>{fmtBRL(marg)}</span>],
      ['Combustível por conta de', v.custo_por],
      ['Regra de combustível', v.status_combustivel],
      ['Recebimento', v.data_recebimento ? fmtDate(v.data_recebimento) : null],
      ['Devolução prevista', v.devolucao_prevista ? `${fmtDate(v.devolucao_prevista)}${dd !== null ? (dd < 0 ? ` (há ${-dd} d)` : ` (em ${dd} d)`) : ''}` : null],
      ['KM de entrega', fmtNum(v.km_entrega)],
      ['KM contratado/mês', fmtKmLim(v.km_contratado)],
      ['KM da locadora', fmtKmLim(v.km_locadora)],
      ['Seguro', v.seguro === true ? 'Sim' : v.seguro === false ? 'Não' : null],
      ['TAG', v.tag === true ? 'Sim' : v.tag === false ? 'Não' : null],
      ['Rastreador', v.rastreador],
      ['Plotagem', v.data_plotagem ? fmtDate(v.data_plotagem) : null],
    ]);
  } else if (tab === 'km') {
    body = (
      <>
        <div className="fr-sub-head">
          <span className="help">Quilometragem rodada por mês e combustível no cartão.</span>
          <button className="btn btn-primary btn-sm edit-only" onClick={() => setForm({ kind: 'km', prefill: { mes: new Date().toISOString().slice(0, 7) + '-01', supervisor: v.supervisor } })} disabled={!canEdit}>
            <Plus size={15} /> Lançar mês
          </button>
        </div>
        <Columns items={[...mine.km].reverse().filter((k) => k.km_total != null).map((k) => ({ l: fmtMes(k.mes), v: k.km_total! }))} fmt={(n) => fmtCompact(n)} />
        {mine.km.length ? (
          <div className="fr-table km-table" role="table">
            <div className="fr-tr fr-th" role="row">
              <span>Mês</span>
              <span className="r">KM 1/4</span>
              <span className="r">KM 2/4</span>
              <span className="r">KM 3/4</span>
              <span className="r">KM 4/4</span>
              <span className="r">Total</span>
              <span className="r">Cartão</span>
              <span className="r edit-only">Ações</span>
            </div>
            {mine.km.map((k: KmMes) => (
              <div key={k.id} className="fr-tr is-static" role="row">
                <span data-label="Mês">{fmtMes(k.mes)}</span>
                <span className="r" data-label="KM 1/4">{fmtNum(k.km1)}</span>
                <span className="r" data-label="KM 2/4">{fmtNum(k.km2)}</span>
                <span className="r" data-label="KM 3/4">{fmtNum(k.km3)}</span>
                <span className="r" data-label="KM 4/4">{fmtNum(k.km4)}</span>
                <span className="r" data-label="Total">
                  <b>{fmtNum(k.km_total)}</b>
                </span>
                <span className="r" data-label="Cartão">{fmtBRL(k.comb_cartao)}</span>
                <span className="r fr-acts edit-only">
                  <button className="icon-btn" onClick={() => setForm({ kind: 'km', record: k as unknown as Record<string, unknown> })} aria-label="Editar" disabled={!canEdit}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={() => setDel({ kind: 'km', id: k.id, label: `KM de ${fmtMes(k.mes)}` })} aria-label="Excluir" disabled={!canEdit}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </>
    );
  } else {
    const t = tab;
    const rows = [...mine[t]].sort((a, b) => String(OPS[t].dt(b) || '').localeCompare(String(OPS[t].dt(a) || '')));
    const tot = rows.reduce((s, r) => s + (Number(OPS[t].val(r)) || 0), 0);
    body = (
      <>
        <div className="fr-sub-head">
          <span className="help">
            {rows.length} registro(s) · total <b>{fmtBRL(tot)}</b>
          </span>
          <button className="btn btn-primary btn-sm edit-only" onClick={() => setForm({ kind: t, prefill: { placa: v.placa, ...(t === 'multas' ? { tipo: v.tipo } : t === 'lavagens' ? { vtr: v.tipo, posto: posto?.name } : t === 'revisoes' ? { tipo: v.tipo, ultima_rev: v.km_atual } : { empresa: v.empresa }) } })} disabled={!canOp}>
            <Plus size={15} /> Adicionar
          </button>
        </div>
        <OpTable
          kind={t}
          rows={rows}
          mini
          canEdit={canOp}
          knownPlates={known}
          onEdit={(r) => setForm({ kind: t, record: r as unknown as Record<string, unknown> })}
          onDelete={(r) => setDel({ kind: t, id: r.id, label: `${OPS[t].one} de ${String(OPS[t].dt(r)).slice(0, 10).split('-').reverse().join('/')}` })}
        />
      </>
    );
  }

  return (
    <motion.div className="drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside className="drawer wide fr-ficha" role="dialog" aria-modal="true" aria-label={`Ficha do veículo ${v.placa}`} {...fx.drawer} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-top">
          <div style={{ minWidth: 0 }}>
            <div className="fr-ficha-id">
              <Plate placa={v.placa} big off={!ativo(v)} />
              <Sit s={v.situacao} />
            </div>
            <p>
              <TipoIcon t={v.tipo} /> {[v.modelo, posto ? postoLabel(posto) : null].filter(Boolean).join(' · ') || 'Complete os dados em Editar'}
            </p>
          </div>
          <div className="fr-ficha-acts">
            <button className="btn btn-ghost btn-sm edit-only" onClick={() => setForm({ kind: 'veiculos', record: v as unknown as Record<string, unknown> })} disabled={!canEdit}>
              <Pencil size={15} /> Editar
            </button>
            <button className="icon-btn danger edit-only" onClick={() => setDel({ kind: 'veiculos', id: v.id, label: v.placa })} aria-label="Excluir veículo" title="Excluir veículo" disabled={!canEdit}>
              <Trash2 size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={19} />
            </button>
          </div>
        </div>
        <div className="fr-tabs" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'is-on' : ''} onClick={() => setTab(x.id)}>
              {x.l}
              {x.n ? <span className="cnt">{x.n}</span> : null}
            </button>
          ))}
        </div>
        <div className="drawer-body">{body}</div>
      </motion.aside>

      <div onClick={(e) => e.stopPropagation()}>
        <AnimatePresence>
          {form ? <RecordForm key="f" kind={form.kind} record={form.record} prefill={form.prefill} veiculoId={v.id} data={data} onClose={() => setForm(null)} onSaved={() => void reload()} /> : null}
        </AnimatePresence>
        <ConfirmModal
          open={Boolean(del)}
          title={del?.kind === 'veiculos' ? `Excluir o veículo ${del.label}?` : 'Excluir este registro?'}
          text={del?.kind === 'veiculos' ? 'A quilometragem mensal dele é apagada junto. Despesas, multas, revisões e lavagens continuam no histórico, ligadas à placa. Não dá para desfazer.' : `${del?.label ?? ''}. Não dá para desfazer.`}
          confirmLabel="Excluir"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => !busy && setDel(null)}
        />
      </div>
    </motion.div>
  );
}

export type { Veiculo };

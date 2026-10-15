'use client';
import { AnimatePresence } from 'framer-motion';
import { Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmModal } from '../core/Modal';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { downloadCsv, fold } from '@/lib/almoxarifado/stockFormat';
import { ENT, type FrotaData } from '@/lib/frota/types';
import { fmtBRL, fmtDateTime, fmtMes, fmtNum } from '@/lib/frota/format';
import { useLycoBus } from '@/lib/lyco/bus';
import { OPS, OpTable, type OpKind } from './OpTable';
import { RecordForm, recordPath } from './RecordForm';

/** Operação da frota: despesas, multas, revisões e lavagens de todos os veículos. */
export function Operacao({ data, canEdit, reload, onPlate }: { data: FrotaData; canEdit: boolean; reload: () => Promise<void>; onPlate: (placa: string) => void }) {
  const toast = useToast();
  const [t, setT] = useState<OpKind>('despesas');
  const [q, setQ] = useState('');
  const [mes, setMes] = useState('');
  const [limit, setLimit] = useState(100);
  const [form, setForm] = useState<{ record?: Record<string, unknown> | null; prefill?: Record<string, unknown> } | null>(null);
  const [del, setDel] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useLycoBus('frota:operacao', (p) => {
    if (p.tipo) setT(p.tipo);
    setQ(p.query ?? '');
    setMes(p.mes ?? '');
    setLimit(100);
    if (p.novo) setForm({ prefill: p.prefill });
  });

  const o = OPS[t];
  const all = o.arr(data);
  const meses = useMemo(() => [...new Set(all.map((r) => String(o.dt(r) || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [all, o]);
  const rows = useMemo(() => {
    const f = fold(q.trim());
    return all
      .filter((r) => (!mes || String(o.dt(r) || '').slice(0, 7) === mes) && (!f || fold(o.hay(r).filter(Boolean).join(' ')).includes(f)))
      .sort((a, b) => String(o.dt(b) || '').localeCompare(String(o.dt(a) || '')));
  }, [all, o, q, mes]);
  const tot = rows.reduce((s, r) => s + (Number(o.val(r)) || 0), 0);
  const known = useMemo(() => new Set(data.veiculos.map((v) => v.placa)), [data.veiculos]);

  const exportCsv = () => {
    const f = ENT[t].fields;
    downloadCsv(
      `${t}-frota-lyceg-${new Date().toISOString().slice(0, 10)}.csv`,
      f.map((x) => x.l),
      rows.map((r) => f.map((x) => {
        const v = (r as unknown as Record<string, unknown>)[x.k];
        return x.t === 'dtm' ? fmtDateTime(v as string) : (v as string | number | null) ?? '';
      })),
    );
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await api(recordPath(t, del.id), { method: 'DELETE' });
      toast({ kind: 'success', title: 'Registro excluído', text: del.label });
      setDel(null);
      await reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Não foi possível excluir', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>Operação</h1>
            <p>Despesas, multas, revisões e lavagens de toda a frota.</p>
          </div>
          <div className="head-actions">
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}>
              <Download size={18} /> Exportar
            </button>
            <button data-lyco="op-novo" className="btn btn-primary edit-only" onClick={() => setForm({})} disabled={!canEdit}>
              <Plus size={18} /> Nova {o.one}
            </button>
          </div>
        </div>

        <div className="seg fr-seg" role="tablist" aria-label="Tipo de registro">
          {(Object.keys(OPS) as OpKind[]).map((k) => (
            <button
              key={k}
              role="tab"
              data-tab-op={k}
              aria-selected={t === k}
              className={`seg-btn${t === k ? ' is-active' : ''}`}
              onClick={() => {
                setT(k);
                setQ('');
                setMes('');
                setLimit(100);
              }}
            >
              {OPS[k].t} <span className="cnt">{fmtNum(OPS[k].arr(data).length)}</span>
            </button>
          ))}
        </div>

        <div className="toolbar fr-filters">
          <div className="search">
            <Search size={17} />
            <input className="input" placeholder="Buscar placa, serviço, condutor, local…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${o.t.toLowerCase()}`} />
          </div>
          <select className="input" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {fmtMes(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="fr-totline">
          <span>
            <b>{fmtNum(rows.length)}</b> registro(s)
          </span>
          <span>
            Total: <b>{fmtBRL(tot)}</b>
          </span>
        </div>

        <OpTable
          kind={t}
          rows={rows.slice(0, limit)}
          canEdit={canEdit}
          knownPlates={known}
          onPlate={onPlate}
          onEdit={(r) => setForm({ record: r as unknown as Record<string, unknown> })}
          onDelete={(r) => setDel({ id: r.id, label: `${o.one} de ${String(o.dt(r)).slice(0, 10).split('-').reverse().join('/')}` })}
        />
        {rows.length > limit ? (
          <p style={{ textAlign: 'center', marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 100)}>
              Mostrar mais ({fmtNum(rows.length - limit)})
            </button>
          </p>
        ) : null}
      </div>

      <AnimatePresence>{form ? <RecordForm key="f" kind={t} record={form.record} prefill={form.prefill} data={data} onClose={() => setForm(null)} onSaved={() => void reload()} /> : null}</AnimatePresence>
      <ConfirmModal open={Boolean(del)} title="Excluir este registro?" text={`${del?.label ?? ''}. Não dá para desfazer.`} confirmLabel="Excluir" danger busy={busy} onConfirm={remove} onClose={() => !busy && setDel(null)} />
    </div>
  );
}

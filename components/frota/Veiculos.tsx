'use client';
import { AnimatePresence } from 'framer-motion';
import { CarFront, Download, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '../core/Sheet';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { downloadCsv, fold } from '@/lib/almoxarifado/stockFormat';
import { ENT, SITUACOES, ativo, daysTo, normPlaca, okPlaca, postoLabel, type FrotaData, type Veiculo } from '@/lib/frota/types';
import { fmtDate, fmtNum } from '@/lib/frota/format';
import { useLycoBus } from '@/lib/lyco/bus';
import { Plate, Sit, TipoIcon } from './ui';

export interface VeicFilter {
  q: string;
  s: string;
  t: string;
  f: string;
  p: string;
  dev: boolean;
}
export const EMPTY_FILTER: VeicFilter = { q: '', s: '', t: '', f: '', p: '', dev: false };

export function filterVeiculos(list: Veiculo[], vf: VeicFilter, postos: FrotaData['postos']): Veiculo[] {
  const q = fold(vf.q.trim());
  const pName = new Map(postos.map((p) => [p.id, postoLabel(p)]));
  return list.filter(
    (v) =>
      (vf.dev || vf.s === 'Devolvido' || ativo(v)) &&
      (!q || fold([v.placa, v.modelo, v.supervisor, v.posto_planilha, v.fornecedor, v.empresa, v.numero_frota, v.posto_id ? pName.get(v.posto_id) : ''].filter(Boolean).join(' ')).includes(q)) &&
      (!vf.s || v.situacao === vf.s) &&
      (!vf.t || v.tipo === vf.t) &&
      (!vf.f || v.fornecedor === vf.f) &&
      (!vf.p || (vf.p === 'none' ? !v.posto_id : v.posto_id === vf.p)),
  );
}

export function Veiculos({ data, canEdit, reload, onOpen }: { data: FrotaData; canEdit: boolean; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const [vf, setVf] = useState<VeicFilter>(EMPTY_FILTER);
  const [adding, setAdding] = useState<string | null>(null);
  const [limit, setLimit] = useState(120);

  useLycoBus('frota:veiculos', (p) => {
    setVf({ ...EMPTY_FILTER, q: p.query ?? '', s: p.situacao ?? '', p: p.posto ?? '', t: p.tipo ?? '', dev: Boolean(p.dev) });
  });
  useLycoBus('frota:novo-veiculo', (p) => setAdding(p.placas ?? ''));

  const fornecedores = useMemo(() => [...new Set(data.veiculos.map((v) => v.fornecedor).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [data.veiculos]);
  const shown = useMemo(() => filterVeiculos(data.veiculos, vf, data.postos).sort((a, b) => a.placa.localeCompare(b.placa)), [data, vf]);
  const pById = useMemo(() => new Map(data.postos.map((p) => [p.id, p])), [data.postos]);
  const set = (k: keyof VeicFilter, v: string | boolean) => {
    setLimit(120);
    setVf((o) => ({ ...o, [k]: v }));
  };

  const exportCsv = () => {
    const cols = ENT.veiculos.fields.filter((f) => f.k !== 'posto_id');
    downloadCsv(
      `veiculos-lyceg-${new Date().toISOString().slice(0, 10)}.csv`,
      [...cols.map((f) => f.l), 'Posto (mapa)'],
      shown.map((v) => [
        ...cols.map((f) => {
          const x = (v as unknown as Record<string, unknown>)[f.k];
          return x === true ? 'Sim' : x === false ? 'Não' : (x as string | number | null) ?? '';
        }),
        v.posto_id ? postoLabel(pById.get(v.posto_id)) : '',
      ]),
    );
  };

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>Veículos</h1>
            <p>
              {fmtNum(shown.length)} de {fmtNum(data.veiculos.length)} na lista. Toque numa placa para ver a ficha completa.
            </p>
          </div>
          <div className="head-actions">
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!shown.length}>
              <Download size={18} /> Exportar
            </button>
            <button data-lyco="veiculo-novo" className="btn btn-primary edit-only" onClick={() => setAdding('')} disabled={!canEdit}>
              <Plus size={18} /> Novo veículo
            </button>
          </div>
        </div>

        <div className="toolbar fr-filters">
          <div className="search">
            <Search size={17} />
            <input className="input" placeholder="Buscar placa, modelo, supervisor, posto…" value={vf.q} onChange={(e) => set('q', e.target.value)} aria-label="Buscar veículos" />
          </div>
          <select className="input" value={vf.s} onChange={(e) => set('s', e.target.value)} aria-label="Situação">
            <option value="">Todas as situações</option>
            {SITUACOES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input" value={vf.t} onChange={(e) => set('t', e.target.value)} aria-label="Tipo">
            <option value="">Carros e motos</option>
            <option value="CARRO">Carros</option>
            <option value="MOTO">Motos</option>
          </select>
          <select className="input" value={vf.f} onChange={(e) => set('f', e.target.value)} aria-label="Fornecedor">
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select className="input" value={vf.p} onChange={(e) => set('p', e.target.value)} aria-label="Posto">
            <option value="">Todos os postos</option>
            <option value="none">Sem posto</option>
            {data.postos.map((p) => (
              <option key={p.id} value={p.id}>
                {postoLabel(p)}
              </option>
            ))}
          </select>
          <label className="chk">
            <input type="checkbox" checked={vf.dev} onChange={(e) => set('dev', e.target.checked)} /> incluir devolvidos
          </label>
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <CarFront size={24} />
            </span>
            <strong>{data.veiculos.length ? 'Nenhum veículo com esses filtros' : 'Nenhum veículo cadastrado'}</strong>
            <span>{data.veiculos.length ? 'Limpe a busca ou troque os filtros.' : 'Cadastre as placas da frota em "Novo veículo" (dá para colar várias de uma vez).'}</span>
          </div>
        ) : (
          <div className="fr-table" role="table" aria-label="Veículos">
            <div className="fr-tr fr-th" role="row">
              <span role="columnheader">Placa</span>
              <span role="columnheader">Veículo</span>
              <span role="columnheader">Situação</span>
              <span role="columnheader">Posto</span>
              <span role="columnheader">Supervisor</span>
              <span role="columnheader" className="r">
                KM atual
              </span>
              <span role="columnheader">Devolução</span>
            </div>
            {shown.slice(0, limit).map((v) => {
              const dd = daysTo(v.devolucao_prevista);
              return (
                <div key={v.id} className="fr-tr" role="row" tabIndex={0} onClick={() => onOpen(v.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(v.id))} data-lyco-veiculo={v.placa}>
                  <span role="cell">
                    <Plate placa={v.placa} off={!ativo(v)} />
                  </span>
                  <span role="cell" className="fr-veh">
                    <b>
                      <TipoIcon t={v.tipo} /> {v.modelo || '—'}
                    </b>
                    {v.fornecedor ? <small>{v.fornecedor}</small> : null}
                  </span>
                  <span role="cell">
                    <Sit s={v.situacao} />
                  </span>
                  <span role="cell" className="wrap" data-label="Posto">
                    {v.posto_id ? postoLabel(pById.get(v.posto_id)) : v.posto_planilha ? <span className="mut" title="Posto informado na planilha (ainda não alocado no mapa)">{v.posto_planilha}</span> : '—'}
                  </span>
                  <span role="cell" data-label="Supervisor">
                    {v.supervisor || '—'}
                  </span>
                  <span role="cell" className="r" data-label="KM">
                    {fmtNum(v.km_atual)}
                  </span>
                  <span role="cell" data-label="Devolução">
                    {v.devolucao_prevista ? fmtDate(v.devolucao_prevista) : '—'}
                    {dd !== null && dd <= 60 && ativo(v) ? <small className={dd < 0 ? 'bad' : 'warn'}>{dd < 0 ? ` vencida há ${-dd} d` : ` em ${dd} d`}</small> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {shown.length > limit ? (
          <p style={{ textAlign: 'center', marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 200)}>
              Mostrar mais ({fmtNum(shown.length - limit)})
            </button>
          </p>
        ) : null}
      </div>

      <AnimatePresence>{adding !== null ? <NewPlates key="np" initial={adding} data={data} onClose={() => setAdding(null)} onSaved={reload} /> : null}</AnimatePresence>
    </div>
  );
}

/** Uma ou várias placas de uma vez (colar a coluna da planilha funciona). */
function NewPlates({ initial, data, onClose, onSaved }: { initial: string; data: FrotaData; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [situacao, setSituacao] = useState('Operando');
  const [posto, setPosto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useMemo(() => [...new Set(text.split(/[\s,;]+/).map(normPlaca).filter(Boolean))], [text]);
  const bad = list.filter((p) => !okPlaca(p));
  const known = new Set(data.veiculos.map((v) => v.placa));
  const repeated = list.filter((p) => known.has(p));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!list.length) return setError('Informe a placa.');
    if (bad.length) return setError(`Placa inválida: ${bad.join(', ')} (formato ABC1D23 ou ABC1234).`);
    setBusy(true);
    setError('');
    try {
      const j = await api<{ added: number; duplicates: number }>('/api/frota/veiculos', { method: 'POST', json: { placas: list.join(' '), situacao, posto_id: posto || null } });
      toast({ kind: 'success', title: j.added === 1 ? 'Veículo cadastrado' : `${j.added} veículos cadastrados`, text: j.duplicates ? `${j.duplicates} já existia${j.duplicates > 1 ? 'm' : ''} e ficou como estava.` : 'Abra a ficha para completar contrato e KM.' });
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Novo veículo" lead="Uma placa ou várias (uma por linha, ou separadas por espaço)." onClose={() => !busy && onClose()}>
      <form onSubmit={save} className="fr-form" noValidate>
        <label className="label" htmlFor="np-placas">
          Placa(s)
        </label>
        <textarea id="np-placas" className="input textarea is-plate" rows={3} placeholder="ABC1D23" value={text} onChange={(e) => setText(e.target.value.toUpperCase())} autoFocus />
        <p className="help">
          {list.length ? `${list.length} placa${list.length > 1 ? 's' : ''}` : 'Formato Mercosul (ABC1D23) ou antigo (ABC1234).'}
          {bad.length ? <span className="bad"> · inválida: {bad.join(', ')}</span> : null}
          {repeated.length ? <span className="warn"> · já cadastrada: {repeated.join(', ')}</span> : null}
        </p>
        <div className="fr-grid">
          <div className="fr-field">
            <label className="label" htmlFor="np-sit">
              Situação
            </label>
            <select id="np-sit" className="input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              {SITUACOES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="fr-field">
            <label className="label" htmlFor="np-posto">
              Posto
            </label>
            <select id="np-posto" className="input" value={posto} onChange={(e) => setPosto(e.target.value)}>
              <option value="">Sem posto</option>
              {data.postos.map((p) => (
                <option key={p.id} value={p.id}>
                  {postoLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !list.length}>
            {busy ? <span className="spinner" /> : null} Salvar
          </button>
        </div>
      </form>
    </Sheet>
  );
}

'use client';
import { Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmModal } from '../core/Modal';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { fold } from '@/lib/almoxarifado/stockFormat';
import { SIT_TONE, ativo, postoLabel, type FrotaData, type FrotaPosto, type Veiculo } from '@/lib/frota/types';
import { useLycoBus } from '@/lib/lyco/bus';

const nz = (s: string | null | undefined) => fold(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** veículos sem posto cujo "posto na planilha" bate com o nome ou o número de um posto cadastrado */
export function planilhaMatches(data: FrotaData): { p: FrotaPosto; ids: string[] }[] {
  const by = new Map<string, FrotaPosto>();
  data.postos.forEach((p) => [nz(p.name), nz(p.code)].filter(Boolean).forEach((k) => by.set(k, p)));
  const res = new Map<string, { p: FrotaPosto; ids: string[] }>();
  data.veiculos
    .filter((v) => ativo(v) && !v.posto_id && v.posto_planilha)
    .forEach((v) => {
      const p = by.get(nz(v.posto_planilha));
      if (!p) return;
      if (!res.has(p.id)) res.set(p.id, { p, ids: [] });
      res.get(p.id)!.ids.push(v.id);
    });
  return [...res.values()];
}

export async function allocPlanilha(m: { p: FrotaPosto; ids: string[] }[]) {
  for (const x of m) await api('/api/frota/veiculos/alocar', { method: 'POST', json: { ids: x.ids, posto_id: x.p.id } });
}

/** Quadro de alocação: arraste a placa até o posto (no celular, toque na placa e depois na coluna). */
export function Alocar({ data, canEdit, reload, setLocal }: { data: FrotaData; canEdit: boolean; reload: () => Promise<void>; setLocal: (fn: (d: FrotaData) => FrotaData) => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  useLycoBus('frota:alocar', (p) => setQ(p.query ?? ''));

  const at = useMemo(() => data.veiculos.filter(ativo).sort((a, b) => a.placa.localeCompare(b.placa)), [data.veiculos]);
  const cols = useMemo(() => [{ id: '', t: 'Sem posto', s: 'Disponíveis' }, ...data.postos.map((p) => ({ id: p.id, t: postoLabel(p), s: p.address ?? p.city ?? '' }))], [data.postos]);
  const qq = nz(q);
  const visible = (v: Veiculo) => !qq || nz([v.placa, v.modelo, v.supervisor, v.posto_planilha].join(' ')).includes(qq);
  const matches = useMemo(() => planilhaMatches(data), [data]);
  const nMatch = matches.reduce((t, x) => t + x.ids.length, 0);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const move = async (vid: string, pid: string) => {
    setSel(null);
    const v = data.veiculos.find((x) => x.id === vid);
    if (!v || (v.posto_id ?? '') === pid) return;
    if (!canEdit) return toast({ kind: 'error', title: 'Sem permissão', text: 'Você só pode visualizar a alocação.' });
    const old = v.posto_id;
    // otimista: a placa muda de coluna na hora
    setLocal((d) => ({ ...d, veiculos: d.veiculos.map((x) => (x.id === vid ? { ...x, posto_id: pid || null } : x)) }));
    try {
      await api('/api/frota/veiculos/alocar', { method: 'POST', json: { ids: [vid], posto_id: pid || null } });
      toast({ kind: 'success', title: `${v.placa} → ${pid ? postoLabel(data.postos.find((p) => p.id === pid)) : 'Sem posto'}` });
    } catch (err) {
      setLocal((d) => ({ ...d, veiculos: d.veiculos.map((x) => (x.id === vid ? { ...x, posto_id: old } : x)) }));
      toast({ kind: 'error', title: 'Não foi possível mover', text: (err as Error).message });
    }
    void reload();
  };

  const runAuto = async () => {
    setBusy(true);
    try {
      await allocPlanilha(matches);
      toast({ kind: 'success', title: `${nMatch} veículo(s) alocado(s) pela planilha` });
      setAuto(false);
    } catch (err) {
      toast({ kind: 'error', title: 'Não foi possível alocar', text: (err as Error).message });
    } finally {
      setBusy(false);
      void reload();
    }
  };

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>Alocar veículos</h1>
            <p>Arraste a placa até o posto. No celular: toque na placa e depois na coluna de destino.</p>
          </div>
          <div className="head-actions">
            {nMatch ? (
              <button className="btn btn-ghost edit-only" onClick={() => setAuto(true)} disabled={!canEdit}>
                <Zap size={17} /> Alocar pela planilha ({nMatch})
              </button>
            ) : null}
          </div>
        </div>
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input className="input" placeholder="Filtrar por placa, modelo, supervisor…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar placas" />
          </div>
        </div>
        {sel ? <p className="fr-hint">Escolha a coluna de destino para {data.veiculos.find((v) => v.id === sel)?.placa} (Esc cancela).</p> : null}
        <div className="board" ref={boardRef}>
          {cols.map((c) => {
            const list = at.filter((v) => (v.posto_id ?? '') === c.id);
            return (
              <section
                key={c.id || 'none'}
                className={`board-col${sel ? ' is-target' : ''}${over === c.id ? ' is-over' : ''}`}
                aria-label={c.t}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setOver(c.id);
                }}
                onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) void move(id, c.id);
                }}
                onClick={(e) => {
                  if (sel && !(e.target as HTMLElement).closest('.board-chip')) void move(sel, c.id);
                }}
              >
                <header>
                  <span>
                    <b>{c.t}</b>
                    <small>{c.s.slice(0, 60)}</small>
                  </span>
                  <span className="tag">{list.length}</span>
                </header>
                <div className="board-list">
                  {list.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`board-chip sit-${SIT_TONE[v.situacao]}${sel === v.id ? ' is-sel' : ''}`}
                      draggable={canEdit}
                      hidden={!visible(v)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', v.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canEdit) return;
                        if (sel && sel !== v.id) return void move(sel, c.id);
                        setSel((s) => (s === v.id ? null : v.id));
                      }}
                      title={`${v.situacao}${v.posto_planilha ? ' · planilha: ' + v.posto_planilha : ''}`}
                    >
                      <b>{v.placa}</b>
                      <small>{v.modelo || v.situacao}</small>
                    </button>
                  ))}
                  {!list.length ? <p className="board-empty">Solte aqui</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <ConfirmModal
        open={auto}
        title={`Alocar ${nMatch} veículo(s) pela planilha?`}
        text={matches.map((x) => `${postoLabel(x.p)}: ${x.ids.length}`).join(' · ')}
        confirmLabel="Alocar"
        busy={busy}
        onConfirm={runAuto}
        onClose={() => !busy && setAuto(false)}
      />
    </div>
  );
}

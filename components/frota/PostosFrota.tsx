'use client';
import { AnimatePresence } from 'framer-motion';
import { ClipboardList, Download, LocateFixed, MapPin, MapPinOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmModal } from '../core/Modal';
import { Sheet } from '../core/Sheet';
import { useToast } from '../core/Toasts';
import { api } from '../core/api';
import { downloadCsv, fold } from '@/lib/almoxarifado/stockFormat';
import { ativo, postoLabel, type FrotaData, type FrotaPosto } from '@/lib/frota/types';
import { fmtNum } from '@/lib/frota/format';
import { useLycoBus } from '@/lib/lyco/bus';

const nz = (s: string | null | undefined) => fold(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const IGN = new Set(['DEVOLVIDO', 'EM DEVOLUCAO']);

/** nomes de posto da planilha (nos veículos) que ainda não têm posto cadastrado */
function planilhaPendentes(data: FrotaData) {
  const reg = new Set(data.postos.flatMap((p) => [nz(p.name), nz(p.code)]).filter(Boolean));
  const m = new Map<string, { nome: string; n: number }>();
  data.veiculos.filter(ativo).forEach((v) => {
    const k = nz(v.posto_planilha);
    if (!k || IGN.has(k) || reg.has(k)) return;
    const o = m.get(k) ?? { nome: v.posto_planilha!, n: 0 };
    o.n++;
    m.set(k, o);
  });
  return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

export function PostosFrota({ data, canEdit, reload, onMap }: { data: FrotaData; canEdit: boolean; reload: () => Promise<void>; onMap: (postoId: string) => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ posto: FrotaPosto | null; prefill?: Record<string, string> } | null>(null);
  const [del, setDel] = useState<FrotaPosto | null>(null);
  const [busy, setBusy] = useState(false);

  useLycoBus('frota:postos', (p) => {
    setQ(p.query ?? '');
    if (p.novo) setForm({ posto: null, prefill: p.prefill });
    if (p.openId) {
      const po = data.postos.find((x) => x.id === p.openId);
      if (po) setForm({ posto: po });
    }
  });

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    data.veiculos.filter(ativo).forEach((v) => v.posto_id && c.set(v.posto_id, (c.get(v.posto_id) ?? 0) + 1));
    return c;
  }, [data.veiculos]);
  const pend = useMemo(() => planilhaPendentes(data), [data]);
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return data.postos.filter((p) => !t || fold([p.name, p.code, p.city, p.address, p.supervisor].filter(Boolean).join(' ')).includes(t));
  }, [data.postos, q]);
  const located = data.postos.filter((p) => p.lat !== null && p.lng !== null).length;

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await api(`/api/frota/postos/${del.id}`, { method: 'DELETE' });
      toast({ kind: 'success', title: 'Posto removido', text: postoLabel(del) });
      setDel(null);
      await reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Não foi possível remover', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>Postos no mapa</h1>
            <p>
              {fmtNum(located)} de {fmtNum(data.postos.length)} postos com localização. Os postos são os mesmos do Almoxarifado.
            </p>
          </div>
          <div className="head-actions">
            <button
              className="btn btn-ghost"
              disabled={!data.postos.length}
              onClick={() =>
                downloadCsv(
                  `postos-frota-lyceg-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Numeração', 'Nome', 'Endereço', 'Cidade', 'Supervisor', 'Latitude', 'Longitude', 'Veículos'],
                  data.postos.map((p) => [p.code ?? '', p.name, p.address ?? '', p.city ?? '', p.supervisor ?? '', p.lat ?? '', p.lng ?? '', counts.get(p.id) ?? 0]),
                )
              }
            >
              <Download size={18} /> Exportar
            </button>
            <button data-lyco="frota-posto-novo" className="btn btn-primary edit-only" onClick={() => setForm({ posto: null })} disabled={!canEdit}>
              <Plus size={18} /> Novo posto
            </button>
          </div>
        </div>

        {pend.length ? (
          <details className="fr-plan">
            <summary>
              <ClipboardList size={17} /> Postos citados nos veículos (planilha) ainda não cadastrados <span className="tag">{pend.length}</span>
            </summary>
            <p className="help">Toque num nome para cadastrar com o endereço. Se o nome for igual ao da planilha, os veículos podem ser alocados automaticamente na aba Alocar.</p>
            <div className="chips">
              {pend.map((x) => (
                <button key={x.nome} className="chip edit-only" onClick={() => setForm({ posto: null, prefill: { name: x.nome } })} disabled={!canEdit}>
                  {x.nome} <b>{x.n}</b>
                </button>
              ))}
            </div>
          </details>
        ) : null}

        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input className="input" placeholder="Buscar posto, endereço ou supervisor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar postos" />
          </div>
        </div>

        {!shown.length ? (
          <div className="empty">
            <span className="empty-icon">
              <MapPin size={24} />
            </span>
            <strong>{data.postos.length ? 'Nada encontrado' : 'Nenhum posto cadastrado'}</strong>
            <span>{data.postos.length ? 'Tente outro termo.' : 'Cadastre o primeiro posto com o endereço: ele aparece no mapa 3D.'}</span>
          </div>
        ) : (
          <div className="posto-grid">
            {shown.map((p) => {
              const has = p.lat !== null && p.lng !== null;
              return (
                <div key={p.id} className="posto-card fr-posto">
                  <div className="posto-top">
                    <h3>{p.name}</h3>
                    {p.code ? <span className="pill">#{p.code}</span> : null}
                  </div>
                  <div className="sub">{p.address || 'Sem endereço'}</div>
                  <div className="foot">
                    <span className={`badge ${has ? (p.geo_precision === "aproximado" ? "mustard" : "green") : "gray"}`}>
                      {has ? <MapPin size={12} /> : <MapPinOff size={12} />} {has ? (p.geo_precision === 'aproximado' ? 'Local aproximado' : 'No mapa') : 'Sem localização'}
                    </span>
                    <span className="badge royal">{fmtNum(counts.get(p.id) ?? 0)} veíc.</span>
                    <span className="fr-card-acts">
                      {has ? (
                        <button className="icon-btn" onClick={() => onMap(p.id)} aria-label="Ver no mapa" title="Ver no mapa">
                          <LocateFixed size={15} />
                        </button>
                      ) : null}
                      <button className="icon-btn edit-only" onClick={() => setForm({ posto: p })} aria-label="Editar" title="Editar" disabled={!canEdit}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn danger edit-only" onClick={() => setDel(p)} aria-label="Remover" title="Remover" disabled={!canEdit}>
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <AnimatePresence>{form ? <PostoGeoForm key="pf" posto={form.posto} prefill={form.prefill} onClose={() => setForm(null)} onSaved={reload} /> : null}</AnimatePresence>
      <ConfirmModal
        open={Boolean(del)}
        title="Remover este posto?"
        text={del ? `${postoLabel(del)} sai da lista (também do Almoxarifado).${counts.get(del.id) ? ` Os ${counts.get(del.id)} veículos dele ficam sem posto.` : ''} Não dá para desfazer.` : ''}
        confirmLabel="Remover"
        danger
        busy={busy}
        onConfirm={remove}
        onClose={() => !busy && setDel(null)}
      />
    </div>
  );
}

interface Hit {
  lat: number;
  lng: number;
  label: string;
  precision: 'exato' | 'rua' | 'aproximado';
}

/** Cadastro do posto com a busca do endereço no mapa (mostra a precisão de cada resultado). */
function PostoGeoForm({ posto, prefill, onClose, onSaved }: { posto: FrotaPosto | null; prefill?: Record<string, string>; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: posto?.code ?? prefill?.code ?? '',
    name: posto?.name ?? prefill?.name ?? '',
    address: posto?.address ?? prefill?.address ?? '',
    city: posto?.city ?? prefill?.city ?? '',
    supervisor: posto?.supervisor ?? prefill?.supervisor ?? '',
    lat: posto?.lat != null ? String(posto.lat) : '',
    lng: posto?.lng != null ? String(posto.lng) : '',
  });
  const [precision, setPrecision] = useState<string | null>(posto?.geo_precision ?? null);
  const [geoAddr, setGeoAddr] = useState(posto?.address ?? '');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [pick, setPick] = useState(0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }));

  const choose = (list: Hit[], i: number) => {
    const h = list[i];
    if (!h) return;
    setPick(i);
    setF((o) => ({ ...o, lat: h.lat.toFixed(6), lng: h.lng.toFixed(6) }));
    setPrecision(h.precision);
    setGeoAddr(f.address.trim());
    setNote(h.precision === 'aproximado' ? 'Localização aproximada (só rua, bairro ou cidade). Confira ou ajuste latitude e longitude.' : 'Localização encontrada.');
  };

  const locate = async (): Promise<Hit[]> => {
    const q = [f.address, f.city].filter((x) => x.trim()).join(', ');
    if (q.trim().length < 4) {
      setError('Digite o endereço.');
      return [];
    }
    setSearching(true);
    setError('');
    try {
      const j = await api<{ results: Hit[] }>(`/api/frota/geocode?q=${encodeURIComponent(q)}`);
      setHits(j.results);
      if (j.results.length) choose(j.results, 0);
      else setNote('Não encontrei esse endereço. Inclua cidade e bairro (ou o CEP), ou informe latitude e longitude.');
      return j.results;
    } catch (err) {
      setError((err as Error).message);
      return [];
    } finally {
      setSearching(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!f.code.trim() && !f.name.trim()) return setError('Informe a numeração ou o nome do posto.');
    if (!f.address.trim()) return setError('Informe o endereço.');
    const hasCoords = f.lat.trim() && f.lng.trim();
    // mudou o endereço e não localizou de novo: procura e pede conferência antes de salvar
    if (!hasCoords || (precision !== 'manual' && f.address.trim() !== geoAddr)) {
      const r = await locate();
      if (r.length) setNote('Confira o local sugerido (veja a precisão) e toque em Salvar de novo.');
      return;
    }
    setBusy(true);
    try {
      const body = { ...f, geo_precision: precision ?? 'manual' };
      if (posto) await api(`/api/frota/postos/${posto.id}`, { method: 'PATCH', json: body });
      else await api('/api/frota/postos', { method: 'POST', json: body });
      toast({ kind: 'success', title: posto ? 'Posto atualizado' : 'Posto cadastrado', text: 'Já aparece no mapa 3D.' });
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={posto ? 'Editar posto' : 'Novo posto'} lead="O endereço vira um ponto no mapa 3D da frota." onClose={() => !busy && onClose()} wide>
      <form className="fr-form" onSubmit={save} noValidate>
        <div className="fr-grid">
          <div className="fr-field">
            <label className="label" htmlFor="pg-code">
              Numeração
            </label>
            <input id="pg-code" className="input" value={f.code} maxLength={40} onChange={(e) => set('code', e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div className="fr-field">
            <label className="label" htmlFor="pg-name">
              Nome
            </label>
            <input id="pg-name" className="input" value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Hospital Central" />
          </div>
          <div className="fr-field full">
            <label className="label" htmlFor="pg-addr">
              Endereço completo<em aria-hidden> *</em>
            </label>
            <textarea id="pg-addr" className="input textarea" rows={2} value={f.address} maxLength={200} onChange={(e) => set('address', e.target.value)} placeholder="Ex.: Av. Tancredo Neves, 1000, Caminho das Árvores, Salvador - BA (ou o CEP)" />
          </div>
          <div className="fr-field">
            <label className="label" htmlFor="pg-city">
              Cidade
            </label>
            <input id="pg-city" className="input" value={f.city} maxLength={80} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="fr-field">
            <label className="label" htmlFor="pg-sup">
              Supervisor
            </label>
            <input id="pg-sup" className="input" value={f.supervisor} maxLength={120} onChange={(e) => set('supervisor', e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void locate()} disabled={searching}>
          {searching ? <span className="spinner" /> : <LocateFixed size={17} />} {searching ? 'Procurando…' : 'Localizar no mapa'}
        </button>
        {hits && hits.length ? (
          <div className="geo-hits" role="radiogroup" aria-label="Resultados">
            {hits.map((h, i) => (
              <label key={i} className={`geo-hit${pick === i ? ' is-on' : ''}`}>
                <input type="radio" name="geo" checked={pick === i} onChange={() => choose(hits, i)} />
                <span>
                  {h.label}
                  <small className={h.precision === 'aproximado' ? 'warn' : 'ok'}>Precisão: {h.precision}</small>
                </span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="fr-grid">
          <div className="fr-field">
            <label className="label" htmlFor="pg-lat">
              Latitude
            </label>
            <input id="pg-lat" className="input" inputMode="decimal" value={f.lat} onChange={(e) => (set('lat', e.target.value), setPrecision('manual'))} />
          </div>
          <div className="fr-field">
            <label className="label" htmlFor="pg-lng">
              Longitude
            </label>
            <input id="pg-lng" className="input" inputMode="decimal" value={f.lng} onChange={(e) => (set('lng', e.target.value), setPrecision('manual'))} />
          </div>
        </div>
        {note ? <p className="help">{note}</p> : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || searching}>
            {busy ? <span className="spinner" /> : null} Salvar
          </button>
        </div>
      </form>
    </Sheet>
  );
}

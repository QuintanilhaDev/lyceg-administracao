'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPinned, Pencil, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ativo, postoLabel, type FrotaData } from '@/lib/frota/types';
import { fmtNum } from '@/lib/frota/format';
import { firstName } from '@/lib/lyco/clock';
import { greetingFor } from '@/lib/format';
import { useLycoBus } from '@/lib/lyco/bus';
import { fx, getFx } from '@/lib/fx';
import type { FrotaMap } from './frotaMap3D';
import { Plate } from './ui';

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Mapa 3D da frota com os postos e quantos veículos há em cada um. */
export function MapaFrota({ data, userName, onOpen, onAlocar, onEditPosto, canPostos }: { data: FrotaData; userName: string; onOpen: (id: string) => void; onAlocar: () => void; onEditPosto: (id: string) => void; canPostos: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<FrotaMap | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    data.veiculos.filter(ativo).forEach((v) => v.posto_id && c.set(v.posto_id, (c.get(v.posto_id) ?? 0) + 1));
    return c;
  }, [data.veiculos]);
  const located = useMemo(() => data.postos.filter((p) => p.lat !== null && p.lng !== null), [data.postos]);
  const mapPostos = useMemo(() => located.map((p) => ({ id: p.id, label: p.code ? `#${p.code}` : p.name.slice(0, 18), lat: p.lat!, lng: p.lng!, count: counts.get(p.id) ?? 0 })), [located, counts]);

  // cria a cena uma vez (o three.js só baixa quando o mapa aparece)
  useEffect(() => {
    if (!webglOk()) {
      setGl(false);
      return;
    }
    setGl(true);
    let alive = true;
    void import('./frotaMap3D').then(({ createFrotaMap }) => {
      if (!alive || !host.current) return;
      map.current = createFrotaMap(host.current, { onPick: (id) => setSel(id), reduced: getFx() === 'off' });
      map.current.setPostos(mapPostos, selRef.current);
    });
    return () => {
      alive = false;
      map.current?.dispose();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    map.current?.setPostos(mapPostos, sel);
  }, [mapPostos, sel]);
  useEffect(() => {
    map.current?.focus(sel);
  }, [sel]);
  useEffect(() => {
    if (sel && !data.postos.some((p) => p.id === sel)) setSel(null);
  }, [data.postos, sel]);
  useLycoBus('frota:mapa', (p) => setSel(p.postoId ?? null));

  const at = data.veiculos.filter(ativo);
  const alloc = at.filter((v) => v.posto_id).length;
  const posto = sel ? data.postos.find((p) => p.id === sel) ?? null : null;
  const inPosto = posto ? at.filter((v) => v.posto_id === posto.id).sort((a, b) => a.placa.localeCompare(b.placa)) : [];

  return (
    <div className="section-scroll">
      <div className="section-pad wide">
        <div className="section-head">
          <div>
            <h1>
              {greetingFor()}, {firstName(userName)}
            </h1>
            <p>Mapa da frota: cada farol é um posto, e a altura mostra quantos veículos estão nele.</p>
          </div>
        </div>
        <div className="fr-map" data-empty={located.length ? undefined : 'true'}>
          <div className="fr-map-stage" ref={host} />
          {gl === false ? (
            <div className="fr-map-fallback">
              <MapPinned size={26} />
              <strong>Este aparelho não exibe o mapa em 3D.</strong>
              <span>Os postos continuam na lista abaixo e na aba Postos.</span>
            </div>
          ) : null}
          {located.length === 0 ? (
            <div className="fr-map-empty">
              <MapPinned size={22} />
              <span>Nenhum posto com localização ainda. Cadastre em <b>Postos</b> com o endereço: ele aparece aqui na hora.</span>
            </div>
          ) : (
            <p className="fr-map-hint">Arraste para girar · role ou faça pinça para o zoom · toque num farol</p>
          )}
          <AnimatePresence>
            {posto ? (
              <motion.aside key={posto.id} className="fr-map-card" {...fx.modal}>
                <button className="icon-btn" onClick={() => setSel(null)} aria-label="Fechar">
                  <X size={17} />
                </button>
                <h3>{postoLabel(posto)}</h3>
                <p className="help">{posto.address ?? ''}</p>
                <div className="fr-map-big">
                  <b>{fmtNum(inPosto.length)}</b>
                  <span>veículo{inPosto.length === 1 ? '' : 's'} neste posto</span>
                </div>
                <div className="fr-plates">
                  {inPosto.length ? inPosto.map((v) => <Plate key={v.id} placa={v.placa} onClick={() => onOpen(v.id)} title={`${v.modelo ?? ''} · ${v.situacao}`} />) : <span className="help">Nenhum veículo alocado.</span>}
                </div>
                <div className="fr-map-acts">
                  <button className="btn btn-primary btn-sm" onClick={onAlocar}>
                    Alocar veículos
                  </button>
                  {canPostos ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => onEditPosto(posto.id)}>
                      <Pencil size={14} /> Editar posto
                    </button>
                  ) : null}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="stat-grid fr-kpis">
          {(
            [
              [fmtNum(data.postos.length), 'Postos'],
              [fmtNum(at.length), 'Veículos ativos'],
              [fmtNum(alloc), 'Alocados'],
              [fmtNum(at.length - alloc), 'Sem posto'],
              [fmtNum(at.filter((v) => v.situacao === 'Manutenção').length), 'Em manutenção'],
            ] as const
          ).map(([n, t]) => (
            <div key={t} className="stat">
              <small>{t}</small>
              <b>{n}</b>
            </div>
          ))}
        </div>
        {gl === false && located.length ? (
          <div className="fr-cards">
            {located.map((p) => (
              <button key={p.id} className="panel fr-card fr-posto-pick" onClick={() => setSel(p.id)}>
                <b>{postoLabel(p)}</b>
                <span>{fmtNum(counts.get(p.id) ?? 0)} veículos</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

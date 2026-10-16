'use client';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, CarFront, ClipboardList, Gauge, Lock, Map as MapIcon, MapPin, UserRound, UsersRound } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountSettings } from '../core/AccountSettings';
import { AppFrame, type FrameTab } from '../core/AppFrame';
import { TeamManager } from '../core/TeamManager';
import { ToastProvider } from '../core/Toasts';
import { useWarp } from '../core/Warp';
import { PanelSkeleton, usePreload } from '../core/lazy';
import { LycoAssistant } from '../lyco/LycoAssistant';
import { lycoEmit, useLycoBus } from '@/lib/lyco/bus';
import { canManageSector, hasLevel } from '@/lib/permissions';
import { useRealtime } from '@/lib/realtime';
import { getSector, sectorPath } from '@/lib/sectors';
import { useHashTab, useSession } from '@/lib/useSession';
import type { FrotaData } from '@/lib/frota/types';
import type { LycoHost } from '@/lib/lyco/types';
import { FichaVeiculo, type FichaTab } from './FichaVeiculo';
import { useFrota } from './useFrota';
import '../almoxarifado/estoque.css';
import './frota.css';

const loadMapa = () => import('./MapaFrota');
const loadPainel = () => import('./PainelFrota');
const loadVeic = () => import('./Veiculos');
const loadAlocar = () => import('./Alocar');
const loadOper = () => import('./Operacao');
const loadPostos = () => import('./PostosFrota');
const MapaFrota = dynamic(() => loadMapa().then((m) => m.MapaFrota), { loading: PanelSkeleton });
const PainelFrota = dynamic(() => loadPainel().then((m) => m.PainelFrota), { loading: PanelSkeleton });
const Veiculos = dynamic(() => loadVeic().then((m) => m.Veiculos), { loading: PanelSkeleton });
const Alocar = dynamic(() => loadAlocar().then((m) => m.Alocar), { loading: PanelSkeleton });
const Operacao = dynamic(() => loadOper().then((m) => m.Operacao), { loading: PanelSkeleton });
const PostosFrota = dynamic(() => loadPostos().then((m) => m.PostosFrota), { loading: PanelSkeleton });

const SLUG = 'frota';
type Tab = 'mapa' | 'painel' | 'veiculos' | 'alocar' | 'operacao' | 'postos' | 'equipe' | 'conta' | 'inicio';
const VALID: Tab[] = ['mapa', 'painel', 'veiculos', 'alocar', 'operacao', 'postos', 'equipe', 'conta', 'inicio'];

/** Ferramenta do setor Frota: mapa 3D, painel, veículos, alocação, operação e postos. */
export function FrotaApp() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  usePreload([loadPainel, loadVeic, loadAlocar, loadOper, loadPostos]);
  const sector = getSector(SLUG)!;
  const { user, setUser, refresh, intro, endIntro, logout } = useSession(sectorPath(SLUG));
  const [tab, setTab] = useHashTab<Tab>(VALID, 'mapa');
  const warp = useWarp();
  const frota = useFrota();
  const [local, setLocalData] = useState<FrotaData | null>(null);
  const [teamVersion, setTeamVersion] = useState(0);
  const [ficha, setFicha] = useState<{ id: string; tab?: FichaTab } | null>(null);
  const data = local ?? frota.data;
  useEffect(() => setLocalData(null), [frota.data]);
  const setLocal = useCallback((fn: (d: FrotaData) => FrotaData) => setLocalData((cur) => (cur ?? frota.data ? fn((cur ?? frota.data)!) : cur)), [frota.data]);

  const lv = (m: string, l: 'view' | 'edit' = 'view') => hasLevel(user, SLUG, m, l);
  const can = {
    painel: lv('painel'),
    veiculos: lv('veiculos'),
    alocacao: lv('alocacao'),
    operacao: lv('operacao'),
    postos: lv('postos'),
  };
  const anyView = Object.values(can).some(Boolean);
  const manager = canManageSector(user, SLUG);

  const reload = frota.reload;
  useEffect(() => {
    if (user && anyView) void reload();
  }, [user, anyView, reload]);
  const anyRef = useRef(anyView);
  anyRef.current = anyView;
  useEffect(() => {
    // o Lyco acabou de alterar algo da frota: recarrega já
    const on = (e: Event) => {
      const paths = (e as CustomEvent<string[]>).detail ?? [];
      if (anyRef.current && paths.some((p) => p.startsWith('/api/frota'))) void reload();
    };
    window.addEventListener('lyceg:changed', on);
    return () => window.removeEventListener('lyceg:changed', on);
  }, [reload]);
  useRealtime(
    (ev) => {
      if ((ev === 'frota:update' || ev === 'postos:update') && anyRef.current) void reload();
      if (ev === 'admins:update') {
        refresh();
        setTeamVersion((v) => v + 1);
      }
    },
    () => {
      refresh();
      if (anyRef.current) void reload();
    },
    12000,
  );

  const tabs = useMemo<FrameTab[]>(
    () => [
      ...(anyView ? [{ id: 'mapa', label: 'Mapa 3D', short: 'Mapa', icon: MapIcon }] : user ? [{ id: 'inicio', label: 'Início', short: 'Início', icon: Lock }] : []),
      ...(can.painel ? [{ id: 'painel', label: 'Painel', short: 'Painel', icon: Gauge }] : []),
      ...(can.veiculos || can.painel ? [{ id: 'veiculos', label: 'Veículos', short: 'Veículos', icon: CarFront }] : []),
      ...(can.alocacao ? [{ id: 'alocar', label: 'Alocar', short: 'Alocar', icon: ArrowLeftRight }] : []),
      ...(can.operacao ? [{ id: 'operacao', label: 'Operação', short: 'Operação', icon: ClipboardList }] : []),
      ...(can.postos ? [{ id: 'postos', label: 'Postos', short: 'Postos', icon: MapPin }] : []),
      ...(manager ? [{ id: 'equipe', label: 'Equipe', short: 'Equipe', icon: UsersRound }] : []),
      { id: 'conta', label: 'Minha conta', short: 'Conta', icon: UserRound },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anyView, can.painel, can.veiculos, can.alocacao, can.operacao, can.postos, manager, user],
  );
  const allowed = (t: Tab) => tabs.some((x) => x.id === t);
  const home: Tab = anyView ? 'mapa' : 'inicio';
  const current: Tab = !user ? tab : allowed(tab) ? tab : home;

  const openFicha = useCallback((id: string, t?: FichaTab) => setFicha({ id, tab: t }), []);
  useLycoBus('frota:ficha', (p) => setFicha({ id: p.id, tab: p.tab }));
  const openByPlate = useCallback(
    (placa: string) => {
      const v = data?.veiculos.find((x) => x.placa === placa);
      if (v) setFicha({ id: v.id });
    },
    [data],
  );

  const dataRef = useRef(data);
  dataRef.current = data;
  const host = useMemo<LycoHost>(
    () => ({
      scope: 'sector',
      sector,
      user,
      tabs: [
        ...(anyView ? [{ id: 'mapa', label: 'Mapa 3D', aliases: ['mapa', 'mapa 3d', 'holograma', 'mapa da frota', 'inicio', 'visao geral'] }] : []),
        ...(can.painel ? [{ id: 'painel', label: 'Painel', aliases: ['painel', 'indicadores', 'graficos', 'dashboard', 'resumo da frota', 'alertas'] }] : []),
        ...(can.veiculos || can.painel ? [{ id: 'veiculos', label: 'Veículos', aliases: ['veiculos', 'veiculo', 'carros', 'motos', 'placas', 'lista de veiculos', 'viaturas', 'vtr'] }] : []),
        ...(can.alocacao ? [{ id: 'alocar', label: 'Alocar', aliases: ['alocar', 'alocacao', 'quadro', 'distribuicao', 'mover veiculos'] }] : []),
        ...(can.operacao ? [{ id: 'operacao', label: 'Operação', aliases: ['operacao', 'despesas', 'multas', 'revisoes', 'lavagens', 'gastos'] }] : []),
        ...(can.postos ? [{ id: 'postos', label: 'Postos', aliases: ['postos', 'postos no mapa', 'enderecos', 'localizacao dos postos'] }] : []),
        ...(manager ? [{ id: 'equipe', label: 'Equipe', aliases: ['equipe', 'permissoes', 'time', 'pessoas'] }] : []),
        { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta', 'perfil', 'senha', 'minha senha'] },
      ],
      tab: current,
      goTab: (id) => setTab(id as Tab),
      can: (m, level = 'view') => hasLevel(user, SLUG, m, level),
      navigate: (path, opts) => warp.go(path, opts),
      logout,
      frota: { data: () => (anyRef.current ? dataRef.current : null) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sector, user, anyView, can.painel, can.veiculos, can.alocacao, can.operacao, can.postos, manager, current, setTab, logout, warp],
  );

  const readOnly =
    (current === 'veiculos' && !lv('veiculos', 'edit')) ||
    (current === 'alocar' && !lv('alocacao', 'edit')) ||
    (current === 'operacao' && !lv('operacao', 'edit')) ||
    (current === 'postos' && !lv('postos', 'edit'));

  return (
    <>
      <AppFrame sub={sector.name} tabs={tabs} tab={current} onTab={(t) => setTab(t as Tab)} user={user} onLogout={logout} intro={intro} onIntroEnd={endIntro}>
        {!user ? (
          <div className="rc-empty" style={{ margin: 'auto' }}>
            <span className="spinner" /> Carregando…
          </div>
        ) : (
          <div className={`module${readOnly ? ' is-readonly' : ''}`}>
            {readOnly ? (
              <div className="readonly-note" role="note">
                Você está só visualizando esta parte da Frota. Para alterar, peça a permissão de edição ao master do setor.
              </div>
            ) : null}
            {data?.missing?.length ? (
              <div className="readonly-note warn" role="note">
                Falta ativar a Frota no banco: rode o arquivo <b>supabase/frota.sql</b> no SQL Editor do Supabase.
              </div>
            ) : null}
            {current === 'inicio' && (
              <div className="section-scroll">
                <div className="section-pad">
                  <div className="blank-tool">
                    <span className="empty-icon">
                      <Lock size={24} />
                    </span>
                    <strong>Você ainda não tem acesso às ferramentas da Frota</strong>
                    <span>Peça ao master do setor para liberar o acesso.</span>
                  </div>
                </div>
              </div>
            )}
            {current !== 'inicio' && current !== 'equipe' && current !== 'conta' && !data ? (
              frota.failed ? (
                <div className="section-scroll">
                  <div className="section-pad">
                    <div className="empty">
                      <strong>Não foi possível carregar a frota</strong>
                      <span>Confira a conexão e tente de novo.</span>
                      <button className="btn btn-primary" onClick={() => void reload()}>
                        Tentar de novo
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <PanelSkeleton />
              )
            ) : null}
            {data && current === 'mapa' && (
              <MapaFrota
                data={data}
                userName={user.display_name}
                onOpen={openFicha}
                onAlocar={() => setTab(can.alocacao ? 'alocar' : 'veiculos')}
                onEditPosto={(id) => {
                  setTab('postos');
                  lycoEmit('frota:postos', { openId: id });
                }}
                canPostos={lv('postos', 'edit')}
              />
            )}
            {data && current === 'painel' && <PainelFrota data={data} onOpen={openFicha} />}
            {data && current === 'veiculos' && <Veiculos data={data} canEdit={lv('veiculos', 'edit')} reload={reload} onOpen={openFicha} />}
            {data && current === 'alocar' && <Alocar data={data} canEdit={lv('alocacao', 'edit')} reload={reload} setLocal={setLocal} />}
            {data && current === 'operacao' && <Operacao data={data} canEdit={lv('operacao', 'edit')} reload={reload} onPlate={openByPlate} />}
            {data && current === 'postos' && (
              <PostosFrota
                data={data}
                canEdit={lv('postos', 'edit')}
                reload={reload}
                onMap={(id) => {
                  setTab('mapa');
                  lycoEmit('frota:mapa', { postoId: id });
                }}
              />
            )}
            {current === 'equipe' && manager && <TeamManager slug={SLUG} me={user} version={teamVersion} />}
            {current === 'conta' && <AccountSettings user={user} setUser={setUser} onLogout={logout} />}
          </div>
        )}
      </AppFrame>
      <AnimatePresence>
        {ficha && data && data.veiculos.some((v) => v.id === ficha.id) ? (
          <FichaVeiculo
            key={'f' + ficha.id}
            id={ficha.id}
            tab={ficha.tab}
            data={data}
            canEdit={lv('veiculos', 'edit')}
            canOp={lv('operacao', 'edit')}
            canAlloc={lv('alocacao', 'edit')}
            reload={reload}
            onClose={() => setFicha(null)}
          />
        ) : null}
      </AnimatePresence>
      <LycoAssistant host={host} />
    </>
  );
}

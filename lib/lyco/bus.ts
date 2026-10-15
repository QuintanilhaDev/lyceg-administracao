'use client';
import { useEffect, useRef } from 'react';

/**
 * Canal entre o Lyco e as telas. O Lyco pede ("filtre as pendentes", "mostre o último mês")
 * e a tela obedece. Se a tela ainda não estiver aberta (a aba está trocando), o pedido
 * fica guardado por alguns segundos e é entregue quando ela aparecer.
 */
export interface LycoEvents {
  'almox:inbox': { filter?: 'nova' | 'pendente' | 'resolvida'; protocol?: number; query?: string };
  'almox:estoque': { filter?: 'todos' | 'baixo' | 'zerado' | 'postos'; query?: string; openId?: string; category?: string };
  'almox:metricas': { period: 'ultimo-dia' | 'hoje' | 'ultima-semana' | 'ultimo-mes' };
  'almox:postos': { query?: string; openId?: string };
  /** aviso falado pelo Lyco (ex.: nova solicitação de compra); tone alert = pisca em amarelo */
  /** abre uma solicitação de compra na tela (Almoxarifado ou Compras) */
  'compras:open': { id: string };
  /** fornecedores (setor Compras): abrir um, abrir o cadastro (já preenchido) ou buscar */
  'fornecedores:open': { id: string };
  'fornecedores:new': { prefill?: Record<string, string> };
  'fornecedores:import': Record<string, never>;
  'fornecedores:search': { q: string };
  /** Projeto 3: abre um pedido de material / filtra o painel */
  'pedidos:open': { id?: string; number?: number; filter?: string; query?: string };
  'lyco:announce': { text: string; tone?: 'alert' };
  /** Frota: filtrar a lista, abrir a ficha de um veículo, abrir cadastros e telas da operação */
  'frota:veiculos': { query?: string; situacao?: string; posto?: string; tipo?: string; dev?: boolean };
  'frota:ficha': { id: string; tab?: 'resumo' | 'contrato' | 'km' | 'revisoes' | 'despesas' | 'multas' | 'lavagens' };
  'frota:novo-veiculo': { placas?: string };
  'frota:operacao': { tipo?: 'despesas' | 'multas' | 'revisoes' | 'lavagens'; query?: string; mes?: string; novo?: boolean; prefill?: Record<string, string> };
  'frota:mapa': { postoId?: string | null };
  'frota:alocar': { query?: string };
  'frota:postos': { query?: string; novo?: boolean; prefill?: Record<string, string>; openId?: string };
  'hub:users': { create?: { name?: string; sector?: string; master?: boolean }; sector?: string; query?: string };
}

type Name = keyof LycoEvents;
type Handler<K extends Name> = (payload: LycoEvents[K]) => void;

const handlers = new Map<Name, Set<Handler<Name>>>();
const pending = new Map<Name, { payload: unknown; at: number }>();
const KEEP_MS = 9000;
/** enquanto o Lyco corre até o botão, os pedidos para a tela ficam guardados e saem depois do soco */
let held = 0;
const queue: { name: Name; payload: unknown }[] = [];
export function holdBus(): () => void {
  held++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held = Math.max(0, held - 1);
    if (!held) queue.splice(0).forEach((e) => lycoEmit(e.name, e.payload as never));
  };
}

export function lycoEmit<K extends Name>(name: K, payload: LycoEvents[K]) {
  if (held) {
    queue.push({ name, payload });
    return;
  }
  const set = handlers.get(name);
  if (set && set.size) {
    pending.delete(name);
    set.forEach((h) => (h as Handler<K>)(payload));
  } else {
    pending.set(name, { payload, at: Date.now() });
  }
}

export function useLycoBus<K extends Name>(name: K, handler: Handler<K>) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: Handler<K> = (p) => ref.current(p);
    let set = handlers.get(name);
    if (!set) {
      set = new Set();
      handlers.set(name, set);
    }
    set.add(h as Handler<Name>);
    const wait = pending.get(name);
    if (wait) {
      pending.delete(name);
      if (Date.now() - wait.at < KEEP_MS) h(wait.payload as LycoEvents[K]);
    }
    return () => {
      set!.delete(h as Handler<Name>);
    };
  }, [name]);
}

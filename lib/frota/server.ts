import 'server-only';
import { db } from '../supabaseAdmin';
import { fetchAll, str } from '../almoxarifado/stockData';
import { ENT, normPlaca, okPlaca, parseNum, type FrotaData, type FrotaPosto, type RecordKind } from './types';

/** Falta rodar o supabase/frota.sql? (tabela ou coluna inexistente) */
export const missingTable = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code ?? '';
  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(code);
};
export const FROTA_SETUP = 'A Frota ainda não foi ativada no banco. Rode o arquivo supabase/frota.sql no SQL Editor do Supabase.';

const ORDER: Record<string, string> = {
  veiculos: 'placa',
  frota_km: 'mes',
  frota_despesas: 'data',
  frota_multas: 'data_hora',
  frota_revisoes: 'data',
  frota_lavagens: 'data',
};

/** Tudo o que a tela da Frota mostra, de uma vez (os dados da frota são pequenos). */
export async function loadFrota(): Promise<FrotaData> {
  const missing: string[] = [];
  const get = async <T,>(table: string): Promise<T[]> => {
    try {
      return await fetchAll<T>(table, '*', { column: ORDER[table], tiebreak: 'id' });
    } catch (e) {
      if (missingTable(e)) {
        missing.push(table);
        return [];
      }
      throw e;
    }
  };
  let postos: FrotaPosto[];
  try {
    postos = await fetchAll<FrotaPosto>('postos', 'id, name, code, city, address, supervisor, lat, lng, geo_precision', { column: 'name_key', tiebreak: 'id' });
  } catch (e) {
    if (!missingTable(e)) throw e;
    missing.push('postos.lat');
    const base = await fetchAll<Omit<FrotaPosto, 'lat' | 'lng' | 'geo_precision'>>('postos', 'id, name, code, city, address, supervisor', { column: 'name_key', tiebreak: 'id' });
    postos = base.map((p) => ({ ...p, lat: null, lng: null, geo_precision: null }));
  }
  const [veiculos, km, despesas, multas, revisoes, lavagens] = await Promise.all([
    get<FrotaData['veiculos'][number]>('veiculos'),
    get<FrotaData['km'][number]>('frota_km'),
    get<FrotaData['despesas'][number]>('frota_despesas'),
    get<FrotaData['multas'][number]>('frota_multas'),
    get<FrotaData['revisoes'][number]>('frota_revisoes'),
    get<FrotaData['lavagens'][number]>('frota_lavagens'),
  ]);
  const num = <T extends Record<string, unknown>>(rows: T[], keys: string[]) =>
    rows.map((r) => {
      const o: Record<string, unknown> = { ...r };
      for (const k of keys) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]);
      return o as T;
    });
  return {
    veiculos: num(veiculos as unknown as Record<string, unknown>[], ['valor_locacao', 'valor_contratado']) as unknown as FrotaData['veiculos'],
    postos,
    km: num(km as unknown as Record<string, unknown>[], ['comb_cartao']) as unknown as FrotaData['km'],
    despesas: num(despesas as unknown as Record<string, unknown>[], ['valor']) as unknown as FrotaData['despesas'],
    multas: num(multas as unknown as Record<string, unknown>[], ['valor']) as unknown as FrotaData['multas'],
    revisoes: num(revisoes as unknown as Record<string, unknown>[], ['valor1', 'valor2', 'valor3', 'custo_total']) as unknown as FrotaData['revisoes'],
    lavagens: num(lavagens as unknown as Record<string, unknown>[], ['valor']) as unknown as FrotaData['lavagens'],
    ...(missing.length ? { missing } : {}),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;

/**
 * Confere e limpa os campos de um registro. `partial`: só os campos enviados (edição).
 * Devolve a linha pronta para o banco ou a mensagem do primeiro problema.
 */
export async function cleanRecord(kind: RecordKind, body: Record<string, unknown>, partial: boolean): Promise<{ row: Record<string, unknown> } | { error: string }> {
  const row: Record<string, unknown> = {};
  for (const f of ENT[kind].fields) {
    if (partial && !(f.k in body)) continue;
    const raw = body[f.k];
    const s = raw === null || raw === undefined ? '' : String(raw).trim();
    let v: unknown;
    switch (f.t) {
      case 'bool':
        v = raw === true || s === '1' || s.toLowerCase() === 'sim' || s === 'true' ? true : raw === false || s === '0' || s.toLowerCase() === 'nao' || s.toLowerCase() === 'não' || s === 'false' ? false : null;
        break;
      case 'num':
      case 'money': {
        const n = parseNum(raw === '' ? null : raw);
        if (Number.isNaN(n)) return { error: `Valor inválido em "${f.l}".` };
        v = n === null ? null : f.t === 'num' ? Math.round(n as number) : Math.round((n as number) * 100) / 100;
        if (typeof v === 'number' && (v < (f.t === 'num' ? 0 : -1e9) || v > 1e9)) return { error: `Valor fora do limite em "${f.l}".` };
        break;
      }
      case 'placa': {
        v = s ? normPlaca(s) : null;
        if (v && !okPlaca(v as string)) return { error: `Placa inválida em "${f.l}" (formato ABC1D23 ou ABC1234).` };
        break;
      }
      case 'date': {
        let d = s.slice(0, 10);
        if (kind === 'km' && f.k === 'mes' && /^\d{4}-\d{2}$/.test(s)) d = s + '-01';
        if (d && !validDate(d)) return { error: `Data inválida em "${f.l}".` };
        v = d || null;
        if (kind === 'km' && f.k === 'mes' && v) v = (v as string).slice(0, 7) + '-01';
        break;
      }
      case 'dtm': {
        if (!s) v = null;
        else {
          // "2026-10-15T14:30" (horário da Bahia, sem fuso) ou ISO completo
          const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s + ':00-03:00' : s;
          const t = Date.parse(iso);
          if (Number.isNaN(t)) return { error: `Data e hora inválidas em "${f.l}".` };
          v = new Date(t).toISOString();
        }
        break;
      }
      case 'sel':
        v = s ? (f.o?.find((o) => o.toLowerCase() === s.toLowerCase()) ?? null) : null;
        if (s && v === null) return { error: `Opção inválida em "${f.l}".` };
        break;
      case 'posto': {
        v = s || null;
        if (v) {
          const { data, error } = await db().from('postos').select('id').eq('id', v as string).maybeSingle();
          if (error || !data) return { error: 'Posto não encontrado (foi removido?).' };
        }
        break;
      }
      default:
        v = str(s, f.max ?? (f.t === 'area' ? 1000 : 200));
    }
    if (f.req && (v === null || v === '')) return { error: `Preencha "${f.l}".` };
    row[f.k] = v;
  }
  if (kind === 'lavagens' && typeof row.data === 'string') row.mes = (row.data as string).slice(0, 7) + '-01';
  if (kind === 'revisoes' && (row.custo_total === null || (!partial && row.custo_total === undefined)) && [row.valor1, row.valor2, row.valor3].some((x) => typeof x === 'number')) {
    row.custo_total = Math.round((((row.valor1 as number) || 0) + ((row.valor2 as number) || 0) + ((row.valor3 as number) || 0)) * 100) / 100;
  }
  if (kind === 'km' && (row.km_total === null || (!partial && row.km_total === undefined)) && [row.km1, row.km2, row.km3, row.km4].some((x) => typeof x === 'number')) {
    row.km_total = ((row.km1 as number) || 0) + ((row.km2 as number) || 0) + ((row.km3 as number) || 0) + ((row.km4 as number) || 0);
  }
  return { row };
}

/** mensagem amigável para erros comuns do banco */
export function frotaDbMessage(e: unknown): string | null {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return null;
  if (missingTable(err)) return FROTA_SETUP;
  if (err.code === '23505') return /placa/.test(err.message ?? '') ? 'Já existe um veículo com essa placa.' : /veiculo_id/.test(err.message ?? '') ? 'Este veículo já tem quilometragem lançada neste mês. Edite o mês existente.' : 'Já existe um registro igual.';
  if (err.code === '23514') return 'Algum valor está fora do permitido. Confira os campos.';
  if (err.code === '23503') return 'O posto ou veículo escolhido não existe mais.';
  return null;
}

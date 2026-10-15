/**
 * Frota: tipos e a descrição dos campos de cada registro.
 * A mesma descrição monta os formulários na tela e valida os dados no servidor.
 */

export const SITUACOES = ['Operando', 'Em rota', 'Manutenção', 'Parado', 'Em devolução', 'Devolvido'] as const;
export type Situacao = (typeof SITUACOES)[number];
export const TIPOS_VEICULO = ['CARRO', 'MOTO'] as const;
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number];

/** cor de cada situação (pontinho na lista, borda no quadro de alocação) */
export const SIT_TONE: Record<Situacao, string> = {
  Operando: 'ok',
  'Em rota': 'info',
  Manutenção: 'warn',
  Parado: 'bad',
  'Em devolução': 'warn2',
  Devolvido: 'off',
};

export interface Veiculo {
  id: string;
  placa: string;
  tipo: TipoVeiculo | null;
  modelo: string | null;
  empresa: string | null;
  numero_frota: string | null;
  situacao: Situacao;
  posto_id: string | null;
  posto_planilha: string | null;
  supervisor: string | null;
  fornecedor: string | null;
  situacao_contrato: string | null;
  valor_locacao: number | null;
  valor_contratado: number | null;
  prazo_meses: number | null;
  data_recebimento: string | null;
  devolucao_prevista: string | null;
  km_entrega: number | null;
  km_atual: number | null;
  km_contratado: number | null;
  km_locadora: number | null;
  custo_por: string | null;
  status_combustivel: string | null;
  rastreador: string | null;
  tag: boolean | null;
  seguro: boolean | null;
  data_plotagem: string | null;
  obs: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface KmMes {
  id: string;
  veiculo_id: string;
  mes: string;
  km1: number | null;
  km2: number | null;
  km3: number | null;
  km4: number | null;
  km_total: number | null;
  comb_cartao: number | null;
  posto_planilha: string | null;
  supervisor: string | null;
}

export interface Despesa {
  id: string;
  data: string;
  empresa: string | null;
  tipo: string | null;
  placa: string | null;
  prestador: string | null;
  cliente: string | null;
  servico: string | null;
  valor: number;
  obs: string | null;
}
export interface Multa {
  id: string;
  data_hora: string;
  tipo: string | null;
  ait: string | null;
  placa: string;
  locadora: string | null;
  condutor: string | null;
  local: string | null;
  municipio: string | null;
  valor: number;
  infracao: string | null;
}
export interface Revisao {
  id: string;
  data: string;
  placa: string;
  tipo: string | null;
  servico: string | null;
  ultima_rev: number | null;
  prox_rev: number | null;
  descricao: string | null;
  item1: string | null;
  valor1: number | null;
  item2: string | null;
  valor2: number | null;
  item3: string | null;
  valor3: number | null;
  custo_total: number | null;
  obs: string | null;
}
export interface Lavagem {
  id: string;
  data: string;
  mes: string | null;
  placa: string;
  posto: string | null;
  vtr: string | null;
  valor: number;
}

/** Posto como a Frota enxerga (o mesmo cadastro do Almoxarifado, com a localização). */
export interface FrotaPosto {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  supervisor: string | null;
  lat: number | null;
  lng: number | null;
  geo_precision: string | null;
}

export interface FrotaData {
  veiculos: Veiculo[];
  postos: FrotaPosto[];
  km: KmMes[];
  despesas: Despesa[];
  multas: Multa[];
  revisoes: Revisao[];
  lavagens: Lavagem[];
  /** tabelas que ainda não existem no banco (falta rodar o frota.sql) */
  missing?: string[];
}

/* ---------- campos dos formulários ---------- */

export type FieldKind = 'text' | 'sel' | 'posto' | 'bool' | 'area' | 'date' | 'dtm' | 'num' | 'money' | 'placa';
export interface FieldDef {
  k: string;
  l: string;
  t?: FieldKind;
  /** opções (t = 'sel') */
  o?: readonly string[];
  req?: boolean;
  /** começa um grupo novo no formulário */
  g?: string;
  /** ocupa a linha inteira */
  full?: boolean;
  /** sugestões (datalist) */
  suggest?: 'empresa' | 'fornecedor' | 'supervisor';
  max?: number;
}

export type RecordKind = 'veiculos' | 'despesas' | 'multas' | 'revisoes' | 'lavagens' | 'km';

export const ENT: Record<RecordKind, { nome: string; table: string; module: 'veiculos' | 'operacao'; fields: FieldDef[] }> = {
  veiculos: {
    nome: 'veículo',
    table: 'veiculos',
    module: 'veiculos',
    fields: [
      { g: 'Identificação', k: 'placa', l: 'Placa', t: 'placa', req: true },
      { k: 'tipo', l: 'Tipo', t: 'sel', o: TIPOS_VEICULO },
      { k: 'modelo', l: 'Marca/modelo', max: 80 },
      { k: 'empresa', l: 'Empresa', suggest: 'empresa', max: 80 },
      { k: 'numero_frota', l: 'Nº na frota', max: 30 },
      { k: 'situacao', l: 'Situação', t: 'sel', o: SITUACOES, req: true },
      { k: 'posto_id', l: 'Posto (mapa)', t: 'posto' },
      { k: 'posto_planilha', l: 'Posto (nome na planilha)', max: 120 },
      { k: 'supervisor', l: 'Supervisor', suggest: 'supervisor', max: 120 },
      { g: 'Contrato', k: 'fornecedor', l: 'Fornecedor/locadora', suggest: 'fornecedor', max: 120 },
      { k: 'situacao_contrato', l: 'Situação do contrato', t: 'sel', o: ['ATIVO', 'ENCERRADO', 'OUTROS'] },
      { k: 'valor_locacao', l: 'Valor da locação (R$)', t: 'money' },
      { k: 'valor_contratado', l: 'Valor contratado (R$)', t: 'money' },
      { k: 'prazo_meses', l: 'Prazo (meses)', t: 'num' },
      { k: 'data_recebimento', l: 'Data de recebimento', t: 'date' },
      { k: 'devolucao_prevista', l: 'Devolução prevista', t: 'date' },
      { k: 'km_entrega', l: 'KM de entrega', t: 'num' },
      { g: 'Quilometragem e combustível', k: 'km_atual', l: 'KM atual', t: 'num' },
      { k: 'km_contratado', l: 'KM contratado/mês (9999 = ilimitado)', t: 'num' },
      { k: 'km_locadora', l: 'KM da locadora', t: 'num' },
      { k: 'custo_por', l: 'Combustível por conta de', t: 'sel', o: ['CLIENTE', 'EMPRESA', 'LOCADORA'] },
      { k: 'status_combustivel', l: 'Regra de combustível', full: true, max: 200 },
      { g: 'Equipamentos', k: 'rastreador', l: 'Rastreador', max: 80 },
      { k: 'tag', l: 'TAG', t: 'bool' },
      { k: 'seguro', l: 'Seguro', t: 'bool' },
      { k: 'data_plotagem', l: 'Data da plotagem', t: 'date' },
      { g: 'Observações', k: 'obs', l: 'Observações', t: 'area', full: true, max: 1000 },
    ],
  },
  despesas: {
    nome: 'despesa',
    table: 'frota_despesas',
    module: 'operacao',
    fields: [
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'empresa', l: 'Empresa', suggest: 'empresa', max: 80 },
      { k: 'tipo', l: 'Tipo (nota, recibo…)', max: 60 },
      { k: 'placa', l: 'Placa', t: 'placa' },
      { k: 'prestador', l: 'Integrante / prestador', max: 120 },
      { k: 'cliente', l: 'Cliente', max: 120 },
      { k: 'servico', l: 'Serviço realizado', full: true, max: 300 },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
      { k: 'obs', l: 'Observações', t: 'area', full: true, max: 1000 },
    ],
  },
  multas: {
    nome: 'multa',
    table: 'frota_multas',
    module: 'operacao',
    fields: [
      { k: 'data_hora', l: 'Data e hora', t: 'dtm', req: true },
      { k: 'tipo', l: 'Tipo', t: 'sel', o: TIPOS_VEICULO },
      { k: 'ait', l: 'Nº do AIT', max: 40 },
      { k: 'placa', l: 'Placa', t: 'placa', req: true },
      { k: 'locadora', l: 'Locadora', suggest: 'fornecedor', max: 120 },
      { k: 'condutor', l: 'Condutor', max: 120 },
      { k: 'local', l: 'Local', full: true, max: 200 },
      { k: 'municipio', l: 'Município - UF', max: 80 },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
      { k: 'infracao', l: 'Infração', t: 'area', full: true, max: 500 },
    ],
  },
  revisoes: {
    nome: 'revisão',
    table: 'frota_revisoes',
    module: 'operacao',
    fields: [
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'placa', l: 'Placa', t: 'placa', req: true },
      { k: 'tipo', l: 'Tipo', t: 'sel', o: TIPOS_VEICULO },
      { k: 'servico', l: 'Serviço (revisão, troca…)', max: 120 },
      { k: 'ultima_rev', l: 'Última revisão (km)', t: 'num' },
      { k: 'prox_rev', l: 'Próxima revisão (km)', t: 'num' },
      { k: 'descricao', l: 'Descrição', full: true, max: 300 },
      { k: 'item1', l: 'Item 1', max: 120 },
      { k: 'valor1', l: 'Valor 1 (R$)', t: 'money' },
      { k: 'item2', l: 'Item 2', max: 120 },
      { k: 'valor2', l: 'Valor 2 (R$)', t: 'money' },
      { k: 'item3', l: 'Item 3', max: 120 },
      { k: 'valor3', l: 'Valor 3 (R$)', t: 'money' },
      { k: 'custo_total', l: 'Custo total (vazio = soma dos itens)', t: 'money' },
      { k: 'obs', l: 'Observações', t: 'area', full: true, max: 1000 },
    ],
  },
  lavagens: {
    nome: 'lavagem',
    table: 'frota_lavagens',
    module: 'operacao',
    fields: [
      { k: 'data', l: 'Data', t: 'date', req: true },
      { k: 'placa', l: 'Placa', t: 'placa', req: true },
      { k: 'posto', l: 'Posto', max: 120 },
      { k: 'vtr', l: 'VTR', t: 'sel', o: TIPOS_VEICULO },
      { k: 'valor', l: 'Valor (R$)', t: 'money', req: true },
    ],
  },
  km: {
    nome: 'quilometragem do mês',
    table: 'frota_km',
    module: 'veiculos',
    fields: [
      { k: 'mes', l: 'Mês', t: 'date', req: true },
      { k: 'km1', l: 'KM 1ª semana', t: 'num' },
      { k: 'km2', l: 'KM 2ª semana', t: 'num' },
      { k: 'km3', l: 'KM 3ª semana', t: 'num' },
      { k: 'km4', l: 'KM 4ª semana', t: 'num' },
      { k: 'km_total', l: 'KM total (vazio = soma das semanas)', t: 'num' },
      { k: 'comb_cartao', l: 'Combustível no cartão (R$)', t: 'money' },
      { k: 'posto_planilha', l: 'Posto', max: 120 },
      { k: 'supervisor', l: 'Supervisor', suggest: 'supervisor', max: 120 },
    ],
  },
};

/* ---------- utilidades (iguais no navegador e no servidor) ---------- */

export const normPlaca = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** placa antiga (ABC1234) ou Mercosul (ABC1D23) */
export const okPlaca = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s);

/** número no jeito brasileiro: "1.234,50", "31.500", "1234.5", "R$ 80" */
export function parseNum(raw: unknown): number | null | typeof NaN {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  let s = String(raw).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!s) return null;
  if (s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const ativo = (v: Pick<Veiculo, 'situacao'>) => v.situacao !== 'Devolvido';

export const TZ = 'America/Bahia';
export const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
/** dias até a data (negativo = já passou) */
export const daysTo = (s: string | null | undefined): number | null =>
  s ? Math.round((Date.parse(String(s).slice(0, 10)) - Date.parse(todayISO())) / 864e5) : null;

/** posto em uma linha: "#12 · Hospital Central" */
export const postoLabel = (p: Pick<FrotaPosto, 'code' | 'name'> | null | undefined) =>
  !p ? 'Sem posto' : p.code ? `#${p.code} · ${p.name}` : p.name;

/** revisões vencidas ou próximas (faltando até 1.500 km), da mais urgente para a menos */
export function revisaoAlerts(veiculos: Veiculo[], revisoes: Revisao[]): { v: Veiculo; r: Revisao; falta: number }[] {
  const last = new Map<string, Revisao>();
  for (const r of revisoes) {
    if (!r.placa || !r.prox_rev) continue;
    const o = last.get(r.placa);
    if (!o || (r.data || '') > (o.data || '')) last.set(r.placa, r);
  }
  const byPlaca = new Map(veiculos.map((v) => [v.placa, v]));
  const out: { v: Veiculo; r: Revisao; falta: number }[] = [];
  last.forEach((r, p) => {
    const v = byPlaca.get(p);
    if (!v || !ativo(v) || v.km_atual == null || r.prox_rev == null) return;
    const falta = r.prox_rev - v.km_atual;
    if (falta <= 1500) out.push({ v, r, falta });
  });
  return out.sort((a, b) => a.falta - b.falta);
}

/** devoluções previstas para os próximos `dias` (ou já vencidas) */
export function devolucaoAlerts(veiculos: Veiculo[], dias = 60): { v: Veiculo; d: number }[] {
  return veiculos
    .filter((v) => ativo(v) && v.devolucao_prevista)
    .map((v) => ({ v, d: daysTo(v.devolucao_prevista)! }))
    .filter((x) => x.d <= dias)
    .sort((a, b) => a.d - b.d);
}

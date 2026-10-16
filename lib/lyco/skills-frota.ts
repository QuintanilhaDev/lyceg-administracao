/**
 * Frota: o Lyco consulta e altera a frota pelo que a pessoa falar ou digitar.
 *
 * Consultas (na hora): quantos veículos, onde está uma placa, o que tem num posto, revisões e
 * devoluções próximas, gastos (multas, despesas, lavagens) por período e por placa, KM rodado,
 * veículos sem posto. Alterações (sempre com "sim" antes de gravar): alocar uma placa num posto,
 * mudar a situação, atualizar o KM, cadastrar placas e lançar multa, despesa, lavagem ou revisão.
 *
 * As placas são reconhecidas mesmo ditas em pedaços ("abc 1 d 23", "a b c um d dois três")
 * e com erro de voz (uma letra trocada, se só existir uma placa parecida).
 */
import { lycoEmit } from './bus';
import { V, asksHow } from './intent';
import { bestMatches, editDistance, listJoin, normalize, plural, tokenize, wordsToDigits, type Query } from './text';
import type { LycoHost, LycoReply, PendingAction, Skill } from './types';
import { SITUACOES, ativo, daysTo, devolucaoAlerts, postoLabel, revisaoAlerts, todayISO, type FrotaData, type FrotaPosto, type Situacao, type Veiculo } from '../frota/types';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** para a voz: "R$ 1.250,00" vira "1.250 reais" */
const reais = (n: number) => {
  const r = Math.round(n * 100) / 100;
  const int = Math.floor(r);
  const cents = Math.round((r - int) * 100);
  return `${fmt(int)} ${int === 1 ? 'real' : 'reais'}${cents ? ` e ${cents} centavos` : ''}`;
};
/** placa soletrada para a voz: "ABC1D23" → "A B C 1 D 2 3" */
const spell = (p: string) => p.split('').join(' ');

const data = (host: LycoHost): FrotaData | null => host.frota?.data() ?? null;
const inFrota = (host: LycoHost) => Boolean(host.frota) && host.sector?.slug === 'frota';
const notReady: LycoReply = { say: 'Ainda estou carregando os dados da frota. Tente de novo em um instante.' };
const noEdit = (what: string): LycoReply => ({ say: `Você não tem permissão para ${what}. Fale com o master do setor.` });
const confirm = (what: string, pending: PendingAction[]): LycoReply => ({ say: `Vou registrar: ${what}. Confirma?`, chips: ['Sim', 'Não'], pending });

/* ------------------------------------------------------------------ */
/* placas                                                              */
/* ------------------------------------------------------------------ */

const LETTER_WORDS: Record<string, string> = {
  a: 'a', be: 'b', b: 'b', ce: 'c', se: 'c', c: 'c', de: 'd', d: 'd', e: 'e', efe: 'f', f: 'f', ge: 'g', je: 'g', g: 'g', aga: 'h', aga_: 'h', h: 'h', i: 'i', jota: 'j', j: 'j',
  ca: 'k', ka: 'k', k: 'k', ele: 'l', l: 'l', eme: 'm', m: 'm', ene: 'n', n: 'n', o: 'o', pe: 'p', p: 'p', que: 'q', q: 'q', erre: 'r', r: 'r', esse: 's', s: 's', te: 't', t: 't',
  u: 'u', ve: 'v', v: 'v', dablio: 'w', w: 'w', xis: 'x', x: 'x', ipsilon: 'y', y: 'y', ze: 'z', z: 'z',
};
const PLATE_RE = /^[a-z]{3}\d[a-z0-9]\d{2}$/;

/** placas citadas na frase (inteiras, em pedaços ou soletradas) */
const DIGIT_WORDS: Record<string, string> = { zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', meia: '6', sete: '7', oito: '8', nove: '9' };

function platesInTokens(toks: string[], out: Set<string>) {
  for (let i = 0; i < toks.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(toks.length, i + 8); j++) {
      const t = toks[j];
      const piece = /^[a-z0-9]+$/.test(t) && (t.length > 1 || /\d/.test(t)) ? t : LETTER_WORDS[t] ?? (t.length === 1 ? t : null);
      if (!piece) break;
      acc += piece;
      if (acc.length > 7) break;
      if (acc.length === 7 && PLATE_RE.test(acc)) {
        out.add(acc.toUpperCase());
        break;
      }
    }
  }
}

/** placas citadas na frase (inteiras, em pedaços ou soletradas: "a b c um d dois três") */
export function platesIn(norm: string): string[] {
  const out = new Set<string>();
  // algarismo por algarismo ("dois três" = 2 3) e, se não achar, números por extenso somados ("vinte e três")
  platesInTokens(tokenize(norm).map((t) => DIGIT_WORDS[t] ?? t), out);
  if (!out.size) platesInTokens(tokenize(wordsToDigits(norm, true)), out);
  return [...out];
}

/** a placa citada, já casada com a frota (tolera uma letra errada se só houver uma parecida) */
function plateOf(norm: string, d: FrotaData): { v: Veiculo } | { unknown: string } | null {
  const ps = platesIn(norm);
  if (!ps.length) {
    // final da placa: "a de final 23", "placa final D23"
    const fin = norm.match(/\bfinal\s+([a-z0-9]{2,4})\b/);
    if (fin) {
      const m = d.veiculos.filter((v) => v.placa.toLowerCase().endsWith(fin[1]));
      if (m.length === 1) return { v: m[0] };
    }
    return null;
  }
  const p = ps[0];
  const exact = d.veiculos.find((v) => v.placa === p);
  if (exact) return { v: exact };
  const near = d.veiculos.filter((v) => editDistance(v.placa, p) === 1);
  if (near.length === 1) return { v: near[0] };
  return { unknown: p };
}

/** posto citado: "posto 12", "posto hospital aliança", "#12" */
function postoOf(norm: string, d: FrotaData): FrotaPosto | null {
  const t = wordsToDigits(norm, true);
  const code = t.match(/\b(?:posto|numero|n)\s*#?\s*(\d{1,5})\b/)?.[1] ?? t.match(/#\s*(\d{1,5})\b/)?.[1];
  if (code) {
    const byCode = d.postos.find((p) => p.code && normalize(p.code).replace(/^0+/, '') === code.replace(/^0+/, ''));
    if (byCode) return byCode;
    const byName = d.postos.find((p) => normalize(p.name).replace(/\b0+(\d)/g, '$1') === `posto ${code.replace(/^0+/, '')}`);
    if (byName) return byName;
  }
  const after = t.match(/\b(?:posto|para o|pro|para|no|na|ao)\s+(.+)$/)?.[1];
  const needle = (after ?? t).replace(/^(o |a )?posto\s+/, '');
  const hit = bestMatches(needle, d.postos, (p) => `${p.name} ${p.code ?? ''}`, 0.72, 2);
  return hit.length && (hit.length === 1 || hit[0].score - hit[1].score > 0.08) ? hit[0].item : null;
}

const SIT_WORDS: { re: RegExp; s: Situacao }[] = [
  { re: /\b(manutencao|oficina|conserto|consertando|quebrad\w+|revisando|mecanic\w+)\b/, s: 'Manutenção' },
  { re: /\b(em rota|rodando|na rua|viagem|viajando|transito)\b/, s: 'Em rota' },
  { re: /\b(parad\w+|encostad\w+|sem uso|inativ\w+)\b/, s: 'Parado' },
  { re: /\b(em devolucao|devolvendo|sendo devolvid\w+)\b/, s: 'Em devolução' },
  { re: /\b(devolvid\w+|entregue a locadora|devolveu|foi devolvid\w+)\b/, s: 'Devolvido' },
  { re: /\b(operando|operacao|operacional|funcionando|ativo|liberad\w+|volt\w+ (a|pra|para) (operar|rodar|ativa|operacao))\b/, s: 'Operando' },
];
const sitIn = (norm: string): Situacao | null => SIT_WORDS.find((x) => x.re.test(norm))?.s ?? null;

/* ------------------------------------------------------------------ */
/* períodos (gastos)                                                   */
/* ------------------------------------------------------------------ */

function periodIn(norm: string): { from: string; to: string; label: string } | null {
  const today = todayISO();
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = (yy: number, mm: number) => `${yy}-${pad(mm)}-01`;
  if (/\b(este|esse|neste|nesse|do|deste|desse) mes\b|\bmes atual\b|\bno mes\b/.test(norm)) return { from: monthStart(y, m), to: today, label: 'este mês' };
  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(norm)) {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: monthStart(py, pm), to: monthStart(y, m), label: 'no mês passado' };
  }
  if (/\b(este|esse|neste|nesse|do) ano\b/.test(norm)) return { from: `${y}-01-01`, to: today, label: 'este ano' };
  if (/\b(hoje)\b/.test(norm)) return { from: today, to: today, label: 'hoje' };
  if (/\b(semana|7 dias|sete dias)\b/.test(norm)) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7);
    return { from: d.toISOString().slice(0, 10), to: today, label: 'nos últimos 7 dias' };
  }
  return null;
}
const inPeriod = (iso: string | null | undefined, p: { from: string; to: string; label: string } | null) => {
  if (!p) return true;
  const d = String(iso ?? '').slice(0, 10);
  return p.from === p.to ? d === p.from : d >= p.from && (p.to.length === 10 && p.label !== 'no mês passado' ? d <= p.to : d < p.to);
};

const KIND_RE = {
  multas: /\bmult\w*|infrac\w+|\bait\b/,
  despesas: /\bdespes\w+|\bgast\w+ (com|em) (manutenc|oficina|pec)|\bcusto\w* (com|de) manutenc/,
  lavagens: /\blav\w+/,
  revisoes: /\brevis\w+/,
};
type OpKind = keyof typeof KIND_RE;
const kindIn = (norm: string): OpKind | null => (Object.keys(KIND_RE) as OpKind[]).find((k) => KIND_RE[k].test(norm)) ?? null;
const KIND_LABEL: Record<OpKind, [string, string]> = { multas: ['multa', 'multas'], despesas: ['despesa', 'despesas'], lavagens: ['lavagem', 'lavagens'], revisoes: ['revisão', 'revisões'] };

/** valor em reais citado ("195 reais", "R$ 1.250,50", "cento e noventa e cinco reais") */
function moneyIn(raw: string, norm: string): number | null {
  const m = raw.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i) ?? raw.match(/\b([\d.]+(?:,\d{1,2})?)\s*(?:reais|real|conto)\b/i);
  if (m) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  const t = wordsToDigits(norm, true);
  const w = t.match(/\b(\d{1,7})(?:\s+e\s+(\d{1,2})\s+centavos?)?\s+(?:reais|real|conto)\b/) ?? t.match(/\b(?:valor|de|custou|custo|por)\s+(\d{1,7})(?:\s*(?:,|e)\s*(\d{1,2}))?\b/);
  if (w) return Number(w[1]) + (w[2] ? Number(w[2]) / 100 : 0);
  return null;
}

/* ------------------------------------------------------------------ */
/* habilidades                                                         */
/* ------------------------------------------------------------------ */

const frotaSkill = (s: Omit<Skill, 'sector' | 'scopes'>): Skill => ({ ...s, scopes: ['sector'], sector: 'frota' });

const count = frotaSkill({
  id: 'frota-count',
  examples: ['Lyco, quantos veículos temos?', 'Lyco, quantas motos estão em manutenção?', 'Lyco, resumo da frota'],
  match: (q, host) => {
    if (!inFrota(host)) return 0;
    if (/\b(resumo|situacao|status|panorama|como esta|como estao|como vai) (a |da |de |geral da )?frota\b/.test(q.norm)) return 0.95;
    if (/\b(quant\w+|numero de|total de|tamanho da)\b/.test(q.norm) && /\b(veicul\w+|carros?|motos?|viaturas?|vtrs?|frota|placas?)\b/.test(q.norm) && !kindIn(q.norm) && !/\b(km|quilomet\w+|rod\w+)\b/.test(q.norm) && !/\bposto \w+/.test(q.norm)) return 0.93;
    return 0;
  },
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const at = d.veiculos.filter(ativo);
    const tipo = /\bmotos?\b/.test(q.norm) ? 'MOTO' : /\bcarros?\b/.test(q.norm) ? 'CARRO' : null;
    const sit = sitIn(q.norm);
    const base = (tipo ? at.filter((v) => v.tipo === tipo) : at).filter((v) => !sit || v.situacao === sit);
    const what = tipo === 'MOTO' ? ['moto', 'motos'] : tipo === 'CARRO' ? ['carro', 'carros'] : ['veículo', 'veículos'];
    if (sit || tipo) {
      if (sit) lycoEmit('frota:veiculos', { situacao: sit, tipo: tipo ?? undefined });
      return {
        say: `${base.length ? `Temos ${plural(base.length, what[0], what[1])}` : `Nenhum ${what[0]}`}${sit ? ` ${sit === 'Manutenção' ? 'em manutenção' : `com a situação ${sit.toLowerCase()}`}` : ' ativos'}.${base.length && base.length <= 6 ? ` São: ${listJoin(base.map((v) => spell(v.placa)))}.` : ''}`,
        text: `${base.length ? `${plural(base.length, what[0], what[1])}` : `Nenhum ${what[0]}`}${sit ? ` · ${sit}` : ' ativos'}${base.length && base.length <= 12 ? `: ${base.map((v) => v.placa).join(', ')}` : ''}.`,
        act: sit ? () => host.goTab('veiculos') : undefined,
      };
    }
    const by = (s: Situacao) => at.filter((v) => v.situacao === s).length;
    const alloc = at.filter((v) => v.posto_id).length;
    const nCar = at.filter((v) => v.tipo === 'CARRO').length;
    const nMoto = at.filter((v) => v.tipo === 'MOTO').length;
    const semTipo = at.length - nCar - nMoto;
    const kinds = nCar + nMoto ? `: ${listJoin([nCar ? plural(nCar, 'carro', 'carros') : '', nMoto ? plural(nMoto, 'moto', 'motos') : '', semTipo ? `${fmt(semTipo)} sem tipo definido` : ''].filter(Boolean))}` : '';
    return {
      say: `A frota tem ${plural(at.length, 'veículo ativo', 'veículos ativos')}${kinds}. ${alloc === 1 ? '1 está alocado' : `${fmt(alloc)} estão alocados`} em postos${by('Manutenção') ? ` e ${fmt(by('Manutenção'))} em manutenção` : ''}.`,
      card: {
        kind: 'stats',
        title: 'Frota',
        stats: [
          { label: 'Ativos', value: fmt(at.length) },
          { label: 'Alocados', value: fmt(alloc), tone: 'in' },
          { label: 'Sem posto', value: fmt(at.length - alloc), tone: at.length - alloc ? 'warn' : 'plain' },
          { label: 'Manutenção', value: fmt(by('Manutenção')), tone: by('Manutenção') ? 'warn' : 'plain' },
          { label: 'Em rota', value: fmt(by('Em rota')) },
          { label: 'Parados', value: fmt(by('Parado')), tone: by('Parado') ? 'out' : 'plain' },
        ],
      },
      chips: ['Lyco, quais revisões estão vencendo?', 'Lyco, quais veículos estão sem posto?'],
    };
  },
});

const where = frotaSkill({
  id: 'frota-where',
  examples: ['Lyco, onde está a placa ABC1D23?', 'Lyco, abrir a ficha da ABC1D23'],
  match: (q, host) => {
    if (!inFrota(host) || !platesIn(q.norm).length && !/\bfinal\s+[a-z0-9]{2,4}\b/.test(q.norm)) return 0;
    if (wantsAlloc(q) || (V.status.test(q.norm) && sitIn(q.norm)) || kmUpdate(q) || /\b(cadastr\w+|nov[oa] (veiculo|placa)|registr\w+|lanc\w+)\b/.test(q.norm)) return 0;
    if (kindIn(q.norm) && /\b(quant\w+|valor|total|gast\w+)\b/.test(q.norm)) return 0;
    return 0.93;
  },
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const f = plateOf(q.norm, d);
    if (!f) return { say: 'Qual placa? Pode dizer letra por letra, por exemplo: A B C um D dois três.' };
    if ('unknown' in f) return { say: `Não encontrei a placa ${spell(f.unknown)} na frota.`, text: `Não encontrei a placa ${f.unknown} na frota.`, chips: ['Lyco, cadastrar a placa ' + f.unknown] };
    const v = f.v;
    const p = v.posto_id ? d.postos.find((x) => x.id === v.posto_id) : null;
    const tab = /\b(contrato|locac\w+|devoluc\w+)\b/.test(q.norm) ? 'contrato' : /\b(km|quilomet\w+)\b/.test(q.norm) ? 'km' : kindIn(q.norm) ?? 'resumo';
    return {
      say: `A ${spell(v.placa)}${v.modelo ? `, ${v.modelo},` : ''} está ${p ? `no ${postoLabel(p).replace('#', 'posto ')}` : 'sem posto'} e a situação é ${v.situacao.toLowerCase()}. Abri a ficha dela.`,
      text: `${v.placa}${v.modelo ? ` · ${v.modelo}` : ''} — ${p ? postoLabel(p) : 'sem posto'} · ${v.situacao}`,
      act: () => lycoEmit('frota:ficha', { id: v.id, tab: tab as 'resumo' }),
    };
  },
});

const postoVehicles = frotaSkill({
  id: 'frota-posto',
  examples: ['Lyco, quais veículos estão no posto 10?', 'Lyco, mostrar o posto Hospital Aliança no mapa'],
  match: (q, host) => {
    const d = data(host);
    if (!inFrota(host) || !d || wantsAlloc(q) || platesIn(q.norm).length) return 0;
    if (!/\bpostos?\b/.test(q.norm) && !/\bmapa\b/.test(q.norm)) return 0;
    if (V.create.test(q.norm) && !/\bmostr/.test(q.norm)) return 0;
    return postoOf(q.norm, d) ? 0.92 : 0;
  },
  run: (q, host) => {
    const d = data(host)!;
    const p = postoOf(q.norm, d)!;
    const vs = d.veiculos.filter((v) => ativo(v) && v.posto_id === p.id);
    const onMap = p.lat !== null && p.lng !== null;
    return {
      say: `O ${postoLabel(p).replace('#', 'posto ')} tem ${plural(vs.length, 'veículo', 'veículos')}${vs.length && vs.length <= 5 ? `: ${listJoin(vs.map((v) => spell(v.placa)))}` : ''}.${onMap ? ' Mostrei no mapa.' : ' Ele ainda não tem localização no mapa.'}`,
      text: `${postoLabel(p)}: ${vs.length ? vs.map((v) => v.placa).join(', ') : 'nenhum veículo'}.`,
      act: () => {
        if (onMap) {
          host.goTab('mapa');
          lycoEmit('frota:mapa', { postoId: p.id });
        }
      },
    };
  },
});

const semPosto = frotaSkill({
  id: 'frota-sem-posto',
  examples: ['Lyco, quais veículos estão sem posto?'],
  match: (q, host) => (inFrota(host) && /\bsem posto\b|\bnao (estao|esta) alocad\w+|\bdisponive\w+ para alocar\b|\bsem alocac\w+/.test(q.norm) ? 0.94 : 0),
  run: (_q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const l = d.veiculos.filter((v) => ativo(v) && !v.posto_id);
    return {
      say: l.length ? `${plural(l.length, 'veículo está', 'veículos estão')} sem posto${l.length <= 6 ? `: ${listJoin(l.map((v) => spell(v.placa)))}` : ''}. Abri a lista filtrada.` : 'Todos os veículos ativos estão alocados em algum posto.',
      text: l.length ? `Sem posto: ${l.map((v) => v.placa).join(', ')}.` : undefined,
      act: l.length
        ? () => {
            host.goTab('veiculos');
            lycoEmit('frota:veiculos', { posto: 'none' });
          }
        : undefined,
    };
  },
});

const revisoes = frotaSkill({
  id: 'frota-revisoes',
  examples: ['Lyco, quais revisões estão vencendo?', 'Lyco, tem carro precisando de revisão?'],
  match: (q, host) => (inFrota(host) && /\brevis\w+/.test(q.norm) && !/\b(registr\w+|lanc\w+|cadastr\w+|nova)\b/.test(q.norm) && !platesIn(q.norm).length && !/\b(quanto|valor|gast\w+|custo)\b/.test(q.norm) ? 0.93 : 0),
  run: (_q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const l = revisaoAlerts(d.veiculos, d.revisoes);
    if (!l.length) return { say: 'Nenhuma revisão vencida ou próxima. Tudo em dia.' };
    const late = l.filter((x) => x.falta <= 0).length;
    return {
      say: `${plural(l.length, 'veículo precisa', 'veículos precisam')} de revisão${late ? `, ${fmt(late)} já vencida${late > 1 ? 's' : ''}` : ''}. O mais urgente é a ${spell(l[0].v.placa)}, ${l[0].falta <= 0 ? 'com a revisão vencida' : `faltando ${fmt(l[0].falta)} quilômetros`}.`,
      card: { kind: 'list', title: 'Revisões', rows: l.slice(0, 8).map((x) => ({ label: x.v.placa, sub: x.v.modelo ?? undefined, value: x.falta <= 0 ? 'vencida' : `faltam ${fmt(x.falta)} km` })) },
      act: () => host.goTab('painel'),
    };
  },
});

const devolucoes = frotaSkill({
  id: 'frota-devolucoes',
  examples: ['Lyco, quais devoluções estão próximas?', 'Lyco, que contratos vencem este mês?'],
  match: (q, host) => (inFrota(host) && (/\bdevoluc\w+|\bdevolver\b|\bdevolvidos? em breve\b/.test(q.norm) || /\bcontrat\w+ (venc\w+|termin\w+|acab\w+)|\b(venc\w+|termin\w+|acab\w+) (o |os )?contrat\w+/.test(q.norm)) && (V.ask.test(q.norm) || /\b(proxim\w+|em breve|vencendo|vencid\w+|lista|mostr\w+|previst\w+|venc\w+)\b/.test(q.norm)) && !platesIn(q.norm).length ? 0.92 : 0),
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const dias = /\b(este|esse) mes\b/.test(q.norm) ? 31 : /\bsemana\b/.test(q.norm) ? 7 : 60;
    const l = devolucaoAlerts(d.veiculos, dias);
    if (!l.length) return { say: `Nenhuma devolução prevista nos próximos ${dias} dias.` };
    return {
      say: `${plural(l.length, 'devolução prevista', 'devoluções previstas')} até ${dias} dias. A primeira é a ${spell(l[0].v.placa)}, ${l[0].d < 0 ? `vencida há ${fmt(-l[0].d)} dias` : l[0].d === 0 ? 'hoje' : `em ${fmt(l[0].d)} dias`}.`,
      card: { kind: 'list', title: 'Devoluções previstas', rows: l.slice(0, 8).map((x) => ({ label: x.v.placa, sub: x.v.fornecedor ?? x.v.modelo ?? undefined, value: x.d < 0 ? `há ${-x.d} d` : `em ${x.d} d` })) },
      act: () => host.goTab('painel'),
    };
  },
});

const gastos = frotaSkill({
  id: 'frota-gastos',
  examples: ['Lyco, quanto gastamos com multas este mês?', 'Lyco, total de despesas da ABC1D23', 'Lyco, quantas lavagens no mês passado?'],
  match: (q, host) => {
    if (!inFrota(host)) return 0;
    const k = kindIn(q.norm);
    if (!k) return 0;
    if (/\b(registr\w+|lanc\w+|cadastr\w+|anot\w+|adicion\w+|inclu\w+)\b/.test(q.norm) && !V.ask.test(q.norm)) return 0;
    if (k === 'revisoes' && !/\b(quanto|valor|total|soma|gast\w+|custo\w*|custou)\b/.test(q.norm)) return 0;
    if (/\b(quant\w+|total|soma|valor|gast\w+|custo\w*|custou|mostr\w+|ver|list\w+|quais)\b/.test(q.norm)) return 0.94;
    return 0;
  },
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const k = kindIn(q.norm)!;
    const per = periodIn(q.norm);
    const pf = plateOf(q.norm, d);
    const placa = pf && 'v' in pf ? pf.v.placa : null;
    const rows = (d[k] as { placa: string | null; valor?: number; custo_total?: number | null; data?: string; data_hora?: string }[]).filter(
      (r) => (!placa || r.placa === placa) && inPeriod(r.data ?? r.data_hora, per),
    );
    const tot = rows.reduce((t, r) => t + (Number(k === 'revisoes' ? r.custo_total : r.valor) || 0), 0);
    const [one, many] = KIND_LABEL[k];
    const where = `${placa ? ` da ${spell(placa)}` : ''}${per ? ` ${per.label}` : ''}`;
    return {
      say: rows.length ? `${plural(rows.length, one, many)}${where}, somando ${reais(tot)}.` : `Nenhuma ${one}${where}.`,
      text: rows.length ? `${plural(rows.length, one, many)}${placa ? ` · ${placa}` : ''}${per ? ` · ${per.label}` : ''}: ${brl(tot)}` : undefined,
      act: () => {
        host.goTab('operacao');
        lycoEmit('frota:operacao', { tipo: k, query: placa ?? '', mes: per && per.label !== 'este ano' && per.label !== 'nos últimos 7 dias' && per.label !== 'hoje' ? per.from.slice(0, 7) : '' });
      },
    };
  },
});

const kmQuery = frotaSkill({
  id: 'frota-km',
  examples: ['Lyco, quantos km a ABC1D23 rodou este mês?', 'Lyco, qual o km atual da ABC1D23?'],
  match: (q, host) => (inFrota(host) && /\b(km|quilomet\w+|rod(ou|aram|ado)|odometro)\b/.test(q.norm) && platesIn(q.norm).length && (V.ask.test(q.norm) || /\b(quant\w+|qual|mostr\w+)\b/.test(q.norm)) && !kmUpdate(q) ? 0.95 : 0),
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const f = plateOf(q.norm, d);
    if (!f || 'unknown' in f) return { say: 'Não encontrei essa placa na frota.' };
    const v = f.v;
    const months = d.km.filter((k) => k.veiculo_id === v.id).sort((a, b) => b.mes.localeCompare(a.mes));
    const per = periodIn(q.norm);
    const pick = per ? months.find((k) => k.mes.slice(0, 7) === per.from.slice(0, 7)) : months[0];
    const parts = [`O KM atual da ${spell(v.placa)} é ${v.km_atual != null ? fmt(v.km_atual) : 'desconhecido'}`];
    if (pick?.km_total != null) parts.push(`em ${pick.mes.slice(5, 7)}/${pick.mes.slice(0, 4)} rodou ${fmt(pick.km_total)} quilômetros`);
    return { say: parts.join(' e ') + '.', act: () => lycoEmit('frota:ficha', { id: v.id, tab: 'km' }) };
  },
});

/* ---------------- alterações ---------------- */

function wantsAlloc(q: Query): boolean {
  return /\b(aloc\w+|mov\w+|transfer\w+|mand\w+|envi\w+|coloc\w+|bot\w+|pass\w+|lev\w+|realoc\w+)\b/.test(q.norm) && /\b(posto|para o|pro|pra|no|ao)\b/.test(q.norm) && !kindIn(q.norm) && !V.ask.test(q.norm) && !sitIn(q.norm.replace(/\bposto\b.*$/, ''));
}
function kmUpdate(q: Query): boolean {
  return /\b(km|quilomet\w+|odometro)\b/.test(q.norm) && /\b(atualiz\w+|mud\w+|ajust\w+|corrig\w+|(e|eh|esta|esta com|marca|marcando|agora|ficou|passou|para|pra) \d)/.test(wordsToDigits(q.norm, true)) && !V.ask.test(q.norm);
}

const alloc = frotaSkill({
  id: 'frota-alocar',
  examples: ['Lyco, alocar a ABC1D23 no posto 10', 'Lyco, mover a XYZ9A87 para o Hospital Aliança', 'Lyco, tirar a ABC1D23 do posto'],
  match: (q, host) => {
    if (!inFrota(host) || !platesIn(q.norm).length) return 0;
    if (/\b(tir\w+|remov\w+|desaloc\w+) .*\bdo posto\b|\bsem posto\b/.test(q.norm) && !V.ask.test(q.norm)) return 0.96;
    return wantsAlloc(q) ? 0.96 : 0;
  },
  run: (q, host) => {
    if (!host.can('alocacao', 'edit') && !host.can('veiculos', 'edit')) return noEdit('alocar veículos');
    const d = data(host);
    if (!d) return notReady;
    const f = plateOf(q.norm, d);
    if (!f) return { say: 'Qual placa?' };
    if ('unknown' in f) return { say: `Não encontrei a placa ${spell(f.unknown)} na frota.`, text: `Não encontrei a placa ${f.unknown}.` };
    const v = f.v;
    const out = /\b(tir\w+|remov\w+|desaloc\w+)\b.*\bdo posto\b|\bsem posto\b/.test(q.norm);
    const rest = q.norm.replace(/\b[a-z]{3}\s?\d\s?[a-z0-9]\s?\d\s?\d\b/, ' ');
    const p = out ? null : postoOf(rest, d);
    if (!out && !p) return { say: `Para qual posto vai a ${spell(v.placa)}?`, followUp: `${q.norm} para o posto {x}`, chips: d.postos.slice(0, 4).map((x) => `${postoLabel(x)}`) };
    if ((v.posto_id ?? null) === (p?.id ?? null)) return { say: `A ${spell(v.placa)} já está ${p ? `no ${postoLabel(p)}` : 'sem posto'}.` };
    const what = `${v.placa} ${p ? `alocada no ${postoLabel(p)}` : 'fica sem posto'}`;
    return confirm(what, [{ method: 'POST', path: '/api/frota/veiculos/alocar', body: { ids: [v.id], posto_id: p?.id ?? null }, what }]);
  },
});

const situacao = frotaSkill({
  id: 'frota-situacao',
  examples: ['Lyco, colocar a ABC1D23 em manutenção', 'Lyco, a XYZ9A87 voltou a operar', 'Lyco, marcar a ABC1D23 como devolvida'],
  match: (q, host) => {
    if (!inFrota(host) || !platesIn(q.norm).length || !sitIn(q.norm) || V.ask.test(q.norm)) return 0;
    return /\b(coloc\w+|marc\w+|mud\w+|pass\w+|deix\w+|est(a|ao)|ficou|entrou|foi|voltou|volt\w+|ta|agora|defin\w+|bot\w+|pon(ha|ho))\b/.test(q.norm) ? 0.95 : 0.8;
  },
  run: (q, host) => {
    if (!host.can('veiculos', 'edit')) return noEdit('mudar a situação dos veículos');
    const d = data(host);
    if (!d) return notReady;
    const f = plateOf(q.norm, d);
    if (!f || 'unknown' in f) return { say: 'Não encontrei essa placa na frota.' };
    const s = sitIn(q.norm)!;
    if (f.v.situacao === s) return { say: `A ${spell(f.v.placa)} já está como ${s.toLowerCase()}.` };
    const what = `${f.v.placa}: situação ${f.v.situacao} → ${s}`;
    return confirm(what, [{ method: 'PATCH', path: `/api/frota/veiculos/${f.v.id}`, body: { situacao: s }, what }]);
  },
});

const kmSet = frotaSkill({
  id: 'frota-km-atual',
  examples: ['Lyco, o km da ABC1D23 é 42.500', 'Lyco, atualizar a quilometragem da ABC1D23 para 43 mil'],
  match: (q, host) => (inFrota(host) && platesIn(q.norm).length && kmUpdate(q) ? 0.96 : 0),
  run: (q, host) => {
    if (!host.can('veiculos', 'edit')) return noEdit('atualizar a quilometragem');
    const d = data(host);
    if (!d) return notReady;
    const f = plateOf(q.norm, d);
    if (!f || 'unknown' in f) return { say: 'Não encontrei essa placa na frota.' };
    const t = wordsToDigits(q.norm.replace(/\b[a-z]{3}\s?\d\s?[a-z0-9]\s?\d\s?\d\b/, ' ').replace(/(\d)\s+mil\b/g, '$1000'), true);
    const n = (t.match(/\b(\d{2,7})\b/g) ?? []).map(Number).filter((x) => x >= 10).pop();
    if (n === undefined) return { say: `Qual é o KM atual da ${spell(f.v.placa)}?`, followUp: `o km da ${f.v.placa} e {x}` };
    if (f.v.km_atual != null && n < f.v.km_atual - 5000) return { say: `O KM informado, ${fmt(n)}, é bem menor que o registrado, ${fmt(f.v.km_atual)}. Confira o número e me diga de novo.` };
    const what = `KM atual da ${f.v.placa}: ${f.v.km_atual != null ? `${fmt(f.v.km_atual)} → ` : ''}${fmt(n)}`;
    return confirm(what, [{ method: 'PATCH', path: `/api/frota/veiculos/${f.v.id}`, body: { km_atual: n }, what }]);
  },
});

const newVehicle = frotaSkill({
  id: 'frota-novo-veiculo',
  examples: ['Lyco, cadastrar a placa ABC1D23', 'Lyco, novo veículo'],
  match: (q, host) => {
    if (!inFrota(host) || V.ask.test(q.norm) || asksHow(q.norm)) return 0;
    if (/\b(cadastr\w+|adicion\w+|inclu\w+|registr\w+|nov[oa]s?|cri\w+)\b/.test(q.norm) && /\b(veicul\w+|placas?|carros?|motos?|viaturas?|vtr)\b/.test(q.norm) && !kindIn(q.norm)) return 0.95;
    return 0;
  },
  run: (q, host) => {
    if (!host.can('veiculos', 'edit')) return noEdit('cadastrar veículos');
    const d = data(host);
    if (!d) return notReady;
    const ps = platesIn(q.norm);
    if (!ps.length) {
      return { say: 'Abrindo o cadastro de veículo. Pode digitar ou colar várias placas de uma vez.', act: () => { host.goTab('veiculos'); lycoEmit('frota:novo-veiculo', {}); } };
    }
    const fresh = ps.filter((p) => !d.veiculos.some((v) => v.placa === p));
    if (!fresh.length) return { say: ps.length === 1 ? `A ${spell(ps[0])} já está cadastrada.` : 'Essas placas já estão cadastradas.' };
    const what = `cadastro ${fresh.length === 1 ? 'da placa' : 'das placas'} ${fresh.join(', ')}`;
    const pending: PendingAction[] = [{ method: 'POST', path: '/api/frota/veiculos', body: { placas: fresh.join(' ') }, what }];
    return { ...confirm(what, pending), say: `Vou cadastrar ${fresh.length === 1 ? `a placa ${spell(fresh[0])}` : `${fresh.length} placas`}. Confirma?`, text: `Vou registrar: ${what}. Confirma?` };
  },
});

const registrar = frotaSkill({
  id: 'frota-registrar',
  examples: ['Lyco, lançar multa de 195 reais para a ABC1D23', 'Lyco, registrar lavagem de 60 reais da XYZ9A87', 'Lyco, despesa de 300 reais na ABC1D23, troca de óleo'],
  match: (q, host) => {
    if (!inFrota(host) || V.ask.test(q.norm) || asksHow(q.norm)) return 0;
    const k = kindIn(q.norm);
    if (!k) return 0;
    if (/\b(lanc\w+|registr\w+|anot\w+|cadastr\w+|adicion\w+|inclu\w+|nova|novo|tomou|levou|recebeu|fez|teve|pag\w+)\b/.test(q.norm)) return 0.95;
    return 0;
  },
  run: (q, host, mem) => {
    if (!host.can('operacao', 'edit')) return noEdit('lançar registros da operação');
    const d = data(host);
    if (!d) return notReady;
    const k = kindIn(q.norm)!;
    const f = plateOf(q.norm, d);
    const placa = f && 'v' in f ? f.v.placa : f && 'unknown' in f ? f.unknown : null;
    const raw = mem?.heard ?? q.raw;
    const valor = moneyIn(raw, q.norm);
    const [one] = KIND_LABEL[k];
    // sem placa ou sem valor: abre o formulário já preenchido com o que foi dito
    if (!placa || (valor === null && k !== 'revisoes')) {
      const prefill: Record<string, string> = {};
      if (placa) prefill.placa = placa;
      if (valor !== null) prefill.valor = String(valor).replace('.', ',');
      if (!placa && valor !== null) return { say: `De qual placa é a ${one}?`, followUp: `${q.norm} da placa {x}` };
      if (placa && valor === null) return { say: `Qual o valor da ${one} da ${spell(placa)}?`, followUp: `${q.norm} de {x} reais` };
      return { say: `Abrindo o lançamento de ${one}.`, act: () => { host.goTab('operacao'); lycoEmit('frota:operacao', { tipo: k, novo: true, prefill }); } };
    }
    const today = todayISO();
    const servico = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1).replace(/^\s*(servi[cç]o|referente a|por causa de)\s*/i, '').trim() : (raw.match(/\b(?:servi[cç]o|referente a|por causa de)\s+(.+)$/i)?.[1] ?? '').trim();
    const body: Record<string, unknown> =
      k === 'multas'
        ? { placa, valor, data_hora: `${today}T${new Date().toLocaleTimeString('sv-SE', { timeZone: 'America/Bahia' }).slice(0, 5)}`, infracao: /\binfrac|excesso|avanc|estacion/i.test(raw) ? raw.replace(/^.*?(?=excesso|avan|estacion|infra)/i, '').slice(0, 300) : null }
        : k === 'lavagens'
          ? { placa, valor, data: today, vtr: f && 'v' in f ? f.v.tipo : null }
          : k === 'revisoes'
            ? { placa, data: today, custo_total: valor, servico: 'Revisão' }
            : { placa, valor, data: today, servico: servico && servico.length > 3 && !/\d/.test(servico) ? servico.slice(0, 200) : null };
    const what = `${one} da ${placa}${valor !== null ? ` de ${brl(valor)}` : ''} em ${today.split('-').reverse().join('/')}`;
    return confirm(what, [{ method: 'POST', path: `/api/frota/registros/${k}`, body, what }]);
  },
});

const mapOpen = frotaSkill({
  id: 'frota-mapa',
  examples: ['Lyco, abrir o mapa da frota'],
  match: (q, host) => (inFrota(host) && /\bmapa\b/.test(q.norm) && !/\bposto \w/.test(q.norm) && (V.open.test(q.norm) || q.tokens.length <= 3) ? 0.9 : 0),
  run: (_q, host) => (host.tab === 'mapa' ? { say: 'O mapa já está aberto. Arraste para girar e toque num farol para ver o posto.' } : { say: 'Abrindo o mapa 3D da frota.', act: () => host.goTab('mapa') }),
});

const filterList = frotaSkill({
  id: 'frota-filtrar',
  examples: ['Lyco, mostrar os veículos em manutenção', 'Lyco, filtrar as motos', 'Lyco, mostrar os veículos da Localiza'],
  match: (q, host) => {
    if (!inFrota(host) || platesIn(q.norm).length || V.ask.test(q.norm)) return 0;
    if (!/\b(mostr\w+|filtr\w+|list\w+|ver|exib\w+|so|somente|apenas)\b/.test(q.norm)) return 0;
    if (!/\b(veicul\w+|carros?|motos?|viaturas?|placas?|frota)\b/.test(q.norm)) return 0;
    return sitIn(q.norm) || /\b(motos?|carros?|devolvid\w+)\b/.test(q.norm) || fornecedorIn(q.norm, data(host)) ? 0.93 : 0;
  },
  run: (q, host) => {
    const d = data(host);
    if (!d) return notReady;
    const sit = sitIn(q.norm);
    const tipo = /\bmotos?\b/.test(q.norm) ? 'MOTO' : /\bcarros?\b/.test(q.norm) ? 'CARRO' : undefined;
    const forn = fornecedorIn(q.norm, d);
    return {
      say: `Mostrando ${tipo === 'MOTO' ? 'as motos' : tipo === 'CARRO' ? 'os carros' : 'os veículos'}${sit ? ` com a situação ${sit.toLowerCase()}` : ''}${forn ? ` da ${forn}` : ''}.`,
      act: () => {
        host.goTab('veiculos');
        lycoEmit('frota:veiculos', { situacao: sit ?? undefined, tipo, query: forn ?? undefined, dev: sit === 'Devolvido' });
      },
    };
  },
});
function fornecedorIn(norm: string, d: FrotaData | null): string | null {
  if (!d) return null;
  const list = [...new Set(d.veiculos.map((v) => v.fornecedor).filter((x): x is string => Boolean(x)))];
  return list.find((f) => new RegExp(`\\b${normalize(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm)) ?? null;
}

export const frotaSkills: Skill[] = [count, where, postoVehicles, semPosto, revisoes, devolucoes, gastos, kmQuery, alloc, situacao, kmSet, newVehicle, registrar, mapOpen, filterList];
export { SITUACOES, daysTo };

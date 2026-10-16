/**
 * Variantes: o jeito como as pessoas realmente escrevem e falam ("vc", "qto", "cadê",
 * "viatura", "tá", "pra", erros comuns de digitação) vira a forma que as habilidades conhecem.
 * O motor lê a frase das duas formas (como veio e canonizada) e fica com a de maior certeza,
 * então nada que já funcionava deixa de funcionar.
 */

/** palavra (já normalizada, sem acento) → forma canônica */
const WORDS: Record<string, string> = {
  // abreviações de chat
  vc: 'voce', vcs: 'voces', voce: 'voce', ce: 'voce', oce: 'voce',
  pq: 'porque', pqe: 'porque', porq: 'porque',
  q: 'que', oq: 'o que', oque: 'o que',
  tb: 'tambem', tbm: 'tambem', tmb: 'tambem',
  qto: 'quanto', qta: 'quanta', qtos: 'quantos', qtas: 'quantas', qnt: 'quanto', qnts: 'quantos', qtd: 'quantidade', qtde: 'quantidade',
  qdo: 'quando', qnd: 'quando', qndo: 'quando',
  hj: 'hoje', amnh: 'amanha', ont: 'ontem',
  msg: 'mensagem', msgs: 'mensagens',
  td: 'tudo', tds: 'todos', blz: 'beleza', vlw: 'valeu', obg: 'obrigado', brigado: 'obrigado',
  mt: 'muito', mto: 'muito', mta: 'muita', mts: 'muitos',
  naum: 'nao',
  ss: 'sim', sss: 'sim', aham: 'sim', uhum: 'sim',
  cmg: 'comigo', ctg: 'contigo', dps: 'depois', agr: 'agora', aki: 'aqui', ai: 'ai',
  // fala do dia a dia
  ta: 'esta', tao: 'estao', tava: 'estava', to: 'estou', tamo: 'estamos',
  pra: 'para', pro: 'para o', pros: 'para os', pras: 'para as', prum: 'para um', pruma: 'para uma',
  cade: 'onde esta', kd: 'onde esta', cadê: 'onde esta',
  bora: 'vamos', vamo: 'vamos',
  mostra: 'mostrar', mostre: 'mostrar', mostrai: 'mostrar', ve: 'ver', vê: 'ver',
  abre: 'abrir', abra: 'abrir', abri: 'abrir',
  // frota e segurança
  vtr: 'veiculo', vtrs: 'veiculos', viatura: 'veiculo', viaturas: 'veiculos', carro: 'carro', auto: 'veiculo', automovel: 'veiculo', automoveis: 'veiculos',
  quilometragem: 'km', quilometros: 'km', kms: 'km', kilometragem: 'km', kilometros: 'km', klm: 'km',
  manut: 'manutencao', manu: 'manutencao', mecanico: 'oficina',
  // almoxarifado
  almox: 'almoxarifado', almoxarifa: 'almoxarifado', estq: 'estoque', estok: 'estoque', estoq: 'estoque',
  epis: 'epi', fardas: 'fardamento', farda: 'fardamento', uniforme: 'fardamento', uniformes: 'fardamento',
  // erros comuns de digitação
  quantso: 'quantos', qunatos: 'quantos', quatnos: 'quantos', quantas: 'quantas', estoqeu: 'estoque', etsoque: 'estoque', esotque: 'estoque',
  veiuclo: 'veiculo', veicluo: 'veiculo', veiulos: 'veiculos', veicuos: 'veiculos', placca: 'placa', plaa: 'placa',
  requisicao: 'requisicao', requizicao: 'requisicao', requsicao: 'requisicao', pedio: 'pedido', fornecedro: 'fornecedor',
};

/** expressões de várias palavras (aplicadas antes das palavras soltas) */
const PHRASES: [RegExp, string][] = [
  [/\bo que (que )?(e que )?(tem|ha)\b/g, 'o que tem'],
  [/\bquanto(s)? (que )?(tem|ha|temos|existe\w*)\b/g, 'quantos tem'],
  [/\bonde (que )?(fica|ta|tá)\b/g, 'onde esta'],
  [/\bda (uma|um) (olhada|olhadinha) (em|no|na|nos|nas)\b/g, 'mostrar'],
  [/\b(me )?(mostra|mostre|mostrai) (ai|ae|la)\b/g, 'mostrar'],
  [/\b(sera|sera que|sabe se|sabe me dizer se)\b/g, ''],
  [/\b(tipo assim|tipo|ne|entao|ai|ae|olha|oi|ei|e ai)\b(?= \w)/g, ''],
  [/\bde novo\b/g, 'novamente'],
  [/\bfazer (o )?favor (de )?/g, ''],
  [/\b(dar|da|de) (um )?jeito (de|em|no|na)\b/g, ''],
];

/** a frase em forma canônica (só palavras inteiras são trocadas; placas e números ficam como estão) */
export function canonical(norm: string): string {
  let s = ` ${norm} `;
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

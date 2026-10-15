import type { MaterialOrder } from '../pedidos/types';
import type { HubUser, HubUserRow, Level } from '../permissions';
import type { SectorDef } from '../sectors';
import type { Posto, RequestRow, StockItem } from '../almoxarifado/types';
import type { Query } from './text';
import type { PurchaseRequest } from '../compras/types';

/** Cartão mostrado junto com a resposta do Lyco. */
export type LycoCard =
  | { kind: 'stats'; title?: string; stats: { label: string; value: string; tone?: 'in' | 'out' | 'warn' | 'plain' }[]; foot?: string }
  | { kind: 'list'; title?: string; rows: { label: string; value?: string; sub?: string }[]; foot?: string };

export interface LycoReply {
  /** o que o Lyco fala (sem símbolos, pensado para a voz) */
  say: string;
  /** o que aparece escrito; se faltar, usa o `say` */
  text?: string;
  card?: LycoCard;
  /** ação na tela (trocar de aba, abrir algo…), feita junto com a resposta */
  act?: () => void | Promise<void>;
  /** ação depois que ela termina de falar (sair, navegar para outra página) */
  afterSpeech?: () => void;
  /** sugestões de próximos comandos */
  chips?: string[];
  /** de onde veio a resposta (local, wikipedia, clima, ia…) */
  source?: string;
  /** não entendeu: a interface oferece ajuda */
  unknown?: boolean;
  /** alteração preparada por um comando local: só é feita depois do "sim" da pessoa */
  pending?: PendingAction[];
  /**
   * Ela perguntou o que faltava ("Quantas unidades?"): a próxima resposta curta completa o pedido.
   * "{x}" marca onde a resposta entra ("entrada de {x} botas 42"); sem ele, a resposta vai no fim.
   */
  followUp?: string;
}

export type LycoScope = 'login' | 'hub' | 'sector';

export interface LycoTab {
  id: string;
  label: string;
  /** outros jeitos de chamar a aba */
  aliases: string[];
}

/** O que a tela oferece para o Lyco enxergar e comandar. */
export interface LycoHost {
  scope: LycoScope;
  sector: SectorDef | null;
  user: HubUser | null;
  tabs: LycoTab[];
  tab: string;
  goTab: (id: string) => void;
  can: (moduleId: string, level?: Exclude<Level, 'none'>) => boolean;
  /** vai para outra página da Lyceg */
  /** `spoken`: o Lyco já está dizendo para onde vai (a animação de troca não repete a frase) */
  navigate: (path: string, opts?: { spoken?: boolean }) => void;
  logout: () => void;
  /** o Lyco corre até o botão `sel` e soca (no soco: `exec`, ou o clique no botão). Sem o palco, só executa. */
  press?: (sel: string, opts?: { exec?: () => void; skipActive?: boolean }) => void;
  almox?: {
    requests: () => RequestRow[] | null;
    items: () => StockItem[] | null;
    postos: () => Posto[] | null;
    emailsCount: () => number | null;
  };
  hub?: {
    users: () => HubUserRow[] | null;
  };
  /** solicitações de compra (Almoxarifado ⇄ Compras), para o Lyco responder */
  compras?: {
    requests: () => PurchaseRequest[] | null;
  };
  /** fornecedores (setor Compras); a lista chega quando a aba Fornecedores já carregou */
  fornecedores?: {
    list: () => import('../compras/fornecedores').Supplier[] | null;
    canEdit: boolean;
  };
  /** frota (veículos, postos com localização, KM e operação) */
  frota?: {
    data: () => import('../frota/types').FrotaData | null;
  };
  /** pedidos de material (Projeto 3) do painel desta área */
  pedidos?: {
    scope: 'almox' | 'operacao' | 'rh';
    orders: () => MaterialOrder[] | null;
  };
}

/** Alteração preparada pela IA, esperando o "sim" da pessoa. É executada pelas rotas normais do sistema. */
export interface PendingAction {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  /** o que será feito, em uma linha ("saída de 5 unidades de Boné") */
  what: string;
}

export interface LycoMemory {
  /** alterações aguardando confirmação */
  pending?: PendingAction[] | null;
  /** pedido esperando a informação que faltou (ver LycoReply.followUp) */
  followUp?: string | null;
  last: LycoReply | null;
  lastInput: string;
  /** a frase como foi ouvida/digitada (com maiúsculas e acentos), para habilidades que usam nomes próprios */
  heard?: string;
  voiceOn: boolean;
  setVoice: (on: boolean) => void;
}

export interface Skill {
  id: string;
  /** onde a habilidade existe; sem isso, vale em qualquer tela */
  scopes?: LycoScope[];
  /** só dentro da ferramenta deste setor */
  sector?: string;
  /** frases-modelo: viram sugestões na tela e guia para a IA opcional */
  examples?: string[];
  /** 0..1: o quanto a frase parece ser para esta habilidade */
  match: (q: Query, host: LycoHost) => number;
  run: (q: Query, host: LycoHost, mem: LycoMemory) => LycoReply | Promise<LycoReply>;
}

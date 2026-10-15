/**
 * Bateria de frases do Lyco: confere se cada pedido cai na habilidade certa.
 * Rodar: npx tsx tests/lyco-nlu.test.ts
 */
import { hear, think, understand, CONFIDENT } from '../lib/lyco/engine';
import { getSector } from '../lib/sectors';
import { supplierPrefill } from '../lib/lyco/skills-fornecedores';
import type { LycoHost, LycoMemory } from '../lib/lyco/types';
import type { HubUser, HubUserRow } from '../lib/permissions';

const user = (over: Partial<HubUser> = {}): HubUser => ({ id: 'u1', username: 'mateus', display_name: 'Mateus Quintanilha', is_master: true, sector: null, sector_role: 'member', permissions: {}, active: true, ...over });
const CATS: Record<string, string[]> = { 'Bota de segurança': ['Fardamento', 'EPI'], 'Camisa social manga curta': ['Limpeza'], 'Calça tática': ['Fardamento'], 'Boné': ['Fardamento', 'Limpeza'], 'Cinto tático': ['Fardamento', 'Acessório'], 'Colete refletivo': ['EPI'], 'Rádio comunicador': ['Equipamento'] };
const item = (name: string, size: string | null, quantity: number, min = 0, at_postos = 0) => ({ id: name + size, ref: 1, name, size, unit: 'Cada', quantity, min_quantity: min, cost: 10, categories: CATS[name] ?? [], at_postos, created_at: '2026-01-01', updated_at: '2026-01-01' });
const items = [
  item('Bota de segurança', '40', 12, 5), item('Bota de segurança', '42', 3, 5), item('Bota de segurança', '44', 0, 5),
  item('Camisa social manga curta', 'G', 40), item('Camisa social manga curta', 'M', 22), item('Calça tática', '44', 9, 10),
  item('Boné', null, 70), item('Cinto tático', null, 15), item('Coturno', '41', 8), item('Colete refletivo', null, 0, 2), item('Rádio comunicador', null, 6),
];
const postos = ['Posto 01', 'Posto 02', 'Shopping Barra', 'Hospital Aliança', 'Condomínio Vila Verde'].map((name, i) => ({ id: 'p' + i, name, code: null, city: null, address: null, supervisor: null, notes: null, created_by: null, created_at: '', items_count: 2, units: 10 + i }));
const requests = [1, 2, 3, 4, 12].map((n, i) => ({ id: 'r' + n, protocol: n, email: 'a@b.c', collaborator: 'Fulano ' + n, posto: 'Posto 01', answers: [], attachments: [], status: (['nova', 'pendente', 'resolvida'] as const)[i % 3], handled_by: null, created_at: `2026-10-0${i + 1}T10:00:00Z`, updated_at: '' }));
const rows: HubUserRow[] = [
  { ...user(), created_at: '', last_login_at: null },
  { ...user({ id: 'u2', username: 'neilton', display_name: 'Neilton', is_master: false, sector: 'almoxarifado', sector_role: 'master' }), created_at: '', last_login_at: null },
  { ...user({ id: 'u3', username: 'juliana', display_name: 'Juliana Souza', is_master: false, sector: 'almoxarifado' }), created_at: '', last_login_at: null },
  { ...user({ id: 'u4', username: 'carla', display_name: 'Carla', is_master: false, sector: 'rh' }), created_at: '', last_login_at: null },
];

const ALMOX_TABS = [
  { id: 'solicitacoes', label: 'Solicitações', aliases: ['solicitacoes', 'pedidos', 'caixa de entrada'] },
  { id: 'estoque', label: 'Estoque', aliases: ['estoque', 'itens', 'inventario'] },
  { id: 'postos', label: 'Postos', aliases: ['postos'] },
  { id: 'metricas', label: 'Métricas', aliases: ['metricas', 'relatorios'] },
  { id: 'formulario', label: 'Formulário', aliases: ['formulario', 'editor do formulario'] },
  { id: 'emails', label: 'E-mails autorizados', aliases: ['emails', 'e-mails'] },
  { id: 'compras', label: 'Compras', aliases: ['compras', 'pedidos de compra', 'solicitacoes de compra', 'aba compras'] },
  { id: 'equipe', label: 'Equipe', aliases: ['equipe', 'permissoes', 'time'] },
  { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta', 'perfil', 'senha', 'minha senha'] },
];
const base = { tab: 'inicio', goTab: () => undefined, can: () => true, navigate: () => undefined, logout: () => undefined };
const almox: LycoHost = { ...base, scope: 'sector', sector: getSector('almoxarifado'), user: user(), tabs: ALMOX_TABS, almox: { requests: () => requests as never, items: () => items as never, postos: () => postos as never, emailsCount: () => 7 } };
const hub: LycoHost = { ...base, scope: 'hub', sector: null, user: user(), tabs: [{ id: 'setores', label: 'Setores', aliases: ['setores', 'visao geral'] }, { id: 'gestao', label: 'Gestão', aliases: ['gestao', 'indicadores', 'painel da gestao', 'relatorios', 'dashboard'] }, { id: 'usuarios', label: 'Usuários', aliases: ['usuarios', 'pessoas'] }, { id: 'lyco', label: 'Aprendizado do Lyco', aliases: ['aprendizado', 'aprendizado do lyco', 'memoria do lyco', 'o que o lyco aprendeu'] }, { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta', 'senha'] }], hub: { users: () => rows }, almox: almox.almox };
const login: LycoHost = { ...base, scope: 'login', sector: null, user: null, tabs: [] };
const rh: LycoHost = { ...base, scope: 'sector', sector: getSector('rh'), user: user({ is_master: false, sector: 'rh' }), tabs: [{ id: 'inicio', label: 'Início', aliases: ['inicio'] }, { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta', 'senha'] }] };

const purchases = [
  { id: 'pc1', number: 1, from_sector: 'almoxarifado', status: 'nova', priority: 'urgente', reason: null, needed_by: null, items: [{ item_id: 'x', name: 'Bota de segurança', size: '42', unit: 'Cada', quantity: 20, note: null, stock: 3, min: 5 }], requested_by: 'Neilton', handled_by: null, response: null, history: [], created_at: '2026-10-13T10:00:00Z', updated_at: '' },
  { id: 'pc2', number: 2, from_sector: 'almoxarifado', status: 'em_cotacao', priority: 'normal', reason: null, needed_by: null, items: [{ item_id: null, name: 'Lanterna', size: null, unit: 'Cada', quantity: 5, note: null, stock: null, min: null }], requested_by: 'Neilton', handled_by: 'Carlos', response: 'Cotando', history: [], created_at: '2026-10-13T11:00:00Z', updated_at: '' },
];
const almoxNo: LycoHost = { ...almox, can: (m: string) => m !== 'compras', compras: { requests: () => null } };
const almoxC: LycoHost = { ...almox, compras: { requests: () => purchases as never } };
const compras: LycoHost = { ...base, scope: 'sector', sector: getSector('compras'), user: user({ is_master: false, sector: 'compras', sector_role: 'master' }), tabs: [{ id: 'solicitacoes', label: 'Solicitações', aliases: ['solicitacoes', 'pedidos'] }, { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta'] }], compras: { requests: () => purchases as never } };
const SUPS = [
  { id: 's1', name: 'Malharia Bahia Ltda', trade_name: 'Malharia Bahia', cnpj: '11222333000181', phone: '(71) 3333-4444', email: 'vendas@malharia.com', contact: 'Rosa', category: 'fardamento, camisas e calças', city: 'Salvador', uf: 'BA', address: null, notes: null, active: true, created_by: 'Mateus', created_at: '', updated_at: null },
  { id: 's2', name: 'Botas Forte Comércio', trade_name: null, cnpj: null, phone: null, email: null, contact: null, category: 'botas e calçados de segurança', city: null, uf: null, address: null, notes: null, active: true, created_by: null, created_at: '', updated_at: null },
];
const comprasF: LycoHost = { ...compras, tabs: [...compras.tabs, { id: 'fornecedores', label: 'Fornecedores', aliases: ['fornecedores', 'fornecedor'] }], fornecedores: { list: () => SUPS as never, canEdit: true } };
const rhP: LycoHost = { ...rh, user: user({ is_master: false, sector: 'rh', sector_role: 'master' }), tabs: [{ id: 'pedidos', label: 'Pedidos', aliases: ['pedidos', 'admissoes'] }, { id: 'colaboradores', label: 'Colaboradores', aliases: ['colaboradores', 'funcionarios', 'kits'] }, { id: 'trocas', label: 'Troca anual', aliases: ['troca anual', 'trocas'] }, { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta'] }], pedidos: { scope: 'rh', orders: () => [] as never } };
// Projeto 3: pedidos de material
const ord = (n: number, stage: string, extra = {}) => ({ id: 'o' + n, number: n, origin: 'operacao', stage, priority: 'normal', needed_by: null, start_date: null, company: null, posto_id: null, posto_name: 'Posto 01', collaborator_id: null, collaborator_name: 'Caio', matricula: null, role: null, reason: null, requester: 'Uesley', supervisor: null, source_request_id: null, items: [{ item_id: 'x', name: 'Bota', size: '42', unit: 'Cada', qty: 2, reserved: 0, delivered: 0 }], flags: [], history: [], forwarded_by: null, forwarded_at: null, validated_by: null, validated_at: null, closed_at: null, created_at: '2026-10-13T10:00:00Z', updated_at: '', ...extra });
const orders = [ord(1, 'solicitado'), ord(2, 'validacao', { origin: 'rh_troca' }), ord(3, 'encaminhado')];
const almoxP: LycoHost = { ...almoxC, pedidos: { scope: 'almox', orders: () => orders as never } };
const opP: LycoHost = { ...base, scope: 'sector', sector: getSector('operacional'), user: user({ is_master: false, sector: 'operacional', sector_role: 'master' }), tabs: [{ id: 'pedidos', label: 'Pedidos de material', aliases: ['pedidos', 'pedidos de material'] }, { id: 'conta', label: 'Minha conta', aliases: ['conta', 'minha conta'] }], pedidos: { scope: 'operacao', orders: () => orders as never } };

type Case = [LycoHost, string, string | null];
const CASES: Case[] = [
  // login
  [login, 'Lyco, apresente-se', 'introduce'], [login, 'Lyco, bom dia', 'greet'], [login, 'boa noite Lyco', 'greet'], [login, 'Lyco quem é você', 'introduce'],
  [login, 'Lyco, que horas são?', 'time'], [login, 'Lyco que dia é hoje', 'date'], [login, 'Lyco, como faço para entrar?', 'login-help'], [login, 'Lyco esqueci minha senha', 'login-help'],
  [login, 'Lyco, quero fazer uma solicitação', 'open-request-form'], [login, 'Lyco o que você sabe fazer', 'help'], [login, 'Lyco, quanto é doze vezes oito', 'calc'],
  [login, 'Lyco, se apresenta aí', 'introduce'], [login, 'Lyco, o que é a Lyceg?', 'introduce'], [login, 'Lyco conta uma piada', 'smalltalk'], [login, 'oi Lyco', 'greet'],
  [login, 'Lyco, métricas da semana', null], [login, 'Lyco obrigado', 'thanks'], [login, 'Lyco tudo bem?', 'how-are-you'], [login, 'Lyco, sair', null],
  // almoxarifado
  [almox, 'Lyco, desejo ver as métricas da última semana', 'almox-metrics'], [almox, 'Lyco métricas', 'almox-metrics'], [almox, 'Lyco, como foi o mês?', 'almox-metrics'],
  [almox, 'Lyco entradas e saídas de hoje', 'almox-metrics'], [almox, 'Lyco me mostra o relatório do último mês', 'almox-metrics'], [almox, 'Lyco quantas solicitações chegaram na última semana', 'almox-metrics'],
  [almox, 'Lyco, tem solicitação nova?', 'almox-request-count'], [almox, 'Lyco quantos pedidos pendentes', 'almox-request-count'], [almox, 'Lyco mostrar solicitações resolvidas', 'almox-request-count'],
  [almox, 'Lyco, abrir a solicitação 12', 'almox-request-open'], [almox, 'Lyco abre o pedido número quatro', 'almox-request-open'], [almox, 'Lyco qual foi a última solicitação', 'almox-request-latest'],
  [almox, 'Lyco, quanto tem de bota 42?', 'almox-stock-lookup'], [almox, 'Lyco saldo de camisa social', 'almox-stock-lookup'], [almox, 'Lyco tem boné no estoque?', 'almox-stock-lookup'],
  [almox, 'Lyco procurar coturno', 'almox-stock-lookup'], [almox, 'Lyco quantas botas temos', 'almox-stock-lookup'], [almox, 'Lyco quanto tem de unicórnio no estoque', 'almox-stock-lookup'],
  [almox, 'Lyco, o que está com estoque baixo?', 'almox-stock-low'], [almox, 'Lyco quais itens estão zerados', 'almox-stock-low'], [almox, 'Lyco o que está acabando', 'almox-stock-low'], [almox, 'Lyco o que precisa repor', 'almox-stock-low'],
  [almox, 'Lyco, quanto temos de EPI?', 'almox-stock-category'], [almox, 'Lyco mostre os itens de Fardamento', 'almox-stock-category'], [almox, 'Lyco quais categorias existem no estoque', 'almox-stock-category'],
  [almox, 'Lyco filtre o estoque por acessórios', 'almox-stock-category'], [almox, 'Lyco quantos itens de Limpeza temos', 'almox-stock-category'], [almox, 'Lyco quais itens estão sem categoria', 'almox-stock-category'],
  [almox, 'Lyco o que está com estoque baixo em Fardamento', 'almox-stock-low'], [almox, 'Lyco quanto tem de bota 42 de EPI', 'almox-stock-lookup'], [almox, 'Lyco quantos equipamentos temos no estoque', 'almox-stock-category'],
  [hub, 'Lyco quanto temos de EPI no almoxarifado', 'almox-stock-category'], [almox, 'Lyco quais serviços você faz', null], [almox, 'Lyco itens de limpeza', 'almox-stock-category'], [almox, 'Lyco quantos acessórios saíram na última semana', 'almox-moves'],
  [almox, 'Lyco, resumo do estoque', 'almox-stock-summary'], [almox, 'Lyco qual o valor do estoque', 'almox-stock-summary'], [almox, 'Lyco quantos itens temos no estoque', 'almox-stock-summary'],
  [almox, 'Lyco, o que tem no posto 01?', 'almox-posto-stock'], [almox, 'Lyco estoque do posto shopping barra', 'almox-posto-stock'], [almox, 'Lyco, quantos postos temos?', 'almox-postos-count'],
  [almox, 'Lyco copiar o link do formulário', 'almox-form-link'], [almox, 'Lyco quantos e-mails autorizados', 'almox-emails-count'],
  [almox, 'Lyco, abrir estoque', 'go-tab'], [almox, 'Lyco ir para postos', 'go-tab'], [almox, 'Lyco abrir minha conta', 'go-tab'], [almox, 'Lyco quero trocar minha senha', 'ui-action'], [almox, 'Lyco estoque', 'go-tab'], [almox, 'Lyco abre as métricas', 'almox-metrics'],
  [almox, 'Lyco, abrir o setor financeiro', 'go-sector'], [almox, 'Lyco voltar ao painel master', 'go-sector'], [almox, 'Lyco, sair', 'logout'], [almox, 'Lyco qual é o meu setor', 'whoami'],
  [almox, 'Lyco, quanto é 15% de 2400', 'calc'], [almox, 'Lyco bom dia', 'greet'], [almox, 'Lyco repete', 'repeat'], [almox, 'Lyco para', 'stop'], [almox, 'Lyco modo silencioso', 'voice-off'], [almox, 'Lyco pode falar', 'voice-on'],
  [almox, 'Lyco quem descobriu o Brasil', null], [almox, 'Lyco como está o tempo hoje', null], [almox, 'Lyco qual a cotação do dólar', null], [almox, 'Lyco me explica o que é ISO 9001', null],
  // painel master
  [hub, 'Lyco, quantos usuários temos?', 'hub-users-count'], [hub, 'Lyco, quem está no almoxarifado?', 'hub-users-of-sector'], [hub, 'Lyco quem é o master do almoxarifado', 'hub-sector-master'],
  [hub, 'Lyco, criar usuário', 'hub-create-user'], [hub, 'Lyco novo usuário chamado Pedro Alves no financeiro', 'hub-create-user'], [hub, 'Lyco, abrir o setor financeiro', 'go-sector'], [hub, 'Lyco abrir almoxarifado', 'go-sector'],
  [hub, 'Lyco em que setor está a Juliana', 'hub-find-user'], [hub, 'Lyco abrir usuários', 'go-tab'], [hub, 'Lyco quantas pessoas no RH', 'hub-users-of-sector'], [hub, 'Lyco ir para recursos humanos', 'go-sector'],
  [hub, 'Lyco quais setores existem', 'hub-users-count'], [hub, 'Lyco métricas', 'hub-users-count'],
  // o master pede dados do almoxarifado sem sair do painel master
  [hub, 'Lyco Me apresente as métricas da última semana do almoxarifado', 'almox-metrics'], [hub, 'Lyco métricas do almoxarifado', 'almox-metrics'], [hub, 'Lyco como foi o mês no almoxarifado', 'almox-metrics'],
  [hub, 'Lyco me mostre as métricas do almoxarifado de hoje', 'almox-metrics'], [hub, 'Lyco o que está com estoque baixo', 'almox-stock-low'], [hub, 'Lyco quanto tem de bota 42', 'almox-stock-lookup'],
  [hub, 'Lyco tem solicitação nova', 'almox-request-count'], [hub, 'Lyco quantos postos temos', 'almox-postos-count'], [hub, 'Lyco resumo do estoque', 'almox-stock-summary'],
  [hub, 'Lyco apresente-se', 'introduce'], [hub, 'Lyco se apresente', 'introduce'], [hub, 'Lyco apresente', 'introduce'], [hub, 'Lyco abrir o almoxarifado', 'go-sector'],
  [hub, 'Lyco quantos usuários temos no setor financeiro', 'hub-users-of-sector'], [hub, 'Lyco Quantos usuários temos no setor Financeiro?', 'hub-users-of-sector'], [hub, 'Lyco quantos usuários tem no financeiro', 'hub-users-of-sector'], [hub, 'Lyco quantos usuários há no setor de recursos humanos', 'hub-users-of-sector'],
  [hub, 'Lyco quantas pessoas trabalham no comercial', 'hub-users-of-sector'], [hub, 'Lyco usuários do setor operacional', 'hub-users-of-sector'], [hub, 'Lyco me mostre os usuários do financeiro', 'hub-users-of-sector'], [hub, 'Lyco tem alguém no financeiro', 'hub-users-of-sector'],
  [hub, 'Lyco quantos funcionários o financeiro tem', 'hub-users-of-sector'], [hub, 'Lyco me diga quantos usuários existem no setor financeiro', 'hub-users-of-sector'], [hub, 'Lyco quantos estão no almoxarifado', 'hub-users-of-sector'],
  [hub, 'Lyco métricas do financeiro', 'hub-sector-not-ready'], [hub, 'Lyco me apresente o relatório do RH', 'hub-sector-not-ready'], [hub, 'Lyco quantas solicitações pendentes no almoxarifado', 'almox-request-count'],
  [login, 'Lyco, apresente-se a todos da sala, por favor', 'introduce'], [login, 'Lyco se apresente para todos', 'introduce'], [login, 'Lyco apresente se', 'introduce'], [login, 'Lyco se apresenta pra galera', 'introduce'],
  [almox, 'Lyco me apresente as métricas da última semana', 'almox-metrics'], [almox, 'Lyco apresente o relatório do mês', 'almox-metrics'], [almox, 'Lyco me apresenta o estoque baixo', 'almox-stock-low'],
  [rh, 'Lyco me apresente as métricas da semana', 'sector-not-ready'], [login, 'Lyco, pode se apresentar?', 'introduce'], [login, 'Lyco apresente-se por favor', 'introduce'],
  // perguntas sobre o que aconteceu em um período (não é o retrato de agora)
  [hub, 'Lyco quantos itens saíram do estoque do almoxarifado nas últimas 15 horas', 'almox-moves'], [almox, 'Lyco quantos itens saíram nas últimas 15 horas', 'almox-moves'], [almox, 'Lyco o que saiu do estoque hoje', 'almox-moves'],
  [almox, 'Lyco quantas botas saíram ontem', 'almox-moves'], [almox, 'Lyco o que entrou no estoque essa semana', 'almox-moves'], [almox, 'Lyco quantas unidades foram enviadas aos postos nos últimos três dias', 'almox-moves'],
  [almox, 'Lyco quais itens mais saíram no mês passado', 'almox-moves'], [almox, 'Lyco teve saída de colete hoje', 'almox-moves'], [almox, 'Lyco quantas camisas entraram e saíram esta semana', 'almox-moves'],
  [almox, 'Lyco métricas das últimas 15 horas', 'almox-metrics'], [almox, 'Lyco como foi ontem', 'almox-metrics'], [almox, 'Lyco entradas e saídas dos últimos 3 dias', 'almox-metrics'], [almox, 'Lyco quantos itens temos no estoque', 'almox-stock-summary'],
  [almox, 'Lyco quantas solicitações recebemos na semana passada', 'almox-metrics'], [hub, 'Lyco quantas unidades saíram do almoxarifado ontem', 'almox-moves'], [rh, 'Lyco quantos itens saíram ontem', null],
  // sair da conta dito de qualquer jeito
  [almox, 'Lyco deslog da minha conta e me leve diretamente para a tela de login por favor', 'logout'], [hub, 'Lyco deslog da minha conta e me leve diretamente para a tela de login por favor', 'logout'], [almox, 'Lyco me desloga', 'logout'],
  [almox, 'Lyco quero sair da minha conta', 'logout'], [almox, 'Lyco faz logout pra mim', 'logout'], [almox, 'Lyco me leva para a tela de login', 'logout'], [almox, 'Lyco encerre minha sessão por favor', 'logout'], [rh, 'Lyco desconectar', 'logout'],
  [almox, 'Lyco abrir minha conta', 'go-tab'], [almox, 'Lyco quero trocar a senha da minha conta', 'ui-action'], [almox, 'Lyco o que saiu', 'almox-moves'], [almox, 'Lyco sair', 'logout'],
  // baixar o arquivo das métricas
  [hub, 'Lyco, desejo baixar as métricas do almoxarifado', 'download-metrics'], [almox, 'Lyco, desejo baixar as métricas', 'download-metrics'], [almox, 'Lyco baixe a planilha das métricas do último mês', 'download-metrics'],
  [hub, 'Lyco desejo baixar as métricas do financeiro', 'download-metrics'], [rh, 'Lyco quero baixar as métricas de recursos humanos', 'download-metrics'], [almox, 'Lyco me envie o gráfico das métricas', 'download-metrics'],
  [almox, 'Lyco exportar relatório em excel', 'download-metrics'], [hub, 'Lyco baixar métricas', 'download-metrics'], [almox, 'Lyco fazer download do gráfico de hoje', 'download-metrics'],
  [almox, 'Lyco métricas da última semana', 'almox-metrics'], [almox, 'Lyco o que está com estoque baixo', 'almox-stock-low'],
  // "diga olá para…"
  [login, 'Lyco, diga olá para Fernanda', 'say-hello'], [login, 'Lyco diga oi pro Júnior', 'say-hello'], [login, 'Lyco, diga olá para Fernanda, Junior, Suzana', 'say-hello'], [login, 'Lyco dê bom dia para a Suzana', 'say-hello'],
  [login, 'Lyco cumprimente o Carlos', 'say-hello'], [login, 'Lyco manda um alô pra galera', 'say-hello'], [almox, 'Lyco diga olá para o Neilton', 'say-hello'], [login, 'Lyco, bom dia', 'greet'], [login, 'Lyco olá', 'greet'],
  // setor Compras
  [compras, 'Lyco, tem solicitação nova?', 'purchase-count'], [compras, 'Lyco quantos pedidos de compra em aberto', 'purchase-count'], [compras, 'Lyco abrir a solicitação de compra 2', 'purchase-open'],
  [compras, 'Lyco como estão as solicitações', 'purchase-count'], [almoxC, 'Lyco tem solicitação de compra nova?', 'purchase-count'], [almoxC, 'Lyco como está a solicitação de compra 1', 'purchase-open'],
  [almoxC, 'Lyco tem solicitação nova?', 'almox-request-count'], [compras, 'Lyco abrir a solicitação 2', 'purchase-open'], [compras, 'Lyco qual foi a última solicitação?', 'purchase-count'], [almoxC, 'Lyco quantas solicitações de compra chegaram nos últimos 3 dias', 'purchase-count'], [almoxC, 'Lyco mostrar os 5 últimos pedidos de compra', 'purchase-count'], [almoxC, 'Lyco pedido de compra número 2', 'purchase-open'], [almoxC, 'Lyco abrir a solicitação 12', 'almox-request-open'], [almoxC, 'Lyco abrir compras', 'go-tab'], [compras, 'Lyco minha conta', 'go-tab'],
  [hub, 'Lyco abrir o setor de compras', 'go-sector'], [hub, 'Lyco abrir o setor de suprimentos', 'go-sector'], [hub, 'Lyco quem está no setor de compras', 'hub-users-of-sector'],
  [hub, 'Lyco criar usuário no setor compras', 'hub-create-user'], [almox, 'Lyco lista de compras', 'almox-stock-low'], [almox, 'Lyco o que precisa comprar', 'almox-stock-low'],
  // fornecedores (Compras)
  [comprasF, 'Lyco, cadastrar um novo fornecedor', 'supplier-new'], [comprasF, 'Lyco novo fornecedor Malharia Bahia telefone 71 3333-4444', 'supplier-new'], [comprasF, 'Lyco importar a planilha de fornecedores', 'supplier-import'],
  [comprasF, 'Lyco quantos fornecedores temos', 'supplier-info'], [comprasF, 'Lyco quem fornece botas', 'supplier-info'], [comprasF, 'Lyco qual o telefone do fornecedor Malharia Bahia', 'supplier-info'], [comprasF, 'Lyco abrir fornecedores', 'go-tab'],
  // downloads: o Lyco corre até o botão e baixa
  [hub, 'Lyco, baixar o PDF da Gestão', 'download-gestao'], [hub, 'Lyco baixar o relatório', 'download-gestao'], [hub, 'Lyco exportar a planilha da gestão dos últimos 90 dias', 'download-gestao'],
  [almox, 'Lyco baixar a planilha das métricas', 'download-metrics'], [hub, 'Lyco baixar as métricas do almoxarifado', 'download-metrics'], [almox, 'Lyco baixar o PDF da gestão', 'download-gestao'],
  [opP, 'Lyco baixar a planilha dos pedidos', 'download-orders'], [almox, 'Lyco baixar o XML da nota 1234', 'download-nota-xml'], [almox, 'Lyco dar baixa de 3 botas', 'act-stock-move'],
  // pedidos de material
  [opP, 'Lyco tem troca para validar?', 'order-count'], [opP, 'Lyco quantos pedidos estão em aberto', 'order-count'], [opP, 'Lyco abrir o pedido 3', 'order-open'], [opP, 'Lyco pedidos atrasados', 'order-count'],
  [almoxP, 'Lyco quantos pedidos de material para separar', 'order-count'], [almoxP, 'Lyco abrir o pedido de material 3', 'order-open'], [almoxP, 'Lyco abrir a solicitação 12', 'almox-request-open'], [almoxP, 'Lyco tem solicitação nova?', 'almox-request-count'], [almoxP, 'Lyco pedido de compra número 2', 'purchase-open'], [almoxP, 'Lyco abrir pedidos de material', 'go-tab'],
  // manual (explicações passo a passo)
  [almox, 'Lyco me explique passo a passo como funciona o setor do almoxarifado por favor', 'explain'], [almox, 'Lyco como funciona este setor', 'explain'], [almox, 'Lyco como eu lanço uma nota fiscal', 'explain'],
  [almox, 'Lyco como faço o inventário', 'explain'], [almox, 'Lyco o que é saldo reservado', 'explain'], [rh, 'Lyco como funciona a troca anual', 'explain'], [hub, 'Lyco explica como funciona o RH', 'explain'],
  [hub, 'Lyco, explique o painel de master geral', 'explain'], [hub, 'Lyco, explique a auditoria', 'explain'], [hub, 'Lyco, me fala sobre o painel master', 'explain'], [hub, 'Lyco, o que faz o painel master', 'explain'], [almox, 'Lyco, explique o estoque', 'explain'],
  [almox, 'Lyco como está o estoque', 'almox-stock-summary'], [almox, 'Lyco abrir o estoque', 'go-tab'],
  // setor ainda vazio
  [rh, 'Lyco, desejo ver as métricas da última semana', 'sector-not-ready'], [rh, 'Lyco abrir o setor financeiro', null], [rh, 'Lyco minha conta', 'go-tab'], [rh, 'Lyco que horas são', 'time'],
];


// ===================== bateria de comandos (vários jeitos de falar cada um) =====================
const BATTERY: [LycoHost, string[], string | null][] = [
  // entrada no estoque
  [almox, ['entrada de 10 botas 42', 'chegaram 10 botas tamanho 42', 'recebi dez botas 42', 'recebemos 10 botas número 42', 'registra a entrada de 10 botas 42', 'lança entrada de 10 bota 42', 'da entrada em 10 botas 42 por favor', 'adiciona 10 botas 42 no estoque', 'acabou de chegar 10 botas 42', 'repor 10 botas 42', 'coloca mais 10 botas 42', 'quero dar entrada de vinte botas 42'], 'act-stock-move'],
  // saída
  [almox, ['saída de 3 botas 40', 'dar baixa em 3 botas 40', 'baixa 3 botas 40', 'tira 3 botas 40 do estoque', 'retirar 3 botas 40', 'usei 3 botas 40', 'saíram 3 botas 40 agora', 'consumimos 3 botas 40', 'registra saída de três botas 40', 'perdemos 3 botas 40'], 'act-stock-move'],
  // ajuste / contagem
  [almox, ['o saldo da bota 42 é 15', 'ajusta o saldo da bota 42 para 15', 'corrige o saldo da bota 42 pra 15', 'contei 15 botas 42', 'o saldo certo da bota 42 é 15'], 'act-stock-move'],
  // envio e devolução de posto
  [almox, ['enviar 5 camisas G para o posto 01', 'manda 5 camisas G pro posto 01', 'transfere 5 camisas G ao posto 01', 'leva 5 camisas G pro posto 01', 'entregar 5 camisas G no posto 01'], 'act-stock-move'],
  [almox, ['o posto 01 devolveu 2 camisas G', 'voltaram 2 camisas G do posto 01', 'devolução de 2 camisas G do posto 01', 'recolhi 2 camisas G do posto 01'], 'act-stock-move'],
  // cadastro de item
  [almox, ['cadastrar o item lanterna tática', 'cadastra o produto lanterna tática com 7 unidades', 'novo item lanterna tática', 'criar o item lanterna tática', 'adicionar o produto lanterna tática ao estoque', 'cadastrar um item novo', 'quero cadastrar um material novo'], 'act-item-create'],
  // mínimo
  [almox, ['o estoque mínimo da bota 42 é 8', 'muda o mínimo da bota 42 para 8', 'define o mínimo da bota 42 em 8', 'mínimo da bota 42 é oito'], 'act-item-min'],
  // categorias
  [almox, ['coloca o boné na categoria EPI', 'adiciona o boné na categoria EPI', 'tira o boné da categoria max serviços', 'remove o boné da categoria max serviços'], 'act-item-category'],
  // solicitações dos postos
  [almox, ['marcar a solicitação 12 como resolvida', 'resolve a solicitação 12', 'finaliza a 12', 'conclui a solicitação 12', 'fecha a solicitação 12', 'a solicitação 12 está resolvida', 'deixa a solicitação 12 pendente', 'coloca a 12 como pendente', 'reabre a solicitação 12', 'muda a solicitação 12 para nova'], 'act-request-status'],
  // postos
  [almox, ['cadastrar o posto Hospital Central', 'novo posto Hospital Central em Salvador', 'cria o posto Hospital Central', 'adiciona o posto Hospital Central', 'novo posto', 'cadastrar um posto'], 'act-posto-create'],
  [almox, ['remover o posto condomínio vila verde', 'exclui o posto condomínio vila verde', 'apaga o posto condomínio vila verde'], 'act-posto-remove'],
  [almox, ['enviar itens para o shopping barra', 'mandar material pro posto 01'], 'ui-posto-enviar'],
  // e-mails autorizados
  [almox, ['autorizar o email joao@empresa.com', 'libera o e-mail joao@empresa.com', 'cadastra o email joao@empresa.com', 'autoriza um email', 'remove o email joao@empresa.com', 'desautoriza o e-mail joao@empresa.com'], 'act-email'],
  // estoque: botões
  [almox, ['classificar os itens', 'gerar os códigos', 'classifica o estoque', 'dar código aos itens'], 'ui-action'],
  [almox, ['fazer inventário', 'começar o inventário', 'vamos fazer o inventário', 'abrir um novo inventário', 'inventário geral'], 'ui-action'],
  [almox, ['importar planilha de itens', 'importar a planilha do estoque', 'subir uma planilha com os produtos', 'carregar a planilha de materiais'], 'ui-action'],
  [almox, ['importar a planilha de postos', 'subir os postos por planilha'], 'ui-action'],
  [almox, ['nova solicitação de compra', 'quero fazer um pedido de compra', 'pedir uma compra', 'criar uma solicitação de compra', 'manda um pedido de compra'], 'ui-action'],
  [almox, ['adicionar uma pergunta no formulário', 'criar uma pergunta nova', 'inclui uma pergunta'], 'ui-action'],
  [almox, ['importar o xml da nota', 'importar xml', 'subir o xml', 'lançar a nota pelo xml'], 'ui-action'],
  [almox, ['lançar uma nota fiscal', 'digitar uma nota', 'nova nota fiscal', 'registrar uma nf'], 'ui-action'],
  // RH
  [rhP, ['abrir uma admissão', 'novo pedido', 'nova admissão', 'quero pedir uma troca extraordinária', 'fazer um pedido de material', 'criar um pedido'], 'ui-action'],
  [rhP, ['cadastrar um colaborador', 'novo colaborador', 'cadastra o funcionário', 'adicionar um vigilante'], 'ui-action'],
  [rhP, ['importar a planilha de colaboradores', 'subir a planilha dos funcionários', 'importar colaboradores'], 'ui-action'],
  [rhP, ['criar um kit', 'novo kit', 'cadastrar um kit para vigilante', 'montar um kit'], 'ui-action'],
  // usuários (master geral)
  [hub, ['cadastrar usuário no setor recursos humanos', 'criar um usuário', 'novo usuário no financeiro', 'cria um acesso pro João no almoxarifado', 'quero cadastrar um novo usuário', 'adicionar um usuário'], 'hub-create-user'],
  [almox, ['cadastrar usuário no setor recursos humanos', 'criar um usuário novo', 'novo usuário no rh', 'criar um acesso para o João'], 'hub-create-user'],
  [hub, ['desativar a juliana', 'bloqueia o acesso do neilton', 'tira o acesso da juliana', 'reativar a juliana', 'libera o acesso da juliana de novo', 'muda a carla para o setor financeiro', 'transfere a carla pro financeiro', 'tornar a juliana master do almoxarifado', 'faz a juliana virar master', 'tira o neilton de master', 'redefinir a senha da juliana para nova1234', 'troca a senha do neilton', 'excluir o usuário carla', 'apaga o usuário da carla'], 'act-user'],
  [hub, ['dar permissão de editar o estoque para a juliana', 'a juliana pode editar o estoque', 'a juliana só pode ver as métricas', 'libera a juliana para mexer nos postos', 'tirar o acesso da juliana aos postos', 'a juliana não pode ver os emails'], 'act-permission'],
  // compras
  [compras, ['marcar a solicitação de compra 2 como comprada', 'a compra 2 foi comprada', 'compramos a solicitação 2', 'a compra 2 chegou', 'a solicitação 2 foi entregue', 'coloca a solicitação 2 em cotação', 'recusa a solicitação de compra 2', 'a compra 2 foi negada'], 'act-purchase-status'],
  [almoxC, ['cancelar a solicitação de compra 1', 'cancela a compra 1'], 'act-purchase-status'],
  [comprasF, ['desativar o fornecedor malharia bahia', 'reativar o fornecedor botas forte'], 'act-supplier-active'],
  // navegação entre setores e telas
  [hub, ['abrir o estoque do almoxarifado', 'me leva no estoque do almoxarifado', 'mostra os postos do almoxarifado', 'abrir os fornecedores', 'ir para os fornecedores de compras', 'abrir a troca anual do rh', 'abrir os colaboradores'], 'go-sector-tab'],
  [almox, ['abrir os colaboradores do rh', 'ir para os fornecedores', 'abrir os usuários', 'abrir o aprendizado da max'], 'go-sector-tab'],
  [almox, ['trocar minha senha', 'quero mudar a minha senha', 'alterar minha senha', 'esqueci minha senha quero trocar'], 'ui-action'],
  [almox, ['pedir compra de 20 botas 42', 'solicitar compra de 20 botas 42, é urgente', 'fazer um pedido de compra de 20 botas 42', 'precisamos comprar 20 botas 42', 'compra 20 botas 42'], 'act-purchase-create'],
  // pedidos de material
  [opP, ['validar a troca 3', 'aprova o pedido 3', 'valida o pedido número 3', 'cancelar o pedido 3 porque a pessoa desistiu', 'cancela a troca 3', 'encaminhar o pedido 3 ao almoxarifado'], 'act-order'],
  [almoxP, ['aplicar a sugestão do pedido de material 3', 'reservar o pedido de material 3', 'entregar o pedido de material 3', 'separar o material do pedido 3'], 'act-order'],
  // perguntas não podem virar alteração
  [almox, ['quanto tem de bota 42', 'quantas botas 42 temos', 'tem bota 42 no estoque'], 'almox-stock-lookup'],
  [almox, ['como dou entrada no estoque', 'como faço inventário', 'me explica como lançar uma nota'], 'explain'],
];
for (const [host, phrases, expected] of BATTERY) for (const ph of phrases) CASES.push([host, 'Lyco, ' + ph, expected]);

let fail = 0;
for (const [host, phrase, expected] of CASES) {
  const h = hear(phrase);
  const top = understand(h.command, host).top;
  const got = top && top.score >= CONFIDENT ? top.skill.id : null;
  if (got !== expected || h.wake !== 'strong') {
    fail++;
    console.log(`FALHOU  [${host.scope}/${host.sector?.slug ?? '-'}] "${phrase}" → ${got} (${top?.score ?? 0}) · esperado ${expected} · wake=${h.wake} · cmd="${h.command}"`);
  }
}

// respostas completas (sem rede): não podem lançar erro nem voltar vazias
const mem: LycoMemory = { last: null, lastInput: '', voiceOn: true, setVoice: () => undefined };
(globalThis as { fetch?: unknown }).fetch = async (url: string) => {
  if (String(url).includes('/metrics/range')) {
    return { ok: true, json: async () => ({ from: '', to: '', totals: { in: 5, out: 11, inMoves: 1, outMoves: 3, itemsIn: 1, itemsOut: 3, toPostos: 6, returned: 0, consumed: 0, adjustments: 0 }, items: [{ name: 'Camisa social manga curta · G', in: 0, out: 6 }, { name: 'Calça tática · 44', in: 5, out: 0 }, { name: 'Camisa social manga curta · M', in: 0, out: 3 }, { name: 'Bota de segurança · 42', in: 0, out: 2 }], postos: [{ name: 'Shopping Barra', received: 6 }], requests: { total: 2, nova: 2, pendente: 0, resolvida: 0 }, truncated: false }) };
  }
  return { ok: false, json: async () => ({ error: 'sem rede no teste' }) };
};
(async () => {
  for (const [host, phrase] of CASES) {
    const r = await think(hear(phrase).command, host, { memory: mem });
    if (typeof r.say !== 'string' || (!r.say && !r.text)) {
      fail++;
      console.log('RESPOSTA VAZIA', phrase, r);
    }
    if (/undefined|NaN|\[object/.test(r.say + (r.text ?? '') + JSON.stringify(r.card ?? ''))) {
      fail++;
      console.log('RESPOSTA COM LIXO', phrase, r.say, r.text);
    }
  }
  // segunda opinião da IA: só em frase longa com pouca certeza local
  {
    let calls = 0;
    let route: string | null = 'Lyco, sair';
    const remote = async (_t: string, _e: string[], mode?: 'route') => {
      calls++;
      if (mode !== 'route') return null;
      return route ? { route } : null;
    };
    const long = 'abrir aquela parte da minha conta onde fica tudo isso';
    const check = (name: string, ok: boolean) => {
      if (!ok) {
        fail++;
        console.log('FALHOU segunda opinião:', name);
      }
    };
    let r = await think(long, almox, { memory: mem, remote });
    check('IA corrige o palpite local', /Encerrando a sua sessão/.test(r.say) && calls === 1);
    route = null;
    r = await think(long, almox, { memory: mem, remote });
    check('sem resposta da IA, vale o palpite local', /Minha conta/.test(r.say));
    route = 'Lyco, frase que nenhuma habilidade entende xyz';
    r = await think(long, almox, { memory: mem, remote });
    check('rota inválida da IA é ignorada', /Minha conta/.test(r.say));
    calls = 0;
    await think('abrir minha conta', almox, { memory: mem, remote });
    await think('quantos itens saíram do estoque do almoxarifado nas últimas 15 horas', almox, { memory: mem, remote });
    check('frase curta ou com certeza não consulta a IA', calls === 0);
  }
  // agente: alterações com confirmação, e quando ele é (ou não) chamado
  {
    const check = (name: string, ok: boolean, extra?: unknown) => {
      if (!ok) {
        fail++;
        console.log('FALHOU agente:', name, extra ?? '');
      }
    };
    const calls: string[] = [];
    const done: { url: string; method?: string; body?: string }[] = [];
    let apiOk = true;
    const prevFetch = (globalThis as { fetch: unknown }).fetch;
    (globalThis as { fetch: unknown }).fetch = async (url: string, init?: { method?: string; body?: string }) => {
      if (!String(url).includes('/metrics')) done.push({ url: String(url), method: init?.method, body: init?.body });
      if (String(url).includes('/metrics')) return { ok: false, json: async () => ({ error: 'sem rede no teste' }) };
      return { ok: apiOk, json: async () => (apiOk ? { ok: true } : { error: 'Saldo insuficiente.' }) };
    };
    const pending = [{ method: 'POST' as const, path: '/api/almoxarifado/stock/move', body: { item_id: 'x', kind: 'saida', quantity: 5 }, what: 'saída de 5 unidades de Boné' }];
    const agent = async (text: string) => {
      calls.push(text);
      if (/bon[eé]s/.test(text)) return { say: 'Vou registrar: saída de 5 unidades de Boné. Confirma?', pending, source: 'ia' };
      if (/capital/.test(text)) return { say: 'Canberra.', source: 'ia' };
      if (/parada/.test(text)) return { route: 'Lyco, métricas do último mês', source: 'ia' };
      if (/limite/.test(text)) return { source: 'limite' };
      return { source: 'nenhuma' };
    };
    const m2: LycoMemory = { last: null, lastInput: '', voiceOn: true, setVoice: () => undefined };
    const t = (p: string) => think(hear(p).command || p, almox, { memory: m2, agent });
    let r = await t('Lyco, registre a saída de 5 bonés');
    check('pedido de alteração vai ao agente e pede confirmação', /Confirma\?/.test(r.say) && m2.pending?.length === 1 && done.length === 0, r);
    r = await t('sim, pode confirmar');
    check('"sim" executa pela rota normal do sistema', r.say === 'Pronto: saída de 5 unidades de Boné.' && done.length === 1 && done[0].url === '/api/almoxarifado/stock/move' && done[0].method === 'POST' && !m2.pending, [r, done]);
    await t('Lyco, registre a saída de 5 bonés');
    r = await t('não, cancela');
    check('"não" descarta', r.say === 'Tudo bem, não alterei nada.' && done.length === 1 && !m2.pending, r);
    await t('Lyco, registre a saída de 5 bonés');
    r = await t('Lyco, que horas são');
    check('mudar de assunto descarta a alteração', /Agora são/.test(r.say) && !m2.pending && done.length === 1, r);
    r = await t('sim');
    check('"sim" solto depois disso não executa nada', done.length === 1, r);
    apiOk = false;
    await t('Lyco, registre a saída de 5 bonés');
    r = await t('confirmo');
    check('erro do sistema é dito à pessoa', /Não consegui registrar: saída de 5 unidades de Boné\. Saldo insuficiente\./.test(r.say), r);
    apiOk = true;
    r = await t('Lyco, qual é a capital da Austrália');
    check('pergunta geral vai ao agente', r.say === 'Canberra.', r);
    r = await t('Lyco, como é que tá a parada toda desse mês aí');
    check('agente devolve um comando da tela', /No último mês|métricas/i.test(r.say), r);
    calls.length = 0;
    await t('Lyco, abrir estoque');
    await t('Lyco, quanto tem de bota 42');
    await t('Lyco, desative a voz');
    await t('Lyco, sair');
    await t('Lyco, quero trocar minha senha');
    check('comandos claros continuam locais (sem gastar a IA)', calls.length === 0, calls);
    await t('Lyco, marque a solicitação 12 como resolvida');
    check('"marque a solicitação 12 como resolvida" é feito pela próprio Lyco (sem gastar a IA)', calls.length === 0, calls);
    r = await t('Lyco, me explique o limite disso');
    check('limite da IA: avisa', /limite de uso/.test(r.say), r);
    r = await think('vai tomar no cu', almox, { memory: m2, agent });
    check('palavrão é barrado antes de tudo', /conversa profissional/.test(r.say), r);
    (globalThis as { fetch: unknown }).fetch = prevFetch;
  }
  // nomes em "diga olá para…"
  {
    const { helloNames } = await import('../lib/lyco/skills-core');
    const eq = (raw: string, want: string) => {
      const r = helloNames(raw);
      const got = r.everyone ? '*' : r.names.join('|');
      if (got !== want) {
        fail++;
        console.log(`FALHOU nomes: "${raw}" → ${got} · esperado ${want}`);
      }
    };
    eq('Lyco, diga olá para Fernanda', 'Fernanda');
    eq('Lyco diga olá para Fernanda, Junior, Suzana...', 'Fernanda|Junior|Suzana');
    eq('Lyco diga olá para Fernanda Júnior e Suzana', 'Fernanda Júnior|Suzana');
    eq('Lyco diga olá para Fernanda Júnior Suzana', 'Fernanda|Júnior|Suzana');
    eq('max diga oi pro josé antônio', 'José Antônio');
    eq('Lyco dê bom dia para a Suzana e o Carlos, por favor', 'Suzana|Carlos');
    eq('Lyco diga olá para Maria da Silva Santos', 'Maria da Silva Santos');
    eq('Lyco cumprimente o Carlos', 'Carlos');
    eq('Lyco diga olá para todos', '*');
    eq('Lyco manda um alô pra galera', '*');
    eq('Lyco dê as boas-vindas ao seu João e à dona Ana', 'Seu João|Dona Ana');
    const m3: LycoMemory = { last: null, lastInput: '', voiceOn: true, setVoice: () => undefined };
    const say = async (raw: string) => (await think(hear(raw).command, login, { memory: m3, raw })).say;
    const G = '(Bom dia|Boa tarde|Boa noite)';
    const chk = (name: string, text: string, re: RegExp) => {
      if (!re.test(text)) {
        fail++;
        console.log('FALHOU olá:', name, '→', text);
      }
    };
    chk('um nome', await say('Lyco, diga olá para Fernanda'), new RegExp(`^${G}, Fernanda! (Como você está hoje\\?|Tudo tranquilo\\?|Tudo de boa\\?|Tudo certo por aí\\?|Como vão as coisas\\?)$`));
    chk('vários nomes', await say('Lyco, diga olá para Fernanda, Junior, Suzana...'), new RegExp(`^${G}, Fernanda, Junior e a todos que estão presentes!$`));
    chk('dois nomes', await say('Lyco diga olá para Júnior e Suzana'), new RegExp(`^${G}, Júnior, Suzana e a todos que estão presentes!$`));
    chk('todos', await say('Lyco diga olá para todos'), new RegExp(`^${G} a todos que estão presentes! `));
  }
  // ---- arbitragem com a IA e memória de aprendizado ----
  {
    const check = (name: string, cond: boolean, extra?: unknown) => { if (!cond) { fail++; console.log('FALHOU ', name, JSON.stringify(extra)?.slice(0, 300)); } };
    const m2: LycoMemory = { last: null, lastInput: '', voiceOn: true, setVoice: () => undefined };
    const asked = 'por favor, fale para mim qual o valor total que tem no estoque do almoxarifado?';
    let calls = 0;
    let hint: string | undefined;
    let r = await think(hear('Lyco, ' + asked).command, almox, { memory: m2, agent: async (_t, _e, h) => { calls++; hint = h; return { say: 'Essa função ainda não existe na Lyceg.', source: 'ia', gaveUp: true }; } });
    check('IA desistiu mas a habilidade local sabia: vale a local (caso do print)', calls === 1 && /^O estoque do almoxarifado vale 1\.850 reais/.test(r.say) && r.card?.kind === 'stats' && hint === 'Lyco, resumo do estoque', [r.say, hint]);
    r = await think(hear('Lyco, ' + asked).command, almox, { memory: m2, agent: async () => ({ say: 'Não consigo acessar isso.', source: 'ia' }) });
    check('desistência sem a marca do servidor também é reconhecida', /^O estoque do almoxarifado vale/.test(r.say), r.say);
    r = await think(hear('Lyco, ' + asked).command, almox, { memory: m2, agent: async () => ({ say: 'O estoque vale mil reais.', source: 'ia' }) });
    check('resposta de verdade da IA continua valendo', r.say === 'O estoque vale mil reais.', r.say);
    const reports: unknown[] = [];
    r = await think('faz um cafe pra mim ai por favor agora', almox, { memory: m2, report: (e) => reports.push(e), agent: async () => ({ say: 'Não consigo fazer café.', source: 'ia', gaveUp: true }) });
    check('desistência sem palpite local: mostra a resposta e oferece ajuda', r.unknown === true && r.say === 'Não consigo fazer café.' && (r.chips?.length ?? 0) > 0, r);
    r = await think('xpto blablabla', almox, { memory: m2, report: (e) => reports.push(e) });
    check('pedido não entendido é avisado ao servidor', r.unknown === true && JSON.stringify(reports).includes('nao_entendeu'), reports);

    {
      const pressed: string[] = [];
      const hostF = { ...comprasF, press: (sel: string) => { pressed.push(sel); } };
      r = await think(hear('Lyco quem fornece botas?').command, hostF, { memory: m2 });
      check('quem fornece: acha pela categoria', /^Quem fornece botas é Botas Forte Comércio/.test(r.say), r.say);
      r = await think(hear('Lyco qual o telefone do fornecedor Malharia Bahia').command, hostF, { memory: m2 });
      await r.act?.();
      check('contato do fornecedor e corre até a linha dele', /Malharia Bahia: contato Rosa, telefone \(71\) 3333-4444/.test(r.say) && pressed.some((p) => p.includes('data-lyco-fornecedor="s1"')), [r.say, pressed]);
      r = await think(hear('Lyco quantos fornecedores temos?').command, hostF, { memory: m2 });
      check('contagem de fornecedores', /^Temos 2 fornecedores ativos\. 1 está sem telefone e sem e-mail\. 1 sem CNPJ\./.test(r.say), r.say);
      pressed.length = 0;
      r = await think(hear('Lyco, novo fornecedor Couros do Sul, CNPJ 11.222.333/0001-81, telefone 71 98888-7777').command, hostF, { memory: m2 });
      await r.act?.();
      const pf = supplierPrefill(hear('Lyco novo fornecedor malharia bahia ltda com cnpj 11.222.333/0001-81, telefone 71 98888-7777, que fornece fardamento').command);
      check('novo fornecedor: o que foi dito preenche o cadastro', pf.name === 'Malharia Bahia Ltda' && pf.cnpj === '11.222.333/0001-81' && pf.phone === '71 98888-7777' && pf.category === 'fardamento', pf);
      check('novo fornecedor: abre o cadastro pelo botão', /^Abrindo o cadastro de fornecedor com o que você disse/.test(r.say) && pressed.join(' ').includes('fornecedor-novo'), [r.say, pressed]);
    }

    {
      // conversa: ela pergunta o que faltou e a resposta curta completa o pedido
      const m3: LycoMemory = { last: null, lastInput: '', voiceOn: true, setVoice: () => undefined };
      const say = (t: string, h: LycoHost, raw?: string) => think(hear(t).command || t, h, { memory: m3, raw: raw ?? t });
      const pend = () => m3.pending ?? null;
      let c = await say('Lyco, entrada de 10 botas', almox);
      check('sem tamanho: pergunta qual', /^Encontrei mais de um: Bota de segurança 40/.test(c.say), c.say);
      c = await say('42', almox);
      check('"42" completa: entrada de 10 botas 42', /^Vou registrar: entrada de 10 unidades de Bota de segurança 42\. Confirma\?/.test(c.say) && pend()?.[0]?.body?.quantity === 10, c.say);
      c = await say('não', almox);
      check('"não" descarta', /não alterei nada/.test(c.say), c.say);
      c = await say('Lyco, saída de bota 40', almox);
      check('sem quantidade: pergunta quantas', /^Quantas unidades de Bota de segurança 40\?/.test(c.say), c.say);
      c = await say('cinco', almox);
      check('"cinco" completa: saída de 5', /^Vou registrar: saída de 5 unidades de Bota de segurança 40\./.test(c.say), c.say);
      m3.pending = null;
      c = await say('Lyco, redefinir a senha da Juliana', hub);
      check('sem a senha: pergunta', /^Qual a nova senha de Juliana Souza/.test(c.say), c.say);
      c = await say('Nova1234', hub, 'Nova1234');
      check('a senha dita depois completa (com maiúsculas)', /nova senha\. Confirma\?/.test(c.say) && pend()?.[0]?.body?.new_password === 'Nova1234', [c.say, pend()]);
      m3.pending = null;
      c = await say('Lyco, quanto tem de bota 42', almox);
      check('pergunta normal continua normal', /Bota de segurança, tamanho 42: 3 unidades/.test(c.say), c.say);
    }

    calls = 0;
    let went = '';
    const hubNav = { ...hub, navigate: (p: string) => { went = p; } };
    const sorry = async () => { calls++; return { say: 'Desculpe, não há um comando pronto para abrir o setor do almoxarifado. Posso ajudar com outra consulta ou ação?', source: 'ia' }; };
    r = await think(hear('Lyco abre o setor do almoxarifado, por favor.').command, hubNav, { memory: m2, agent: sorry });
    await r.act?.();
    check('abrir setor no painel master é local, mesmo com "por favor" (caso do print)', calls === 0 && r.say === 'Abrindo o setor Almoxarifado.' && went === '/setor/almoxarifado', [calls, r.say, went]);
    went = '';
    r = await think(hear('Lyco eu gostaria muito que você abrisse para mim agora o setor do almoxarifado').command, hubNav, { memory: m2, agent: sorry });
    await r.act?.();
    check('frase longa: comando de tela claro não passa pela IA', calls === 0 && went === '/setor/almoxarifado', [calls, r.say, went]);
    r = await think('como estao as coisas la no setor do almoxarifado hoje em dia', hubNav, { memory: m2, agent: sorry });
    check('pedido de desculpas da IA conta como desistência', r.unknown === true || !/^Desculpe/.test(r.say), r.say);

    const learned = [{ phrase: 'quanto dinheiro temos parado em material', route: 'Lyco, resumo do estoque' }, { phrase: 'me tira daqui agora mesmo', route: 'Lyco, sair' }, { phrase: 'quanto sobrou daquela bota 42', route: 'Lyco, quanto tem de bota 42?' }];
    calls = 0;
    const ag = async () => { calls++; return { say: 'IA', source: 'ia' }; };
    r = await think(hear('Lyco, pode me dizer quanto dinheiro temos parados em materiais?').command, almox, { memory: m2, learned, agent: ag });
    check('pedido já aprendido é atendido na hora, sem gastar a IA', calls === 0 && /^O estoque tem 11 itens/.test(r.say) && r.source === 'memoria', [calls, r.say, r.source]);
    r = await think('quanto dinheiro temos parado em viaturas', almox, { memory: m2, learned, agent: ag });
    check('pedido só parecido NÃO usa a memória (vai para a IA)', calls === 1 && r.say === 'IA', [calls, r.say]);
    calls = 0;
    r = await think('quanto sobrou daquela bota 44', almox, { memory: m2, learned, agent: ag });
    check('número diferente não reaproveita o aprendizado', !/Bota de segurança, tamanho 42/.test(r.say), r.say);
    let out = false;
    r = await think('me tira daqui agora mesmo', { ...almox, logout: () => { out = true; } }, { memory: m2, learned, agent: ag });
    r.afterSpeech?.();
    check('sair da conta nunca é disparado pela memória', !out && r.say === 'IA', [out, r.say]);
    calls = 0;
    r = await think('registre a saida de 5 bones', almox, { memory: m2, learned: [{ phrase: 'registre a saida de 5 bones', route: 'Lyco, resumo do estoque' }], agent: async () => { calls++; return { say: 'Vou registrar: saída. Confirma?', pending: [{ method: 'POST', path: '/api/almoxarifado/stock/move', what: 'saída' }], source: 'ia' }; } });
    check('pedido de alteração nunca é atalho da memória (a próprio Lyco prepara e pede confirmação)', m2.pending?.length === 1 && /^Vou registrar: saída de 5 unidades de Boné\. Confirma\?/.test(r.say), r.say);
    m2.pending = null;
    const bad: unknown[] = [];
    r = await think('quero uma coisa bem diferente do normal agora', almox, { memory: m2, report: (e) => bad.push(e), agent: async () => ({ route: 'Lyco, comando que não existe xyz', source: 'ia' }) });
    check('comando inventado pela IA é desaprendido', JSON.stringify(bad).includes('"good":false'), bad);
  }

  const show = async (host: LycoHost, p: string) => console.log(`\n> ${p}\n  ${(await think(hear(p).command, host, { memory: mem })).say}`);
  if (process.argv.includes('--show')) {
    await show(hub, 'Lyco quantos itens saíram do estoque do almoxarifado nas últimas 15 horas'); await show(almox, 'Lyco o que entrou no estoque ontem'); await show(almox, 'Lyco quantas botas saíram ontem'); await show(almox, 'Lyco quantas camisas saíram esta semana'); await show(almox, 'Lyco quantos coturnos saíram hoje'); await show(almox, 'Lyco métricas das últimas 15 horas'); await show(almox, 'Lyco o que saiu'); await show(almox, 'Lyco deslog da minha conta e me leve diretamente para a tela de login por favor');
    await show(hub, 'Lyco desejo baixar as métricas do financeiro'); await show(rh, 'Lyco quero baixar as métricas'); await show(hub, 'Lyco baixar métricas'); await show({ ...rh, user: user({ is_master: false, sector: 'rh' }) }, 'Lyco baixar as métricas do almoxarifado');
    await show(login, 'Lyco, apresente-se'); await show(login, 'Lyco, bom dia'); await show(login, 'Lyco boa noite'); await show(almox, 'Lyco, quanto tem de bota 42?');
    await show(almox, 'Lyco quantas botas temos'); await show(almox, 'Lyco, o que está com estoque baixo?'); await show(almox, 'Lyco, resumo do estoque'); await show(almox, 'Lyco tem solicitação nova?');
    await show(almox, 'Lyco qual foi a última solicitação'); await show(hub, 'Lyco, quantos usuários temos?'); await show(hub, 'Lyco em que setor está a Juliana'); await show(hub, 'Lyco novo usuário chamado Pedro Alves no financeiro');
    await show(rh, 'Lyco, desejo ver as métricas da última semana'); await show(almox, 'Lyco quem descobriu o Brasil'); await show(almox, 'Lyco, quantos postos temos?'); await show(almox, 'Lyco que horas são');
  }
  console.log(fail ? `\n${fail} falha(s) em ${CASES.length} frases` : `\nOK: ${CASES.length} frases`);
  process.exit(fail ? 1 : 0);
})();

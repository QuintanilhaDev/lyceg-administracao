# Lyceg Administração

Plataforma interna da **Lyceg** (segurança, Salvador – BA). Reúne em um só lugar os setores da empresa, com login único, permissões por setor e tela, tempo real entre os setores e o **Lyco**, o assistente virtual por voz e texto.

## Setores

| Setor | O que faz |
| --- | --- |
| **Painel master** | Visão geral dos setores, gestão (indicadores + PDF/Excel), usuários e permissões, auditoria, aprendizado do Lyco. |
| **Almoxarifado** | Estoque com categorias, entradas/saídas/ajustes, postos, solicitações dos supervisores (formulário público), notas fiscais, inventário, métricas. |
| **Frota** | Mapa 3D dos postos, painel (revisões e devoluções), veículos e ficha completa (contrato, KM mensal, revisões, despesas, multas, lavagens), alocação por arrastar e soltar, operação com CSV, localização dos postos. |
| **Compras** | Solicitações de compra do Almoxarifado, andamento até a entrega, fornecedores (cadastro e importação de planilha). |
| **RH** | Admissões com kit automático, colaboradores, troca anual de fardamento. |
| **Operacional** | Pedidos de material dos postos, validação e encaminhamento ao Almoxarifado. |
| **Financeiro / Comercial** | Notas e vencimentos; espaço do setor. |

## Lyco

Tubarão em 3D (three.js, carregado só quando precisa). Ao ouvir, vira de lado com a corneta no ouvido; ao avisar algo, pega o megafone. Os comandos são executados na hora.

- Entende o pedido do jeito que a pessoa fala ou escreve: abreviações ("vc", "qto", "kd"), fala do dia a dia ("tá", "pra", "cadê"), sinônimos ("viatura", "vtr") e erros de digitação/voz.
- Consulta e altera os dados de cada setor; toda alteração só é gravada depois do "sim".
- Na Frota, reconhece placas ditas inteiras, em pedaços ou letra por letra.
- IA opcional (qualquer serviço compatível com `chat/completions`) via `LYCO_LLM_*`; sem ela, funciona com as habilidades locais.

## Tecnologia

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres, Realtime, Storage) · three.js · framer-motion · Vercel.

## Banco de dados (Supabase)

No SQL Editor, rode nesta ordem:

1. `supabase/schema.sql`
2. `supabase/estoque.sql`
3. `supabase/baixa_e_usuarios.sql`
4. `supabase/plataforma.sql`
5. `supabase/categorias.sql`
6. `supabase/lyco_aprendizado.sql`
7. `supabase/compras.sql`
8. `supabase/pedidos_e_notas.sql`
9. `supabase/fornecedores.sql`
10. `supabase/frota.sql`

Todos podem ser rodados mais de uma vez. Crie também o bucket de Storage `anexos` (privado).

## Variáveis de ambiente

Veja `.env.example`. Obrigatórias: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

Testes do Lyco: `npm test`. Verificação de tipos: `npm run typecheck`.

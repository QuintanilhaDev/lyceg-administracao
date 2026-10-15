-- =====================================================================
--  LYCEG ADMINISTRAÇÃO · Frota (veículos, alocação nos postos, KM e operação)
--  Cole TODO este arquivo no SQL Editor do Supabase e clique em "Run".
--  Pode rodar mais de uma vez (é idempotente). Rode DEPOIS do estoque.sql:
--  os postos são os mesmos do Almoxarifado (ganham latitude e longitude).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Postos no mapa: coordenadas (os postos são compartilhados com o Almoxarifado)
-- ---------------------------------------------------------------------
alter table public.postos add column if not exists lat           double precision;
alter table public.postos add column if not exists lng           double precision;
alter table public.postos add column if not exists geo_precision text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'postos_lat_check') then
    alter table public.postos add constraint postos_lat_check check (lat is null or (lat between -90 and 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'postos_lng_check') then
    alter table public.postos add constraint postos_lng_check check (lng is null or (lng between -180 and 180));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Veículos
-- ---------------------------------------------------------------------
create table if not exists public.veiculos (
  id                  uuid primary key default gen_random_uuid(),
  placa               text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  tipo                text check (tipo in ('CARRO', 'MOTO')),
  modelo              text,
  empresa             text,
  numero_frota        text,
  situacao            text not null default 'Operando'
                      check (situacao in ('Operando', 'Em rota', 'Manutenção', 'Parado', 'Em devolução', 'Devolvido')),
  posto_id            uuid references public.postos (id) on delete set null,
  posto_planilha      text,
  supervisor          text,
  fornecedor          text,
  situacao_contrato   text,
  valor_locacao       numeric(12, 2),
  valor_contratado    numeric(12, 2),
  prazo_meses         int check (prazo_meses is null or prazo_meses between 0 and 600),
  data_recebimento    date,
  devolucao_prevista  date,
  km_entrega          int check (km_entrega is null or km_entrega >= 0),
  km_atual            int check (km_atual is null or km_atual >= 0),
  km_contratado       int check (km_contratado is null or km_contratado >= 0),
  km_locadora         int check (km_locadora is null or km_locadora >= 0),
  custo_por           text,
  status_combustivel  text,
  rastreador          text,
  tag                 boolean,
  seguro              boolean,
  data_plotagem       date,
  obs                 text,
  updated_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists veiculos_posto_idx    on public.veiculos (posto_id);
create index if not exists veiculos_situacao_idx on public.veiculos (situacao);

-- ---------------------------------------------------------------------
-- 3) Quilometragem mensal (um registro por veículo e mês)
-- ---------------------------------------------------------------------
create table if not exists public.frota_km (
  id              uuid primary key default gen_random_uuid(),
  veiculo_id      uuid not null references public.veiculos (id) on delete cascade,
  mes             date not null check (extract(day from mes) = 1),
  km1             int check (km1 is null or km1 >= 0),
  km2             int check (km2 is null or km2 >= 0),
  km3             int check (km3 is null or km3 >= 0),
  km4             int check (km4 is null or km4 >= 0),
  km_total        int check (km_total is null or km_total >= 0),
  comb_cartao     numeric(12, 2),
  posto_planilha  text,
  supervisor      text,
  created_at      timestamptz not null default now(),
  unique (veiculo_id, mes)
);

-- ---------------------------------------------------------------------
-- 4) Operação: despesas, multas, revisões e lavagens (ligadas pela placa)
-- ---------------------------------------------------------------------
create table if not exists public.frota_despesas (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  empresa     text,
  tipo        text,
  placa       text,
  prestador   text,
  cliente     text,
  servico     text,
  valor       numeric(12, 2) not null,
  obs         text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create table if not exists public.frota_multas (
  id          uuid primary key default gen_random_uuid(),
  data_hora   timestamptz not null,
  tipo        text,
  ait         text,
  placa       text not null,
  locadora    text,
  condutor    text,
  local       text,
  municipio   text,
  valor       numeric(12, 2) not null,
  infracao    text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create table if not exists public.frota_revisoes (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  placa       text not null,
  tipo        text,
  servico     text,
  ultima_rev  int,
  prox_rev    int,
  descricao   text,
  item1       text,
  valor1      numeric(12, 2),
  item2       text,
  valor2      numeric(12, 2),
  item3       text,
  valor3      numeric(12, 2),
  custo_total numeric(12, 2),
  obs         text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create table if not exists public.frota_lavagens (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  mes         date,
  placa       text not null,
  posto       text,
  vtr         text,
  valor       numeric(12, 2) not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists frota_despesas_placa_idx on public.frota_despesas (placa);
create index if not exists frota_multas_placa_idx   on public.frota_multas (placa);
create index if not exists frota_revisoes_placa_idx on public.frota_revisoes (placa);
create index if not exists frota_lavagens_placa_idx on public.frota_lavagens (placa);
create index if not exists frota_km_veiculo_idx     on public.frota_km (veiculo_id);

-- ---------------------------------------------------------------------
-- 5) Segurança: RLS ligado e SEM políticas públicas (só o servidor acessa)
-- ---------------------------------------------------------------------
alter table public.veiculos       enable row level security;
alter table public.frota_km       enable row level security;
alter table public.frota_despesas enable row level security;
alter table public.frota_multas   enable row level security;
alter table public.frota_revisoes enable row level security;
alter table public.frota_lavagens enable row level security;

grant all on public.veiculos, public.frota_km, public.frota_despesas, public.frota_multas, public.frota_revisoes, public.frota_lavagens to service_role;

notify pgrst, 'reload schema';

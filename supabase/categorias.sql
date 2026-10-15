-- =====================================================================
--  LYCEG · Categorias dos itens do estoque
--  Um item pode ter MAIS DE UMA categoria (ex.: "Acessório" e "Fardamento").
--  Pode rodar mais de uma vez. Não altera saldo, mínimo, custo nem histórico.
-- =====================================================================

alter table public.stock_items add column if not exists categories text[] not null default '{}';
create index if not exists stock_items_categories_idx on public.stock_items using gin (categories);
comment on column public.stock_items.categories is 'Categorias do item (pode ter várias): EPI, Fardamento, Acessório…';

notify pgrst, 'reload schema';

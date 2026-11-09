-- V.I.T.A.L — Stefanini: check-in semanal (um registro por semana e a lista ordenada de itens).
-- Migração SOMENTE ADITIVA: cria duas tabelas novas no schema stefanini. Nenhuma tabela,
-- coluna, restrição ou registro existente é removido ou alterado. As tabelas nascem vazias.
--
-- Cada item tem a seção ("Semana Passada", "Essa Semana" ou "Pedido de Ajuda"), o cliente
-- (opcional: uma conta do CRM OU um rótulo livre, nunca os dois) e o texto das atividades.
--   - check-in excluído (ação explícita, com confirmação no painel): os itens dele vão junto;
--   - conta excluída: o item fica sem a conta (on delete set null). Antes de excluir a conta,
--     o painel troca o vínculo pelo nome dela como rótulo, para o histórico não perder o cliente.

create table if not exists stefanini.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Data de referência da semana (aparece no PDF como DD/MM/AAAA).
  semana date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stefanini.checkin_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checkin_id uuid not null references stefanini.checkins (id) on delete cascade,
  secao text not null check (secao in ('Semana Passada', 'Essa Semana', 'Pedido de Ajuda')),
  ordem int not null default 0 check (ordem between 0 and 10000),
  conta_id uuid references stefanini.contas (id) on delete set null,
  cliente_rotulo text check (length(cliente_rotulo) between 1 and 120),
  atividades text not null check (length(atividades) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkin_itens_um_cliente check (conta_id is null or cliente_rotulo is null)
);

create index if not exists checkins_user_id_idx on stefanini.checkins (user_id, semana);
create index if not exists checkin_itens_user_id_idx on stefanini.checkin_itens (user_id);
create index if not exists checkin_itens_checkin_id_idx on stefanini.checkin_itens (checkin_id, ordem);
create index if not exists checkin_itens_conta_id_idx on stefanini.checkin_itens (conta_id);

do $$
declare t text;
begin
  foreach t in array array['checkins', 'checkin_itens'] loop
    execute format('create trigger tocar_updated_at before update on stefanini.%I for each row execute function stefanini.tocar_updated_at()', t);
    execute format('alter table stefanini.%I enable row level security', t);
    execute format($p$create policy "dono lê" on stefanini.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on stefanini.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on stefanini.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on stefanini.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant select, insert, update, delete on stefanini.checkins, stefanini.checkin_itens to authenticated;
revoke all on stefanini.checkins, stefanini.checkin_itens from anon;

alter publication supabase_realtime add table stefanini.checkins, stefanini.checkin_itens;

notify pgrst, 'reload schema';

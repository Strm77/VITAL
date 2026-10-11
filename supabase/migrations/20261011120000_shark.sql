-- V.I.T.A.L — schema "shark": clientes de design, frentes de trabalho, calendários de eventos,
-- artes (tarefas) e recebimentos. Recebimentos entram como ganho no Financeiro (no app).
create schema if not exists shark;

create table shark.clientes (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  cor int not null default 1 check (cor between 1 and 8),
  valor_mensal numeric(12, 2) check (valor_mensal > 0),
  dia_pagamento int check (dia_pagamento between 1 and 31),
  inicio_cobranca text check (inicio_cobranca ~ '^\d{4}-\d{2}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Frente de trabalho de um cliente: um pacote de N artes ou artes por etapa de um calendário.
create table shark.frentes (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id text not null references shark.clientes (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  tipo text not null check (tipo in ('pacote', 'etapas')),
  meta_artes int check (meta_artes between 1 and 100000),
  prazo date,
  calendario text check (length(calendario) <= 40),
  inicio date,
  modelo jsonb not null default '[]'::jsonb,
  valor_por_etapa numeric(12, 2) check (valor_por_etapa > 0),
  criado_em timestamptz not null default now()
);

create table shark.eventos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  calendario text not null check (length(calendario) between 1 and 40),
  nome text not null check (length(nome) between 1 and 80),
  data date not null,
  local text check (length(local) <= 80),
  criado_em timestamptz not null default now()
);

create table shark.tarefas (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  frente_id text not null references shark.frentes (id) on delete cascade,
  evento_id text references shark.eventos (id) on delete cascade,
  item text check (length(item) <= 120),
  nome text not null check (length(nome) between 1 and 120),
  prazo date,
  quantidade int not null default 1 check (quantidade between 1 and 1000),
  status text not null default 'a_fazer' check (status in ('a_fazer', 'entregue')),
  entregue_em date,
  extra boolean not null default false,
  criado_em timestamptz not null default now()
);

create table shark.recebimentos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id text not null references shark.clientes (id) on delete cascade,
  descricao text not null check (length(descricao) between 1 and 120),
  valor numeric(12, 2) not null check (valor > 0),
  vencimento date not null,
  recebido_em date,
  referencia text check (length(referencia) <= 120),
  ignorado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index on shark.clientes (usuario_id);
create index on shark.frentes (usuario_id);
create index on shark.frentes (cliente_id);
create index on shark.eventos (usuario_id, calendario, data);
create index on shark.tarefas (usuario_id);
create index on shark.tarefas (frente_id);
create index on shark.tarefas (evento_id);
create index on shark.recebimentos (usuario_id, vencimento);
create index on shark.recebimentos (cliente_id);

do $$
declare t text;
begin
  foreach t in array array['clientes', 'frentes', 'eventos', 'tarefas', 'recebimentos'] loop
    execute format('alter table shark.%I enable row level security', t);
    execute format($p$create policy "dono lê" on shark.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on shark.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on shark.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on shark.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant usage on schema shark to authenticated;
grant select, insert, update, delete on all tables in schema shark to authenticated;
revoke all on schema shark from anon;
alter publication supabase_realtime add table shark.clientes, shark.frentes, shark.eventos, shark.tarefas, shark.recebimentos;

-- Expõe o schema na API junto com os outros
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro, estudos, saude, shark';
notify pgrst, 'reload config';

-- V.I.T.A.L — schema "estudos": planos de estudo, tópicos (por matéria) e sessões de estudo.
create schema if not exists estudos;

create table estudos.planos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tema text not null check (length(tema) between 1 and 80),
  objetivo text check (length(objetivo) <= 300),
  data_inicio date not null default current_date,
  data_fim date,
  meta_horas numeric(7, 1) check (meta_horas > 0),
  meta_semanal_horas numeric(5, 1) check (meta_semanal_horas > 0),
  criado_em timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio)
);

create table estudos.topicos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plano_id text not null references estudos.planos (id) on delete cascade,
  materia text check (length(materia) <= 60),
  nome text not null check (length(nome) between 1 and 120),
  ordem int not null default 0,
  concluido boolean not null default false,
  concluido_em timestamptz,
  criado_em timestamptz not null default now()
);

create table estudos.sessoes (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plano_id text not null references estudos.planos (id) on delete cascade,
  topico_id text references estudos.topicos (id) on delete set null,
  data date not null,
  minutos int not null check (minutos between 1 and 1440),
  nota text check (length(nota) <= 200),
  criado_em timestamptz not null default now()
);

create index on estudos.planos (usuario_id);
create index on estudos.topicos (usuario_id);
create index on estudos.topicos (plano_id, ordem);
create index on estudos.sessoes (usuario_id);
create index on estudos.sessoes (plano_id, data);
create index on estudos.sessoes (topico_id);

do $$
declare t text;
begin
  foreach t in array array['planos', 'topicos', 'sessoes'] loop
    execute format('alter table estudos.%I enable row level security', t);
    execute format($p$create policy "dono lê" on estudos.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on estudos.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on estudos.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on estudos.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant usage on schema estudos to authenticated;
grant select, insert, update, delete on all tables in schema estudos to authenticated;
revoke all on schema estudos from anon;
alter publication supabase_realtime add table estudos.planos, estudos.topicos, estudos.sessoes;

-- Expõe o schema na API junto com o financeiro
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro, estudos';
notify pgrst, 'reload config';

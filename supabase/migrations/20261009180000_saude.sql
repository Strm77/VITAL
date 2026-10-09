-- V.I.T.A.L — schema "saude": registros de acertos e erros (alimentação e exercício) e metas.
create schema if not exists saude;

create table saude.registros (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('alimentacao', 'exercicio')),
  resultado text not null check (resultado in ('acerto', 'erro')),
  descricao text not null check (length(descricao) between 1 and 120),
  refeicao text check (refeicao in ('cafe', 'almoco', 'lanche', 'jantar', 'ceia', 'fora')),
  minutos int check (minutos between 1 and 1440),
  intensidade text check (intensidade in ('leve', 'moderada', 'intensa')),
  nota text check (length(nota) <= 200),
  criado_em timestamptz not null default now()
);

-- Metas da área (uma linha por usuário).
create table saude.objetivos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() unique references auth.users (id) on delete cascade,
  treinos_semana int not null default 3 check (treinos_semana between 1 and 14),
  minutos_semana int not null default 150 check (minutos_semana between 10 and 3000),
  acerto_alimentacao int not null default 80 check (acerto_alimentacao between 10 and 100),
  criado_em timestamptz not null default now()
);

create index on saude.registros (usuario_id, data);

do $$
declare t text;
begin
  foreach t in array array['registros', 'objetivos'] loop
    execute format('alter table saude.%I enable row level security', t);
    execute format($p$create policy "dono lê" on saude.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on saude.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on saude.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on saude.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant usage on schema saude to authenticated;
grant select, insert, update, delete on all tables in schema saude to authenticated;
revoke all on schema saude from anon;
alter publication supabase_realtime add table saude.registros, saude.objetivos;

-- Expõe o schema na API junto com financeiro e estudos
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro, estudos, saude';
notify pgrst, 'reload config';

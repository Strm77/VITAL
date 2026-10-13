-- V.I.T.A.L — schema "vida": visão geral (check-in, prioridades, roda da vida),
-- bem-estar (sono, água, humor) e rotina (hábitos, compromissos, tarefas, projetos, tempo).
create schema if not exists vida;

-- Um registro por dia: humor, energia, estresse, sono e água.
create table vida.checkins (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  humor int check (humor between 1 and 5),
  energia int check (energia between 1 and 5),
  estresse int check (estresse between 1 and 5),
  sono_horas numeric(3, 1) check (sono_horas between 0 and 24),
  sono_qualidade int check (sono_qualidade between 1 and 5),
  agua_copos int check (agua_copos between 0 and 40),
  nota text check (length(nota) <= 300),
  criado_em timestamptz not null default now(),
  unique (usuario_id, data)
);

create table vida.prioridades (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semana date not null,
  ordem int not null check (ordem between 1 and 3),
  texto text not null check (length(texto) between 1 and 120),
  feita boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Roda da vida: nota de 0 a 10 por área, uma vez por mês.
create table vida.satisfacao (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  area text not null check (length(area) between 1 and 30),
  nota int not null check (nota between 0 and 10),
  criado_em timestamptz not null default now()
);

create table vida.habitos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  icone text check (length(icone) <= 8),
  area text check (length(area) <= 30),
  vezes_semana int not null default 7 check (vezes_semana between 1 and 7),
  autocuidado boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table vida.habitos_feitos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habito_id text not null references vida.habitos (id) on delete cascade,
  data date not null,
  criado_em timestamptz not null default now()
);

-- Compromissos, consultas e exames (com repetição para cuidados preventivos).
create table vida.compromissos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 100),
  data date not null,
  hora text check (hora ~ '^\d{2}:\d{2}$'),
  tipo text not null default 'compromisso' check (tipo in ('compromisso', 'consulta', 'exame')),
  local text check (length(local) <= 100),
  nota text check (length(nota) <= 300),
  feito boolean not null default false,
  recorrencia_meses int check (recorrencia_meses between 1 and 60),
  criado_em timestamptz not null default now()
);

create table vida.projetos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 80),
  objetivo text check (length(objetivo) <= 300),
  prazo date,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'concluido')),
  area text check (length(area) <= 30),
  criado_em timestamptz not null default now()
);

create table vida.afazeres (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 140),
  prazo date,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  projeto_id text references vida.projetos (id) on delete set null,
  feito_em date,
  criado_em timestamptz not null default now()
);

-- Tempo dedicado a cada área da vida (além do que já vem de Estudos e Saúde).
create table vida.blocos_tempo (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  area text not null check (length(area) between 1 and 30),
  minutos int not null check (minutos between 1 and 1440),
  descricao text check (length(descricao) <= 120),
  criado_em timestamptz not null default now()
);

create index on vida.checkins (usuario_id, data);
create index on vida.prioridades (usuario_id, semana);
create index on vida.satisfacao (usuario_id, mes);
create index on vida.habitos (usuario_id);
create index on vida.habitos_feitos (usuario_id, data);
create index on vida.habitos_feitos (habito_id);
create index on vida.compromissos (usuario_id, data);
create index on vida.projetos (usuario_id);
create index on vida.afazeres (usuario_id);
create index on vida.afazeres (projeto_id);
create index on vida.blocos_tempo (usuario_id, data);

do $$
declare t text;
begin
  foreach t in array array['checkins', 'prioridades', 'satisfacao', 'habitos', 'habitos_feitos', 'compromissos', 'projetos', 'afazeres', 'blocos_tempo'] loop
    execute format('alter table vida.%I enable row level security', t);
    execute format($p$create policy "dono lê" on vida.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on vida.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on vida.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on vida.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant usage on schema vida to authenticated;
grant select, insert, update, delete on all tables in schema vida to authenticated;
revoke all on schema vida from anon;
alter publication supabase_realtime add table vida.checkins, vida.prioridades, vida.satisfacao, vida.habitos,
  vida.habitos_feitos, vida.compromissos, vida.projetos, vida.afazeres, vida.blocos_tempo;

-- Metas de água e sono junto com as outras metas de saúde
alter table saude.objetivos
  add column meta_agua int not null default 8 check (meta_agua between 1 and 30),
  add column meta_sono numeric(3, 1) not null default 8 check (meta_sono between 4 and 12);

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro, estudos, saude, shark, vida';
notify pgrst, 'reload config';

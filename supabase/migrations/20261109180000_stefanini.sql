-- V.I.T.A.L — schema "stefanini": CRM de vendas (contas, contatos, oportunidades, reuniões,
-- atividades e meta anual).
-- Migração SOMENTE ADITIVA: cria um schema novo e tabelas novas. Nenhuma tabela, coluna,
-- restrição ou registro existente é removido ou alterado (shark.materiais e as demais ficam
-- como estão). As tabelas nascem vazias: os dados entram pela interface.
--
-- Exclusões feitas pelo usuário no painel:
--   - conta excluída: contatos, reuniões e atividades dela ficam sem conta (on delete set null);
--     oportunidades exigem conta, então o banco recusa excluir conta que ainda tem oportunidade
--     (on delete restrict) — o painel avisa antes;
--   - contato excluído: a oportunidade fica sem contato (on delete set null).

create schema if not exists stefanini;

-- updated_at sempre com a hora da última alteração.
create or replace function stefanini.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists stefanini.contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  segmento text check (length(segmento) <= 80),
  status text not null default 'Prospect / Potencial' check (status in (
    'Prospect / Potencial', 'Bloqueado', 'Inativo', 'Adormecido', 'Em implantação',
    'Em negociação', 'Em renovação', 'Em risco', 'Em Manutenção', 'Em Expansão',
    'Perdido / Churn', 'Ativo/Saudável')),
  contrato_stf boolean not null default false,
  contrato_sda boolean not null default false,
  consultor text check (length(consultor) <= 80),
  relacionamento_desde date,
  notas text check (length(notas) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stefanini.contatos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid references stefanini.contas (id) on delete set null,
  nome text not null check (length(nome) between 1 and 120),
  cargo text check (length(cargo) <= 80),
  email text check (length(email) <= 200),
  telefone text check (length(telefone) <= 40),
  temperatura text check (temperatura in (
    'Prospect', 'Contato Frio', 'Contato Morno', 'Contato Quente', 'Quase amigos', 'Amigos')),
  notas text check (length(notas) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stefanini.oportunidades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid not null references stefanini.contas (id) on delete restrict,
  contato_id uuid references stefanini.contatos (id) on delete set null,
  nome text not null check (length(nome) between 1 and 120),
  estagio text not null default 'Identifying Opportunity' check (estagio in (
    'Identifying Opportunity', 'Qualification Opportunity', 'Solution Design', 'Pricing / Proposal',
    'POC', 'Proposal Approval', 'With Customer', 'Win', 'Lose')),
  valor_estimado numeric(14, 2) check (valor_estimado >= 0),
  -- Data em que virou Win/Lose: é por ela que o "Realizado" do painel entra no ano certo.
  fechada_em date,
  notas text check (length(notas) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stefanini.reunioes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid references stefanini.contas (id) on delete set null,
  data date not null,
  titulo text not null check (length(titulo) between 1 and 160),
  anotacoes text check (length(anotacoes) <= 20000),
  created_at timestamptz not null default now()
);

create table if not exists stefanini.atividades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conta_id uuid references stefanini.contas (id) on delete set null,
  descricao text not null check (length(descricao) between 1 and 300),
  data date,
  feita boolean not null default false,
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists stefanini.metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ano int not null check (ano between 2000 and 2100),
  valor_meta numeric(14, 2) not null check (valor_meta >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ano)
);

create index if not exists contas_user_id_idx on stefanini.contas (user_id);
create index if not exists contatos_user_id_idx on stefanini.contatos (user_id);
create index if not exists contatos_conta_id_idx on stefanini.contatos (conta_id);
create index if not exists oportunidades_user_id_idx on stefanini.oportunidades (user_id);
create index if not exists oportunidades_conta_id_idx on stefanini.oportunidades (conta_id);
create index if not exists oportunidades_contato_id_idx on stefanini.oportunidades (contato_id);
create index if not exists reunioes_user_id_idx on stefanini.reunioes (user_id, data);
create index if not exists reunioes_conta_id_idx on stefanini.reunioes (conta_id);
create index if not exists atividades_user_id_idx on stefanini.atividades (user_id);
create index if not exists atividades_conta_id_idx on stefanini.atividades (conta_id);

do $$
declare t text;
begin
  foreach t in array array['contas', 'contatos', 'oportunidades', 'metas'] loop
    execute format('create trigger tocar_updated_at before update on stefanini.%I for each row execute function stefanini.tocar_updated_at()', t);
  end loop;
  foreach t in array array['contas', 'contatos', 'oportunidades', 'reunioes', 'atividades', 'metas'] loop
    execute format('alter table stefanini.%I enable row level security', t);
    execute format($p$create policy "dono lê" on stefanini.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on stefanini.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on stefanini.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on stefanini.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant usage on schema stefanini to authenticated;
grant select, insert, update, delete on all tables in schema stefanini to authenticated;
revoke all on schema stefanini from anon;
revoke all on all tables in schema stefanini from anon;
revoke execute on function stefanini.tocar_updated_at() from public, anon, authenticated;

alter publication supabase_realtime add table stefanini.contas, stefanini.contatos,
  stefanini.oportunidades, stefanini.reunioes, stefanini.atividades, stefanini.metas;

-- Expõe o schema na API junto com os outros (mantém todos os que já estavam).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro, estudos, saude, shark, vida, stefanini';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

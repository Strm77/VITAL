-- V.I.T.A.L — schema "financeiro".
-- Cada linha pertence a um usuário (usuario_id = auth.uid()) e o RLS garante que
-- ninguém lê nem altera dados de outra pessoa.
-- Os ids são texto para aceitar ids gerados no navegador (ex.: "fatura-<id>").

create schema if not exists financeiro;

create or replace function financeiro.novo_id() returns text
language sql volatile set search_path = '' as $$ select gen_random_uuid()::text $$;

-- Dívidas parceladas (financiamentos, empréstimos...)
create table financeiro.dividas (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  valor_parcela numeric(12, 2) not null check (valor_parcela > 0),
  total_parcelas int not null check (total_parcelas between 1 and 600),
  primeira_parcela text not null check (primeira_parcela ~ '^\d{4}-\d{2}$'),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  parcelas_pagas int check (parcelas_pagas >= 0),
  criado_em timestamptz not null default now()
);

-- Ganhos e gastos do mês (recorrente = entra todo mês a partir de "mes")
create table financeiro.ganhos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  valor numeric(12, 2) not null check (valor >= 0),
  recorrente boolean not null default false,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  criado_em timestamptz not null default now()
);

create table financeiro.gastos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  valor numeric(12, 2) not null check (valor >= 0),
  recorrente boolean not null default false,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  criado_em timestamptz not null default now()
);

create table financeiro.investimentos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  valor_aplicado numeric(14, 2) not null check (valor_aplicado >= 0),
  valor_atual numeric(14, 2) not null check (valor_atual >= 0),
  meta numeric(14, 2) check (meta >= 0),
  criado_em timestamptz not null default now()
);

-- Cartões de crédito, faturas e os lançamentos de cada fatura
create table financeiro.cartoes (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  final text check (final ~ '^\d{0,4}$'),
  criado_em timestamptz not null default now()
);

create table financeiro.faturas (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cartao_id text not null references financeiro.cartoes (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  vencimento date,
  arquivo text,
  importado_em timestamptz not null default now(),
  sem_conta boolean not null default false,
  unique (cartao_id, mes)
);

create table financeiro.lancamentos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fatura_id text not null references financeiro.faturas (id) on delete cascade,
  ordem int not null default 0,
  data date,
  descricao text not null,
  valor numeric(12, 2) not null,
  categoria text not null default 'Outros',
  final_cartao text
);

-- Controle de pagamentos (contas do mês; faturas de cartão entram com origem = 'fatura')
create table financeiro.pagamentos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 120),
  valor numeric(12, 2) not null check (valor >= 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  pago_em timestamptz,
  origem text check (origem in ('fatura')),
  fatura_id text references financeiro.faturas (id) on delete set null,
  valor_fatura numeric(12, 2),
  valor_editado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Índices para as consultas do painel (por usuário e pelas chaves estrangeiras)
create index on financeiro.dividas (usuario_id);
create index on financeiro.ganhos (usuario_id);
create index on financeiro.gastos (usuario_id);
create index on financeiro.investimentos (usuario_id);
create index on financeiro.cartoes (usuario_id);
create index on financeiro.faturas (usuario_id);
create index on financeiro.lancamentos (usuario_id);
create index on financeiro.lancamentos (fatura_id, ordem);
create index on financeiro.pagamentos (usuario_id, vencimento);
create index on financeiro.pagamentos (fatura_id);

-- RLS: cada usuário só enxerga e altera as próprias linhas
do $$
declare t text;
begin
  foreach t in array array['dividas', 'ganhos', 'gastos', 'investimentos', 'cartoes', 'faturas', 'lancamentos', 'pagamentos'] loop
    execute format('alter table financeiro.%I enable row level security', t);
    execute format($p$create policy "dono lê" on financeiro.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on financeiro.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on financeiro.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on financeiro.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Acesso pela API só para quem está logado
grant usage on schema financeiro to authenticated;
grant select, insert, update, delete on all tables in schema financeiro to authenticated;
revoke all on schema financeiro from anon;
revoke execute on function financeiro.novo_id() from public, anon;
grant execute on function financeiro.novo_id() to authenticated;

-- Tempo real: o painel recebe as mudanças na hora
alter publication supabase_realtime add table
  financeiro.dividas, financeiro.ganhos, financeiro.gastos, financeiro.investimentos,
  financeiro.cartoes, financeiro.faturas, financeiro.lancamentos, financeiro.pagamentos;

-- Só o dono do painel pode criar conta: qualquer outro cadastro é recusado.
create table if not exists financeiro.emails_permitidos (email text primary key);
alter table financeiro.emails_permitidos enable row level security; -- sem políticas: ninguém lê pela API
revoke all on financeiro.emails_permitidos from anon, authenticated;
-- insert into financeiro.emails_permitidos (email) values ('seu-email@exemplo.com');

create or replace function financeiro.bloquear_cadastro_nao_permitido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (select 1 from financeiro.emails_permitidos p where lower(p.email) = lower(new.email)) then
    raise exception 'Cadastro não permitido para este e-mail.';
  end if;
  return new;
end $fn$;
revoke execute on function financeiro.bloquear_cadastro_nao_permitido() from public, anon, authenticated;

create trigger somente_emails_permitidos
  before insert on auth.users
  for each row execute function financeiro.bloquear_cadastro_nao_permitido();

-- Expõe o schema na API (equivale a Settings → API → Exposed schemas no painel do Supabase)
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, financeiro';
notify pgrst, 'reload config';

-- Total oficial da fatura (lido do PDF ou digitado). Quando vazio, o painel soma os lançamentos.
alter table financeiro.faturas add column if not exists total_informado numeric(12, 2);

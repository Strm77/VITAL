-- V.I.T.A.L — Life Game (evolução da área Rotina) e Listas (compras, desejos, coisas a fazer,
-- melhorias de vida). Migração SOMENTE ADITIVA: cria cinco tabelas novas no schema vida.
-- Nenhuma tabela, coluna, restrição ou registro existente é removido ou alterado.
-- As tabelas do jogo nascem vazias: hábitos, tarefas e checks entram só pela interface
-- (nada pré-definido, nada marcado como feito).
--
-- Life Game:
--   jogo_habitos  — checklist da vida diária; cada hábito pode ser checado até "vezes_dia" vezes
--                   por dia e cada check vale "xp" pontos (tudo configurável).
--   jogo_tarefas  — coisas a fazer; concluir vale "xp" pontos.
--   jogo_checks   — um registro por check (o XP fica guardado no próprio check: mudar o valor
--                   de um hábito depois não reescreve o que já foi ganho). Excluir um hábito ou
--                   uma tarefa não apaga os checks (o vínculo vira null e o nome fica em "descricao").
--   jogo_personagem — configuração do personagem (o robozinho da Visão geral): de quantos em
--                   quantos níveis ele ganha uma peça de equipamento. Começa vazio (sem regra
--                   fixa): enquanto não for definido, o robô fica sem armadura.
-- Listas:
--   lista_itens   — item, categoria, área/ambiente, observações e data (opcionais) e concluido_em.

create table if not exists vida.jogo_habitos (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (length(nome) between 1 and 60),
  vezes_dia int not null default 1 check (vezes_dia between 1 and 20),
  xp int not null default 10 check (xp between 1 and 1000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists vida.jogo_tarefas (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 140),
  xp int not null default 10 check (xp between 1 and 1000),
  feita_em date,
  criado_em timestamptz not null default now()
);

create table if not exists vida.jogo_checks (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habito_id text references vida.jogo_habitos (id) on delete set null,
  tarefa_id text references vida.jogo_tarefas (id) on delete set null,
  data date not null,
  xp int not null check (xp between 0 and 1000),
  descricao text check (length(descricao) <= 140),
  criado_em timestamptz not null default now()
);

create table if not exists vida.jogo_personagem (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  niveis_por_estagio int check (niveis_por_estagio between 1 and 100),
  criado_em timestamptz not null default now()
);

create table if not exists vida.lista_itens (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item text not null check (length(item) between 1 and 200),
  categoria text not null check (length(categoria) between 1 and 40),
  area text check (length(area) between 1 and 60),
  observacoes text check (length(observacoes) <= 1000),
  data_item date,
  concluido_em date,
  criado_em timestamptz not null default now()
);

create index if not exists jogo_habitos_usuario_idx on vida.jogo_habitos (usuario_id);
create index if not exists jogo_tarefas_usuario_idx on vida.jogo_tarefas (usuario_id);
create index if not exists jogo_checks_usuario_data_idx on vida.jogo_checks (usuario_id, data);
create index if not exists jogo_checks_habito_idx on vida.jogo_checks (habito_id);
create index if not exists jogo_checks_tarefa_idx on vida.jogo_checks (tarefa_id);
create index if not exists jogo_personagem_usuario_idx on vida.jogo_personagem (usuario_id);
create index if not exists lista_itens_usuario_idx on vida.lista_itens (usuario_id, categoria);

do $$
declare t text;
begin
  foreach t in array array['jogo_habitos', 'jogo_tarefas', 'jogo_checks', 'jogo_personagem', 'lista_itens'] loop
    execute format('alter table vida.%I enable row level security', t);
    execute format($p$create policy "dono lê" on vida.%I for select to authenticated using (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono cria" on vida.%I for insert to authenticated with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono altera" on vida.%I for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "dono apaga" on vida.%I for delete to authenticated using (usuario_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

grant select, insert, update, delete on vida.jogo_habitos, vida.jogo_tarefas, vida.jogo_checks, vida.jogo_personagem, vida.lista_itens to authenticated;
revoke all on vida.jogo_habitos, vida.jogo_tarefas, vida.jogo_checks, vida.jogo_personagem, vida.lista_itens from anon;

alter publication supabase_realtime add table vida.jogo_habitos, vida.jogo_tarefas, vida.jogo_checks, vida.jogo_personagem, vida.lista_itens;

notify pgrst, 'reload schema';

-- V.I.T.A.L — SHARK: lista de materiais (links) por cliente e por frente de trabalho.
-- Migração SOMENTE ADITIVA: cria uma tabela nova. Nenhuma tabela, coluna, restrição ou
-- registro existente é removido ou alterado.
--
-- Um material pertence a um cliente e, opcionalmente, a uma frente desse cliente.
--   - frente_id vazio = material geral do cliente;
--   - se a frente for excluída, o material NÃO é apagado: volta a ser geral do cliente
--     (on delete set null);
--   - se o cliente for excluído (ação explícita, com confirmação no painel), os materiais
--     dele vão junto, como já acontece com frentes, artes e recebimentos.

create table if not exists shark.materiais (
  id text primary key default financeiro.novo_id(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id text not null references shark.clientes (id) on delete cascade,
  frente_id text references shark.frentes (id) on delete set null,
  rotulo text not null check (length(rotulo) between 1 and 80),
  url text not null check (length(url) <= 2000 and url ~* '^https?://'),
  criado_em timestamptz not null default now()
);

create index if not exists materiais_usuario_id_idx on shark.materiais (usuario_id);
create index if not exists materiais_cliente_id_idx on shark.materiais (cliente_id);
create index if not exists materiais_frente_id_idx on shark.materiais (frente_id);

alter table shark.materiais enable row level security;
create policy "dono lê" on shark.materiais for select to authenticated using (usuario_id = (select auth.uid()));
create policy "dono cria" on shark.materiais for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "dono altera" on shark.materiais for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "dono apaga" on shark.materiais for delete to authenticated using (usuario_id = (select auth.uid()));

grant select, insert, update, delete on shark.materiais to authenticated;
revoke all on shark.materiais from anon;
alter publication supabase_realtime add table shark.materiais;

notify pgrst, 'reload schema';

-- V.I.T.A.L — V2-08: histórico de origem e mudanças das contas do Controle de pagamentos.
-- PROPOSTA — ainda NÃO aplicada. Somente aditiva: cria uma tabela nova, só de inserção.
--   * Não altera nem lê nenhuma tabela existente; não faz backfill, UPDATE ou DELETE.
--   * O histórico começa a partir desta versão: nenhum evento antigo é inventado.
--   * Cada evento é uma linha nova (append-only). O app só faz INSERT e SELECT, então
--     gravar uma conta, reimportar uma fatura ou editar nunca apaga eventos anteriores.
--   * conta_id e fatura_id sem chave estrangeira: excluir uma conta ou uma fatura não
--     apaga (nem altera) o histórico dela.
--   * Nenhuma chave estrangeira e nenhuma cascata: não muda a exclusão de usuários do Auth.
--
-- Retenção: os eventos ficam guardados indefinidamente. Se um usuário do Auth for excluído, os
-- eventos dele continuam na tabela, órfãos e inacessíveis pela API (o RLS só mostra linhas com
-- usuario_id = auth.uid()). Apagar eventos órfãos, se um dia for preciso, é decisão manual do
-- administrador do banco, fora do app.

create table if not exists financeiro.historico_contas (
  -- O app gera o id do evento: reenviar o mesmo evento (após uma falha de rede) não duplica.
  id text primary key default financeiro.novo_id() check (length(id) between 1 and 80),
  -- Sem chave estrangeira para auth.users: excluir um usuário não é bloqueado nem apaga o histórico
  -- em cascata. O isolamento continua pelo RLS (usuario_id = auth.uid()).
  usuario_id uuid not null default auth.uid(),
  conta_id text not null check (length(conta_id) between 1 and 200),
  fatura_id text check (length(fatura_id) <= 200),
  evento text not null check (evento in (
    'criacao', 'importacao', 'vinculacao', 'edicao', 'reimportacao', 'pagamento', 'pagamento_desfeito', 'exclusao')),
  origem_acao text not null check (origem_acao in ('manual', 'importacao_fatura', 'sincronizacao_fatura')),
  antes jsonb check (antes is null or jsonb_typeof(antes) = 'object'),
  depois jsonb check (depois is null or jsonb_typeof(depois) = 'object'),
  detalhe text check (length(detalhe) <= 300),
  criado_em timestamptz not null default now()
);

create index if not exists historico_contas_conta_idx on financeiro.historico_contas (usuario_id, conta_id, criado_em);

-- RLS: cada usuário só lê e cria os próprios eventos. Sem política de UPDATE nem DELETE.
alter table financeiro.historico_contas enable row level security;
create policy "dono lê" on financeiro.historico_contas for select to authenticated using (usuario_id = (select auth.uid()));
create policy "dono cria" on financeiro.historico_contas for insert to authenticated with check (usuario_id = (select auth.uid()));

-- Permissões: só leitura e inserção pela API (mesmo que um privilégio padrão do schema dê mais).
revoke all on financeiro.historico_contas from anon, authenticated;
grant select, insert on financeiro.historico_contas to authenticated;

-- Tempo real: o histórico aparece na hora nos outros aparelhos.
alter publication supabase_realtime add table financeiro.historico_contas;

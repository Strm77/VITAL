-- V.I.T.A.L — melhorias da lista "Versão 4" (05/11/2026).
-- Migração SOMENTE ADITIVA: só acrescenta colunas novas, todas opcionais (nulas) ou com
-- valor padrão. Nenhuma tabela, coluna, restrição ou registro é removido ou alterado;
-- as linhas existentes continuam exatamente como estavam e o painel antigo segue funcionando.

-- Controle de pagamentos ------------------------------------------------------------
alter table financeiro.pagamentos
  -- V01: mês de referência da conta (AAAA-MM). Quando vazio, vale o mês do vencimento.
  add column if not exists mes_referencia text check (mes_referencia ~ '^\d{4}-\d{2}$'),
  -- V01: o dia do vencimento ainda não é conhecido. Como "vencimento" é obrigatório no banco,
  -- ele guarda só um dia técnico (o último do mês) que o painel não mostra nem usa como prazo.
  add column if not exists vencimento_a_confirmar boolean not null default false,
  -- V04: quando se pretende pagar (não muda o vencimento nem o status) e uma observação.
  add column if not exists pagar_em date,
  add column if not exists observacao text check (length(observacao) <= 200),
  -- V13: de onde saiu o dinheiro do pagamento.
  add column if not exists origem_pagamento text check (origem_pagamento in ('proprio', 'cheque_especial', 'outro_credito')),
  -- V11: a conta é a parcela do mês desta dívida (a parcela não é somada de novo).
  add column if not exists divida_id text references financeiro.dividas (id) on delete set null;

create index if not exists pagamentos_divida_id_idx on financeiro.pagamentos (divida_id);

-- Dívidas -------------------------------------------------------------------------
alter table financeiro.dividas
  -- V10/V12/V13: parcelas marcadas uma a uma, pelo número:
  --   {"3": {"pagoEm": "2026-11-02", "origem": "proprio", "valorPago": 290.5, "nota": "..."}}
  add column if not exists parcelas_quitadas jsonb,
  -- V10: saldo devedor informado pelo banco (substitui o cálculo parcela × restantes).
  add column if not exists saldo_informado numeric(12, 2) check (saldo_informado >= 0),
  add column if not exists saldo_informado_em date;

-- Saúde ---------------------------------------------------------------------------
alter table saude.registros
  -- V05: avaliação escolhida pelo usuário. Quando preenchida, vale no lugar de "resultado"
  -- ("resultado" continua obrigatório no banco e recebe 'acerto' como valor técnico quando
  -- a avaliação é 'sem_avaliacao'; o painel não o usa nesse caso).
  add column if not exists avaliacao text check (avaliacao in ('acerto', 'erro', 'sem_avaliacao')),
  -- V03: refeição planejada, realizada ou cancelada. Vazio = realizada (registros antigos).
  add column if not exists situacao text check (situacao in ('planejada', 'realizada', 'cancelada'));

notify pgrst, 'reload schema';

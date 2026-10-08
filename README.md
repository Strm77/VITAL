# V.I.T.A.L

Painel reflexo da minha vida. Começando pela aba **Financeiro**.

## Como usar

1. Abra o `index.html` no navegador (não precisa instalar nada).
2. Use **+ Adicionar dívida** para cadastrar, e a setinha de cada dívida para
   **Editar** ou **Excluir**. Os dados ficam salvos no navegador (localStorage).
   `dividas.js` só define os exemplos mostrados na primeira abertura.

O painel calcula sozinho a parcela atual, quantas faltam, a previsão de término,
quanto já foi pago e quanto falta. Clique na setinha de cada dívida (ou do total)
para ver os detalhes.

Ao lado das dívidas ficam o **gráfico de pizza** (quanto falta pagar de cada dívida)
e a **torre** com *Quanto eu ganho*, *Quanto eu gastei* e *Investimentos*. Cada bloco
tem uma setinha com os detalhes e os botões para adicionar, editar e excluir.
Ganhos e gastos marcados como "Todo mês" entram em todos os meses; os demais,
só no mês em que foram lançados.

Embaixo das dívidas, abaixo das dívidas e da pizza, fica o **Controle de pagamentos**:
cadastre cada conta com valor e vencimento; ao clicar em *Marcar como paga*, a data e a
hora do pagamento são registradas sozinhas. Contas pendentes com vencimento passado
aparecem como *Atrasada*.

## Aba Faturas

O botão **Faturas** (ou a aba no topo) abre:

- **Cartões** — aparecem sozinhos quando você importa a fatura de um cartão.
- **Importar fatura** — arraste o PDF da fatura. Ele é lido no próprio navegador
  (pdf.js), inclusive PDFs com senha. O painel encontra banco, final do cartão,
  vencimento e os lançamentos; você confere e salva.
- **Planilha da fatura** — os lançamentos do cartão e mês escolhidos, com a categoria
  de cada um (dá para trocar) e o botão *Baixar planilha (.csv)*, que abre no Excel.
- **Relatório de gastos por categoria** — quanto foi gasto em cada categoria.

As categorias são definidas por palavras-chave em `faturas.js` (`REGRAS_CATEGORIA`).

## Conexões entre as partes

- **Compromissos do mês (pizza):** junta as parcelas das dívidas (vermelhos), as contas
  do controle de pagamentos que vencem no mês (âmbar) e as faturas de cartão (roxos).
- **Fatura → controle de pagamentos:** cada fatura importada vira a conta
  "Fatura <cartão>" com o valor e o vencimento da fatura. Você pode editar o valor;
  o valor editado é mantido mesmo que a fatura mude. Excluir a fatura remove a conta
  (se ainda não estiver paga); excluir a conta à mão não a recria.

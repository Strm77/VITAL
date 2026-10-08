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

Embaixo das dívidas há o botão **Faturas** (a página `faturas.html` ainda está em
construção) e, abaixo das dívidas e da pizza, o **Controle de pagamentos**: cadastre
cada conta com valor e vencimento; ao clicar em *Marcar como paga*, a data e a hora
do pagamento são registradas sozinhas. Contas pendentes com vencimento passado
aparecem como *Atrasada*.

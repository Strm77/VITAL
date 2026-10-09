# V.I.T.A.L

Painel reflexo da minha vida. Começando pela aba **Financeiro**.

## Site publicado (Vercel + Supabase)

O site é estático e fica na Vercel; os dados ficam no Supabase, no schema **`financeiro`**
(tabelas `dividas`, `ganhos`, `gastos`, `investimentos`, `cartoes`, `faturas`, `lancamentos`
e `pagamentos` — veja `supabase/migrations/`).

- **Login:** e-mail e senha (Supabase Auth). Só os e-mails da tabela
  `financeiro.emails_permitidos` conseguem criar conta.
- **Segurança:** RLS em todas as tabelas — cada linha pertence a um usuário e só ele lê ou altera.
- **Tempo real:** o painel escuta as mudanças das tabelas (Supabase Realtime), então o que muda
  num aparelho aparece nos outros.
- **Tema:** claro, escuro (preto neutro) ou automático, seguindo o sistema; o botão no topo troca e o painel lembra a escolha.
- `config.js` tem a URL do projeto e a chave publicável (pode ficar no navegador).
- A Vercel publica a cada push: `vercel.json` copia os arquivos do site para `public/`.

## Como usar localmente

1. Abra o `index.html` no navegador (não precisa instalar nada). Aberto como arquivo,
   o painel usa o localStorage do navegador em vez do Supabase.
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

## Dinheiro do mês

No topo da torre, o bloco **Dinheiro do mês** mostra o fluxo do mês da timeline:

- **Entradas** = ganhos do mês.
- **Saídas** = contas do Controle de pagamentos (inclui as faturas de cartão) + parcelas das
  dívidas + gastos avulsos (Pix, dinheiro, débito — fora do cartão, para não contar duas vezes).
- **Já saiu** = contas pagas + parcelas já vencidas + gastos avulsos; **Disponível agora** =
  entradas − já saiu; **Ainda vai sair** = contas pendentes + parcelas a vencer.
- **Sobra (ou Falta) no fim do mês** = entradas − saídas.

"Quanto eu gastei" passa a mostrar o total das saídas, e "Quanto eu ganho" a mesma sobra.

## Metas (caixinhas)

O submenu **Metas** guarda objetivos como caixinhas: nome, valor da meta, link de compra e prazo
(opcionais). Use **+ Guardar** e **− Retirar** para movimentar o dinheiro; cada caixinha mostra
o saldo, quanto falta, quanto guardar por mês para cumprir o prazo e o histórico. O que você
guarda no mês entra como saída no **Dinheiro do mês**. Links só são aceitos se forem http(s).

## Navegação e timeline

**Financeiro** tem um submenu: **Painel** e **Faturas**. Acima de todas as seções fica a
**timeline** com os meses do ano (setas para trocar de ano). O painel sempre abre no mês
atual; ao escolher outro mês, todas as seções passam a mostrar aquele mês: parcelas das
dívidas, compromissos da pizza, ganhos e gastos, contas do controle de pagamentos e a
fatura de cada cartão.

## Assinaturas

O submenu **Assinaturas** encontra sozinho as assinaturas nos lançamentos de todas as faturas
importadas (Netflix, Prime Video, Spotify, PlayStation, Apple, Google One, Max, Claude, Adobe…)
e mostra, por serviço: cartão, valor mensal (somando várias cobranças no mês), os últimos 6 meses,
mudança de preço e se ainda está ativa. A lista de serviços fica em `assinaturas.js` (`SERVICOS`);
um lançamento com categoria "Assinaturas" também entra.

## Faturas

O submenu **Faturas** (ou o botão Faturas no painel) abre:

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

## Compras parceladas e previsão

Na aba Faturas, a tabela **Fatura do cartão** mostra as compras à vista e as parceladas juntas.
As parceladas aparecem com a parcela atual (ex.: 3/10), um bloco por parcela, até quando vão
e o valor total da compra; as que terminam em até 2 meses ficam destacadas. O **total da fatura** é o valor oficial lido do PDF (ou digitado em "Corrigir total"); o que
não aparecer como lançamento entra na linha **Outros valores da fatura**, então a tabela sempre
fecha no valor cobrado pelo banco. Dá para filtrar Tudo junto / Parceladas / À vista. Num mês sem fatura importada, a tabela mostra a fatura prevista. **Previsão das faturas** mostra os próximos 12 meses: meses sem
fatura importada aparecem listrados, somando só as parcelas já programadas. Nos meses
futuros, o gráfico de pizza também mostra as faturas previstas de cada cartão.

A parcela é lida da descrição do lançamento ("Parcela 2/3", "PARC 03/10", "(05/12)",
"MAGALU 03/10", "Parcela 1 de 3"), então funciona também com faturas já importadas.

## Testes

```bash
npm install
npm test            # leitor de faturas + simulação completa do painel (Playwright)
npm run simulacao   # gera tests/saida/simulacao.json com o cenário de simulação
```

- `tests/01-leitor.test.mjs` — leitura das linhas de fatura de vários bancos, parcelas e categorias.
- `tests/02-simulacao.test.mjs` — importa 5 faturas em PDF (Nubank, Itaú, Bradesco, Inter e C6,
  gerados em `tests/simulacao/gerar-pdfs.mjs`), cadastra 13 contas e confere totais, parcelas,
  previsão, timeline, atualização em tempo real (inclusive entre abas), recarga e celular.
- `tests/05-metas.test.mjs` — caixinhas: criar, guardar, retirar, prazo, link seguro e Dinheiro do mês.
- `tests/04-tema.test.mjs` — modo escuro (preto neutro), botão de tema e cores da pizza no fundo preto.
- `tests/03-site-publicado.test.mjs` — modo site publicado com um Supabase simulado
  (`tests/supabase-simulado.js`): login, e-mail não permitido, gravação nas tabelas, lançamentos
  da fatura, conta automática, recarga e sair.
- Os testes usam a data fixa de 08/10/2026; capturas de tela ficam em `tests/saida/`.

// Testes do leitor de faturas: interpretação das linhas, categorias e parcelas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { abrirNavegador, abrirPainel } from "./ajuda.mjs";

let navegador, pagina;
before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

const extrair = (linhas) => pagina.evaluate((l) => extrairDaFatura(l), linhas);

test("Nubank: data DD MMM, R$, prefixo do cartão virtual e parcela", async () => {
  const r = await extrair([
    "Nubank",
    "Data de vencimento: 15 OUT 2026",
    "de 01 SET a 01 OUT    R$ 3.991,84",
    "07 SET Pagamento em 07 SET -R$ 3.104,99",
    "01 SET •••• 5636 Loja Exemplo - Parcela 2/3 R$ 36,00",
    "04 SET •••• 5636 Google One R$ 24,99",
    "20 SET Estorno de compra -R$ 30,00",
  ]);
  assert.equal(r.banco, "Nubank");
  assert.equal(r.vencimento, "2026-10-15");
  assert.equal(r.mes, "2026-10");
  assert.deepEqual(r.lancamentos.map((l) => [l.descricao, l.valor]), [
    ["Loja Exemplo - Parcela 2/3", 36],
    ["Google One", 24.99],
    ["Estorno de compra", -30],
  ]);
  assert.equal(r.lancamentos[0].finalCartao, "5636");
  assert.equal(r.lancamentos[1].categoria, "Assinaturas");
  assert.equal(r.lancamentos[2].categoria, "Pagamentos e créditos");
});

test("Ignora linhas que não são compras (só R$, período, totais, saldo)", async () => {
  const r = await extrair([
    "Vencimento: 10/10/2026",
    "01/03 R$ 90,18",
    "02/06 R$ 130,71",
    "05/09 Saldo anterior 1.200,00",
    "05/09 Total da fatura 1.200,00",
    "06/09 Pagamento efetuado -500,00",
    "07/09 PADARIA REAL 12,00",
  ]);
  assert.deepEqual(r.lancamentos.map((l) => l.descricao), ["PADARIA REAL"]);
});

test("Itaú: duas colunas na mesma linha", async () => {
  const r = await extrair([
    "Itaú", "Vencimento: 10/10/2026", "final 2222",
    "04/09 SUPERMERCADO EXTRA 412,35      05/09 POSTO SHELL 200,00",
    "07/09 MAGALU 03/10 199,90      09/09 SPOTIFY 21,90",
  ]);
  assert.equal(r.final, "2222");
  assert.deepEqual(r.lancamentos.map((l) => [l.descricao, l.valor, l.categoria]), [
    ["SUPERMERCADO EXTRA", 412.35, "Mercado"],
    ["POSTO SHELL", 200, "Transporte"],
    ["MAGALU 03/10", 199.9, "Compras"],
    ["SPOTIFY", 21.9, "Assinaturas"],
  ]);
});

test("Ano da compra: fatura de janeiro com compras de dezembro", async () => {
  const r = await extrair(["Vencimento: 10/01/2027", "15/12 LOJA DE NATAL 300,00", "03/01 PADARIA 10,00"]);
  assert.deepEqual(r.lancamentos.map((l) => l.data), ["2026-12-15", "2027-01-03"]);
});

test("Vencimento por extenso (C6) e data com ano (Inter)", async () => {
  const c6 = await extrair(["C6 Bank", "Vencimento: 25 de outubro de 2026", "03 set Apple.com Bill 49,90"]);
  assert.equal(c6.vencimento, "2026-10-25");
  assert.equal(c6.lancamentos[0].data, "2026-09-03");
  const inter = await extrair(["Banco Inter", "Cartão **** 4444", "Vencimento: 20/10/2026", "02/09/2026 AIRBNB PARC 03/06 R$ 380,00"]);
  assert.equal(inter.final, "4444");
  assert.equal(inter.lancamentos[0].data, "2026-09-02");
  assert.equal(inter.lancamentos[0].categoria, "Viagem");
});

test("Parcelas em todos os formatos de banco", async () => {
  const casos = await pagina.evaluate(() =>
    ["Loja - Parcela 2/3", "ANUIDADE (05/12)", "MAGALU 03/10", "AIRBNB PARC 03/06", "Sympla Parcela 1 de 3", "TOK STOK 11/12", "Padaria", "Data 31/12"]
      .map((d) => [d, lerParcela(d), semParcela(d)]));
  assert.deepEqual(casos, [
    ["Loja - Parcela 2/3", { atual: 2, total: 3 }, "Loja"],
    ["ANUIDADE (05/12)", { atual: 5, total: 12 }, "ANUIDADE"],
    ["MAGALU 03/10", { atual: 3, total: 10 }, "MAGALU"],
    ["AIRBNB PARC 03/06", { atual: 3, total: 6 }, "AIRBNB"],
    ["Sympla Parcela 1 de 3", { atual: 1, total: 3 }, "Sympla"],
    ["TOK STOK 11/12", { atual: 11, total: 12 }, "TOK STOK"],
    ["Padaria", null, "Padaria"],
    ["Data 31/12", null, "Data 31/12"], // 31 > 12: não é parcela
  ]);
});

test("Total oficial da fatura e linhas com valor que não viraram lançamento", async () => {
  const r = await extrair([
    "Nubank", "Data de vencimento: 08 OUT 2026",
    "Total a pagar R$ 3.572,42",
    "Saldo anterior R$ 3.556,30",
    "01 SET Loja - Parcela 2/3 R$ 36,00",
  ]);
  assert.equal(r.totalInformado, 3572.42);
  assert.deepEqual(r.naoReconhecidas, ["Total a pagar R$ 3.572,42", "Saldo anterior R$ 3.556,30"]);
  for (const [linha, valor] of [["Total da fatura R$ 621,00", 621], ["Valor total desta fatura: 1.298,80", 1298.8], ["O total da sua fatura é R$ 99,90", 99.9]]) {
    assert.equal((await extrair([linha])).totalInformado, valor, linha);
  }
  assert.equal((await extrair(["Total dos lançamentos atuais 782,57"])).totalInformado, null);
});

test("Fatura do Nubank completa: total certo entre simulações e crédito da fatura anterior", async () => {
  // Estrutura igual à de uma fatura real do Nubank (nomes e valores fictícios).
  const r = await extrair([
    "Esta é a sua fatura de", "outubro, no valor de", "R$ 1.000,00", "Data de vencimento: 08 OUT 2026",
    "fatura no valor de R$ 1.000,00",
    "Pagamento total da fatura",
    "Valido até a data de   Parcelar em 3   Parcelar em 6",
    "Total a pagar   R$ 1.300,00   R$ 1.500,00",
    "Valor de entrada   R$ 200,00   R$ 200,00",
    "O saldo restante (R$ 800,00) entrará nos juros rotativos de",
    "Fatura anterior   R$ 900,00",
    "Pagamento recebido   −R$ 1.100,00",
    "Total de compras de todos os cartões, 01 SET a 01 OUT   R$ 1.150,00",
    "Total a pagar   R$ 1.000,00",
    "TRANSAÇÕES   DE 01 SET A 01 OUT",
    "Fulano de Tal   R$ 1.150,00",
    "01 SET   •••• 1234   Loja X - Parcela 2/3   R$ 300,00",
    "10 SET   •••• 1234   Mercado Y   R$ 600,00",
    "10 SET   IOF de \"Loja Z\"   R$ 4,00",
    "Pagamentos e Financiamentos   -R$ 1.000,00",
    "07 SET   Pagamento em 07 SET   −R$ 900,00",
    "07 SET   Pagamento em 07 SET   −R$ 200,00",
    "01 SET   PIX PARCELADO - Parcela 3/5   R$ 246,00",
    "Total a pagar: R$ 1.230,00 (valor da transação de R$ 1.000,00 + R$ 10,00 de IOF +",
    "R$ 220,00 de juros) divididos em 5 parcelas de R$ 246,00.",
  ]);
  assert.equal(r.totalInformado, 1000, "ignora a simulação de parcelamento e o detalhe do Pix");
  assert.deepEqual(r.lancamentos.map((l) => [l.descricao, l.valor]), [
    ["Loja X - Parcela 2/3", 300],
    ["Mercado Y", 600],
    ["IOF de \"Loja Z\"", 4],
    ["PIX PARCELADO - Parcela 3/5", 246],
    ["Crédito: pagamento a mais na fatura anterior", -200],
  ]);
  const soma = r.lancamentos.reduce((t, l) => t + l.valor, 0);
  assert.equal(Math.round(soma * 100) / 100, 950);
});

test("Assinaturas reconhecidas pela descrição da fatura", async () => {
  const r = await pagina.evaluate(() => [
    ["Amazon Prime Canais", "Compras"], ["Amazonprimebr", "Outros"], ["Apple.Com/Bill", "Assinaturas"],
    ["Assinatura HBO Max desconto Nubank", "Assinaturas"], ["Anthropic* Claude Sub", "Assinaturas"], ["Ppro*Adobe", "Outros"],
    ["Mp *Melimais", "Outros"], ["Google One", "Assinaturas"], ["NETFLIX.COM", "Assinaturas"], ["PlayStation Network", "Lazer"],
    ["SPOTIFY", "Assinaturas"], ["Dl*Clube Leitura 123", "Assinaturas"],
    ["Amazon Br *Amazon", "Compras"], ["Uber* Trip", "Transporte"], ["Smash N Play", "Outros"],
    ['IOF de "Anthropic* Claude Sub"', "Tarifas e juros"],
  ].map(([d, c]) => identificarAssinatura(d, c)));
  assert.deepEqual(r, [
    "Prime Video", "Prime Video", "Apple (App Store / iCloud)", "Max (HBO)", "Claude", "Adobe", "Meli+", "Google One",
    "Netflix", "PlayStation Plus", "Spotify", "Clube Leitura", null, null, null, null,
  ]);
  assert.equal(await pagina.evaluate(() => categorizar("PLAYSTATION NETWORK", 34.9)), "Assinaturas");
});

test("Categorias por palavra-chave", async () => {
  const r = await pagina.evaluate(() =>
    ["IFOOD *LANCHE", "UBER *TRIP", "DROGASIL", "NETFLIX.COM", "AMAZON BR", "IOF COMPRA", "CINEMARK", "LOJA DESCONHECIDA"].map((d) => categorizar(d, 10)));
  assert.deepEqual(r, ["Alimentação", "Transporte", "Saúde", "Assinaturas", "Compras", "Tarifas e juros", "Lazer", "Outros"]);
});

test("Nenhum erro de JavaScript na página", () => assert.deepEqual(pagina.erros, []));

// Simulação completa: 5 cartões com parcelas, 13 contas e o painel reagindo em tempo real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, brl, texto, centavos } from "./ajuda.mjs";
import { CARTOES, CONTAS, totalFatura, parcelados, previsto } from "./simulacao/dados.mjs";
import { gerarPdfs } from "./simulacao/gerar-pdfs.mjs";

let navegador, contexto, pagina, pdfs;
const foto = (nome, p = pagina) => p.screenshot({ path: path.join(SAIDA, nome), fullPage: true });

before(async () => {
  pdfs = await gerarPdfs(path.join(SAIDA, "pdfs"));
  navegador = await abrirNavegador();
  contexto = await navegador.newContext();
  contexto.setDefaultTimeout(5000);
  pagina = await abrirPainel(contexto);
  // A simulação usa só as próprias contas: tira as contas de exemplo do painel.
  await pagina.evaluate(() => localStorage.setItem("vital.pagamentos", "[]"));
  await pagina.reload();
  await pagina.waitForSelector("#lista-dividas li");
});
after(() => navegador?.close());

const linhasPagamentos = () =>
  pagina.$$eval("#pag-tabela tbody tr", (trs) => trs.map((tr) => ({
    nome: tr.cells[0].childNodes[0].textContent.trim(),
    valor: tr.cells[2].textContent.replace(/\u00a0/g, " ").trim(),
    status: tr.cells[3].textContent.trim(),
    pagoEm: tr.cells[4].textContent.trim(),
  })));
const legendaPizza = () => pagina.$$eval("#legenda li", (li) => li.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
const irPara = async (aba) => { await pagina.click(`.subaba[data-aba=${aba}]`); await pagina.waitForTimeout(100); };
const escolherMes = async (indice) => { await pagina.click(`#timeline-meses .mes >> nth=${indice}`); await pagina.waitForTimeout(150); };

test("1. Importa as 5 faturas em PDF (um layout por banco)", async () => {
  await irPara("faturas");
  for (const { cartao, arquivo } of pdfs) {
    await pagina.setInputFiles("#pdf-arquivo", arquivo);
    await pagina.waitForSelector("#previa:not([hidden])");
    const titulo = await texto(pagina, "#previa-titulo");
    assert.match(titulo, new RegExp(`Encontrei ${cartao.lancamentos.length} lançamentos`), `${cartao.nome}: ${titulo}`);
    assert.equal(await pagina.inputValue("#previa-final"), cartao.final, `${cartao.nome}: final do cartão`);
    assert.equal(await pagina.inputValue("#previa-vencimento"), cartao.vencimento, `${cartao.nome}: vencimento`);
    await pagina.selectOption("#previa-cartao", "");
    await pagina.fill("#previa-novo", cartao.nome);
    await pagina.click("#previa [type=submit]");
    await pagina.waitForSelector("#previa", { state: "hidden" });
  }
  assert.equal(await texto(pagina, "#cartoes-contagem"), "5 cartões");
});

test("2. Cada cartão mostra o total certo da fatura de outubro", async () => {
  const totais = await pagina.$$eval(".cartao", (c) => Object.fromEntries(c.map((x) => [
    x.querySelector(".cartao-nome").textContent, x.querySelector(".cartao-total").textContent.replace(/\s+/g, " ")])));
  for (const c of CARTOES) {
    assert.ok(totais[c.nome].includes(brl(centavos(totalFatura(c)))), `${c.nome}: esperado ${brl(totalFatura(c))}, veio "${totais[c.nome]}"`);
  }
  await foto("01-faturas-outubro.png");
});

test("3. Fatura do cartão: parceladas e à vista na mesma tabela, com as que estão acabando destacadas", async () => {
  for (const c of CARTOES) {
    await pagina.locator(".cartao", { hasText: c.nome }).click();
    await pagina.waitForTimeout(80);
    const linhas = await pagina.$$eval("#planilha tbody tr", (trs) => trs.map((tr) => ({
      tipo: tr.className,
      nome: tr.cells[1].textContent.trim(),
      chip: tr.querySelector(".chip-parcela")?.textContent ?? null,
      estado: tr.querySelector(".chip-parcela")?.className ?? "",
      blocos: tr.querySelectorAll(".blocos i").length,
    })));
    assert.equal(linhas.length, c.lancamentos.length, `${c.nome}: todas as compras numa tabela só`);
    for (const l of c.lancamentos) {
      const linha = linhas.find((x) => x.nome.toUpperCase() === l.desc.toUpperCase());
      assert.ok(linha, `${c.nome}: faltou ${l.desc}`);
      if (!l.p || l.valor < 0) { assert.match(linha.tipo, /avista/, l.desc); continue; }
      assert.match(linha.tipo, /parcelada/, l.desc);
      assert.equal(linha.chip, `${l.p[0]}/${l.p[1]}`, l.desc);
      assert.equal(linha.blocos, l.p[1], `${l.desc}: um bloco por parcela`);
      const faltam = l.p[1] - l.p[0];
      if (faltam === 0) assert.match(linha.estado, /ultima/, l.desc);
      else if (faltam <= 2) assert.match(linha.estado, /acabando/, l.desc);
    }
    const resumo = await texto(pagina, "#planilha-resumo");
    assert.ok(resumo.includes(`Total ${brl(centavos(totalFatura(c)))}`), resumo);
    const parcelado = parcelados(c).reduce((t, l) => t + l.valor, 0);
    assert.ok(resumo.includes(`Parceladas ${brl(centavos(parcelado))} (${parcelados(c).length})`), resumo);
  }
  // Filtro: só parceladas
  await pagina.click(".seg[data-tipo=parceladas]");
  assert.equal(await pagina.$$eval("#planilha tbody tr", (t) => t.every((x) => x.classList.contains("parcelada"))), true);
  await pagina.click(".seg[data-tipo=avista]");
  assert.equal(await pagina.$$eval("#planilha tbody tr", (t) => t.every((x) => x.classList.contains("avista"))), true);
  await pagina.click(".seg[data-tipo=todos]");
  await foto("01b-fatura-unificada.png");
});

test("4. Previsão: novembro e dezembro só com as parcelas que continuam", async () => {
  const colunas = await pagina.$$eval("#previsao-colunas .coluna", (c) => c.map((x) => ({ titulo: x.title.replace(/\u00a0/g, " "), prevista: x.classList.contains("prevista") })));
  assert.equal(colunas.length, 12);
  for (const [n, nome] of [[1, "Novembro"], [2, "Dezembro"], [6, "Abril"]]) {
    const esperado = CARTOES.reduce((t, c) => t + previsto(c, n), 0);
    assert.ok(colunas[n].titulo.includes(brl(centavos(esperado))), `${nome}: esperado ${brl(esperado)} em "${colunas[n].titulo}"`);
    assert.ok(colunas[n].prevista);
  }
  assert.ok(!colunas[0].prevista, "outubro é fatura real");
});

test("5. Cada fatura virou conta no controle de pagamentos", async () => {
  await irPara("painel");
  const contas = await linhasPagamentos();
  for (const c of CARTOES) {
    const conta = contas.find((x) => x.nome === `Fatura ${c.nome}`);
    assert.ok(conta, `faltou a conta da fatura ${c.nome}`);
    assert.equal(conta.valor, brl(centavos(totalFatura(c))));
  }
});

test("6. Cadastra 13 contas pelo formulário e paga 3 delas", async () => {
  for (const c of CONTAS) {
    await pagina.click("#pag-adicionar");
    await pagina.fill("#pag-nome", c.nome);
    await pagina.fill("#pag-valor", String(c.valor));
    await pagina.fill("#pag-vencimento", c.vencimento);
    await pagina.click("#pag-form [type=submit]");
    await pagina.waitForSelector("#pag-form", { state: "hidden" });
  }
  for (const c of CONTAS.filter((x) => x.pagar)) {
    await pagina.locator("#pag-tabela tbody tr", { hasText: c.nome }).locator("[data-acao=pagar]").click();
    await pagina.waitForTimeout(80);
  }
  const contas = await linhasPagamentos();
  const outubro = CONTAS.filter((c) => c.vencimento.startsWith("2026-10"));
  assert.equal(contas.length, outubro.length + CARTOES.length, "contas de outubro + 5 faturas");
  for (const c of outubro) {
    const linha = contas.find((x) => x.nome === c.nome);
    const status = c.pagar ? "Pago" : c.vencimento < "2026-10-08" ? "Atrasada" : "Pendente";
    assert.equal(linha.status, status, c.nome);
    if (c.pagar) assert.match(linha.pagoEm, /^08\/10\/2026 às/, "data do pagamento automática");
  }
  // Ordem: as que faltam pagar primeiro, por vencimento; pagas no fim.
  const status = contas.map((x) => x.status);
  assert.ok(status.lastIndexOf("Atrasada") < status.indexOf("Pago"));
  await foto("02-painel-outubro.png");
});

test("7. Resumo de pagamentos e pizza batem com os dados", async () => {
  const outubro = CONTAS.filter((c) => c.vencimento.startsWith("2026-10"));
  const total = outubro.reduce((t, c) => t + c.valor, 0) + CARTOES.reduce((t, c) => t + totalFatura(c), 0);
  const pago = outubro.filter((c) => c.pagar).reduce((t, c) => t + c.valor, 0);
  const resumo = await texto(pagina, "#pag-resumo");
  assert.ok(resumo.includes(`Total ${brl(centavos(total))}`), resumo);
  assert.ok(resumo.includes(`Pago ${brl(centavos(pago))}`), resumo);
  assert.ok(resumo.includes("2 atrasadas"), resumo);

  const legenda = await legendaPizza();
  const cartoes = legenda.find((l) => l.startsWith("Cartões"));
  assert.ok(cartoes.includes(brl(centavos(CARTOES.reduce((t, c) => t + totalFatura(c), 0)))), cartoes);
  assert.ok(legenda.some((l) => l.includes("Aluguel (simulação)") && l.includes("pago")));
});

test("8. Tempo real: pagar uma conta atualiza resumo e pizza sem recarregar", async () => {
  const antes = await texto(pagina, "#pag-resumo");
  await pagina.locator("#pag-tabela tbody tr", { hasText: "Energia (simulação)" }).locator("[data-acao=pagar]").click();
  await pagina.waitForTimeout(100);
  const depois = await texto(pagina, "#pag-resumo");
  assert.notEqual(antes, depois);
  assert.ok(depois.includes("4 de 17 pagas"), depois);
  assert.ok((await legendaPizza()).some((l) => l.includes("Energia (simulação)") && l.includes("pago")));
});

test("9. Tempo real: editar o valor da fatura muda a pizza; o valor importado fica guardado", async () => {
  const c = CARTOES[1];
  await pagina.locator("#pag-tabela tbody tr", { hasText: `Fatura ${c.nome}` }).locator("[data-acao=editar]").click();
  await pagina.fill("#pag-valor", "1000");
  await pagina.click("#pag-form [type=submit]");
  await pagina.waitForTimeout(100);
  const linha = await texto(pagina, `#pag-tabela tbody tr:has-text("Fatura ${c.nome}")`);
  assert.ok(linha.includes(brl(1000)) && linha.includes(`Fatura importada: ${brl(centavos(totalFatura(c)))}`), linha);
  const esperado = CARTOES.reduce((t, x) => t + totalFatura(x), 0) - totalFatura(c) + 1000;
  assert.ok((await legendaPizza()).find((l) => l.startsWith("Cartões")).includes(brl(centavos(esperado))));
});

test("10. Tempo real: remover um lançamento parcelado atualiza parcelas, previsão e conta", async () => {
  await irPara("faturas");
  const c = CARTOES[0];
  await pagina.locator(".cartao", { hasText: c.nome }).click();
  const alvo = parcelados(c).find((l) => l.p[0] + 1 <= l.p[1]); // continua em novembro
  const antes = await pagina.$$eval("#planilha tbody tr.parcelada", (t) => t.length);
  const botao = pagina.locator("#planilha tbody tr", { hasText: alvo.desc }).locator("button");
  await botao.click(); await botao.click();
  await pagina.waitForTimeout(150);
  assert.equal(await pagina.$$eval("#planilha tbody tr.parcelada", (t) => t.length), antes - 1);
  const nov = await pagina.$eval("#previsao-colunas .coluna:nth-child(2)", (x) => x.title.replace(/\u00a0/g, " "));
  const esperado = CARTOES.reduce((t, x) => t + previsto(x, 1), 0) - alvo.valor;
  assert.ok(nov.includes(brl(centavos(esperado))), nov);
  await irPara("painel");
  const linha = await texto(pagina, `#pag-tabela tbody tr:has-text("Fatura ${c.nome}")`);
  assert.ok(linha.includes(brl(centavos(totalFatura(c) - alvo.valor))), linha);
});

test("11. Timeline: novembro mostra faturas previstas, a conta de novembro e as parcelas que seguem", async () => {
  await escolherMes(10);
  assert.equal(await texto(pagina, "#pagamentos-mes"), "Novembro de 2026");
  const contas = await linhasPagamentos();
  assert.deepEqual(contas.map((x) => x.nome), ["Aluguel nov (simulação)"]);
  const legenda = await legendaPizza();
  assert.ok(legenda.filter((l) => l.includes("(prevista)")).length >= 4, legenda.join(" | "));
  await foto("03-painel-novembro.png");
  await irPara("faturas");
  // Nubank em novembro: fatura prevista com as parcelas que continuam (uma foi removida no teste 10)
  const previstas = await pagina.$$eval("#planilha tbody tr.prevista", (t) => t.length);
  assert.equal(previstas, parcelados(CARTOES[0]).filter((l) => l.p[0] + 1 <= l.p[1]).length - 1);
  assert.match(await texto(pagina, "#planilha-resumo"), /Fatura prevista/);
  assert.match(await texto(pagina, ".cartao:has-text('Inter (simulação)') .cartao-total"), /Previsto em Novembro de 2026/);
  await foto("04-faturas-novembro.png");
  await pagina.click("#timeline-hoje");
  await pagina.waitForTimeout(150);
  assert.equal(await texto(pagina, "#timeline-meses .ativo"), "Out");
  await irPara("painel");
});

test("12. Tempo real entre abas: o que muda numa aba aparece na outra", async () => {
  const outra = await abrirPainel(contexto, { manterDados: true });
  await pagina.locator("#pag-tabela tbody tr", { hasText: "Internet (simulação)" }).locator("[data-acao=pagar]").click();
  await outra.waitForFunction(() =>
    [...document.querySelectorAll("#pag-tabela tbody tr")].some((tr) => tr.textContent.includes("Internet (simulação)") && tr.textContent.includes("Pago")), null, { timeout: 3000 });
  await outra.close();
});

test("13. Dívidas e torre reagem às mudanças", async () => {
  const antes = await texto(pagina, "#bloco-ganhos .porcentagem");
  await pagina.click("#botao-adicionar");
  await pagina.fill("#campo-nome", "Notebook (simulação)");
  await pagina.fill("#campo-valor", "300");
  await pagina.fill("#campo-total", "10");
  await pagina.fill("#campo-inicio", "2026-10");
  await pagina.click("#formulario [type=submit]");
  await pagina.waitForTimeout(100);
  assert.notEqual(await texto(pagina, "#bloco-ganhos .porcentagem"), antes, "torre recalcula o comprometido");
  assert.ok((await legendaPizza()).some((l) => l.includes("Notebook (simulação)")));
});

test("14. Os dados continuam lá depois de recarregar", async () => {
  await pagina.reload();
  await pagina.waitForTimeout(300);
  assert.equal((await linhasPagamentos()).length, CONTAS.filter((c) => c.vencimento.startsWith("2026-10")).length + CARTOES.length);
  await irPara("faturas");
  assert.equal(await texto(pagina, "#cartoes-contagem"), "5 cartões");
  await irPara("painel");
});

test("15. Celular: nada passa da largura da tela nas duas abas", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  for (const aba of ["painel", "faturas"]) {
    await irPara(aba);
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390, aba);
    await foto(`05-celular-${aba}.png`);
  }
  await pagina.setViewportSize({ width: 1440, height: 1000 });
  await irPara("painel");
});

test("16. Nenhum erro de JavaScript durante toda a simulação", () => assert.deepEqual(pagina.erros, []));

test("17. Exporta os dados da simulação", async () => {
  const dados = await pagina.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("vital.")).map((k) => [k.slice(6), JSON.parse(localStorage[k])])));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path.join(SAIDA, "simulacao.json"), JSON.stringify(dados, null, 2));
  assert.equal(dados.cartoes.length, 5);
});

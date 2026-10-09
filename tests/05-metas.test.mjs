// Metas (caixinhas): criar, guardar, retirar, prazo, link seguro e ligação com o Dinheiro do mês.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, brl, texto } from "./ajuda.mjs";

let navegador, pagina;
const caixinha = (nome) => pagina.locator(".caixinha", { hasText: nome });

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
  await pagina.click(".subaba[data-aba=metas]");
});
after(() => navegador?.close());

async function novaMeta({ nome, valor, link = "", prazo = "", inicial = "" }) {
  await pagina.click("#meta-adicionar");
  await pagina.fill("#meta-nome", nome);
  await pagina.fill("#meta-valor", String(valor));
  await pagina.fill("#meta-link", link);
  await pagina.fill("#meta-prazo", prazo);
  await pagina.fill("#meta-inicial", String(inicial));
  await pagina.click("#meta-form [type=submit]");
}

async function movimentar(nome, tipo, valor) {
  await caixinha(nome).locator(`[data-acao=${tipo}]`).click();
  await caixinha(nome).locator(".mov-form [name=valor]").fill(String(valor));
  await caixinha(nome).locator(".mov-form [type=submit]").click();
  await pagina.waitForTimeout(120);
}

test("Começa vazia e explica o que fazer", async () => {
  assert.equal(await pagina.isVisible("#metas-vazio"), true);
  await pagina.click(".subaba[data-aba=painel]");
  assert.match(await texto(pagina, "#bloco-metas"), /Nenhuma meta ainda/);
  await pagina.click(".subaba[data-aba=metas]");
});

test("Link que não é de site é recusado", async () => {
  await novaMeta({ nome: "Teste", valor: 100, link: "javascript:alert(1)" });
  assert.match(await texto(pagina, "#metas-aviso"), /endereço de site/);
  await pagina.click("#meta-cancelar");
  assert.equal(await pagina.$$eval(".caixinha", (c) => c.length), 0);
});

test("Cria a caixinha com valor inicial, link e prazo", async () => {
  await novaMeta({ nome: "PlayStation 5", valor: 4000, link: "www.loja.com.br/ps5", prazo: "2026-12", inicial: 1000 });
  await pagina.waitForSelector(".caixinha");
  const c = caixinha("PlayStation 5");
  assert.equal(await c.locator(".caixinha-valores strong").textContent().then((t) => t.replace(/ /g, " ")), brl(1000));
  const link = c.locator(".link-meta");
  assert.equal(await link.getAttribute("href"), "https://www.loja.com.br/ps5");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.match(await link.getAttribute("rel"), /noopener/);
  // Hoje é 08/10/2026: faltam R$ 3.000 em 3 meses (out, nov, dez) → R$ 1.000/mês
  const linha = await texto(pagina, ".caixinha .porcentagem");
  assert.ok(linha.includes(`falta ${brl(3000)}`), linha);
  assert.ok(linha.includes(`até Dez/26 · guarde ${brl(1000)}/mês`), linha);
});

test("Guardar e retirar mudam o saldo; não dá para retirar mais do que tem", async () => {
  await movimentar("PlayStation 5", "guardar", 500);
  assert.ok((await texto(pagina, ".caixinha-valores")).includes(brl(1500)));
  await movimentar("PlayStation 5", "retirar", 9999);
  assert.match(await texto(pagina, "#metas-aviso"), /Só há/);
  await caixinha("PlayStation 5").locator("[data-acao=cancelar-mov]").click();
  await movimentar("PlayStation 5", "retirar", 200);
  assert.ok((await texto(pagina, ".caixinha-valores")).includes(brl(1300)));
  await caixinha("PlayStation 5").locator("[data-acao=historico]").click();
  assert.equal(await caixinha("PlayStation 5").locator(".historico li").count(), 3);
});

test("Meta atingida fica destacada", async () => {
  await novaMeta({ nome: "Fone novo", valor: 300, inicial: 300 });
  await pagina.waitForSelector(".caixinha.atingida");
  assert.match(await texto(pagina, ".caixinha.atingida"), /Meta atingida/);
  assert.match(await texto(pagina, "#metas-resumo"), /1 atingida/);
  await pagina.screenshot({ path: path.join(SAIDA, "09-metas.png"), fullPage: true });
});

test("Metas aparecem no Painel, com total e progresso de cada uma", async () => {
  await pagina.click(".subaba[data-aba=painel]");
  assert.equal(await texto(pagina, "#bloco-metas .valor"), brl(1600));
  assert.match(await texto(pagina, "#bloco-metas .porcentagem"), new RegExp(`37% de ${brl(4300).replace(/[.$]/g, "\\$&")}`));
  await pagina.click("#bloco-metas .linha");
  const itens = await pagina.$$eval("#bloco-metas .metas-painel li", (l) => l.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  assert.equal(itens.length, 2);
  assert.match(itens[0], /PlayStation 5/);
  assert.match(itens[1], /Fone novo.*Meta atingida/);
  await pagina.click("#bloco-metas .ir-metas");
  await pagina.waitForSelector("#metas-lista .caixinha", { state: "visible", timeout: 3000 });
  await pagina.click(".subaba[data-aba=painel]");
});

test("Dinheiro do mês desconta o que foi guardado nas metas", async () => {
  await pagina.click("#bloco-fluxo .linha");
  const detalhe = (await texto(pagina, "#detalhes-fluxo")).replace(/\s/g, "");
  // Valores iniciais (1.000 e 300) já estavam guardados: só conta 500 − 200 = 300 guardados em outubro
  assert.ok(detalhe.includes(`Guardadonasmetas−${brl(300)}`.replace(/\s/g, "")), detalhe);
  await pagina.click(".subaba[data-aba=metas]");
});

test("Apagar movimento e excluir meta", async () => {
  const c = caixinha("PlayStation 5");
  const apagar = c.locator("[data-acao=apagar-mov]").first();
  await apagar.click(); await apagar.click();
  await pagina.waitForTimeout(120);
  assert.equal(await c.locator(".historico li").count(), 2);
  const excluir = caixinha("Fone novo").locator("[data-acao=excluir]");
  await excluir.click(); await excluir.click();
  await pagina.waitForTimeout(120);
  assert.equal(await pagina.$$eval(".caixinha", (x) => x.length), 1);
  await pagina.reload();
  await pagina.click(".subaba[data-aba=metas]");
  await pagina.waitForSelector(".caixinha");
  assert.equal(await pagina.$$eval(".caixinha", (x) => x.length), 1, "continua depois de recarregar");
});

test("Celular: as caixinhas cabem na tela", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390);
});

test("Nenhum erro de JavaScript", () => assert.deepEqual(pagina.erros, []));

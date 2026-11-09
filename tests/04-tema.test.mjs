// Modo escuro: preto neutro, botão de tema e cores da pizza legíveis no fundo preto.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA } from "./ajuda.mjs";

let navegador, pagina;
const corDe = (seletor, prop) => pagina.$eval(seletor, (el, p) => getComputedStyle(el)[p], prop);
// Um tom é "neutro" (preto/cinza, sem puxar para o marrom) quando R, G e B são praticamente iguais.
const neutro = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) <= 6; };

before(async () => {
  navegador = await abrirNavegador();
  const contexto = await navegador.newContext({ colorScheme: "dark" });
  pagina = await abrirPainel(contexto);
});
after(() => navegador?.close());

test("Segue o sistema: fundo preto e superfícies em cinza neutro", async () => {
  assert.equal(await corDe("body", "backgroundColor"), "rgb(0, 0, 0)");
  for (const [sel, prop] of [["body", "color"], [".painel", "borderTopColor"], [".barra", "backgroundColor"], [".timeline", "borderTopColor"]]) {
    const cor = await corDe(sel, prop);
    assert.ok(neutro(cor), `${sel} ${prop} = ${cor} não é neutro`);
  }
  assert.equal(await pagina.textContent("#botao-tema"), "◐ Automático");
  await pagina.screenshot({ path: path.join(SAIDA, "06-escuro-painel.png"), fullPage: true });
});

test("Pizza no escuro: tons claros o bastante (nada de âmbar amarronzado)", async () => {
  const cores = await pagina.$$eval("#pizza path", (p) => p.map((x) => x.getAttribute("fill")));
  assert.ok(cores.length > 0);
  for (const c of cores) {
    const luz = Number(c.match(/(\d+)%\)$/)[1]);
    assert.ok(luz >= 48, `${c} escuro demais para o fundo preto`);
  }
});

test("Botão de tema: escuro → claro → automático, e lembra a escolha", async () => {
  await pagina.click("#botao-tema");
  assert.equal(await pagina.getAttribute("html", "data-theme"), "dark");
  await pagina.click("#botao-tema");
  assert.equal(await pagina.getAttribute("html", "data-theme"), "light");
  assert.equal(await corDe("body", "backgroundColor"), "rgb(255, 255, 255)");
  await pagina.reload();
  await pagina.waitForSelector("#lista-dividas li");
  assert.equal(await pagina.getAttribute("html", "data-theme"), "light", "escolha salva");
  await pagina.click("#botao-tema");
  assert.equal(await pagina.getAttribute("html", "data-theme"), null);
  assert.equal(await corDe("body", "backgroundColor"), "rgb(0, 0, 0)");
});

test("Aba Faturas no escuro", async () => {
  await pagina.click(".subaba[data-aba=faturas]");
  assert.equal(await corDe(".cartao-vazio", "borderTopColor").then(neutro), true);
  await pagina.screenshot({ path: path.join(SAIDA, "07-escuro-faturas.png"), fullPage: true });
});

// Sistema visual (DESIGN.md): roxo só no foco, superfícies neutras, verde só para pago/feito.
const ROXO_ESCURO = "rgb(156, 94, 239)"; // #9c5eef
const ROXO_CLARO = "rgb(129, 64, 208)"; // #8140d0

test("Escuro: o roxo marca o foco (sub-aba e mês ativos, botão primário, sublinhado da aba)", async () => {
  // Lê as cores finais, sem pegar uma transição de 120ms pela metade.
  await pagina.emulateMedia({ reducedMotion: "reduce" });
  await pagina.click(".subaba[data-aba=painel]");
  await pagina.mouse.move(0, 0);
  await pagina.waitForSelector("#lista-dividas li");
  assert.equal(await corDe(".subaba.ativa", "backgroundColor"), ROXO_ESCURO);
  assert.equal(await corDe(".subaba.ativa", "color"), "rgb(0, 0, 0)", "texto preto sobre o roxo (5,3:1)");
  assert.equal(await corDe(".timeline .mes.ativo", "backgroundColor"), ROXO_ESCURO);
  assert.equal(await corDe(".botao.primario", "backgroundColor"), ROXO_ESCURO);
  assert.equal(await pagina.$eval(".aba.ativa", (el) => getComputedStyle(el, "::after").backgroundColor), ROXO_ESCURO);
  assert.equal(await corDe(".botao.adicionar", "color"), ROXO_ESCURO);
});

test("Escuro: superfícies e bordas sem roxo; verde continua sendo pago/feito", async () => {
  for (const [sel, prop] of [[".painel", "backgroundColor"], [".painel", "borderTopColor"], [".subaba:not(.ativa)", "borderTopColor"], [".timeline", "backgroundColor"]]) {
    const cor = await corDe(sel, prop);
    assert.ok(neutro(cor), `${sel} ${prop} = ${cor} não é neutro`);
  }
  assert.equal(await corDe("#lista-dividas .preenchimento", "backgroundColor"), "rgb(60, 207, 145)", "barra de quitação verde");
  // Foco visível no teclado, na cor do roxo clareado do tema escuro.
  await pagina.focus(".subaba[data-aba=faturas]");
  await pagina.keyboard.press("Shift+Tab");
  await pagina.keyboard.press("Tab");
  assert.equal(await pagina.evaluate(() => getComputedStyle(document.activeElement).outlineColor), "rgb(183, 134, 255)");
});

test("Claro: o mesmo roxo, mais escuro para manter o contraste no branco", async () => {
  await pagina.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  assert.equal(await corDe(".subaba.ativa", "backgroundColor"), ROXO_CLARO);
  assert.equal(await corDe(".subaba.ativa", "color"), "rgb(255, 255, 255)");
  assert.equal(await corDe(".botao.primario", "backgroundColor"), ROXO_CLARO);
  assert.ok(neutro(await corDe(".painel", "backgroundColor")));
  await pagina.evaluate(() => { delete document.documentElement.dataset.theme; });
  assert.equal(await corDe("body", "backgroundColor"), "rgb(0, 0, 0)");
});

test("Fonte Manrope carregada e números tabulares", async () => {
  assert.equal(await pagina.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 16px "Manrope"'); }), true);
  assert.match(await corDe("body", "fontFamily"), /^Manrope/);
  assert.equal(await corDe("body", "fontVariantNumeric"), "tabular-nums");
});

test("Celular (390px): abas com 44px de toque, a ativa visível e campos em 16px", async () => {
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.evaluate(() => { location.hash = "#stefanini"; });
  await pagina.waitForSelector('main[data-vista="stefanini"]:not([hidden])');
  const abas = await pagina.$$eval(".aba", (as) => as.map((a) => a.getBoundingClientRect().height));
  assert.ok(abas.every((h) => h >= 44), `abas com ${abas.join(", ")}px`);
  const ativa = await pagina.$eval(".aba.ativa", (a) => { const r = a.getBoundingClientRect(); return { esq: r.left, dir: r.right }; });
  assert.ok(ativa.esq >= 0 && ativa.dir <= 390, `aba ativa fora da tela: ${JSON.stringify(ativa)}`);
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "sem rolagem lateral");
  await pagina.evaluate(() => { location.hash = "#painel"; });
  await pagina.waitForSelector('main[data-vista="painel"]:not([hidden])');
  await pagina.click("#botao-adicionar");
  const tamanhos = await pagina.$$eval("#formulario input:not([type=date]), #formulario select", (els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  assert.ok(tamanhos.length && tamanhos.every((t) => t >= 16), `campos com ${tamanhos.join(", ")}px (o iPhone dá zoom abaixo de 16)`);
  await pagina.click("#botao-cancelar");
  await pagina.screenshot({ path: path.join(SAIDA, "08-escuro-celular.png"), fullPage: true });
  await pagina.setViewportSize({ width: 1440, height: 1000 });
});

test("Reduzir movimento: sem transições", async () => {
  assert.equal(await corDe(".botao", "transitionDuration"), "0s");
  assert.equal(await corDe(".aba", "transitionDuration"), "0s");
  await pagina.emulateMedia({ reducedMotion: "no-preference" });
  assert.notEqual(await corDe(".botao", "transitionDuration"), "0s");
});

test("Nenhum erro de JavaScript", () => assert.deepEqual(pagina.erros, []));

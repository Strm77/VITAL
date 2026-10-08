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

test("Nenhum erro de JavaScript", () => assert.deepEqual(pagina.erros, []));

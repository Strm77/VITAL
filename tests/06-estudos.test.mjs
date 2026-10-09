// Área Estudos: plano com metas, matérias e tópicos, sessões, cronômetro e progresso.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, HOJE, texto } from "./ajuda.mjs";

let navegador, pagina;
const plano = () => pagina.locator(".plano", { hasText: "Inglês" });

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

test("Aba Estudos no topo: esconde o submenu e a timeline do Financeiro", async () => {
  await pagina.click(".aba[data-area=estudos]");
  await pagina.waitForSelector("#planos", { state: "attached" });
  assert.equal(await pagina.isVisible(".submenu"), false);
  assert.equal(await pagina.isVisible("#timeline"), false);
  assert.equal(await pagina.isVisible("#estudos-vazio"), true);
  assert.match(await pagina.getAttribute(".aba[data-area=estudos]", "class"), /ativa/);
});

test("Cria um plano com metas, prazo e tópicos agrupados por matéria", async () => {
  await pagina.click("#plano-adicionar");
  await pagina.fill("#plano-tema", "Inglês");
  await pagina.fill("#plano-objetivo", "Conversar na viagem");
  await pagina.fill("#plano-fim", "2026-12-31");
  await pagina.fill("#plano-horas", "40");
  await pagina.fill("#plano-semana", "4");
  await pagina.fill("#plano-topicos", "Gramática: Present perfect\nGramática: Phrasal verbs\nConversação: Pedir comida\nVocabulário de viagem");
  await pagina.click("#plano-form [type=submit]");
  await pagina.waitForSelector(".plano .materia");
  const materias = await pagina.$$eval(".plano .materia-topo", (m) => m.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  assert.deepEqual(materias, ["Gramática 0/2", "Conversação 0/1", "Sem matéria 0/1"]);
  assert.match(await texto(pagina, ".plano .metrica:nth-child(2)"), /0 de 4/);
});

test("Registrar estudo e concluir o tópico atualiza horas, tópicos e semana", async () => {
  await plano().locator("[data-acao=registrar]").click();
  const form = plano().locator(".sessao-form");
  await form.locator("[name=minutos]").fill("90");
  await form.locator("[name=topico]").selectOption({ label: "Gramática · Present perfect" });
  await form.locator("[name=concluir]").check();
  await form.locator("[type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector(".plano .metrica:nth-child(2)").textContent.includes("1 de 4"));
  assert.match(await texto(pagina, ".plano .metrica:nth-child(1)"), /1,5 de 40 h/);
  assert.match(await texto(pagina, ".plano .metrica:nth-child(3)"), /1h30 de 4h/);
  assert.match(await texto(pagina, ".plano .materia-topo"), /1\/2/);
  assert.match(await texto(pagina, "#estudos-resumo"), /Hoje 1h30/);
});

test("Marcar tópico pela caixinha e sequência de dias", async () => {
  await plano().locator(".topicos input").nth(2).check();
  await pagina.waitForFunction(() => document.querySelector(".plano .metrica:nth-child(2)").textContent.includes("2 de 4"));
  // Sessão de ontem → sequência de 2 dias
  await plano().locator("[data-acao=registrar]").click();
  const form = plano().locator(".sessao-form");
  await form.locator("[name=data]").fill("2026-10-07");
  await form.locator("[name=minutos]").fill("30");
  await form.locator("[type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector("#estudos-resumo").textContent.includes("2 dias"));
  assert.match(await texto(pagina, "#estudos-resumo"), /Esta semana 2h/);
});

test("Ritmo para o prazo: horas que faltam divididas pelas semanas até o fim", async () => {
  // 40h − 2h = 38h restantes; de 08/10 a 31/12 são 85 dias ≈ 12,1 semanas → ~3h08/semana
  const ritmo = await texto(pagina, ".plano .ritmo");
  assert.match(ritmo, /Para chegar no prazo: 3h0\d\/semana/, ritmo);
});

test("Cronômetro: conta o tempo, continua após recarregar e registra ao parar", async () => {
  await plano().locator("[data-acao=cronometro]").click();
  assert.equal(await pagina.isVisible("#cronometro"), true);
  await pagina.clock.setFixedTime(new Date(HOJE.getTime() + 25 * 60 * 1000));
  await pagina.reload();
  await pagina.waitForSelector("#cronometro:not([hidden])");
  await pagina.waitForFunction(() => document.querySelector("#cronometro-tempo").textContent === "00:25:00");
  await pagina.click("#cronometro-parar");
  assert.equal(await plano().locator(".sessao-form [name=minutos]").inputValue(), "25");
  await plano().locator(".sessao-form [type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector("#estudos-resumo").textContent.includes("Hoje 1h55"));
  assert.equal(await pagina.isVisible("#cronometro"), false);
  await pagina.screenshot({ path: path.join(SAIDA, "10-estudos.png"), fullPage: true });
});

test("Adicionar e remover tópico, apagar sessão", async () => {
  // O recarregamento do cronômetro fecha os detalhes: abre de novo.
  await plano().locator("[data-acao=detalhes]").click();
  const f = plano().locator(".topico-form");
  await f.locator("[name=materia]").fill("Conversação");
  await f.locator("[name=nome]").fill("No hotel");
  await f.locator("[type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector(".plano .metrica:nth-child(2)").textContent.includes("de 5"));
  const remover = plano().locator("[data-remover-topico]").last();
  await remover.click(); await remover.click();
  await pagina.waitForFunction(() => document.querySelector(".plano .metrica:nth-child(2)").textContent.includes("de 4"));
  const apagar = plano().locator("[data-apagar-sessao]").first();
  await apagar.click(); await apagar.click();
  await pagina.waitForFunction(() => document.querySelectorAll(".plano .historico li").length === 2);
});

test("Celular e exclusão do plano", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390);
  await pagina.setViewportSize({ width: 1440, height: 1000 });
  const excluir = plano().locator("[data-acao=excluir]");
  await excluir.click(); await excluir.click();
  await pagina.waitForSelector("#estudos-vazio:not([hidden])");
});

test("Voltar ao Financeiro mostra o submenu e a timeline de novo", async () => {
  await pagina.click(".aba[data-area=financeiro]");
  await pagina.waitForSelector(".submenu:not([hidden])");
  assert.equal(await pagina.isVisible("#timeline"), true);
});

test("Nenhum erro de JavaScript", () => assert.deepEqual(pagina.erros, []));

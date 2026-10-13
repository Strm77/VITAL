// SHARK: clientes, pacote de artes, artes por etapa a partir do calendário, carga semanal,
// agenda e recebimentos ligados ao Financeiro. Hoje nos testes: quinta, 08/10/2026.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, texto } from "./ajuda.mjs";

let navegador, pagina;
const ir = async (hash) => { await pagina.click(`.subaba[data-aba="${hash}"]`); await pagina.waitForSelector(`[data-vista="${hash}"]:not([hidden])`); };
const tipoFrente = (valor) => pagina.click(`#frente-form label:has(> input[value=${valor}])`);
const linhaTarefa = (nome, sub) => pagina.locator("#shark-tarefas .tarefa", { hasText: nome }).filter({ hasText: sub });
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

async function novoCliente(nome, { mensal, dia, inicio } = {}) {
  await pagina.click("#cliente-adicionar");
  await pagina.fill("#cliente-nome", nome);
  if (mensal) await pagina.fill("#cliente-mensal", String(mensal));
  if (dia) await pagina.fill("#cliente-dia", String(dia));
  if (inicio) await pagina.fill("#cliente-inicio", inicio);
  await pagina.click("#cliente-form [type=submit]");
  await pagina.waitForSelector(`.cliente-shark:has(h2:text-is("${nome}"))`);
}

async function novaFrenteEtapas(cliente, nome, calendario, modelo, valor) {
  await pagina.locator(".cliente-shark", { hasText: cliente }).locator("[data-acao=nova-frente]").click();
  await pagina.fill("#frente-nome", nome);
  await tipoFrente("etapas");
  await pagina.fill("#frente-calendario", calendario);
  await pagina.fill("#frente-modelo", modelo);
  if (valor) await pagina.fill("#frente-valor-etapa", String(valor));
  await pagina.click("#frente-form [type=submit]");
  await pagina.waitForSelector(`.frente:has(h4:text("${nome}"))`);
}

test("Aba SHARK com submenu próprio e convite para começar", async () => {
  await pagina.click(".aba[data-area=shark]");
  await pagina.waitForSelector("[data-vista=shark]:not([hidden])");
  assert.equal(await pagina.isVisible('.submenu[data-area-de="financeiro"]'), false);
  assert.equal(await pagina.isVisible('.submenu[data-area-de="shark"]'), true);
  assert.equal(await pagina.isVisible("#timeline"), false);
  assert.equal(await texto(pagina, ".aba[data-area=shark]"), "SHARK");
  assert.match(await texto(pagina, "#shark-alertas"), /Comece cadastrando seus clientes/);
});

test("Cliente com mensalidade e pacote de 100 artes já com 56 entregues", async () => {
  await ir("shark-clientes");
  assert.equal(await pagina.isVisible("#clientes-vazio"), true);
  await novoCliente("KMKZY", { mensal: 1500, dia: 5, inicio: "2026-10" });
  await pagina.locator(".cliente-shark", { hasText: "KMKZY" }).locator("[data-acao=nova-frente]").click();
  await pagina.fill("#frente-nome", "Pacote 100 artes");
  await pagina.fill("#frente-meta", "100");
  await pagina.fill("#frente-ja", "56");
  await pagina.fill("#frente-prazo", "2026-11-30");
  await pagina.click("#frente-form [type=submit]");
  const frente = pagina.locator(".frente", { hasText: "Pacote 100 artes" });
  await frente.waitFor();
  assert.match(await frente.locator(".frente-numero").textContent(), /56\s+de 100/);
  // 44 até 30/11: 53 dias ≈ 7,6 semanas → 6 por semana
  assert.match(await frente.locator(".frente-legenda").textContent(), /Faltam 44 · ritmo de 6 artes por semana/);
  assert.match(await frente.locator("[data-acao=mais-um]").textContent(), /nº 57/);
});

test("Contador do pacote: +1, várias de uma vez e desfazer", async () => {
  const frente = () => pagina.locator(".frente", { hasText: "Pacote 100 artes" });
  await frente().locator("[data-acao=mais-um]").click();
  await pagina.waitForFunction(() => document.querySelector(".frente .frente-numero").textContent.startsWith("57"));
  await frente().locator("[data-acao=varias]").click();
  await frente().locator(".varias-form [name=quantidade]").fill("3");
  await frente().locator(".varias-form [type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector(".frente .frente-numero").textContent.startsWith("60"));
  await frente().locator("[data-acao=historico]").click();
  assert.match(await frente().locator(".entregas").textContent(), /Artes 58–60.*Arte 57.*Artes 1–56/s);
  const desfazer = frente().locator(".entregas li", { hasText: "Artes 58–60" }).locator("[data-excluir-tarefa]");
  await desfazer.click(); await desfazer.click();
  await pagina.waitForFunction(() => document.querySelector(".frente .frente-numero").textContent.startsWith("57"));
  assert.match(await frente().locator(".frente-legenda").textContent(), /Faltam 43/);
});

test("Calendário: importa as etapas da Stock Car e cadastra um evento da NKR", async () => {
  await ir("shark-calendario");
  assert.match(await texto(pagina, "#importar-stock"), /Importar calendário da Stock Car 2026 \(3 etapas\)/);
  await pagina.click("#importar-stock-botao");
  await pagina.waitForFunction(() => document.querySelectorAll(".eventos li").length === 3);
  assert.equal(await pagina.isVisible("#importar-stock-botao"), false);
  assert.match(await texto(pagina, "#eventos-lista"), /Stock Car .*Dom, 18\/10 Etapa Goiânia.*Dom, 15\/11 Etapa Velopark.*Dom, 13\/12 Super Final — Interlagos/);
  await pagina.click("#evento-adicionar");
  await pagina.fill("#evento-calendario", "NKR");
  await pagina.fill("#evento-data", "2026-10-25");
  await pagina.fill("#evento-nome", "NKR Etapa 5");
  await pagina.click("#evento-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelectorAll(".eventos li").length === 4);
});

test("Frentes por etapa geram as artes sozinhas a partir do calendário", async () => {
  await ir("shark-clientes");
  await novoCliente("SENTA O PÉ");
  await novaFrenteEtapas("SENTA O PÉ", "Alfredinho", "Stock Car", "Race Week -6", 300);
  await novaFrenteEtapas("SENTA O PÉ", "Lucas", "Stock Car", "Cronograma Geral -5\nSexta -3\nSábado -2\nDomingo -1", 400);
  await novoCliente("NKR");
  await novaFrenteEtapas("NKR", "Etapas", "NKR", "Race Week -6\nTraçado do evento -6\nCronograma do Evento -5\nCampeões 80kg +1\nCampeões 95kg +1\nCampeões 110kg +1\nCampeões Sênior +1");
  const lucas = pagina.locator(".frente", { hasText: "Lucas" });
  assert.match(await lucas.locator(".frente-numero").textContent(), /0\s+de 8/, "2 etapas nos próximos 60 dias × 4 artes");
  // Próxima etapa já vem aberta com o checklist
  assert.match(await lucas.locator(".etapa.aberta").textContent(), /Etapa Goiânia.*Cronograma Geral.*Ter, 13\/10.*Sexta.*Qui, 15\/10.*Sábado.*Sex, 16\/10.*Domingo.*Sáb, 17\/10/s);
  assert.match(await texto(pagina, ".frente:has(h4:text('Etapas'))"), /NKR Etapa 5 Dom, 25\/10.*0\/7/);

  await ir("shark");
  const alertas = await texto(pagina, "#shark-alertas");
  assert.match(alertas, /Stock Car: Etapa Goiânia em 10 dias 5 artes por fazer — SENTA O PÉ · Alfredinho, SENTA O PÉ · Lucas/);
  assert.match(alertas, /KMKZY: faltam 43 artes até 30\/11\/2026/);
  assert.match(await texto(pagina, "#shark-tarefas"), /Próxima semana 5 artes Race Week SENTA O PÉ · Alfredinho · Etapa Goiânia Seg, 12\/10 em 4 dias/);
  assert.match(await texto(pagina, "#shark-numeros"), /Atrasadas 0 .*Próximos 30 dias 12 /);
});

test("Marcar arte como entregue na lista e no cliente", async () => {
  await linhaTarefa("Race Week", "Alfredinho · Etapa Goiânia").locator("[data-tarefa]").check();
  await pagina.waitForFunction(() => document.querySelector("#shark-tarefas").textContent.includes("Entregues nos últimos 7 dias"));
  assert.match(await texto(pagina, ".grupo-tarefas.feitas"), /Race Week .*entregue 08\/10/);
  const salvas = await local("tarefas");
  assert.ok(salvas.some((t) => t.id.startsWith("tf-") && t.nome === "Race Week" && t.status === "entregue" && t.entregueEm === "2026-10-08"));
  await ir("shark-clientes");
  assert.match(await texto(pagina, ".frente:has(h4:text('Alfredinho')) .etapa.aberta .etapa-contagem"), /1\/1/);
  await ir("shark");
});

test("Arte extra ligada a uma etapa, com quantidade, e exclusão", async () => {
  await pagina.click("#extra-adicionar");
  await pagina.selectOption("#extra-frente", { label: "NKR · Etapas" });
  await pagina.selectOption("#extra-evento", { label: "NKR Etapa 5 · 25/10" });
  assert.equal(await pagina.inputValue("#extra-prazo"), "2026-10-25", "prazo vem da etapa");
  await pagina.fill("#extra-prazo", "2026-10-22");
  await pagina.fill("#extra-nome", "Arte patrocinador");
  await pagina.fill("#extra-quantidade", "2");
  await pagina.click("#extra-form [type=submit]");
  const extra = linhaTarefa("Arte patrocinador", "extra");
  await extra.waitFor();
  assert.match(await extra.textContent(), /×2.*NKR · Etapas · NKR Etapa 5 · extra.*Qui, 22\/10/s);
  await extra.locator("[data-excluir-tarefa]").click();
  await extra.locator("[data-excluir-tarefa]").click();
  await pagina.waitForFunction(() => !document.querySelector("#shark-tarefas").textContent.includes("Arte patrocinador"));
});

test("Carga por semana: limite baixo avisa a semana pesada e sugere adiantar", async () => {
  assert.equal(await pagina.$$eval(".carga-col", (c) => c.length), 8);
  assert.match(await texto(pagina, "#shark-carga-legenda"), /KMKZY .*ritmo do pacote/);
  await pagina.fill("#shark-limite", "6");
  await pagina.press("#shark-limite", "Enter");
  await pagina.waitForSelector(".carga-col.acima");
  const alertas = await texto(pagina, "#shark-alertas");
  assert.match(alertas, /Semana de 19\/10 vai ter \d+ artes Passa do seu limite de 6\. Adiante \d+ artes? para a semana de/);
  assert.equal(await pagina.evaluate(() => localStorage.getItem("vital.shark.limite")), "6");
  await pagina.fill("#shark-limite", "30");
  await pagina.press("#shark-limite", "Enter");
  await pagina.waitForFunction(() => !document.querySelector(".carga-col.acima"));
});

test("Agenda do mês mostra as etapas e as artes de cada dia", async () => {
  await ir("shark-calendario");
  assert.match(await texto(pagina, "#agenda-mes"), /Outubro de 2026/);
  const dia18 = pagina.locator("#agenda .agenda-dia:not(.fora)", { has: pagina.locator(".agenda-num", { hasText: /^18$/ }) });
  assert.match(await dia18.textContent(), /Etapa Goiânia/);
  const dia13 = pagina.locator("#agenda .agenda-dia:not(.fora)", { has: pagina.locator(".agenda-num", { hasText: /^13$/ }) });
  assert.match(await dia13.textContent(), /1 arte/);
  await pagina.click("#agenda-proximo");
  assert.match(await texto(pagina, "#agenda-mes"), /Novembro de 2026/);
  await pagina.click("#agenda-anterior");
});

test("Recebimentos: mensalidade e etapas previstas, recebi, manual e ignorar", async () => {
  await ir("shark-recebimentos");
  const aReceber = await texto(pagina, "#a-receber");
  assert.match(aReceber, /KMKZY Mensal Out\/2026 previsto R\$ 1\.500,00 05\/10\/2026 Atrasado/);
  assert.match(aReceber, /SENTA O PÉ Lucas — Etapa Goiânia previsto R\$ 400,00 25\/10\/2026 A receber/);
  await pagina.locator("#a-receber tr", { hasText: "Mensal Out/2026" }).locator("[data-receb-acao=recebi]").click();
  await pagina.waitForFunction(() => document.querySelector("#recebidos").textContent.includes("Mensal Out/2026"));
  assert.match(await texto(pagina, "#receb-numeros"), /Recebido no mês R\$ 1\.500,00/);

  await pagina.click("#receb-adicionar");
  await pagina.selectOption("#receb-cliente", { label: "NKR" });
  await pagina.fill("#receb-descricao", "Arte avulsa");
  await pagina.fill("#receb-valor", "250");
  await pagina.fill("#receb-vencimento", "2026-10-08");
  await pagina.fill("#receb-recebido", "2026-10-07");
  await pagina.click("#receb-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#recebidos").textContent.includes("Arte avulsa"));
  assert.match(await texto(pagina, "#receb-numeros"), /Recebido no mês R\$ 1\.750,00/);

  const nov = pagina.locator("#a-receber tr", { hasText: "Mensal Nov/2026" });
  await nov.locator("[data-receb-acao=excluir]").click();
  await nov.locator("[data-receb-acao=excluir]").click();
  await pagina.waitForFunction(() => !document.querySelector("#a-receber").textContent.includes("Mensal Nov/2026"));
  assert.ok((await local("recebimentos")).some((r) => r.referencia === "mensal:2026-11" && r.ignorado), "previsto ignorado fica salvo");
  await pagina.screenshot({ path: path.join(SAIDA, "12-shark-recebimentos.png"), fullPage: true });
});

test("O que os clientes pagaram entra como ganho no Financeiro", async () => {
  await pagina.click(".aba[data-area=financeiro]");
  await pagina.waitForSelector("#bloco-ganhos");
  const ganhos = await texto(pagina, "#bloco-ganhos");
  assert.match(ganhos, /Dos clientes SHARK\s*R\$ 1\.750,00/);
  assert.match(ganhos, /KMKZY — Mensal Out\/2026 SHARK · recebido em 08\/10 R\$ 1\.500,00/);
  assert.match(ganhos, /NKR — Arte avulsa SHARK · recebido em 07\/10 R\$ 250,00/);
  await pagina.click("#bloco-fluxo .linha");
  assert.match(await texto(pagina, "#detalhes-fluxo"), /Clientes SHARK \(recebido\)\s*R\$ 1\.750,00/);
  // Desfazer no SHARK tira do Financeiro
  await pagina.click(".aba[data-area=shark]");
  await ir("shark-recebimentos");
  await pagina.locator("#recebidos tr", { hasText: "Arte avulsa" }).locator("[data-receb-acao=desfazer]").click();
  await pagina.waitForFunction(() => document.querySelector("#a-receber").textContent.includes("Arte avulsa"));
  await pagina.click(".aba[data-area=financeiro]");
  assert.match(await texto(pagina, "#bloco-ganhos"), /Dos clientes SHARK\s*R\$ 1\.500,00/);
});

test("Editar a frente muda o modelo e as artes geradas", async () => {
  await pagina.click(".aba[data-area=shark]");
  await ir("shark-clientes");
  await pagina.locator(".frente", { hasText: "Alfredinho" }).locator("[data-acao=editar-frente]").click();
  assert.equal(await pagina.inputValue("#frente-modelo"), "Race Week -6");
  await pagina.fill("#frente-modelo", "Race Week -6\nPódio +1");
  await pagina.click("#frente-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector(".frente:has(h4) ~ .frente, .frente") && [...document.querySelectorAll(".frente")].some((f) => f.textContent.includes("Alfredinho") && f.textContent.includes("Pódio")));
  assert.match(await texto(pagina, ".frente:has(h4:text('Alfredinho')) .etapa.aberta"), /1\/2/, "Race Week entregue continua contando");
});

test("Celular sem rolagem lateral e recarregar mantém tudo", async () => {
  await pagina.screenshot({ path: path.join(SAIDA, "13-shark-clientes.png"), fullPage: true });
  await pagina.setViewportSize({ width: 390, height: 900 });
  for (const aba of ["shark", "shark-clientes", "shark-calendario", "shark-recebimentos"]) {
    await ir(aba);
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390, aba);
  }
  await pagina.setViewportSize({ width: 1440, height: 1000 });
  await pagina.reload();
  await pagina.waitForSelector(".cliente-shark", { state: "attached" });
  assert.equal(await pagina.$$eval(".cliente-shark", (c) => c.length), 3);
  assert.deepEqual(pagina.erros, []);
});

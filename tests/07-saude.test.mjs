// Área Saúde: registros de acertos e erros, nota do dia, mensagens, gráficos, conquistas e metas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, texto } from "./ajuda.mjs";
import { registrosSaude } from "./simulacao/saude.mjs";

let navegador, pagina;

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

async function registrar({ tipo = "alimentacao", resultado = "acerto", descricao, refeicao, minutos, data }) {
  await marcar("tipo", tipo);
  await marcar("resultado", resultado);
  await pagina.fill("#saude-descricao", descricao);
  if (refeicao) await pagina.selectOption("#saude-refeicao", refeicao);
  if (minutos) await pagina.fill("#saude-minutos", String(minutos));
  if (data) await pagina.fill("#saude-data", data);
  await pagina.click("#saude-salvar");
}
// Os rádios ficam escondidos atrás dos botões: clica no rótulo, como a pessoa faria.
const marcar = (nome, valor) => pagina.click(`#saude-form label:has(> input[name=${nome}][value=${valor}])`);
const toast = () => texto(pagina, "#saude-toast");

test("Aba Saúde: começa vazia e convida para o primeiro registro", async () => {
  await pagina.click(".aba[data-area=saude]");
  await pagina.waitForSelector("#saude-numeros .saude-numero");
  assert.equal(await pagina.isVisible(".submenu"), false);
  assert.equal(await pagina.isVisible("#timeline"), false);
  assert.match(await texto(pagina, "#saude-mensagem .principal"), /Comece o placar de hoje/);
  assert.equal(await texto(pagina, "#saude-nota"), "—");
  assert.equal(await texto(pagina, "#saude-conquistas-total"), "0 de 12 desbloqueadas");
  assert.equal(await pagina.isVisible("#saude-vazio"), true);
  // Gráficos já aparecem (vazios): 30 dias, 16 semanas de calendário e 8 semanas de exercício
  assert.equal(await pagina.$$eval(".placar-dia", (d) => d.length), 30);
  assert.equal(await pagina.$$eval(".cal-dia", (d) => d.length), 112);
  assert.equal(await pagina.$$eval(".semana-col", (d) => d.length), 8);
});

test("O formulário muda com a área: refeição para alimentação, minutos para exercício", async () => {
  assert.equal(await pagina.isVisible("#saude-refeicao"), true);
  assert.equal(await pagina.isVisible("#saude-minutos"), false);
  await marcar("tipo", "exercicio");
  assert.equal(await pagina.isVisible("#saude-refeicao"), false);
  assert.equal(await pagina.isVisible("#saude-minutos"), true);
  assert.match(await pagina.getAttribute("#saude-descricao", "placeholder"), /musculação/);
  await marcar("resultado", "erro");
  assert.match(await pagina.getAttribute("#saude-form", "class"), /modo-erro/);
  await marcar("tipo", "alimentacao");
  await marcar("resultado", "acerto");
});

test("Primeiro acerto: nota 100, comemoração e conquista desbloqueada", async () => {
  await registrar({ descricao: "Salada no almoço", refeicao: "almoco" });
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "100");
  assert.match(await toast(), /Conquista desbloqueada: Primeiro passo/);
  assert.equal(await pagina.$$eval(".conquista.ganha", (c) => c.map((x) => x.dataset.conquista)).then((x) => x.join()), "primeiro");
  assert.match(await texto(pagina, "#saude-historico"), /Hoje nota 100 1 ✓ · 0 ✗ ✓ Salada no almoço Almoço/);
  assert.equal(await pagina.$eval("#saude-descricao", (i) => i.value), "", "formulário limpo para o próximo");
  assert.equal(await pagina.$eval("#saude-refeicao", (i) => i.value), "almoco", "mantém a refeição escolhida");
});

test("Validações: descrição, minutos do treino e data futura", async () => {
  await pagina.click("#saude-salvar");
  assert.match(await texto(pagina, "#saude-aviso"), /Descreva o que foi/);
  await registrar({ tipo: "exercicio", descricao: "Musculação" });
  assert.match(await texto(pagina, "#saude-aviso"), /quantos minutos/);
  await registrar({ tipo: "exercicio", descricao: "Musculação", minutos: 50, data: "2026-10-09" });
  assert.match(await texto(pagina, "#saude-aviso"), /ainda não chegou/);
  assert.equal(await pagina.$$eval(".registros-saude li", (l) => l.length), 1);
});

test("Treino conta na semana, no gráfico e nas conquistas", async () => {
  await registrar({ tipo: "exercicio", descricao: "Musculação", minutos: 50, data: "2026-10-08" });
  await pagina.waitForFunction(() => document.querySelectorAll(".registros-saude li").length === 2);
  assert.equal(await pagina.isVisible("#saude-aviso"), false);
  const numeros = await texto(pagina, "#saude-numeros");
  assert.match(numeros, /Treinos na semana 1 de 3/);
  assert.match(numeros, /Exercício na semana 50 min de 2h30/);
  assert.match(await texto(pagina, ".semana-col.atual"), /50 min/);
  assert.match(await texto(pagina, "#saude-mensagem"), /Treino de hoje feito ✓ Faltam 2 treinos para a meta da semana e restam 3 dias/);
  assert.ok(await pagina.$eval('[data-conquista="treino1"]', (c) => c.classList.contains("ganha")));
  assert.match(await texto(pagina, "#saude-fortes"), /Treino favorito: Musculação/);
});

test("Erro: mensagem de apoio, nota cai e aparece em 'Onde você mais erra'", async () => {
  await registrar({ resultado: "erro", descricao: "Refrigerante", refeicao: "jantar" });
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "67");
  assert.match(await toast(), /Errar faz parte|consciência|deslize/);
  assert.match(await texto(pagina, "#saude-anel"), /2 ✓ · 1 ✗/);
  assert.match(await texto(pagina, "#saude-fracos"), /Jantar 1×.*Refrigerante 1×.*Foque no jantar/);
  // Hoje no gráfico de 30 dias: barra de acertos para cima e de erros para baixo
  const hoje = await pagina.$eval(".placar-dia.hoje", (d) => [d.querySelector(".acerto").style.height, d.querySelector(".erro").style.height]);
  assert.deepEqual(hoje, ["100%", "50%"]);
  assert.match(await pagina.getAttribute(".cal-dia.hoje", "class"), /c-ruim|c-n1/);
});

test("Dia difícil: mais erros que acertos gera um alerta com sugestão", async () => {
  await registrar({ resultado: "erro", descricao: "Doce", refeicao: "lanche" });
  await registrar({ resultado: "erro", descricao: "Salgadinho", refeicao: "lanche" });
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "40");
  assert.match(await texto(pagina, "#saude-mensagem .principal"), /Dia difícil — ainda dá para virar/);
  assert.match(await pagina.getAttribute("#saude-anel", "class"), /ruim/);
});

test("Editar e excluir um registro", async () => {
  const item = pagina.locator(".registros-saude li", { hasText: "Salgadinho" });
  await item.locator("[data-editar-registro]").click();
  assert.equal(await pagina.$eval("#saude-descricao", (i) => i.value), "Salgadinho");
  assert.equal(await texto(pagina, "#saude-salvar"), "Salvar alteração");
  await marcar("resultado", "acerto");
  await pagina.fill("#saude-descricao", "Fruta no lanche");
  await pagina.click("#saude-salvar");
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "60");
  assert.equal(await texto(pagina, "#saude-salvar"), "Registrar");
  const doce = pagina.locator(".registros-saude li", { hasText: "Doce" }).locator("[data-excluir-registro]");
  await doce.click(); await doce.click();
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "75");
  assert.equal(await pagina.$$eval(".registros-saude li", (l) => l.length), 4);
});

test("Metas personalizadas mudam as mensagens e as barras", async () => {
  await pagina.fill("#saude-meta-treinos", "1");
  await pagina.fill("#saude-meta-minutos", "45");
  await pagina.click("#saude-metas-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#saude-mensagem").textContent.includes("Meta de treinos da semana batida"));
  assert.match(await texto(pagina, "#saude-numeros"), /Treinos na semana 1 de 1 .*Meta batida ✓/);
  assert.ok(await pagina.$eval('[data-conquista="semana"]', (c) => c.classList.contains("ganha")));
  assert.match(await pagina.getAttribute(".semana-col.atual .semana-barra", "class"), /bateu/);
  // Continua salvo ao recarregar
  await pagina.reload();
  await pagina.waitForSelector("#saude-numeros .saude-numero");
  assert.equal(await pagina.$eval("#saude-meta-treinos", (i) => i.value), "1");
});

test("Simulação de 8 semanas: evolução, ponto fraco, conquistas e atalhos", async () => {
  await pagina.evaluate((d) => { localStorage.setItem("vital.registros", JSON.stringify(d)); localStorage.removeItem("vital.objetivos"); }, registrosSaude());
  await pagina.reload();
  await pagina.waitForSelector(".conquista");
  assert.equal(pagina.erros.length, 0, pagina.erros.join("\n"));
  assert.match(await texto(pagina, "#saude-placar-resumo"), /30 dias: 68 ✓ · 22 ✗ · 76% de acertos/);
  const msgs = await texto(pagina, "#saude-mensagem");
  assert.match(msgs, /Alimentação abaixo da meta 75% de acertos nos últimos 7 dias \(meta 80%\)\. Seu ponto fraco é o lanche/);
  assert.match(msgs, /“Beliscou besteira à noite” apareceu 3 vezes em 2 semanas/);
  assert.match(await texto(pagina, "#saude-numeros"), /▲ 5 pts vs\. semana anterior/);
  assert.equal(await texto(pagina, "#saude-conquistas-total"), "10 de 12 desbloqueadas");
  assert.match(await texto(pagina, "#saude-exercicio-meta"), /batida em 2 de 8/);
  assert.equal(await pagina.$$eval(".dia-saude", (d) => d.length), 5, "histórico mostra 5 dias");
  await pagina.click("#saude-mais");
  assert.equal(await pagina.$$eval(".dia-saude", (d) => d.length), 12);
  await pagina.screenshot({ path: path.join(SAIDA, "11-saude.png"), fullPage: true });

  // Atalho: repete "Iogurte com aveia" hoje com um clique
  await pagina.click(".chip-rapido >> text=Iogurte com aveia");
  await pagina.waitForFunction(() => document.querySelector("#saude-nota").textContent === "100");
  assert.match(await texto(pagina, "#saude-historico .dia-saude:first-child"), /Hoje .*Iogurte com aveia Café da manhã/);
});

test("Dica ao passar o mouse nos gráficos", async () => {
  await pagina.hover(".placar-dia.hoje");
  assert.match(await texto(pagina, "#saude-dica"), /Qui, 08\/10: 1 acerto · 0 erros/);
  await pagina.hover(".cal-dia.hoje");
  assert.match(await texto(pagina, "#saude-dica"), /nota 100/);
});

test("Celular e tema escuro sem rolagem lateral", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390);
  await pagina.setViewportSize({ width: 1440, height: 1000 });
});

test("Voltar ao Financeiro e nenhum erro de JavaScript", async () => {
  await pagina.click(".aba[data-area=financeiro]");
  assert.equal(await pagina.isVisible(".submenu"), true);
  assert.equal(await pagina.isVisible("[data-vista=saude]"), false);
  assert.deepEqual(pagina.erros, []);
});

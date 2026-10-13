// Visão geral (check-in, prioridades, atenção, metas, roda da vida), Saúde › Bem-estar
// e Rotina (tarefas, agenda, projetos, hábitos, tempo). Hoje: quinta, 08/10/2026 12:00.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, texto, URL_PAINEL } from "./ajuda.mjs";

let navegador, pagina;
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);
const ir = async (hash) => { await pagina.evaluate((h) => { location.hash = h; }, hash); await pagina.waitForSelector(`main[data-vista="${hash.slice(1)}"]:not([hidden])`); };
const toast = () => texto(pagina, "#vida-toast");
const definirRange = (seletor, valor) => pagina.$eval(seletor, (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, String(valor));

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

test("Sem endereço, o site abre na Visão geral", async () => {
  await pagina.goto(URL_PAINEL);
  await pagina.waitForSelector('main[data-vista="inicio"]:not([hidden])');
  await pagina.waitForFunction(() => document.querySelector("#inicio-saudacao").textContent !== "Olá");
  assert.match(await pagina.getAttribute(".aba[data-area=inicio]", "class"), /ativa/);
  assert.equal(await pagina.isVisible("#timeline"), false);
  assert.equal(await texto(pagina, "#inicio-saudacao"), "Boa tarde");
  assert.match(await texto(pagina, "#inicio-data"), /Quinta-feira, 8 de outubro/);
  const atencao = await texto(pagina, "#atencao");
  assert.match(atencao, /Defina suas 3 prioridades da semana/);
  assert.match(atencao, /Como você está hoje\?/);
  assert.match(await texto(pagina, "#roda"), /Dê uma nota de 0 a 10/);
});

test("Como estou me sentindo: humor, energia, estresse e uma frase", async () => {
  await pagina.click('main[data-vista="inicio"] [data-checkin=humor][data-valor="4"]');
  await pagina.waitForFunction(() => document.querySelector('main[data-vista="inicio"] [data-checkin=humor][data-valor="4"]').classList.contains("ativo"));
  assert.match(await toast(), /Que bom/);
  await pagina.click('main[data-vista="inicio"] [data-checkin=energia][data-valor="4"]');
  await pagina.click('main[data-vista="inicio"] [data-checkin=estresse][data-valor="2"]');
  await pagina.fill('main[data-vista="inicio"] [data-checkin-nota]', "Dia produtivo");
  await pagina.press('main[data-vista="inicio"] [data-checkin-nota]', "Enter");
  await pagina.locator('main[data-vista="inicio"] [data-checkin-nota]').blur();
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.checkins") || "[]")[0]?.nota === "Dia produtivo");
  const [c] = await local("checkins");
  assert.deepEqual([c.id, c.data, c.humor, c.energia, c.estresse], ["ck-2026-10-08", "2026-10-08", 4, 4, 2]);
  assert.match(await texto(pagina, 'main[data-vista="inicio"] .checkin'), /Energia .*Boa.*Estresse .*Leve/);
  assert.doesNotMatch(await texto(pagina, "#atencao"), /Como você está hoje/);
  assert.match(await pagina.getAttribute("#humor-dias .humor-dia.hoje", "title"), /Bem/);
  // Clicar de novo no mesmo humor desmarca
  await pagina.click('main[data-vista="inicio"] [data-checkin=humor][data-valor="4"]');
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.checkins"))[0].humor === null);
  await pagina.click('main[data-vista="inicio"] [data-checkin=humor][data-valor="5"]');
});

test("3 prioridades da semana: escrever, concluir e apagar", async () => {
  await pagina.fill("[data-prioridade='1']", "Entregar as artes da NKR");
  await pagina.press("[data-prioridade='1']", "Enter");
  await pagina.fill("[data-prioridade='2']", "Treinar 3 vezes");
  await pagina.press("[data-prioridade='2']", "Enter");
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.prioridades") || "[]").length === 2);
  assert.deepEqual((await local("prioridades")).map((p) => [p.id, p.semana, p.ordem, p.texto]),
    [["pr-2026-10-05-1", "2026-10-05", 1, "Entregar as artes da NKR"], ["pr-2026-10-05-2", "2026-10-05", 2, "Treinar 3 vezes"]]);
  await pagina.check("[data-prioridade-feita='1']");
  await pagina.waitForFunction(() => document.querySelector("#prioridades-semana").textContent.includes("1 de 2 feitas"));
  assert.match(await toast(), /Prioridade cumprida/);
  assert.match(await texto(pagina, "#inicio-frase"), /1 de 2 prioridades da semana feitas/);
  assert.doesNotMatch(await texto(pagina, "#atencao"), /Defina suas 3 prioridades/);
  await pagina.fill("[data-prioridade='2']", "");
  await pagina.press("[data-prioridade='2']", "Enter");
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.prioridades")).length === 1);
});

test("Roda da vida: avaliar o mês mostra a média e onde focar", async () => {
  await pagina.click("#roda-avaliar");
  const notas = { saude: 7, financas: 6, carreira: 8, estudos: 7, relacionamentos: 4, familia: 8, lazer: 3, proposito: 6 };
  for (const [area, n] of Object.entries(notas)) await definirRange(`#roda-campos [name=${area}]`, n);
  assert.equal(await texto(pagina, "#roda-campos label:nth-child(7) output"), "3");
  await pagina.click("#roda-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#roda .roda-media"));
  const roda = await texto(pagina, "#roda");
  assert.match(roda, /6,1 de 10/);
  assert.match(roda, /Foco: 🎮 Lazer e diversão e ❤️ Relacionamentos/);
  assert.equal((await local("satisfacao")).length, 8);
  assert.ok((await local("satisfacao")).every((s) => s.id.startsWith("sat-2026-10-") && s.mes === "2026-10"));
  assert.match(await texto(pagina, "#roda-avaliar"), /Atualizar a avaliação deste mês/);
  assert.match(await texto(pagina, "#inicio-frase"), /satisfação com a vida em 6,1/);
});

test("Rotina › Tarefas: prioridade, prazo, atrasada, editar, concluir e excluir", async () => {
  await pagina.click(".aba[data-area=rotina]");
  await pagina.waitForSelector('main[data-vista="rotina"]:not([hidden])');
  assert.equal(await pagina.isVisible('.submenu[data-area-de="rotina"]'), true);
  const nova = async (titulo, prioridade, prazo) => {
    await pagina.fill("#afazer-titulo", titulo);
    await pagina.selectOption("#afazer-prioridade", prioridade);
    await pagina.fill("#afazer-prazo", prazo);
    await pagina.click("#afazer-salvar");
    await pagina.waitForFunction((t) => document.querySelector("#afazeres").textContent.includes(t), titulo);
  };
  await nova("Pagar IPVA", "alta", "2026-10-07");
  await nova("Responder e-mails", "media", "2026-10-08");
  await nova("Comprar presente", "baixa", "2026-10-12");
  const lista = await texto(pagina, "#afazeres");
  assert.match(lista, /Atrasadas 1 Pagar IPVA Qua, 07\/10 · ontem Alta.*Hoje 1 Responder e-mails.*Mais adiante 1 Comprar presente/);
  assert.match(await texto(pagina, "#tarefas-numeros"), /Pendentes 3 1 de prioridade alta Atrasadas 1/);
  // Editar
  await pagina.locator(".afazer", { hasText: "Comprar presente" }).locator("[data-afazer-acao=editar]").click();
  assert.equal(await pagina.inputValue("#afazer-titulo"), "Comprar presente");
  await pagina.fill("#afazer-titulo", "Comprar presente da mãe");
  await pagina.click("#afazer-salvar");
  await pagina.waitForFunction(() => document.querySelector("#afazeres").textContent.includes("Comprar presente da mãe"));
  assert.equal((await local("afazeres")).length, 3);
  // Concluir
  await pagina.locator(".afazer", { hasText: "Responder e-mails" }).locator("[data-afazer-feito]").check();
  await pagina.waitForFunction(() => document.querySelector("#afazeres").textContent.includes("Feitas nos últimos 7 dias"));
  assert.match(await toast(), /Feito ✓/);
  // Excluir
  const ex = pagina.locator(".afazer", { hasText: "Comprar presente da mãe" }).locator("[data-afazer-acao=excluir]");
  await ex.click(); await ex.click();
  await pagina.waitForFunction(() => !document.querySelector("#afazeres").textContent.includes("Comprar presente"));
});

test("Rotina › Projetos: passos, próximo passo e conclusão", async () => {
  await ir("#rotina-projetos");
  await pagina.click("#projeto-adicionar");
  await pagina.fill("#projeto-nome", "Portfólio novo");
  await pagina.selectOption("#projeto-area", "carreira");
  await pagina.fill("#projeto-passos", "Definir escopo\nSeparar as 12 melhores artes\nMontar o site");
  await pagina.click("#projeto-form [type=submit]");
  const proj = pagina.locator(".projeto", { hasText: "Portfólio novo" });
  await proj.waitFor();
  assert.match(await proj.locator(".proximo-passo").textContent(), /Próximo passo\s+Definir escopo/);
  assert.match(await proj.textContent(), /0 de 3 passos/);
  await proj.locator(".proximo-passo [data-afazer-feito]").check();
  await pagina.waitForFunction(() => document.querySelector(".projeto .proximo-passo").textContent.includes("Separar as 12 melhores artes"));
  assert.match(await proj.textContent(), /1 de 3 passos/);
  await proj.locator("[data-projeto-passo] [name=titulo]").fill("Publicar");
  await proj.locator("[data-projeto-passo] [type=submit]").click();
  await pagina.waitForFunction(() => document.querySelector(".projeto").textContent.includes("1 de 4 passos"));
  // Na Visão geral aparece como meta em andamento
  await ir("#inicio");
  assert.match(await texto(pagina, "#andamento"), /Portfólio novo Projeto 25% .*1 de 4 passos/);
  await ir("#rotina-projetos");
  await pagina.selectOption(".projeto [data-projeto-status]", "concluido");
  await pagina.waitForFunction(() => document.querySelector(".projeto").classList.contains("status-concluido"));
  assert.match(await toast(), /Projeto concluído: Portfólio novo/);
});

test("Rotina › Hábitos: grade da semana, sequência e dias futuros bloqueados", async () => {
  await ir("#rotina-habitos");
  assert.equal(await pagina.isVisible("#habitos-vazio"), true);
  await pagina.click("#habito-adicionar");
  await pagina.fill("#habito-nome", "Ler 10 páginas");
  await pagina.fill("#habito-icone", "📖");
  await pagina.click("#habito-form [type=submit]");
  await pagina.waitForSelector("#grade-habitos [data-habito]");
  const linha = pagina.locator("#grade-habitos tr[data-habito]");
  assert.equal(await linha.locator('[data-habito-dia="2026-10-09"]').isDisabled(), true, "sexta ainda não chegou");
  await linha.locator('[data-habito-dia="2026-10-08"]').click();
  await pagina.waitForFunction(() => document.querySelector('[data-habito-dia="2026-10-08"]').classList.contains("feito"));
  await linha.locator('[data-habito-dia="2026-10-07"]').click();
  await pagina.waitForFunction(() => document.querySelector("#grade-habitos tbody").textContent.includes("🔥 2 dias"));
  assert.match(await texto(pagina, "#grade-habitos tbody"), /2\/7/);
  assert.match(await texto(pagina, "#habitos-numeros"), /Hoje 1 de 1 tudo feito ✓/);
  assert.ok((await local("habitos_feitos")).some((f) => f.data === "2026-10-08" && f.id.startsWith("hf-")));
  // Desmarcar hoje
  await linha.locator('[data-habito-dia="2026-10-08"]').click();
  await pagina.waitForFunction(() => !document.querySelector('[data-habito-dia="2026-10-08"]').classList.contains("feito"));
});

test("Saúde › Bem-estar: sono, água com meta, autocuidado e metas salvas junto das de saúde", async () => {
  await pagina.click(".aba[data-area=saude]");
  await pagina.click('.subaba[data-aba="saude-bemestar"]');
  await pagina.waitForSelector('main[data-vista="saude-bemestar"]:not([hidden])');
  await pagina.fill("#meta-agua", "3");
  await pagina.click("#bemestar-metas-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#agua-meta").textContent.includes("de 3 copos"));
  const [obj] = await local("objetivos");
  assert.deepEqual([obj.metaAgua, obj.metaSono, obj.treinosSemana], [3, 8, 3], "metas de saúde continuam");
  for (let i = 0; i < 3; i++) {
    await pagina.click("#agua-mais");
    await pagina.waitForFunction((n) => document.querySelector("#agua-copos").textContent === String(n), i + 1);
  }
  assert.match(await toast(), /Meta de água do dia batida/);
  await pagina.fill("#sono-horas", "7.5");
  await pagina.press("#sono-horas", "Enter");
  await pagina.locator("#sono-horas").blur();
  await pagina.waitForFunction(() => document.querySelector("#sono-resumo").textContent.includes("média 7h30"));
  await pagina.click('[data-escala="sonoQualidade"] [data-valor="4"]');
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.checkins"))[0].sonoQualidade === 4);
  const c = (await local("checkins"))[0];
  assert.deepEqual([c.aguaCopos, c.sonoHoras, c.humor], [3, 7.5, 5], "check-in do dia guarda tudo junto");
  // O humor marcado na Visão geral aparece aqui também
  assert.match(await pagina.getAttribute('main[data-vista="saude-bemestar"] [data-checkin=humor][data-valor="5"]', "class"), /ativo/);
  // Autocuidado
  await pagina.fill("#autocuidado-form [name=nome]", "Meditar");
  await pagina.click("#autocuidado-form [type=submit]");
  await pagina.waitForSelector("#autocuidado [data-habito-hoje]");
  await pagina.check("#autocuidado [data-habito-hoje]");
  await pagina.waitForFunction(() => document.querySelector("#autocuidado .habito-hoje").classList.contains("feito"));
  assert.match(await toast(), /Meditar: feito/);
  const h = (await local("habitos")).find((x) => x.nome === "Meditar");
  assert.equal(h.autocuidado, true);
});

test("Consultas preventivas: marcar, concluir e já agendar a próxima", async () => {
  await pagina.click("#consulta-adicionar");
  await pagina.waitForSelector('main[data-vista="rotina-agenda"]:not([hidden]) #compromisso-form:not([hidden])');
  assert.equal(await pagina.inputValue("#compromisso-tipo"), "consulta");
  await pagina.fill("#compromisso-titulo", "Dentista");
  await pagina.fill("#compromisso-data", "2026-10-08");
  await pagina.fill("#compromisso-hora", "10:00");
  await pagina.fill("#compromisso-repetir", "6");
  await pagina.click("#compromisso-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#proximos").textContent.includes("Dentista"));
  // Aparece na agenda do mês e na Visão geral
  const hoje = pagina.locator("#agenda-vida .agenda-dia.hoje");
  assert.match(await hoje.textContent(), /10:00 🩺 Dentista/);
  await ir("#inicio");
  assert.match(await texto(pagina, "#atencao"), /10:00 · Dentista/);
  // Em Bem-estar: concluir agenda a próxima em 6 meses
  await ir("#saude-bemestar");
  await pagina.locator("#consultas .compromisso", { hasText: "Dentista" }).locator("[data-compromisso-acao=feito]").click();
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.compromissos")).length === 2);
  const lista = await local("compromissos");
  assert.deepEqual(lista.map((c) => [c.data, c.feito]).sort(), [["2026-10-08", true], ["2027-04-08", false]]);
  assert.match(await toast(), /Próximo “Dentista” agendado para 08\/04\/2027/);
});

test("Rotina › Agenda junta compromissos, tarefas e as outras áreas", async () => {
  await ir("#rotina-agenda");
  await pagina.click("#compromisso-adicionar");
  await pagina.fill("#compromisso-titulo", "Reunião com cliente");
  await pagina.fill("#compromisso-data", "2026-10-09");
  await pagina.fill("#compromisso-hora", "14:00");
  await pagina.click("#compromisso-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#proximos").textContent.includes("Reunião com cliente"));
  const proximos = await texto(pagina, "#proximos");
  assert.match(proximos, /Amanhã amanhã Sex, 09\/10 14:00 Reunião com cliente/);
  assert.match(await texto(pagina, "#agenda-vida"), /7 ✅ Pagar IPVA/);
  await pagina.click("#agenda-vida-proximo");
  assert.match(await texto(pagina, "#agenda-vida-mes"), /Novembro de 2026/);
  await pagina.click("#agenda-vida-anterior");
});

test("Rotina › Tempo: registrar e comparar com as áreas de foco da roda da vida", async () => {
  await ir("#rotina-tempo");
  assert.match(await texto(pagina, "#tempo-foco"), /Onde você quer melhorar: 🎮 Lazer e diversão e ❤️ Relacionamentos/);
  await pagina.selectOption("#tempo-area", "lazer");
  await pagina.click(".chips-tempo [data-minutos='90']");
  await pagina.fill("#tempo-descricao", "Cinema");
  await pagina.click("#tempo-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#blocos-tempo").textContent.includes("Cinema"));
  assert.match(await texto(pagina, "#tempo-areas"), /Lazer e diversão foco .*1h30/);
  assert.match(await texto(pagina, "#tempo-foco"), /Lazer e diversão 1h30 · Relacionamentos 0 min/);
  assert.match(await texto(pagina, "#tempo-semana"), /1h30 registradas/);
});

test("Visão geral junta tudo: atenção, metas e hábitos de hoje", async () => {
  await ir("#inicio");
  const atencao = await texto(pagina, "#atencao");
  assert.match(atencao, /1 tarefa atrasada Pagar IPVA/);
  assert.match(atencao, /1 hábito para hoje 📖 Ler 10 páginas/);
  assert.match(await pagina.getAttribute(".atencao-item:first-child", "class"), /alerta/, "urgentes primeiro");
  assert.match(await texto(pagina, "#inicio-frase"), /coisas pedindo atenção \(\d urgentes?\)/);
  await pagina.screenshot({ path: path.join(SAIDA, "14-visao-geral.png"), fullPage: true });
});

test("Celular sem rolagem lateral, recarregar mantém e nenhum erro", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  for (const h of ["#inicio", "#saude-bemestar", "#rotina", "#rotina-agenda", "#rotina-projetos", "#rotina-habitos", "#rotina-tempo"]) {
    await ir(h);
    assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth), 390, h);
  }
  await pagina.setViewportSize({ width: 1440, height: 1000 });
  await pagina.reload();
  await ir("#inicio");
  await pagina.waitForSelector("#roda .roda-media");
  assert.match(await texto(pagina, "#roda"), /6,1 de 10/);
  assert.deepEqual(pagina.erros, []);
});

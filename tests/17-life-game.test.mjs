// Life Game (área Rotina) e Listas. Local (localStorage) e site publicado com o Supabase simulado.
// Tudo nasce vazio: nenhum hábito, tarefa ou check pré-definido. Dados 100% fictícios.
// Hoje nos testes: quinta, 08/10/2026.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { abrirNavegador, abrirPainel, RAIZ, HOJE, SAIDA, texto } from "./ajuda.mjs";

let navegador, pagina;
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);
// Os desenhos são agendados (vida.js): espera o texto em vez de ler na hora.
const esperarTexto = (sel, re) => pagina.waitForFunction(([s, f]) => new RegExp(f).test((document.querySelector(s)?.textContent || "").replace(/\s+/g, " ")), [sel, re.source]);
const esperarLocal = (nome, n) => pagina.waitForFunction(([t, q]) => JSON.parse(localStorage.getItem("vital." + t) || "[]").length === q, [nome, n]);

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
});
after(() => navegador?.close());

test("A aba vira Life Game, abre no jogo e começa vazia", async () => {
  assert.equal(await texto(pagina, ".aba[data-area=rotina]"), "Life Game");
  await pagina.click(".aba[data-area=rotina]");
  await pagina.waitForSelector('main[data-vista="rotina-jogo"]:not([hidden])');
  const subabas = await pagina.$$eval('.submenu[data-area-de="rotina"] .subaba', (l) => l.map((a) => a.textContent.trim()));
  assert.deepEqual(subabas, ["Jogo", "Tarefas", "Agenda", "Projetos", "Hábitos", "Tempo", "Listas"]);
  await esperarTexto("#jogo-nivel", /Nível 1 0 XP/);
  assert.equal(await pagina.isVisible("#jogo-habitos-vazio"), true);
  assert.equal(await pagina.isVisible("#jogo-tarefas-vazio"), true);
  assert.equal(await pagina.locator("#jogo-habitos li").count(), 0);
  for (const t of ["jogo_habitos", "jogo_tarefas", "jogo_checks", "jogo_personagem", "lista_itens"]) assert.deepEqual(await local(t), [], `${t} vazio`);
});

test("Hábito configurável: várias vezes por dia, XP por check, limite, desfazer e editar", async () => {
  await pagina.click("#jogo-habito-adicionar");
  await pagina.fill("#jogo-habito-nome", "Hábito Teste A");
  await pagina.fill("#jogo-habito-vezes", "3");
  await pagina.fill("#jogo-habito-xp", "5");
  await pagina.click("#jogo-habito-form [type=submit]");
  await esperarLocal("jogo_habitos", 1);
  const [h] = await local("jogo_habitos");
  assert.deepEqual([h.nome, h.vezesDia, h.xp, h.ativo], ["Hábito Teste A", 3, 5, true]);
  assert.deepEqual(await local("jogo_checks"), [], "criar o hábito não marca nada");

  const botao = '[data-jogo-habito] [data-jogo-acao="check"]';
  for (let i = 1; i <= 3; i++) {
    await pagina.click(botao);
    await esperarLocal("jogo_checks", i);
  }
  const checks = await local("jogo_checks");
  assert.deepEqual(checks.map((c) => [c.habitoId, c.data, c.xp]), Array(3).fill([h.id, "2026-10-08", 5]));
  await pagina.waitForFunction(() => document.querySelector("[data-jogo-acao=check]").disabled);
  await esperarTexto("[data-jogo-habito]", /3\/3 hoje/);
  await esperarTexto("#jogo-nivel", /15 XP/);
  await esperarTexto("#jogo-numeros", /XP hoje 15 3 checks/);

  await pagina.click('[data-jogo-acao="desfazer"]');
  await esperarLocal("jogo_checks", 2);
  await pagina.waitForFunction(() => !document.querySelector("[data-jogo-acao=check]").disabled);

  await pagina.click('[data-jogo-acao="editar"]');
  await pagina.fill("#jogo-habito-xp", "20");
  await pagina.fill("#jogo-habito-vezes", "0");
  await pagina.click("#jogo-habito-form [type=submit]");
  assert.match(await texto(pagina, "#jogo-habito-aviso"), /1 a 20/);
  await pagina.fill("#jogo-habito-vezes", "4");
  await pagina.click("#jogo-habito-form [type=submit]");
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.jogo_habitos"))[0].xp === 20);
  // O XP já ganho não muda quando o valor do hábito muda.
  await esperarTexto("#jogo-nivel", /10 XP/);
});

test("Coisas a fazer: concluir rende XP, reabrir tira, excluir hábito mantém o XP ganho", async () => {
  await pagina.fill("#jogo-tarefa-titulo", "Tarefa Teste B");
  await pagina.fill("#jogo-tarefa-xp", "50");
  await pagina.click("#jogo-tarefa-salvar");
  await esperarLocal("jogo_tarefas", 1);
  const [t] = await local("jogo_tarefas");
  assert.deepEqual([t.titulo, t.xp, t.feitaEm], ["Tarefa Teste B", 50, null]);

  await pagina.check("#jogo-tarefas [data-jogo-tarefa-feita]");
  await esperarLocal("jogo_checks", 3);
  assert.equal((await local("jogo_tarefas"))[0].feitaEm, "2026-10-08");
  await pagina.waitForFunction(() => /60 XP/.test(document.querySelector("#jogo-nivel").textContent));
  assert.equal(await pagina.isVisible("#jogo-tarefas-feitas"), true);

  await pagina.click("#jogo-tarefas-feitas summary");
  await pagina.uncheck("#jogo-tarefas-feitas-lista [data-jogo-tarefa-feita]");
  await esperarLocal("jogo_checks", 2);
  assert.equal((await local("jogo_tarefas"))[0].feitaEm, null);

  await pagina.click('[data-jogo-acao="excluir"]');
  await pagina.click('[data-jogo-acao="excluir"]'); // segundo toque confirma
  await esperarLocal("jogo_habitos", 0);
  assert.equal((await local("jogo_checks")).length, 2, "checks continuam");
  await pagina.waitForSelector("#jogo-habitos-vazio:not([hidden])");
  await esperarTexto("#jogo-nivel", /10 XP/);
  await pagina.screenshot({ path: path.join(SAIDA, "17-life-game.png"), fullPage: true });
});

test("Personagem: o robô começa sem armadura e o intervalo de evolução é configurável", async () => {
  // Nada definido: sem armadura em qualquer nível.
  await esperarTexto("#jogo-equipamento", /Sem armadura\. Defina/);
  assert.equal(await pagina.locator("#jogo-personagem svg.mascote").count(), 1);
  assert.equal(await pagina.locator("#jogo-personagem .equip").count(), 0);
  assert.equal(await pagina.inputValue("#jogo-niveis-estagio"), "");
  // Intervalo 1 (só para testar): no nível 1 ganha a primeira peça.
  await pagina.fill("#jogo-niveis-estagio", "1");
  await pagina.click("#jogo-evolucao-form [type=submit]");
  await esperarLocal("jogo_personagem", 1);
  assert.equal((await local("jogo_personagem"))[0].niveisPorEstagio, 1);
  await esperarTexto("#jogo-equipamento", /Equipado: Capacete · Ombreiras no nível 2/);
  assert.equal(await pagina.locator("#jogo-personagem .equip").count(), 1);
  // Intervalo 10: nível 1 volta a ficar sem armadura; a próxima peça é no nível 10.
  await pagina.fill("#jogo-niveis-estagio", "10");
  await pagina.click("#jogo-evolucao-form [type=submit]");
  await esperarTexto("#jogo-equipamento", /Sem armadura · Capacete no nível 10/);
  assert.equal((await local("jogo_personagem")).length, 1, "uma configuração só");
  assert.equal(await pagina.locator("#jogo-personagem .equip").count(), 0);
  await pagina.fill("#jogo-niveis-estagio", "0");
  await pagina.click("#jogo-evolucao-form [type=submit]");
  assert.match(await texto(pagina, "#jogo-evolucao-aviso"), /1 a 100/);
  // Limpa a configuração de teste (fica sem regra, como no começo).
  await pagina.fill("#jogo-niveis-estagio", "");
  await pagina.click("#jogo-evolucao-form [type=submit]");
  await esperarTexto("#jogo-equipamento", /Sem armadura\. Defina/);
});

test("Listas: categoria, área opcional, filtros, concluir, editar e excluir", async () => {
  await pagina.click('.subaba[data-aba="rotina-listas"]');
  await pagina.waitForSelector('main[data-vista="rotina-listas"]:not([hidden])');
  assert.equal(await pagina.isVisible("#listas-vazio"), true);
  const opcoes = await pagina.$$eval("#lista-categorias option", (l) => l.map((o) => o.value));
  assert.deepEqual(opcoes, ["Compras", "Desejos", "Coisas a fazer", "Melhorias de vida"]);

  await pagina.click("#lista-salvar");
  assert.match(await texto(pagina, "#lista-aviso"), /Escreva o item/);
  const novo = async (item, categoria, area, obs) => {
    await pagina.fill("#lista-item", item);
    await pagina.fill("#lista-categoria", categoria);
    await pagina.fill("#lista-area", area || "");
    await pagina.fill("#lista-observacoes", obs || "");
    await pagina.click("#lista-salvar");
  };
  await novo("Item Exemplo 1", "Compras", "Cômodo A");
  await novo("Item Exemplo 2", "Compras", "Cômodo B", "uma observação");
  await novo("Item Exemplo 3", "Desejos", "");
  await esperarLocal("lista_itens", 3);
  const itens = await local("lista_itens");
  assert.deepEqual(itens.map((i) => [i.item, i.categoria, i.area, i.dataItem, i.concluidoEm]), [
    ["Item Exemplo 1", "Compras", "Cômodo A", null, null],
    ["Item Exemplo 2", "Compras", "Cômodo B", null, null],
    ["Item Exemplo 3", "Desejos", null, null, null],
  ]);
  await pagina.waitForFunction(() => document.querySelectorAll("#listas-grupos .lista-item").length === 3);
  await esperarTexto("#listas-grupos", /Compras 2 .*Desejos 1/);

  await pagina.click('[data-filtro-categoria="Desejos"]');
  assert.equal(await pagina.locator("#listas-grupos .lista-item").count(), 1);
  await pagina.click('[data-filtro-categoria=""]');
  await pagina.click('[data-filtro-area="Cômodo B"]');
  await esperarTexto("#listas-grupos", /Item Exemplo 2.*uma observação/);
  await pagina.click('[data-filtro-area=""]');

  const item1 = pagina.locator("#listas-grupos .lista-item", { hasText: "Item Exemplo 1" });
  await item1.locator("[data-lista-concluido]").check();
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.lista_itens"))[0].concluidoEm === "2026-10-08");
  await pagina.waitForSelector("#listas-concluidos:not([hidden])");

  await pagina.locator("#listas-grupos .lista-item", { hasText: "Item Exemplo 3" }).locator('[data-lista-acao="editar"]').click();
  await pagina.fill("#lista-area", "Cômodo C");
  await pagina.fill("#lista-data", "2026-10-20");
  await pagina.click("#lista-salvar");
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.lista_itens"))[2].area === "Cômodo C");
  assert.equal((await local("lista_itens"))[2].dataItem, "2026-10-20");
  assert.equal((await local("lista_itens")).length, 3);

  const del = pagina.locator("#listas-grupos .lista-item", { hasText: "Item Exemplo 3" }).locator('[data-lista-acao="excluir"]');
  await del.click();
  await del.click();
  await esperarLocal("lista_itens", 2);
  await pagina.screenshot({ path: path.join(SAIDA, "17-listas.png"), fullPage: true });
  assert.deepEqual(pagina.erros, []);
});

test("Celular (390px): checklist e listas sem rolagem lateral", async () => {
  await pagina.setViewportSize({ width: 390, height: 844 });
  for (const v of ["rotina-jogo", "rotina-listas"]) {
    await pagina.evaluate((h) => { location.hash = h; }, "#" + v);
    await pagina.waitForSelector(`main[data-vista="${v}"]:not([hidden])`);
    const largura = await pagina.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 390, `${v}: ${largura}px`);
  }
  await pagina.screenshot({ path: path.join(SAIDA, "17-listas-celular.png"), fullPage: true });
  await pagina.setViewportSize({ width: 1440, height: 1000 });
});

test("Site publicado: grava no schema vida, com tempo real", async () => {
  const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
  const servidor = http.createServer(async (req, res) => {
    try {
      const arquivo = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/$/, "/index.html"));
      res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
      res.end(await readFile(arquivo));
    } catch { res.writeHead(404); res.end(); }
  }).listen(0);
  try {
    const p = await (await navegador.newContext()).newPage({ viewport: { width: 1280, height: 1000 } });
    const erros = [];
    p.on("pageerror", (e) => erros.push(e.message));
    await p.clock.setFixedTime(HOJE);
    await p.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ path: path.join(RAIZ, "tests/supabase-simulado.js"), contentType: "application/javascript" }));
    await p.goto(`http://127.0.0.1:${servidor.address().port}/#rotina-jogo`);
    await p.waitForSelector("#tela-login:not([hidden])");
    await p.fill("#login-email", "eu@exemplo.com");
    await p.fill("#login-senha", "senha-certa");
    await p.click("[data-acao=entrar]");
    await p.waitForSelector("#tela-login", { state: "hidden" });
    await p.waitForSelector("#jogo-habitos-vazio:not([hidden])");

    await p.click("#jogo-habito-adicionar");
    await p.fill("#jogo-habito-nome", "Hábito Teste C");
    await p.fill("#jogo-habito-vezes", "2");
    await p.fill("#jogo-habito-xp", "7");
    await p.click("#jogo-habito-form [type=submit]");
    await p.waitForSelector('[data-jogo-acao="check"]');
    await p.click('[data-jogo-acao="check"]');
    await p.fill("#jogo-tarefa-titulo", "Tarefa Teste D");
    await p.click("#jogo-tarefa-salvar");
    await p.click('.subaba[data-aba="rotina-listas"]');
    await p.fill("#lista-item", "Item Exemplo 4");
    await p.fill("#lista-categoria", "Compras");
    await p.click("#lista-salvar");
    await p.waitForFunction(() => {
      const db = JSON.parse(sessionStorage.getItem("mock-db") || "{}");
      return db.jogo_habitos?.length === 1 && db.jogo_checks?.length === 1 && db.jogo_tarefas?.length === 1 && db.lista_itens?.length === 1;
    });
    const db = await p.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db")));
    assert.deepEqual([db.jogo_habitos[0].nome, db.jogo_habitos[0].vezes_dia, db.jogo_habitos[0].xp], ["Hábito Teste C", 2, 7]);
    assert.deepEqual([db.jogo_checks[0].habito_id, db.jogo_checks[0].tarefa_id, db.jogo_checks[0].data, db.jogo_checks[0].xp], [db.jogo_habitos[0].id, null, "2026-10-08", 7]);
    assert.deepEqual([db.jogo_tarefas[0].titulo, db.jogo_tarefas[0].xp, db.jogo_tarefas[0].feita_em], ["Tarefa Teste D", 10, null]);
    assert.deepEqual([db.lista_itens[0].item, db.lista_itens[0].categoria, db.lista_itens[0].area, db.lista_itens[0].data_item, db.lista_itens[0].concluido_em], ["Item Exemplo 4", "Compras", null, null, null]);
    const rt = (await p.evaluate(() => window.__realtime)).filter((r) => r.schema === "vida").map((r) => r.tabela);
    for (const t of ["jogo_habitos", "jogo_tarefas", "jogo_checks", "lista_itens"]) assert.ok(rt.includes(t), `tempo real em ${t}`);
    assert.deepEqual(erros, []);
  } finally { servidor.close(); }
});

test("Migração: só aditiva, RLS por usuário, Realtime e build com jogo.js", async () => {
  const pasta = path.join(RAIZ, "supabase/migrations");
  const nome = (await readdir(pasta)).find((n) => n.endsWith("_life_game_listas.sql"));
  assert.ok(nome);
  const sql = await readFile(path.join(pasta, nome), "utf8");
  const codigo = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /\b(drop|truncate|delete\s+from|update\s+(vida|financeiro|public|stefanini|shark|saude|estudos)\.|alter\s+table\s+(?!vida\.%I\s+enable))/i);
  assert.doesNotMatch(codigo, /\binsert\s+into\b/i, "sem dados iniciais na migração");
  for (const t of ["jogo_habitos", "jogo_tarefas", "jogo_checks", "jogo_personagem", "lista_itens"]) assert.match(codigo, new RegExp(`create table if not exists vida\\.${t}\\b`));
  assert.match(codigo, /enable row level security/);
  assert.match(codigo, /alter publication supabase_realtime add table vida\.jogo_habitos, vida\.jogo_tarefas, vida\.jogo_checks, vida\.jogo_personagem, vida\.lista_itens;/);
  const build = await readFile(path.join(RAIZ, "scripts/build.sh"), "utf8");
  assert.match(build, /\bjogo\.js\b/);
});

// Stefanini (CRM de vendas) no modo site publicado, com o Supabase simulado
// (tests/supabase-simulado.js): CRUD de cada tabela do schema stefanini, cálculos do painel
// (realizado / pipeline / quanto falta), funil, vínculos com a conta, estados vazios,
// "Carregando…"/erro, tempo real, celular a 390px e a migração (só aditiva, RLS, Realtime).
// Dados 100% fictícios (contas "Conta Exemplo …", pessoas "Pessoa Teste …", e-mails example.com).
// Hoje nos testes: quinta, 08/10/2026.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { abrirNavegador, RAIZ, HOJE, SAIDA, texto, brl } from "./ajuda.mjs";

let servidor, navegador, pagina, endereco;
const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };

const db = () => pagina.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db") || "{}"));
const tabela = async (nome) => (await db())["stefanini." + nome] || [];
const ir = async (aba) => {
  await pagina.click(`.subaba[data-aba="${aba}"]`);
  await pagina.waitForSelector(`main[data-vista="${aba}"]:not([hidden])`);
};
const cartao = (lista, nome) => pagina.locator(`#${lista} > .stf-cartao`, { has: pagina.locator(`h3:text-is("${nome}")`) });
const esperarLinhas = (nome, n) => pagina.waitForFunction(([t, q]) =>
  (JSON.parse(sessionStorage.getItem("mock-db") || "{}")["stefanini." + t] || []).length === q, [nome, n]);
const txt = async (loc) => (await loc.textContent()).replace(/\s+/g, " ").trim();
const kpi = (chave) => texto(pagina, `#stf-kpis [data-kpi=${chave}] .stf-kpi-valor`);

before(async () => {
  servidor = http.createServer(async (req, res) => {
    try {
      const arquivo = path.join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/$/, "/index.html"));
      res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] || "application/octet-stream" });
      res.end(await readFile(arquivo));
    } catch { res.writeHead(404); res.end(); }
  }).listen(0);
  endereco = `http://127.0.0.1:${servidor.address().port}/`;
  navegador = await abrirNavegador();
  const contexto = await navegador.newContext();
  contexto.setDefaultTimeout(5000);
  pagina = await contexto.newPage({ viewport: { width: 1280, height: 1000 } });
  pagina.erros = [];
  pagina.on("pageerror", (e) => pagina.erros.push(e.message));
  await pagina.clock.setFixedTime(HOJE);
  await pagina.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ path: path.join(RAIZ, "tests/supabase-simulado.js"), contentType: "application/javascript" }));
  await pagina.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ path: path.join(RAIZ, "node_modules/pdfjs-dist/build", r.request().url().split("/").pop()), contentType: "application/javascript" }));
  await pagina.goto(endereco);
  await pagina.waitForSelector("#tela-login:not([hidden])");
  await pagina.fill("#login-email", "eu@exemplo.com");
  await pagina.fill("#login-senha", "senha-certa");
  await pagina.click("[data-acao=entrar]");
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("Aba Stefanini: submenu próprio, schema stefanini e tudo vazio (nada de dados de exemplo)", async () => {
  await pagina.click(".aba[data-area=stefanini]");
  await pagina.waitForSelector('main[data-vista="stefanini"]:not([hidden])');
  assert.equal(await texto(pagina, ".aba[data-area=stefanini]"), "Stefanini");
  assert.equal(await pagina.isVisible('.submenu[data-area-de="stefanini"]'), true);
  assert.equal(await pagina.isVisible('.submenu[data-area-de="shark"]'), false);
  assert.equal(await pagina.isVisible("#timeline"), false);
  assert.deepEqual(await pagina.$$eval('.submenu[data-area-de="stefanini"] .subaba', (a) => a.map((x) => x.textContent.trim())),
    ["Painel", "Oportunidades", "Contas", "Contatos", "Reuniões", "Atividades"]);
  await pagina.waitForFunction(() => !document.querySelector("#stf-kpis.consulta-pendente"));
  assert.equal(await kpi("meta"), "—");
  assert.equal(await kpi("realizado"), brl(0));
  assert.equal(await kpi("pipeline"), brl(0));
  assert.equal(await kpi("falta"), "—");
  assert.equal(await texto(pagina, "#stf-meta-editar"), "Definir meta de 2026");
  assert.match(await texto(pagina, "#stf-funil"), /Nenhuma oportunidade ainda/);

  const schemas = await pagina.evaluate(() => window.__schemas);
  assert.ok(schemas.includes("stefanini"), "usa o schema stefanini");
  assert.equal(await pagina.evaluate(() => window.__ordemStefanini), "created_at", "ordena pela coluna created_at");
  const db0 = await db();
  assert.deepEqual(Object.keys(db0).filter((k) => k.startsWith("stefanini.")), [], "tabelas nascem vazias");

  await ir("stefanini-oportunidades");
  assert.match(await texto(pagina, "#stf-op-vazio"), /Cadastre uma conta primeiro/);
  await ir("stefanini-contas");
  assert.match(await texto(pagina, "#stf-conta-vazio"), /Nenhuma conta ainda/);
  await ir("stefanini-contatos");
  assert.equal(await texto(pagina, "#stf-contato-vazio"), "Nenhum contato ainda.");
  await ir("stefanini-reunioes");
  assert.equal(await texto(pagina, "#stf-reuniao-vazio"), "Nenhuma reunião registrada ainda.");
  await ir("stefanini-atividades");
  assert.equal(await texto(pagina, "#stf-atividade-vazio"), "Nenhuma atividade ainda.");
  assert.equal(await pagina.isVisible("#stf-feitas"), false, "sem feitas, a seção recolhível some");
});

test("Tempo real: as seis tabelas do schema stefanini são escutadas", async () => {
  const rt = (await pagina.evaluate(() => window.__realtime)).filter((r) => r.schema === "stefanini");
  assert.deepEqual(rt.map((r) => r.tabela).sort(), ["atividades", "contas", "contatos", "metas", "oportunidades", "reunioes"]);
  // financeiro.metas continua sendo escutada no schema dela (sem conflito com stefanini.metas).
  assert.ok((await pagina.evaluate(() => window.__realtime)).some((r) => r.schema === "financeiro" && r.tabela === "metas"));
});

test("Contas: cria, valida, edita (mesmo id) e mostra data dd/mm/aaaa", async () => {
  await ir("stefanini-contas");
  await pagina.click("#stf-conta-adicionar");
  await pagina.click("#stf-conta-form [type=submit]");
  assert.equal(await texto(pagina, "#stf-conta-aviso"), "Dê um nome para a conta.");
  await pagina.fill("#stf-conta-nome", "Conta Exemplo Alfa");
  assert.deepEqual((await pagina.$$eval("#stf-conta-status option", (o) => o.map((x) => x.value))), [
    "Prospect / Potencial", "Bloqueado", "Inativo", "Adormecido", "Em implantação", "Em negociação",
    "Em renovação", "Em risco", "Em Manutenção", "Em Expansão", "Perdido / Churn", "Ativo/Saudável"]);
  await pagina.selectOption("#stf-conta-status", "Ativo/Saudável");
  await pagina.fill("#stf-conta-segmento", "Segmento Fictício");
  await pagina.fill("#stf-conta-consultor", "Consultor Teste");
  await pagina.fill("#stf-conta-desde-br", "15/03/2019");
  await pagina.check("#stf-conta-stf");
  await pagina.fill("#stf-conta-notas", "Notas de teste\nsegunda linha");
  await pagina.click("#stf-conta-form [type=submit]");
  await cartao("stf-conta-lista", "Conta Exemplo Alfa").waitFor();
  assert.equal(await pagina.isVisible("#stf-conta-form"), false);

  let [alfa] = await tabela("contas");
  assert.deepEqual(
    [alfa.nome, alfa.status, alfa.segmento, alfa.consultor, alfa.relacionamento_desde, alfa.contrato_stf, alfa.contrato_sda, alfa.notas],
    ["Conta Exemplo Alfa", "Ativo/Saudável", "Segmento Fictício", "Consultor Teste", "2019-03-15", true, false, "Notas de teste\nsegunda linha"]);
  assert.equal(alfa.user_id, undefined, "user_id vem do banco (default auth.uid()), não do app");
  const c = cartao("stf-conta-lista", "Conta Exemplo Alfa");
  assert.match(await c.textContent(), /Ativo\/Saudável.*Segmento Fictício.*Consultor: Consultor Teste.*STF.*0 oportunidades/s);

  // Conta mínima: só nome e status padrão.
  await pagina.click("#stf-conta-adicionar");
  await pagina.fill("#stf-conta-nome", "Conta Exemplo Beta");
  await pagina.click("#stf-conta-form [type=submit]");
  await cartao("stf-conta-lista", "Conta Exemplo Beta").waitFor();
  const beta = (await tabela("contas")).find((x) => x.nome === "Conta Exemplo Beta");
  assert.deepEqual([beta.status, beta.contrato_stf, beta.contrato_sda, beta.segmento, beta.relacionamento_desde],
    ["Prospect / Potencial", false, false, null, null]);

  // Editar mantém o id e o formulário vem preenchido (data em dd/mm/aaaa).
  await c.locator("[data-stf-editar]").click();
  assert.equal(await texto(pagina, "#stf-conta-form-titulo"), "Editar Conta Exemplo Alfa");
  assert.equal(await pagina.inputValue("#stf-conta-desde-br"), "15/03/2019");
  assert.equal(await pagina.isChecked("#stf-conta-stf"), true);
  await pagina.selectOption("#stf-conta-status", "Em Expansão");
  await pagina.check("#stf-conta-sda");
  await pagina.click("#stf-conta-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#stf-conta-lista").textContent.includes("Em Expansão"));
  const contas = await tabela("contas");
  assert.equal(contas.length, 2, "editar não cria outra");
  const alfa2 = contas.find((x) => x.id === alfa.id);
  assert.deepEqual([alfa2.status, alfa2.contrato_sda], ["Em Expansão", true]);

  // Abrir a conta mostra os dados com a data no padrão brasileiro e os grupos vazios.
  await c.locator("[data-stf-abrir]").click();
  await c.locator(".stf-detalhe").waitFor();
  assert.match(await c.locator(".stf-dados-conta").textContent(), /Relacionamento desde\s*15\/03\/2019/);
  for (const g of ["contatos", "oportunidades", "reunioes", "atividades"]) {
    assert.match(await c.locator(`[data-grupo=${g}]`).textContent(), /\(0\).*Nenhum/s, g);
  }
});

test("Contatos: cria ligado a conta, temperatura visível, filtro e edição", async () => {
  await ir("stefanini-contatos");
  const novo = async (nome, { cargo, conta, temperatura, email, telefone } = {}) => {
    await pagina.click("#stf-contato-adicionar");
    await pagina.fill("#stf-contato-nome", nome);
    if (cargo) await pagina.fill("#stf-contato-cargo", cargo);
    if (conta) await pagina.selectOption("#stf-contato-conta", { label: conta });
    if (temperatura) await pagina.selectOption("#stf-contato-temperatura", temperatura);
    if (email) await pagina.fill("#stf-contato-email", email);
    if (telefone) await pagina.fill("#stf-contato-telefone", telefone);
    await pagina.click("#stf-contato-form [type=submit]");
    await cartao("stf-contato-lista", nome).waitFor();
  };
  assert.deepEqual(await pagina.$$eval("#stf-contato-temperatura option", (o) => o.map((x) => x.value)),
    ["", "Prospect", "Contato Frio", "Contato Morno", "Contato Quente", "Quase amigos", "Amigos"]);
  await novo("Pessoa Teste Um", { cargo: "Diretora Fictícia", conta: "Conta Exemplo Alfa", temperatura: "Contato Quente", email: "pessoa1@example.com", telefone: "(11) 90000-0000" });
  await novo("Pessoa Teste Dois", { conta: "Conta Exemplo Alfa", temperatura: "Contato Frio" });
  await novo("Pessoa Teste Três", { conta: "Conta Exemplo Beta" });
  await novo("Pessoa Sem Conta");

  const contas = await tabela("contas");
  const alfa = contas.find((x) => x.nome === "Conta Exemplo Alfa");
  const um = (await tabela("contatos")).find((x) => x.nome === "Pessoa Teste Um");
  assert.deepEqual([um.conta_id, um.cargo, um.temperatura, um.email, um.telefone],
    [alfa.id, "Diretora Fictícia", "Contato Quente", "pessoa1@example.com", "(11) 90000-0000"]);
  const sem = (await tabela("contatos")).find((x) => x.nome === "Pessoa Sem Conta");
  assert.deepEqual([sem.conta_id, sem.temperatura], [null, null]);

  const card = cartao("stf-contato-lista", "Pessoa Teste Um");
  assert.equal(await txt(card.locator(".stf-temp")), "Contato Quente");
  assert.match(await card.textContent(), /Diretora Fictícia.*Conta Exemplo Alfa/s);
  assert.equal(await card.locator("a[href^=mailto]").getAttribute("href"), "mailto:pessoa1@example.com");
  assert.equal(await card.locator("a[href^=tel]").getAttribute("href"), "tel:11900000000");

  await pagina.selectOption("#stf-contato-filtro", "Contato Frio");
  assert.deepEqual(await pagina.$$eval("#stf-contato-lista h3", (h) => h.map((x) => x.textContent)), ["Pessoa Teste Dois"]);
  assert.equal(await texto(pagina, "#stf-contato-resumo"), "1 contato");
  await pagina.selectOption("#stf-contato-filtro", "Amigos");
  assert.equal(await pagina.$$eval("#stf-contato-lista .stf-cartao", (l) => l.length), 0);
  assert.equal(await texto(pagina, "#stf-contato-vazio"), "Nenhum contato com esta temperatura.");
  await pagina.selectOption("#stf-contato-filtro", "");
  assert.equal(await pagina.$$eval("#stf-contato-lista .stf-cartao", (l) => l.length), 4);

  await cartao("stf-contato-lista", "Pessoa Teste Dois").locator("[data-stf-editar]").click();
  await pagina.selectOption("#stf-contato-temperatura", "Quase amigos");
  await pagina.click("#stf-contato-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#stf-contato-lista").textContent.includes("Quase amigos"));
  assert.equal((await tabela("contatos")).length, 4);
});

async function novaOp(nome, { conta, contato, estagio, valor, fechadaEm } = {}) {
  await pagina.click("#stf-op-adicionar");
  await pagina.fill("#stf-op-nome", nome);
  if (conta) await pagina.selectOption("#stf-op-conta", { label: conta });
  if (contato) await pagina.selectOption("#stf-op-contato", { label: contato });
  if (estagio) await pagina.selectOption("#stf-op-estagio", estagio);
  if (valor != null) await pagina.fill("#stf-op-valor", String(valor));
  if (fechadaEm) await pagina.fill("#stf-op-fechada-em-br", fechadaEm);
  await pagina.click("#stf-op-form [type=submit]");
  await cartao("stf-op-lista", nome).waitFor();
}

test("Oportunidades: exige conta, contato só da conta, Win/Lose guardam a data de fechamento", async () => {
  await ir("stefanini-oportunidades");
  assert.equal(await texto(pagina, "#stf-op-vazio"), "Nenhuma oportunidade ainda.");
  await pagina.click("#stf-op-adicionar");
  await pagina.fill("#stf-op-nome", "Oportunidade Sem Conta");
  await pagina.click("#stf-op-form [type=submit]");
  assert.equal(await texto(pagina, "#stf-op-aviso"), "Escolha a conta da oportunidade.");
  assert.deepEqual(await pagina.$$eval("#stf-op-estagio option", (o) => o.map((x) => x.value)), [
    "Identifying Opportunity", "Qualification Opportunity", "Solution Design", "Pricing / Proposal",
    "POC", "Proposal Approval", "With Customer", "Win", "Lose"]);
  // O contato acompanha a conta escolhida.
  await pagina.selectOption("#stf-op-conta", { label: "Conta Exemplo Alfa" });
  assert.deepEqual(await pagina.$$eval("#stf-op-contato option", (o) => o.map((x) => x.textContent)),
    ["Sem contato", "Pessoa Teste Dois", "Pessoa Teste Um — Diretora Fictícia"]);
  await pagina.selectOption("#stf-op-conta", { label: "Conta Exemplo Beta" });
  assert.deepEqual(await pagina.$$eval("#stf-op-contato option", (o) => o.map((x) => x.textContent)), ["Sem contato", "Pessoa Teste Três"]);
  assert.equal(await pagina.isVisible("#stf-op-fechada"), false, "data de fechamento só para Win/Lose");
  await pagina.selectOption("#stf-op-estagio", "Win");
  assert.equal(await pagina.isVisible("#stf-op-fechada"), true);
  await pagina.click("#stf-op-form [data-stf-cancelar]");

  await novaOp("Projeto Fictício A", { conta: "Conta Exemplo Alfa", contato: "Pessoa Teste Um — Diretora Fictícia", estagio: "Win", valor: 300000 });
  await novaOp("Projeto Fictício B", { conta: "Conta Exemplo Alfa", estagio: "Solution Design", valor: 200000 });
  await novaOp("Projeto Fictício C", { conta: "Conta Exemplo Beta", estagio: "POC", valor: "100000.50" });
  await novaOp("Projeto Fictício D", { conta: "Conta Exemplo Beta", estagio: "Lose", valor: 99000 });
  await novaOp("Projeto Fictício E", { conta: "Conta Exemplo Beta", estagio: "Win", valor: 50000, fechadaEm: "20/12/2025" });
  await novaOp("Projeto Fictício F", { conta: "Conta Exemplo Alfa" });

  const ops = await tabela("oportunidades");
  assert.equal(ops.length, 6);
  const por = (n) => ops.find((o) => o.nome === "Projeto Fictício " + n);
  const contas = await tabela("contas");
  const um = (await tabela("contatos")).find((x) => x.nome === "Pessoa Teste Um");
  assert.deepEqual([por("A").conta_id, por("A").contato_id, por("A").estagio, por("A").valor_estimado, por("A").fechada_em],
    [contas.find((c) => c.nome === "Conta Exemplo Alfa").id, um.id, "Win", 300000, "2026-10-08"]);
  assert.equal(por("C").valor_estimado, 100000.5);
  assert.deepEqual([por("B").fechada_em, por("B").contato_id], [null, null], "aberta não tem data de fechamento");
  assert.equal(por("D").fechada_em, "2026-10-08");
  assert.equal(por("E").fechada_em, "2025-12-20");
  assert.deepEqual([por("F").estagio, por("F").valor_estimado], ["Identifying Opportunity", null]);

  const a = cartao("stf-op-lista", "Projeto Fictício A");
  assert.match(await a.textContent(), /Win.*Conta Exemplo Alfa.*Pessoa Teste Um.*R\$\s300\.000,00.*fechada em 08\/10\/2026/s);
  assert.match(await cartao("stf-op-lista", "Projeto Fictício F").textContent(), /sem valor/);

  // Filtro por estágio
  await pagina.selectOption("#stf-op-filtro", "Win");
  assert.deepEqual(await pagina.$$eval("#stf-op-lista h3", (h) => h.map((x) => x.textContent)), ["Projeto Fictício A", "Projeto Fictício E"]);
  assert.equal(await texto(pagina, "#stf-op-resumo"), `2 oportunidades · ${brl(350000)}`);
  await pagina.selectOption("#stf-op-filtro", "With Customer");
  assert.equal(await texto(pagina, "#stf-op-vazio"), "Nenhuma oportunidade neste estágio.");
  await pagina.selectOption("#stf-op-filtro", "");
  assert.equal(await pagina.$$eval("#stf-op-lista .stf-cartao", (l) => l.length), 6);

  // Reabrir uma oportunidade fechada tira a data de fechamento; fechar de novo guarda hoje.
  await cartao("stf-op-lista", "Projeto Fictício D").locator("[data-stf-editar]").click();
  assert.equal(await pagina.inputValue("#stf-op-fechada-em-br"), "08/10/2026");
  await pagina.selectOption("#stf-op-estagio", "With Customer");
  await pagina.click("#stf-op-form [type=submit]");
  await pagina.waitForFunction(() => /With Customer/.test(document.querySelector("#stf-op-lista").textContent));
  const d = (await tabela("oportunidades")).find((o) => o.nome === "Projeto Fictício D");
  assert.deepEqual([d.estagio, d.fechada_em], ["With Customer", null]);
  await cartao("stf-op-lista", "Projeto Fictício D").locator("[data-stf-editar]").click();
  await pagina.selectOption("#stf-op-estagio", "Lose");
  await pagina.click("#stf-op-form [type=submit]");
  await pagina.waitForFunction(() => /fechada em/.test([...document.querySelectorAll("#stf-op-lista .stf-cartao")].find((c) => c.textContent.includes("Fictício D"))?.textContent || ""));
  assert.equal((await tabela("oportunidades")).length, 6);
});

test("Painel: meta anual editável, Realizado (Win no ano), Pipeline (abertas) e Quanto falta", async () => {
  await ir("stefanini");
  // Sem meta: realizado e pipeline já calculados.
  assert.equal(await kpi("realizado"), brl(300000), "só o Win fechado em 2026 (o de 2025 fica fora)");
  assert.equal(await kpi("pipeline"), brl(300000.5), "B 200.000 + C 100.000,50 + F sem valor; Win/Lose fora");
  assert.equal(await kpi("falta"), "—");
  assert.match(await texto(pagina, "#stf-kpis [data-kpi=pipeline]"), /3 oportunidades abertas/);

  await pagina.click("#stf-meta-editar");
  assert.equal(await pagina.inputValue("#stf-meta-ano"), "2026");
  await pagina.fill("#stf-meta-valor", "");
  await pagina.click("#stf-meta-form [type=submit]");
  assert.equal(await texto(pagina, "#stf-meta-aviso"), "Informe o valor da meta.");
  await pagina.fill("#stf-meta-valor", "1000000");
  await pagina.click("#stf-meta-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#stf-kpis [data-kpi=meta] .stf-kpi-valor").textContent !== "—");
  assert.equal(await kpi("meta"), brl(1000000));
  assert.equal(await kpi("realizado"), brl(300000));
  assert.equal(await kpi("falta"), brl(700000));
  assert.match(await texto(pagina, "#stf-kpis [data-kpi=falta]"), /30% da meta realizado/);
  assert.equal(await pagina.getAttribute("#stf-kpis .stf-barra", "aria-valuenow"), "30");
  let metas = await tabela("metas");
  assert.deepEqual(metas.map((m) => [m.ano, m.valor_meta]), [[2026, 1000000]]);

  // Editar o valor atualiza a mesma linha.
  await pagina.click("#stf-meta-editar");
  assert.equal(await pagina.inputValue("#stf-meta-valor"), "1000000");
  await pagina.fill("#stf-meta-valor", "250000");
  await pagina.click("#stf-meta-form [type=submit]");
  await pagina.waitForFunction(() => /250\.000/.test(document.querySelector("#stf-kpis [data-kpi=meta]").textContent));
  assert.equal(await kpi("falta"), brl(0));
  assert.match(await texto(pagina, "#stf-kpis [data-kpi=falta]"), new RegExp(`meta batida · ${brl(50000).replace(/[.$]/g, "\\$&")} acima`));
  metas = await tabela("metas");
  assert.equal(metas.length, 1, "editar não cria outra meta");

  // Editar o ano: a meta de 2025 é outra linha; o painel vai para 2025 e recalcula.
  await pagina.click("#stf-meta-editar");
  await pagina.fill("#stf-meta-ano", "2025");
  await pagina.fill("#stf-meta-valor", "80000");
  await pagina.click("#stf-meta-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#stf-ano").textContent === "2025"
    && /80\.000/.test(document.querySelector("#stf-kpis [data-kpi=meta]").textContent));
  assert.equal(await kpi("realizado"), brl(50000), "Win fechado em 20/12/2025");
  assert.equal(await kpi("falta"), brl(30000));
  assert.deepEqual((await tabela("metas")).map((m) => [m.ano, m.valor_meta]).sort(), [[2025, 80000], [2026, 250000]]);
  await pagina.click("#stf-ano-proximo");
  assert.equal(await texto(pagina, "#stf-ano"), "2026");
  assert.equal(await kpi("meta"), brl(250000));
  await pagina.click("#stf-ano-proximo");
  assert.equal(await kpi("meta"), "—");
  assert.equal(await kpi("realizado"), brl(0));
  assert.equal(await texto(pagina, "#stf-meta-editar"), "Definir meta de 2027");
  await pagina.click("#stf-ano-anterior");

  // Os mesmos cálculos, direto na função (inclui casos de borda).
  const r = await pagina.evaluate(() => {
    const ops = [
      { estagio: "Win", valorEstimado: 100, fechadaEm: "2026-01-02" },
      { estagio: "Win", valorEstimado: 40, fechadaEm: "2025-12-31" },
      { estagio: "Win" }, // sem valor e sem data: conta no ano atual com 0
      { estagio: "Lose", valorEstimado: 999, fechadaEm: "2026-05-05" },
      { estagio: "POC", valorEstimado: 10 },
      { estagio: "Identifying Opportunity", valorEstimado: 5.5 },
    ];
    return [calcularPainelStf(ops, [{ ano: 2026, valorMeta: 90 }], 2026), calcularPainelStf(ops, [], 2025), calcularPainelStf([], [], 2026)];
  });
  assert.deepEqual([r[0].meta, r[0].realizado, r[0].pipeline, r[0].falta, r[0].ganhas, r[0].abertas], [90, 100, 15.5, -10, 2, 2]);
  assert.deepEqual([r[1].meta, r[1].realizado, r[1].falta], [null, 40, null]);
  assert.deepEqual([r[2].realizado, r[2].pipeline, r[2].falta, r[2].abertas], [0, 0, null, 0]);
});

test("Funil: contagem e soma de valor por estágio", async () => {
  const linhas = await pagina.$$eval("#stf-funil li", (ls) => ls.map((l) => [l.dataset.estagio, l.querySelector(".stf-funil-num").textContent.replace(/\s+/g, " ").trim()]));
  assert.deepEqual(linhas.map((l) => l[0]), ["Identifying Opportunity", "Qualification Opportunity", "Solution Design", "Pricing / Proposal",
    "POC", "Proposal Approval", "With Customer", "Win", "Lose"]);
  const num = Object.fromEntries(linhas);
  assert.equal(num["Identifying Opportunity"], `1 · ${brl(0)}`);
  assert.equal(num["Solution Design"], `1 · ${brl(200000)}`);
  assert.equal(num["POC"], `1 · ${brl(100000.5)}`);
  assert.equal(num["Win"], `2 · ${brl(350000)}`);
  assert.equal(num["Lose"], `1 · ${brl(99000)}`);
  assert.equal(num["With Customer"], `0 · ${brl(0)}`);
  const larguras = await pagina.$$eval("#stf-funil li", (ls) => Object.fromEntries(ls.map((l) => [l.dataset.estagio, parseFloat(l.querySelector(".stf-funil-barra span").style.width)])));
  assert.equal(larguras.Win, 100, "o maior valor ocupa a barra inteira");
  assert.equal(larguras["With Customer"], 0);
  assert.ok(Math.abs(larguras["Solution Design"] - (200000 / 350000) * 100) < 0.1);
});

test("Reuniões: data dd/mm/aaaa na tela e ISO no banco, conta opcional, mais recentes primeiro", async () => {
  await ir("stefanini-reunioes");
  await pagina.click("#stf-reuniao-adicionar");
  await pagina.fill("#stf-reuniao-titulo", "Reunião de alinhamento fictícia");
  await pagina.click("#stf-reuniao-form [type=submit]");
  assert.match(await texto(pagina, "#stf-reuniao-aviso"), /Informe a data/);
  await pagina.fill("#stf-reuniao-data-br", "01/10/2026");
  await pagina.selectOption("#stf-reuniao-conta", { label: "Conta Exemplo Alfa" });
  await pagina.fill("#stf-reuniao-anotacoes", "Pontos discutidos:\n- item fictício 1\n- item fictício 2");
  await pagina.click("#stf-reuniao-form [type=submit]");
  await cartao("stf-reuniao-lista", "Reunião de alinhamento fictícia").waitFor();
  await pagina.click("#stf-reuniao-adicionar");
  await pagina.fill("#stf-reuniao-data-br", "07/10/2026");
  await pagina.fill("#stf-reuniao-titulo", "Reunião sem conta");
  await pagina.click("#stf-reuniao-form [type=submit]");
  await cartao("stf-reuniao-lista", "Reunião sem conta").waitFor();

  const rs = await tabela("reunioes");
  const alfa = (await tabela("contas")).find((c) => c.nome === "Conta Exemplo Alfa");
  const r1 = rs.find((r) => r.titulo === "Reunião de alinhamento fictícia");
  assert.deepEqual([r1.data, r1.conta_id, r1.anotacoes], ["2026-10-01", alfa.id, "Pontos discutidos:\n- item fictício 1\n- item fictício 2"]);
  assert.equal(rs.find((r) => r.titulo === "Reunião sem conta").conta_id, null);
  assert.deepEqual(await pagina.$$eval("#stf-reuniao-lista h3", (h) => h.map((x) => x.textContent)), ["Reunião sem conta", "Reunião de alinhamento fictícia"]);
  const card = cartao("stf-reuniao-lista", "Reunião de alinhamento fictícia");
  assert.equal(await txt(card.locator(".stf-data")), "01/10/2026");
  assert.match(await card.locator(".stf-notas").innerText(), /Pontos discutidos:\n- item fictício 1/);

  await card.locator("[data-stf-editar]").click();
  assert.equal(await pagina.inputValue("#stf-reuniao-data-br"), "01/10/2026");
  await pagina.fill("#stf-reuniao-titulo", "Reunião de alinhamento revisada");
  await pagina.click("#stf-reuniao-form [type=submit]");
  await cartao("stf-reuniao-lista", "Reunião de alinhamento revisada").waitFor();
  assert.equal((await tabela("reunioes")).length, 2);
});

test("Atividades: pendentes no topo por data, checkbox registra concluida_em e vai para Feitas (recolhível)", async () => {
  await ir("stefanini-atividades");
  const nova = async (descricao, { data, conta } = {}) => {
    await pagina.click("#stf-atividade-adicionar");
    await pagina.fill("#stf-atividade-descricao", descricao);
    if (data) await pagina.fill("#stf-atividade-data-br", data);
    if (conta) await pagina.selectOption("#stf-atividade-conta", { label: conta });
    await pagina.click("#stf-atividade-form [type=submit]");
    await pagina.locator("#stf-atividade-lista .stf-cartao", { hasText: descricao }).waitFor();
  };
  await nova("Enviar proposta fictícia", { data: "20/10/2026", conta: "Conta Exemplo Alfa" });
  await nova("Ligar para contato fictício", { data: "05/10/2026" });
  await nova("Atividade sem data");
  assert.deepEqual(await pagina.$$eval("#stf-atividade-lista .stf-descricao", (d) => d.map((x) => x.textContent)),
    ["Ligar para contato fictício", "Enviar proposta fictícia", "Atividade sem data"]);
  const atrasada = pagina.locator("#stf-atividade-lista .stf-cartao", { hasText: "Ligar para contato" });
  assert.equal(await txt(atrasada.locator(".stf-data")), "Atrasada · 05/10/2026");
  let ats = await tabela("atividades");
  const enviar = ats.find((a) => a.descricao === "Enviar proposta fictícia");
  assert.deepEqual([enviar.data, enviar.feita, enviar.concluida_em], ["2026-10-20", false, null]);

  await pagina.locator("#stf-atividade-lista .stf-cartao", { hasText: "Enviar proposta" }).locator("[data-stf-feita]").check();
  await pagina.waitForSelector("#stf-feitas:not([hidden])");
  assert.equal(await texto(pagina, "#stf-feitas-titulo"), "Feitas (1)");
  assert.equal(await pagina.$eval("#stf-feitas", (d) => d.open), false, "feitas começam recolhidas");
  assert.equal(await pagina.isVisible("#stf-feitas-lista"), false);
  ats = await tabela("atividades");
  const feita = ats.find((a) => a.descricao === "Enviar proposta fictícia");
  assert.equal(feita.feita, true);
  assert.equal(feita.concluida_em, HOJE.toISOString(), "concluida_em = momento em que foi marcada");
  assert.equal(await pagina.$$eval("#stf-atividade-lista .stf-cartao", (l) => l.length), 2);

  await pagina.click("#stf-feitas-titulo");
  assert.equal(await pagina.isVisible("#stf-feitas-lista"), true);
  const linhaFeita = pagina.locator("#stf-feitas-lista .stf-cartao", { hasText: "Enviar proposta" });
  assert.match(await linhaFeita.textContent(), /feita em 08\/10\/2026/);
  // Editar a atividade feita não a desmarca.
  await linhaFeita.locator("[data-stf-editar]").click();
  await pagina.fill("#stf-atividade-descricao", "Enviar proposta fictícia v2");
  await pagina.click("#stf-atividade-form [type=submit]");
  await pagina.locator("#stf-feitas-lista .stf-cartao", { hasText: "proposta fictícia v2" }).waitFor();
  assert.equal(await pagina.$eval("#stf-feitas", (d) => d.open), true, "continua aberta depois de redesenhar");
  const v2 = (await tabela("atividades")).find((a) => a.descricao === "Enviar proposta fictícia v2");
  assert.deepEqual([v2.feita, v2.concluida_em], [true, HOJE.toISOString()]);

  // Desmarcar volta para as pendentes e limpa concluida_em.
  await pagina.locator("#stf-feitas-lista .stf-cartao", { hasText: "proposta fictícia v2" }).locator("[data-stf-feita]").uncheck();
  await pagina.waitForSelector("#stf-feitas", { state: "hidden" });
  const volta = (await tabela("atividades")).find((a) => a.descricao === "Enviar proposta fictícia v2");
  assert.deepEqual([volta.feita, volta.concluida_em], [false, null]);
  assert.equal(await pagina.$$eval("#stf-atividade-lista .stf-cartao", (l) => l.length), 3);
  // Marca de novo para os próximos testes.
  await pagina.locator("#stf-atividade-lista .stf-cartao", { hasText: "proposta fictícia v2" }).locator("[data-stf-feita]").check();
  await pagina.waitForSelector("#stf-feitas:not([hidden])");
});

test("Conta aberta mostra contatos, oportunidades, reuniões e atividades ligados a ela; + Oportunidade já vem com a conta", async () => {
  await ir("stefanini-contas");
  const alfa = cartao("stf-conta-lista", "Conta Exemplo Alfa");
  if (!(await alfa.locator(".stf-detalhe").count())) await alfa.locator("[data-stf-abrir]").click();
  await alfa.locator(".stf-detalhe").waitFor();
  const grupo = (g) => alfa.locator(`[data-grupo=${g}]`);
  assert.match(await grupo("contatos").textContent(), /\(2\).*Pessoa Teste Dois.*Quase amigos.*Pessoa Teste Um.*Diretora Fictícia.*Contato Quente/s);
  assert.match(await grupo("oportunidades").textContent(), /\(3\).*Projeto Fictício F.*Identifying.*Projeto Fictício B.*Solution Design.*Projeto Fictício A.*Win/s);
  assert.match(await grupo("reunioes").textContent(), /\(1\).*01\/10\/2026.*Reunião de alinhamento revisada/s);
  assert.match(await grupo("atividades").textContent(), /\(1\).*Enviar proposta fictícia v2/s);
  assert.doesNotMatch(await alfa.textContent(), /Pessoa Teste Três|Projeto Fictício C|Reunião sem conta|Ligar para contato/, "nada de outra conta");
  assert.match(await alfa.locator(".stf-cartao-info").textContent(), /3 oportunidades/);

  await grupo("oportunidades").locator("[data-stf-novo=op]").click();
  await pagina.waitForSelector('main[data-vista="stefanini-oportunidades"]:not([hidden])');
  await pagina.waitForSelector("#stf-op-form:not([hidden])");
  assert.equal(await pagina.$eval("#stf-op-conta", (s) => s.selectedOptions[0].textContent), "Conta Exemplo Alfa");
  await pagina.fill("#stf-op-nome", "Projeto Fictício G");
  await pagina.click("#stf-op-form [type=submit]");
  await cartao("stf-op-lista", "Projeto Fictício G").waitFor();
  const g = (await tabela("oportunidades")).find((o) => o.nome === "Projeto Fictício G");
  assert.equal(g.conta_id, (await tabela("contas")).find((c) => c.nome === "Conta Exemplo Alfa").id);
});

test("Exclusões: pedem confirmação, conta com oportunidade não sai, vínculos ficam sem conta/contato", async () => {
  // Contato ligado a uma oportunidade: a oportunidade fica sem contato.
  await ir("stefanini-contatos");
  const ex = cartao("stf-contato-lista", "Pessoa Teste Um").locator("[data-stf-excluir]");
  await ex.click();
  assert.equal(await ex.textContent(), "Excluir?");
  assert.equal((await tabela("contatos")).length, 4, "o primeiro toque só pede confirmação");
  // Tocar fora cancela; o pedido de confirmação sobrevive a um redesenho da lista (tempo real).
  await pagina.click("#titulo-stf-contatos");
  assert.equal(await ex.textContent(), "Excluir");
  await ex.click();
  await pagina.evaluate(() => renderizarContatosStf());
  assert.equal(await ex.textContent(), "Excluir?");
  await ex.click();
  await esperarLinhas("contatos", 3);
  await pagina.waitForFunction(() => !document.querySelector("#stf-contato-lista").textContent.includes("Pessoa Teste Um"));
  assert.equal((await tabela("oportunidades")).find((o) => o.nome === "Projeto Fictício A").contato_id, null);

  // Conta com oportunidades: não exclui e explica.
  await ir("stefanini-contas");
  await cartao("stf-conta-lista", "Conta Exemplo Beta").locator("[data-stf-excluir]").click();
  assert.match(await texto(pagina, "#stf-contas-aviso"), /tem 3 oportunidades\. Exclua-as ou mude-as de conta/);
  assert.equal((await tabela("contas")).length, 2);

  // Excluir oportunidades da Beta e depois a conta: o contato da Beta fica sem conta.
  await ir("stefanini-oportunidades");
  for (const n of ["C", "D", "E"]) {
    const b = cartao("stf-op-lista", "Projeto Fictício " + n).locator("[data-stf-excluir]");
    await b.click(); await b.click();
    await cartao("stf-op-lista", "Projeto Fictício " + n).waitFor({ state: "detached" });
  }
  assert.equal((await tabela("oportunidades")).length, 4);
  await ir("stefanini-contas");
  const exConta = cartao("stf-conta-lista", "Conta Exemplo Beta").locator("[data-stf-excluir]");
  await exConta.click(); await exConta.click();
  await esperarLinhas("contas", 1);
  await cartao("stf-conta-lista", "Conta Exemplo Beta").waitFor({ state: "detached" });
  assert.equal(await pagina.isVisible("#stf-contas-aviso"), false);
  const tres = (await tabela("contatos")).find((c) => c.nome === "Pessoa Teste Três");
  assert.equal(tres.conta_id, null, "contato continua, sem conta");

  // Reunião e atividade
  await ir("stefanini-reunioes");
  const exR = cartao("stf-reuniao-lista", "Reunião sem conta").locator("[data-stf-excluir]");
  await exR.click(); await exR.click();
  await esperarLinhas("reunioes", 1);
  await ir("stefanini-atividades");
  const exA = pagina.locator("#stf-atividade-lista .stf-cartao", { hasText: "Atividade sem data" }).locator("[data-stf-excluir]");
  await exA.click(); await exA.click();
  await esperarLinhas("atividades", 2);
  await pagina.waitForFunction(() => !document.querySelector("#stf-atividade-lista").textContent.includes("Atividade sem data"));

  // Painel recalculado sem as oportunidades excluídas.
  await ir("stefanini");
  assert.equal(await kpi("pipeline"), brl(200000));
  assert.equal(await kpi("realizado"), brl(300000));
});

test("Celular (390px): cartões em uma coluna, ações à vista e nada estoura a tela", async () => {
  await pagina.setViewportSize({ width: 390, height: 844 });
  const semRolagem = () => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const aba of ["stefanini", "stefanini-oportunidades", "stefanini-contas", "stefanini-contatos", "stefanini-reunioes", "stefanini-atividades"]) {
    await ir(aba);
    assert.equal(await semRolagem(), true, `sem rolagem lateral em ${aba}`);
    const medidas = await pagina.$$eval(`main[data-vista="${aba}"] .stf-cartao`, (cs) => cs.filter((c) => c.offsetParent).map((c) => {
      const r = c.getBoundingClientRect();
      const botoes = [...c.querySelectorAll(".stf-acoes button")].map((b) => b.getBoundingClientRect());
      return { esquerda: r.left, direita: r.right, botoes: botoes.map((b) => ({ direita: b.right, altura: b.height, largura: b.width })) };
    }));
    for (const m of medidas) {
      assert.ok(m.direita <= 390 && m.esquerda >= 0, `cartão cabe na tela (${aba})`);
      for (const b of m.botoes) assert.ok(b.direita <= 390 && b.largura > 0 && b.altura >= 32, `Editar/Excluir à vista e tocáveis (${aba})`);
    }
    if (aba === "stefanini-contas") {
      const xs = await pagina.$$eval("#stf-conta-lista > .stf-cartao", (cs) => cs.map((c) => Math.round(c.getBoundingClientRect().left)));
      assert.equal(new Set(xs).size, 1, "uma coluna");
    }
  }
  await ir("stefanini-oportunidades");
  await pagina.click("#stf-op-adicionar");
  assert.ok(await pagina.$eval("#stf-op-form", (f) => f.getBoundingClientRect().right) <= 390, "formulário cabe na tela");
  assert.equal(await semRolagem(), true);
  await pagina.click("#stf-op-form [data-stf-cancelar]");
  await ir("stefanini");
  assert.equal(await pagina.$$eval(".stf-kpi", (k) => new Set(k.map((x) => Math.round(x.getBoundingClientRect().top))).size), 2, "KPIs em 2×2");
  await pagina.screenshot({ path: path.join(SAIDA, "stefanini-celular.png"), fullPage: true });
  await pagina.setViewportSize({ width: 1280, height: 1000 });
});

test("Recarregar mantém tudo; consulta lenta mostra “Carregando…” e falha mostra o erro (sem “nenhum”)", async () => {
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await pagina.goto(endereco + "#stefanini-contas");
  await cartao("stf-conta-lista", "Conta Exemplo Alfa").waitFor();
  assert.equal(await pagina.isVisible("#stf-conta-vazio"), false);

  await pagina.evaluate(() => sessionStorage.setItem("mock-atrasar-stefanini", "800"));
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await pagina.waitForSelector("#stf-conta-vazio.consulta-pendente", { state: "attached" });
  assert.equal(await pagina.$eval("#stf-conta-vazio", (p) => getComputedStyle(p, "::before").content), '"Carregando…"');
  await cartao("stf-conta-lista", "Conta Exemplo Alfa").waitFor();
  assert.equal(await pagina.$eval("#stf-conta-vazio", (p) => p.classList.contains("consulta-pendente")), false);

  await pagina.evaluate(() => { sessionStorage.removeItem("mock-atrasar-stefanini"); sessionStorage.setItem("mock-falhar-stefanini", "1"); });
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await pagina.waitForSelector("#stf-conta-vazio.consulta-erro", { state: "attached" });
  assert.equal(await pagina.$eval("#stf-conta-vazio", (p) => getComputedStyle(p, "::before").content), '"Não foi possível carregar. Recarregue a página."');
  await pagina.goto(endereco + "#stefanini");
  await pagina.waitForSelector("#stf-kpis.consulta-erro", { state: "attached" });
  assert.match(await texto(pagina, "#stf-aviso"), /Não foi possível carregar o CRM Stefanini/);
  await pagina.evaluate(() => sessionStorage.removeItem("mock-falhar-stefanini"));
  assert.deepEqual(pagina.erros, []);
});

test("Migração: só aditiva, RLS por usuário, Realtime e build com o arquivo novo", async () => {
  const pasta = path.join(RAIZ, "supabase/migrations");
  const arquivos = await readdir(pasta);
  assert.ok(arquivos.includes("20261109120000_shark_materiais.sql"), "migração de shark.materiais preservada");
  const shark = await readFile(path.join(pasta, "20261109120000_shark_materiais.sql"), "utf8");
  assert.match(shark, /create table if not exists shark\.materiais/);
  const nome = arquivos.find((a) => /stefanini/.test(a));
  assert.ok(nome && nome > "20261109120000_shark_materiais.sql", "migração nova depois da de materiais");
  const sql = await readFile(path.join(pasta, nome), "utf8");
  const codigo = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /\bdrop\s|\btruncate\b|\bdelete\s+from\b|alter\s+table\s+(?!stefanini\.)/i, "nada é removido nem alterado fora do schema novo");
  assert.doesNotMatch(codigo, /\binsert\s+into\b/i, "sem dados de exemplo (tabelas nascem vazias)");
  const tabelas = ["contas", "contatos", "oportunidades", "reunioes", "atividades", "metas"];
  for (const t of tabelas) assert.match(codigo, new RegExp(`create table if not exists stefanini\\.${t} \\(`), t);
  assert.match(codigo, /foreach t in array array\['contas', 'contatos', 'oportunidades', 'reunioes', 'atividades', 'metas'\] loop\s+execute format\('alter table stefanini\.%I enable row level security'/);
  for (const p of ["dono lê", "dono cria", "dono altera", "dono apaga"]) assert.match(codigo, new RegExp(`create policy "${p}" on stefanini\\.%I .*user_id = \\(select auth\\.uid\\(\\)\\)`), p);
  assert.match(codigo, /alter publication supabase_realtime add table stefanini\.contas, stefanini\.contatos,\s+stefanini\.oportunidades, stefanini\.reunioes, stefanini\.atividades, stefanini\.metas;/);
  assert.match(codigo, /pgrst\.db_schemas = 'public, graphql_public, financeiro, estudos, saude, shark, vida, stefanini'/);
  assert.match(codigo, /oportunidades[\s\S]*conta_id uuid not null references stefanini\.contas \(id\) on delete restrict/);

  const build = await readFile(path.join(RAIZ, "scripts/build.sh"), "utf8");
  const html = await readFile(path.join(RAIZ, "index.html"), "utf8");
  const locais = [...html.matchAll(/<script src="([^":]+)"/g)].map((m) => m[1]);
  assert.ok(locais.includes("stefanini.js"));
  for (const f of locais) assert.match(build, new RegExp(`\\b${f.replace(".", "\\.")}\\b`), `${f} está na lista do build`);
});

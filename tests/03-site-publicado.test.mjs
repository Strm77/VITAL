// Site publicado (modo Supabase): login e gravação nas tabelas do schema financeiro,
// usando um Supabase simulado servido no lugar do supabase-js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { abrirNavegador, RAIZ, HOJE, SAIDA } from "./ajuda.mjs";
import { gerarPdfs } from "./simulacao/gerar-pdfs.mjs";

let servidor, navegador, pagina, endereco, pdfs;
const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };

before(async () => {
  pdfs = await gerarPdfs(path.join(SAIDA, "pdfs"));
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
  pagina = await contexto.newPage();
  pagina.erros = [];
  pagina.on("pageerror", (e) => pagina.erros.push(e.message));
  await pagina.clock.setFixedTime(HOJE);
  await pagina.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ path: path.join(RAIZ, "tests/supabase-simulado.js"), contentType: "application/javascript" }));
  await pagina.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ path: path.join(RAIZ, "node_modules/pdfjs-dist/build", r.request().url().split("/").pop()), contentType: "application/javascript" }));
  await pagina.goto(endereco);
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("Sem login, só a tela de entrar aparece", async () => {
  await pagina.waitForSelector("#tela-login:not([hidden])");
  assert.equal(await pagina.isVisible("#lista-dividas"), false);
  assert.equal(await pagina.isVisible(".timeline"), false);
  assert.deepEqual(await pagina.evaluate(() => window.__opcoes), { db: { schema: "financeiro" } });
});

test("Senha errada e cadastro de e-mail não permitido mostram mensagem clara", async () => {
  await pagina.fill("#login-email", "eu@exemplo.com");
  await pagina.fill("#login-senha", "errada1");
  await pagina.click("[data-acao=entrar]");
  await pagina.waitForSelector("#login-aviso:not([hidden])");
  assert.equal(await pagina.textContent("#login-aviso"), "E-mail ou senha incorretos.");
  await pagina.click("[data-acao=criar]");
  await pagina.waitForFunction(() => document.querySelector("#login-aviso").textContent.includes("não tem acesso"));
});

test("Login certo abre o painel vazio (sem os exemplos)", async () => {
  await pagina.fill("#login-senha", "senha-certa");
  await pagina.click("[data-acao=entrar]");
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await pagina.waitForSelector("#vazio:not([hidden])");
  assert.equal(await pagina.textContent("#usuario-email"), "eu@exemplo.com");
  assert.equal(await pagina.$$eval("#pag-tabela tbody tr", (t) => t.length), 0);
});

test("Cadastros vão para as tabelas e voltam do banco", async () => {
  await pagina.click("#botao-adicionar");
  await pagina.fill("#campo-nome", "Notebook");
  await pagina.fill("#campo-valor", "300");
  await pagina.fill("#campo-total", "10");
  await pagina.fill("#campo-inicio", "2026-10");
  await pagina.click("#formulario [type=submit]");
  await pagina.waitForSelector(".divida");
  await pagina.click("#pag-adicionar");
  await pagina.fill("#pag-nome", "Energia");
  await pagina.fill("#pag-valor", "212.4");
  await pagina.fill("#pag-vencimento", "2026-10-12");
  await pagina.click("#pag-form [type=submit]");
  await pagina.waitForSelector("#pag-tabela tbody tr");
  await pagina.locator("#pag-tabela tbody tr", { hasText: "Energia" }).locator("[data-acao=pagar]").click();
  await pagina.waitForFunction(() => document.querySelector("#pag-tabela tbody tr").textContent.includes("Pago"));
  const db = await pagina.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db")));
  assert.equal(db.dividas[0].valor_parcela, 300);
  assert.equal(db.dividas[0].primeira_parcela, "2026-10");
  assert.equal(db.pagamentos[0].status, "pago");
  assert.match(db.pagamentos[0].pago_em, /^2026-10-08/);
});

test("Fatura em PDF: fatura, lançamentos e conta automática nas tabelas certas", async () => {
  await pagina.click(".subaba[data-aba=faturas]");
  const { arquivo } = pdfs[0];
  await pagina.setInputFiles("#pdf-arquivo", arquivo);
  await pagina.waitForSelector("#previa:not([hidden])");
  await pagina.fill("#previa-novo", "Nubank");
  await pagina.click("#previa [type=submit]");
  await pagina.waitForSelector("#previa", { state: "hidden" });
  await pagina.waitForFunction(() => (JSON.parse(sessionStorage.getItem("mock-db")).pagamentos || []).some((p) => p.origem === "fatura"));
  const db = await pagina.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db")));
  assert.equal(db.cartoes.length, 1);
  assert.equal(db.faturas.length, 1);
  assert.equal(db.faturas[0].vencimento, "2026-10-15");
  assert.equal(db.lancamentos.length, 10);
  assert.deepEqual(db.lancamentos.map((l) => l.ordem), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const conta = db.pagamentos.find((p) => p.origem === "fatura");
  assert.equal(conta.fatura_id, db.faturas[0].id);
  assert.equal(conta.valor, 661.85);
  await pagina.waitForSelector("#parcelamentos-corpo tr");
});

test("Remover um lançamento troca os lançamentos da fatura no banco", async () => {
  const botao = pagina.locator("#planilha tbody tr", { hasText: "Padaria" }).locator("button");
  await botao.click(); await botao.click();
  await pagina.waitForFunction(() => JSON.parse(sessionStorage.getItem("mock-db")).lancamentos.length === 9);
  await pagina.waitForFunction(() => JSON.parse(sessionStorage.getItem("mock-db")).pagamentos.find((p) => p.origem === "fatura").valor_fatura === 643.45);
});

test("Recarregar mantém a sessão e os dados", async () => {
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await pagina.click(".subaba[data-aba=painel]");
  await pagina.waitForSelector(".divida");
  assert.equal(await pagina.$$eval("#pag-tabela tbody tr", (t) => t.length), 2);
});

test("Sair volta para a tela de login", async () => {
  await Promise.all([pagina.waitForEvent("load"), pagina.click("#sair")]);
  await pagina.waitForSelector("#tela-login:not([hidden])");
});

test("Nenhum erro de JavaScript", () => assert.deepEqual(pagina.erros, []));

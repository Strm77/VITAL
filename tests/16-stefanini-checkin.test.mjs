// Stefanini › Check-in semanal, no modo site publicado com o Supabase simulado
// (tests/supabase-simulado.js): CRUD do check-in e dos itens, cliente por conta OU rótulo livre,
// ordem, os dois aceleradores (nada vira "Semana Passada" sem confirmação), histórico com edição,
// PDF A4 (lido de volta com o pdf.js), conta excluída sem perder o nome, celular e a migração.
// Dados 100% fictícios: "Conta Exemplo …", "Evento Fictício", textos inventados.
// Hoje nos testes: quinta, 08/10/2026 (semana de 05/10 a 11/10; a anterior, 28/09 a 04/10).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { abrirNavegador, RAIZ, HOJE, SAIDA } from "./ajuda.mjs";

let servidor, navegador, pagina, endereco;
const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };

const db = () => pagina.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db") || "{}"));
const tabela = async (nome) => (await db())["stefanini." + nome] || [];
const esperar = (fn, arg) => pagina.waitForFunction(fn, arg);
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const secao = (nome) => pagina.locator(`#stf-ck-secoes .stf-ck-secao[data-secao="${nome}"]`);
const itensDa = (nome) => secao(nome).locator(".stf-ck-item");
const cartao = (data) => pagina.locator("#stf-ck-lista > .stf-ck-cartao", { has: pagina.locator(`h3:text-is("Check-in de ${data}")`) });

async function irCheckin() {
  await pagina.click(".aba[data-area=stefanini]");
  await pagina.click('.subaba[data-aba="stefanini-checkin"]');
  await pagina.waitForSelector('main[data-vista="stefanini-checkin"]:not([hidden])');
}
async function novoItem(secaoNome, { cliente, rotulo, atividades }) {
  await secao(secaoNome).locator("[data-ck-add]").click();
  const item = itensDa(secaoNome).last();
  if (cliente) await item.locator("[data-ck-campo=cliente]").selectOption({ label: cliente });
  if (rotulo != null) {
    await item.locator("[data-ck-campo=cliente]").selectOption({ label: "Outro (texto livre)…" });
    await item.locator("[data-ck-campo=rotulo]").fill(rotulo);
  }
  if (atividades != null) await item.locator("[data-ck-campo=atividades]").fill(atividades);
  return item;
}
async function definirData(br) {
  await pagina.fill("#stf-ck-semana-br", br);
}
async function salvar() {
  await pagina.click("#stf-ck-form [type=submit]");
}
/* Gera o PDF pelo botão e devolve, lido pelo pdf.js da própria página: tamanho das páginas e
 * o texto de cada página com a fonte (negrito ou não) e a posição. */
async function gerarPdf(botao) {
  const [download] = await Promise.all([pagina.waitForEvent("download"), botao.click()]);
  const bytes = await readFile(await download.path());
  const lido = await pagina.evaluate(async (b64) => {
    const dados = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data: dados }).promise;
    const paginas = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      await p.getOperatorList();
      const vp = p.getViewport({ scale: 1 });
      const tc = await p.getTextContent();
      const itens = tc.items.filter((i) => i.str.trim()).map((i) => ({
        str: i.str, x: i.transform[4], y: vp.height - i.transform[5], largura: i.width,
        negrito: /bold/i.test(p.commonObjs.get(i.fontName)?.name || ""),
      }));
      paginas.push({ largura: vp.width, altura: vp.height, itens });
    }
    return paginas;
  }, bytes.toString("base64"));
  await writeFile(path.join(SAIDA, download.suggestedFilename()), bytes);
  return { nome: download.suggestedFilename(), bytes, paginas: lido };
}

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
  const contexto = await navegador.newContext({ acceptDownloads: true });
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
  // CRM fictício: duas contas, reuniões e atividades na semana anterior e nesta.
  await pagina.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem("mock-db") || "{}");
    db["stefanini.contas"] = [
      { id: "conta-alfa", nome: "Conta Exemplo Alfa", status: "Ativo/Saudável", contrato_stf: true, contrato_sda: false },
      { id: "conta-beta", nome: "Conta Exemplo Beta", status: "Em negociação", contrato_stf: false, contrato_sda: false },
    ];
    db["stefanini.reunioes"] = [
      { id: "r1", conta_id: "conta-alfa", data: "2026-09-29", titulo: "Alinhamento fictício" },
      { id: "r2", conta_id: "conta-beta", data: "2026-10-07", titulo: "Apresentação fictícia" },
      { id: "r3", conta_id: null, data: "2026-09-15", titulo: "Fora do período" },
    ];
    db["stefanini.atividades"] = [
      { id: "a1", conta_id: "conta-alfa", descricao: "Enviar proposta fictícia", data: "2026-09-30", feita: true, concluida_em: "2026-10-01T15:00:00Z" },
      { id: "a2", conta_id: "conta-beta", descricao: "Ligar para o contato fictício", data: "2026-10-09", feita: false },
      { id: "a3", conta_id: null, descricao: "Tarefa sem conta já feita", data: "2026-10-02", feita: true, concluida_em: "2026-10-02T10:00:00Z" },
    ];
    sessionStorage.setItem("mock-db", JSON.stringify(db));
  });
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("Navegação: Check-in é a última subaba da Stefanini e começa vazio", async () => {
  await irCheckin();
  const abas = await pagina.$$eval('.submenu[data-area-de="stefanini"] .subaba', (a) => a.map((x) => x.textContent.trim()));
  assert.deepEqual(abas, ["Painel", "Oportunidades", "Contas", "Contatos", "Reuniões", "Atividades", "Check-in"]);
  assert.equal(await pagina.getAttribute('.subaba[data-aba="stefanini-checkin"]', "aria-current"), "page");
  await pagina.waitForSelector("#stf-ck-vazio:not(.consulta-pendente)");
  assert.equal(await txt(pagina.locator("#stf-ck-vazio")), "Nenhum check-in ainda.");
  assert.equal(await pagina.isVisible("#stf-ck-form"), false);
  const rt = (await pagina.evaluate(() => window.__realtime)).filter((r) => r.schema === "stefanini").map((r) => r.tabela);
  assert.ok(rt.includes("checkins") && rt.includes("checkin_itens"), "tempo real nas duas tabelas novas");
});

test("Cria um check-in: seções, cliente por conta ou rótulo livre, quebras de linha e ordem", async () => {
  await pagina.click("#stf-ck-novo");
  assert.equal(await txt(pagina.locator("#stf-ck-form-titulo")), "Novo check-in");
  assert.equal(await pagina.inputValue("#stf-ck-semana"), "2026-10-08", "data de hoje como padrão");
  assert.equal(await pagina.inputValue("#stf-ck-semana-br"), "08/10/2026");
  await definirData("01/10/2026");
  assert.deepEqual(await pagina.$$eval("#stf-ck-secoes .stf-ck-secao h4", (h) => h.map((x) => x.firstChild.textContent.trim())),
    ["Semana Passada", "Essa Semana", "Pedido de Ajuda"]);

  await novoItem("Semana Passada", { cliente: "Conta Exemplo Beta", atividades: "Reunião de kickoff fictícia" });
  await novoItem("Essa Semana", { rotulo: "Evento Fictício", atividades: "Preparar o stand" });
  await novoItem("Essa Semana", { cliente: "Conta Exemplo Alfa", atividades: "Linha um da Alfa\nLinha dois da Alfa" });
  await novoItem("Pedido de Ajuda", { atividades: "Apoio fictício do time interno" });
  // Ordem: a Alfa sobe para o primeiro lugar de "Essa Semana".
  await itensDa("Essa Semana").nth(1).locator('[data-ck-mover="-1"]').click();
  assert.equal(await itensDa("Essa Semana").first().locator("[data-ck-campo=atividades]").inputValue(), "Linha um da Alfa\nLinha dois da Alfa");
  assert.equal(await itensDa("Essa Semana").first().locator('[data-ck-mover="-1"]').isDisabled(), true);
  await salvar();
  await pagina.waitForSelector("#stf-ck-form", { state: "hidden" });

  const [ckin] = await tabela("checkins");
  assert.equal(ckin.semana, "2026-10-01");
  const itens = (await tabela("checkin_itens")).sort((a, b) => a.ordem - b.ordem);
  assert.deepEqual(itens.map((i) => [i.secao, i.ordem, i.conta_id, i.cliente_rotulo, i.atividades]), [
    ["Semana Passada", 0, "conta-beta", null, "Reunião de kickoff fictícia"],
    ["Essa Semana", 1, "conta-alfa", null, "Linha um da Alfa\nLinha dois da Alfa"],
    ["Essa Semana", 2, null, "Evento Fictício", "Preparar o stand"],
    ["Pedido de Ajuda", 3, null, null, "Apoio fictício do time interno"],
  ]);
  assert.ok(itens.every((i) => i.checkin_id === ckin.id));
  // Depois de salvar, a semana aparece aberta (mesma tabela do PDF) e no histórico.
  const doc = pagina.locator("#stf-ck-ver .stf-ck-doc");
  await doc.waitFor();
  assert.match(await txt(doc), /^Check-in semanal 01\/10\/2026 Cliente Atividades Semana Passada Conta Exemplo Beta Reunião de kickoff fictícia Essa Semana Conta Exemplo Alfa Linha um da Alfa Linha dois da Alfa Evento Fictício Preparar o stand Pedido de Ajuda Apoio fictício do time interno$/);
  assert.equal(await pagina.$eval("#stf-ck-ver .stf-ck-col-ativ", (td) => getComputedStyle(td).whiteSpace), "pre-wrap", "quebras de linha mantidas");
  assert.match(await txt(cartao("01/10/2026")), /Semana Passada: 1 Essa Semana: 2 Pedido de Ajuda: 1/);
});

test("Validação: data obrigatória, item sem texto, rótulo livre vazio e semana repetida", async () => {
  await pagina.click("#stf-ck-novo");
  await definirData("");
  await salvar();
  assert.match(await txt(pagina.locator("#stf-ck-form-aviso")), /Informe a data de referência/);
  await definirData("30/09/2026");
  await salvar();
  assert.match(await txt(pagina.locator("#stf-ck-form-aviso")), /Já existe um check-in nesta semana \(01\/10\/2026\)/);
  await definirData("15/10/2026");
  await novoItem("Essa Semana", { cliente: "Conta Exemplo Alfa", atividades: "" });
  await salvar();
  assert.match(await txt(pagina.locator("#stf-ck-form-aviso")), /Escreva as atividades do item em “Essa Semana”/);
  await itensDa("Essa Semana").first().locator("[data-ck-remover]").click();
  await novoItem("Pedido de Ajuda", { rotulo: "", atividades: "Algo fictício" });
  await salvar();
  assert.match(await txt(pagina.locator("#stf-ck-form-aviso")), /Escreva o nome do cliente/);
  assert.equal((await tabela("checkins")).length, 1, "nada foi gravado");
  await pagina.click("#stf-ck-cancelar");
  assert.equal(await pagina.isVisible("#stf-ck-form"), false);
});

test("Acelerador (a): “Essa Semana” do último check-in vira sugestão, que só entra confirmada", async () => {
  await pagina.click("#stf-ck-novo");
  assert.equal(await pagina.isVisible("#stf-ck-aceleradores"), true, "aceleradores só ao criar");
  await pagina.click("#stf-ck-copiar");
  const sugestoes = pagina.locator("#stf-ck-sugestoes .stf-ck-sugestao");
  assert.equal(await sugestoes.count(), 2);
  assert.match(await txt(pagina.locator("#stf-ck-sugestoes")), /Sugestões \(2\) — confirme uma a uma/);
  assert.deepEqual(await sugestoes.locator("[data-sug-campo=secao]").evaluateAll((s) => s.map((x) => x.value)), ["Semana Passada", "Semana Passada"]);
  assert.equal(await itensDa("Semana Passada").count(), 0, "nada entra sem confirmação");
  // Edita a primeira (Alfa) e adiciona; descarta a segunda (Evento).
  await sugestoes.first().locator("[data-sug-campo=atividades]").fill("Linha um da Alfa — feita\nLinha dois da Alfa");
  await sugestoes.first().locator("[data-sug-acao=adicionar]").click();
  assert.equal(await itensDa("Semana Passada").count(), 1);
  const item = itensDa("Semana Passada").first();
  assert.equal(await item.locator("[data-ck-campo=cliente]").inputValue(), "conta-alfa");
  assert.equal(await item.locator("[data-ck-campo=atividades]").inputValue(), "Linha um da Alfa — feita\nLinha dois da Alfa");
  assert.match(await txt(sugestoes.first()), /Evento Fictício/);
  await sugestoes.first().locator("[data-sug-acao=descartar]").click();
  assert.equal(await sugestoes.count(), 0);
  assert.equal(await itensDa("Semana Passada").count(), 1, "descartar não adiciona");
});

test("Acelerador (b): sugestões das reuniões e atividades do CRM, por cliente, só com confirmação", async () => {
  await pagina.click("#stf-ck-sugerir");
  const sugestoes = pagina.locator("#stf-ck-sugestoes .stf-ck-sugestao");
  assert.equal(await sugestoes.count(), 3);
  const lidas = await sugestoes.evaluateAll((l) => l.map((s) => ({
    cliente: s.querySelector("strong").textContent, secao: s.querySelector("[data-sug-campo=secao]").value,
    texto: s.querySelector("[data-sug-campo=atividades]").value })));
  assert.deepEqual(lidas, [
    { cliente: "Conta Exemplo Alfa", secao: "Semana Passada", texto: "Reunião: Alinhamento fictício\nEnviar proposta fictícia" },
    { cliente: "Sem cliente", secao: "Semana Passada", texto: "Tarefa sem conta já feita" },
    { cliente: "Conta Exemplo Beta", secao: "Essa Semana", texto: "Reunião: Apresentação fictícia\nLigar para o contato fictício" },
  ]);
  assert.match(await txt(sugestoes.first()), /CRM · 28\/09\/2026 a 04\/10\/2026/);
  assert.equal(await itensDa("Semana Passada").count(), 1, "sugerir não adiciona nada sozinho");
  // A pessoa decide a seção: a sugestão de "realizado" sem cliente vai para "Essa Semana".
  await sugestoes.nth(1).locator("[data-sug-campo=secao]").selectOption("Essa Semana");
  await sugestoes.nth(1).locator("[data-sug-acao=adicionar]").click();
  await sugestoes.last().locator("[data-sug-acao=adicionar]").click();
  assert.equal(await sugestoes.count(), 1, "a da Alfa continua pendente");
  assert.equal(await itensDa("Semana Passada").count(), 1);
  assert.equal(await itensDa("Essa Semana").count(), 2);
  await salvar();
  await pagina.waitForSelector("#stf-ck-form", { state: "hidden" });
  const novo = (await tabela("checkins")).find((c) => c.semana === "2026-10-08");
  const itens = (await tabela("checkin_itens")).filter((i) => i.checkin_id === novo.id).sort((a, b) => a.ordem - b.ordem);
  assert.deepEqual(itens.map((i) => [i.secao, i.conta_id, i.atividades]), [
    ["Semana Passada", "conta-alfa", "Linha um da Alfa — feita\nLinha dois da Alfa"],
    ["Essa Semana", null, "Tarefa sem conta já feita"],
    ["Essa Semana", "conta-beta", "Reunião: Apresentação fictícia\nLigar para o contato fictício"],
  ]);
});

test("Histórico: semanas da mais recente para a mais antiga; ver e editar qualquer semana", async () => {
  await cartao("08/10/2026").waitFor();
  assert.deepEqual(await pagina.$$eval("#stf-ck-lista h3", (h) => h.map((x) => x.textContent)), ["Check-in de 08/10/2026", "Check-in de 01/10/2026"]);
  await cartao("01/10/2026").locator("[data-ck-acao=ver]").click();
  assert.match(await txt(pagina.locator("#stf-ck-ver")), /01\/10\/2026.*Reunião de kickoff fictícia/);
  await pagina.click("#stf-ck-ver [data-ck-ver=editar]");
  assert.equal(await txt(pagina.locator("#stf-ck-form-titulo")), "Editar check-in de 01/10/2026");
  assert.equal(await pagina.isVisible("#stf-ck-aceleradores"), false);
  const antes = (await tabela("checkin_itens")).filter((i) => i.secao !== "Pedido de Ajuda");
  await itensDa("Semana Passada").first().locator("[data-ck-campo=atividades]").fill("Kickoff fictício revisado");
  // Troca de seção e remoção.
  await itensDa("Essa Semana").last().locator("[data-ck-campo=secao]").selectOption("Pedido de Ajuda");
  assert.equal(await itensDa("Pedido de Ajuda").count(), 2);
  await itensDa("Pedido de Ajuda").first().locator("[data-ck-remover]").click();
  await salvar();
  await pagina.waitForSelector("#stf-ck-form", { state: "hidden" });
  const ckin = (await tabela("checkins")).find((c) => c.semana === "2026-10-01");
  const depois = (await tabela("checkin_itens")).filter((i) => i.checkin_id === ckin.id).sort((a, b) => a.ordem - b.ordem);
  assert.deepEqual(depois.map((i) => [i.secao, i.atividades]), [
    ["Semana Passada", "Kickoff fictício revisado"],
    ["Essa Semana", "Linha um da Alfa\nLinha dois da Alfa"],
    ["Pedido de Ajuda", "Preparar o stand"],
  ]);
  const idsAntes = new Set(antes.map((i) => i.id));
  assert.ok(depois.every((i) => idsAntes.has(i.id)), "edição mantém os ids dos itens");
  assert.equal((await tabela("checkins")).length, 2);
});

test("Gerar PDF: A4, título e data em negrito, tabela Cliente | Atividades com seções e cliente em negrito", async () => {
  const pdf = await gerarPdf(cartao("01/10/2026").locator("[data-ck-acao=pdf]"));
  assert.equal(pdf.nome, "checkin-semanal-2026-10-01.pdf");
  assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pdf.paginas.length, 1);
  const [p] = pdf.paginas;
  assert.ok(Math.abs(p.largura - 595.28) < 0.5 && Math.abs(p.altura - 841.89) < 0.5, "página A4 em retrato");
  // Leitura de cima para baixo (e da esquerda para a direita na mesma altura). Na linha da Alfa,
  // com duas linhas de texto, o nome do cliente fica centralizado na vertical, entre elas.
  const ordem = p.itens.slice().sort((a, b) => (Math.abs(a.y - b.y) < 1 ? a.x - b.x : a.y - b.y));
  assert.deepEqual(ordem.map((i) => i.str), [
    "Check-in semanal", "01/10/2026", "Cliente", "Atividades",
    "Semana Passada", "Conta Exemplo Beta", "Kickoff fictício revisado",
    "Essa Semana", "Linha um da Alfa", "Conta Exemplo Alfa", "Linha dois da Alfa",
    "Pedido de Ajuda", "Evento Fictício", "Preparar o stand",
  ]);
  const achar = (s) => p.itens.find((i) => i.str === s);
  for (const s of ["Check-in semanal", "01/10/2026", "Cliente", "Atividades", "Semana Passada", "Essa Semana", "Pedido de Ajuda", "Conta Exemplo Beta", "Conta Exemplo Alfa", "Evento Fictício"]) {
    assert.ok(achar(s), `${s} no PDF`);
    assert.equal(achar(s).negrito, true, `${s} em negrito`);
  }
  for (const s of ["Kickoff fictício revisado", "Linha um da Alfa", "Linha dois da Alfa", "Preparar o stand"]) {
    assert.equal(achar(s).negrito, false, `${s} sem negrito`);
  }
  // Ordem vertical: título, data, cabeçalho, seções na ordem; quebra de linha vira duas linhas.
  const y = (s) => achar(s).y;
  assert.ok(y("Check-in semanal") < y("01/10/2026") && y("01/10/2026") < y("Cliente"));
  assert.ok(Math.abs(y("Cliente") - y("Atividades")) < 1, "cabeçalho na mesma linha");
  assert.ok(y("Cliente") < y("Semana Passada") && y("Semana Passada") < y("Essa Semana") && y("Essa Semana") < y("Pedido de Ajuda"));
  assert.ok(y("Linha um da Alfa") < y("Linha dois da Alfa") && achar("Linha um da Alfa").x === achar("Linha dois da Alfa").x);
  // Centralização: seção no meio da página; cliente no meio da 1ª coluna; texto alinhado à esquerda da 2ª.
  const meio = (i) => i.x + i.largura / 2;
  assert.ok(Math.abs(meio(achar("Semana Passada")) - p.largura / 2) < 2, "seção centralizada nas duas colunas");
  const col1 = (p.largura - 100) * 0.28;
  assert.ok(Math.abs(meio(achar("Cliente")) - (50 + Math.round(col1) / 2)) < 2, "cabeçalho Cliente centralizado");
  assert.ok(Math.abs(meio(achar("Conta Exemplo Beta")) - (50 + Math.round(col1) / 2)) < 2, "cliente centralizado na coluna");
  assert.ok(achar("Kickoff fictício revisado").x > 50 + col1, "atividades na segunda coluna");
});

test("PDF de check-in longo: continua na página seguinte com o cabeçalho repetido; emoji não quebra", async () => {
  await pagina.click("#stf-ck-novo");
  await definirData("22/10/2026");
  const longo = Array.from({ length: 70 }, (_, n) => `Linha fictícia ${n + 1} 🚀 “aspas” – ok`).join("\n");
  await novoItem("Semana Passada", { cliente: "Conta Exemplo Alfa", atividades: longo });
  await novoItem("Pedido de Ajuda", { atividades: "Final fictício" });
  const pdf = await gerarPdf(pagina.locator("#stf-ck-pdf-rascunho"));
  assert.equal(pdf.nome, "checkin-semanal-2026-10-22.pdf");
  assert.ok(pdf.paginas.length >= 2, "mais de uma página");
  const segunda = pdf.paginas[1].itens.map((i) => i.str);
  assert.ok(segunda.includes("Cliente") && segunda.includes("Atividades"), "cabeçalho repetido");
  assert.ok(segunda.includes("Conta Exemplo Alfa"), "o nome do cliente se repete na continuação");
  const todas = pdf.paginas.flatMap((p) => p.itens.map((i) => i.str));
  assert.ok(todas.some((t) => /^Linha fictícia 70 +"aspas" - ok$/.test(t)), "texto completo, sem o emoji e com aspas simples");
  assert.ok(todas.includes("Final fictício"));
  for (const p of pdf.paginas) for (const i of p.itens) assert.ok(i.y > 40 && i.y < p.altura - 40, "nada fora da margem");
  await pagina.click("#stf-ck-cancelar");
  assert.equal((await tabela("checkins")).length, 2, "gerar PDF do rascunho não grava");
});

test("Conta excluída: o item do check-in guarda o nome como rótulo", async () => {
  await pagina.click('.subaba[data-aba="stefanini-contas"]');
  const conta = pagina.locator("#stf-conta-lista > .stf-cartao", { has: pagina.locator('h3:text-is("Conta Exemplo Beta")') });
  const excluir = conta.locator("[data-stf-excluir]");
  await excluir.click();
  await excluir.click();
  await esperar(() => !(JSON.parse(sessionStorage.getItem("mock-db"))["stefanini.contas"] || []).some((c) => c.id === "conta-beta"));
  const itens = await tabela("checkin_itens");
  assert.ok(!itens.some((i) => i.conta_id === "conta-beta"));
  const beta = itens.filter((i) => i.cliente_rotulo === "Conta Exemplo Beta");
  assert.equal(beta.length, 2, "os dois itens da Beta ficaram com o nome");
  await pagina.click('.subaba[data-aba="stefanini-checkin"]');
  await cartao("08/10/2026").locator("[data-ck-acao=ver]").click();
  assert.match(await txt(pagina.locator("#stf-ck-ver")), /Conta Exemplo Beta Reunião: Apresentação fictícia/);
});

test("Celular (390px): editor, sugestões, prévia e histórico cabem na tela", async () => {
  await pagina.setViewportSize({ width: 390, height: 844 });
  const semRolagemLateral = () => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(await semRolagemLateral(), true, "prévia aberta");
  await pagina.click("#stf-ck-novo");
  await pagina.click("#stf-ck-sugerir");
  await novoItem("Essa Semana", { rotulo: "Um evento fictício com um nome bem comprido para testar a quebra", atividades: "Texto fictício" });
  assert.equal(await semRolagemLateral(), true, "editor aberto");
  const caixas = await pagina.$$eval("#stf-ck-form button, #stf-ck-form select, #stf-ck-form textarea, #stf-ck-form input:not([type=date])",
    (els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { d: r.right, a: r.height }; }));
  assert.ok(caixas.length > 10);
  for (const c of caixas) assert.ok(c.d <= 390 + 0.5 && c.a >= 32, "controles dentro da tela e tocáveis");
  await pagina.screenshot({ path: path.join(SAIDA, "stefanini-checkin-celular.png"), fullPage: true });
  await pagina.click("#stf-ck-cancelar");
  await pagina.setViewportSize({ width: 1280, height: 1000 });
});

test("Excluir check-in pede confirmação e leva os itens junto", async () => {
  const total = (await tabela("checkin_itens")).length;
  const ckin = (await tabela("checkins")).find((c) => c.semana === "2026-10-08");
  const doCheckin = (await tabela("checkin_itens")).filter((i) => i.checkin_id === ckin.id).length;
  const botao = cartao("08/10/2026").locator("[data-ck-acao=excluir]");
  await botao.click();
  assert.equal(await botao.textContent(), "Excluir?");
  assert.equal((await tabela("checkins")).length, 2, "primeiro toque só pede confirmação");
  await botao.click();
  await esperar(() => (JSON.parse(sessionStorage.getItem("mock-db"))["stefanini.checkins"] || []).length === 1);
  assert.equal((await tabela("checkin_itens")).length, total - doCheckin);
  await cartao("01/10/2026").waitFor();
  assert.equal(await pagina.isVisible("#stf-ck-ver"), false);
  assert.deepEqual(pagina.erros, []);
});

test("Recarregar mantém o histórico", async () => {
  await pagina.reload();
  await pagina.waitForSelector("#tela-login", { state: "hidden" });
  await irCheckin();
  await cartao("01/10/2026").waitFor();
  assert.match(await txt(cartao("01/10/2026")), /Semana Passada: 1 Essa Semana: 1 Pedido de Ajuda: 1/);
});

test("Migração: só aditiva, RLS por usuário, Realtime e build com os arquivos novos", async () => {
  const pasta = path.join(RAIZ, "supabase/migrations");
  const arquivos = await readdir(pasta);
  const nome = arquivos.find((a) => /stefanini_checkins/.test(a));
  assert.ok(nome && nome > "20261109180000_stefanini.sql", "depois da migração do CRM");
  for (const anterior of ["20261109120000_shark_materiais.sql", "20261109180000_stefanini.sql"]) assert.ok(arquivos.includes(anterior));
  const codigo = (await readFile(path.join(pasta, nome), "utf8")).replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /\bdrop\s|\btruncate\b|\bdelete\s+from\b|\binsert\s+into\b|\bupdate\s+stefanini\b/i);
  assert.doesNotMatch(codigo, /alter\s+table\s+(?!stefanini\.%I\b)/i, "não altera tabelas existentes");
  assert.doesNotMatch(codigo, /db_schemas/, "não mexe na lista de schemas da API");
  assert.match(codigo, /create table if not exists stefanini\.checkins \(/);
  assert.match(codigo, /create table if not exists stefanini\.checkin_itens \(/);
  assert.match(codigo, /checkin_id uuid not null references stefanini\.checkins \(id\) on delete cascade/);
  assert.match(codigo, /conta_id uuid references stefanini\.contas \(id\) on delete set null/);
  assert.match(codigo, /secao in \('Semana Passada', 'Essa Semana', 'Pedido de Ajuda'\)/);
  assert.match(codigo, /check \(conta_id is null or cliente_rotulo is null\)/);
  assert.match(codigo, /foreach t in array array\['checkins', 'checkin_itens'\] loop/);
  for (const p of ["dono lê", "dono cria", "dono altera", "dono apaga"]) assert.match(codigo, new RegExp(`create policy "${p}" on stefanini\\.%I .*user_id = \\(select auth\\.uid\\(\\)\\)`), p);
  assert.match(codigo, /revoke all on stefanini\.checkins, stefanini\.checkin_itens from anon/);
  assert.match(codigo, /alter publication supabase_realtime add table stefanini\.checkins, stefanini\.checkin_itens;/);

  const build = await readFile(path.join(RAIZ, "scripts/build.sh"), "utf8");
  assert.match(build, /\bstefanini-checkin\.js\b/);
  assert.match(build, /jspdf\.umd\.min\.js jspdf-LICENSE\.txt/);
  const html = await readFile(path.join(RAIZ, "index.html"), "utf8");
  assert.match(html, /<script src="stefanini-checkin\.js"><\/script>/);
});

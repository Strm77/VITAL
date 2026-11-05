// V2-08: histórico de origem e mudanças das contas (tabela só de inserção) e nenhuma exclusão
// ou fusão automática de contas. Dados fictícios. Parte 1 usa o Supabase simulado (modo site
// publicado); parte 2, o modo local com faturas em PDF fictícias.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { abrirNavegador, abrirPainel, RAIZ, HOJE, SAIDA, texto } from "./ajuda.mjs";

let servidor, navegador, pub, loc, endereco;
const TIPOS = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
const mockDb = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem("mock-db") || "{}"));
const linhaConta = (p, nome) => p.locator("#pag-tabela tbody tr", { has: p.locator(".conta-nome", { hasText: nome }) });

async function fatura(nome, total, linhas, final = "8888") {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const pg = doc.addPage([595, 842]);
  const itens = [
    [["Nubank", 40]], [["Data de vencimento: 15 NOV 2026", 40]], [[`Cartão final ${final}`, 40]],
    [["Total a pagar", 40], [`R$ ${total}`, 200]], [["TRANSAÇÕES", 40]],
    ...linhas.map(([d, desc, v]) => [[d, 40], [desc, 110], [`R$ ${v}`, 520]]),
  ];
  itens.forEach((linha, i) => linha.forEach(([t, x]) => pg.drawText(t, { x, y: 800 - i * 10, size: 8, font: fonte })));
  const arquivo = path.join(SAIDA, nome);
  await writeFile(arquivo, await doc.save());
  return arquivo;
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
  const ctx = await navegador.newContext();
  ctx.setDefaultTimeout(5000);
  pub = await ctx.newPage();
  pub.erros = [];
  pub.on("pageerror", (e) => pub.erros.push(e.message));
  await pub.clock.setFixedTime(HOJE);
  await pub.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ path: path.join(RAIZ, "tests/supabase-simulado.js"), contentType: "application/javascript" }));
  await pub.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  await pub.goto(endereco);
  await pub.fill("#login-email", "teste@exemplo.com");
  await pub.fill("#login-senha", "senha-certa");
  await pub.click("[data-acao=entrar]");
  await pub.waitForSelector("#tela-login", { state: "hidden" });
  await pub.goto(endereco + "#painel");
  await pub.waitForFunction(() => pag.carregado && hist.carregado);
  await abrirLocal();
});
after(async () => { await navegador?.close(); servidor?.close(); });

test("Adapter Supabase: evento gravado em historico_contas e lido de volta (round-trip), só por inserção", async () => {
  await pub.click("#pag-adicionar");
  await pub.fill("#pag-nome", "Conta Ficticia Luz");
  await pub.fill("#pag-valor", "120");
  await pub.fill("#pag-vencimento-br", "20/10/2026");
  await pub.click("#pag-form [type=submit]");
  await pub.waitForFunction(() => (JSON.parse(sessionStorage.getItem("mock-db")).historico_contas || []).length === 1);
  const [ev] = (await mockDb(pub)).historico_contas;
  assert.equal(ev.evento, "criacao");
  assert.equal(ev.origem_acao, "manual");
  assert.match(ev.id, /^hc-/);
  assert.ok(ev.criado_em, "hora vem do servidor");
  assert.equal(ev.depois.valor, 120);
  assert.equal(ev.antes, null);
  // Relido do banco depois de recarregar.
  await pub.reload();
  await pub.waitForFunction(() => hist.carregado && hist.eventos.length === 1);
  await linhaConta(pub, "Conta Ficticia Luz").locator("[data-acao=editar]").click();
  const caixa = await texto(pub, "#pag-historico");
  assert.match(caixa, /O histórico começa nesta versão: mudanças feitas antes dela não foram registradas/);
  assert.match(caixa, /Criada por você/);
  // O adapter recusa alterar ou apagar um evento.
  const erros = await pub.evaluate(async () => {
    const r = [];
    try { await hist.arm.excluir(hist.eventos[0].id); } catch (e) { r.push(e.message); }
    return r;
  });
  assert.deepEqual(erros, ["histórico não pode ser excluído"]);
  await pub.click("#pag-cancelar");
});

test("Falha ao gravar o histórico fica visível; reenvio idempotente pelo mesmo id, sem duplicar", async () => {
  await pub.evaluate(() => sessionStorage.setItem("mock-falhar-historico", "1"));
  await linhaConta(pub, "Conta Ficticia Luz").locator("[data-acao=editar]").click();
  await pub.fill("#pag-valor", "135");
  await pub.click("#pag-form [type=submit]");
  await pub.waitForSelector("#pag-historico-fila:not([hidden])");
  assert.match(await texto(pub, "#pag-historico-fila"), /1 evento do histórico ainda não foi gravado no banco/);
  const conta = (await mockDb(pub)).pagamentos.find((c) => c.nome === "Conta Ficticia Luz");
  assert.equal(conta.valor, 135, "a conta foi salva");
  const fila = await pub.evaluate(() => JSON.parse(localStorage.getItem("vital.historico.pendentes.u1")));
  assert.equal(fila.length, 1);
  assert.equal(fila[0].usuarioId, "u1");
  assert.deepEqual([fila[0].antes.valor, fila[0].depois.valor], [120, 135]);

  await pub.evaluate(() => sessionStorage.removeItem("mock-falhar-historico"));
  assert.equal(await pub.evaluate(() => enviarFilaHist()), true);
  assert.equal(await pub.isVisible("#pag-historico-fila"), false);
  // Reenvio do mesmo evento (ex.: a resposta se perdeu): conflito de chave, nada duplicado.
  await pub.evaluate((f) => localStorage.setItem("vital.historico.pendentes.u1", JSON.stringify(f)), fila);
  assert.equal(await pub.evaluate(() => enviarFilaHist()), true);
  const eventos = (await mockDb(pub)).historico_contas;
  assert.equal(eventos.filter((e) => e.id === fila[0].id).length, 1);
  assert.equal(eventos.length, 2);
});

test("Fila isolada por usuário: depois de trocar de conta, eventos de outro usuário não são enviados", async () => {
  await pub.evaluate(() => sessionStorage.setItem("mock-falhar-historico", "1"));
  await linhaConta(pub, "Conta Ficticia Luz").locator("[data-acao=pagar]").click();
  await pub.waitForSelector("#pag-historico-fila:not([hidden])");
  const antes = (await mockDb(pub)).historico_contas.length;
  // Sai e entra como outra pessoa (u2) no mesmo navegador.
  await pub.evaluate(() => {
    sessionStorage.removeItem("mock-falhar-historico");
    sessionStorage.setItem("mock-sessao", JSON.stringify({ id: "u2", email: "outra@exemplo.com" }));
  });
  await pub.reload();
  await pub.waitForFunction(() => pag.carregado && hist.carregado);
  await pub.evaluate(() => enviarFilaHist());
  assert.equal((await mockDb(pub)).historico_contas.length, antes, "nada enviado na conta de u2");
  assert.equal(await pub.isVisible("#pag-historico-fila"), false, "u2 não vê a fila de u1");
  assert.equal((await pub.evaluate(() => JSON.parse(localStorage.getItem("vital.historico.pendentes.u1")))).length, 1, "fila de u1 guardada");
  // De volta a u1: o evento pendente é enviado.
  await pub.evaluate(() => sessionStorage.setItem("mock-sessao", JSON.stringify({ id: "u1", email: "teste@exemplo.com" })));
  await pub.reload();
  await pub.waitForFunction(() => hist.carregado && JSON.parse(localStorage.getItem("vital.historico.pendentes.u1") || "[]").length === 0);
  const eventos = (await mockDb(pub)).historico_contas;
  assert.equal(eventos.length, antes + 1);
  assert.equal(eventos[eventos.length - 1].evento, "pagamento");
});

test("Fila local que não pode ser regravada depois do INSERT: para, avisa e não reenvia (sem laço infinito)", async () => {
  const antes = (await mockDb(pub)).historico_contas.length;
  await pub.evaluate(() => {
    window.__envios = 0;
    const salvar = hist.arm.salvar;
    hist.arm.salvar = async (...a) => { window.__envios++; return salvar(...a); };
    // Guardar na fila funciona (enfileirar); regravar depois do envio falha (retirar).
    window.__setItem = Storage.prototype.setItem;
    let n = 0;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith("vital.historico.pendentes.") && ++n > 1) throw new DOMException("cheio", "QuotaExceededError");
      return window.__setItem.call(this, k, v);
    };
  });
  await linhaConta(pub, "Conta Ficticia Luz").locator("[data-acao=editar]").click();
  await pub.fill("#pag-observacao", "nota ficticia");
  await pub.click("#pag-form [type=submit]");
  await pub.waitForFunction(() => hist.falhaFila === true);
  assert.match(await texto(pub, "#pag-historico-fila"), /este aparelho não deixou atualizar a fila local/);
  assert.equal(await pub.evaluate(() => window.__envios), 1, "um envio só");
  assert.equal(await pub.evaluate(() => enviarFilaHist()), false);
  assert.equal(await pub.evaluate(() => enviarFilaHist()), false);
  assert.equal(await pub.evaluate(() => window.__envios), 1, "não reenvia o evento já confirmado");
  assert.equal((await mockDb(pub)).historico_contas.length, antes + 1, "gravado uma vez");
  // O armazenamento volta: a fila guardada é limpa e o aviso some.
  await pub.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  assert.equal(await pub.evaluate(() => enviarFilaHist()), true);
  assert.equal(await pub.evaluate(() => JSON.parse(localStorage.getItem("vital.historico.pendentes.u1") || "[]").length), 0);
  assert.equal(await pub.isVisible("#pag-historico-fila"), false);
  assert.equal(await pub.evaluate(() => window.__envios), 1);
  assert.equal((await mockDb(pub)).historico_contas.length, antes + 1);
});

test("Ação que falha não gera evento", async () => {
  const antes = (await mockDb(pub)).historico_contas.length;
  await pub.evaluate(() => { pag.armazenamento.salvar = async () => { throw new Error("falha simulada"); }; });
  await linhaConta(pub, "Conta Ficticia Luz").locator("[data-acao=editar]").click();
  await pub.fill("#pag-valor", "999");
  await pub.click("#pag-form [type=submit]");
  await pub.waitForSelector("#pag-aviso:not([hidden])");
  assert.equal((await mockDb(pub)).historico_contas.length, antes);
  assert.equal(await pub.evaluate(() => JSON.parse(localStorage.getItem("vital.historico.pendentes.u1") || "[]").length), 0);
  await pub.reload();
});

test("Fatura ausente, vazia ou carga incompleta: nenhuma conta excluída nem alterada (zero delete)", async () => {
  await pub.waitForFunction(() => pag.carregado && fat.faturasCarregadas);
  // Conta de fatura cuja fatura não existe (fatura apagada ou consulta parcial) e uma fatura sem lançamentos nem total.
  await pub.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem("mock-db"));
    db.pagamentos.push({ id: "fatura-sumiu", nome: "Fatura Cartão Ficticio", valor: 210, vencimento: "2026-10-25", status: "pendente", origem: "fatura", fatura_id: null, valor_fatura: 200, valor_editado: true });
    db.cartoes = [...(db.cartoes || []), { id: "c-vazio", nome: "Cartão Vazio" }];
    db.faturas = [...(db.faturas || []), { id: "f-vazia", cartao_id: "c-vazio", mes: "2026-10", vencimento: "2026-10-28", importado_em: "2026-10-01T00:00:00Z", sem_conta: false, total_informado: null }];
    db.pagamentos.push({ id: "fatura-f-vazia", nome: "Fatura Cartão Vazio", valor: 80, vencimento: "2026-10-28", status: "pago", pago_em: "2026-10-05T12:00:00Z", origem: "fatura", fatura_id: "f-vazia", valor_fatura: 80, valor_editado: false });
    sessionStorage.setItem("mock-db", JSON.stringify(db));
    window.__exclusoes = [];
  });
  await pub.reload();
  await pub.waitForFunction(() => pag.carregado && fat.faturasCarregadas && fat.cartoesCarregados);
  await pub.evaluate(() => sincronizarContasDasFaturas());
  assert.deepEqual(await pub.evaluate(() => window.__exclusoes || []), [], "nenhuma chamada de delete");
  const db = await mockDb(pub);
  const sumiu = db.pagamentos.find((c) => c.id === "fatura-sumiu");
  assert.deepEqual([sumiu.valor, sumiu.status, sumiu.valor_editado], [210, "pendente", true], "conta sem fatura preservada");
  const vazia = db.pagamentos.find((c) => c.id === "fatura-f-vazia");
  assert.deepEqual([vazia.valor, vazia.status, vazia.pago_em, vazia.valor_fatura], [80, "pago", "2026-10-05T12:00:00Z", 80], "fatura vazia não zera a conta");
  assert.equal(db.pagamentos.filter((c) => c.nome === "Fatura Cartão Ficticio").length, 1, "não recria nem duplica");
});

/* ---------- Parte 2: modo local, importação e reimportação ---------- */

async function abrirLocal() {
  loc = await abrirPainel(await navegador.newContext());
  await loc.evaluate(() => { for (const k of ["dividas", "pagamentos", "ganhos", "gastos", "investimentos"]) localStorage.setItem("vital." + k, "[]"); });
  await loc.reload();
  await loc.waitForFunction(() => pag.carregado && hist.carregado);
}

const eventosLocal = () => loc.evaluate(() => JSON.parse(localStorage.getItem("vital.historico_contas") || "[]"));

async function importar(p, arquivo) {
  await p.goto(p.url().split("#")[0] + "#faturas");
  await p.setInputFiles("#pdf-arquivo", arquivo);
  await p.waitForSelector("#previa:not([hidden])");
}

test("Importação, edição manual, pagamento e reimportação: eventos só se acumulam; valor manual, status e pagamento preservados", async () => {
  await importar(loc, await fatura("v208-a.pdf", "100,00", [["10 OUT", "Padaria Ficticia", "60,00"], ["12 OUT", "Livraria Teste", "40,00"]]));
  await loc.fill("#previa-novo", "Cartão Teste H");
  await loc.click("#previa [type=submit]");
  await loc.waitForSelector("#previa", { state: "hidden" });
  await loc.waitForFunction(() => JSON.parse(localStorage.getItem("vital.historico_contas") || "[]").some((e) => e.evento === "importacao"));
  const contaId = (await loc.evaluate(() => pag.contas.find((c) => c.origem === "fatura").id));

  // Edição manual do valor e pagamento.
  await loc.goto(loc.url().split("#")[0] + "#painel");
  await loc.evaluate(() => definirMes("2026-11"));
  const linha = linhaConta(loc, "Fatura Cartão Teste H");
  await linha.locator("[data-acao=editar]").click();
  await loc.fill("#pag-valor", "105");
  await loc.click("#pag-form [type=submit]");
  await loc.waitForFunction(() => pag.contas.find((c) => c.origem === "fatura").valor === 105);
  await linha.locator("[data-acao=pagar]").click();
  await loc.waitForFunction(() => pag.contas.find((c) => c.origem === "fatura").status === "pago");
  const antesReimp = await eventosLocal();
  assert.deepEqual(antesReimp.map((e) => e.evento), ["importacao", "edicao", "pagamento"]);

  // Reimportação da mesma fatura com outro total: Salvar só depois de confirmar a substituição.
  await importar(loc, await fatura("v208-b.pdf", "130,00", [["10 OUT", "Padaria Ficticia", "60,00"], ["12 OUT", "Livraria Teste", "40,00"], ["14 OUT", "Mercado Ficticio", "30,00"]]));
  assert.equal(await loc.isVisible("#previa-comparacao"), true);
  assert.equal(await loc.isEnabled("#previa [type=submit]"), false, "desabilitado até confirmar");
  assert.match(await texto(loc, "#previa-bloqueio"), /esta fatura já existe: marque “Substituir o detalhamento salvo por esta leitura”/);
  await loc.check("#previa-comparacao input[name=substituir]");
  assert.equal(await loc.isEnabled("#previa [type=submit]"), true, "habilita depois da confirmação com prévia válida");
  assert.equal(await loc.isVisible("#previa-bloqueio"), false);
  await loc.click("#previa [type=submit]");
  await loc.waitForSelector("#previa", { state: "hidden" });
  await loc.waitForFunction(() => JSON.parse(localStorage.getItem("vital.historico_contas")).some((e) => e.evento === "reimportacao"));
  await loc.waitForFunction(() => pag.contas.find((c) => c.origem === "fatura").valorFatura === 130);

  const conta = await loc.evaluate((id) => pag.contas.find((c) => c.id === id), contaId);
  assert.equal(conta.valor, 105, "valor manual mantido");
  assert.equal(conta.status, "pago", "status mantido");
  assert.ok(conta.pagoEm, "pagamento mantido");
  assert.equal(conta.valorFatura, 130, "só o valor importado mudou");
  const depois = await eventosLocal();
  for (const e of antesReimp) assert.ok(depois.some((x) => x.id === e.id && JSON.stringify(x) === JSON.stringify(e)), `evento ${e.evento} preservado igual`);
  assert.ok(depois.length >= antesReimp.length + 2, depois.map((e) => e.evento).join(","));
  const reimp = depois.find((e) => e.evento === "reimportacao");
  assert.deepEqual(reimp.antes, { lancamentosFatura: 2, somaLancamentosFatura: 100, totalInformadoFatura: 100 }, "retrato do que estava salvo");
  assert.deepEqual(reimp.depois, { lancamentosFatura: 3, somaLancamentosFatura: 130, totalInformadoFatura: 130 });
  assert.doesNotMatch(reimp.detalhe, /não foram alterad/, "sem afirmar o que não foi verificado");
  const sinc = depois.find((e) => e.evento === "edicao" && e.origemAcao === "sincronizacao_fatura");
  assert.deepEqual([sinc.antes.valorFatura, sinc.depois.valorFatura], [100, 130]);
  assert.equal(sinc.depois.valor, undefined, "o valor da conta não foi trocado");
});

test("Vincular a fatura a uma conta pendente com valor editado à mão mantém o valor manual", async () => {
  await loc.evaluate(() => {
    const contas = JSON.parse(localStorage.getItem("vital.pagamentos"));
    contas.push({ id: "manual-editada", nome: "Cartão Ficticio Pendente", valor: 999, mesReferencia: "2026-11", vencimento: "2026-11-15", status: "pendente", valorEditado: true });
    localStorage.setItem("vital.pagamentos", JSON.stringify(contas));
  });
  await loc.reload();
  await loc.waitForFunction(() => pag.carregado && hist.carregado);
  await importar(loc, await fatura("v208-c.pdf", "50,00", [["11 OUT", "Loja Ficticia Z", "50,00"]], "7777"));
  await loc.fill("#previa-novo", "Cartão Novo Z");
  assert.match(await texto(loc, "#previa-conta"), /Cartão Ficticio Pendente.*pendente — o valor editado à mão é mantido/);
  await loc.check("#previa-conta input[value='ligar:manual-editada']");
  await loc.click("#previa [type=submit]");
  await loc.waitForSelector("#previa", { state: "hidden" });
  await loc.waitForFunction(() => pag.contas.find((c) => c.id === "manual-editada")?.origem === "fatura");
  const conta = await loc.evaluate(() => pag.contas.find((c) => c.id === "manual-editada"));
  assert.deepEqual([conta.valor, conta.valorEditado, conta.valorFatura, conta.status], [999, true, 50, "pendente"]);
  const vinc = (await eventosLocal()).find((e) => e.evento === "vinculacao" && e.contaId === "manual-editada");
  assert.ok(vinc, "vinculação registrada");
  assert.equal(vinc.depois.valor, undefined, "o valor da conta não mudou");
  assert.deepEqual([vinc.antes.valorFatura ?? null, vinc.depois.valorFatura], [null, 50]);
});

test("Nenhum erro de JavaScript", () => {
  assert.deepEqual(pub.erros, []);
  assert.deepEqual(loc.erros, []);
});

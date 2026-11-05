// Melhorias "Versão 4" (05/11/2026): um teste por critério de aceite, V01 a V16.
// Hoje nos testes: quinta, 08/10/2026. Os exemplos iniciais são zerados para os totais ficarem exatos.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { devices } from "playwright";
import { abrirNavegador, abrirPainel, SAIDA, texto, brl } from "./ajuda.mjs";

let navegador, pagina;
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);
const linhaConta = (nome) => pagina.locator("#pag-tabela tbody tr", { has: pagina.locator(".conta-nome", { hasText: nome }) });
const divida = (nome) => pagina.locator("#lista-dividas .divida", { has: pagina.locator(".rotulo", { hasText: nome }) });
const calc = (nome) => pagina.evaluate((n) => { const d = dividasCalculadas.find((x) => x.nome === n); return d && { ...d, parcelas: undefined }; }, nome);
const fluxo = () => pagina.evaluate(() => resumoDoMes());

async function zerar(p) {
  await p.evaluate(() => {
    for (const k of ["dividas", "pagamentos", "ganhos", "gastos", "investimentos"]) localStorage.setItem("vital." + k, "[]");
  });
  await p.reload();
  await p.waitForSelector("#vazio:not([hidden])");
}

async function novaConta({ nome, valor, vencimento, pagarEm, divida: dividaNome, origem, status }) {
  await pagina.click("#pag-adicionar");
  await pagina.fill("#pag-nome", nome);
  await pagina.fill("#pag-valor", String(valor));
  if (vencimento) await pagina.fill("#pag-vencimento-br", vencimento); // digitado como dd/mm/aaaa
  if (pagarEm) await pagina.fill("#pag-pagar-em-br", pagarEm);
  if (dividaNome) await pagina.selectOption("#pag-divida", await pagina.evaluate((n) => dividasAtuais.find((d) => d.nome === n).id, dividaNome));
  if (status) await pagina.selectOption("#pag-status", status);
  if (origem) await pagina.selectOption("#pag-origem-pagamento", origem);
  await pagina.click("#pag-form [type=submit]");
  await linhaConta(nome).waitFor();
}

async function novaDivida({ nome, valor, total, inicio = "2026-10", dia, saldo }) {
  await pagina.click("#botao-adicionar");
  await pagina.fill("#campo-nome", nome);
  await pagina.fill("#campo-valor", String(valor));
  await pagina.fill("#campo-total", String(total));
  await pagina.fill("#campo-inicio", inicio);
  if (dia) await pagina.fill("#campo-dia", String(dia));
  if (saldo != null) await pagina.fill("#campo-saldo", String(saldo));
  await pagina.click("#formulario [type=submit]");
  await divida(nome).waitFor();
}

async function abrirDivida(nome) {
  const d = divida(nome);
  if ((await d.locator(".linha").getAttribute("aria-expanded")) !== "true") await d.locator(".linha").click();
  return d;
}

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
  await zerar(pagina);
});
after(() => navegador?.close());

test("V01 — conta com mês e valor, sem dia conhecido: fica pendente com “vencimento a confirmar”", async () => {
  await pagina.click("#pag-adicionar");
  assert.equal(await pagina.inputValue("#pag-vencimento"), "", "nenhum dia é preenchido sozinho");
  assert.equal(await pagina.inputValue("#pag-mes"), "2026-10");
  await pagina.click("#pag-cancelar");
  // Dívida nova também não ganha dia 10 automático.
  await pagina.click("#botao-adicionar");
  assert.equal(await pagina.inputValue("#campo-dia"), "");
  await pagina.click("#botao-cancelar");

  await novaConta({ nome: "Condomínio", valor: 640 });
  const linha = linhaConta("Condomínio");
  assert.match(await linha.textContent(), /vencimento a confirmar/);
  assert.equal(await texto(pagina, `#pag-tabela tbody tr:has(.conta-nome:text("Condomínio")) .status`), "Pendente");
  assert.match(await texto(pagina, "#pag-resumo"), /1 com vencimento a confirmar/);
  const [salva] = await local("pagamentos");
  assert.equal(salva.mesReferencia, "2026-10");
  assert.equal(salva.vencimentoAConfirmar, true);
  assert.equal(salva.status, "pendente");
  // Não vira atrasada nem aparece como "vence hoje" em outras áreas.
  assert.equal((await fluxo()).contasAPagar, 640);
});

test("V07 — datas digitadas e lidas em dd/mm/aaaa, guardadas em ISO (05/11 é 5 de novembro)", async () => {
  await pagina.click("#pag-adicionar");
  await pagina.fill("#pag-vencimento-br", "05112026"); // só números: a máscara põe as barras
  assert.equal(await pagina.inputValue("#pag-vencimento-br"), "05/11/2026");
  assert.equal(await pagina.inputValue("#pag-vencimento"), "2026-11-05", "dia 5 de novembro, não 11 de maio");
  assert.equal(await pagina.inputValue("#pag-mes"), "2026-11", "o mês acompanha o vencimento");
  // Pelo calendário (campo nativo) a data aparece no texto em pt-BR.
  await pagina.fill("#pag-vencimento", "2026-05-11");
  assert.equal(await pagina.inputValue("#pag-vencimento-br"), "11/05/2026");
  // Data inválida não deixa a anterior valendo escondida.
  await pagina.fill("#pag-vencimento-br", "31/02/2026");
  assert.equal(await pagina.inputValue("#pag-vencimento"), "");
  assert.equal(await pagina.getAttribute("#pag-vencimento-br", "placeholder"), "dd/mm/aaaa");
  await pagina.click("#pag-cancelar");
  // Leitura ao editar: a conta salva mostra a data em pt-BR.
  await novaConta({ nome: "Internet", valor: 100, vencimento: "05/10/2026" });
  await linhaConta("Internet").locator("[data-acao=editar]").click();
  assert.equal(await pagina.inputValue("#pag-vencimento-br"), "05/10/2026");
  assert.equal(await pagina.inputValue("#pag-vencimento"), "2026-10-05");
  await pagina.click("#pag-cancelar");
  assert.match(await linhaConta("Internet").textContent(), /05\/10\/2026/);
});

test("V04 — conta vencida com pagamento previsto continua vencida e não fica paga", async () => {
  await linhaConta("Internet").locator("[data-acao=editar]").click();
  await pagina.fill("#pag-pagar-em-br", "20/10/2026");
  await pagina.fill("#pag-observacao", "Pagar junto com o salário");
  await pagina.click("#pag-form [type=submit]");
  await pagina.waitForFunction(() => document.querySelector("#pag-tabela").textContent.includes("Pagamento previsto: 20/10/2026"));
  const linha = linhaConta("Internet");
  assert.equal(await texto(pagina, `#pag-tabela tbody tr:has(.conta-nome:text("Internet")) .status`), "Atrasada");
  assert.match(await linha.textContent(), /05\/10\/2026/, "o vencimento original fica");
  assert.match(await linha.textContent(), /Pagar junto com o salário/);
  const conta = (await local("pagamentos")).find((c) => c.nome === "Internet");
  assert.equal(conta.status, "pendente");
  assert.equal(conta.vencimento, "2026-10-05");
  assert.equal(conta.pagarEm, "2026-10-20");
});

test("V11 — parcela da dívida registrada também como conta entra uma vez só no mês", async () => {
  await novaDivida({ nome: "Empréstimo Banco Azul", valor: 500, total: 12, dia: 15 });
  const antes = await fluxo();
  assert.equal(antes.parcelas, 500);
  const saidasAntes = antes.saidas;
  // Conta vinculada à dívida pela lista "Parcela de dívida".
  await novaConta({ nome: "Parcela do empréstimo", valor: 500, vencimento: "15/10/2026", divida: "Empréstimo Banco Azul" });
  await pagina.waitForFunction(() => resumoDoMes().parcelas === 0);
  const depois = await fluxo();
  assert.equal(depois.saidas, saidasAntes, "o total do mês não aumenta: a parcela virou a conta");
  assert.equal(await texto(pagina, "#total-mensal"), brl(0));
  assert.match(await linhaConta("Parcela do empréstimo").textContent(), /Parcela de “Empréstimo Banco Azul”/);
  // Pagar a conta marca a parcela do mês como paga na dívida.
  await linhaConta("Parcela do empréstimo").locator("[data-acao=pagar]").click();
  await pagina.waitForFunction(() => dividasCalculadas.find((d) => d.nome === "Empréstimo Banco Azul").parcelaDoMes.pago);
  const pizza = await pagina.$$eval("#legenda li", (l) => l.map((x) => x.textContent.replace(/\s+/g, " ")));
  assert.equal(pizza.filter((l) => /empréstimo/i.test(l)).length, 1, "só uma fatia para esse pagamento");

  // Sem vínculo: mesma dívida com o nome e o valor da parcela também não é somada duas vezes.
  await novaDivida({ nome: "Financiamento Moto", valor: 380, total: 24, dia: 28 });
  const s1 = (await fluxo()).saidas;
  await novaConta({ nome: "Financiamento Moto", valor: 380, vencimento: "28/10/2026" });
  await pagina.waitForFunction(() => dividasCalculadas.find((d) => d.nome === "Financiamento Moto").parcelaDoMes.conta);
  assert.equal((await fluxo()).saidas, s1);
});

test("V12 — parcela paga antes do vencimento aparece paga na hora", async () => {
  await novaDivida({ nome: "Crediário Loja", valor: 210, total: 10, dia: 25 });
  assert.equal((await calc("Crediário Loja")).noMes[0].pago, false, "vence dia 25: ainda a pagar");
  const pagoAntes = (await fluxo()).parcelasPagas;
  const d = await abrirDivida("Crediário Loja");
  await d.locator(".parcela-mes [data-marcar]").click();
  await pagina.waitForFunction(() => dividasCalculadas.find((x) => x.nome === "Crediário Loja").noMes[0].pago);
  assert.match(await divida("Crediário Loja").locator(".parcela-mes").textContent(), /Paga/);
  assert.match(await divida("Crediário Loja").locator(".parcelas-lista li.do-mes").textContent(), /Paga em 08\/10\/2026/);
  assert.equal((await fluxo()).parcelasPagas, pagoAntes + 210);
  const salva = (await local("dividas")).find((x) => x.nome === "Crediário Loja");
  assert.deepEqual(salva.parcelasQuitadas, { 1: { pagoEm: "2026-10-08", origem: "proprio" } });
});

test("V13 — parcela quitada via cheque especial: paga no empréstimo, pendente no banco, contada uma vez", async () => {
  await novaDivida({ nome: "Consignado", valor: 450, total: 36, dia: 20 });
  const antes = await fluxo();
  const d = await abrirDivida("Consignado");
  await d.locator(".parcelas-opcoes select[name=origem]").selectOption("cheque_especial");
  await d.locator(".parcela-mes [data-marcar]").click();
  await pagina.waitForSelector("#lista-dividas .divida:has(.rotulo:text('Consignado')) .aviso-cheque");
  const depois = await fluxo();
  assert.equal(depois.saidas, antes.saidas, "o valor não é lançado de novo");
  assert.equal(depois.chequeEspecial, 450);
  assert.match(await texto(pagina, "#bloco-fluxo .aviso-cheque"), /R\$ 450,00 pagos com cheque especial .* continuam devidos ao banco/);
  assert.match(await divida("Consignado").locator(".parcela-mes").textContent(), /Paga/);
  // Também numa conta: origem do pagamento guardada sem mudar valor nem status.
  await novaConta({ nome: "Cartão loja", valor: 90, vencimento: "12/10/2026", status: "pago", origem: "cheque_especial" });
  assert.match(await texto(pagina, "#pag-resumo"), /pagos com cheque especial/);
  const conta = (await local("pagamentos")).find((c) => c.nome === "Cartão loja");
  assert.equal(conta.origemPagamento, "cheque_especial");
  assert.equal(conta.status, "pago");
  assert.equal(conta.valor, 90);
});

test("V10 — empréstimo deste mês com as últimas parcelas antecipadas e saldo informado pelo banco", async () => {
  await novaDivida({ nome: "Empréstimo novo", valor: 1000, total: 12, dia: 20, saldo: 8500 });
  const d = await abrirDivida("Empréstimo novo");
  await d.locator(".parcelas-opcoes input[name=valorPago]").fill("880");
  await d.locator('[data-marcar="12"]').click();
  await pagina.waitForSelector('#lista-dividas .divida:has(.rotulo:text("Empréstimo novo")) [data-desmarcar="12"]');
  const d2 = await abrirDivida("Empréstimo novo");
  await d2.locator(".parcelas-opcoes input[name=valorPago]").fill("890");
  await d2.locator('[data-marcar="11"]').click();
  await pagina.waitForSelector('#lista-dividas .divida:has(.rotulo:text("Empréstimo novo")) [data-desmarcar="11"]');

  const c = await calc("Empréstimo novo");
  assert.equal(c.parcelaDoMes.numero, 1);
  assert.equal(c.parcelaDoMes.pago, false, "a parcela deste mês continua pendente");
  assert.equal(c.restantes, 10);
  assert.equal(c.valorRestante, 8500, "mostra o saldo informado pelo banco");
  assert.match(await divida("Empréstimo novo").textContent(), /Saldo informado pelo banco\s*R\$\s8\.500,00/);
  assert.equal(mesDe(c.termino), "2027-07", "termina na parcela 10");

  // Nos meses finais (ago e set/2027) as antecipadas não são cobradas.
  await pagina.click("#timeline-proximo");
  await pagina.click("#timeline-meses .mes:nth-child(9)"); // setembro de 2027
  const set = await calc("Empréstimo novo");
  assert.equal(set.ativaNoMes, true);
  assert.equal(set.parcelaDoMes.antecipada, true);
  assert.equal(set.valorNoMes, 0, "nada a pagar em set/2027");
  assert.match(await divida("Empréstimo novo").textContent(), /parcela do mês já antecipada/);
  await pagina.click("#timeline-hoje");
});
const mesDe = (d) => new Date(d).toISOString().slice(0, 7);

test("V16 — cada fatia com cor própria, legenda visível e toque mostra nome e valor (390px)", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  const cores = await pagina.$$eval("#pizza path", (p) => p.map((x) => x.getAttribute("fill")));
  assert.ok(cores.length >= 6, `fatias: ${cores.length}`);
  assert.equal(new Set(cores).size, cores.length, "nenhuma cor repetida");
  assert.equal(await pagina.isVisible("#legenda"), true, "legenda visível na tela");
  const caixa = await pagina.locator("#legenda li[data-indice]").first().boundingBox();
  assert.ok(caixa.width > 100 && caixa.height > 10);
  await pagina.locator("#pizza path").nth(1).click();
  const dica = await texto(pagina, "#dica-grafico");
  assert.match(dica, /· .+: R\$ [\d.,]+ \(\d+%\)/);
  await pagina.locator("#legenda li[data-indice]").nth(2).click();
  assert.equal(await pagina.isVisible("#dica-grafico"), true);
  assert.match(await texto(pagina, "#dica-grafico"), /R\$/);
  await pagina.screenshot({ path: path.join(SAIDA, "20-v16-pizza-celular.png"), fullPage: false });
});

test("V14 — em 390px cada conta cabe num cartão: nome legível e ação principal à vista", async () => {
  await pagina.setViewportSize({ width: 390, height: 900 });
  await pagina.locator("#pag-tabela").scrollIntoViewIfNeeded();
  const r = await pagina.evaluate(() => {
    const rolagem = document.querySelector(".tabela-rolagem");
    return [...document.querySelectorAll("#pag-tabela tbody tr")].map((tr) => {
      const nome = tr.querySelector(".conta-nome").getBoundingClientRect();
      const botao = tr.querySelector("[data-acao=pagar]").getBoundingClientRect();
      const linha = parseFloat(getComputedStyle(tr.querySelector(".conta-nome")).lineHeight) || 20;
      return { nomeLinhas: Math.round(nome.height / linha), larguraNome: nome.width, botaoDireita: botao.right, botaoLargura: botao.width,
        sobra: rolagem.scrollWidth - rolagem.clientWidth };
    });
  });
  assert.ok(r.length >= 5);
  for (const x of r) {
    assert.ok(x.nomeLinhas <= 2, `nome quebrado em ${x.nomeLinhas} linhas`);
    assert.ok(x.botaoDireita <= 390 && x.botaoLargura > 0, "botão de pagar dentro da tela");
    assert.ok(x.sobra <= 1, "sem rolagem lateral escondida");
  }
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await pagina.screenshot({ path: path.join(SAIDA, "21-v14-contas-celular.png"), fullPage: true });
  await pagina.setViewportSize({ width: 1440, height: 1000 });
});

test("V15 — no celular a instrução principal da importação é de toque e o toque abre o arquivo", async () => {
  const ctx = await navegador.newContext({ ...devices["iPhone 13"] });
  const cel = await ctx.newPage();
  await cel.clock.setFixedTime(new Date("2026-10-08T12:00:00"));
  await cel.route("https://cdn.jsdelivr.net/**", (r) => r.abort());
  await cel.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  await cel.goto((await pagina.evaluate(() => location.href.split("#")[0])) + "#faturas");
  await cel.waitForSelector("#soltar");
  assert.equal(await cel.isVisible("#soltar .so-toque >> nth=0"), true);
  assert.match(await cel.locator("#soltar strong.so-toque").textContent(), /Toque para escolher/);
  assert.equal(await cel.isVisible("#soltar strong.so-mouse"), false, "“Arraste” não aparece no celular");
  const [escolha] = await Promise.all([cel.waitForEvent("filechooser"), cel.tap("#soltar")]);
  assert.ok(escolha, "o toque abre a escolha de arquivo");
  await ctx.close();
  // No computador continua a instrução de arrastar.
  await pagina.goto(pagina.url().split("#")[0] + "#faturas");
  assert.equal(await pagina.isVisible("#soltar strong.so-mouse"), true);
  assert.equal(await pagina.isVisible("#soltar strong.so-toque"), false);
  await pagina.goto(pagina.url().split("#")[0] + "#painel");
});

test("V09 — consulta pendente ou com erro não afirma que está vazio", async () => {
  const estado = await pagina.evaluate(() => {
    const ler = (sel) => { const el = document.querySelector(sel); return { classe: el.className, antes: getComputedStyle(el, "::before").content }; };
    estadoConsultas.clientes = "pendente";
    estadoConsultas.pagamentos = "pendente";
    aplicarEstadosConsulta();
    const pend = { clientes: ler("#clientes-vazio"), resumo: ler("#pag-resumo") };
    estadoConsultas.clientes = "erro";
    aplicarEstadosConsulta();
    const erro = ler("#clientes-vazio");
    estadoConsultas.clientes = "ok";
    estadoConsultas.pagamentos = "ok";
    aplicarEstadosConsulta();
    return { pend, erro, ok: ler("#clientes-vazio") };
  });
  assert.match(estado.pend.clientes.classe, /consulta-pendente/);
  assert.equal(estado.pend.clientes.antes, '"Carregando…"', "não diz “Nenhum cliente” enquanto carrega");
  assert.equal(estado.pend.resumo.antes, '"Carregando…"', "sem totais zerados enquanto carrega");
  assert.match(estado.erro.antes, /Não foi possível carregar/);
  assert.doesNotMatch(estado.ok.classe, /consulta-/);
  // Contas: antes da primeira resposta o texto é de carregamento, e na falha, de erro.
  const contas = await pagina.evaluate(() => {
    pag.carregado = false; pag.erro = false; renderizarPagamentos();
    const carregando = document.querySelector("#pag-vazio").textContent;
    pag.erro = true; renderizarPagamentos();
    const erro = document.querySelector("#pag-vazio").textContent;
    pag.carregado = true; pag.erro = false; renderizarPagamentos();
    return { carregando, erro };
  });
  assert.equal(contas.carregando, "Carregando contas…");
  assert.match(contas.erro, /Não foi possível carregar as contas/);
});

test("V05 e V06 — refeição sem avaliação não conta como acerto/erro; treino sem intensidade não vira Moderada", async () => {
  await pagina.click(".aba[data-area=saude]");
  await pagina.waitForSelector("#saude-numeros .saude-numero");
  const marcar = (nome, valor) => pagina.click(`#saude-form label:has(> input[name=${nome}][value=${valor}])`);
  await marcar("tipo", "alimentacao");
  await marcar("resultado", "acerto");
  await pagina.fill("#saude-descricao", "Salada no almoço");
  await pagina.click("#saude-salvar");
  await pagina.waitForFunction(() => sau.registros.length === 1);
  await marcar("resultado", "neutro");
  await pagina.fill("#saude-descricao", "Arroz, feijão e frango");
  await pagina.selectOption("#saude-refeicao", "jantar");
  await pagina.click("#saude-salvar");
  await pagina.waitForFunction(() => sau.registros.length === 2);
  assert.equal(await texto(pagina, "#saude-nota"), "100", "sem avaliação não derruba a nota");
  assert.match(await texto(pagina, "#saude-historico"), /Arroz, feijão e frango .*sem avaliação/);
  assert.match(await texto(pagina, "#saude-historico"), /1 ✓ · 0 ✗ · 1 sem avaliação/);
  assert.equal(await pagina.evaluate(() => estatisticasSaude().alim7.total), 1);
  const salvo = (await local("registros")).find((r) => r.descricao === "Arroz, feijão e frango");
  assert.equal(salvo.avaliacao, "sem_avaliacao");

  await marcar("tipo", "exercicio");
  assert.equal(await pagina.inputValue("#saude-intensidade"), "", "começa como “Não informada”");
  assert.equal(await pagina.isVisible("#saude-form label.neutro"), false);
  await pagina.fill("#saude-descricao", "Caminhada");
  await pagina.fill("#saude-minutos", "40");
  await pagina.click("#saude-salvar");
  await pagina.waitForFunction(() => sau.registros.length === 3);
  const treino = (await local("registros")).find((r) => r.descricao === "Caminhada");
  assert.equal(treino.intensidade ?? null, null);
  assert.match(await texto(pagina, "#saude-historico"), /Caminhada .*intensidade não informada/);
});

test("V03 — refeição planejada não mexe no placar; confirmar vira realizada sem duplicar", async () => {
  const marcar = (nome, valor) => pagina.click(`#saude-form label:has(> input[name=${nome}][value=${valor}])`);
  const antes = await pagina.evaluate(() => { const s = estatisticasSaude(); return { total: s.total, nota: s.dia.nota, alim: s.alim7.total, acertos: s.acertos }; });
  await marcar("tipo", "alimentacao");
  await marcar("situacao", "planejada");
  assert.equal(await pagina.isVisible("#saude-resultado"), false, "plano não pede acerto/erro");
  await pagina.fill("#saude-descricao", "Marmita de frango e legumes");
  await pagina.selectOption("#saude-refeicao", "almoco");
  await pagina.fill("#saude-data-br", "09/10/2026"); // amanhã
  await pagina.click("#saude-salvar");
  await pagina.waitForSelector("#saude-planejadas:not([hidden])");
  const depois = await pagina.evaluate(() => { const s = estatisticasSaude(); return { total: s.total, nota: s.dia.nota, alim: s.alim7.total, acertos: s.acertos }; });
  assert.deepEqual(depois, antes, "planejar não muda consumo, acertos nem erros");
  assert.doesNotMatch(await texto(pagina, "#saude-historico"), /Marmita/);
  assert.match(await texto(pagina, "#saude-planejadas"), /Marmita de frango e legumes/);
  const plano = (await local("registros")).find((r) => r.descricao.startsWith("Marmita"));
  assert.equal(plano.situacao, "planejada");

  await pagina.click("#saude-planejadas [data-confirmar-plano]");
  assert.equal(await pagina.inputValue("#saude-data"), "2026-10-08", "confirma no dia de hoje");
  await marcar("resultado", "acerto");
  await pagina.click("#saude-salvar");
  await pagina.waitForFunction(() => sau.registros.some((r) => r.descricao.startsWith("Marmita")));
  const registros = (await local("registros")).filter((r) => r.descricao.startsWith("Marmita"));
  assert.equal(registros.length, 1, "não duplicou");
  assert.equal(registros[0].id, plano.id, "mesmo registro");
  assert.equal(registros[0].situacao, "realizada");
  assert.equal(await pagina.evaluate(() => estatisticasSaude().acertos), antes.acertos + 1);
  assert.equal(await pagina.isVisible("#saude-planejadas"), false);
});

test("V02 e V08 — editar o prazo de uma arte avulsa sem recriar; “Sem atrasos” com pendências futuras", async () => {
  await pagina.click(".aba[data-area=shark]");
  await pagina.click('.subaba[data-aba="shark-clientes"]');
  await pagina.click("#cliente-adicionar");
  await pagina.fill("#cliente-nome", "Estúdio Mar");
  await pagina.click("#cliente-form [type=submit]");
  await pagina.waitForSelector('.cliente-shark:has(h2:text-is("Estúdio Mar"))');
  await pagina.locator(".cliente-shark", { hasText: "Estúdio Mar" }).locator("[data-acao=nova-frente]").click();
  await pagina.fill("#frente-nome", "Pacote 20 artes");
  await pagina.fill("#frente-meta", "20");
  await pagina.click("#frente-form [type=submit]");
  await pagina.click('.subaba[data-aba="shark"]');
  await pagina.click("#extra-adicionar");
  await pagina.fill("#extra-nome", "Post de lançamento");
  await pagina.fill("#extra-prazo-br", "14/10/2026");
  await pagina.fill("#extra-quantidade", "2");
  await pagina.click("#extra-form [type=submit]");
  const linha = pagina.locator("#shark-tarefas .tarefa", { hasText: "Post de lançamento" });
  await linha.waitFor();

  // V08: nada atrasado, mas há entregas pela frente.
  const alerta = await texto(pagina, "#shark-alertas");
  assert.match(alerta, /Sem atrasos/);
  assert.match(alerta, /2 artes com prazo pela frente/);
  assert.doesNotMatch(alerta, /Tudo em dia/);

  const antes = await local("tarefas");
  const frenteAntes = (await local("frentes"))[0];
  await linha.locator("[data-editar-tarefa]").click();
  assert.equal(await texto(pagina, "#extra-titulo"), "Editar arte");
  assert.equal(await pagina.inputValue("#extra-prazo-br"), "14/10/2026");
  await pagina.fill("#extra-prazo-br", "21/10/2026");
  await pagina.click("#extra-form [type=submit]");
  await pagina.waitForFunction(() => JSON.parse(localStorage.getItem("vital.tarefas"))[0].prazo === "2026-10-21");
  const depois = await local("tarefas");
  assert.equal(depois.length, antes.length, "não duplicou");
  assert.equal(depois[0].id, antes[0].id, "mesma tarefa");
  assert.deepEqual({ ...depois[0], prazo: null }, { ...antes[0], prazo: null }, "status, quantidade e vínculo preservados");
  assert.equal((await local("frentes"))[0].metaArtes, frenteAntes.metaArtes, "meta do pacote não muda");
  assert.match(await linha.textContent(), /21\/10/);
  assert.deepEqual(await pagina.evaluate(() => window.__errosPagina || []), []);
});

test("Nenhum erro de JavaScript em todo o roteiro", async () => {
  assert.deepEqual(pagina.erros, []);
});

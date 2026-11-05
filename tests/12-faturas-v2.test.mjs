// Melhorias V2 (leitor de faturas, assinaturas e sincronização): um teste por item, V2-01 a V2-09.
// Os PDFs são FICTÍCIOS, gerados aqui com pdf-lib imitando os layouts reais (duas colunas, seções
// de próximas parcelas, cabeçalho em tabela e simulações de parcelamento). Nenhum dado real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { abrirNavegador, abrirPainel, SAIDA, texto, brl } from "./ajuda.mjs";

let navegador, pagina;
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);

/* Cada página é uma lista de linhas; cada linha, uma lista de [texto, x, dy?]. */
async function gerarPdf(nome, paginas) {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (const linhas of paginas) {
    const pg = doc.addPage([595, 842]);
    let y = 800;
    for (const linha of linhas) {
      for (const [t, x, dy = 0] of linha) pg.drawText(t, { x, y: y + dy, size: 8, font: fonte });
      y -= 10;
    }
  }
  const arquivo = path.join(SAIDA, nome);
  writeFileSync(arquivo, await doc.save());
  return arquivo;
}

// "Gold": resumo com pagamento anterior; compras à esquerda e avisos colados à direita.
const pdfGold = () => gerarPdf("v2-gold-ficticio.pdf", [[
  [["Banco Itaú - Cartão Gold", 40]],
  [["Total da fatura anterior", 300], ["300,00", 500]],
  [["Pagamento efetuado em 06/10/2026", 300], ["-300,00", 500]],
  [["Lançamentos atuais", 300], ["400,00", 500]],
  [["Vencimento: 08/11/2026", 40], ["= Total desta fatura", 300], ["400,00", 500]],
  [["Cartão 5555.XXXX.XXXX.1111", 40]],
  [["O total da sua fatura é:", 40], ["Com vencimento em:", 200], ["Limite total de crédito:", 360]],
  [["R$ 400,00", 40], ["08/11/2026", 200], ["R$ 900,00", 360]],
  [["Total a pagar R$ 450,00", 40]],
], [
  [["Pagamentos efetuados", 133], ["Novo teto de juros do cartão", 350]],
  [["06/10", 133], ["Pagamento via conta", 161], ["-300,00", 306]],
  [["P Total dos pagamentos", 133], ["-300,00", 306]],
  [["Lançamentos: compras e saques", 133]],
  [["DATA", 133], ["ESTABELECIMENTO", 161], ["VALOR EM R$", 289], ["Os juros e encargos que você irá pagar", 350, -3]],
  [["07/10", 133], ["Loja Ficticia A SAO PAUL", 161], ["10,00", 315], ["contratação, e caso ultrapassem a dívida", 350, -3]],
  [["outros SAO PAULO", 161]],
  [["09/10", 133], ["Mercado Imaginario SS", 161], ["190,00", 312], ["de parcelamento ou rotativo.", 350, -3]],
  [["09/10", 133], ["Academia Teste Um", 161], ["120,00", 312], ["Fique atento aos encargos para o próximo", 350, -3]],
  [["09/10", 133], ["Academia Teste Dois", 161], ["80,00", 315], ["período (08/11 a 07/12)", 350, -3]],
  [["L Total dos lançamentos atuais", 133], ["400,00", 312]],
]]);

// "Black": duas colunas de compras e a seção "Compras parceladas - próximas faturas".
const pdfBlack = () => gerarPdf("v2-black-ficticio.pdf", [[
  [["Banco Itaú - Cartão Black", 40]],
  [["Vencimento: 10/11/2026", 40], ["= Total desta fatura", 300], ["700,00", 500]],
  [["Cartão 5555.XXXX.XXXX.2222", 40]],
], [
  [["Pagamentos efetuados", 133], ["Lançamentos: compras e saques", 350]],
  [["06/10", 133], ["Pagamento via conta", 161], ["-1.000,00", 300], ["18/10", 350], ["LOJA DIREITA UM", 378], ["50,00", 540]],
  [["Lançamentos: compras e saques", 133], ["19/10", 350], ["PADARIA FICTICIA", 378], ["30,00", 540]],
  [["17/09", 133], ["PARCELADO X 02/06", 161], ["100,00", 312], ["27/10", 350], ["POSTO FICTICIO", 378], ["20,00", 540]],
  [["28/10", 133], ["ELETRO FICTICIO", 161], ["500,00", 312], ["Os juros e encargos que você irá pagar", 350, -3]],
  [["L Total dos lançamentos atuais", 133], ["700,00", 312]],
  [["Compras parceladas - próximas faturas", 133]],
  [["17/09", 133], ["PARCELADO X 03/06", 161], ["100,00", 312]],
  [["03/10", 133], ["OUTRO PARCELADO 02/03", 161], ["60,00", 315]],
  [["Próxima fatura", 133], ["160,00", 312]],
  [["Total para próximas faturas", 133], ["160,00", 312]],
]]);

// "C&A/Bradescard": total no cabeçalho em tabela, simulações de parcelamento, coluna da direita com "Demais faturas".
const pdfCea = () => gerarPdf("v2-cea-ficticio.pdf", [[
  [["Fatura mensal", 40]],
  [["BRADESCARD VISA GOLD 4000.12**.****.3333", 40]],
  [["Total da fatura", 40], ["Vencimento", 160], ["Limite de compras", 300]],
  [["R$ 15,00", 40], ["10/11/2026", 160], ["R$ 500,00", 300], ["R$ 100,00", 420]],
  [["Parcelamento da fatura", 40]],
  [["Valor total financiado: 100,00% R$ 16,20", 40]],
  [["Valor total a pagar:", 40], ["R$ 27,00", 200]],
  [["(=) Total", 40], ["R$ 15,00", 200]],
], [
  [["Lançamentos", 40], ["Total parcelado para as próximas faturas", 330]],
  [["Nacionais em Reais (R$)", 40], ["Próxima fatura", 330], ["R$ 15,00", 450]],
  [["27/05", 40], ["ANUIDADE TESTE (06/12)", 70], ["15,00", 250], ["Demais faturas", 330], ["R$ 90,00", 450]],
  [["06/10", 40], ["PAGAMENTO RECEBIDO - OBRIGADO", 70], ["15,00", 250], ["-", 275]],
  [["Total para as próximas faturas", 330], ["R$ 105,00", 450]],
]]);

// Nubank: total declarado R$ 100,02 e lançamentos de R$ 100,00 (diferença de centavos sem explicação).
const pdfNubank = () => gerarPdf("v2-nubank-ficticio.pdf", [[
  [["Nubank", 40]],
  [["Data de vencimento: 09 NOV 2026", 40]],
  [["Cartão final 4444", 40]],
  [["Total a pagar", 40], ["R$ 100,02", 200]],
  [["TRANSAÇÕES", 40]],
  [["10 OUT", 40], ["Padaria Ficticia", 110], ["R$ 60,00", 520]],
  [["12 OUT", 40], ["Livraria Teste", 110], ["R$ 40,00", 520]],
]]);

async function lerPdf(arquivo) {
  await pagina.goto(pagina.url().split("#")[0] + "#faturas");
  await pagina.waitForSelector("[data-vista=faturas]:not([hidden])");
  await pagina.setInputFiles("#pdf-arquivo", arquivo);
  await pagina.waitForSelector("#previa:not([hidden])");
}
const lancPrevia = () => pagina.evaluate(() => fat.leitura.lancamentos.map((l) => [l.data, l.descricao, l.valor]));
const salvarHabilitado = () => pagina.isEnabled("#previa [type=submit]");
async function salvar() {
  await pagina.click("#previa [type=submit]");
  await pagina.waitForSelector("#previa", { state: "hidden" });
}

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
  await pagina.evaluate(() => { for (const k of ["dividas", "pagamentos", "ganhos", "gastos", "investimentos"]) localStorage.setItem("vital." + k, "[]"); });
  await pagina.reload();
});
after(() => navegador?.close());

test("V2-01 — Gold em duas colunas: as 4 compras são lidas e batem com o total, sem o pagamento anterior", async () => {
  await lerPdf(await pdfGold());
  const lancs = await lancPrevia();
  assert.deepEqual(lancs.map((l) => l[2]), [10, 190, 120, 80]);
  assert.deepEqual(lancs.map((l) => l[1]), ["Loja Ficticia A SAO PAUL", "Mercado Imaginario SS", "Academia Teste Um", "Academia Teste Dois"]);
  assert.ok(!lancs.some((l) => l[2] < 0), "pagamento da fatura anterior fora da composição");
  assert.equal(await pagina.inputValue("#previa-total"), "400");
  assert.equal(await pagina.inputValue("#previa-final"), "1111");
  assert.equal(await pagina.inputValue("#previa-vencimento"), "2026-11-08", "08/11 como no PDF, sem reinterpretar dia útil");
  assert.match(await texto(pagina, "#previa-resumo"), /Lançamentos batem com o total/);
  assert.match(await texto(pagina, "#previa-lancamentos"), /Pagamento da fatura anterior .*fica fora da soma/);
  await pagina.fill("#previa-novo", "Itaú Gold Teste");
  await salvar();
  assert.doesNotMatch(await texto(pagina, "#planilha-resumo"), /Não detalhado/);
});

test("V2-03 — pagamento anterior não vira À vista negativo (também em fatura antiga já salva)", async () => {
  assert.match(await texto(pagina, "#planilha-resumo"), new RegExp(`À vista ${brl(400).replace("$", "\\$")} \\(4\\)`));
  // Fatura salva antes da correção, com a linha do pagamento: separada e fora da soma.
  await pagina.evaluate(() => {
    const faturas = JSON.parse(localStorage.getItem("vital.faturas"));
    faturas[0].lancamentos.push({ data: "2026-10-06", descricao: "Pagamento via conta", valor: -300, categoria: "Pagamentos e créditos" });
    localStorage.setItem("vital.faturas", JSON.stringify(faturas));
  });
  await pagina.reload();
  await pagina.waitForFunction(() => fat.cartoes.length > 0);
  await pagina.evaluate(() => { definirMes("2026-11"); fat.filtroCartao = fat.cartoes[0].id; fat.filtroMes = "2026-11"; renderizarFaturas(); });
  await pagina.waitForSelector("#planilha tbody tr");
  const resumo = await texto(pagina, "#planilha-resumo");
  assert.match(resumo, new RegExp(`À vista ${brl(400).replace("$", "\\$")} \\(4\\)`), resumo);
  assert.match(resumo, /Pagamento da fatura anterior -?R\$\s?-?300,00 \(fora da soma\)|Pagamento da fatura anterior -R\$ 300,00/);
  assert.doesNotMatch(resumo, /Não detalhado/);
  assert.match(await texto(pagina, "#planilha"), /pagamento anterior\s*fora da soma/);
  assert.doesNotMatch(await texto(pagina, "#relatorio"), /Pagamentos e créditos/);
  await pagina.evaluate(() => {
    const faturas = JSON.parse(localStorage.getItem("vital.faturas"));
    faturas[0].lancamentos = faturas[0].lancamentos.filter((l) => l.valor > 0);
    localStorage.setItem("vital.faturas", JSON.stringify(faturas));
  });
  await pagina.reload();
});

test("V2-09 — mesmo banco com final diferente pede escolha explícita; trocar o cartão mantém o vencimento", async () => {
  await lerPdf(await pdfBlack());
  assert.equal(await pagina.inputValue("#previa-cartao"), "__escolher", "não sugere o Gold só pelo banco");
  assert.match(await texto(pagina, "#previa-cartao-aviso"), /final 2222/);
  assert.equal(await salvarHabilitado(), false);
  await pagina.selectOption("#previa-cartao", "");
  assert.equal(await pagina.inputValue("#previa-vencimento"), "2026-11-10", "vencimento preservado");
  const gold = await pagina.evaluate(() => fat.cartoes[0].id);
  await pagina.selectOption("#previa-cartao", gold);
  assert.equal(await pagina.inputValue("#previa-vencimento"), "2026-11-10");
  assert.match(await texto(pagina, "#previa-resumo"), /Final lido 2222 ≠ final do cartão escolhido 1111/);
  await pagina.selectOption("#previa-cartao", "");
  await pagina.fill("#previa-novo", "Itaú Black Teste");
  assert.match(await texto(pagina, "#previa-resumo"), /Cartão Itaú Black Teste \(novo\) •••• 2222/);
  assert.equal(await salvarHabilitado(), true);
});

test("V2-02 — próximas parcelas ficam só como previsão; todas as compras correntes entram", async () => {
  const lancs = await lancPrevia();
  assert.deepEqual(lancs.map((l) => l[1]).sort(), ["ELETRO FICTICIO", "LOJA DIREITA UM", "PADARIA FICTICIA", "PARCELADO X 02/06", "POSTO FICTICIO"].sort());
  assert.equal(Math.round(lancs.reduce((t, l) => t + l[2], 0) * 100) / 100, 700);
  assert.ok(!lancs.some((l) => /03\/06|02\/03/.test(l[1])), "nada da seção de próximas faturas");
  assert.match(await texto(pagina, "#previa-lancamentos"), /2 parcelas das próximas faturas \(R\$\s160,00\): só previsão/);
  assert.match(await texto(pagina, "#previa-resumo"), /Lançamentos batem com o total/);
  await salvar();
});

test("V2-04 — Bradescard: total principal, vencimento e final certos; simulação ignorada; revisão obrigatória quando não bate", async () => {
  await lerPdf(await pdfCea());
  assert.equal(await pagina.inputValue("#previa-total"), "15", "não pega o “Valor total a pagar” da simulação");
  assert.equal(await pagina.inputValue("#previa-vencimento"), "2026-11-10");
  assert.equal(await pagina.inputValue("#previa-final"), "3333");
  assert.deepEqual(await lancPrevia(), [["2026-05-27", "ANUIDADE TESTE (06/12)", 15]], "não mistura a coluna “Demais faturas”");
  assert.equal(await salvarHabilitado(), true);
  // Único lançamento que não corresponde à fatura: bloqueia até a revisão.
  await pagina.fill("#previa-total", "52.9");
  assert.equal(await pagina.isVisible("#previa-revisao"), true);
  assert.equal(await salvarHabilitado(), false);
  await pagina.check("#previa-revisao input");
  assert.equal(await salvarHabilitado(), true);
  await pagina.click("#previa-cancelar");
  assert.equal((await local("faturas")).length, 2, "nada salvo");
});

test("V2-05 — corrigir e incluir lançamentos na prévia e na planilha, sem perder a conta; reimportação compara antes", async () => {
  // Prévia: corrige um valor, inclui uma linha e a conciliação acompanha.
  await lerPdf(await pdfNubank());
  assert.match(await texto(pagina, "#previa-resumo"), /R\$\s0,02 da fatura não foram detalhados/, "centavos do Nubank mantidos como diferença");
  await pagina.click("#previa-incluir");
  await pagina.fill("#previa-lancamentos tbody tr:last-child input[data-campo=descricao]", "Ajuste digitado à mão");
  await pagina.fill("#previa-lancamentos tbody tr:last-child input[data-campo=valor]", "5");
  await pagina.press("#previa-lancamentos tbody tr:last-child input[data-campo=valor]", "Tab");
  assert.match(await texto(pagina, "#previa-resumo"), /Soma dos lançamentos R\$\s105,00/);
  await pagina.click("#previa-lancamentos tbody tr:last-child [data-remover-previa]");
  assert.match(await texto(pagina, "#previa-resumo"), /Soma dos lançamentos R\$\s100,00/);
  await pagina.fill("#previa-novo", "Nubank Teste");
  await salvar();
  const nubank = (await local("faturas")).find((f) => f.totalInformado === 100.02);
  assert.equal(nubank.lancamentos.length, 2, "sem ajuste fictício para os R$ 0,02");

  // Planilha: editar descrição e valor de uma linha e incluir outra; a fatura e a conta continuam as mesmas.
  await pagina.waitForFunction(() => pag.contas.some((c) => c.faturaId && c.nome.includes("Nubank Teste")));
  const contaAntes = (await local("pagamentos")).find((c) => c.faturaId === nubank.id);
  const linha = pagina.locator("#planilha tbody tr", { hasText: "Livraria Teste" });
  await linha.locator("[data-editar-lanc]").click();
  await pagina.fill("#planilha tr.editando input[name=descricao]", "Livraria Teste (corrigida)");
  await pagina.fill("#planilha tr.editando input[name=valor]", "40.02");
  await pagina.click("#planilha tr.editando [data-salvar-lanc]");
  await pagina.waitForFunction(() => document.querySelector("#planilha").textContent.includes("Livraria Teste (corrigida)"));
  await pagina.click("#incluir-lancamento");
  await pagina.fill("#planilha tr.editando input[name=descricao]", "Compra que faltou");
  await pagina.fill("#planilha tr.editando input[name=valor]", "1");
  await pagina.click("#planilha tr.editando [data-salvar-lanc]");
  await pagina.waitForFunction(() => document.querySelector("#planilha").textContent.includes("Compra que faltou"));
  const depois = (await local("faturas")).find((f) => f.id === nubank.id);
  assert.equal(depois.lancamentos.length, 3);
  assert.equal(depois.lancamentos.find((l) => l.descricao === "Livraria Teste (corrigida)").valor, 40.02);
  const contaDepois = (await local("pagamentos")).find((c) => c.id === contaAntes.id);
  assert.ok(contaDepois && contaDepois.faturaId === nubank.id, "vínculo com a conta preservado");

  // Reimportar o mesmo PDF: comparação antes de substituir o detalhamento.
  await lerPdf(await pdfNubank());
  await pagina.selectOption("#previa-cartao", depois.cartaoId);
  assert.equal(await pagina.isVisible("#previa-comparacao"), true);
  assert.match(await texto(pagina, "#previa-comparacao"), /Já existe a fatura de Novembro de 2026.*1 iguais, 1 novos e 2 que saem/);
  assert.equal(await salvarHabilitado(), false, "só substitui com confirmação");
  await pagina.click("#previa-cancelar");
});

test("V2-08 — antes de salvar mostra a conta que será criada ou vinculada; possível duplicata sem fundir sozinha", async () => {
  // Conta manual já paga, cadastrada antes da importação, com o valor da fatura.
  await pagina.evaluate(() => {
    const contas = JSON.parse(localStorage.getItem("vital.pagamentos"));
    contas.push({ id: "manual-1", nome: "Cartão Ficticio Z", valor: 15, mesReferencia: "2026-11", vencimento: "2026-11-09", status: "pago", pagoEm: "2026-11-01T10:00:00.000Z" });
    localStorage.setItem("vital.pagamentos", JSON.stringify(contas));
  });
  await pagina.reload();
  await lerPdf(await pdfCea());
  await pagina.fill("#previa-novo", "C&A Teste");
  const conta = await texto(pagina, "#previa-conta");
  assert.match(conta, /Possível duplicata/);
  assert.match(conta, /Criar a conta “Fatura C&A Teste” de R\$\s15,00, vencimento 10\/11\/2026/);
  assert.match(conta, /Vincular à conta já cadastrada “Cartão Ficticio Z”.*paga — o pagamento é preservado/);
  assert.equal(await pagina.isChecked("#previa-conta input[value=nova]"), true, "nada é vinculado por inferência");
  await pagina.check("#previa-conta input[value='ligar:manual-1']");
  const total = (await local("pagamentos")).length;
  await salvar();
  await pagina.waitForFunction(() => pag.contas.find((c) => c.id === "manual-1")?.origem === "fatura");
  const contas = await local("pagamentos");
  assert.equal(contas.length, total, "nenhuma conta criada em dobro nem excluída");
  const ligada = contas.find((c) => c.id === "manual-1");
  assert.equal(ligada.status, "pago");
  assert.equal(ligada.pagoEm, "2026-11-01T10:00:00.000Z", "pagamento preservado");
  assert.equal(ligada.faturaId, (await local("faturas")).find((f) => f.totalInformado === 15).id);
});

test("V2-06 e V2-07 — assinatura só confirmada vira compromisso; falso positivo sai sem apagar a compra; serviços distintos separados", async () => {
  await pagina.evaluate(() => {
    const cartoes = JSON.parse(localStorage.getItem("vital.cartoes"));
    cartoes.push({ id: "c-assin", nome: "Cartão Assinaturas", final: "9999" });
    const faturas = JSON.parse(localStorage.getItem("vital.faturas"));
    faturas.push({ id: "f-assin", cartaoId: "c-assin", mes: "2026-11", vencimento: "2026-11-15", totalInformado: null, lancamentos: [
      { data: "2026-10-13", descricao: "AMAZON PRIME CANAIS", valor: 34.9, categoria: "Assinaturas" },
      { data: "2026-10-20", descricao: "AMAZONPRIMEBR", valor: 19.9, categoria: "Assinaturas" },
      { data: "2026-10-18", descricao: "APPLE.COM/BILL", valor: 24.99, categoria: "Assinaturas" },
      { data: "2026-10-19", descricao: "HBO MAX ASSINATURA", valor: 14.9, categoria: "Assinaturas" },
      { data: "2026-10-21", descricao: "APPLE.COM/BILL", valor: 69.9, categoria: "Outros" }, // revisada: não é assinatura
    ] });
    localStorage.setItem("vital.cartoes", JSON.stringify(cartoes));
    localStorage.setItem("vital.faturas", JSON.stringify(faturas));
  });
  await pagina.goto(pagina.url().split("#")[0] + "#assinaturas");
  await pagina.reload();
  await pagina.evaluate(() => definirMes("2026-11"));
  await pagina.waitForSelector("#assinaturas-tabela tbody tr");
  const linhas = () => pagina.$$eval("#assinaturas-tabela tbody tr", (trs) => trs.map((tr) => ({
    nome: tr.cells[0].querySelector("strong").textContent, texto: tr.cells[0].textContent.replace(/\s+/g, " "),
    valor: tr.cells[2].textContent.replace(/ /g, " ").trim(), status: tr.cells[5].textContent.trim() })));
  let l = await linhas();
  const prime = l.filter((x) => x.nome === "Prime Video");
  assert.equal(prime.length, 2, "duas cobranças distintas, não um plano único");
  assert.deepEqual(prime.map((x) => x.valor).sort(), [brl(19.9), brl(34.9)].sort());
  assert.ok(!l.some((x) => x.valor === brl(54.8)), "nada de “R$ 54,80/mês”");
  const hbo = l.find((x) => x.nome === "Max (HBO)");
  assert.equal(hbo.status, "Ativa", "descrição diz assinatura: confirmada");
  const apple = l.filter((x) => x.nome.startsWith("Apple"));
  assert.equal(apple.length, 1, "a cobrança revisada como Outros fica de fora");
  assert.equal(apple[0].status, "Possível assinatura");
  const resumo = await texto(pagina, "#assinaturas-resumo");
  assert.match(resumo, /1 confirmada · por mês R\$\s14,90 · por ano R\$\s178,80/);
  assert.match(resumo, /3 possíveis assinaturas · soma observada no mês R\$\s79,79 \(não é mensalidade confirmada\)/);

  // Falso positivo: "Não é assinatura" tira da recorrência e a compra continua na fatura.
  await pagina.locator("#assinaturas-tabela tbody tr", { hasText: "APPLE.COM/BILL" }).locator("[data-nao-assinatura]").click();
  await pagina.waitForFunction(() => !document.querySelector("#assinaturas-tabela").textContent.includes("APPLE.COM/BILL"));
  const fatura = (await local("faturas")).find((f) => f.id === "f-assin");
  assert.equal(fatura.lancamentos.length, 5, "nenhuma compra apagada");
  assert.equal(fatura.lancamentos.find((x) => x.valor === 24.99).categoria, "Outros");
  l = await linhas();
  assert.ok(!l.some((x) => x.nome.startsWith("Apple")));
});

test("Nenhum erro de JavaScript", () => {
  assert.deepEqual(pagina.erros, []);
});

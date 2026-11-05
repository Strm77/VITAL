const CAMPOS = ["nome", "valorParcela", "totalParcelas", "primeiraParcela", "diaVencimento", "parcelasPagas", "saldoInformado"];

/* ---------- Cálculos ---------- */

function vencimento(divida, indice) {
  const [ano, mes] = divida.primeiraParcela.split("-").map(Number);
  const dia = divida.diaVencimento || 1;
  const data = new Date(ano, mes - 1 + indice, 1);
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  data.setDate(Math.min(dia, ultimoDia));
  return data;
}

const mesISO = (data) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
const isoDia = (data) => `${mesISO(data)}-${String(data.getDate()).padStart(2, "0")}`;
/* Índice (0 = 1ª parcela) da parcela que vence no mês "AAAA-MM". */
function indiceDoMes(divida, mes) {
  const [a0, m0] = divida.primeiraParcela.split("-").map(Number);
  const [a1, m1] = mes.split("-").map(Number);
  return (a1 - a0) * 12 + (m1 - m0);
}
/* Parcelas marcadas uma a uma: { "3": { pagoEm, origem, valorPago } }. */
function quitadasDe(divida) {
  const q = divida.parcelasQuitadas;
  if (!q) return {};
  if (typeof q === "string") { try { return JSON.parse(q) || {}; } catch { return {}; } }
  return typeof q === "object" ? q : {};
}
/* Conta do controle de pagamentos que é a parcela desta dívida no mês (V11). */
function contaDaParcela(divida, mes) {
  let contas = [];
  try { contas = typeof pag !== "undefined" ? pag.contas : []; } catch {}
  const doMes = contas.filter((c) => (typeof mesDaConta === "function" ? mesDaConta(c) : String(c.vencimento || "").slice(0, 7)) === mes);
  return doMes.find((c) => c.dividaId === divida.id)
    || (typeof contaPareceParcela === "function" ? doMes.find((c) => contaPareceParcela(c, divida)) : null)
    || null;
}

function calcular(divida) {
  const total = Number(divida.totalParcelas) || 0;
  const valorParcela = Number(divida.valorParcela) || 0;
  // Base: "parcelas já pagas" (as primeiras, em ordem) ou, sem esse número, toda parcela já vencida.
  let base = divida.parcelasPagas;
  if (base == null || base === "") {
    base = 0;
    while (base < total && vencimento(divida, base) < dataRef()) base++;
  }
  base = Math.max(0, Math.min(Number(base), total));
  const marcadas = quitadasDe(divida);

  // Situação de cada parcela: paga pela base, marcada à mão (antecipada ou antes do vencimento)
  // ou paga pela conta do mês ligada a ela.
  const parcelas = Array.from({ length: total }, (_, i) => {
    const venc = vencimento(divida, i);
    const mes = mesISO(venc);
    const marca = marcadas[String(i + 1)] || null;
    const conta = contaDaParcela(divida, mes);
    const pagaPelaConta = conta && conta.status === "pago";
    const pago = i < base || !!marca || !!pagaPelaConta;
    const pagoEm = marca?.pagoEm || (pagaPelaConta && conta.pagoEm ? String(conta.pagoEm).slice(0, 10) : null);
    return {
      numero: i + 1, vencimento: venc, mes, pago, marca, conta, pagoEm,
      origem: marca?.origem || (pagaPelaConta ? conta.origemPagamento : null) || null,
      valor: marca && Number(marca.valorPago) > 0 ? Number(marca.valorPago) : valorParcela,
      // Paga num mês anterior ao do vencimento: não é cobrada no mês dela.
      antecipada: !!marca && !!marca.pagoEm && marca.pagoEm.slice(0, 7) < mes,
    };
  });
  const pagasLista = parcelas.filter((p) => p.pago);
  const pagas = pagasLista.length;
  const restantes = total - pagas;
  const quitada = restantes === 0;
  const primeiraAberta = parcelas.find((p) => !p.pago);
  const ultimaAberta = [...parcelas].reverse().find((p) => !p.pago);
  const termino = ultimaAberta ? ultimaAberta.vencimento : vencimento(divida, Math.max(total - 1, 0));
  const ultima = vencimento(divida, Math.max(total - 1, 0));
  const saldoInformado = divida.saldoInformado != null && divida.saldoInformado !== "" ? Number(divida.saldoInformado) : null;

  // O que esta dívida pesa no mês da timeline (V10–V13):
  //   parcela do mês (se não foi antecipada em outro mês e não é já uma conta do controle)
  //   + parcelas antecipadas pagas neste mês.
  const idx = indiceDoMes(divida, mesRef);
  const doMes = idx >= 0 && idx < total ? parcelas[idx] : null;
  const ativaNoMes = !!doMes;
  const noMes = [];
  if (doMes && !doMes.antecipada && !doMes.conta) {
    noMes.push({
      numero: doMes.numero, valor: doMes.valor, vencimento: doMes.vencimento, origem: doMes.origem,
      // Parcela já vencida conta como paga (regra antiga) até ser marcada de outro jeito.
      pago: doMes.pago || doMes.vencimento < hoje, antecipacao: false,
    });
  }
  parcelas.filter((p) => p.antecipada && p.marca.pagoEm.slice(0, 7) === mesRef && !p.conta).forEach((p) => {
    noMes.push({ numero: p.numero, valor: p.valor, vencimento: p.vencimento, origem: p.origem, pago: true, antecipacao: true });
  });
  const somaNoMes = (f) => noMes.filter(f).reduce((t, p) => t + p.valor, 0);

  return {
    ...divida,
    valorParcela,
    totalParcelas: total,
    pagas,
    restantes,
    parcelaAtual: quitada ? total : primeiraAberta.numero,
    quitada,
    parcelas,
    valorTotal: valorParcela * total,
    valorPago: pagasLista.reduce((t, p) => t + p.valor, 0),
    valorRestante: saldoInformado != null ? saldoInformado : valorParcela * restantes,
    saldoInformado,
    termino,
    ultimaParcela: ultima,
    ativaNoMes,
    parcelaDoMes: doMes,
    vencimentoNoMes: doMes ? doMes.vencimento : null,
    noMes,
    valorNoMes: somaNoMes(() => true),
    pagoNoMes: somaNoMes((p) => p.pago),
    chequeNoMes: somaNoMes((p) => p.pago && p.origem === "cheque_especial"),
    progresso: total ? pagas / total : 1,
  };
}

/* ---------- Interface ---------- */


let armazenamento = null;
let parcelasDoMes = 0; // lido também pela torre (torre.js)
let dividasCalculadas = []; // lido pelo gráfico de pizza
let dividasAtuais = [];
let editandoId = null; // null = fechado, "" = nova dívida, outro = id em edição

function mostrarAviso(texto) {
  const aviso = document.getElementById("aviso");
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

function abrirFormulario(id) {
  editandoId = id;
  const form = document.getElementById("formulario");
  const divida = dividasAtuais.find((d) => d.id === id);
  document.getElementById("titulo-formulario").textContent = divida ? "Editar dívida" : "Nova dívida";
  form.reset();
  if (divida) {
    CAMPOS.forEach((campo) => {
      form.elements[campo].value = divida[campo] ?? "";
    });
  } else {
    // O dia do vencimento não é preenchido sozinho: só com a escolha do usuário.
    form.elements.primeiraParcela.value = mesRef;
  }
  form.hidden = false;
  document.getElementById("botao-adicionar").hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormulario() {
  editandoId = null;
  document.getElementById("formulario").hidden = true;
  document.getElementById("botao-adicionar").hidden = false;
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const v = (campo) => form.elements[campo].value.trim();
  const divida = {
    nome: v("nome"),
    valorParcela: Number(v("valorParcela").replace(",", ".")),
    totalParcelas: parseInt(v("totalParcelas"), 10),
    primeiraParcela: v("primeiraParcela"),
    diaVencimento: parseInt(v("diaVencimento"), 10),
  };
  if (v("parcelasPagas") !== "") divida.parcelasPagas = parseInt(v("parcelasPagas"), 10);
  // Mantém o que não está no formulário (parcelas marcadas uma a uma).
  const anterior = dividasAtuais.find((d) => d.id === editandoId);
  if (anterior?.parcelasQuitadas) divida.parcelasQuitadas = anterior.parcelasQuitadas;
  const saldo = v("saldoInformado").replace(",", ".");
  if (saldo !== "") {
    divida.saldoInformado = Number(saldo);
    if (!(divida.saldoInformado >= 0)) return mostrarAviso("O saldo informado pelo banco precisa ser um valor positivo.");
    divida.saldoInformadoEm = anterior && Number(anterior.saldoInformado) === divida.saldoInformado && anterior.saldoInformadoEm
      ? anterior.saldoInformadoEm : isoDia(hoje);
  } else {
    divida.saldoInformado = null;
    divida.saldoInformadoEm = null;
  }
  if (Number.isNaN(divida.diaVencimento)) delete divida.diaVencimento;

  if (!divida.nome || !(divida.valorParcela > 0) || !(divida.totalParcelas > 0) || !divida.primeiraParcela) {
    mostrarAviso("Preencha nome, valor da parcela, total de parcelas e mês da 1ª parcela.");
    return;
  }
  if (divida.parcelasPagas > divida.totalParcelas) {
    mostrarAviso("Parcelas pagas não pode ser maior que o total de parcelas.");
    return;
  }

  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await armazenamento.salvar(editandoId || null, divida);
    mostrarAviso("");
    fecharFormulario();
  } catch (e) {
    mostrarAviso("Não foi possível salvar. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

async function excluir(botao, id) {
  if (botao.dataset.confirmar !== "sim") {
    botao.dataset.confirmar = "sim";
    botao.textContent = "Confirmar exclusão";
    botao.classList.add("perigo");
    return;
  }
  botao.disabled = true;
  try {
    await armazenamento.excluir(id);
    abertos.delete(id);
    if (editandoId === id) fecharFormulario();
  } catch {
    botao.disabled = false;
    mostrarAviso("Não foi possível excluir. Tente de novo.");
  }
}

const ORIGENS_PARCELA = { proprio: "Recursos próprios", cheque_especial: "Cheque especial", outro_credito: "Outro crédito" };
const dataBRDe = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
let dividasCarregadas = false;

/* Painel de parcelas: marcar a do mês como paga (V12), marcar antecipadas (V10) e de onde
 * saiu o dinheiro (V13). As marcações ficam na própria dívida (parcelasQuitadas). */
function htmlParcelas(d) {
  const doMes = d.parcelaDoMes;
  const linhaParcela = (p) => {
    const quem = p.conta ? `conta “${escapar(p.conta.nome)}”` : "";
    const sit = p.pago
      ? `${p.antecipada ? "Antecipada" : "Paga"}${p.pagoEm ? ` em ${dataBRDe(p.pagoEm)}` : ""}${p.origem && p.origem !== "proprio" ? ` · ${ORIGENS_PARCELA[p.origem].toLowerCase()}` : ""}${quem ? ` · ${quem}` : ""}`
      : p.vencimento < hoje ? "Vencida" : "A pagar";
    const botao = p.marca
      ? `<button type="button" class="botao mini" data-desmarcar="${p.numero}">Desfazer</button>`
      : p.pago ? "" : `<button type="button" class="botao mini" data-marcar="${p.numero}">Marcar paga</button>`;
    return `<li class="${doMes && p.numero === doMes.numero ? "do-mes" : ""}">
      <span class="num-parcela">${p.numero}</span>
      <span>${capitalizar(mesAno.format(p.vencimento))} <span class="sub">${sit}</span></span>
      <span class="num">${moeda.format(p.valor)}</span>
      <span>${botao}</span></li>`;
  };
  return `
    <div class="parcelas-divida">
      ${doMes ? `<div class="parcela-mes"><strong>Parcela de ${nomeMesRef().toLowerCase()} (${doMes.numero}/${d.totalParcelas}):</strong>
        <span class="status ${doMes.pago ? "pago" : "pendente"}">${doMes.pago ? (doMes.antecipada ? "Antecipada" : "Paga") : "Pendente"}</span>
        ${!doMes.pago ? `<button type="button" class="botao mini primario" data-marcar="${doMes.numero}">Marcar como paga</button>` : ""}</div>` : ""}
      <h4>Parcelas</h4>
      <div class="parcelas-opcoes">
        <label class="campo">Pago em <input type="date" name="pagoEm" value="${isoDia(hoje)}"></label>
        <label class="campo">Pago com
          <select name="origem">
            <option value="proprio">Recursos próprios</option>
            <option value="cheque_especial">Cheque especial</option>
            <option value="outro_credito">Outro crédito</option>
          </select></label>
        <label class="campo">Valor pago <span class="dica">(opcional, com desconto)</span>
          <input type="number" name="valorPago" min="0.01" step="0.01" inputmode="decimal" placeholder="${d.valorParcela.toFixed(2)}"></label>
      </div>
      <ul class="parcelas-lista">${d.parcelas.map(linhaParcela).join("")}</ul>
    </div>`;
}

async function marcarParcela(d, numero, item, desfazer) {
  const bruto = dividasAtuais.find((x) => x.id === d.id);
  if (!bruto) return;
  const { id, ...dados } = bruto;
  const quitadas = { ...quitadasDe(bruto) };
  if (desfazer) delete quitadas[String(numero)];
  else {
    const caixa = item.querySelector(".parcelas-opcoes");
    const pagoEm = caixa.querySelector("[name=pagoEm]").value || isoDia(hoje);
    const valor = Number(String(caixa.querySelector("[name=valorPago]").value).replace(",", "."));
    quitadas[String(numero)] = {
      pagoEm,
      origem: caixa.querySelector("[name=origem]").value || "proprio",
      ...(valor > 0 ? { valorPago: Math.round(valor * 100) / 100 } : {}),
    };
  }
  try {
    await armazenamento.salvar(id, { ...dados, parcelasQuitadas: Object.keys(quitadas).length ? quitadas : null });
    mostrarAviso("");
  } catch {
    mostrarAviso("Não foi possível atualizar a parcela. Tente de novo.");
  }
}

function renderizar(lista) {
  document.getElementById("mes-atual").textContent = nomeMesRef();
  dividasAtuais = [...lista].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const dividas = dividasAtuais.map(calcular);
  const ul = document.getElementById("lista-dividas");
  ul.innerHTML = "";

  document.getElementById("vazio").hidden = dividas.length > 0;
  document.getElementById("resumo").hidden = dividas.length === 0;

  dividas.forEach((d) => {
    const item = document.createElement("li");
    item.className = "divida" + (d.ativaNoMes ? "" : " fora-do-mes");
    const idDetalhes = `detalhes-${d.id}`;
    const doMes = d.parcelaDoMes;
    const situacaoMes = !doMes ? "sem parcela neste mês"
      : doMes.conta ? `parcela do mês = conta “${escapar(doMes.conta.nome)}”`
      : doMes.antecipada ? "parcela do mês já antecipada"
      : doMes.pago ? `parcela ${doMes.numero} paga` : `falta ${Math.round((1 - d.progresso) * 100)}%`;
    item.innerHTML = `
      <button class="linha" aria-expanded="false" aria-controls="${idDetalhes}">
        <span class="rotulo">${escapar(d.nome)}</span>
        <span class="valor">${moeda.format(d.valorParcela)}</span>
        <span class="seta" aria-hidden="true"></span>
      </button>
      <div class="barra" role="progressbar" aria-label="Progresso de ${escapar(d.nome)}">
        <div class="preenchimento"></div>
      </div>
      <div class="porcentagem">
        <span>${Math.round(d.progresso * 100)}% pago</span>
        <span>${situacaoMes}</span>
      </div>
      ${d.chequeNoMes ? `<p class="aviso-cheque">${moeda.format(d.chequeNoMes)} desta dívida foram pagos com cheque especial: para o empréstimo está pago, mas o valor continua devido no saldo do banco.</p>` : ""}
      <div class="detalhes-grupo" id="${idDetalhes}" hidden>
        <dl class="detalhes">
          ${listaDetalhes([
            ["Parcela atual", d.quitada ? "Quitada" : `${d.parcelaAtual} de ${d.totalParcelas}`],
            ["Parcelas que faltam", d.restantes],
            ["Previsão de término", capitalizar(mesAno.format(d.termino))],
            ["Valor da parcela", moeda.format(d.valorParcela)],
            ["Valor total da dívida", moeda.format(d.valorTotal)],
            ["Já pago", moeda.format(d.valorPago)],
            [d.saldoInformado != null ? "Saldo informado pelo banco" : "Falta pagar",
              moeda.format(d.valorRestante) + (d.saldoInformado != null && d.saldoInformadoEm ? ` <span class="sub">(em ${dataBRDe(d.saldoInformadoEm)})</span>` : "")],
            ...(d.saldoInformado != null ? [["Parcelas restantes × valor", moeda.format(d.valorParcela * d.restantes)]] : []),
          ])}
        </dl>
        ${htmlParcelas(d)}
        <div class="acoes">
          <button type="button" class="botao" data-acao="editar">Editar</button>
          <button type="button" class="botao" data-acao="excluir">Excluir</button>
        </div>
      </div>`;
    ul.appendChild(item);
    preencherBarra(item.querySelector(".barra"), d.progresso);
    alternar(item.querySelector(".linha"), item.querySelector(".detalhes-grupo"), d.id);
    item.querySelector("[data-acao=editar]").addEventListener("click", () => abrirFormulario(d.id));
    const botaoExcluir = item.querySelector("[data-acao=excluir]");
    botaoExcluir.addEventListener("click", () => excluir(botaoExcluir, d.id));
    item.querySelectorAll("[data-marcar]").forEach((b) => b.addEventListener("click", () => { b.disabled = true; marcarParcela(d, Number(b.dataset.marcar), item, false); }));
    item.querySelectorAll("[data-desmarcar]").forEach((b) => b.addEventListener("click", () => { b.disabled = true; marcarParcela(d, Number(b.dataset.desmarcar), item, true); }));
  });

  const ativas = dividas.filter((d) => d.ativaNoMes);
  const soma = (campo, lista = dividas) => lista.reduce((t, d) => t + d[campo], 0);
  const total = soma("valorTotal");
  const pago = soma("valorPago");
  const ultimoTermino = dividas.reduce((max, d) => (d.termino > max ? d.termino : max), new Date(0));

  dividasCalculadas = dividas;
  renderizarGrafico();
  // Parcelas do mês: sem as que já são contas do controle (V11) e sem as antecipadas em outro mês (V10).
  parcelasDoMes = soma("valorNoMes");
  document.dispatchEvent(new CustomEvent("dividas-atualizadas", { detail: { parcelasMes: parcelasDoMes } }));

  document.getElementById("total-mensal").textContent = moeda.format(parcelasDoMes);
  preencherBarra(document.getElementById("barra-geral"), total ? pago / total : 1);

  document.getElementById("detalhes-resumo").innerHTML = `<dl class="detalhes">${listaDetalhes([
    ["Dívidas com parcela no mês", `${ativas.length} de ${dividas.length}`],
    ["Valor total das dívidas", moeda.format(total)],
    ["Já pago", `${moeda.format(pago)} (${Math.round((pago / total) * 100 || 0)}%)`],
    ["Falta pagar", moeda.format(soma("valorRestante"))],
    ["Parcelas que faltam (somadas)", soma("restantes")],
    ["Livre de todas as dívidas em", dividas.length ? capitalizar(mesAno.format(ultimoTermino)) : "—"],
  ])}</dl>`;
}

/* ---------- Gráfico de pizza: compromissos do mês ----------
 * Junta três fontes, cada uma com sua família de cor:
 *   Dívidas  → parcela do mês de cada dívida em aberto (vermelhos)
 *   Contas   → contas do controle de pagamentos que vencem neste mês (âmbar)
 *   Cartões  → faturas de cartão que vencem neste mês, já com o valor editado (roxos)
 * Dentro de cada grupo, o maior valor fica com o tom mais escuro.
 */

const GRUPOS_PIZZA = [
  { chave: "dividas", nome: "Dívidas", matiz: 0 },
  { chave: "contas", nome: "Contas", matiz: 40 },
  { chave: "cartoes", nome: "Cartões", matiz: 268 },
];

function tons(matiz, qtd) {
  // No fundo preto, tons escuros somem e o âmbar escuro vira marrom: começa mais claro.
  const escuro = typeof temaEscuro === "function" && temaEscuro();
  const ambar = matiz > 20 && matiz < 60;
  const min = escuro ? (ambar ? 55 : 48) : ambar ? 42 : 32;
  const max = escuro ? 82 : 74;
  if (qtd === 1) return [`hsl(${matiz} 75% ${min + 6}%)`];
  return Array.from({ length: qtd }, (_, i) => {
    const t = i / (qtd - 1);
    const luz = min + t * (max - min);
    const sat = (ambar ? 92 : 78) - t * 18;
    return `hsl(${matiz} ${sat.toFixed(0)}% ${luz.toFixed(0)}%)`;
  });
}
document.addEventListener("tema-alterado", () => renderizarGrafico());

function fatia(cx, cy, r, inicio, fim) {
  if (fim - inicio >= Math.PI * 2 - 1e-6) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  const x1 = cx + r * Math.sin(inicio), y1 = cy - r * Math.cos(inicio);
  const x2 = cx + r * Math.sin(fim), y2 = cy - r * Math.cos(fim);
  const grande = fim - inicio > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2} Z`;
}

function compromissosDoMes() {
  let contas = [];
  try { contas = typeof pag !== "undefined" ? pag.contas : []; } catch {}
  const mesConta = (c) => (typeof mesDaConta === "function" ? mesDaConta(c) : String(c.vencimento || "").slice(0, 7));
  const doMes = contas.filter((c) => mesConta(c) === mesRef && Number(c.valor) > 0);
  const item = (nome, valor, pago) => ({ nome, valor: Number(valor), pago });
  return {
    // Parcela do mês e antecipações pagas no mês; a parcela que já é uma conta entra só como conta (V11).
    dividas: dividasCalculadas.flatMap((d) => d.noMes.filter((p) => p.valor > 0).map((p) =>
      item(p.antecipacao ? `${d.nome} (parcela ${p.numero} antecipada)` : d.nome, p.valor, p.pago))),
    contas: doMes.filter((c) => c.origem !== "fatura").map((c) => item(c.nome, c.valor, c.status === "pago")),
    cartoes: [
      ...doMes.filter((c) => c.origem === "fatura").map((c) => item(c.nome, c.valor, c.status === "pago")),
      // Meses futuros sem fatura importada: previsão pelas parcelas já programadas.
      ...(typeof faturasPrevistas === "function" ? faturasPrevistas(mesRef).map((f) => item(f.nome, f.valor, false)) : []),
    ],
  };
}

/* V16: uma cor bem diferente para cada fatia (matizes espaçados; claros o bastante no escuro). */
const MATIZES_PIZZA = [4, 210, 42, 140, 280, 185, 25, 330, 95, 245, 160, 60];
function coresDistintas(qtd) {
  const escuro = typeof temaEscuro === "function" && temaEscuro();
  return Array.from({ length: qtd }, (_, i) => {
    const matiz = MATIZES_PIZZA[i % MATIZES_PIZZA.length];
    const volta = Math.floor(i / MATIZES_PIZZA.length) % 2; // além de 12 fatias, alterna a luz
    const luz = escuro ? (volta ? 72 : 58) : volta ? 66 : 48;
    const sat = matiz > 30 && matiz < 70 ? 85 : 68;
    return `hsl(${matiz} ${sat}% ${luz}%)`;
  });
}

function renderizarGrafico() {
  const svg = document.getElementById("pizza");
  const legenda = document.getElementById("legenda");
  const dica = document.getElementById("dica-grafico");
  const dados = compromissosDoMes();
  const fatias = [];
  GRUPOS_PIZZA.forEach((g) => {
    const lista = dados[g.chave].sort((a, b) => b.valor - a.valor);
    lista.forEach((it) => fatias.push({ ...it, grupo: g }));
  });
  const cores = coresDistintas(fatias.length);
  fatias.forEach((f, i) => { f.cor = cores[i]; });
  const total = fatias.reduce((t, f) => t + f.valor, 0);

  document.getElementById("grafico-mes").textContent = nomeMesRef();
  svg.innerHTML = "";
  legenda.innerHTML = "";
  document.getElementById("pizza-total").textContent = "";
  dica.hidden = true;
  document.getElementById("grafico-vazio").hidden = fatias.length > 0;
  svg.parentElement.hidden = fatias.length === 0;
  if (!fatias.length) return;

  const ns = "http://www.w3.org/2000/svg";
  const itens = [];
  const focar = (i) => {
    svg.classList.toggle("focado", i != null);
    itens.forEach(({ caminho, linha }, j) => {
      caminho.classList.toggle("ativo", i === j);
      linha.classList.toggle("ativo", i === j);
    });
    if (i == null) dica.hidden = true;
  };
  const pct = (v) => `${Math.round((v / total) * 100)}%`;

  let angulo = 0;
  let grupoAtual = null;
  fatias.forEach((f, i) => {
    const parte = f.valor / total;
    const fim = angulo + parte * Math.PI * 2;
    const caminho = document.createElementNS(ns, "path");
    caminho.setAttribute("d", fatia(100, 100, 96, angulo, fim));
    caminho.setAttribute("fill", f.cor);
    const meio = (angulo + fim) / 2;
    const texto = `${f.grupo.nome} · ${f.nome}: ${moeda.format(f.valor)} (${pct(f.valor)})${f.pago ? " · pago" : ""}`;
    caminho.setAttribute("aria-label", texto);
    const mostrar = () => {
      focar(i);
      dica.textContent = texto;
      const r = svg.getBoundingClientRect().width / 200;
      dica.style.left = "50%";
      dica.style.top = (100 - 60 * Math.cos(meio)) * r + "px";
      dica.hidden = false;
    };
    caminho.addEventListener("mouseenter", mostrar);
    caminho.addEventListener("click", mostrar); // toque no celular
    caminho.addEventListener("mouseleave", () => focar(null));
    svg.appendChild(caminho);
    angulo = fim;

    if (grupoAtual !== f.grupo) {
      grupoAtual = f.grupo;
      const subtotal = fatias.filter((x) => x.grupo === f.grupo).reduce((t, x) => t + x.valor, 0);
      const cab = document.createElement("li");
      cab.className = "grupo-legenda";
      cab.innerHTML = `<span></span><span class="nome">${f.grupo.nome}</span><span class="num">${moeda.format(subtotal)}</span><span class="pct">${pct(subtotal)}</span>`;
      legenda.appendChild(cab);
    }
    const linha = document.createElement("li");
    linha.innerHTML = `
      <span class="cor" style="background:${f.cor}"></span>
      <span class="nome">${escapar(f.nome)}${f.pago ? ' <span class="pago-tag">pago</span>' : ""}</span>
      <span class="num">${moeda.format(f.valor)}</span>
      <span class="pct">${pct(f.valor)}</span>`;
    linha.dataset.indice = i;
    linha.tabIndex = 0;
    linha.setAttribute("role", "button");
    linha.setAttribute("aria-label", texto);
    linha.addEventListener("mouseenter", () => focar(i));
    linha.addEventListener("mouseleave", () => focar(null));
    // Toque (ou Enter) na legenda destaca a fatia e mostra nome e valor.
    linha.addEventListener("click", mostrar);
    linha.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mostrar(); } });
    legenda.appendChild(linha);
    itens.push({ caminho, linha });
  });

  document.getElementById("pizza-total").innerHTML = `Total do mês <strong>${moeda.format(total)}</strong>`;
  const linhaTotal = document.createElement("li");
  linhaTotal.className = "total-legenda";
  linhaTotal.innerHTML = `<span></span><span class="nome"><strong>Total do mês</strong></span><span class="num"><strong>${moeda.format(total)}</strong></span><span class="pct">100%</span>`;
  legenda.appendChild(linhaTotal);
}

// Toque fora do gráfico esconde a dica (no celular não existe "tirar o mouse").
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#pizza, #legenda")) {
    document.getElementById("pizza")?.classList.remove("focado");
    const dica = document.getElementById("dica-grafico");
    if (dica) dica.hidden = true;
  }
});

async function iniciar() {
  alternar(document.getElementById("botao-resumo"), document.getElementById("detalhes-resumo"), "resumo");
  document.getElementById("botao-adicionar").addEventListener("click", () => abrirFormulario(""));
  document.getElementById("botao-cancelar").addEventListener("click", () => { mostrarAviso(""); fecharFormulario(); });
  document.getElementById("formulario").addEventListener("submit", enviarFormulario);
  aoMudarMes(() => renderizar(dividasAtuais));

  armazenamento = await abrirArmazenamento("dividas", typeof DIVIDAS !== "undefined" ? DIVIDAS : []);
  armazenamento.observar(
    (lista) => {
      document.getElementById("carregando").hidden = true;
      dividasCarregadas = true;
      renderizar(lista);
    },
    () => {
      // Falha na consulta: avisa sem dizer que não há dívidas (V09).
      if (!dividasCarregadas) document.getElementById("carregando").textContent = "Não foi possível carregar as dívidas.";
      mostrarAviso("Não foi possível carregar as dívidas. Recarregue a página.");
    }
  );
}

iniciar();

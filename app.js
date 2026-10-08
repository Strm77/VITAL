const CAMPOS = ["nome", "valorParcela", "totalParcelas", "primeiraParcela", "diaVencimento", "parcelasPagas"];

/* ---------- Cálculos ---------- */

function vencimento(divida, indice) {
  const [ano, mes] = divida.primeiraParcela.split("-").map(Number);
  const dia = divida.diaVencimento || 1;
  const data = new Date(ano, mes - 1 + indice, 1);
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  data.setDate(Math.min(dia, ultimoDia));
  return data;
}

function calcular(divida) {
  const total = Number(divida.totalParcelas) || 0;
  const valorParcela = Number(divida.valorParcela) || 0;
  let pagas = divida.parcelasPagas;
  if (pagas == null || pagas === "") {
    pagas = 0;
    while (pagas < total && vencimento(divida, pagas) < dataRef()) pagas++;
  }
  pagas = Math.max(0, Math.min(Number(pagas), total));

  const quitada = pagas >= total;
  // A dívida tem parcela no mês da timeline? (entre o mês da 1ª e o da última parcela)
  const termino = vencimento(divida, Math.max(total - 1, 0));
  const mesFim = `${termino.getFullYear()}-${String(termino.getMonth() + 1).padStart(2, "0")}`;
  const ativaNoMes = total > 0 && divida.primeiraParcela <= mesRef && mesRef <= mesFim;
  return {
    ...divida,
    valorParcela,
    totalParcelas: total,
    pagas,
    restantes: total - pagas,
    parcelaAtual: quitada ? total : pagas + 1,
    quitada,
    valorTotal: valorParcela * total,
    valorPago: valorParcela * pagas,
    valorRestante: valorParcela * (total - pagas),
    termino,
    ativaNoMes,
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
    form.elements.primeiraParcela.value = mesRef;
    form.elements.diaVencimento.value = 10;
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
        <span>${d.ativaNoMes ? `falta ${Math.round((1 - d.progresso) * 100)}%` : "sem parcela neste mês"}</span>
      </div>
      <div class="detalhes-grupo" id="${idDetalhes}" hidden>
        <dl class="detalhes">
          ${listaDetalhes([
            ["Parcela atual", d.quitada ? "Quitada" : `${d.parcelaAtual} de ${d.totalParcelas}`],
            ["Parcelas que faltam", d.restantes],
            ["Previsão de término", capitalizar(mesAno.format(d.termino))],
            ["Valor da parcela", moeda.format(d.valorParcela)],
            ["Valor total da dívida", moeda.format(d.valorTotal)],
            ["Já pago", moeda.format(d.valorPago)],
            ["Falta pagar", moeda.format(d.valorRestante)],
          ])}
        </dl>
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
  });

  const ativas = dividas.filter((d) => d.ativaNoMes);
  const soma = (campo, lista = dividas) => lista.reduce((t, d) => t + d[campo], 0);
  const total = soma("valorTotal");
  const pago = soma("valorPago");
  const ultimoTermino = dividas.reduce((max, d) => (d.termino > max ? d.termino : max), new Date(0));

  dividasCalculadas = dividas;
  renderizarGrafico();
  parcelasDoMes = soma("valorParcela", ativas);
  document.dispatchEvent(new CustomEvent("dividas-atualizadas", { detail: { parcelasMes: parcelasDoMes } }));

  document.getElementById("total-mensal").textContent = moeda.format(soma("valorParcela", ativas));
  preencherBarra(document.getElementById("barra-geral"), total ? pago / total : 1);

  document.getElementById("detalhes-resumo").innerHTML = `<dl class="detalhes">${listaDetalhes([
    ["Dívidas com parcela no mês", `${ativas.length} de ${dividas.length}`],
    ["Valor total das dívidas", moeda.format(total)],
    ["Já pago", `${moeda.format(pago)} (${Math.round((pago / total) * 100 || 0)}%)`],
    ["Falta pagar", moeda.format(total - pago)],
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
  { chave: "contas", nome: "Contas", matiz: 32 },
  { chave: "cartoes", nome: "Cartões", matiz: 268 },
];

function tons(matiz, qtd) {
  if (qtd === 1) return [`hsl(${matiz} 70% 45%)`];
  return Array.from({ length: qtd }, (_, i) => {
    const t = i / (qtd - 1);
    const luz = 32 + t * 40; // 32% (escuro) → 72% (claro)
    const sat = 75 - t * 15;
    return `hsl(${matiz} ${sat.toFixed(0)}% ${luz.toFixed(0)}%)`;
  });
}

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
  const doMes = contas.filter((c) => String(c.vencimento || "").startsWith(mesRef) && Number(c.valor) > 0);
  const item = (nome, valor, pago) => ({ nome, valor: Number(valor), pago });
  return {
    dividas: dividasCalculadas.filter((d) => d.ativaNoMes && d.valorParcela > 0).map((d) => item(d.nome, d.valorParcela, false)),
    contas: doMes.filter((c) => c.origem !== "fatura").map((c) => item(c.nome, c.valor, c.status === "pago")),
    cartoes: [
      ...doMes.filter((c) => c.origem === "fatura").map((c) => item(c.nome, c.valor, c.status === "pago")),
      // Meses futuros sem fatura importada: previsão pelas parcelas já programadas.
      ...(typeof faturasPrevistas === "function" ? faturasPrevistas(mesRef).map((f) => item(f.nome, f.valor, false)) : []),
    ],
  };
}

function renderizarGrafico() {
  const svg = document.getElementById("pizza");
  const legenda = document.getElementById("legenda");
  const dica = document.getElementById("dica-grafico");
  const dados = compromissosDoMes();
  const fatias = [];
  GRUPOS_PIZZA.forEach((g) => {
    const lista = dados[g.chave].sort((a, b) => b.valor - a.valor);
    const cores = tons(g.matiz, lista.length);
    lista.forEach((it, i) => fatias.push({ ...it, grupo: g, cor: cores[i] }));
  });
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
    linha.addEventListener("mouseenter", () => focar(i));
    linha.addEventListener("mouseleave", () => focar(null));
    legenda.appendChild(linha);
    itens.push({ caminho, linha });
  });

  document.getElementById("pizza-total").innerHTML = `Total do mês <strong>${moeda.format(total)}</strong>`;
  const linhaTotal = document.createElement("li");
  linhaTotal.className = "total-legenda";
  linhaTotal.innerHTML = `<span></span><span class="nome"><strong>Total do mês</strong></span><span class="num"><strong>${moeda.format(total)}</strong></span><span class="pct">100%</span>`;
  legenda.appendChild(linhaTotal);
}

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
      renderizar(lista);
    },
    () => mostrarAviso("Não foi possível carregar as dívidas. Recarregue a página.")
  );
}

iniciar();

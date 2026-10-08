const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

const CAMPOS = ["nome", "valorParcela", "totalParcelas", "primeiraParcela", "diaVencimento", "parcelasPagas"];

/* ---------- Armazenamento ----------
 * Publicado no claude.ai: banco de dados do artifact (coleção "dividas").
 * Aberto como arquivo local: localStorage do navegador.
 */

function armazenamentoLocal() {
  const CHAVE = "vital.dividas";
  let ouvinte = () => {};
  const ler = () => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return (typeof DIVIDAS !== "undefined" ? DIVIDAS : []).map((d, i) => ({ id: "d" + i, ...d }));
  };
  let dados = ler();
  const gravar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch {}
    ouvinte(dados);
  };
  return {
    observar(fn) { ouvinte = fn; fn(dados); },
    async salvar(id, divida) {
      if (id) dados = dados.map((d) => (d.id === id ? { id, ...divida } : d));
      else dados = [...dados, { id: "d" + Date.now(), ...divida }];
      gravar();
    },
    async excluir(id) {
      dados = dados.filter((d) => d.id !== id);
      gravar();
    },
  };
}

function armazenamentoNuvem(db) {
  const colecao = db.collection("dividas");
  return {
    observar(fn, erro) {
      colecao.onSnapshot(
        (snap) => fn(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
        erro
      );
    },
    salvar(id, divida) {
      return id ? colecao.doc(id).set(divida) : colecao.add(divida);
    },
    excluir(id) {
      return colecao.doc(id).delete();
    },
  };
}

async function abrirArmazenamento() {
  if (window.claude && typeof window.claude.use === "function") {
    const db = await window.claude.use("db");
    if (db) return armazenamentoNuvem(db);
  }
  return armazenamentoLocal();
}

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
    while (pagas < total && vencimento(divida, pagas) < hoje) pagas++;
  }
  pagas = Math.max(0, Math.min(Number(pagas), total));

  const quitada = pagas >= total;
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
    termino: vencimento(divida, Math.max(total - 1, 0)),
    progresso: total ? pagas / total : 1,
  };
}

/* ---------- Interface ---------- */

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function preencherBarra(barra, progresso) {
  const pct = Math.round(progresso * 100);
  barra.setAttribute("aria-valuenow", pct);
  barra.setAttribute("aria-valuemin", 0);
  barra.setAttribute("aria-valuemax", 100);
  requestAnimationFrame(() => {
    barra.querySelector(".preenchimento").style.width = pct + "%";
  });
}

function listaDetalhes(itens) {
  return itens.map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${valor}</dd>`).join("");
}

const abertos = new Set();

function alternar(botao, painel, chave) {
  const definir = (aberto) => {
    botao.setAttribute("aria-expanded", String(aberto));
    painel.hidden = !aberto;
  };
  definir(abertos.has(chave));
  botao.addEventListener("click", () => {
    const aberto = !abertos.has(chave);
    aberto ? abertos.add(chave) : abertos.delete(chave);
    definir(aberto);
  });
}

let armazenamento = null;
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
    form.elements.primeiraParcela.value = hoje.toISOString().slice(0, 7);
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
  dividasAtuais = [...lista].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const dividas = dividasAtuais.map(calcular);
  const ul = document.getElementById("lista-dividas");
  ul.innerHTML = "";

  document.getElementById("vazio").hidden = dividas.length > 0;
  document.getElementById("resumo").hidden = dividas.length === 0;

  dividas.forEach((d) => {
    const item = document.createElement("li");
    item.className = "divida";
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
        <span>falta ${Math.round((1 - d.progresso) * 100)}%</span>
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

  const ativas = dividas.filter((d) => !d.quitada);
  const soma = (campo, lista = dividas) => lista.reduce((t, d) => t + d[campo], 0);
  const total = soma("valorTotal");
  const pago = soma("valorPago");
  const ultimoTermino = dividas.reduce((max, d) => (d.termino > max ? d.termino : max), new Date(0));

  document.getElementById("total-mensal").textContent = moeda.format(soma("valorParcela", ativas));
  preencherBarra(document.getElementById("barra-geral"), total ? pago / total : 1);

  document.getElementById("detalhes-resumo").innerHTML = `<dl class="detalhes">${listaDetalhes([
    ["Dívidas ativas", `${ativas.length} de ${dividas.length}`],
    ["Valor total das dívidas", moeda.format(total)],
    ["Já pago", `${moeda.format(pago)} (${Math.round((pago / total) * 100 || 0)}%)`],
    ["Falta pagar", moeda.format(total - pago)],
    ["Parcelas que faltam (somadas)", soma("restantes")],
    ["Livre de todas as dívidas em", dividas.length ? capitalizar(mesAno.format(ultimoTermino)) : "—"],
  ])}</dl>`;
}

async function iniciar() {
  document.getElementById("mes-atual").textContent = capitalizar(mesAno.format(hoje));
  alternar(document.getElementById("botao-resumo"), document.getElementById("detalhes-resumo"), "resumo");
  document.getElementById("botao-adicionar").addEventListener("click", () => abrirFormulario(""));
  document.getElementById("botao-cancelar").addEventListener("click", () => { mostrarAviso(""); fecharFormulario(); });
  document.getElementById("formulario").addEventListener("submit", enviarFormulario);

  armazenamento = await abrirArmazenamento();
  armazenamento.observar(
    (lista) => {
      document.getElementById("carregando").hidden = true;
      renderizar(lista);
    },
    () => mostrarAviso("Não foi possível carregar as dívidas. Recarregue a página.")
  );
}

iniciar();

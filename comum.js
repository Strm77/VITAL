/* V.I.T.A.L — funções compartilhadas por todas as partes do painel. */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const mesHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`; // "AAAA-MM"

/* ---------- Mês de referência (timeline) ----------
 * Todas as seções mostram o mês escolhido na timeline. O painel sempre abre no mês atual.
 */
let mesRef = mesHoje;
const ouvintesDoMes = [];

/* Data usada para decidir o que já venceu: hoje no mês atual; nos outros meses, o dia 1º. */
function dataRef() {
  if (mesRef === mesHoje) return hoje;
  const [a, m] = mesRef.split("-").map(Number);
  return new Date(a, m - 1, 1);
}
function dataDoMesRef() {
  const [a, m] = mesRef.split("-").map(Number);
  return new Date(a, m - 1, 1);
}
function nomeMesRef() {
  return capitalizar(mesAno.format(dataDoMesRef()));
}
function aoMudarMes(fn) {
  ouvintesDoMes.push(fn);
}
function definirMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes) || mes === mesRef) return;
  mesRef = mes;
  anoTimeline = Number(mes.slice(0, 4));
  renderizarTimeline();
  ouvintesDoMes.forEach((fn) => fn());
}

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let anoTimeline = Number(mesRef.slice(0, 4));

function renderizarTimeline() {
  const raiz = document.getElementById("timeline");
  if (!raiz) return;
  document.getElementById("timeline-ano").textContent = anoTimeline;
  const lista = document.getElementById("timeline-meses");
  lista.innerHTML = "";
  MESES_CURTOS.forEach((nome, i) => {
    const mes = `${anoTimeline}-${String(i + 1).padStart(2, "0")}`;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "mes" + (mes === mesRef ? " ativo" : "") + (mes === mesHoje ? " hoje" : "");
    botao.textContent = nome;
    botao.setAttribute("aria-pressed", String(mes === mesRef));
    botao.setAttribute("aria-label", capitalizar(mesAno.format(new Date(anoTimeline, i, 1))) + (mes === mesHoje ? " (mês atual)" : ""));
    botao.addEventListener("click", () => definirMes(mes));
    lista.appendChild(botao);
  });
  document.getElementById("timeline-hoje").hidden = mesRef === mesHoje;
  const ativo = lista.querySelector(".ativo");
  if (ativo) ativo.scrollIntoView({ block: "nearest", inline: "center" });
}

function iniciarTimeline() {
  document.getElementById("timeline-anterior").addEventListener("click", () => { anoTimeline--; renderizarTimeline(); });
  document.getElementById("timeline-proximo").addEventListener("click", () => { anoTimeline++; renderizarTimeline(); });
  document.getElementById("timeline-hoje").addEventListener("click", () => {
    anoTimeline = Number(mesHoje.slice(0, 4));
    definirMes(mesHoje);
    renderizarTimeline();
  });
  renderizarTimeline();
}

/* ---------- Armazenamento ----------
 * Publicado no claude.ai: banco de dados do artifact (uma coleção por tipo).
 * Aberto como arquivo local: localStorage do navegador.
 */

function armazenamentoLocal(nome, exemplos) {
  const CHAVE = "vital." + nome;
  let ouvinte = () => {};
  const ler = () => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return (exemplos || []).map((d, i) => ({ id: nome + i, ...d }));
  };
  let dados = ler();
  const gravar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch {}
    ouvinte(dados);
  };
  // Outra aba alterou os mesmos dados: atualiza esta na hora.
  window.addEventListener("storage", (e) => {
    if (e.key !== CHAVE || !e.newValue) return;
    try { dados = JSON.parse(e.newValue); ouvinte(dados); } catch {}
  });
  return {
    observar(fn) { ouvinte = fn; fn(dados); },
    async salvar(id, item) {
      if (id && dados.some((d) => d.id === id)) dados = dados.map((d) => (d.id === id ? { id, ...item } : d));
      else dados = [...dados, { id: (id = id || nome + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), ...item }];
      gravar();
      return id;
    },
    async excluir(id) {
      dados = dados.filter((d) => d.id !== id);
      gravar();
    },
  };
}

function armazenamentoNuvem(db, nome) {
  const colecao = db.collection(nome);
  return {
    observar(fn, erro) {
      colecao.onSnapshot(
        (snap) => fn(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
        erro
      );
    },
    async salvar(id, item) {
      if (id) {
        await colecao.doc(id).set(item);
        return id;
      }
      return (await colecao.add(item)).id;
    },
    excluir(id) {
      return colecao.doc(id).delete();
    },
  };
}

/* Recursos extras do claude.ai (banco de dados, downloads, Claude).
 * Resolvem null quando a página está aberta como arquivo local. */
const recursos = {};
function usarRecurso(nome) {
  if (!recursos[nome]) {
    recursos[nome] = window.claude && typeof window.claude.use === "function"
      ? window.claude.use(nome).catch(() => null)
      : Promise.resolve(null);
  }
  return recursos[nome];
}

async function abrirArmazenamento(nome, exemplos) {
  // Site publicado: espera o login e usa as tabelas do Supabase (supabase.js).
  let arm;
  if (typeof supa !== "undefined" && supa) {
    await sessaoPronta;
    arm = armazenamentoSupabase(nome);
  } else {
    const db = await usarRecurso("db");
    arm = db ? armazenamentoNuvem(db, nome) : armazenamentoLocal(nome, exemplos);
  }
  return comEstadoDaConsulta(nome, arm);
}

/* ---------- Estado das consultas (carregando / erro / carregado) ----------
 * Enquanto a consulta de uma tabela não volta (ou se ela falhar), as mensagens de "nada
 * cadastrado" e os números marcados com data-depende="tabela1 tabela2" não aparecem como se
 * estivessem vazios: mostram "Carregando…" ou o aviso de erro. */
const estadoConsultas = {};
function consultaPronta(...nomes) { return nomes.every((n) => estadoConsultas[n] === "ok"); }
function marcarConsulta(nome, estado) {
  // Depois de carregar uma vez, uma falha no tempo real não esconde os dados já mostrados.
  if (estado === "erro" && estadoConsultas[nome] === "ok") return;
  estadoConsultas[nome] = estado;
  aplicarEstadosConsulta();
}
function aplicarEstadosConsulta() {
  document.querySelectorAll("[data-depende]").forEach((el) => {
    const nomes = el.dataset.depende.split(/\s+/).filter(Boolean);
    const erro = nomes.some((n) => estadoConsultas[n] === "erro");
    const pendente = !erro && nomes.some((n) => estadoConsultas[n] !== "ok");
    el.classList.toggle("consulta-pendente", pendente);
    el.classList.toggle("consulta-erro", erro);
    if (pendente) el.setAttribute("aria-busy", "true");
    else el.removeAttribute("aria-busy");
  });
}
function comEstadoDaConsulta(nome, arm) {
  if (!estadoConsultas[nome]) estadoConsultas[nome] = "pendente";
  return {
    ...arm,
    observar(fn, erro) {
      arm.observar(
        (lista) => { marcarConsulta(nome, "ok"); fn(lista); },
        (e) => { marcarConsulta(nome, "erro"); if (erro) erro(e); }
      );
    },
  };
}
aplicarEstadosConsulta();


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

/* Avisa (uma vez por rodada) que dados de alguma área mudaram: a Visão geral se atualiza. */
let timerDados = null;
function avisarDados() {
  clearTimeout(timerDados);
  timerDados = setTimeout(() => document.dispatchEvent(new Event("vital-dados")), 50);
}

/* ---------- Navegação entre as abas (Financeiro / Faturas) ---------- */

function mostrarVista() {
  // A página abre na Visão geral; cada vista tem o próprio endereço (#painel, #saude-bemestar…).
  const pedida = location.hash.slice(1);
  const vista = pedida && document.querySelector(`main[data-vista="${CSS.escape(pedida)}"]`) ? pedida : "inicio";
  const area = ["painel", "faturas", "assinaturas", "metas"].includes(vista) ? "financeiro" : vista.split("-")[0];
  // Submenu e timeline só fazem sentido no Financeiro.
  document.querySelectorAll("[data-area-de]").forEach((el) => { el.hidden = el.dataset.areaDe !== area; });
  document.querySelectorAll(".aba[data-area]").forEach((aba) => {
    const ativa = aba.dataset.area === area;
    aba.classList.toggle("ativa", ativa);
    if (ativa) aba.setAttribute("aria-current", "page");
    else aba.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-vista]").forEach((el) => {
    el.hidden = el.dataset.vista !== vista;
  });
  document.querySelectorAll(".subaba[data-aba]").forEach((aba) => {
    const ativa = aba.dataset.aba === vista;
    aba.classList.toggle("ativa", ativa);
    if (ativa) aba.setAttribute("aria-current", "page");
    else aba.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent("vista-mostrada", { detail: vista }));
}
/* ---------- Tema (automático / escuro / claro) ---------- */

const TEMAS = [
  { valor: "", rotulo: "◐ Automático" },
  { valor: "dark", rotulo: "● Escuro" },
  { valor: "light", rotulo: "○ Claro" },
];
const sistemaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

function temaEscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : sistemaEscuro.matches;
}

function aplicarTema(valor) {
  if (valor) document.documentElement.dataset.theme = valor;
  else delete document.documentElement.dataset.theme;
  try { valor ? localStorage.setItem("vital.tema", valor) : localStorage.removeItem("vital.tema"); } catch {}
  const atual = TEMAS.find((t) => t.valor === valor) || TEMAS[0];
  const botao = document.getElementById("botao-tema");
  if (botao) {
    botao.textContent = atual.rotulo;
    botao.title = "Trocar tema (automático segue o sistema)";
  }
  document.dispatchEvent(new Event("tema-alterado"));
}

document.getElementById("botao-tema")?.addEventListener("click", () => {
  const atual = document.documentElement.dataset.theme || "";
  const i = TEMAS.findIndex((t) => t.valor === atual);
  aplicarTema(TEMAS[(i + 1) % TEMAS.length].valor);
});
sistemaEscuro.addEventListener("change", () => document.dispatchEvent(new Event("tema-alterado")));
aplicarTema(document.documentElement.dataset.theme || "");

window.addEventListener("hashchange", mostrarVista);
mostrarVista();
iniciarTimeline();

/* ---------- Datas no padrão brasileiro (V07) ----------
 * Os campos nativos de data mostram o formato da língua do navegador (em inglês, mês/dia/ano).
 * Cada <input type="date"> ganha ao lado um campo de texto dd/mm/aaaa: é nele que se digita e
 * se lê a data. O campo nativo vira só o botão do calendário e continua guardando o valor em
 * ISO (aaaa-mm-dd), que é o que o painel lê e grava — nada muda no armazenamento. */
const valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function isoParaBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function brParaISO(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto || "");
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(a, mes - 1, d);
  if (data.getFullYear() !== a || data.getMonth() !== mes - 1 || data.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function mascaraData(texto) {
  const n = texto.replace(/\D/g, "").slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4, 8)].filter(Boolean).join("/");
}

function campoDataBR(nativo) {
  if (nativo.dataset.dataBr || !nativo.parentNode) return;
  nativo.dataset.dataBr = "1";
  const caixa = document.createElement("span");
  caixa.className = "data-br";
  const texto = document.createElement("input");
  texto.type = "text";
  texto.className = "data-br-texto";
  texto.inputMode = "numeric";
  texto.autocomplete = "off";
  texto.maxLength = 10;
  texto.placeholder = "dd/mm/aaaa";
  texto.title = "Data no formato dia/mês/ano (dd/mm/aaaa)";
  texto.lang = "pt-BR";
  if (nativo.id) texto.id = nativo.id + "-br";
  const rotulo = nativo.closest("label")?.childNodes[0]?.textContent?.trim();
  texto.setAttribute("aria-label", `${rotulo || "Data"} (dia/mês/ano)`);
  nativo.parentNode.insertBefore(caixa, nativo);
  caixa.append(texto, nativo);
  nativo.tabIndex = -1;
  nativo.setAttribute("aria-label", "Abrir calendário");
  nativo.title = "Abrir calendário";

  let digitando = false;
  const mostrar = () => {
    if (digitando) return;
    const iso = valorNativo.get.call(nativo);
    if (brParaISO(texto.value) !== iso) texto.value = isoParaBR(iso);
    texto.disabled = nativo.disabled;
    texto.removeAttribute("aria-invalid");
  };
  // Valor definido pelo código (form.elements.x.value = "2026-11-05") também aparece no texto.
  Object.defineProperty(nativo, "value", {
    configurable: true,
    get() { return valorNativo.get.call(this); },
    set(v) { valorNativo.set.call(this, v); mostrar(); },
  });
  nativo.addEventListener("input", mostrar);
  nativo.addEventListener("change", mostrar);
  nativo.addEventListener("click", () => { try { nativo.showPicker?.(); } catch {} });
  nativo.form?.addEventListener("reset", () => setTimeout(mostrar));

  const definir = (iso) => {
    if (valorNativo.get.call(nativo) === iso) return;
    valorNativo.set.call(nativo, iso);
    digitando = true;
    try {
      nativo.dispatchEvent(new Event("input", { bubbles: true }));
      nativo.dispatchEvent(new Event("change", { bubbles: true }));
    } finally { digitando = false; }
  };
  texto.addEventListener("input", () => {
    const fim = texto.selectionStart === texto.value.length;
    const formatado = mascaraData(texto.value);
    if (formatado !== texto.value) { texto.value = formatado; if (fim) texto.setSelectionRange(formatado.length, formatado.length); }
    // Data incompleta ou inválida não deixa a data antiga valendo escondida.
    definir(brParaISO(texto.value) || "");
  });
  texto.addEventListener("blur", () => {
    if (texto.value && !brParaISO(texto.value)) texto.setAttribute("aria-invalid", "true");
    else mostrar();
  });
  // Enter no texto envia o formulário, como no campo nativo.
  mostrar();
}

function prepararCamposDeData(raiz = document) {
  if (raiz.matches?.("input[type=date]")) campoDataBR(raiz);
  raiz.querySelectorAll?.("input[type=date]").forEach(campoDataBR);
}
prepararCamposDeData();
new MutationObserver((mudancas) => {
  for (const m of mudancas) m.addedNodes.forEach((n) => { if (n.nodeType === 1) prepararCamposDeData(n); });
}).observe(document.body, { childList: true, subtree: true });

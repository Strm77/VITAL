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
  if (typeof supa !== "undefined" && supa) {
    await sessaoPronta;
    return armazenamentoSupabase(nome);
  }
  const db = await usarRecurso("db");
  return db ? armazenamentoNuvem(db, nome) : armazenamentoLocal(nome, exemplos);
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

/* ---------- Navegação entre as abas (Financeiro / Faturas) ---------- */

function mostrarVista() {
  const vista = { "#faturas": "faturas", "#assinaturas": "assinaturas", "#metas": "metas" }[location.hash] || "painel";
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

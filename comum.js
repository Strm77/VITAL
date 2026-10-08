/* V.I.T.A.L — funções compartilhadas por todas as partes do painel. */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

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
  return {
    observar(fn) { ouvinte = fn; fn(dados); },
    async salvar(id, item) {
      if (id) dados = dados.map((d) => (d.id === id ? { id, ...item } : d));
      else dados = [...dados, { id: (id = nome + Date.now()), ...item }];
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
  const vista = location.hash === "#faturas" ? "faturas" : "financeiro";
  document.querySelectorAll("[data-vista]").forEach((el) => {
    el.hidden = el.dataset.vista !== vista;
  });
  document.querySelectorAll(".aba[data-aba]").forEach((aba) => {
    const ativa = aba.dataset.aba === vista;
    aba.classList.toggle("ativa", ativa);
    if (ativa) aba.setAttribute("aria-current", "page");
    else aba.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", mostrarVista);
mostrarVista();

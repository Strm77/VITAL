/* ---------- Aba Metas (caixinhas) ----------
 * Cada meta tem nome, valor alvo, link de compra (opcional) e prazo (opcional).
 * O saldo da caixinha é a soma dos movimentos: guardar (+) e retirar (−).
 * Usa as funções de comum.js (moeda, escapar, preencherBarra, abrirArmazenamento...).
 */

const DESCRICAO_INICIAL = "Valor inicial";

const metas = {
  lista: [],
  movimentos: [],
  armMetas: null,
  armMovimentos: null,
  editandoId: null, // null = fechado, "" = nova meta
  abertas: new Set(), // metas com o histórico aberto
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const mesesAte = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return (a - hoje.getFullYear()) * 12 + (m - 1 - hoje.getMonth());
};
const nomeMesCurto = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
};

/* Só aceita links http(s); qualquer outra coisa (ex.: "javascript:") é descartada. */
function linkSeguro(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
const dominio = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

function saldoDaMeta(id) {
  return metas.movimentos.filter((m) => m.metaId === id).reduce((t, m) => t + Number(m.valor), 0);
}

/* Quanto foi guardado (menos o retirado) nas metas num mês — usado no "Dinheiro do mês". */
function guardadoNoMes(mes) {
  // O "valor inicial" já estava guardado antes de criar a meta: não sai do dinheiro do mês.
  const existentes = new Set(metas.lista.map((m) => m.id));
  return metas.movimentos
    .filter((m) => existentes.has(m.metaId) && String(m.data).startsWith(mes) && m.descricao !== DESCRICAO_INICIAL)
    .reduce((t, m) => t + Number(m.valor), 0);
}

function avisoMetas(texto) {
  const el = document.getElementById("metas-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

/* Metas com saldo, quanto falta e quanto guardar por mês. */
function dadosMetas() {
  return metas.lista
    .map((m) => {
      const saldo = saldoDaMeta(m.id);
      const falta = Math.max(Number(m.valorAlvo) - saldo, 0);
      const meses = m.prazo ? mesesAte(m.prazo) : null;
      const porMes = falta > 0 && meses != null ? falta / Math.max(meses + 1, 1) : null;
      return { ...m, saldo, falta, meses, porMes, atingida: saldo >= Number(m.valorAlvo) };
    })
    .sort((a, b) => Number(a.atingida) - Number(b.atingida) || String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")));
}

/* Bloco "Metas" no Painel: resumo e progresso de cada caixinha. */
function renderizarMetasPainel(dados) {
  const raiz = document.getElementById("bloco-metas");
  if (!raiz) return;
  const guardado = dados.reduce((t, m) => t + Math.max(m.saldo, 0), 0);
  const alvo = dados.reduce((t, m) => t + Number(m.valorAlvo), 0);
  const atingidas = dados.filter((m) => m.atingida).length;
  const porMes = dados.reduce((t, m) => t + (m.porMes || 0), 0);
  const aberto = raiz.querySelector(".linha")?.getAttribute("aria-expanded") === "true";
  raiz.innerHTML = `
    <button class="linha" aria-expanded="${aberto}" aria-controls="detalhes-metas-painel">
      <span class="rotulo titulo-bloco">Metas</span>
      <span class="valor">${moeda.format(guardado)}</span>
      <span class="seta" aria-hidden="true"></span>
    </button>
    ${dados.length ? `
    <div class="barra" role="progressbar" aria-label="Progresso das metas"><div class="preenchimento"></div></div>
    <div class="porcentagem">
      <span>${alvo ? Math.round((guardado / alvo) * 100) : 0}% de ${moeda.format(alvo)}</span>
      <span>${porMes ? `guardar ${moeda.format(porMes)}/mês` : `${atingidas} de ${dados.length} atingida${dados.length === 1 ? "" : "s"}`}</span>
    </div>` : `<p class="estado">Nenhuma meta ainda.</p>`}
    <div class="detalhes-grupo" id="detalhes-metas-painel" ${aberto ? "" : "hidden"}>
      ${dados.length ? `<ul class="metas-painel">${dados.map((m) => `
        <li>
          <div class="metas-painel-linha">
            <span class="item-nome">${escapar(m.nome)}</span>
            <span class="item-valor">${moeda.format(m.saldo)} <span class="sub-inline">de ${moeda.format(Number(m.valorAlvo))}</span></span>
          </div>
          <div class="barra mini-barra" role="progressbar" aria-label="Progresso de ${escapar(m.nome)}"><div class="preenchimento"></div></div>
          <span class="item-sub">${m.atingida ? "Meta atingida" : `falta ${moeda.format(m.falta)}${m.prazo && m.porMes ? ` · ${moeda.format(m.porMes)}/mês até ${nomeMesCurto(m.prazo)}` : ""}`}</span>
        </li>`).join("")}</ul>` : ""}
      <a class="botao adicionar ir-metas" href="#metas">${dados.length ? "Abrir as metas" : "+ Criar uma meta"}</a>
    </div>`;
  if (dados.length) {
    preencherBarra(raiz.querySelector(":scope > .barra"), alvo ? Math.min(guardado / alvo, 1) : 0);
    raiz.querySelectorAll(".metas-painel .barra").forEach((b, i) => preencherBarra(b, Math.min(dados[i].saldo / Number(dados[i].valorAlvo), 1)));
  }
  const botao = raiz.querySelector(".linha");
  botao.addEventListener("click", () => {
    const abrir = botao.getAttribute("aria-expanded") !== "true";
    botao.setAttribute("aria-expanded", String(abrir));
    raiz.querySelector(".detalhes-grupo").hidden = !abrir;
  });
}

function renderizarMetas() {
  const area = document.getElementById("metas-lista");
  if (!area) return;
  const dados = dadosMetas();
  renderizarMetasPainel(dados);

  const guardado = dados.reduce((t, m) => t + Math.max(m.saldo, 0), 0);
  const alvo = dados.reduce((t, m) => t + Number(m.valorAlvo), 0);
  const porMes = dados.reduce((t, m) => t + (m.porMes || 0), 0);
  document.getElementById("metas-resumo").innerHTML = dados.length ? `
    <span>${dados.length} meta${dados.length === 1 ? "" : "s"}</span>
    <span>Guardado <strong>${moeda.format(guardado)}</strong> de <strong>${moeda.format(alvo)}</strong></span>
    ${porMes ? `<span>Para cumprir os prazos, guarde <strong>${moeda.format(porMes)}</strong> por mês</span>` : ""}
    ${dados.some((m) => m.atingida) ? `<span class="status pago">${dados.filter((m) => m.atingida).length} atingida${dados.filter((m) => m.atingida).length === 1 ? "" : "s"}</span>` : ""}` : "";
  document.getElementById("metas-vazio").hidden = dados.length > 0;

  area.innerHTML = "";
  for (const m of dados) {
    const movs = metas.movimentos.filter((x) => x.metaId === m.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const prazoTexto = m.prazo
      ? m.atingida ? `prazo ${nomeMesCurto(m.prazo)}`
        : m.meses < 0 ? `<span class="acabando">prazo ${nomeMesCurto(m.prazo)} passou</span>`
        : `até ${nomeMesCurto(m.prazo)} · guarde ${moeda.format(m.porMes)}/mês`
      : "sem prazo";
    const cartao = document.createElement("article");
    cartao.className = "caixinha" + (m.atingida ? " atingida" : "");
    cartao.dataset.meta = m.id;
    cartao.innerHTML = `
      <div class="caixinha-topo">
        <h3>${escapar(m.nome)}</h3>
        ${m.link ? `<a class="link-meta" href="${escapar(m.link)}" target="_blank" rel="noopener noreferrer">${escapar(dominio(m.link))} ↗</a>` : ""}
      </div>
      <div class="caixinha-valores">
        <strong>${moeda.format(m.saldo)}</strong>
        <span>de ${moeda.format(Number(m.valorAlvo))}</span>
      </div>
      <div class="barra" role="progressbar" aria-label="Progresso de ${escapar(m.nome)}"><div class="preenchimento"></div></div>
      <div class="porcentagem">
        <span>${m.atingida ? `<span class="status pago">Meta atingida</span>` : `falta ${moeda.format(m.falta)}`}</span>
        <span>${prazoTexto}</span>
      </div>
      <form class="mov-form" hidden novalidate>
        <label class="campo">Valor (R$)<input name="valor" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
        <label class="campo">Data<input name="data" type="date"></label>
        <label class="campo largo">Observação<input name="descricao" type="text" maxlength="120" placeholder="Opcional"></label>
        <div class="acoes largo">
          <button type="button" class="botao" data-acao="cancelar-mov">Cancelar</button>
          <button type="submit" class="botao primario"></button>
        </div>
      </form>
      <div class="acoes caixinha-acoes">
        <button type="button" class="botao primario" data-acao="guardar">+ Guardar</button>
        <button type="button" class="botao" data-acao="retirar" ${m.saldo > 0 ? "" : "disabled"}>− Retirar</button>
        <button type="button" class="botao" data-acao="historico" aria-expanded="${metas.abertas.has(m.id)}">Histórico (${movs.length})</button>
        <button type="button" class="botao" data-acao="editar">Editar</button>
        <button type="button" class="botao" data-acao="excluir">Excluir</button>
      </div>
      <ul class="historico" ${metas.abertas.has(m.id) ? "" : "hidden"}>
        ${movs.length ? movs.map((x) => `
          <li data-mov="${escapar(x.id)}">
            <span class="hist-desc">${x.valor > 0 ? "Guardado" : "Retirado"}${x.descricao ? ` · ${escapar(x.descricao)}` : ""}
              <span class="sub">${dataBR(String(x.data))}</span></span>
            <span class="num ${x.valor > 0 ? "entrada" : "saida"}">${x.valor > 0 ? "+" : "−"}${moeda.format(Math.abs(x.valor))}</span>
            <button type="button" class="botao mini" data-acao="apagar-mov" aria-label="Apagar movimento">Apagar</button>
          </li>`).join("") : `<li class="estado">Nenhum movimento ainda.</li>`}
      </ul>`;
    area.appendChild(cartao);
    preencherBarra(cartao.querySelector(".barra"), Math.min(m.saldo / Number(m.valorAlvo), 1));
    ligarCaixinha(cartao, m);
  }
}

function ligarCaixinha(cartao, m) {
  const form = cartao.querySelector(".mov-form");
  const abrirMov = (tipo) => {
    form.dataset.tipo = tipo;
    form.reset();
    form.elements.data.value = hojeISO();
    form.querySelector("[type=submit]").textContent = tipo === "guardar" ? "Guardar" : "Retirar";
    form.hidden = false;
    form.elements.valor.focus();
  };
  cartao.querySelector("[data-acao=guardar]").addEventListener("click", () => abrirMov("guardar"));
  cartao.querySelector("[data-acao=retirar]").addEventListener("click", () => abrirMov("retirar"));
  cartao.querySelector("[data-acao=cancelar-mov]").addEventListener("click", () => (form.hidden = true));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const valor = Number(String(form.elements.valor.value).replace(",", "."));
    if (!(valor > 0)) return form.elements.valor.focus();
    if (form.dataset.tipo === "retirar" && valor > m.saldo + 0.004) {
      avisoMetas(`Só há ${moeda.format(m.saldo)} guardados em “${m.nome}”.`);
      return;
    }
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await metas.armMovimentos.salvar(null, {
        metaId: m.id,
        data: form.elements.data.value || hojeISO(),
        valor: form.dataset.tipo === "retirar" ? -valor : valor,
        descricao: form.elements.descricao.value.trim() || null,
      });
      avisoMetas("");
    } catch {
      avisoMetas("Não foi possível salvar o movimento. Tente de novo.");
      botao.disabled = false;
    }
  });
  const hist = cartao.querySelector("[data-acao=historico]");
  hist.addEventListener("click", () => {
    metas.abertas.has(m.id) ? metas.abertas.delete(m.id) : metas.abertas.add(m.id);
    renderizarMetas();
  });
  cartao.querySelector("[data-acao=editar]").addEventListener("click", () => abrirFormularioMeta(m.id));
  const excluir = cartao.querySelector("[data-acao=excluir]");
  excluir.addEventListener("click", async () => {
    if (excluir.dataset.confirmar !== "sim") {
      excluir.dataset.confirmar = "sim";
      excluir.textContent = m.saldo > 0 ? `Excluir com ${moeda.format(m.saldo)}?` : "Confirmar";
      excluir.classList.add("perigo");
      return;
    }
    excluir.disabled = true;
    try {
      for (const x of metas.movimentos.filter((x) => x.metaId === m.id)) await metas.armMovimentos.excluir(x.id);
      await metas.armMetas.excluir(m.id);
    }
    catch { avisoMetas("Não foi possível excluir a meta."); excluir.disabled = false; }
  });
  cartao.querySelectorAll("[data-acao=apagar-mov]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.confirmar !== "sim") {
      b.dataset.confirmar = "sim";
      b.textContent = "Confirmar";
      b.classList.add("perigo");
      return;
    }
    b.disabled = true;
    try { await metas.armMovimentos.excluir(b.closest("li").dataset.mov); }
    catch { avisoMetas("Não foi possível apagar o movimento."); b.disabled = false; }
  }));
}

function abrirFormularioMeta(id) {
  metas.editandoId = id;
  const form = document.getElementById("meta-form");
  const meta = metas.lista.find((m) => m.id === id);
  form.reset();
  document.getElementById("meta-form-titulo").textContent = meta ? "Editar meta" : "Nova meta";
  form.elements.nome.value = meta?.nome ?? "";
  form.elements.valorAlvo.value = meta?.valorAlvo ?? "";
  form.elements.link.value = meta?.link ?? "";
  form.elements.prazo.value = meta?.prazo ?? "";
  document.getElementById("meta-inicial-rotulo").hidden = !!meta;
  form.hidden = false;
  document.getElementById("meta-adicionar").hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioMeta() {
  metas.editandoId = null;
  document.getElementById("meta-form").hidden = true;
  document.getElementById("meta-adicionar").hidden = false;
}

async function salvarMeta(e) {
  e.preventDefault();
  const form = e.target;
  const nome = form.elements.nome.value.trim();
  const valorAlvo = Number(String(form.elements.valorAlvo.value).replace(",", "."));
  const linkDigitado = form.elements.link.value.trim();
  const link = linkSeguro(linkDigitado);
  const inicial = Number(String(form.elements.inicial.value).replace(",", "."));
  if (!nome || !(valorAlvo > 0)) return avisoMetas("Preencha o nome e o valor da meta.");
  if (linkDigitado && !link) return avisoMetas("O link precisa ser um endereço de site (http ou https).");
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const id = await metas.armMetas.salvar(metas.editandoId || null, { nome, valorAlvo, link: link || null, prazo: form.elements.prazo.value || null });
    if (!metas.editandoId && inicial > 0) {
      await metas.armMovimentos.salvar(null, { metaId: id, data: hojeISO(), valor: inicial, descricao: DESCRICAO_INICIAL });
    }
    avisoMetas("");
    fecharFormularioMeta();
  } catch {
    avisoMetas("Não foi possível salvar a meta. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

async function iniciarMetas() {
  if (!document.getElementById("metas-lista")) return;
  document.getElementById("meta-adicionar").addEventListener("click", () => abrirFormularioMeta(""));
  document.getElementById("meta-cancelar").addEventListener("click", () => { avisoMetas(""); fecharFormularioMeta(); });
  document.getElementById("meta-form").addEventListener("submit", salvarMeta);
  renderizarMetas();

  metas.armMetas = await abrirArmazenamento("metas", []);
  metas.armMovimentos = await abrirArmazenamento("movimentos_metas", []);
  const atualizarTudo = () => {
    renderizarMetas();
    if (typeof renderizarTorre === "function") renderizarTorre(); // "Dinheiro do mês" considera o que foi guardado
  };
  metas.armMetas.observar((lista) => { metas.lista = lista; atualizarTudo(); },
    () => avisoMetas("Não foi possível carregar as metas. Recarregue a página."));
  metas.armMovimentos.observar((lista) => { metas.movimentos = lista; atualizarTudo(); },
    () => avisoMetas("Não foi possível carregar os movimentos das metas."));
}

iniciarMetas();

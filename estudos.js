/* ---------- Área Estudos ----------
 * Planos de estudo com tema, objetivo, prazo e metas de horas (total e por semana),
 * matérias e tópicos para marcar como concluídos e o registro do tempo estudado
 * (à mão ou com cronômetro). Mostra o progresso de cada plano e o ritmo necessário
 * para cumprir o prazo. Dados no schema "estudos" (planos, topicos, sessoes).
 */

const est = {
  planos: [],
  topicos: [],
  sessoes: [],
  arm: {},
  abertos: new Set(),
  editandoId: null,
  intervaloCronometro: null,
};

const CHAVE_CRONOMETRO = "vital.cronometro";
const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];

const diaISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeDia = () => diaISO(new Date());
const paraData = (iso) => { const [a, m, d] = String(iso).split("-").map(Number); return new Date(a, m - 1, d); };
const somarDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return diaISO(d); };
const diasEntre = (de, ate) => Math.round((paraData(ate) - paraData(de)) / 86400000);
/* Segunda-feira da semana de uma data. */
const inicioSemana = (iso) => { const d = paraData(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return diaISO(d); };

function duracao(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
const horas = (min) => (min / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const minutosDe = (sessoes) => sessoes.reduce((t, s) => t + Number(s.minutos || 0), 0);
const sessoesDoPlano = (id) => est.sessoes.filter((s) => s.planoId === id);
const topicosDoPlano = (id) => est.topicos.filter((t) => t.planoId === id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

/* Dias seguidos com estudo, terminando hoje (ou ontem, se hoje ainda não estudou). */
function sequenciaDeDias() {
  const dias = new Set(est.sessoes.map((s) => s.data));
  let dia = hojeDia();
  if (!dias.has(dia)) dia = somarDias(dia, -1);
  let n = 0;
  while (dias.has(dia)) { n++; dia = somarDias(dia, -1); }
  return n;
}

function avisoEstudos(texto) {
  const el = document.getElementById("estudos-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}

/* Progresso de um plano: horas, tópicos, semana atual e ritmo para o prazo. */
function progressoDoPlano(p) {
  const hoje = hojeDia();
  const sessoes = sessoesDoPlano(p.id);
  const feitos = minutosDe(sessoes);
  const topicos = topicosDoPlano(p.id);
  const concluidos = topicos.filter((t) => t.concluido).length;
  const semana = minutosDe(sessoes.filter((s) => s.data >= inicioSemana(hoje) && s.data <= hoje));
  const metaMin = Number(p.metaHoras) > 0 ? Number(p.metaHoras) * 60 : null;
  const metaSemanaMin = Number(p.metaSemanalHoras) > 0 ? Number(p.metaSemanalHoras) * 60 : null;

  let ritmo = null;
  if (p.dataFim) {
    const diasRestantes = diasEntre(hoje, p.dataFim);
    const completo = (metaMin ? feitos >= metaMin : true) && (!topicos.length || concluidos === topicos.length);
    if (completo) ritmo = { tipo: "ok", texto: "Plano concluído" };
    else if (diasRestantes < 0) ritmo = { tipo: "atrasado", texto: `O prazo passou há ${-diasRestantes} dia${diasRestantes === -1 ? "" : "s"}` };
    else if (metaMin) {
      const semanas = Math.max((diasRestantes + 1) / 7, 1 / 7);
      const necessario = Math.max(metaMin - feitos, 0) / semanas;
      // Ritmo atual: média das últimas 4 semanas (ou desde o início, se o plano for mais novo).
      const desde = [somarDias(hoje, -27), p.dataInicio].sort().pop();
      const semanasPassadas = Math.max((diasEntre(desde, hoje) + 1) / 7, 1);
      const media = minutosDe(sessoes.filter((s) => s.data >= desde && s.data <= hoje)) / semanasPassadas;
      ritmo = {
        tipo: media >= necessario * 0.95 ? "ok" : "atrasado",
        texto: `Para chegar no prazo: ${duracao(necessario)}/semana · seu ritmo: ${duracao(media)}/semana`,
      };
    }
  }
  return { sessoes, feitos, topicos, concluidos, semana, metaMin, metaSemanaMin, ritmo };
}

/* ---------- Resumo do topo ---------- */

function renderizarResumoEstudos() {
  const hoje = hojeDia();
  const semanaIni = inicioSemana(hoje);
  const semana = minutosDe(est.sessoes.filter((s) => s.data >= semanaIni && s.data <= hoje));
  const metaSemana = est.planos.reduce((t, p) => t + (Number(p.metaSemanalHoras) || 0) * 60, 0);
  const hojeMin = minutosDe(est.sessoes.filter((s) => s.data === hoje));
  const seq = sequenciaDeDias();
  document.getElementById("estudos-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hoje)));
  document.getElementById("estudos-resumo").innerHTML = `
    <div class="estudo-numero"><span>Hoje</span> <strong>${duracao(hojeMin)}</strong></div>
    <div class="estudo-numero"><span>Esta semana</span> <strong>${duracao(semana)}</strong>${metaSemana ? ` <em>de ${duracao(metaSemana)}</em>` : ""}</div>
    <div class="estudo-numero"><span>Sequência</span> <strong>${seq} dia${seq === 1 ? "" : "s"}</strong></div>
    <div class="estudo-numero"><span>Total estudado</span> <strong>${horas(minutosDe(est.sessoes))} h</strong></div>
    ${metaSemana ? `<div class="barra largo-total" role="progressbar" aria-label="Meta da semana"><div class="preenchimento"></div></div>` : ""}`;
  if (metaSemana) preencherBarra(document.querySelector("#estudos-resumo .barra"), Math.min(semana / metaSemana, 1));

  // Últimos 14 dias
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i - 13));
  const porDia = dias.map((d) => minutosDe(est.sessoes.filter((s) => s.data === d)));
  const maior = Math.max(60, ...porDia);
  document.getElementById("estudos-dias").innerHTML = dias.map((d, i) => `
    <div class="dia${d === hoje ? " hoje" : ""}" title="${dataBR(d)}: ${porDia[i] ? duracao(porDia[i]) : "sem estudo"}">
      <span class="dia-trilho"><span class="dia-barra" style="height:${(porDia[i] / maior) * 100}%"></span></span>
      <span class="dia-rotulo">${DIAS_CURTOS[paraData(d).getDay()]}</span>
    </div>`).join("");
}

/* ---------- Planos ---------- */

function renderizarPlanos() {
  const area = document.getElementById("planos");
  if (!area) return;
  renderizarResumoEstudos();
  document.getElementById("estudos-vazio").hidden = est.planos.length > 0;
  area.innerHTML = "";

  for (const p of [...est.planos].sort((a, b) => String(a.dataFim || "9999").localeCompare(String(b.dataFim || "9999")))) {
    const pr = progressoDoPlano(p);
    const aberto = est.abertos.has(p.id);
    const prazo = p.dataFim
      ? (() => { const d = diasEntre(hojeDia(), p.dataFim); return `até ${dataBR(p.dataFim)}${d >= 0 ? ` · ${d} dia${d === 1 ? "" : "s"}` : ""}`; })()
      : "sem prazo";
    const materias = new Map();
    for (const t of pr.topicos) {
      const m = t.materia || "Sem matéria";
      if (!materias.has(m)) materias.set(m, []);
      materias.get(m).push(t);
    }
    const minutosTopico = (id) => minutosDe(pr.sessoes.filter((s) => s.topicoId === id));

    const cartao = document.createElement("section");
    cartao.className = "painel plano";
    cartao.dataset.plano = p.id;
    cartao.innerHTML = `
      <div class="plano-topo">
        <div>
          <h3>${escapar(p.tema)}</h3>
          ${p.objetivo ? `<p class="plano-objetivo">${escapar(p.objetivo)}</p>` : ""}
        </div>
        <span class="mes-atual">${prazo}</span>
      </div>

      <div class="plano-metricas">
        ${linhaMetrica("Horas estudadas", pr.metaMin ? `${horas(pr.feitos)} de ${horas(pr.metaMin)} h` : `${horas(pr.feitos)} h`, pr.metaMin ? pr.feitos / pr.metaMin : null)}
        ${linhaMetrica("Tópicos concluídos", pr.topicos.length ? `${pr.concluidos} de ${pr.topicos.length}` : "nenhum tópico", pr.topicos.length ? pr.concluidos / pr.topicos.length : null)}
        ${linhaMetrica("Esta semana", pr.metaSemanaMin ? `${duracao(pr.semana)} de ${duracao(pr.metaSemanaMin)}` : duracao(pr.semana), pr.metaSemanaMin ? pr.semana / pr.metaSemanaMin : null)}
      </div>
      ${pr.ritmo ? `<p class="ritmo ${pr.ritmo.tipo}"><span class="status ${pr.ritmo.tipo === "ok" ? "pago" : "atrasada"}">${pr.ritmo.tipo === "ok" ? "No ritmo" : "Atenção"}</span> ${pr.ritmo.texto}</p>` : ""}

      <div class="acoes plano-acoes">
        <button type="button" class="botao primario" data-acao="cronometro">▶ Estudar agora</button>
        <button type="button" class="botao" data-acao="registrar">+ Registrar estudo</button>
        <button type="button" class="botao" data-acao="detalhes" aria-expanded="${aberto}">${aberto ? "Fechar" : "Matérias e sessões"}</button>
        <button type="button" class="botao" data-acao="editar">Editar</button>
        <button type="button" class="botao" data-acao="excluir">Excluir</button>
      </div>

      <form class="formulario sessao-form" hidden novalidate>
        <h3>Registrar estudo</h3>
        <label class="campo">Data<input name="data" type="date"></label>
        <label class="campo">Tempo (minutos)<input name="minutos" type="number" min="1" max="1440" step="1" inputmode="numeric"></label>
        <label class="campo largo">Tópico (opcional)
          <select name="topico"><option value="">—</option>${pr.topicos.map((t) => `<option value="${escapar(t.id)}">${t.materia ? escapar(t.materia) + " · " : ""}${escapar(t.nome)}${t.concluido ? " ✓" : ""}</option>`).join("")}</select>
        </label>
        <label class="campo-check largo"><input name="concluir" type="checkbox"> Marcar o tópico como concluído</label>
        <label class="campo largo">Anotação (opcional)<input name="nota" type="text" maxlength="200" placeholder="O que você estudou"></label>
        <div class="acoes largo">
          <button type="button" class="botao" data-acao="cancelar-sessao">Cancelar</button>
          <button type="submit" class="botao primario">Salvar</button>
        </div>
      </form>

      <div class="plano-detalhes" ${aberto ? "" : "hidden"}>
        <h4>Matérias e tópicos</h4>
        ${materias.size ? [...materias.entries()].map(([m, lista]) => `
          <div class="materia">
            <div class="materia-topo"><strong>${escapar(m)}</strong> <span>${lista.filter((t) => t.concluido).length}/${lista.length}</span></div>
            <ul class="topicos">${lista.map((t) => `
              <li class="${t.concluido ? "feito" : ""}">
                <label><input type="checkbox" data-topico="${escapar(t.id)}" ${t.concluido ? "checked" : ""}> <span>${escapar(t.nome)}</span></label>
                <span class="sub">${minutosTopico(t.id) ? duracao(minutosTopico(t.id)) : ""}</span>
                <button type="button" class="botao mini" data-remover-topico="${escapar(t.id)}" aria-label="Remover ${escapar(t.nome)}">×</button>
              </li>`).join("")}</ul>
          </div>`).join("") : `<p class="estado">Nenhum tópico ainda.</p>`}
        <form class="topico-form" novalidate>
          <input name="materia" type="text" maxlength="60" placeholder="Matéria" list="materias-${escapar(p.id)}" aria-label="Matéria">
          <datalist id="materias-${escapar(p.id)}">${[...materias.keys()].filter((m) => m !== "Sem matéria").map((m) => `<option value="${escapar(m)}"></option>`).join("")}</datalist>
          <input name="nome" type="text" maxlength="120" placeholder="Novo tópico" aria-label="Novo tópico">
          <button type="submit" class="botao">Adicionar</button>
        </form>

        <h4>Sessões de estudo</h4>
        <ul class="historico">${pr.sessoes.length ? [...pr.sessoes].sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm || "").localeCompare(String(a.criadoEm || ""))).slice(0, 15).map((s) => {
          const t = pr.topicos.find((x) => x.id === s.topicoId);
          return `<li>
            <span class="hist-desc">${t ? escapar(t.nome) : "Estudo livre"}${s.nota ? ` · ${escapar(s.nota)}` : ""}<span class="sub">${dataBR(s.data)}</span></span>
            <span class="num entrada">${duracao(s.minutos)}</span>
            <button type="button" class="botao mini" data-apagar-sessao="${escapar(s.id)}">Apagar</button>
          </li>`;
        }).join("") : `<li class="estado">Nenhuma sessão registrada.</li>`}</ul>
      </div>`;
    area.appendChild(cartao);
    cartao.querySelectorAll(".plano-metricas .barra").forEach((b) => preencherBarra(b, Math.min(Number(b.dataset.valor), 1)));
    ligarPlano(cartao, p, pr);
  }
}

function linhaMetrica(rotulo, valor, fracao) {
  return `
    <div class="metrica">
      <div class="metrica-topo"><span>${rotulo}</span> <strong>${valor}</strong></div>
      ${fracao == null ? "" : `<div class="barra" role="progressbar" aria-label="${rotulo}" data-valor="${fracao}"><div class="preenchimento"></div></div>`}
    </div>`;
}

function abrirRegistro(cartao, minutos) {
  const form = cartao.querySelector(".sessao-form");
  form.reset();
  form.elements.data.value = hojeDia();
  if (minutos) form.elements.minutos.value = minutos;
  form.hidden = false;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  (minutos ? form.elements.topico : form.elements.minutos).focus({ preventScroll: true });
}

function confirmarClique(botao, texto) {
  if (botao.dataset.confirmar === "sim") return true;
  botao.dataset.confirmar = "sim";
  botao.textContent = texto;
  botao.classList.add("perigo");
  return false;
}

function ligarPlano(cartao, p, pr) {
  cartao.querySelector("[data-acao=cronometro]").addEventListener("click", () => iniciarCronometro(p.id));
  cartao.querySelector("[data-acao=registrar]").addEventListener("click", () => abrirRegistro(cartao));
  cartao.querySelector("[data-acao=cancelar-sessao]").addEventListener("click", () => (cartao.querySelector(".sessao-form").hidden = true));
  cartao.querySelector("[data-acao=detalhes]").addEventListener("click", () => {
    est.abertos.has(p.id) ? est.abertos.delete(p.id) : est.abertos.add(p.id);
    renderizarPlanos();
  });
  cartao.querySelector("[data-acao=editar]").addEventListener("click", () => abrirFormularioPlano(p.id));
  const excluir = cartao.querySelector("[data-acao=excluir]");
  excluir.addEventListener("click", async () => {
    if (!confirmarClique(excluir, "Excluir plano e sessões?")) return;
    excluir.disabled = true;
    try {
      for (const s of pr.sessoes) await est.arm.sessoes.excluir(s.id);
      for (const t of pr.topicos) await est.arm.topicos.excluir(t.id);
      await est.arm.planos.excluir(p.id);
    } catch { avisoEstudos("Não foi possível excluir o plano."); excluir.disabled = false; }
  });

  const form = cartao.querySelector(".sessao-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const minutos = Math.round(Number(form.elements.minutos.value));
    if (!(minutos >= 1 && minutos <= 1440)) { avisoEstudos("Informe o tempo estudado em minutos (de 1 a 1440)."); return form.elements.minutos.focus(); }
    const topicoId = form.elements.topico.value || null;
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await est.arm.sessoes.salvar(null, { planoId: p.id, topicoId, data: form.elements.data.value || hojeDia(), minutos, nota: form.elements.nota.value.trim() || null });
      if (topicoId && form.elements.concluir.checked) {
        const t = est.topicos.find((x) => x.id === topicoId);
        if (t && !t.concluido) await salvarTopico(t, { concluido: true, concluidoEm: new Date().toISOString() });
      }
      avisoEstudos("");
    } catch {
      avisoEstudos("Não foi possível registrar o estudo. Tente de novo.");
      botao.disabled = false;
    }
  });

  cartao.querySelectorAll("[data-topico]").forEach((caixa) => caixa.addEventListener("change", async () => {
    const t = est.topicos.find((x) => x.id === caixa.dataset.topico);
    try { await salvarTopico(t, { concluido: caixa.checked, concluidoEm: caixa.checked ? new Date().toISOString() : null }); }
    catch { avisoEstudos("Não foi possível atualizar o tópico."); caixa.checked = !caixa.checked; }
  }));
  cartao.querySelectorAll("[data-remover-topico]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirmarClique(b, "Remover?")) return;
    b.disabled = true;
    try { await est.arm.topicos.excluir(b.dataset.removerTopico); } catch { avisoEstudos("Não foi possível remover o tópico."); b.disabled = false; }
  }));
  cartao.querySelectorAll("[data-apagar-sessao]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirmarClique(b, "Confirmar")) return;
    b.disabled = true;
    try { await est.arm.sessoes.excluir(b.dataset.apagarSessao); } catch { avisoEstudos("Não foi possível apagar a sessão."); b.disabled = false; }
  }));
  const formTopico = cartao.querySelector(".topico-form");
  formTopico.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = formTopico.elements.nome.value.trim();
    if (!nome) return formTopico.elements.nome.focus();
    try {
      await est.arm.topicos.salvar(null, { planoId: p.id, materia: formTopico.elements.materia.value.trim() || null, nome, ordem: pr.topicos.length, concluido: false, concluidoEm: null });
    } catch { avisoEstudos("Não foi possível adicionar o tópico."); }
  });
}

async function salvarTopico(t, mudanca) {
  const { id, ...dados } = t;
  await est.arm.topicos.salvar(id, { ...dados, ...mudanca });
}

/* ---------- Formulário de plano ---------- */

function abrirFormularioPlano(id) {
  est.editandoId = id;
  const form = document.getElementById("plano-form");
  const p = est.planos.find((x) => x.id === id);
  form.reset();
  document.getElementById("plano-form-titulo").textContent = p ? "Editar plano" : "Novo plano de estudo";
  form.elements.tema.value = p?.tema ?? "";
  form.elements.objetivo.value = p?.objetivo ?? "";
  form.elements.dataInicio.value = p?.dataInicio ?? hojeDia();
  form.elements.dataFim.value = p?.dataFim ?? "";
  form.elements.metaHoras.value = p?.metaHoras ?? "";
  form.elements.metaSemanalHoras.value = p?.metaSemanalHoras ?? "";
  document.getElementById("plano-topicos-rotulo").hidden = !!p;
  form.hidden = false;
  document.getElementById("plano-adicionar").hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.elements.tema.focus({ preventScroll: true });
}

function fecharFormularioPlano() {
  est.editandoId = null;
  document.getElementById("plano-form").hidden = true;
  document.getElementById("plano-adicionar").hidden = false;
}

/* "Matéria: tópico" por linha → lista de tópicos. */
function lerTopicos(texto) {
  return String(texto || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 && i < l.length - 1 ? { materia: l.slice(0, i).trim().slice(0, 60), nome: l.slice(i + 1).trim().slice(0, 120) } : { materia: null, nome: l.slice(0, 120) };
  });
}

async function salvarPlano(e) {
  e.preventDefault();
  const form = e.target;
  const numero = (v) => { const n = Number(String(v).replace(",", ".")); return n > 0 ? n : null; };
  const dados = {
    tema: form.elements.tema.value.trim(),
    objetivo: form.elements.objetivo.value.trim() || null,
    dataInicio: form.elements.dataInicio.value || hojeDia(),
    dataFim: form.elements.dataFim.value || null,
    metaHoras: numero(form.elements.metaHoras.value),
    metaSemanalHoras: numero(form.elements.metaSemanalHoras.value),
  };
  if (!dados.tema) return avisoEstudos("Dê um tema para o plano.");
  if (dados.dataFim && dados.dataFim < dados.dataInicio) return avisoEstudos("O prazo precisa ser depois do início.");
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const id = await est.arm.planos.salvar(est.editandoId || null, dados);
    if (!est.editandoId) {
      const topicos = lerTopicos(form.elements.topicos.value);
      for (const [ordem, t] of topicos.entries()) {
        await est.arm.topicos.salvar(null, { planoId: id, materia: t.materia, nome: t.nome, ordem, concluido: false, concluidoEm: null });
      }
      est.abertos.add(id);
      renderizarPlanos();
    }
    avisoEstudos("");
    fecharFormularioPlano();
  } catch {
    avisoEstudos("Não foi possível salvar o plano. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

/* ---------- Cronômetro (continua mesmo se a página for recarregada) ---------- */

function lerCronometro() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CRONOMETRO) || "null"); } catch { return null; }
}

function iniciarCronometro(planoId) {
  const atual = lerCronometro();
  if (atual && atual.planoId !== planoId) {
    const outro = est.planos.find((p) => p.id === atual.planoId);
    avisoEstudos(`O cronômetro já está rodando${outro ? ` em “${outro.tema}”` : ""}. Pare antes de começar outro.`);
    return;
  }
  if (!atual) {
    try { localStorage.setItem(CHAVE_CRONOMETRO, JSON.stringify({ planoId, inicio: Date.now() })); } catch {}
  }
  mostrarCronometro();
}

function mostrarCronometro() {
  const c = lerCronometro();
  const barra = document.getElementById("cronometro");
  clearInterval(est.intervaloCronometro);
  barra.hidden = !c;
  if (!c) return;
  const plano = est.planos.find((p) => p.id === c.planoId);
  document.getElementById("cronometro-plano").textContent = plano ? `Estudando: ${plano.tema}` : "";
  const atualizar = () => {
    const s = Math.max(0, Math.floor((Date.now() - c.inicio) / 1000));
    document.getElementById("cronometro-tempo").textContent =
      [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };
  atualizar();
  est.intervaloCronometro = setInterval(atualizar, 1000);
}

function pararCronometro(registrar) {
  const c = lerCronometro();
  try { localStorage.removeItem(CHAVE_CRONOMETRO); } catch {}
  mostrarCronometro();
  if (!registrar || !c) return;
  const minutos = Math.max(1, Math.round((Date.now() - c.inicio) / 60000));
  const cartao = document.querySelector(`.plano[data-plano="${CSS.escape(c.planoId)}"]`);
  if (cartao) abrirRegistro(cartao, Math.min(minutos, 1440));
}

/* ---------- Início ---------- */

async function iniciarEstudos() {
  if (!document.getElementById("planos")) return;
  document.getElementById("plano-adicionar").addEventListener("click", () => abrirFormularioPlano(""));
  document.getElementById("plano-cancelar").addEventListener("click", () => { avisoEstudos(""); fecharFormularioPlano(); });
  document.getElementById("plano-form").addEventListener("submit", salvarPlano);
  document.getElementById("cronometro-parar").addEventListener("click", () => pararCronometro(true));
  document.getElementById("cronometro-descartar").addEventListener("click", () => pararCronometro(false));
  renderizarPlanos();

  for (const nome of ["planos", "topicos", "sessoes"]) {
    est.arm[nome] = await abrirArmazenamento(nome, []);
  }
  for (const nome of ["planos", "topicos", "sessoes"]) {
    est.arm[nome].observar((lista) => { est[nome] = lista; renderizarPlanos(); mostrarCronometro(); },
      () => avisoEstudos("Não foi possível carregar os estudos. Recarregue a página."));
  }
}

iniciarEstudos();

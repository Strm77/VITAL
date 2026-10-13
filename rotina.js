/* ---------- Rotina: produtividade ----------
 * Tarefas com prioridade e prazo, agenda que junta tudo (compromissos, consultas, tarefas,
 * contas, artes do SHARK, prazos de estudo), projetos com o próximo passo, hábitos da
 * semana e o tempo dedicado a cada área da vida. Usa os dados de vida.js.
 */

const rot = { filtro: "", editandoAfazer: null, editandoCompromisso: null, editandoProjeto: null, editandoHabito: null, agendaMes: null, feitosAbertos: new Set() };
const PRIORIDADES = { alta: { nome: "Alta", ordem: 0 }, media: { nome: "Média", ordem: 1 }, baixa: { nome: "Baixa", ordem: 2 } };
const porPrioridade = (a, b) => PRIORIDADES[a.prioridade].ordem - PRIORIDADES[b.prioridade].ordem || (a.prazo || "9").localeCompare(b.prazo || "9");
const projetoDe = (id) => vida.projetos.find((p) => p.id === id);

function avisoRotina(id, texto) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.hidden = !texto;
}

function confirmar(b, texto) {
  if (b.dataset.confirmar === "sim") return true;
  b.dataset.confirmar = "sim";
  b.textContent = texto;
  b.classList.add("perigo");
  return false;
}

/* ---------- Tarefas ---------- */

async function concluirAfazer(a, feito) {
  const { id, ...dados } = a;
  await vida.arm.afazeres.salvar(id, { ...dados, feitoEm: feito ? hojeDia() : null });
  if (!feito) return;
  const p = projetoDe(a.projetoId);
  const restantes = p ? vida.afazeres.filter((x) => x.projetoId === p.id && !x.feitoEm && x.id !== id).length : 1;
  if (p && !restantes) { avisoVida(`🏁 ${p.nome}: todos os passos feitos!`, "acerto"); tentar(() => confete()); }
  else avisoVida(a.prioridade === "alta" ? "Prioridade alta resolvida! 💪" : "Feito ✓", "acerto");
}

function linhaAfazer(a) {
  const hoje = hojeDia();
  const p = projetoDe(a.projetoId);
  const atrasada = !a.feitoEm && a.prazo && a.prazo < hoje;
  const sub = [p ? `📁 ${p.nome}` : "", a.feitoEm ? `feita ${dataBR(a.feitoEm).slice(0, 5)}` : a.prazo ? `${diaCurto(a.prazo)} · ${relativo(a.prazo)}` : ""].filter(Boolean);
  return `
    <li class="afazer prioridade-${a.prioridade}${a.feitoEm ? " feito" : ""}${atrasada ? " atrasada" : ""}" data-afazer="${escapar(a.id)}">
      <input type="checkbox" data-afazer-feito ${a.feitoEm ? "checked" : ""} aria-label="Feita: ${escapar(a.titulo)}">
      <span class="afazer-texto"><span>${escapar(a.titulo)}</span>${sub.length ? ` <small>${sub.map(escapar).join(" · ")}</small>` : ""}</span>
      <span class="chip-prioridade ${a.prioridade}">${PRIORIDADES[a.prioridade].nome}</span>
      <span class="afazer-acoes">
        <button type="button" class="botao mini" data-afazer-acao="editar" aria-label="Editar ${escapar(a.titulo)}">Editar</button>
        <button type="button" class="botao mini" data-afazer-acao="excluir" aria-label="Excluir ${escapar(a.titulo)}">×</button>
      </span>
    </li>`;
}

function ligarAfazeres(raiz) {
  raiz.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-afazer-feito]")) return;
    const a = vida.afazeres.find((x) => x.id === e.target.closest("[data-afazer]").dataset.afazer);
    e.target.disabled = true;
    try { await concluirAfazer(a, e.target.checked); } catch { e.target.checked = !e.target.checked; e.target.disabled = false; }
  });
  raiz.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-afazer-acao]");
    if (!b) return;
    const a = vida.afazeres.find((x) => x.id === b.closest("[data-afazer]").dataset.afazer);
    if (b.dataset.afazerAcao === "editar") return irPara("#rotina", () => editarAfazer(a));
    if (!confirmar(b, "Excluir?")) return;
    b.disabled = true;
    try { await vida.arm.afazeres.excluir(a.id); } catch { b.disabled = false; }
  });
}

function renderizarTarefasRotina() {
  const hoje = hojeDia();
  const semana = inicioSemana(hoje);
  const pend = vida.afazeres.filter((a) => !a.feitoEm);
  const atrasadas = pend.filter((a) => a.prazo && a.prazo < hoje);
  const deHoje = pend.filter((a) => a.prazo === hoje);
  const feitasSemana = vida.afazeres.filter((a) => a.feitoEm && a.feitoEm >= semana);
  document.getElementById("tarefas-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hoje)));
  document.getElementById("tarefas-numeros").innerHTML = `
    <div class="shark-numero"><span>Pendentes</span> <strong>${pend.length}</strong> <small>${pend.filter((a) => a.prioridade === "alta").length} de prioridade alta</small></div>
    <div class="shark-numero${atrasadas.length ? " alerta" : ""}"><span>Atrasadas</span> <strong>${atrasadas.length}</strong> <small>${atrasadas.length ? "resolva ou remarque" : "nada atrasado ✓"}</small></div>
    <div class="shark-numero"><span>Para hoje</span> <strong>${deHoje.length}</strong> <small>com prazo hoje</small></div>
    <div class="shark-numero"><span>Feitas na semana</span> <strong>${feitasSemana.length}</strong> <small>desde segunda</small></div>`;

  const select = document.getElementById("afazer-projeto");
  const valor = select.value;
  select.innerHTML = `<option value="">Sem projeto</option>` + vida.projetos.filter((p) => p.status !== "concluido" || p.id === valor).map((p) => `<option value="${escapar(p.id)}">📁 ${escapar(p.nome)}</option>`).join("");
  select.value = valor;

  const projetosComTarefa = vida.projetos.filter((p) => pend.some((a) => a.projetoId === p.id));
  const filtros = [["", "Todas"], ["alta", "🔴 Alta"], ...projetosComTarefa.map((p) => [p.id, `📁 ${p.nome}`])];
  if (!filtros.some(([v]) => v === rot.filtro)) rot.filtro = "";
  document.getElementById("afazeres-filtro").innerHTML = pend.length ? filtros.map(([v, n]) => `<button type="button" class="chip-filtro${rot.filtro === v ? " ativo" : ""}" data-filtro-afazer="${escapar(v)}" aria-pressed="${rot.filtro === v}">${escapar(n)}</button>`).join("") : "";

  const passa = (a) => !rot.filtro || (rot.filtro === "alta" ? a.prioridade === "alta" : a.projetoId === rot.filtro);
  const todas = vida.afazeres.filter(passa);
  const grupos = [
    ["Atrasadas", (a) => !a.feitoEm && a.prazo && a.prazo < hoje],
    ["Hoje", (a) => !a.feitoEm && a.prazo === hoje],
    ["Esta semana", (a) => !a.feitoEm && a.prazo > hoje && a.prazo <= somarDias(semana, 6)],
    ["Mais adiante", (a) => !a.feitoEm && a.prazo > somarDias(semana, 6)],
    ["Sem prazo", (a) => !a.feitoEm && !a.prazo],
    ["Feitas nos últimos 7 dias", (a) => a.feitoEm && a.feitoEm >= somarDias(hoje, -6), true],
  ];
  const html = grupos.map(([titulo, f, feitas]) => {
    const lista = todas.filter(f).sort(feitas ? (a, b) => b.feitoEm.localeCompare(a.feitoEm) : porPrioridade);
    return lista.length ? `<div class="grupo-tarefas${feitas ? " feitas" : ""}"><h3>${titulo} <span>${lista.length}</span></h3><ul class="tarefas">${lista.map(linhaAfazer).join("")}</ul></div>` : "";
  }).join("");
  document.getElementById("afazeres").innerHTML = html;
  document.getElementById("afazeres-vazio").hidden = pend.length > 0 || !!html;
}

function editarAfazer(a) {
  const f = document.getElementById("afazer-form").elements;
  rot.editandoAfazer = a.id;
  f.titulo.value = a.titulo;
  f.prioridade.value = a.prioridade;
  f.prazo.value = a.prazo || "";
  f.projetoId.value = a.projetoId || "";
  document.getElementById("afazer-salvar").textContent = "Salvar";
  document.getElementById("afazer-cancelar").hidden = false;
  f.titulo.focus();
}

function limparFormularioAfazer() {
  const form = document.getElementById("afazer-form");
  form.reset();
  rot.editandoAfazer = null;
  document.getElementById("afazer-salvar").textContent = "Adicionar";
  document.getElementById("afazer-cancelar").hidden = true;
  avisoRotina("rotina-aviso", "");
}

async function salvarAfazer(e) {
  e.preventDefault();
  const f = e.target.elements;
  const titulo = f.titulo.value.trim();
  if (!titulo) { avisoRotina("rotina-aviso", "Escreva a tarefa."); return f.titulo.focus(); }
  const atual = vida.afazeres.find((a) => a.id === rot.editandoAfazer);
  try {
    await vida.arm.afazeres.salvar(rot.editandoAfazer, {
      titulo, prioridade: f.prioridade.value, prazo: f.prazo.value || null, projetoId: f.projetoId.value || null, feitoEm: atual?.feitoEm || null,
    });
    limparFormularioAfazer();
    f.titulo.focus();
  } catch { avisoRotina("rotina-aviso", "Não foi possível salvar a tarefa."); }
}

/* ---------- Agenda (junta todas as áreas) ---------- */

function itensAgenda(de, ate) {
  const itens = [];
  const dentro = (d) => d && d >= de && d <= ate;
  for (const c of vida.compromissos.filter((x) => dentro(x.data))) {
    itens.push({ data: c.data, hora: c.hora, tipo: c.tipo === "compromisso" ? "compromisso" : "consulta", texto: `${c.tipo !== "compromisso" ? "🩺 " : ""}${c.titulo}`, feito: c.feito, compromisso: c });
  }
  for (const a of vida.afazeres.filter((x) => !x.feitoEm && dentro(x.prazo))) itens.push({ data: a.prazo, tipo: "tarefa", texto: `✅ ${a.titulo}`, link: "#rotina" });
  tentar(() => pag.contas.filter((c) => c.status !== "pago" && dentro(c.vencimento)).forEach((c) =>
    itens.push({ data: c.vencimento, tipo: "conta", texto: `💸 ${c.nome} ${moeda.format(Number(c.valor || 0))}`, link: "#painel" })));
  tentar(() => {
    const porDia = new Map();
    todasTarefas().filter((t) => pendente(t) && dentro(t.prazo)).forEach((t) => porDia.set(t.prazo, [...(porDia.get(t.prazo) || []), t]));
    porDia.forEach((lista, d) => itens.push({ data: d, tipo: "shark", texto: `🦈 ${artes_(somaQtd(lista))}`, detalhe: lista.map((t) => `${t.nome} (${t.cliente.nome})`).join(", "), link: "#shark" }));
    shk.eventos.filter((e) => dentro(e.data)).forEach((e) => itens.push({ data: e.data, tipo: "shark", texto: `🏁 ${e.nome}`, detalhe: e.calendario, link: "#shark-calendario" }));
  });
  tentar(() => est.planos.filter((p) => dentro(p.dataFim)).forEach((p) => itens.push({ data: p.dataFim, tipo: "estudo", texto: `📚 Prazo: ${p.tema}`, link: "#estudos" })));
  const ordem = { compromisso: 0, consulta: 1, conta: 2, tarefa: 3, shark: 4, estudo: 5 };
  return itens.sort((a, b) => a.data.localeCompare(b.data) || (a.hora || "99").localeCompare(b.hora || "99") || ordem[a.tipo] - ordem[b.tipo]);
}

function renderizarAgendaVida() {
  const hoje = hojeDia();
  const mes = rot.agendaMes || mesDe(hoje);
  document.getElementById("agenda-vida-mes").textContent = capitalizar(mesAno.format(paraData(`${mes}-01`)));
  const inicio = inicioSemana(`${mes}-01`);
  const [a, m] = mes.split("-").map(Number);
  const fim = somarDias(inicioSemana(`${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`), 6);
  const itens = itensAgenda(inicio, fim);
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const doDia = itens.filter((i) => i.data === d);
    dias.push(`
      <div class="agenda-dia${mesDe(d) !== mes ? " fora" : ""}${d === hoje ? " hoje" : ""}" ${doDia.length ? `title="${escapar(doDia.map((i) => `${i.hora ? i.hora + " " : ""}${i.texto}${i.detalhe ? ` — ${i.detalhe}` : ""}`).join("\n"))}"` : ""}>
        <span class="agenda-num">${paraData(d).getDate()}</span>
        ${doDia.slice(0, 3).map((i) => `<span class="agenda-item tipo-${i.tipo}${i.feito ? " feito" : ""}">${i.hora ? `${i.hora} ` : ""}${escapar(i.texto)}</span>`).join("")}
        ${doDia.length > 3 ? `<span class="agenda-mais">+${doDia.length - 3}</span>` : ""}
      </div>`);
  }
  document.getElementById("agenda-vida").innerHTML = `
    <div class="agenda-semana">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="agenda-grade">${dias.join("")}</div>`;

  // Próximos 14 dias (e compromissos atrasados não concluídos)
  const proximos = itensAgenda(somarDias(hoje, -30), somarDias(hoje, 13)).filter((i) => i.data >= hoje || (i.compromisso && !i.feito));
  const porDia = new Map();
  proximos.forEach((i) => porDia.set(i.data, [...(porDia.get(i.data) || []), i]));
  document.getElementById("proximos").innerHTML = porDia.size ? [...porDia].map(([d, lista]) => `
    <div class="proximo-dia${d < hoje ? " atrasado" : ""}">
      <h3>${d === hoje ? "Hoje" : d === somarDias(hoje, 1) ? "Amanhã" : diaCurto(d)} <span>${d < hoje ? "ficou para trás" : relativo(d)}</span></h3>
      <ul class="compromissos">${lista.map((i) => (i.compromisso ? linhaCompromisso(i.compromisso) : `
        <li class="agenda-linha tipo-${i.tipo}"><span class="agenda-linha-texto">${escapar(i.texto)}${i.detalhe ? ` <small>${escapar(i.detalhe)}</small>` : ""}</span> ${i.link ? `<a class="botao mini" href="${i.link}">Abrir</a>` : ""}</li>`)).join("")}</ul>
    </div>`).join("") : `<p class="estado">Nada marcado nos próximos 14 dias.</p>`;
}

function abrirFormularioCompromisso(id, tipo = "compromisso") {
  const form = document.getElementById("compromisso-form");
  const c = vida.compromissos.find((x) => x.id === id);
  rot.editandoCompromisso = c ? id : null;
  form.reset();
  document.getElementById("compromisso-form-titulo").textContent = c ? "Editar compromisso" : tipo === "compromisso" ? "Novo compromisso" : "Nova consulta ou exame";
  form.elements.tipo.value = c ? c.tipo : tipo;
  form.elements.data.value = c ? c.data : hojeDia();
  if (c) {
    form.elements.titulo.value = c.titulo;
    form.elements.hora.value = c.hora || "";
    form.elements.local.value = c.local || "";
    form.elements.recorrenciaMeses.value = c.recorrenciaMeses || "";
    form.elements.nota.value = c.nota || "";
  }
  form.hidden = false;
  document.getElementById("compromisso-adicionar").hidden = true;
  avisoRotina("compromisso-aviso", "");
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.titulo.focus({ preventScroll: true });
}

function fecharFormularioCompromisso() {
  document.getElementById("compromisso-form").hidden = true;
  document.getElementById("compromisso-adicionar").hidden = false;
  rot.editandoCompromisso = null;
  avisoRotina("compromisso-aviso", "");
}

async function salvarCompromisso(e) {
  e.preventDefault();
  const f = e.target.elements;
  const repetir = Math.round(Number(f.recorrenciaMeses.value));
  const atual = vida.compromissos.find((x) => x.id === rot.editandoCompromisso);
  const dados = {
    titulo: f.titulo.value.trim(), tipo: f.tipo.value, data: f.data.value, hora: f.hora.value ? f.hora.value.slice(0, 5) : null,
    local: f.local.value.trim() || null, nota: f.nota.value.trim() || null, feito: atual?.feito || false,
    recorrenciaMeses: repetir >= 1 && repetir <= 60 ? repetir : null,
  };
  if (!dados.titulo) { avisoRotina("compromisso-aviso", "Dê um título."); return f.titulo.focus(); }
  if (!dados.data) { avisoRotina("compromisso-aviso", "Escolha a data."); return f.data.focus(); }
  try { await vida.arm.compromissos.salvar(rot.editandoCompromisso, dados); fecharFormularioCompromisso(); }
  catch { avisoRotina("compromisso-aviso", "Não foi possível salvar."); }
}

/* ---------- Projetos ---------- */

function renderizarProjetos() {
  const hoje = hojeDia();
  const ordem = { ativo: 0, pausado: 1, concluido: 2 };
  const projetos = [...vida.projetos].sort((a, b) => ordem[a.status] - ordem[b.status] || (a.prazo || "9").localeCompare(b.prazo || "9"));
  document.getElementById("projetos-vazio").hidden = projetos.length > 0;
  document.getElementById("projetos").innerHTML = projetos.map((p) => {
    const tarefas = vida.afazeres.filter((a) => a.projetoId === p.id);
    const pend = tarefas.filter((a) => !a.feitoEm).sort(porPrioridade);
    const feitas = tarefas.filter((a) => a.feitoEm).sort((a, b) => b.feitoEm.localeCompare(a.feitoEm));
    const area = areaVida(p.area);
    const proximo = pend[0];
    const abertos = rot.feitosAbertos.has(p.id);
    return `
    <section class="painel projeto status-${p.status}" data-projeto="${escapar(p.id)}" style="--cor:${corArea(p.area)}">
      <div class="painel-cabecalho">
        <h2>${area ? area.icone : "📁"} ${escapar(p.nome)}</h2>
        <select class="projeto-status" data-projeto-status aria-label="Situação de ${escapar(p.nome)}">
          <option value="ativo" ${p.status === "ativo" ? "selected" : ""}>Ativo</option>
          <option value="pausado" ${p.status === "pausado" ? "selected" : ""}>Pausado</option>
          <option value="concluido" ${p.status === "concluido" ? "selected" : ""}>Concluído</option>
        </select>
      </div>
      <p class="projeto-sub">${[area?.nome, p.objetivo, p.prazo ? `prazo ${dataBR(p.prazo)}${p.status !== "concluido" ? ` (${relativo(p.prazo)})` : ""}` : ""].filter(Boolean).map(escapar).join(" · ")}</p>
      <div class="frente-topo"><span class="sub">${tarefas.length ? `${feitas.length} de ${tarefas.length} passos` : "Nenhum passo ainda"}</span><strong class="frente-numero">${tarefas.length ? Math.round((feitas.length / tarefas.length) * 100) : 0}%</strong></div>
      <div class="barra" role="progressbar" aria-label="Progresso de ${escapar(p.nome)}"><div class="preenchimento"></div></div>
      ${p.status !== "concluido" ? (proximo ? `
        <div class="proximo-passo${proximo.prazo && proximo.prazo < hoje ? " atrasado" : ""}">
          <span class="proximo-rotulo">Próximo passo</span>
          <ul class="tarefas">${linhaAfazer(proximo)}</ul>
        </div>` : `<p class="proximo-passo vazio">${tarefas.length ? "Todos os passos feitos 🎉 — marque como concluído ou adicione o próximo." : "Qual é o primeiro passo? Adicione abaixo."}</p>`) : ""}
      ${pend.length > 1 ? `<ul class="tarefas">${pend.slice(1).map(linhaAfazer).join("")}</ul>` : ""}
      ${feitas.length ? `<button type="button" class="botao mini" data-projeto-feitos aria-expanded="${abertos}">${abertos ? "Esconder" : "Ver"} ${feitas.length} feito${feitas.length === 1 ? "" : "s"}</button>
        ${abertos ? `<ul class="tarefas">${feitas.map(linhaAfazer).join("")}</ul>` : ""}` : ""}
      ${p.status !== "concluido" ? `<form class="linha-form" data-projeto-passo novalidate>
        <input name="titulo" type="text" maxlength="140" placeholder="Novo passo" aria-label="Novo passo de ${escapar(p.nome)}">
        <input name="prazo" type="date" aria-label="Prazo do passo">
        <button type="submit" class="botao">Adicionar</button>
      </form>` : ""}
      <div class="acoes frente-acoes">
        <button type="button" class="botao" data-projeto-acao="editar">Editar</button>
        <button type="button" class="botao" data-projeto-acao="excluir">Excluir</button>
      </div>
    </section>`;
  }).join("");
  document.querySelectorAll(".projeto").forEach((sec) => {
    const tarefas = vida.afazeres.filter((a) => a.projetoId === sec.dataset.projeto);
    preencherBarra(sec.querySelector(".barra"), tarefas.length ? tarefas.filter((a) => a.feitoEm).length / tarefas.length : 0);
  });
}

function ligarProjetos() {
  const raiz = document.getElementById("projetos");
  ligarAfazeres(raiz);
  raiz.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-projeto-status]")) return;
    const p = projetoDe(e.target.closest("[data-projeto]").dataset.projeto);
    const { id, ...dados } = p;
    try {
      await vida.arm.projetos.salvar(id, { ...dados, status: e.target.value });
      if (e.target.value === "concluido") { avisoVida(`🏆 Projeto concluído: ${p.nome}!`, "acerto"); tentar(() => confete()); }
    } catch {}
  });
  raiz.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-projeto-passo]")) return;
    e.preventDefault();
    const titulo = e.target.elements.titulo.value.trim();
    if (!titulo) return e.target.elements.titulo.focus();
    try {
      await vida.arm.afazeres.salvar(null, { titulo, prazo: e.target.elements.prazo.value || null, prioridade: "media", projetoId: e.target.closest("[data-projeto]").dataset.projeto, feitoEm: null });
    } catch { avisoVida("Não foi possível salvar o passo.", "erro"); }
  });
  raiz.addEventListener("click", async (e) => {
    const sec = e.target.closest("[data-projeto]");
    if (!sec) return;
    if (e.target.closest("[data-projeto-feitos]")) {
      rot.feitosAbertos.has(sec.dataset.projeto) ? rot.feitosAbertos.delete(sec.dataset.projeto) : rot.feitosAbertos.add(sec.dataset.projeto);
      return renderizarProjetos();
    }
    const b = e.target.closest("[data-projeto-acao]");
    if (!b) return;
    if (b.dataset.projetoAcao === "editar") return abrirFormularioProjeto(sec.dataset.projeto);
    if (!confirmar(b, "Excluir projeto e passos?")) return;
    b.disabled = true;
    try {
      for (const a of vida.afazeres.filter((x) => x.projetoId === sec.dataset.projeto)) await vida.arm.afazeres.excluir(a.id);
      await vida.arm.projetos.excluir(sec.dataset.projeto);
    } catch { b.disabled = false; }
  });
}

function abrirFormularioProjeto(id) {
  const form = document.getElementById("projeto-form");
  const p = projetoDe(id);
  rot.editandoProjeto = p ? id : null;
  form.reset();
  document.getElementById("projeto-form-titulo").textContent = p ? `Editar ${p.nome}` : "Novo projeto";
  document.getElementById("projeto-area").innerHTML = opcoesAreas(p?.area || "carreira", "Sem área");
  document.getElementById("projeto-passos-rotulo").hidden = !!p;
  if (p) {
    form.elements.nome.value = p.nome;
    form.elements.objetivo.value = p.objetivo || "";
    form.elements.prazo.value = p.prazo || "";
  }
  form.hidden = false;
  document.getElementById("projeto-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioProjeto() {
  document.getElementById("projeto-form").hidden = true;
  document.getElementById("projeto-adicionar").hidden = false;
  rot.editandoProjeto = null;
}

async function salvarProjeto(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  if (!nome) return f.nome.focus();
  const atual = projetoDe(rot.editandoProjeto);
  try {
    const id = await vida.arm.projetos.salvar(rot.editandoProjeto, {
      nome, objetivo: f.objetivo.value.trim() || null, prazo: f.prazo.value || null, area: f.area.value || null, status: atual?.status || "ativo",
    });
    if (!atual) {
      for (const titulo of f.passos.value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30)) {
        await vida.arm.afazeres.salvar(null, { titulo: titulo.slice(0, 140), prazo: null, prioridade: "media", projetoId: id, feitoEm: null });
      }
    }
    fecharFormularioProjeto();
  } catch { avisoVida("Não foi possível salvar o projeto.", "erro"); }
}

/* ---------- Hábitos ---------- */

function renderizarHabitos() {
  const hoje = hojeDia();
  const semana = inicioSemana(hoje);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i));
  const habitos = habitosAtivos();
  const taxa = (ini) => {
    const meta = habitos.reduce((t, h) => t + Number(h.vezesSemana), 0);
    return meta ? habitos.reduce((t, h) => t + Math.min(feitosNaSemana(h, ini), Number(h.vezesSemana)), 0) / meta : null;
  };
  const feitosHoje = habitos.filter((h) => feitoNoDia(h, hoje)).length;
  const melhor = habitos.map((h) => ({ h, s: sequenciaHabito(h) })).sort((a, b) => b.s.n - a.s.n)[0];
  const tSemana = taxa(semana), tAntes = taxa(somarDias(semana, -7));
  document.getElementById("habitos-semana").textContent = `semana de ${dataBR(semana).slice(0, 5)} a ${dataBR(somarDias(semana, 6)).slice(0, 5)}`;
  document.getElementById("habitos-vazio").hidden = habitos.length > 0;
  document.getElementById("habitos-numeros").innerHTML = habitos.length ? `
    <div class="shark-numero"><span>Hoje</span> <strong>${feitosHoje} <em>de ${habitos.length}</em></strong> <small>${habitosPendentesHoje().length ? `${habitosPendentesHoje().length} pendente${habitosPendentesHoje().length === 1 ? "" : "s"}` : "tudo feito ✓"}</small></div>
    <div class="shark-numero"><span>Esta semana</span> <strong>${Math.round(tSemana * 100)}%</strong> <small>${tAntes != null ? `semana passada ${Math.round(tAntes * 100)}%` : ""}</small></div>
    <div class="shark-numero"><span>Melhor sequência</span> <strong>${melhor && melhor.s.n ? `🔥 ${melhor.s.n}` : "—"}</strong> <small>${melhor && melhor.s.n ? `${escapar(melhor.h.nome)} (${melhor.s.unidade})` : "comece hoje"}</small></div>` : "";
  document.getElementById("grade-habitos").innerHTML = habitos.length ? `
    <thead><tr><th>Hábito</th>${dias.map((d) => `<th class="${d === hoje ? "hoje" : ""}">${DIAS_SEMANA_CURTOS[paraData(d).getDay()]}<small>${paraData(d).getDate()}</small></th>`).join("")}<th>Semana</th><th>Sequência</th></tr></thead>
    <tbody>${habitos.map((h) => {
      const feitos = feitosNaSemana(h, semana);
      const s = sequenciaHabito(h);
      return `
      <tr data-habito="${escapar(h.id)}" style="--cor:${corArea(h.area)}">
        <th scope="row"><button type="button" class="habito-nome" data-habito-editar title="Editar">${escapar(h.icone || "•")} ${escapar(h.nome)}</button><small>${Number(h.vezesSemana) >= 7 ? "todo dia" : `${h.vezesSemana}× por semana`}${h.autocuidado ? " · autocuidado" : ""}</small></th>
        ${dias.map((d) => `<td><button type="button" class="celula-habito${feitoNoDia(h, d) ? " feito" : ""}${d === hoje ? " hoje" : ""}" data-habito-dia="${d}" ${d > hoje ? "disabled" : ""} aria-pressed="${feitoNoDia(h, d)}" aria-label="${escapar(h.nome)} em ${dataBR(d).slice(0, 5)}">${feitoNoDia(h, d) ? "✓" : ""}</button></td>`).join("")}
        <td class="habito-semana${feitos >= h.vezesSemana ? " bateu" : ""}">${feitos}/${h.vezesSemana}</td>
        <td>${s.n ? `🔥 ${s.n} ${s.unidade}` : "—"}</td>
      </tr>`;
    }).join("")}</tbody>` : "";
}

function ligarHabitos() {
  const tabela = document.getElementById("grade-habitos");
  tabela.addEventListener("click", async (e) => {
    const linha = e.target.closest("[data-habito]");
    if (!linha) return;
    const h = vida.habitos.find((x) => x.id === linha.dataset.habito);
    if (e.target.closest("[data-habito-editar]")) return abrirFormularioHabito(h.id);
    const b = e.target.closest("[data-habito-dia]");
    if (!b) return;
    const feito = !feitoNoDia(h, b.dataset.habitoDia);
    b.disabled = true;
    try {
      await alternarHabito(h, b.dataset.habitoDia, feito);
      const s = sequenciaHabito(h);
      if (feito && b.dataset.habitoDia === hojeDia()) avisoVida(s.n >= 3 ? `🔥 ${h.nome}: ${s.n} ${s.unidade} seguidos!` : `${h.icone || "✓"} ${h.nome}: feito!`, "acerto");
    } catch { b.disabled = false; }
  });
}

function abrirFormularioHabito(id) {
  const form = document.getElementById("habito-form");
  const h = vida.habitos.find((x) => x.id === id);
  rot.editandoHabito = h ? id : null;
  form.reset();
  document.getElementById("habito-form-titulo").textContent = h ? `Editar ${h.nome}` : "Novo hábito";
  document.getElementById("habito-area").innerHTML = opcoesAreas(h?.area || "saude", "Sem área");
  form.querySelector("[data-habito-excluir]")?.remove();
  if (h) {
    form.elements.nome.value = h.nome;
    form.elements.icone.value = h.icone || "";
    form.elements.vezesSemana.value = String(h.vezesSemana);
    form.elements.autocuidado.checked = !!h.autocuidado;
    form.querySelector(".acoes").insertAdjacentHTML("afterbegin", `<button type="button" class="botao" data-habito-excluir>Excluir hábito</button>`);
    const ex = form.querySelector("[data-habito-excluir]");
    ex.addEventListener("click", async () => {
      if (!confirmar(ex, "Excluir hábito e histórico?")) return;
      ex.disabled = true;
      try {
        for (const f of vida.habitos_feitos.filter((x) => x.habitoId === h.id)) await vida.arm.habitos_feitos.excluir(f.id);
        await vida.arm.habitos.excluir(h.id);
        fecharFormularioHabito();
      } catch { ex.disabled = false; }
    });
  }
  form.hidden = false;
  document.getElementById("habito-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioHabito() {
  document.getElementById("habito-form").hidden = true;
  document.getElementById("habito-adicionar").hidden = false;
  rot.editandoHabito = null;
}

async function salvarHabito(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  if (!nome) return f.nome.focus();
  const atual = vida.habitos.find((x) => x.id === rot.editandoHabito);
  try {
    await vida.arm.habitos.salvar(rot.editandoHabito, {
      nome, icone: f.icone.value.trim() || null, area: f.area.value || null, vezesSemana: Number(f.vezesSemana.value),
      autocuidado: f.autocuidado.checked, ativo: atual ? atual.ativo !== false : true,
    });
    fecharFormularioHabito();
  } catch { avisoVida("Não foi possível salvar o hábito.", "erro"); }
}

/* ---------- Tempo dedicado ---------- */

/* Minutos por área num intervalo: blocos registrados + sessões de estudo + exercícios. */
function minutosPorArea(de, ate) {
  const total = new Map();
  const somar = (area, min) => total.set(area, (total.get(area) || 0) + (Number(min) || 0));
  vida.blocos_tempo.filter((b) => b.data >= de && b.data <= ate).forEach((b) => somar(b.area, b.minutos));
  tentar(() => est.sessoes.filter((s) => s.data >= de && s.data <= ate).forEach((s) => somar("estudos", s.minutos)));
  tentar(() => sau.registros.filter((r) => r.data >= de && r.data <= ate && ehTreino(r)).forEach((r) => somar("saude", r.minutos)));
  return total;
}

function renderizarTempo() {
  const hoje = hojeDia();
  const semana = inicioSemana(hoje);
  const agora = minutosPorArea(semana, hoje);
  const antes = minutosPorArea(somarDias(semana, -7), somarDias(semana, -1));
  const total = [...agora.values()].reduce((t, n) => t + n, 0);
  document.getElementById("tempo-semana").textContent = `semana de ${dataBR(semana).slice(0, 5)} · ${duracao(total)} registradas`;
  const foco = tentar(() => estadoRoda().foco, []);
  document.getElementById("tempo-foco").innerHTML = foco.length ? `
    <div class="mensagem ${foco.every((a) => (agora.get(a.id) || 0) > 0) ? "bom" : "alerta"}">
      <strong>Onde você quer melhorar: ${foco.map((a) => `${a.icone} ${a.nome}`).join(" e ")}</strong>
      <span>São as áreas com menor nota na roda da vida. Esta semana: ${foco.map((a) => `${a.nome} ${duracao(agora.get(a.id) || 0)}`).join(" · ")}.</span>
    </div>` : `<div class="mensagem neutro"><strong>O que realmente importa?</strong> <span>Avalie sua satisfação na Visão geral: as áreas com menor nota aparecem aqui como foco.</span></div>`;
  const areas = AREAS_VIDA.filter((a) => agora.get(a.id) || antes.get(a.id) || foco.some((f) => f.id === a.id))
    .sort((a, b) => (agora.get(b.id) || 0) - (agora.get(a.id) || 0));
  const maior = Math.max(60, ...areas.map((a) => Math.max(agora.get(a.id) || 0, antes.get(a.id) || 0)));
  const el = document.getElementById("tempo-areas");
  el.setAttribute("aria-label", "Tempo por área esta semana: " + (areas.map((a) => `${a.nome} ${duracao(agora.get(a.id) || 0)}`).join("; ") || "nada registrado"));
  el.innerHTML = areas.length ? `<ul class="roda-areas tempo-lista">${areas.map((a) => {
    const n = agora.get(a.id) || 0, p = antes.get(a.id) || 0;
    return `
      <li style="--cor:${corArea(a.id)}">
        <span class="roda-nome">${a.icone} ${a.nome}${foco.some((f) => f.id === a.id) ? " <small>foco</small>" : ""}</span>
        <span class="roda-trilho"><span class="roda-barra" style="width:${(n / maior) * 100}%"></span>${p ? `<span class="roda-antes" style="left:${(p / maior) * 100}%" title="Semana passada: ${duracao(p)}"></span>` : ""}</span>
        <span class="roda-nota">${duracao(n)}</span>
      </li>`;
  }).join("")}</ul><p class="sub roda-legenda"><span class="roda-antes-marca"></span> semana passada</p>` : `<p class="estado">Nada registrado nesta semana ainda.</p>`;

  const select = document.getElementById("tempo-area");
  if (!select.options.length) select.innerHTML = opcoesAreas("familia");
  const data = document.getElementById("tempo-data");
  if (!data.value) data.value = hoje;
  const blocos = vida.blocos_tempo.filter((b) => b.data >= semana).sort((a, b) => b.data.localeCompare(a.data));
  document.getElementById("blocos-tempo").innerHTML = blocos.map((b) => `
    <li style="--cor:${corArea(b.area)}"><span class="ponto-cor"></span><span>${areaVida(b.area)?.icone || ""} ${escapar(areaVida(b.area)?.nome || b.area)}${b.descricao ? ` — ${escapar(b.descricao)}` : ""}</span>
      <span class="sub">${diaCurto(b.data)} · ${duracao(b.minutos)}</span>
      <button type="button" class="botao mini" data-bloco-excluir="${escapar(b.id)}" aria-label="Excluir">×</button></li>`).join("");
}

async function salvarTempo(e) {
  e.preventDefault();
  const f = e.target.elements;
  const minutos = Math.round(Number(f.minutos.value));
  if (!(minutos >= 1 && minutos <= 1440)) { avisoRotina("tempo-aviso", "Informe os minutos (de 1 a 1440)."); return f.minutos.focus(); }
  if (f.data.value > hojeDia()) { avisoRotina("tempo-aviso", "Não dá para registrar um dia que ainda não chegou."); return f.data.focus(); }
  try {
    await vida.arm.blocos_tempo.salvar(null, { data: f.data.value || hojeDia(), area: f.area.value, minutos, descricao: f.descricao.value.trim() || null });
    f.minutos.value = "";
    f.descricao.value = "";
    avisoRotina("tempo-aviso", "");
    avisoVida(`${areaVida(f.area.value)?.icone || ""} ${duracao(minutos)} registrados.`, "acerto");
  } catch { avisoRotina("tempo-aviso", "Não foi possível registrar."); }
}

/* ---------- Início ---------- */

function renderizarRotina() {
  if (!document.getElementById("afazeres")) return;
  renderizarTarefasRotina();
  renderizarAgendaVida();
  renderizarProjetos();
  renderizarHabitos();
  renderizarTempo();
}

function iniciarRotina() {
  if (!document.getElementById("afazeres")) return;
  document.getElementById("afazer-form").addEventListener("submit", salvarAfazer);
  document.getElementById("afazer-cancelar").addEventListener("click", limparFormularioAfazer);
  document.getElementById("afazeres-filtro").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro-afazer]");
    if (b) { rot.filtro = b.dataset.filtroAfazer; renderizarTarefasRotina(); }
  });
  ligarAfazeres(document.getElementById("afazeres"));
  document.getElementById("agenda-vida-anterior").addEventListener("click", () => { rot.agendaMes = mesAnterior(rot.agendaMes || mesDe(hojeDia())); renderizarAgendaVida(); });
  document.getElementById("agenda-vida-proximo").addEventListener("click", () => { rot.agendaMes = proximoMes(rot.agendaMes || mesDe(hojeDia())); renderizarAgendaVida(); });
  document.getElementById("compromisso-adicionar").addEventListener("click", () => abrirFormularioCompromisso(null));
  document.getElementById("compromisso-cancelar").addEventListener("click", fecharFormularioCompromisso);
  document.getElementById("compromisso-form").addEventListener("submit", salvarCompromisso);
  ligarCompromissos(document.getElementById("proximos"));
  document.getElementById("projeto-adicionar").addEventListener("click", () => abrirFormularioProjeto(null));
  document.getElementById("projeto-cancelar").addEventListener("click", fecharFormularioProjeto);
  document.getElementById("projeto-form").addEventListener("submit", salvarProjeto);
  ligarProjetos();
  document.getElementById("habito-adicionar").addEventListener("click", () => abrirFormularioHabito(null));
  document.getElementById("habito-cancelar").addEventListener("click", fecharFormularioHabito);
  document.getElementById("habito-form").addEventListener("submit", salvarHabito);
  ligarHabitos();
  document.getElementById("tempo-form").addEventListener("submit", salvarTempo);
  document.querySelector(".chips-tempo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-minutos]");
    if (b) document.getElementById("tempo-minutos").value = b.dataset.minutos;
  });
  document.getElementById("blocos-tempo").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-bloco-excluir]");
    if (!b || !confirmar(b, "Excluir?")) return;
    b.disabled = true;
    try { await vida.arm.blocos_tempo.excluir(b.dataset.blocoExcluir); } catch { b.disabled = false; }
  });
  vida.renders.push(renderizarRotina);
}

iniciarRotina();

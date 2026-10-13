/* ---------- Visão geral: o centro de comando ----------
 * Guarda os dados do schema "vida" (check-in diário, prioridades da semana, roda da vida,
 * hábitos, compromissos, projetos, tarefas e tempo) e monta a Visão geral juntando o que
 * importa de todas as áreas: Financeiro, Estudos, Saúde, Rotina e SHARK.
 * bemestar.js e rotina.js usam estes dados e se registram em vida.renders.
 */

const TABELAS_VIDA = ["checkins", "prioridades", "satisfacao", "habitos", "habitos_feitos", "compromissos", "projetos", "afazeres", "blocos_tempo"];
const vida = {
  ...Object.fromEntries(TABELAS_VIDA.map((t) => [t, []])),
  arm: {},
  renders: [],
  timer: null,
  timerAviso: null,
};

// Ordem fixa: cada área usa sempre a mesma cor (--serie-1 … --serie-8).
const AREAS_VIDA = [
  { id: "saude", nome: "Saúde", icone: "💪" },
  { id: "financas", nome: "Finanças", icone: "💰" },
  { id: "carreira", nome: "Carreira e trabalho", icone: "💼" },
  { id: "estudos", nome: "Estudos", icone: "📚" },
  { id: "relacionamentos", nome: "Relacionamentos", icone: "❤️" },
  { id: "familia", nome: "Família", icone: "🏠" },
  { id: "lazer", nome: "Lazer e diversão", icone: "🎮" },
  { id: "proposito", nome: "Propósito", icone: "✨" },
];
const areaVida = (id) => AREAS_VIDA.find((a) => a.id === id);
const corArea = (id) => `var(--serie-${AREAS_VIDA.findIndex((a) => a.id === id) + 1 || 1})`;
const opcoesAreas = (sel, vazio) => (vazio ? `<option value="">${vazio}</option>` : "") + AREAS_VIDA.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${a.icone} ${a.nome}</option>`).join("");

const HUMORES = [
  { v: 1, e: "😞", n: "Muito mal" },
  { v: 2, e: "😕", n: "Mal" },
  { v: 3, e: "😐", n: "Mais ou menos" },
  { v: 4, e: "🙂", n: "Bem" },
  { v: 5, e: "😄", n: "Muito bem" },
];
const ROTULOS_ESCALA = {
  energia: ["Sem energia", "Baixa", "Média", "Boa", "A mil"],
  estresse: ["Tranquilo", "Leve", "Médio", "Alto", "No limite"],
  sonoQualidade: ["Péssima", "Ruim", "Ok", "Boa", "Ótima"],
};

/* ---------- Utilidades ---------- */

function tentar(fn, padrao) {
  try { return fn(); } catch { return padrao; }
}

function avisoVida(texto, tipo = "apoio") {
  const el = document.getElementById("vida-toast");
  if (!el) return;
  el.textContent = texto;
  el.className = `saude-toast ${tipo}`;
  el.hidden = false;
  clearTimeout(vida.timerAviso);
  vida.timerAviso = setTimeout(() => { el.hidden = true; }, 3500);
}

const checkinDe = (data) => vida.checkins.find((c) => c.data === data);

/* Um registro por dia: junta a mudança com o que já foi salvo hoje. */
async function salvarCheckin(mudancas, data = hojeDia()) {
  const { id, ...atual } = checkinDe(data) || {};
  await vida.arm.checkins.salvar(id || `ck-${data}`, {
    humor: null, energia: null, estresse: null, sonoHoras: null, sonoQualidade: null, aguaCopos: null, nota: null,
    ...atual, ...mudancas, data,
  });
}

/* ---------- Hábitos (usados na Visão geral, em Bem-estar e na Rotina) ---------- */

const habitosAtivos = () => vida.habitos.filter((h) => h.ativo !== false);
const feitoNoDia = (h, dia) => vida.habitos_feitos.some((f) => f.habitoId === h.id && f.data === dia);
const feitosNaSemana = (h, inicio) => vida.habitos_feitos.filter((f) => f.habitoId === h.id && f.data >= inicio && f.data <= somarDias(inicio, 6)).length;

async function alternarHabito(h, dia, feito) {
  const existente = vida.habitos_feitos.find((f) => f.habitoId === h.id && f.data === dia);
  if (feito && !existente) await vida.arm.habitos_feitos.salvar(`hf-${h.id}-${dia}`, { habitoId: h.id, data: dia });
  if (!feito && existente) await vida.arm.habitos_feitos.excluir(existente.id);
}

/* Diários: dias seguidos. Semanais: semanas seguidas batendo a frequência. */
function sequenciaHabito(h) {
  const hoje = hojeDia();
  if (Number(h.vezesSemana) >= 7) {
    let dia = feitoNoDia(h, hoje) ? hoje : somarDias(hoje, -1);
    let n = 0;
    while (feitoNoDia(h, dia)) { n++; dia = somarDias(dia, -1); }
    return { n, unidade: n === 1 ? "dia" : "dias" };
  }
  let semana = inicioSemana(hoje);
  if (feitosNaSemana(h, semana) < h.vezesSemana) semana = somarDias(semana, -7);
  let n = 0;
  while (feitosNaSemana(h, semana) >= h.vezesSemana) { n++; semana = somarDias(semana, -7); }
  return { n, unidade: n === 1 ? "semana" : "semanas" };
}

/* Hábitos que ainda pedem ação hoje (diários não feitos; semanais que ainda não bateram a meta). */
function habitosPendentesHoje() {
  const hoje = hojeDia();
  const semana = inicioSemana(hoje);
  return habitosAtivos().filter((h) => !feitoNoDia(h, hoje) && feitosNaSemana(h, semana) < Number(h.vezesSemana));
}

/* ---------- Compromissos (Agenda e Consultas) ---------- */

function somarMesesData(iso, n) {
  const d = paraData(iso);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return diaISO(d);
}

/* Marca como feito; se repete (ex.: dentista a cada 6 meses), já agenda o próximo. */
async function concluirCompromisso(c, feito = true) {
  const { id, ...dados } = c;
  await vida.arm.compromissos.salvar(id, { ...dados, feito });
  if (feito && Number(c.recorrenciaMeses) > 0) {
    const proxima = somarMesesData(c.data, Number(c.recorrenciaMeses));
    const jaExiste = vida.compromissos.some((x) => x.id !== id && !x.feito && x.titulo === c.titulo && x.data > c.data);
    if (!jaExiste) {
      await vida.arm.compromissos.salvar(null, { ...dados, data: proxima, feito: false });
      avisoVida(`Próximo “${c.titulo}” agendado para ${dataBR(proxima)}.`);
    }
  }
}

/* ---------- Check-in (Como estou me sentindo?) ---------- */

function escalaHtml(campo, valor, rotulo) {
  const nomes = ROTULOS_ESCALA[campo];
  return `
    <div class="escala-linha">
      ${rotulo ? `<span class="escala-rotulo">${rotulo}</span>` : ""}
      <div class="escala" role="group" aria-label="${rotulo || campo}">${[1, 2, 3, 4, 5].map((n) => `
        <button type="button" class="${valor >= n ? "cheio" : ""}" data-checkin="${campo}" data-valor="${n}" aria-pressed="${valor === n}" aria-label="${rotulo || campo}: ${nomes[n - 1]}" title="${nomes[n - 1]}"></button>`).join("")}
      </div>
      <span class="escala-valor">${valor ? nomes[valor - 1] : "—"}</span>
    </div>`;
}

function htmlCheckin() {
  const c = checkinDe(hojeDia()) || {};
  return `
    <div class="humor-escolha" role="group" aria-label="Humor">${HUMORES.map((h) => `
      <button type="button" class="humor${c.humor === h.v ? " ativo" : ""}" data-checkin="humor" data-valor="${h.v}" aria-pressed="${c.humor === h.v}" title="${h.n}">
        <span aria-hidden="true">${h.e}</span><span class="humor-nome">${h.n}</span>
      </button>`).join("")}
    </div>
    ${escalaHtml("energia", c.energia, "Energia")}
    ${escalaHtml("estresse", c.estresse, "Estresse")}
    <input class="checkin-nota" type="text" maxlength="300" data-checkin-nota placeholder="Uma frase sobre hoje (opcional)" aria-label="Uma frase sobre hoje" value="${escapar(c.nota || "")}">`;
}

function renderizarCheckins() {
  document.querySelectorAll("[data-checkin-raiz]").forEach((raiz) => {
    if (raiz.contains(document.activeElement) && document.activeElement.matches("input")) return;
    raiz.innerHTML = htmlCheckin();
  });
}

function ligarCheckin() {
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-checkin]");
    if (!b || !vida.arm.checkins) return;
    const campo = b.dataset.checkin;
    const valor = Number(b.dataset.valor);
    const atual = checkinDe(hojeDia())?.[campo];
    try {
      await salvarCheckin({ [campo]: atual === valor ? null : valor });
      if (campo === "humor" && atual !== valor) avisoVida(valor >= 4 ? "Que bom! Registrado 🙂" : valor <= 2 ? "Registrado. Pega leve com você hoje 💛" : "Registrado.");
    } catch { avisoVida("Não foi possível salvar. Tente de novo.", "erro"); }
  });
  document.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-checkin-nota]") || !vida.arm.checkins) return;
    try { await salvarCheckin({ nota: e.target.value.trim() || null }); e.target.blur(); } catch {}
  });
}

function renderizarHumorDias() {
  const el = document.getElementById("humor-dias");
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hojeDia(), i - 13));
  el.setAttribute("aria-label", "Humor nos últimos 14 dias: " + dias.map((d) => `${dataBR(d).slice(0, 5)} ${HUMORES[(checkinDe(d)?.humor || 0) - 1]?.n || "sem registro"}`).join("; "));
  el.innerHTML = dias.map((d) => {
    const h = HUMORES[(checkinDe(d)?.humor || 0) - 1];
    return `<span class="humor-dia${d === hojeDia() ? " hoje" : ""}" title="${dataBR(d).slice(0, 5)}: ${h ? h.n : "sem registro"}"><span>${h ? h.e : "·"}</span><small>${DIAS_SEMANA_CURTOS[paraData(d).getDay()].slice(0, 1)}</small></span>`;
  }).join("");
}

/* ---------- Prioridades da semana ---------- */

const prioridadeDe = (semana, ordem) => vida.prioridades.find((p) => p.semana === semana && Number(p.ordem) === ordem);

function renderizarPrioridades() {
  const lista = document.getElementById("prioridades");
  // Não atrapalha quem está digitando uma prioridade.
  if (lista.contains(document.activeElement) && document.activeElement.matches(".prioridade-texto")) return;
  const semana = inicioSemana(hojeDia());
  const definidas = [1, 2, 3].map((o) => prioridadeDe(semana, o)).filter(Boolean);
  document.getElementById("prioridades-semana").textContent =
    `${dataBR(semana).slice(0, 5)} a ${dataBR(somarDias(semana, 6)).slice(0, 5)}` + (definidas.length ? ` · ${definidas.filter((p) => p.feita).length} de ${definidas.length} feitas` : "");
  lista.innerHTML = [1, 2, 3].map((o) => {
    const p = prioridadeDe(semana, o);
    return `
      <li class="prioridade${p?.feita ? " feita" : ""}">
        <input type="checkbox" data-prioridade-feita="${o}" ${p ? "" : "disabled"} ${p?.feita ? "checked" : ""} aria-label="Prioridade ${o} feita">
        <input type="text" class="prioridade-texto" data-prioridade="${o}" maxlength="120" value="${escapar(p?.texto || "")}" placeholder="${["O que mais importa esta semana?", "Segunda prioridade", "Terceira prioridade"][o - 1]}" aria-label="Prioridade ${o}">
      </li>`;
  }).join("");

  // Prioridades da semana passada que ficaram para trás
  const vagas = [1, 2, 3].filter((o) => !prioridadeDe(semana, o));
  const anteriores = [1, 2, 3].map((o) => prioridadeDe(somarDias(semana, -7), o)).filter((p) => p && !p.feita && !definidas.some((d) => d.texto === p.texto));
  document.getElementById("prioridades-anteriores").innerHTML = vagas.length && anteriores.length ? `
    <span class="sub">Ficou da semana passada:</span>
    ${anteriores.map((p) => `<button type="button" class="chip-filtro" data-trazer="${escapar(p.id)}">↪ ${escapar(p.texto)}</button>`).join("")}` : "";
}

async function salvarPrioridade(ordem, mudancas) {
  const semana = inicioSemana(hojeDia());
  const p = prioridadeDe(semana, ordem);
  const texto = (mudancas.texto ?? p?.texto ?? "").trim();
  if (!texto) { if (p) await vida.arm.prioridades.excluir(p.id); return; }
  await vida.arm.prioridades.salvar(p?.id || `pr-${semana}-${ordem}`, { semana, ordem, texto, feita: p?.feita || false, ...mudancas, texto });
}

function ligarPrioridades() {
  const lista = document.getElementById("prioridades");
  lista.addEventListener("change", async (e) => {
    const t = e.target;
    try {
      if (t.dataset.prioridade) { await salvarPrioridade(Number(t.dataset.prioridade), { texto: t.value }); t.blur(); }
      if (t.dataset.prioridadeFeita) {
        await salvarPrioridade(Number(t.dataset.prioridadeFeita), { feita: t.checked });
        if (t.checked) { avisoVida("Prioridade cumprida! 🎯", "acerto"); if (typeof confete === "function") confete(); }
      }
    } catch { avisoVida("Não foi possível salvar a prioridade.", "erro"); }
  });
  lista.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.prioridade) e.target.blur(); });
  lista.addEventListener("focusout", () => setTimeout(renderizarPrioridades, 0));
  document.getElementById("prioridades-anteriores").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-trazer]");
    if (!b) return;
    const p = vida.prioridades.find((x) => x.id === b.dataset.trazer);
    const vaga = [1, 2, 3].find((o) => !prioridadeDe(inicioSemana(hojeDia()), o));
    if (p && vaga) await salvarPrioridade(vaga, { texto: p.texto, feita: false });
  });
}

/* ---------- O que merece atenção hoje ---------- */

function itensAtencao() {
  const hoje = hojeDia();
  const itens = [];
  const add = (nivel, icone, texto, sub, link) => itens.push({ nivel, icone, texto, sub, link });

  // Agenda e consultas
  vida.compromissos.filter((c) => !c.feito && c.data === hoje).sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"))
    .forEach((c) => add("normal", c.tipo === "compromisso" ? "📅" : "🩺", `${c.hora ? c.hora + " · " : ""}${c.titulo}`, c.local || (c.tipo === "compromisso" ? "compromisso de hoje" : `${c.tipo} hoje`), "#rotina-agenda"));
  vida.compromissos.filter((c) => !c.feito && c.tipo !== "compromisso" && c.data < hoje)
    .forEach((c) => add("alerta", "🩺", `${c.titulo} ficou para trás`, `era em ${dataBR(c.data)} — remarque ou marque como feito`, "#saude-bemestar"));

  // Tarefas
  const pend = vida.afazeres.filter((a) => !a.feitoEm);
  const atrasadas = pend.filter((a) => a.prazo && a.prazo < hoje);
  if (atrasadas.length) add("alerta", "✅", `${atrasadas.length} tarefa${atrasadas.length === 1 ? "" : "s"} atrasada${atrasadas.length === 1 ? "" : "s"}`, atrasadas.slice(0, 3).map((a) => a.titulo).join(", "), "#rotina");
  pend.filter((a) => a.prazo === hoje).forEach((a) => add("normal", "✅", a.titulo, `tarefa para hoje${a.prioridade === "alta" ? " · prioridade alta" : ""}`, "#rotina"));
  pend.filter((a) => a.prioridade === "alta" && (!a.prazo || a.prazo > hoje)).slice(0, 2)
    .forEach((a) => add("normal", "🔴", a.titulo, `prioridade alta${a.prazo ? ` · prazo ${dataBR(a.prazo).slice(0, 5)}` : ""}`, "#rotina"));

  // Hábitos
  const habitos = habitosPendentesHoje();
  if (habitos.length) add("normal", "🔁", `${habitos.length} hábito${habitos.length === 1 ? "" : "s"} para hoje`, habitos.map((h) => `${h.icone || ""} ${h.nome}`.trim()).join(", "), "#rotina-habitos");

  // Financeiro: contas atrasadas ou vencendo nos próximos 3 dias
  tentar(() => {
    const contas = pag.contas.filter((c) => c.status !== "pago" && c.vencimento);
    const atras = contas.filter((c) => c.vencimento < hoje);
    if (atras.length) add("alerta", "💸", `${atras.length} conta${atras.length === 1 ? "" : "s"} atrasada${atras.length === 1 ? "" : "s"}`, `${moeda.format(atras.reduce((t, c) => t + Number(c.valor || 0), 0))} — ${atras.slice(0, 3).map((c) => c.nome).join(", ")}`, "#painel");
    contas.filter((c) => c.vencimento >= hoje && c.vencimento <= somarDias(hoje, 3)).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .forEach((c) => add("normal", "💸", `${c.nome} vence ${c.vencimento === hoje ? "hoje" : relativo(c.vencimento)}`, moeda.format(Number(c.valor || 0)), "#painel"));
  });

  // SHARK
  tentar(() => {
    const artes = todasTarefas().filter((t) => pendente(t) && t.prazo);
    const atras = artes.filter((t) => t.prazo < hoje);
    const hojeAmanha = artes.filter((t) => t.prazo >= hoje && t.prazo <= somarDias(hoje, 1));
    if (atras.length) add("alerta", "🦈", `${artes_(somaQtd(atras))} atrasada${somaQtd(atras) === 1 ? "" : "s"} no SHARK`, atras.slice(0, 3).map((t) => `${t.nome} (${t.cliente.nome})`).join(", "), "#shark");
    if (hojeAmanha.length) add("normal", "🦈", `${artes_(somaQtd(hojeAmanha))} para hoje e amanhã`, hojeAmanha.slice(0, 3).map((t) => `${t.nome} (${t.cliente.nome})`).join(", "), "#shark");
  });

  // Saúde: meta de treinos da semana
  tentar(() => {
    const s = estatisticasSaude();
    const faltam = s.metas.treinosSemana - s.semana.dias;
    const livres = s.diasRestantes - (s.treinouHoje ? 1 : 0);
    if (!s.treinouHoje && faltam > 0 && faltam >= livres) add("alerta", "🏃", "Hoje precisa ter treino", `faltam ${faltam} treino${faltam === 1 ? "" : "s"} e restam ${livres} dia${livres === 1 ? "" : "s"} na semana`, "#saude");
  });

  // Estudos: meta semanal
  tentar(() => {
    est.planos.forEach((p) => {
      const pr = progressoDoPlano(p);
      if (pr.metaSemanaMin && pr.semana < pr.metaSemanaMin) {
        add("normal", "📚", `${p.tema}: faltam ${duracao(pr.metaSemanaMin - pr.semana)} de estudo na semana`, `${duracao(pr.semana)} de ${duracao(pr.metaSemanaMin)} até agora`, "#estudos");
      }
    });
  });

  if ([1, 2, 3].every((o) => !prioridadeDe(inicioSemana(hoje), o))) add("normal", "🎯", "Defina suas 3 prioridades da semana", "o que, se for feito, faz a semana valer a pena?", null);
  if (!checkinDe(hoje)?.humor) add("normal", "🙂", "Como você está hoje?", "faça o check-in em “Como estou me sentindo?”", null);
  return itens.sort((a, b) => (a.nivel === "alerta" ? 0 : 1) - (b.nivel === "alerta" ? 0 : 1));
}
const artes_ = (n) => `${n} arte${n === 1 ? "" : "s"}`;

function renderizarAtencao(itens) {
  document.getElementById("atencao-total").textContent = itens.length ? `${itens.length} ite${itens.length === 1 ? "m" : "ns"}` : "";
  document.getElementById("atencao").innerHTML = itens.length ? itens.map((i) => `
    <li class="atencao-item ${i.nivel}">
      <span class="atencao-icone" aria-hidden="true">${i.icone}</span>
      <span class="atencao-texto"><strong>${escapar(i.texto)}</strong>${i.sub ? ` <small>${escapar(i.sub)}</small>` : ""}</span>
      ${i.link ? `<a class="botao mini" href="${i.link}">Abrir</a>` : ""}
    </li>`).join("") : `<li class="estado">Nada urgente hoje. Aproveite! 🌿</li>`;
}

/* ---------- Metas em andamento ---------- */

function metasEmAndamento() {
  const itens = [];
  const add = (icone, area, nome, detalhe, progresso, link) => itens.push({ icone, area, nome, detalhe, progresso: Math.max(0, Math.min(progresso, 1)), link });
  tentar(() => dadosMetas().filter((m) => !m.atingida).forEach((m) =>
    add("💰", "Finanças", m.nome, `${moeda.format(m.saldo)} de ${moeda.format(m.valorAlvo)}${m.prazo ? ` · até ${dataBR(m.prazo)}` : ""}`, m.saldo / Number(m.valorAlvo), "#metas")));
  tentar(() => est.planos.forEach((p) => {
    const pr = progressoDoPlano(p);
    if (pr.metaMin) add("📚", "Estudos", p.tema, `${horas(pr.feitos)} de ${p.metaHoras} h${pr.topicos.length ? ` · ${pr.concluidos}/${pr.topicos.length} tópicos` : ""}`, pr.feitos / pr.metaMin, "#estudos");
    else if (pr.topicos.length) add("📚", "Estudos", p.tema, `${pr.concluidos} de ${pr.topicos.length} tópicos`, pr.concluidos / pr.topicos.length, "#estudos");
  }));
  tentar(() => {
    if (!sau.carregado) return;
    const s = estatisticasSaude();
    add("🏃", "Saúde", "Treinos da semana", `${s.semana.dias} de ${s.metas.treinosSemana}`, s.semana.dias / s.metas.treinosSemana, "#saude");
    if (s.alim7.total) add("🥗", "Saúde", "Acertos na alimentação (7 dias)", `${s.alim7.nota}% · meta ${s.metas.acertoAlimentacao}%`, s.alim7.nota / s.metas.acertoAlimentacao, "#saude");
  });
  tentar(() => shk.frentes.filter((f) => f.tipo === "pacote").forEach((f) => {
    const p = progressoPacote(f);
    if (p.faltam) add("🦈", "SHARK", `${clienteDe(f.clienteId)?.nome || ""} · ${f.nome}`, `${p.entregues} de ${p.meta} artes`, p.entregues / p.meta, "#shark-clientes");
  }));
  vida.projetos.filter((p) => p.status === "ativo").forEach((p) => {
    const tarefas = vida.afazeres.filter((a) => a.projetoId === p.id);
    const feitas = tarefas.filter((a) => a.feitoEm).length;
    add(areaVida(p.area)?.icone || "📁", "Projeto", p.nome, tarefas.length ? `${feitas} de ${tarefas.length} passos` : "sem passos ainda", tarefas.length ? feitas / tarefas.length : 0, "#rotina-projetos");
  });
  return itens;
}

function renderizarAndamento() {
  const itens = metasEmAndamento();
  document.getElementById("andamento-total").textContent = itens.length ? `${itens.length} em andamento` : "";
  const raiz = document.getElementById("andamento");
  raiz.innerHTML = itens.length ? itens.map((i) => `
    <a class="meta-andamento" href="${i.link}">
      <span class="meta-andamento-topo"><span>${i.icone} <strong>${escapar(i.nome)}</strong> <small>${i.area}</small></span> <span class="sub">${Math.round(i.progresso * 100)}%</span></span>
      <span class="barra" role="progressbar" aria-label="${escapar(i.nome)}"><span class="preenchimento"></span></span>
      <small>${escapar(i.detalhe)}</small>
    </a>`).join("") : `<p class="estado">Nenhuma meta em andamento. Crie caixinhas em Financeiro › Metas, planos em Estudos ou projetos em Rotina.</p>`;
  raiz.querySelectorAll(".barra").forEach((b, i) => preencherBarra(b, itens[i].progresso));
}

/* ---------- Roda da vida (satisfação) ---------- */

const notasDoMes = (mes) => Object.fromEntries(vida.satisfacao.filter((s) => s.mes === mes).map((s) => [s.area, Number(s.nota)]));
const mesesAvaliados = () => [...new Set(vida.satisfacao.map((s) => s.mes))].sort();
const mediaNotas = (notas) => { const v = Object.values(notas); return v.length ? v.reduce((t, n) => t + n, 0) / v.length : null; };
const umaCasa = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function estadoRoda() {
  const atual = mesDe(hojeDia());
  const meses = mesesAvaliados().filter((m) => m <= atual);
  const mes = meses[meses.length - 1] || null;
  const anterior = meses[meses.length - 2] || null;
  const notas = mes ? notasDoMes(mes) : {};
  const antes = anterior ? notasDoMes(anterior) : {};
  const foco = AREAS_VIDA.filter((a) => notas[a.id] != null).sort((a, b) => notas[a.id] - notas[b.id]).slice(0, 2);
  return { atual, mes, anterior, notas, antes, media: mediaNotas(notas), mediaAntes: mediaNotas(antes), foco, meses };
}

function renderizarRoda() {
  const r = estadoRoda();
  const raiz = document.getElementById("roda");
  document.getElementById("roda-mes").textContent = r.mes ? capitalizar(mesAno.format(paraData(`${r.mes}-01`))) : "";
  document.getElementById("roda-avaliar").textContent = r.mes === r.atual ? "Atualizar a avaliação deste mês" : "Avaliar este mês";
  if (!r.mes) {
    raiz.innerHTML = `<p class="estado">Dê uma nota de 0 a 10 para cada área da sua vida. Repita todo mês para ver o que melhora e onde focar.</p>`;
    return;
  }
  const delta = r.mediaAntes != null ? r.media - r.mediaAntes : null;
  const historico = r.meses.slice(-6).map((m) => ({ m, media: mediaNotas(notasDoMes(m)) }));
  raiz.innerHTML = `
    <div class="roda-resumo">
      <div class="roda-media"><strong>${umaCasa(r.media)}</strong> <span>de 10</span>
        ${delta != null ? `<small class="${delta > 0 ? "sobe" : delta < 0 ? "desce" : ""}">${delta > 0 ? "▲" : delta < 0 ? "▼" : "="} ${umaCasa(Math.abs(delta))} vs. ${MESES_CURTOS[Number(r.anterior.slice(5)) - 1].toLowerCase()}</small>` : ""}
      </div>
      ${r.foco.length ? `<p class="roda-foco">Foco: <strong>${r.foco.map((a) => `${a.icone} ${a.nome}`).join(" e ")}</strong> — as áreas com menor nota.</p>` : ""}
      ${historico.length > 1 ? `<p class="sub">Média por mês: ${historico.map((h) => `${MESES_CURTOS[Number(h.m.slice(5)) - 1]} ${umaCasa(h.media)}`).join(" · ")}</p>` : ""}
    </div>
    <ul class="roda-areas">${AREAS_VIDA.map((a) => {
      const n = r.notas[a.id];
      const antes = r.antes[a.id];
      return `
      <li style="--cor:${corArea(a.id)}">
        <span class="roda-nome">${a.icone} ${a.nome}</span>
        <span class="roda-trilho">
          <span class="roda-barra" style="width:${n != null ? n * 10 : 0}%"></span>
          ${antes != null ? `<span class="roda-antes" style="left:${antes * 10}%" title="Mês anterior: ${antes}"></span>` : ""}
        </span>
        <span class="roda-nota">${n ?? "—"}${antes != null && n != null && n !== antes ? ` <small class="${n > antes ? "sobe" : "desce"}">${n > antes ? "+" : ""}${n - antes}</small>` : ""}</span>
      </li>`;
    }).join("")}</ul>
    ${r.anterior ? `<p class="sub roda-legenda"><span class="roda-antes-marca"></span> mês anterior</p>` : ""}`;
}

function abrirFormularioRoda() {
  const r = estadoRoda();
  const base = r.mes ? r.notas : {};
  document.getElementById("roda-campos").innerHTML = AREAS_VIDA.map((a) => `
    <label class="roda-campo">
      <span>${a.icone} ${a.nome}</span>
      <input type="range" min="0" max="10" step="1" name="${a.id}" value="${base[a.id] ?? 5}" oninput="this.nextElementSibling.textContent = this.value">
      <output>${base[a.id] ?? 5}</output>
    </label>`).join("");
  document.getElementById("roda-form").hidden = false;
  document.getElementById("roda-avaliar").hidden = true;
}

function fecharFormularioRoda() {
  document.getElementById("roda-form").hidden = true;
  document.getElementById("roda-avaliar").hidden = false;
}

async function salvarRoda(e) {
  e.preventDefault();
  const mes = mesDe(hojeDia());
  try {
    for (const a of AREAS_VIDA) {
      const nota = Number(e.target.elements[a.id].value);
      const existente = vida.satisfacao.find((s) => s.mes === mes && s.area === a.id);
      await vida.arm.satisfacao.salvar(existente?.id || `sat-${mes}-${a.id}`, { mes, area: a.id, nota });
    }
    fecharFormularioRoda();
    avisoVida("Avaliação do mês salva ✨", "acerto");
  } catch { avisoVida("Não foi possível salvar a avaliação.", "erro"); }
}

/* ---------- Topo ---------- */

function renderizarSaudacao(itens) {
  const hora = new Date().getHours();
  document.getElementById("inicio-saudacao").textContent = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  document.getElementById("inicio-data").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hojeDia())));
  const semana = inicioSemana(hojeDia());
  const prioridades = [1, 2, 3].map((o) => prioridadeDe(semana, o)).filter(Boolean);
  const r = estadoRoda();
  const alertas = itens.filter((i) => i.nivel === "alerta").length;
  const partes = [
    itens.length ? `${itens.length} coisa${itens.length === 1 ? "" : "s"} pedindo atenção${alertas ? ` (${alertas} urgente${alertas === 1 ? "" : "s"})` : ""}` : "nada urgente hoje",
    prioridades.length ? `${prioridades.filter((p) => p.feita).length} de ${prioridades.length} prioridades da semana feitas` : "prioridades da semana ainda não definidas",
    r.media != null ? `satisfação com a vida em ${umaCasa(r.media)}` : "",
  ].filter(Boolean);
  document.getElementById("inicio-frase").textContent = capitalizar(partes.join(" · ")) + ".";
}

/* ---------- Render geral ---------- */

function renderizarInicio() {
  if (!document.getElementById("atencao")) return;
  const itens = itensAtencao();
  renderizarSaudacao(itens);
  renderizarHumorDias();
  renderizarPrioridades();
  renderizarAtencao(itens);
  renderizarAndamento();
  renderizarRoda();
}

function renderizarVida() {
  renderizarCheckins();
  renderizarInicio();
  vida.renders.forEach((fn) => fn());
}

function agendarVida() {
  clearTimeout(vida.timer);
  vida.timer = setTimeout(renderizarVida, 20);
}

async function iniciarVida() {
  if (!document.getElementById("atencao")) return;
  ligarCheckin();
  ligarPrioridades();
  document.getElementById("roda-avaliar").addEventListener("click", abrirFormularioRoda);
  document.getElementById("roda-cancelar").addEventListener("click", fecharFormularioRoda);
  document.getElementById("roda-form").addEventListener("submit", salvarRoda);
  document.addEventListener("vital-dados", agendarVida);
  document.addEventListener("vista-mostrada", agendarVida);
  agendarVida();

  for (const t of TABELAS_VIDA) vida.arm[t] = await abrirArmazenamento(t, []);
  for (const t of TABELAS_VIDA) {
    vida.arm[t].observar((lista) => { vida[t] = lista; agendarVida(); },
      () => avisoVida("Não foi possível carregar os dados. Recarregue a página.", "erro"));
  }
}

iniciarVida();

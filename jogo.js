/* ---------- Life Game e Listas (área Rotina) ----------
 * Life Game: checklist da vida diária (cada hábito pode ser checado até N vezes por dia) e
 * coisas a fazer. Cada check rende XP; o XP total e o nível vêm da soma dos checks.
 * Tudo é configurado pela pessoa: nada vem pré-definido nem marcado como feito.
 * Listas: compras, desejos, coisas a fazer e melhorias de vida, por categoria e área.
 * O personagem é o robozinho da Visão geral: ganha equipamento conforme o nível (intervalo configurável).
 * Usa os dados de vida.js (tabelas jogo_habitos, jogo_tarefas, jogo_checks, jogo_personagem e lista_itens).
 */

const jogo = { editandoHabito: null, editandoTarefa: null, editandoItem: null, filtroCategoria: "", filtroArea: "" };
const CATEGORIAS_SUGERIDAS = ["Compras", "Desejos", "Coisas a fazer", "Melhorias de vida"];
const xpFmt = (n) => new Intl.NumberFormat("pt-BR").format(n);
const comparar = (a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/* Nível: cada nível pede 100 XP a mais que o anterior (2 → 100, 3 → 300, 4 → 600, 5 → 1.000…). */
const xpDoNivel = (n) => 50 * n * (n - 1);
function nivelDe(xp) {
  let n = 1;
  while (xp >= xpDoNivel(n + 1)) n++;
  return { n, inicio: xpDoNivel(n), proximo: xpDoNivel(n + 1) };
}

const xpTotal = () => vida.jogo_checks.reduce((t, c) => t + (Number(c.xp) || 0), 0);
const checksDoDia = (dia) => vida.jogo_checks.filter((c) => c.data === dia);
const checksHabitoHoje = (h) => vida.jogo_checks.filter((c) => c.habitoId === h.id && c.data === hojeDia());
const inteiro = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/* ---------- Placar ---------- */

function renderizarPlacar() {
  const hoje = hojeDia();
  const total = xpTotal();
  const { n, inicio, proximo } = nivelDe(total);
  const pct = Math.round(((total - inicio) / (proximo - inicio)) * 100);
  document.getElementById("jogo-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hoje)));
  document.getElementById("jogo-nivel").innerHTML = `
    <div class="jogo-nivel-topo"><span class="jogo-nivel-selo">Nível ${n}</span> <strong>${xpFmt(total)} XP</strong></div>
    <div class="jogo-barra" role="progressbar" aria-label="Progresso até o nível ${n + 1}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    <small>${xpFmt(proximo - total)} XP para o nível ${n + 1}</small>`;
  renderizarPersonagem(n);
  const deHoje = checksDoDia(hoje);
  const semana = inicioSemana(hoje);
  const xpSemana = vida.jogo_checks.filter((c) => c.data >= semana && c.data <= hoje).reduce((t, c) => t + (Number(c.xp) || 0), 0);
  const ativos = vida.jogo_habitos.filter((h) => h.ativo !== false);
  const metaHoje = ativos.reduce((t, h) => t + Number(h.vezesDia || 1), 0);
  const feitosHoje = ativos.reduce((t, h) => t + Math.min(checksHabitoHoje(h).length, Number(h.vezesDia || 1)), 0);
  document.getElementById("jogo-numeros").innerHTML = `
    <div class="shark-numero"><span>XP hoje</span> <strong>${xpFmt(deHoje.reduce((t, c) => t + (Number(c.xp) || 0), 0))}</strong> <small>${deHoje.length} check${deHoje.length === 1 ? "" : "s"}</small></div>
    <div class="shark-numero"><span>XP na semana</span> <strong>${xpFmt(xpSemana)}</strong> <small>desde segunda</small></div>
    <div class="shark-numero"><span>Checklist de hoje</span> <strong>${feitosHoje}/${metaHoje}</strong> <small>${ativos.length} hábito${ativos.length === 1 ? "" : "s"}</small></div>
    <div class="shark-numero"><span>Coisas a fazer</span> <strong>${vida.jogo_tarefas.filter((t) => !t.feitaEm).length}</strong> <small>pendentes</small></div>`;
}

/* ---------- Personagem (o robozinho da Visão geral) ----------
 * Começa sem armadura e ganha uma peça de equipamento a cada N níveis. N é escolhido pela
 * pessoa (tabela jogo_personagem); enquanto não for definido, o robô fica sem armadura. */

const EQUIPAMENTOS = ["Sem armadura", "Capacete", "Ombreiras", "Peitoral", "Escudo", "Espada"];
const PECAS_SVG = [
  "",
  `<g class="equip equip-capacete"><path d="M26 33 Q26 13 60 13 Q94 13 94 33 Z"/><rect x="24" y="30" width="72" height="5" rx="2.5"/></g>`,
  `<g class="equip equip-ombreiras"><path d="M22 80 Q22 66 38 68 L40 78 Z"/><path d="M98 66 Q98 58 86 60 L82 70 Z"/></g>`,
  `<g class="equip equip-peitoral"><rect x="42" y="72" width="36" height="22" rx="8"/><circle cx="60" cy="83" r="5" class="mascote-coracao"/></g>`,
  `<g class="equip equip-escudo"><path d="M10 76 H34 V88 Q34 101 22 106 Q10 101 10 88 Z"/><path d="M22 80 V102" class="equip-detalhe"/></g>`,
  `<g class="equip equip-espada"><rect x="96" y="14" width="5" height="34" rx="2"/><rect x="90" y="46" width="17" height="4" rx="2"/><rect x="96.5" y="50" width="4" height="8" rx="2"/></g>`,
];

const configPersonagem = () => vida.jogo_personagem[0] || null;
function estagioDe(nivel) {
  const n = Number(configPersonagem()?.niveisPorEstagio);
  if (!(n >= 1)) return 0;
  return Math.min(Math.floor(nivel / n), EQUIPAMENTOS.length - 1);
}

function personagemSvg(estagio) {
  if (typeof MASCOTE_SVG !== "string") return "";
  const pecas = PECAS_SVG.slice(1, estagio + 1).join("");
  const fim = MASCOTE_SVG.lastIndexOf("</g>");
  return (MASCOTE_SVG.slice(0, fim) + pecas + MASCOTE_SVG.slice(fim)).replace('class="mascote"', `class="mascote mascote-estagio-${estagio}"`);
}

function renderizarPersonagem(nivel) {
  const estagio = estagioDe(nivel);
  const el = document.getElementById("jogo-personagem");
  if (el.dataset.estagio !== String(estagio)) {
    el.innerHTML = personagemSvg(estagio);
    el.dataset.estagio = String(estagio);
  }
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `Personagem no nível ${nivel}: ${EQUIPAMENTOS.slice(1, estagio + 1).join(", ") || "sem armadura"}`);
  const n = Number(configPersonagem()?.niveisPorEstagio);
  const eq = document.getElementById("jogo-equipamento");
  if (!(n >= 1)) eq.textContent = "Sem armadura. Defina abaixo de quantos em quantos níveis o robô ganha equipamento.";
  else {
    const tem = EQUIPAMENTOS.slice(1, estagio + 1);
    const proxima = estagio < EQUIPAMENTOS.length - 1 ? ` · ${EQUIPAMENTOS[estagio + 1]} no nível ${(estagio + 1) * n}` : " · equipamento completo";
    eq.textContent = (tem.length ? `Equipado: ${tem.join(", ")}` : "Sem armadura") + proxima;
  }
  const campo = document.getElementById("jogo-niveis-estagio");
  if (document.activeElement !== campo) campo.value = n >= 1 ? n : "";
}

async function salvarEvolucao(e) {
  e.preventDefault();
  const valor = e.target.elements.niveis.value.trim();
  const n = valor === "" ? null : inteiro(valor, 1, 100);
  if (valor !== "" && n == null) { avisoRotina("jogo-evolucao-aviso", "Use um número inteiro de 1 a 100 (ou deixe vazio)."); return e.target.elements.niveis.focus(); }
  try {
    await vida.arm.jogo_personagem.salvar(configPersonagem()?.id || null, { niveisPorEstagio: n });
    avisoRotina("jogo-evolucao-aviso", "");
    e.target.elements.niveis.blur();
  } catch { avisoRotina("jogo-evolucao-aviso", "Não foi possível salvar. Tente de novo."); }
}

/* ---------- Checklist do dia (hábitos) ---------- */

function linhaHabitoJogo(h) {
  const vezes = Number(h.vezesDia || 1);
  const feitos = checksHabitoHoje(h).length;
  const completo = feitos >= vezes;
  const pontos = Array.from({ length: vezes }, (_, i) => `<i class="${i < feitos ? "cheio" : ""}"></i>`).join("");
  return `
    <li class="jogo-habito${completo ? " completo" : ""}" data-jogo-habito="${escapar(h.id)}">
      <div class="jogo-habito-texto">
        <strong>${escapar(h.nome)}</strong>
        <small>${feitos}/${vezes} hoje · ${xpFmt(h.xp)} XP por check</small>
        <span class="jogo-pontos" aria-hidden="true">${pontos}</span>
      </div>
      <div class="jogo-habito-acoes">
        <button type="button" class="botao primario jogo-check" data-jogo-acao="check" ${completo ? "disabled" : ""} aria-label="Check: ${escapar(h.nome)} (+${h.xp} XP)">${completo ? "Feito ✓" : `✓ +${xpFmt(h.xp)} XP`}</button>
        ${feitos ? `<button type="button" class="botao mini" data-jogo-acao="desfazer" aria-label="Desfazer o último check de ${escapar(h.nome)}">Desfazer</button>` : ""}
        <button type="button" class="botao mini" data-jogo-acao="editar" aria-label="Editar ${escapar(h.nome)}">Editar</button>
        <button type="button" class="botao mini" data-jogo-acao="excluir" aria-label="Excluir ${escapar(h.nome)}">×</button>
      </div>
    </li>`;
}

function renderizarChecklist() {
  const ativos = vida.jogo_habitos.filter((h) => h.ativo !== false).sort((a, b) => comparar(a.nome, b.nome));
  document.getElementById("jogo-habitos").innerHTML = ativos.map(linhaHabitoJogo).join("");
  document.getElementById("jogo-habitos-vazio").hidden = ativos.length > 0;
  const completos = ativos.filter((h) => checksHabitoHoje(h).length >= Number(h.vezesDia || 1)).length;
  document.getElementById("jogo-checklist-resumo").textContent = ativos.length ? `${completos} de ${ativos.length} completos hoje` : "";
}

async function checarHabito(h) {
  if (checksHabitoHoje(h).length >= Number(h.vezesDia || 1)) return;
  await vida.arm.jogo_checks.salvar(null, { habitoId: h.id, tarefaId: null, data: hojeDia(), xp: Number(h.xp), descricao: h.nome });
  const feitos = checksHabitoHoje(h).length + 1;
  avisoVida(feitos >= Number(h.vezesDia || 1) ? `${h.nome}: completo hoje! +${h.xp} XP` : `+${h.xp} XP`, "acerto");
}

async function desfazerCheck(h) {
  const ultimo = checksHabitoHoje(h).at(-1);
  if (ultimo) await vida.arm.jogo_checks.excluir(ultimo.id);
}

function abrirFormularioHabitoJogo(h) {
  const form = document.getElementById("jogo-habito-form");
  form.reset();
  jogo.editandoHabito = h?.id || null;
  document.getElementById("jogo-habito-form-titulo").textContent = h ? "Editar hábito" : "Novo hábito";
  if (h) {
    form.elements.nome.value = h.nome;
    form.elements.vezesDia.value = h.vezesDia;
    form.elements.xp.value = h.xp;
  }
  form.hidden = false;
  document.getElementById("jogo-habito-adicionar").hidden = true;
  form.elements.nome.focus();
}

function fecharFormularioHabitoJogo() {
  document.getElementById("jogo-habito-form").hidden = true;
  document.getElementById("jogo-habito-adicionar").hidden = false;
  jogo.editandoHabito = null;
  avisoRotina("jogo-habito-aviso", "");
}

async function salvarHabitoJogo(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  const vezesDia = inteiro(f.vezesDia.value, 1, 20);
  const xp = inteiro(f.xp.value, 1, 1000);
  if (!nome) { avisoRotina("jogo-habito-aviso", "Dê um nome ao hábito."); return f.nome.focus(); }
  if (vezesDia == null) { avisoRotina("jogo-habito-aviso", "Vezes por dia: um número inteiro de 1 a 20."); return f.vezesDia.focus(); }
  if (xp == null) { avisoRotina("jogo-habito-aviso", "XP por check: um número inteiro de 1 a 1000."); return f.xp.focus(); }
  const atual = vida.jogo_habitos.find((h) => h.id === jogo.editandoHabito);
  try {
    await vida.arm.jogo_habitos.salvar(jogo.editandoHabito, { nome, vezesDia, xp, ativo: atual ? atual.ativo !== false : true });
    fecharFormularioHabitoJogo();
  } catch { avisoRotina("jogo-habito-aviso", "Não foi possível salvar. Tente de novo."); }
}

function ligarChecklist() {
  document.getElementById("jogo-habitos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-jogo-acao]");
    if (!b) return;
    const h = vida.jogo_habitos.find((x) => x.id === b.closest("[data-jogo-habito]").dataset.jogoHabito);
    if (!h) return;
    const acao = b.dataset.jogoAcao;
    if (acao === "editar") return abrirFormularioHabitoJogo(h);
    // Excluir o hábito não apaga os checks: o XP já ganho continua no total.
    if (acao === "excluir" && !confirmar(b, "Excluir?")) return;
    b.disabled = true;
    try {
      if (acao === "check") await checarHabito(h);
      else if (acao === "desfazer") await desfazerCheck(h);
      else if (acao === "excluir") await vida.arm.jogo_habitos.excluir(h.id);
    } catch {
      avisoVida("Não foi possível salvar. Tente de novo.", "erro");
      b.disabled = false;
    }
  });
  document.getElementById("jogo-habito-adicionar").addEventListener("click", () => abrirFormularioHabitoJogo(null));
  document.getElementById("jogo-habito-cancelar").addEventListener("click", fecharFormularioHabitoJogo);
  document.getElementById("jogo-habito-form").addEventListener("submit", salvarHabitoJogo);
}

/* ---------- Coisas a fazer ---------- */

function linhaTarefaJogo(t) {
  return `
    <li class="afazer${t.feitaEm ? " feito" : ""}" data-jogo-tarefa="${escapar(t.id)}">
      <input type="checkbox" data-jogo-tarefa-feita ${t.feitaEm ? "checked" : ""} aria-label="Feita: ${escapar(t.titulo)}">
      <span class="afazer-texto"><span>${escapar(t.titulo)}</span> <small>${t.feitaEm ? `feita ${dataBR(t.feitaEm).slice(0, 5)} · ` : ""}${xpFmt(t.xp)} XP</small></span>
      <span class="chip-xp">+${xpFmt(t.xp)} XP</span>
      <span class="afazer-acoes">
        <button type="button" class="botao mini" data-jogo-tarefa-acao="editar" aria-label="Editar ${escapar(t.titulo)}">Editar</button>
        <button type="button" class="botao mini" data-jogo-tarefa-acao="excluir" aria-label="Excluir ${escapar(t.titulo)}">×</button>
      </span>
    </li>`;
}

function renderizarTarefasJogo() {
  const pend = vida.jogo_tarefas.filter((t) => !t.feitaEm);
  const feitas = vida.jogo_tarefas.filter((t) => t.feitaEm).sort((a, b) => b.feitaEm.localeCompare(a.feitaEm));
  document.getElementById("jogo-tarefas").innerHTML = pend.map(linhaTarefaJogo).join("");
  document.getElementById("jogo-tarefas-vazio").hidden = vida.jogo_tarefas.length > 0;
  document.getElementById("jogo-tarefas-resumo").textContent = vida.jogo_tarefas.length ? `${pend.length} pendente${pend.length === 1 ? "" : "s"}` : "";
  const det = document.getElementById("jogo-tarefas-feitas");
  det.hidden = !feitas.length;
  document.getElementById("jogo-tarefas-feitas-titulo").textContent = `Feitas (${feitas.length})`;
  document.getElementById("jogo-tarefas-feitas-lista").innerHTML = feitas.map(linhaTarefaJogo).join("");
}

/* Concluir grava a data e um check com o XP; reabrir tira o check (e o XP) dessa tarefa. */
async function concluirTarefaJogo(t, feita) {
  const { id, ...dados } = t;
  if (feita) {
    await vida.arm.jogo_tarefas.salvar(id, { ...dados, feitaEm: hojeDia() });
    if (!vida.jogo_checks.some((c) => c.tarefaId === id)) {
      await vida.arm.jogo_checks.salvar(null, { habitoId: null, tarefaId: id, data: hojeDia(), xp: Number(t.xp), descricao: t.titulo });
    }
    avisoVida(`Feito! +${t.xp} XP`, "acerto");
  } else {
    await vida.arm.jogo_tarefas.salvar(id, { ...dados, feitaEm: null });
    for (const c of vida.jogo_checks.filter((x) => x.tarefaId === id)) await vida.arm.jogo_checks.excluir(c.id);
  }
}

function limparFormularioTarefaJogo() {
  const form = document.getElementById("jogo-tarefa-form");
  form.reset();
  jogo.editandoTarefa = null;
  document.getElementById("jogo-tarefa-salvar").textContent = "Adicionar";
  document.getElementById("jogo-tarefa-cancelar").hidden = true;
  avisoRotina("jogo-tarefa-aviso", "");
}

async function salvarTarefaJogo(e) {
  e.preventDefault();
  const f = e.target.elements;
  const titulo = f.titulo.value.trim();
  const xp = inteiro(f.xp.value, 1, 1000);
  if (!titulo) { avisoRotina("jogo-tarefa-aviso", "Escreva o que precisa ser feito."); return f.titulo.focus(); }
  if (xp == null) { avisoRotina("jogo-tarefa-aviso", "XP: um número inteiro de 1 a 1000."); return f.xp.focus(); }
  const atual = vida.jogo_tarefas.find((t) => t.id === jogo.editandoTarefa);
  try {
    await vida.arm.jogo_tarefas.salvar(jogo.editandoTarefa, { titulo, xp, feitaEm: atual?.feitaEm || null });
    limparFormularioTarefaJogo();
    f.titulo.focus();
  } catch { avisoRotina("jogo-tarefa-aviso", "Não foi possível salvar. Tente de novo."); }
}

function ligarTarefasJogo() {
  document.getElementById("jogo-tarefa-form").addEventListener("submit", salvarTarefaJogo);
  document.getElementById("jogo-tarefa-cancelar").addEventListener("click", limparFormularioTarefaJogo);
  for (const id of ["jogo-tarefas", "jogo-tarefas-feitas-lista"]) {
    const raiz = document.getElementById(id);
    raiz.addEventListener("change", async (e) => {
      if (!e.target.matches("[data-jogo-tarefa-feita]")) return;
      const t = vida.jogo_tarefas.find((x) => x.id === e.target.closest("[data-jogo-tarefa]").dataset.jogoTarefa);
      e.target.disabled = true;
      try { await concluirTarefaJogo(t, e.target.checked); } catch { e.target.checked = !e.target.checked; e.target.disabled = false; avisoVida("Não foi possível salvar. Tente de novo.", "erro"); }
    });
    raiz.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-jogo-tarefa-acao]");
      if (!b) return;
      const t = vida.jogo_tarefas.find((x) => x.id === b.closest("[data-jogo-tarefa]").dataset.jogoTarefa);
      if (b.dataset.jogoTarefaAcao === "editar") {
        const f = document.getElementById("jogo-tarefa-form").elements;
        jogo.editandoTarefa = t.id;
        f.titulo.value = t.titulo;
        f.xp.value = t.xp;
        document.getElementById("jogo-tarefa-salvar").textContent = "Salvar";
        document.getElementById("jogo-tarefa-cancelar").hidden = false;
        return f.titulo.focus();
      }
      if (!confirmar(b, "Excluir?")) return;
      b.disabled = true;
      // Excluir não apaga o check de uma tarefa já feita: o XP ganho continua no total.
      try { await vida.arm.jogo_tarefas.excluir(t.id); } catch { b.disabled = false; }
    });
  }
}

/* ---------- Listas (compras, desejos, coisas a fazer, melhorias de vida) ---------- */

function linhaItemLista(i) {
  const sub = [i.area ? `📍 ${i.area}` : "", i.dataItem ? dataBR(i.dataItem) : "", i.concluidoEm ? `concluído ${dataBR(i.concluidoEm).slice(0, 5)}` : ""].filter(Boolean);
  return `
    <li class="afazer lista-item${i.concluidoEm ? " feito" : ""}" data-lista-item="${escapar(i.id)}">
      <input type="checkbox" data-lista-concluido ${i.concluidoEm ? "checked" : ""} aria-label="Concluído: ${escapar(i.item)}">
      <span class="afazer-texto"><span>${escapar(i.item)}</span>${sub.length ? ` <small>${sub.map(escapar).join(" · ")}</small>` : ""}${i.observacoes ? `<small class="lista-obs">${escapar(i.observacoes)}</small>` : ""}</span>
      <span class="afazer-acoes">
        <button type="button" class="botao mini" data-lista-acao="editar" aria-label="Editar ${escapar(i.item)}">Editar</button>
        <button type="button" class="botao mini" data-lista-acao="excluir" aria-label="Excluir ${escapar(i.item)}">×</button>
      </span>
    </li>`;
}

const chips = (lista, atual, attr) => lista.map(([v, n]) => `<button type="button" class="chip-filtro${atual === v ? " ativo" : ""}" ${attr}="${escapar(v)}" aria-pressed="${atual === v}">${escapar(n)}</button>`).join("");

function renderizarListas() {
  const itens = vida.lista_itens;
  const categorias = [...new Set(itens.map((i) => i.categoria))].sort(comparar);
  const areas = [...new Set(itens.map((i) => i.area).filter(Boolean))].sort(comparar);
  if (jogo.filtroCategoria && !categorias.includes(jogo.filtroCategoria)) jogo.filtroCategoria = "";
  if (jogo.filtroArea && !areas.includes(jogo.filtroArea)) jogo.filtroArea = "";

  document.getElementById("lista-categorias").innerHTML = [...new Set([...CATEGORIAS_SUGERIDAS, ...categorias])].map((c) => `<option value="${escapar(c)}"></option>`).join("");
  document.getElementById("lista-areas").innerHTML = areas.map((a) => `<option value="${escapar(a)}"></option>`).join("");
  document.getElementById("listas-filtro-categoria").innerHTML = categorias.length > 1 ? chips([["", "Todas"], ...categorias.map((c) => [c, c])], jogo.filtroCategoria, "data-filtro-categoria") : "";
  document.getElementById("listas-filtro-area").innerHTML = areas.length ? chips([["", "Todas as áreas"], ...areas.map((a) => [a, `📍 ${a}`])], jogo.filtroArea, "data-filtro-area") : "";

  const passa = (i) => (!jogo.filtroCategoria || i.categoria === jogo.filtroCategoria) && (!jogo.filtroArea || i.area === jogo.filtroArea);
  const visiveis = itens.filter(passa);
  const abertos = visiveis.filter((i) => !i.concluidoEm);
  const concluidos = visiveis.filter((i) => i.concluidoEm).sort((a, b) => b.concluidoEm.localeCompare(a.concluidoEm));

  // Agrupa por categoria; dentro dela, por área (itens sem área no fim).
  const porArea = (a, b) => (a.area ? 0 : 1) - (b.area ? 0 : 1) || comparar(a.area || "", b.area || "") || comparar(a.item, b.item);
  document.getElementById("listas-grupos").innerHTML = categorias
    .map((c) => {
      const lista = abertos.filter((i) => i.categoria === c).sort(porArea);
      return lista.length ? `<div class="grupo-tarefas"><h3>${escapar(c)} <span>${lista.length}</span></h3><ul class="tarefas lista-itens">${lista.map(linhaItemLista).join("")}</ul></div>` : "";
    })
    .join("");
  document.getElementById("listas-vazio").hidden = itens.length > 0;
  const det = document.getElementById("listas-concluidos");
  det.hidden = !concluidos.length;
  document.getElementById("listas-concluidos-titulo").textContent = `Concluídos (${concluidos.length})`;
  document.getElementById("listas-concluidos-lista").innerHTML = concluidos.map(linhaItemLista).join("");
  const pend = itens.filter((i) => !i.concluidoEm).length;
  document.getElementById("listas-resumo").textContent = itens.length ? `${pend} em aberto · ${categorias.length} categoria${categorias.length === 1 ? "" : "s"}` : "";
}

function limparFormularioLista() {
  const form = document.getElementById("lista-form");
  form.reset();
  jogo.editandoItem = null;
  document.getElementById("titulo-lista-form").textContent = "Novo item";
  document.getElementById("lista-salvar").textContent = "Adicionar";
  document.getElementById("lista-cancelar").hidden = true;
  avisoRotina("lista-aviso", "");
}

async function salvarItemLista(e) {
  e.preventDefault();
  const f = e.target.elements;
  const item = f.texto.value.trim();
  const categoria = f.categoria.value.trim();
  if (!item) { avisoRotina("lista-aviso", "Escreva o item."); return f.texto.focus(); }
  if (!categoria) { avisoRotina("lista-aviso", "Escolha ou escreva uma categoria."); return f.categoria.focus(); }
  const atual = vida.lista_itens.find((i) => i.id === jogo.editandoItem);
  const ultimaCategoria = categoria;
  try {
    await vida.arm.lista_itens.salvar(jogo.editandoItem, {
      item, categoria,
      area: f.area.value.trim() || null,
      observacoes: f.observacoes.value.trim() || null,
      dataItem: f.dataItem.value || null,
      concluidoEm: atual?.concluidoEm || null,
    });
    const editando = !!jogo.editandoItem;
    limparFormularioLista();
    // Ao adicionar vários seguidos, a categoria fica para o próximo item.
    if (!editando) f.categoria.value = ultimaCategoria;
    f.texto.focus();
  } catch { avisoRotina("lista-aviso", "Não foi possível salvar. Tente de novo."); }
}

function ligarListas() {
  document.getElementById("lista-form").addEventListener("submit", salvarItemLista);
  document.getElementById("lista-cancelar").addEventListener("click", limparFormularioLista);
  document.getElementById("listas-filtro-categoria").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro-categoria]");
    if (b) { jogo.filtroCategoria = b.dataset.filtroCategoria; renderizarListas(); }
  });
  document.getElementById("listas-filtro-area").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro-area]");
    if (b) { jogo.filtroArea = b.dataset.filtroArea; renderizarListas(); }
  });
  for (const id of ["listas-grupos", "listas-concluidos-lista"]) {
    const raiz = document.getElementById(id);
    raiz.addEventListener("change", async (e) => {
      if (!e.target.matches("[data-lista-concluido]")) return;
      const it = vida.lista_itens.find((x) => x.id === e.target.closest("[data-lista-item]").dataset.listaItem);
      const { id: itemId, ...dados } = it;
      e.target.disabled = true;
      try { await vida.arm.lista_itens.salvar(itemId, { ...dados, concluidoEm: e.target.checked ? hojeDia() : null }); }
      catch { e.target.checked = !e.target.checked; e.target.disabled = false; avisoVida("Não foi possível salvar. Tente de novo.", "erro"); }
    });
    raiz.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-lista-acao]");
      if (!b) return;
      const it = vida.lista_itens.find((x) => x.id === b.closest("[data-lista-item]").dataset.listaItem);
      if (b.dataset.listaAcao === "editar") {
        const f = document.getElementById("lista-form").elements;
        jogo.editandoItem = it.id;
        f.texto.value = it.item;
        f.categoria.value = it.categoria;
        f.area.value = it.area || "";
        f.dataItem.value = it.dataItem || "";
        f.observacoes.value = it.observacoes || "";
        document.getElementById("titulo-lista-form").textContent = "Editar item";
        document.getElementById("lista-salvar").textContent = "Salvar";
        document.getElementById("lista-cancelar").hidden = false;
        f.texto.scrollIntoView({ block: "center" });
        return f.texto.focus();
      }
      if (!confirmar(b, "Excluir?")) return;
      b.disabled = true;
      try { await vida.arm.lista_itens.excluir(it.id); } catch { b.disabled = false; }
    });
  }
}

/* ---------- Início ---------- */

function renderizarJogo() {
  if (!document.getElementById("jogo-habitos")) return;
  renderizarPlacar();
  renderizarChecklist();
  renderizarTarefasJogo();
  renderizarListas();
}

function iniciarJogo() {
  if (!document.getElementById("jogo-habitos")) return;
  document.getElementById("jogo-evolucao-form").addEventListener("submit", salvarEvolucao);
  ligarChecklist();
  ligarTarefasJogo();
  ligarListas();
  vida.renders.push(renderizarJogo);
}

iniciarJogo();

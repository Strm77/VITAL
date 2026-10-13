/* ---------- Saúde › Bem-estar ----------
 * Sono (horas e qualidade), água, humor/energia/estresse do check-in diário, hábitos de
 * autocuidado e consultas/exames preventivos. Usa os dados de vida.js e as metas de saude.js.
 */

const metasBemEstar = () => tentar(() => metasSaude(), { metaAgua: 8, metaSono: 8, treinosSemana: 3, minutosSemana: 150, acertoAlimentacao: 80 });

/* Barras de 14 dias com a linha da meta (sono e água). */
function barrasDias(el, { valores, meta, rotulo, formato }) {
  const hoje = hojeDia();
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i - 13));
  const maior = Math.max(meta * 1.25, ...valores.map((v) => v || 0), 1);
  el.setAttribute("aria-label", `${rotulo} nos últimos 14 dias: ` + dias.map((d, i) => `${dataBR(d).slice(0, 5)} ${valores[i] != null ? formato(valores[i]) : "sem registro"}`).join("; "));
  el.innerHTML = `
    <div class="barras-area">
      <span class="barras-meta" style="bottom:${(meta / maior) * 100}%"></span>
      ${dias.map((d, i) => {
        const v = valores[i];
        return `<div class="barra-dia${d === hoje ? " hoje" : ""}" title="${diaCurto(d)}: ${v != null ? formato(v) : "sem registro"}">
          <span class="barra-dia-valor">${v != null && (i % 2 === 1 || d === hoje) ? formato(v) : ""}</span>
          <span class="barra-dia-barra ${v != null && v >= meta ? "bateu" : "nao-bateu"}" style="height:${v != null ? (v / maior) * 100 : 0}%"></span>
        </div>`;
      }).join("")}
    </div>
    <div class="barras-rotulos">${dias.map((d) => `<span>${d === hoje ? "hoje" : DIAS_SEMANA_CURTOS[paraData(d).getDay()].slice(0, 1)}</span>`).join("")}</div>`;
}

function renderizarBemEstar() {
  if (!document.getElementById("sono-grafico")) return;
  const hoje = hojeDia();
  const c = checkinDe(hoje) || {};
  const metas = metasBemEstar();
  document.getElementById("bemestar-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hoje)));

  // Sono e água de hoje
  const sono = document.getElementById("sono-horas");
  if (document.activeElement !== sono) sono.value = c.sonoHoras ?? "";
  document.querySelector('[data-escala="sonoQualidade"]').innerHTML = escalaHtml("sonoQualidade", c.sonoQualidade, "");
  const copos = Number(c.aguaCopos) || 0;
  document.getElementById("agua-copos").textContent = copos;
  document.getElementById("agua-meta").textContent = `de ${metas.metaAgua} copos${copos >= metas.metaAgua ? " ✓" : ""}`;
  document.getElementById("copos").innerHTML = Array.from({ length: Math.max(metas.metaAgua, copos) }, (_, i) => `<span class="${i < copos ? "cheio" : ""}"></span>`).join("");

  // Gráficos de 14 dias
  const dias = Array.from({ length: 14 }, (_, i) => somarDias(hoje, i - 13));
  const sonos = dias.map((d) => (checkinDe(d)?.sonoHoras != null ? Number(checkinDe(d).sonoHoras) : null));
  const aguas = dias.map((d) => (checkinDe(d)?.aguaCopos != null ? Number(checkinDe(d).aguaCopos) : null));
  const media = (l) => { const v = l.filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; };
  const fmtHoras = (h) => duracao(h * 60);
  barrasDias(document.getElementById("sono-grafico"), { valores: sonos, meta: metas.metaSono, rotulo: "Horas de sono", formato: fmtHoras });
  barrasDias(document.getElementById("agua-grafico"), { valores: aguas, meta: metas.metaAgua, rotulo: "Copos de água", formato: (n) => String(n) });
  const ms = media(sonos), ma = media(aguas);
  const noitesMeta = sonos.filter((v) => v != null && v >= metas.metaSono).length;
  document.getElementById("sono-resumo").textContent = ms != null ? `média ${fmtHoras(ms)} · meta ${fmtHoras(metas.metaSono)} · ${noitesMeta} noite${noitesMeta === 1 ? "" : "s"} na meta` : `meta ${fmtHoras(metas.metaSono)} por noite`;
  document.getElementById("agua-resumo").textContent = ma != null ? `média ${umaCasa(ma)} copos · meta ${metas.metaAgua}` : `meta ${metas.metaAgua} copos por dia`;

  // Humor, energia e estresse
  const linhas = [
    { campo: "humor", nome: "Humor", dica: "maior é melhor", rotulo: (v) => HUMORES[v - 1].n },
    { campo: "energia", nome: "Energia", dica: "maior é melhor", rotulo: (v) => ROTULOS_ESCALA.energia[v - 1] },
    { campo: "estresse", nome: "Estresse", dica: "menor é melhor", rotulo: (v) => ROTULOS_ESCALA.estresse[v - 1] },
  ];
  document.getElementById("humor-grafico").innerHTML = linhas.map((l) => {
    const valores = dias.map((d) => checkinDe(d)?.[l.campo] ?? null);
    const m = media(valores);
    return `
      <div class="linha-humor" role="img" aria-label="${l.nome} nos últimos 14 dias${m != null ? `, média ${umaCasa(m)} de 5` : ""}">
        <span class="linha-humor-nome">${l.nome} <small>${m != null ? `média ${umaCasa(m)}/5` : l.dica}</small></span>
        <span class="linha-humor-dias">${dias.map((d, i) => `<span class="ponto-humor${l.campo === "estresse" ? " estresse" : ""}" title="${diaCurto(d)}: ${valores[i] ? l.rotulo(valores[i]) : "sem registro"}"><i style="height:${valores[i] ? valores[i] * 20 : 0}%"></i></span>`).join("")}</span>
      </div>`;
  }).join("");

  renderizarAutocuidado();
  renderizarConsultas();
  const form = document.getElementById("bemestar-metas-form");
  if (!form.contains(document.activeElement)) {
    form.elements.metaAgua.value = metas.metaAgua;
    form.elements.metaSono.value = metas.metaSono;
  }
}

function renderizarAutocuidado() {
  const hoje = hojeDia();
  const semana = inicioSemana(hoje);
  const habitos = habitosAtivos().filter((h) => h.autocuidado);
  document.getElementById("autocuidado-vazio").hidden = habitos.length > 0;
  document.getElementById("autocuidado").innerHTML = habitos.map((h) => {
    const feitos = feitosNaSemana(h, semana);
    const seq = sequenciaHabito(h);
    return `
      <li class="habito-hoje${feitoNoDia(h, hoje) ? " feito" : ""}">
        <label><input type="checkbox" data-habito-hoje="${escapar(h.id)}" ${feitoNoDia(h, hoje) ? "checked" : ""}> <span>${escapar(h.icone || "🌿")} ${escapar(h.nome)}</span></label>
        <span class="sub">${Number(h.vezesSemana) >= 7 ? "todo dia" : `${feitos}/${h.vezesSemana} na semana`}${seq.n ? ` · 🔥 ${seq.n} ${seq.unidade}` : ""}</span>
        <span class="semana-pontos" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => somarDias(semana, i)).map((d) => `<i class="${feitoNoDia(h, d) ? "ok" : d > hoje ? "futuro" : ""}"></i>`).join("")}</span>
      </li>`;
  }).join("");
}

const TIPOS_COMPROMISSO = { compromisso: "Compromisso", consulta: "Consulta", exame: "Exame" };

function linhaCompromisso(c, { acoes = true } = {}) {
  const hoje = hojeDia();
  const atrasado = !c.feito && c.data < hoje;
  return `
    <li class="compromisso${c.feito ? " feito" : ""}${atrasado ? " atrasado" : ""} tipo-${c.tipo}" data-compromisso="${escapar(c.id)}">
      <span class="compromisso-data"><strong>${diaCurto(c.data)}</strong>${c.hora ? ` <small>${c.hora}</small>` : ""}</span>
      <span class="compromisso-texto"><span>${c.tipo !== "compromisso" ? "🩺 " : ""}${escapar(c.titulo)}</span>
        <small>${[TIPOS_COMPROMISSO[c.tipo], c.local, c.recorrenciaMeses ? `repete a cada ${c.recorrenciaMeses} ${c.recorrenciaMeses == 1 ? "mês" : "meses"}` : "", atrasado ? "atrasado" : c.feito ? "feito" : relativo(c.data)].filter(Boolean).map(escapar).join(" · ")}</small></span>
      ${acoes ? `<span class="compromisso-acoes">
        <button type="button" class="botao mini${c.feito ? "" : " primario"}" data-compromisso-acao="feito">${c.feito ? "Desfazer" : "Feito"}</button>
        <button type="button" class="botao mini" data-compromisso-acao="editar">Editar</button>
        <button type="button" class="botao mini" data-compromisso-acao="excluir">Excluir</button>
      </span>` : ""}
    </li>`;
}

/* Ações dos compromissos (usado em Bem-estar e na Agenda). */
function ligarCompromissos(raiz) {
  raiz.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-compromisso-acao]");
    if (!b) return;
    const c = vida.compromissos.find((x) => x.id === b.closest("[data-compromisso]").dataset.compromisso);
    if (!c) return;
    const acao = b.dataset.compromissoAcao;
    if (acao === "editar") return irPara("#rotina-agenda", () => abrirFormularioCompromisso(c.id));
    if (acao === "excluir" && b.dataset.confirmar !== "sim") { b.dataset.confirmar = "sim"; b.textContent = "Confirmar"; b.classList.add("perigo"); return; }
    b.disabled = true;
    try {
      if (acao === "feito") await concluirCompromisso(c, !c.feito);
      else await vida.arm.compromissos.excluir(c.id);
    } catch { b.disabled = false; avisoVida("Não foi possível salvar.", "erro"); }
  });
}

function renderizarConsultas() {
  const hoje = hojeDia();
  const lista = vida.compromissos.filter((c) => c.tipo !== "compromisso")
    .filter((c) => !c.feito || c.data >= somarDias(hoje, -30))
    .sort((a, b) => Number(a.feito) - Number(b.feito) || a.data.localeCompare(b.data));
  document.getElementById("consultas-vazio").hidden = lista.length > 0;
  document.getElementById("consultas").innerHTML = lista.map((c) => linhaCompromisso(c)).join("");
}

async function mudarAgua(delta) {
  const metas = metasBemEstar();
  const atual = Number(checkinDe(hojeDia())?.aguaCopos) || 0;
  const novo = Math.max(0, Math.min(40, atual + delta));
  try {
    await salvarCheckin({ aguaCopos: novo });
    if (delta > 0 && novo === metas.metaAgua) { avisoVida("💧 Meta de água do dia batida!", "acerto"); tentar(() => confete()); }
  } catch { avisoVida("Não foi possível salvar.", "erro"); }
}

async function salvarMetasBemEstar(e) {
  e.preventDefault();
  const f = e.target.elements;
  const metaAgua = Math.round(Number(f.metaAgua.value));
  const metaSono = Number(String(f.metaSono.value).replace(",", "."));
  if (!(metaAgua >= 1 && metaAgua <= 30)) return avisoVida("Meta de água: de 1 a 30 copos.", "erro");
  if (!(metaSono >= 4 && metaSono <= 12)) return avisoVida("Meta de sono: de 4 a 12 horas.", "erro");
  const m = metasBemEstar();
  const { id, ...atual } = sau.objetivos[0] || {};
  try {
    document.activeElement?.blur();
    await sau.arm.objetivos.salvar(id || null, {
      treinosSemana: m.treinosSemana, minutosSemana: m.minutosSemana, acertoAlimentacao: m.acertoAlimentacao,
      ...atual, metaAgua, metaSono,
    });
    avisoVida("Metas de bem-estar salvas.", "acerto");
  } catch { avisoVida("Não foi possível salvar as metas.", "erro"); }
}

function iniciarBemEstar() {
  if (!document.getElementById("sono-grafico")) return;
  document.getElementById("agua-mais").addEventListener("click", () => mudarAgua(1));
  document.getElementById("agua-menos").addEventListener("click", () => mudarAgua(-1));
  document.getElementById("sono-horas").addEventListener("change", async (e) => {
    const v = e.target.value === "" ? null : Number(String(e.target.value).replace(",", "."));
    if (v != null && !(v >= 0 && v <= 24)) return avisoVida("Informe as horas de sono entre 0 e 24.", "erro");
    try { await salvarCheckin({ sonoHoras: v }); e.target.blur(); } catch {}
  });
  document.getElementById("bemestar-metas-form").addEventListener("submit", salvarMetasBemEstar);
  document.getElementById("autocuidado").addEventListener("change", async (e) => {
    const h = vida.habitos.find((x) => x.id === e.target.dataset.habitoHoje);
    if (!h) return;
    try {
      await alternarHabito(h, hojeDia(), e.target.checked);
      if (e.target.checked) avisoVida(`${h.icone || "🌿"} ${h.nome}: feito! Cuidar de você conta.`, "acerto");
    } catch { e.target.checked = !e.target.checked; }
  });
  document.getElementById("autocuidado-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = e.target.elements.nome.value.trim();
    if (!nome) return e.target.elements.nome.focus();
    try {
      await vida.arm.habitos.salvar(null, { nome, icone: "🌿", area: "saude", vezesSemana: Number(e.target.elements.vezes.value), autocuidado: true, ativo: true });
      e.target.reset();
    } catch { avisoVida("Não foi possível salvar o hábito.", "erro"); }
  });
  document.getElementById("consulta-adicionar").addEventListener("click", () => irPara("#rotina-agenda", () => abrirFormularioCompromisso(null, "consulta")));
  ligarCompromissos(document.getElementById("consultas"));
  // Também redesenha quando as metas (saude.objetivos) mudam: vida.js escuta "vital-dados".
  vida.renders.push(renderizarBemEstar);
}

iniciarBemEstar();

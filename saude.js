/* ---------- Área Saúde ----------
 * Registro de acertos e erros na alimentação e no exercício. Mostra a nota do dia,
 * mensagens que reagem ao que está acontecendo (meta da semana, sequência em risco,
 * ponto fraco), gráficos de constância e evolução, conquistas e o histórico.
 * Dados no schema "saude" (registros, objetivos). Usa os helpers de data de estudos.js.
 */

const sau = {
  registros: [],
  objetivos: [],
  arm: {},
  carregado: false,
  editandoId: null,
  diasHistorico: 5,
  conquistasVistas: null,
  ultimaAcao: 0,
  novasConquistas: [],
  timerAviso: null,
};

const REFEICOES = { cafe: "Café da manhã", almoco: "Almoço", lanche: "Lanche", jantar: "Jantar", ceia: "Ceia", fora: "Fora de hora" };
const INTENSIDADES = { leve: "leve", moderada: "moderada", intensa: "intensa" };
const DIAS_SEMANA_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const EXEMPLOS_SAUDE = {
  alimentacao: { acerto: "Ex.: salada no almoço, 2 L de água, fruta no lanche", erro: "Ex.: refrigerante, doce depois do almoço, fast food" },
  exercicio: { acerto: "Ex.: musculação, corrida 5 km, caminhada", erro: "Ex.: faltei no treino, fiquei parado o dia todo" },
};
const ELOGIOS = ["Mandou bem! 💪", "Isso aí! Mais um acerto ✓", "Boa! Seu placar agradece 🙌", "Constância é tudo. Continue! 🔥", "Excelente escolha! 🌱"];
const APOIOS = [
  "Anotado. Errar faz parte — o próximo acerto é o que importa.",
  "Registrar o erro já é consciência. Amanhã é outro placar.",
  "Tudo bem. Um deslize não apaga sua semana.",
];

function metasSaude() {
  const o = sau.objetivos[0] || {};
  return {
    treinosSemana: Number(o.treinosSemana) || 3,
    minutosSemana: Number(o.minutosSemana) || 150,
    acertoAlimentacao: Number(o.acertoAlimentacao) || 80,
  };
}

const ehTreino = (r) => r.tipo === "exercicio" && r.resultado === "acerto";
const registrosEntre = (de, ate, filtro = () => true) => sau.registros.filter((r) => r.data >= de && r.data <= ate && filtro(r));
const registrosDoDia = (dia) => sau.registros.filter((r) => r.data === dia);
const plural = (n, s, p = s + "s") => `${n} ${n === 1 ? s : p}`;

function placarDe(lista) {
  const acertos = lista.filter((r) => r.resultado === "acerto").length;
  const erros = lista.length - acertos;
  return { acertos, erros, total: lista.length, nota: lista.length ? Math.round((acertos / lista.length) * 100) : null };
}

/* Dias seguidos (terminando hoje, ou ontem se hoje ainda não conta) em que ok(dia) vale. */
function sequenciaSaude(ok, quebra = () => false) {
  let dia = hojeDia();
  if (quebra(dia)) return 0;
  if (!ok(dia)) dia = somarDias(dia, -1);
  let n = 0;
  while (ok(dia)) { n++; dia = somarDias(dia, -1); }
  return n;
}

/* Maior sequência de dias em todo o histórico. */
function maiorSequencia(ok) {
  if (!sau.registros.length) return 0;
  const inicio = sau.registros.reduce((m, r) => (r.data < m ? r.data : m), hojeDia());
  let melhor = 0, atual = 0;
  for (let dia = inicio; dia <= hojeDia(); dia = somarDias(dia, 1)) {
    atual = ok(dia) ? atual + 1 : 0;
    melhor = Math.max(melhor, atual);
  }
  return melhor;
}

const treinouNo = (dia) => registrosDoDia(dia).some(ehTreino);
const alimentacaoDoDia = (dia) => registrosDoDia(dia).filter((r) => r.tipo === "alimentacao");
const diaLimpo = (dia) => { const a = alimentacaoDoDia(dia); return a.length > 0 && a.every((r) => r.resultado === "acerto"); };
const errouNaAlimentacao = (dia) => alimentacaoDoDia(dia).some((r) => r.resultado === "erro");

/* Treinos de uma semana = dias com treino; minutos somados. */
function semanaDeTreino(inicio) {
  const fim = somarDias(inicio, 6);
  const treinos = registrosEntre(inicio, fim, ehTreino);
  return { dias: new Set(treinos.map((r) => r.data)).size, minutos: treinos.reduce((t, r) => t + (Number(r.minutos) || 0), 0) };
}

/* Tudo que as telas usam, calculado de uma vez. */
function estatisticasSaude() {
  const hoje = hojeDia();
  const metas = metasSaude();
  const semanaIni = inicioSemana(hoje);
  const semana = semanaDeTreino(semanaIni);
  const diasRestantes = 7 - diasEntre(semanaIni, hoje);
  const alim7 = placarDe(registrosEntre(somarDias(hoje, -6), hoje, (r) => r.tipo === "alimentacao"));
  const alimAnterior = placarDe(registrosEntre(somarDias(hoje, -13), somarDias(hoje, -7), (r) => r.tipo === "alimentacao"));
  const dias = new Map();
  for (const r of sau.registros) dias.set(r.data, [...(dias.get(r.data) || []), r]);
  const placares = [...dias.entries()].map(([dia, lista]) => ({ dia, ...placarDe(lista) }));

  // Semanas em que a meta de treinos foi batida
  let semanasMeta = 0;
  const semanasVistas = new Set(sau.registros.filter(ehTreino).map((r) => inicioSemana(r.data)));
  for (const s of semanasVistas) if (semanaDeTreino(s).dias >= metas.treinosSemana) semanasMeta++;

  // Volta por cima: dia difícil seguido de um dia bom
  const porDia = new Map(placares.map((p) => [p.dia, p]));
  const voltas = placares.filter((p) => p.erros > p.acertos && (porDia.get(somarDias(p.dia, 1))?.nota ?? -1) >= 70).length;

  return {
    hoje, metas, semanaIni, semana, diasRestantes, alim7, alimAnterior, placares,
    dia: placarDe(registrosDoDia(hoje)),
    treinouHoje: treinouNo(hoje),
    seqTreino: sequenciaSaude(treinouNo),
    seqLimpa: sequenciaSaude(diaLimpo, errouNaAlimentacao),
    maxSeqTreino: maiorSequencia(treinouNo),
    maxSeqLimpa: maiorSequencia(diaLimpo),
    total: sau.registros.length,
    acertos: sau.registros.filter((r) => r.resultado === "acerto").length,
    treinos: sau.registros.filter(ehTreino).length,
    minutosTotal: sau.registros.filter(ehTreino).reduce((t, r) => t + (Number(r.minutos) || 0), 0),
    diasPerfeitos: placares.filter((p) => p.acertos >= 3 && p.erros === 0).length,
    semanasMeta,
    voltas,
  };
}

/* Agrupa por descrição (sem diferenciar maiúsculas) e conta. */
function maisFrequentes(lista, n = 5) {
  const contagem = new Map();
  for (const r of lista) {
    const chave = r.descricao.trim().toLowerCase();
    const atual = contagem.get(chave) || { descricao: r.descricao.trim(), n: 0, tipo: r.tipo };
    atual.n++;
    contagem.set(chave, atual);
  }
  return [...contagem.values()].sort((a, b) => b.n - a.n || a.descricao.localeCompare(b.descricao)).slice(0, n);
}

/* Refeição (ou exercício) com mais erros nos últimos 30 dias. */
function errosPorMomento() {
  const hoje = hojeDia();
  const erros = registrosEntre(somarDias(hoje, -29), hoje, (r) => r.resultado === "erro");
  const grupos = new Map();
  for (const r of erros) {
    const nome = r.tipo === "exercicio" ? "Exercício" : REFEICOES[r.refeicao] || "Alimentação";
    grupos.set(nome, (grupos.get(nome) || 0) + 1);
  }
  return [...grupos.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n);
}

/* ---------- Mensagens proativas ---------- */

function mensagensSaude(s) {
  const m = [];
  const { metas, dia } = s;
  if (!dia.total) m.push({ peso: 95, tom: "neutro", titulo: "Comece o placar de hoje", texto: "Registre sua primeira refeição ou treino. Cada registro conta." });
  else if (dia.erros === 0 && dia.acertos >= 3) m.push({ peso: 90, tom: "bom", titulo: "Dia perfeito até agora! 🔥", texto: `${plural(dia.acertos, "acerto")} e nenhum erro. Continue assim.` });
  else if (dia.erros > dia.acertos) m.push({ peso: 87, tom: "alerta", titulo: "Dia difícil — ainda dá para virar", texto: "Um acerto agora já muda o placar: beba água, coma uma fruta ou caminhe 10 minutos." });
  else m.push({ peso: 40, tom: "bom", titulo: `Nota ${dia.nota} hoje`, texto: `${plural(dia.acertos, "acerto")} e ${plural(dia.erros, "erro")}. ${dia.erros ? "Mais um acerto sobe a sua nota." : `Mais ${plural(3 - dia.acertos, "acerto")} e o dia fica perfeito.`}` });

  // Dias em que ainda dá para treinar (hoje não conta se já treinou).
  const faltam = metas.treinosSemana - s.semana.dias;
  const diasLivres = s.diasRestantes - (s.treinouHoje ? 1 : 0);
  if (faltam <= 0) m.push({ peso: 80, tom: "bom", titulo: "Meta de treinos da semana batida! 🏆", texto: `${plural(s.semana.dias, "treino")} esta semana (meta: ${metas.treinosSemana}).` });
  else if (faltam > diasLivres) m.push({ peso: 75, tom: "alerta", titulo: "A meta de treinos desta semana ficou apertada", texto: `Faltam ${plural(faltam, "treino")} e só ${diasLivres === 1 ? "sobra 1 dia" : `sobram ${diasLivres} dias`}. Faça o que der — cada treino conta.` });
  else if (!s.treinouHoje && faltam === diasLivres) m.push({ peso: 88, tom: "alerta", titulo: "Hoje precisa ter treino", texto: `Faltam ${plural(faltam, "treino")} e restam ${plural(diasLivres, "dia")} na semana.` });
  else if (!s.treinouHoje) m.push({ peso: 50, tom: "neutro", titulo: `Faltam ${plural(faltam, "treino")} para a meta da semana`, texto: `Restam ${plural(diasLivres, "dia")}. Que tal hoje?` });
  else m.push({ peso: 55, tom: "bom", titulo: "Treino de hoje feito ✓", texto: `Faltam ${plural(faltam, "treino")} para a meta da semana e restam ${plural(diasLivres, "dia")}.` });

  if (s.seqTreino >= 2 && !s.treinouHoje) m.push({ peso: 85, tom: "alerta", titulo: `Sua sequência de ${s.seqTreino} dias está em risco`, texto: "Treine hoje para não perder o ritmo — até 20 minutos valem." });
  else if (s.seqTreino >= 3) m.push({ peso: 70, tom: "bom", titulo: `${s.seqTreino} dias seguidos treinando 🔥`, texto: "Você está construindo um hábito de verdade." });

  if (s.alim7.total >= 3) {
    const fraco = errosPorMomento().find((g) => g.nome !== "Exercício");
    if (s.alim7.nota < metas.acertoAlimentacao) {
      m.push({ peso: 72, tom: "alerta", titulo: "Alimentação abaixo da meta", texto: `${s.alim7.nota}% de acertos nos últimos 7 dias (meta ${metas.acertoAlimentacao}%).${fraco ? ` Seu ponto fraco é o ${fraco.nome.toLowerCase()} — planeje essa refeição antes.` : ""}` });
    } else {
      m.push({ peso: 62, tom: "bom", titulo: `Alimentação no alvo: ${s.alim7.nota}% de acertos`, texto: `Acima da sua meta de ${metas.acertoAlimentacao}% nos últimos 7 dias.` });
    }
    if (s.alimAnterior.total >= 3) {
      const delta = s.alim7.nota - s.alimAnterior.nota;
      if (delta >= 10) m.push({ peso: 65, tom: "bom", titulo: `Você evoluiu ${delta} pontos na alimentação 📈`, texto: `De ${s.alimAnterior.nota}% para ${s.alim7.nota}% de acertos em relação à semana anterior.` });
      else if (delta <= -10) m.push({ peso: 66, tom: "alerta", titulo: `A alimentação caiu ${-delta} pontos`, texto: `De ${s.alimAnterior.nota}% para ${s.alim7.nota}% de acertos. Volte ao que funcionou na semana passada.` });
    }
  }

  const repetido = maisFrequentes(registrosEntre(somarDias(s.hoje, -13), s.hoje, (r) => r.resultado === "erro"), 1)[0];
  if (repetido && repetido.n >= 3) m.push({ peso: 60, tom: "alerta", titulo: `“${repetido.descricao}” apareceu ${repetido.n} vezes em 2 semanas`, texto: "Descobrir o gatilho é metade da solução. Que tal deixar uma alternativa pronta?" });

  return m.sort((a, b) => b.peso - a.peso).slice(0, 3);
}

/* ---------- Conquistas ---------- */

const CONQUISTAS = [
  { id: "primeiro", icone: "🌱", nome: "Primeiro passo", desc: "Fazer o primeiro registro", meta: 1, valor: (s) => s.total },
  { id: "treino1", icone: "👟", nome: "Primeiro treino", desc: "Registrar um treino", meta: 1, valor: (s) => s.treinos },
  { id: "perfeito", icone: "⭐", nome: "Dia perfeito", desc: "Um dia com 3 acertos ou mais e nenhum erro", meta: 1, valor: (s) => s.diasPerfeitos },
  { id: "seq3", icone: "🔥", nome: "Pegando fogo", desc: "Treinar 3 dias seguidos", meta: 3, valor: (s) => s.maxSeqTreino },
  { id: "semana", icone: "🏆", nome: "Semana de atleta", desc: "Bater a meta de treinos de uma semana", meta: 1, valor: (s) => s.semanasMeta },
  { id: "volta", icone: "💪", nome: "Volta por cima", desc: "Ter um dia bom logo depois de um dia difícil", meta: 1, valor: (s) => s.voltas },
  { id: "limpa", icone: "🥗", nome: "Semana limpa", desc: "7 dias seguidos sem erro na alimentação", meta: 7, valor: (s) => s.maxSeqLimpa },
  { id: "seq7", icone: "⚡", nome: "Imparável", desc: "Treinar 7 dias seguidos", meta: 7, valor: (s) => s.maxSeqTreino },
  { id: "horas10", icone: "⏱️", nome: "10 horas de treino", desc: "Somar 10 horas de exercício", meta: 600, valor: (s) => s.minutosTotal, formato: (v) => `${horas(v)} de 10 h` },
  { id: "acertos50", icone: "🎯", nome: "50 acertos", desc: "Chegar a 50 acertos", meta: 50, valor: (s) => s.acertos },
  { id: "acertos100", icone: "💎", nome: "100 acertos", desc: "Chegar a 100 acertos", meta: 100, valor: (s) => s.acertos },
  { id: "semanas4", icone: "👑", nome: "Mês de atleta", desc: "Bater a meta de treinos em 4 semanas", meta: 4, valor: (s) => s.semanasMeta },
];

function renderizarConquistas(s) {
  const lista = CONQUISTAS.map((c) => ({ ...c, atual: Math.min(c.valor(s), c.meta) }));
  const ganhas = lista.filter((c) => c.atual >= c.meta);
  document.getElementById("saude-conquistas-total").textContent = `${ganhas.length} de ${lista.length} desbloqueadas`;
  document.getElementById("saude-conquistas").innerHTML = lista.map((c) => {
    const ok = c.atual >= c.meta;
    return `
    <div class="conquista${ok ? " ganha" : ""}" data-conquista="${c.id}">
      <span class="conquista-icone" aria-hidden="true">${c.icone}</span>
      <div class="conquista-texto">
        <strong>${c.nome}</strong>
        <span>${c.desc}</span>
        ${ok ? `<span class="conquista-status">✓ Desbloqueada</span>` : `
          <div class="barra" role="progressbar" aria-label="${c.nome}"><div class="preenchimento"></div></div>
          <span class="conquista-status">${c.formato ? c.formato(c.atual) : `${c.atual} de ${c.meta}`}</span>`}
      </div>
    </div>`;
  }).join("");
  lista.forEach((c) => {
    const barra = document.querySelector(`[data-conquista="${c.id}"] .barra`);
    if (barra) preencherBarra(barra, c.atual / c.meta);
  });

  // Comemora conquistas novas logo depois de uma ação sua.
  const ids = new Set(ganhas.map((c) => c.id));
  if (sau.conquistasVistas && Date.now() - sau.ultimaAcao < 8000) {
    const novas = ganhas.filter((c) => !sau.conquistasVistas.has(c.id));
    if (novas.length) {
      sau.novasConquistas.push(...novas);
      avisoSaude(`🏆 Conquista desbloqueada: ${novas.map((c) => c.nome).join(", ")}`, "conquista");
      confete();
    }
  }
  if (sau.carregado) sau.conquistasVistas = ids;
}

/* ---------- Topo: nota do dia, mensagens e números ---------- */

function tomDaNota(nota) {
  if (nota === null) return "vazio";
  return nota >= 70 ? "bom" : nota >= 50 ? "medio" : "ruim";
}

function renderizarTopoSaude(s) {
  document.getElementById("saude-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(s.hoje)));
  const { dia } = s;
  const r = 52, c = 2 * Math.PI * r;
  const fracao = dia.nota === null ? 0 : dia.nota / 100;
  const anel = document.getElementById("saude-anel");
  anel.className = `anel-dia ${tomDaNota(dia.nota)}`;
  anel.innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="anel-trilho" cx="60" cy="60" r="${r}"></circle>
      <circle class="anel-valor" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 60 60)"></circle>
    </svg>
    <div class="anel-texto">
      <span class="anel-rotulo">Nota de hoje</span>
      <strong id="saude-nota">${dia.nota === null ? "—" : dia.nota}</strong>
      <span class="anel-detalhe">${dia.total ? `${dia.acertos} ✓ · ${dia.erros} ✗` : "sem registros"}</span>
    </div>`;
  anel.setAttribute("role", "img");
  anel.setAttribute("aria-label", dia.nota === null ? "Nenhum registro hoje" : `Nota de hoje ${dia.nota}: ${plural(dia.acertos, "acerto")} e ${plural(dia.erros, "erro")}`);
  requestAnimationFrame(() => { anel.querySelector(".anel-valor").style.strokeDashoffset = c * (1 - fracao); });

  const msgs = mensagensSaude(s);
  document.getElementById("saude-mensagem").innerHTML = msgs.map((m, i) => `
    <div class="mensagem ${m.tom}${i === 0 ? " principal" : ""}">
      <strong>${escapar(m.titulo)}</strong>
      <span>${escapar(m.texto)}</span>
    </div>`).join("");

  const { metas, semana } = s;
  const delta = s.alim7.total && s.alimAnterior.total ? s.alim7.nota - s.alimAnterior.nota : null;
  document.getElementById("saude-numeros").innerHTML = `
    <div class="saude-numero">
      <span>Treinos na semana</span>
      <strong>${semana.dias} <em>de ${metas.treinosSemana}</em></strong>
      <div class="barra" role="progressbar" aria-label="Treinos na semana"><div class="preenchimento"></div></div>
      <small>${semana.dias >= metas.treinosSemana ? "Meta batida ✓" : `faltam ${metas.treinosSemana - semana.dias}`}</small>
    </div>
    <div class="saude-numero">
      <span>Exercício na semana</span>
      <strong>${duracao(semana.minutos)} <em>de ${duracao(metas.minutosSemana)}</em></strong>
      <div class="barra" role="progressbar" aria-label="Minutos na semana"><div class="preenchimento"></div></div>
      <small>${semana.minutos >= metas.minutosSemana ? "Meta batida ✓" : `faltam ${duracao(metas.minutosSemana - semana.minutos)}`}</small>
    </div>
    <div class="saude-numero">
      <span>Alimentação · 7 dias</span>
      <strong>${s.alim7.total ? `${s.alim7.nota}%` : "—"} <em>meta ${metas.acertoAlimentacao}%</em></strong>
      <div class="barra" role="progressbar" aria-label="Acertos na alimentação"><div class="preenchimento"></div></div>
      <small class="${delta > 0 ? "sobe" : delta < 0 ? "desce" : ""}">${delta === null ? `${plural(s.alim7.total, "registro")}` : delta === 0 ? "igual à semana anterior" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} pts vs. semana anterior`}</small>
    </div>
    <div class="saude-numero">
      <span>Sequências</span>
      <strong>🔥 ${plural(s.seqTreino, "dia")}</strong>
      <small>treinando seguido</small>
      <small>🥗 ${plural(s.seqLimpa, "dia")} sem erro na alimentação</small>
    </div>`;
  const barras = document.querySelectorAll("#saude-numeros .barra");
  preencherBarra(barras[0], Math.min(semana.dias / metas.treinosSemana, 1));
  preencherBarra(barras[1], Math.min(semana.minutos / metas.minutosSemana, 1));
  preencherBarra(barras[2], s.alim7.total ? s.alim7.nota / 100 : 0);
  barras[2].classList.toggle("abaixo", s.alim7.total > 0 && s.alim7.nota < metas.acertoAlimentacao);
}

/* ---------- Gráficos ---------- */

const diaCurto = (iso) => `${DIAS_SEMANA_CURTOS[paraData(iso).getDay()]}, ${dataBR(iso).slice(0, 5)}`;

/* Barras divergentes: acertos para cima, erros para baixo, um dia por coluna. */
function renderizarPlacarDias(s) {
  const dias = Array.from({ length: 30 }, (_, i) => somarDias(s.hoje, i - 29));
  const placares = dias.map((d) => placarDe(registrosDoDia(d)));
  const maior = Math.max(2, ...placares.map((p) => Math.max(p.acertos, p.erros)));
  const total = placarDe(registrosEntre(dias[0], s.hoje));
  document.getElementById("saude-placar-resumo").textContent = total.total
    ? `30 dias: ${total.acertos} ✓ · ${total.erros} ✗ · ${total.nota}% de acertos`
    : "últimos 30 dias";
  const el = document.getElementById("saude-placar");
  el.setAttribute("aria-label", `Acertos e erros por dia nos últimos 30 dias: ${total.acertos} acertos e ${total.erros} erros`);
  el.innerHTML = dias.map((d, i) => {
    const p = placares[i];
    const rotulo = i % 5 === 4 || d === s.hoje ? (d === s.hoje ? "hoje" : String(paraData(d).getDate())) : "";
    return `
    <div class="placar-dia${d === s.hoje ? " hoje" : ""}" data-dica="${escapar(`${diaCurto(d)}: ${p.total ? `${plural(p.acertos, "acerto")} · ${plural(p.erros, "erro")}` : "sem registros"}`)}">
      <span class="placar-cima"><span class="placar-barra acerto" style="height:${(p.acertos / maior) * 100}%"></span></span>
      <span class="placar-baixo"><span class="placar-barra erro" style="height:${(p.erros / maior) * 100}%"></span></span>
      <span class="placar-rotulo">${rotulo}</span>
    </div>`;
  }).join("");
}

/* Calendário de constância: 16 semanas, uma coluna por semana (seg → dom). */
function renderizarCalendarioSaude(s) {
  const inicio = somarDias(s.semanaIni, -15 * 7);
  const porDia = new Map(s.placares.map((p) => [p.dia, p]));
  const celulas = [];
  for (let i = 0; i < 16 * 7; i++) {
    const d = somarDias(inicio, i);
    if (d > s.hoje) { celulas.push(`<span class="cal-dia futuro"></span>`); continue; }
    const p = porDia.get(d);
    const classe = !p ? "c-vazio" : p.nota < 50 ? "c-ruim" : p.nota < 70 ? "c-n1" : p.nota < 85 ? "c-n2" : p.nota < 100 ? "c-n3" : "c-n4";
    celulas.push(`<span class="cal-dia ${classe}${d === s.hoje ? " hoje" : ""}" data-dica="${escapar(`${diaCurto(d)}: ${p ? `nota ${p.nota} · ${p.acertos} ✓ ${p.erros} ✗` : "sem registros"}`)}"></span>`);
  }
  const ativos = s.placares.filter((p) => p.dia >= inicio).length;
  const el = document.getElementById("saude-calendario");
  el.setAttribute("aria-label", `Constância: ${plural(ativos, "dia")} com registros nas últimas 16 semanas`);
  el.innerHTML = `
    <div class="cal-semanas">${["S", "T", "Q", "Q", "S", "S", "D"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="cal-grade">${celulas.join("")}</div>`;
}

/* Minutos de exercício nas últimas 8 semanas, com a linha da meta. */
function renderizarSemanasSaude(s) {
  const meta = s.metas.minutosSemana;
  const semanas = Array.from({ length: 8 }, (_, i) => somarDias(s.semanaIni, (i - 7) * 7));
  const dados = semanas.map((ini) => ({ ini, ...semanaDeTreino(ini) }));
  const maior = Math.max(meta * 1.2, ...dados.map((d) => d.minutos));
  const batidas = dados.filter((d) => d.minutos >= meta).length;
  document.getElementById("saude-exercicio-meta").textContent = `meta ${duracao(meta)} · batida em ${batidas} de 8`;
  const el = document.getElementById("saude-semanas");
  el.setAttribute("aria-label", `Minutos de exercício por semana, últimas 8 semanas. Meta batida em ${batidas} semanas.`);
  el.innerHTML = `
    <div class="semanas-area">
      <span class="semana-meta" style="bottom:${(meta / maior) * 100}%"></span>
      ${dados.map((d) => `
      <div class="semana-col${d.ini === s.semanaIni ? " atual" : ""}" data-dica="${escapar(`Semana de ${dataBR(d.ini).slice(0, 5)}: ${duracao(d.minutos)} · ${plural(d.dias, "treino")}`)}">
        <span class="semana-valor">${d.minutos ? duracao(d.minutos) : ""}</span>
        <span class="semana-barra ${d.minutos >= meta ? "bateu" : "nao-bateu"}" style="height:${(d.minutos / maior) * 100}%"></span>
      </div>`).join("")}
    </div>
    <div class="semanas-rotulos">${dados.map((d) => `<span>${d.ini === s.semanaIni ? "esta" : dataBR(d.ini).slice(0, 5)}</span>`).join("")}</div>`;
}

function barrasHorizontais(itens, classe) {
  const maior = Math.max(1, ...itens.map((i) => i.n));
  return `<ul class="barras-h">${itens.map((i) => `
    <li><span class="barras-h-nome">${escapar(i.descricao || i.nome)}</span>
      <span class="barras-h-trilho"><span class="barras-h-barra ${classe}" style="width:${(i.n / maior) * 100}%"></span></span>
      <span class="barras-h-n">${i.n}×</span></li>`).join("")}</ul>`;
}

function renderizarFracosEFortes(s) {
  const de = somarDias(s.hoje, -29);
  const momentos = errosPorMomento();
  const erros = maisFrequentes(registrosEntre(de, s.hoje, (r) => r.resultado === "erro"));
  const acertos = maisFrequentes(registrosEntre(de, s.hoje, (r) => r.resultado === "acerto"));
  document.getElementById("saude-fracos").innerHTML = momentos.length ? `
    <h3 class="saude-sub">Por momento</h3>
    ${barrasHorizontais(momentos, "erro")}
    <h3 class="saude-sub">Erros que mais se repetem</h3>
    ${barrasHorizontais(erros, "erro")}
    <p class="dica-saude">💡 Foque no <strong>${escapar(momentos[0].nome.toLowerCase())}</strong>: é onde estão ${Math.round((momentos[0].n / momentos.reduce((t, m) => t + m.n, 0)) * 100)}% dos seus erros.</p>`
    : `<p class="estado">Nenhum erro nos últimos 30 dias. ${sau.registros.length ? "Que fase! 🎉" : ""}</p>`;
  const treinos = registrosEntre(de, s.hoje, ehTreino);
  const favorito = maisFrequentes(treinos, 1)[0];
  document.getElementById("saude-fortes").innerHTML = acertos.length ? `
    <h3 class="saude-sub">Acertos que mais se repetem</h3>
    ${barrasHorizontais(acertos, "acerto")}
    ${favorito ? `<p class="dica-saude">🏅 Treino favorito: <strong>${escapar(favorito.descricao)}</strong> (${plural(favorito.n, "vez", "vezes")}, ${duracao(treinos.reduce((t, r) => t + (Number(r.minutos) || 0), 0))} no total).</p>` : ""}`
    : `<p class="estado">Seus acertos vão aparecer aqui.</p>`;
}

/* ---------- Histórico ---------- */

function detalheRegistro(r) {
  if (r.tipo === "exercicio") return ["Exercício", r.minutos ? duracao(r.minutos) : "", r.intensidade ? INTENSIDADES[r.intensidade] : ""].filter(Boolean).join(" · ");
  return REFEICOES[r.refeicao] || "Alimentação";
}

function renderizarHistoricoSaude() {
  const dias = [...new Set(sau.registros.map((r) => r.data))].sort().reverse();
  document.getElementById("saude-vazio").hidden = dias.length > 0;
  document.getElementById("saude-mais").hidden = dias.length <= sau.diasHistorico;
  const hoje = hojeDia();
  document.getElementById("saude-historico").innerHTML = dias.slice(0, sau.diasHistorico).map((d) => {
    const lista = registrosDoDia(d).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "alimentacao" ? -1 : 1));
    const p = placarDe(lista);
    return `
    <div class="dia-saude">
      <div class="dia-saude-topo">
        <strong>${d === hoje ? "Hoje" : d === somarDias(hoje, -1) ? "Ontem" : diaCurto(d)}</strong>
        <span class="nota-chip ${tomDaNota(p.nota)}">nota ${p.nota}</span>
        <span class="sub">${p.acertos} ✓ · ${p.erros} ✗</span>
      </div>
      <ul class="registros-saude">${lista.map((r) => `
        <li class="${r.resultado}">
          <span class="registro-icone" aria-label="${r.resultado === "acerto" ? "Acerto" : "Erro"}">${r.resultado === "acerto" ? "✓" : "✗"}</span>
          <span class="registro-texto"><span>${escapar(r.descricao)}</span> <small>${escapar(detalheRegistro(r))}${r.nota ? ` · ${escapar(r.nota)}` : ""}</small></span>
          <button type="button" class="botao mini" data-editar-registro="${escapar(r.id)}">Editar</button>
          <button type="button" class="botao mini" data-excluir-registro="${escapar(r.id)}">Excluir</button>
        </li>`).join("")}</ul>
    </div>`;
  }).join("");
  document.querySelectorAll("[data-editar-registro]").forEach((b) => b.addEventListener("click", () => editarRegistro(b.dataset.editarRegistro)));
  document.querySelectorAll("[data-excluir-registro]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.confirmar !== "sim") { b.dataset.confirmar = "sim"; b.textContent = "Confirmar"; b.classList.add("perigo"); return; }
    b.disabled = true;
    try { await sau.arm.registros.excluir(b.dataset.excluirRegistro); }
    catch { avisoSaude("Não foi possível excluir o registro.", "erro"); b.disabled = false; }
  }));
}

/* Atalhos: os registros que você mais repete, para lançar hoje com um clique. */
function renderizarRapidos() {
  const contagem = new Map();
  for (const r of sau.registros) {
    const chave = [r.tipo, r.resultado, r.descricao.trim().toLowerCase(), r.refeicao || "", r.minutos || "", r.intensidade || ""].join("|");
    const atual = contagem.get(chave) || { r, n: 0 };
    atual.n++;
    contagem.set(chave, atual);
  }
  const top = [...contagem.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
  document.getElementById("saude-rapidos").innerHTML = top.length ? `
    <span class="rapidos-titulo">Repetir hoje com um clique</span>
    ${top.map((c, i) => `<button type="button" class="chip-rapido ${c.r.resultado}" data-rapido="${i}">${c.r.resultado === "acerto" ? "✓" : "✗"} ${escapar(c.r.descricao)}${c.r.tipo === "exercicio" && c.r.minutos ? ` · ${duracao(c.r.minutos)}` : ""}</button>`).join("")}` : "";
  document.querySelectorAll("[data-rapido]").forEach((b) => b.addEventListener("click", () => {
    const { id, ...base } = top[Number(b.dataset.rapido)].r;
    registrarSaude({ ...base, data: hojeDia(), nota: null }, b);
  }));
}

function renderizarSugestoes() {
  const form = document.getElementById("saude-form");
  const tipo = form.elements.tipo.value, resultado = form.elements.resultado.value;
  const nomes = maisFrequentes(sau.registros.filter((r) => r.tipo === tipo && r.resultado === resultado), 30).map((x) => x.descricao);
  document.getElementById("saude-sugestoes").innerHTML = nomes.map((n) => `<option value="${escapar(n)}"></option>`).join("");
}

/* ---------- Render geral ---------- */

function renderizarSaude() {
  if (!document.getElementById("saude-numeros")) return;
  const s = estatisticasSaude();
  renderizarTopoSaude(s);
  renderizarPlacarDias(s);
  renderizarCalendarioSaude(s);
  renderizarSemanasSaude(s);
  renderizarFracosEFortes(s);
  renderizarConquistas(s);
  renderizarHistoricoSaude();
  renderizarRapidos();
  renderizarSugestoes();
  preencherMetasSaude();
}

/* ---------- Formulário ---------- */

function ajustarFormularioSaude() {
  const form = document.getElementById("saude-form");
  const tipo = form.elements.tipo.value, resultado = form.elements.resultado.value;
  form.querySelectorAll("[data-so]").forEach((el) => { el.hidden = el.dataset.so !== tipo; });
  form.elements.descricao.placeholder = EXEMPLOS_SAUDE[tipo][resultado];
  form.classList.toggle("modo-erro", resultado === "erro");
  renderizarSugestoes();
}

function limparFormularioSaude() {
  const form = document.getElementById("saude-form");
  const tipo = form.elements.tipo.value, refeicao = form.elements.refeicao.value;
  form.reset();
  // Mantém a área e a refeição escolhidas para lançar várias coisas seguidas.
  form.elements.tipo.value = tipo;
  form.elements.refeicao.value = refeicao;
  form.elements.data.value = hojeDia();
  sau.editandoId = null;
  document.getElementById("saude-salvar").textContent = "Registrar";
  document.getElementById("saude-cancelar").hidden = true;
  ajustarFormularioSaude();
}

function editarRegistro(id) {
  const r = sau.registros.find((x) => x.id === id);
  if (!r) return;
  const form = document.getElementById("saude-form");
  form.elements.tipo.value = r.tipo;
  form.elements.resultado.value = r.resultado;
  form.elements.descricao.value = r.descricao;
  form.elements.refeicao.value = r.refeicao || "almoco";
  form.elements.minutos.value = r.minutos || "";
  form.elements.intensidade.value = r.intensidade || "moderada";
  form.elements.data.value = r.data;
  form.elements.nota.value = r.nota || "";
  sau.editandoId = id;
  document.getElementById("saude-salvar").textContent = "Salvar alteração";
  document.getElementById("saude-cancelar").hidden = false;
  ajustarFormularioSaude();
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.descricao.focus({ preventScroll: true });
}

function lerFormularioSaude() {
  const f = document.getElementById("saude-form").elements;
  const tipo = f.tipo.value, resultado = f.resultado.value;
  const minutos = f.minutos.value ? Math.round(Number(f.minutos.value)) : null;
  const dados = {
    data: f.data.value || hojeDia(),
    tipo,
    resultado,
    descricao: f.descricao.value.trim(),
    refeicao: tipo === "alimentacao" ? f.refeicao.value : null,
    minutos: tipo === "exercicio" ? minutos : null,
    intensidade: tipo === "exercicio" && resultado === "acerto" ? f.intensidade.value : null,
    nota: f.nota.value.trim() || null,
  };
  if (!dados.descricao) return { erro: "Descreva o que foi (ex.: salada no almoço, corrida).", campo: f.descricao };
  if (dados.data > hojeDia()) return { erro: "Não dá para registrar um dia que ainda não chegou.", campo: f.data };
  if (tipo === "exercicio" && resultado === "acerto" && !(minutos >= 1 && minutos <= 1440)) return { erro: "Informe quantos minutos durou o treino (de 1 a 1440).", campo: f.minutos };
  if (minutos !== null && !(minutos >= 1 && minutos <= 1440)) return { erro: "O tempo precisa ficar entre 1 e 1440 minutos.", campo: f.minutos };
  return { dados };
}

async function registrarSaude(dados, botao, id = null) {
  if (botao) botao.disabled = true;
  sau.ultimaAcao = Date.now();
  sau.novasConquistas = [];
  try {
    await sau.arm.registros.salvar(id, dados);
    if (!sau.novasConquistas.length && !id) {
      if (dados.resultado === "acerto") { avisoSaude(ELOGIOS[Math.floor(Math.random() * ELOGIOS.length)], "acerto"); confete(); }
      else avisoSaude(APOIOS[Math.floor(Math.random() * APOIOS.length)], "apoio");
    } else if (id) avisoSaude("Registro atualizado.", "apoio");
    return true;
  } catch {
    avisoSaude("Não foi possível salvar. Verifique sua conexão e tente de novo.", "erro");
    return false;
  } finally {
    if (botao) botao.disabled = false;
  }
}

async function salvarFormularioSaude(e) {
  e.preventDefault();
  const aviso = document.getElementById("saude-aviso");
  const { dados, erro, campo } = lerFormularioSaude();
  aviso.textContent = erro || "";
  aviso.hidden = !erro;
  if (erro) return campo.focus();
  const ok = await registrarSaude(dados, document.getElementById("saude-salvar"), sau.editandoId);
  if (ok) limparFormularioSaude();
}

function preencherMetasSaude() {
  const form = document.getElementById("saude-metas-form");
  if (form.contains(document.activeElement)) return;
  const m = metasSaude();
  form.elements.treinosSemana.value = m.treinosSemana;
  form.elements.minutosSemana.value = m.minutosSemana;
  form.elements.acertoAlimentacao.value = m.acertoAlimentacao;
}

async function salvarMetasSaude(e) {
  e.preventDefault();
  const f = e.target.elements;
  const dados = {
    treinosSemana: Math.round(Number(f.treinosSemana.value)),
    minutosSemana: Math.round(Number(f.minutosSemana.value)),
    acertoAlimentacao: Math.round(Number(f.acertoAlimentacao.value)),
  };
  if (!(dados.treinosSemana >= 1 && dados.treinosSemana <= 14)) return avisoSaude("Treinos por semana: de 1 a 14.", "erro");
  if (!(dados.minutosSemana >= 10 && dados.minutosSemana <= 3000)) return avisoSaude("Minutos por semana: de 10 a 3000.", "erro");
  if (!(dados.acertoAlimentacao >= 10 && dados.acertoAlimentacao <= 100)) return avisoSaude("Meta da alimentação: de 10% a 100%.", "erro");
  sau.ultimaAcao = Date.now();
  try {
    document.activeElement?.blur();
    await sau.arm.objetivos.salvar(sau.objetivos[0]?.id || null, dados);
    avisoSaude("Metas salvas. Bora! 🎯", "apoio");
  } catch {
    avisoSaude("Não foi possível salvar as metas.", "erro");
  }
}

/* ---------- Avisos, confete e dicas dos gráficos ---------- */

function avisoSaude(texto, tipo) {
  const el = document.getElementById("saude-toast");
  el.textContent = texto;
  el.className = `saude-toast ${tipo}`;
  el.hidden = false;
  clearTimeout(sau.timerAviso);
  sau.timerAviso = setTimeout(() => { el.hidden = true; }, 4500);
}

function confete() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const camada = document.createElement("div");
  camada.className = "confete";
  camada.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("span");
    p.style.left = `${50 + (Math.random() - 0.5) * 60}%`;
    p.style.setProperty("--dx", `${(Math.random() - 0.5) * 260}px`);
    p.style.setProperty("--giro", `${Math.random() * 720 - 360}deg`);
    p.style.animationDelay = `${Math.random() * 0.15}s`;
    p.className = `c${i % 4}`;
    camada.appendChild(p);
  }
  document.body.appendChild(camada);
  setTimeout(() => camada.remove(), 1600);
}

function ligarDicasSaude() {
  const dica = document.getElementById("saude-dica");
  const vista = document.querySelector("[data-vista=saude]");
  const mostrar = (alvo) => {
    dica.textContent = alvo.dataset.dica;
    dica.hidden = false;
    const r = alvo.getBoundingClientRect();
    const largura = dica.offsetWidth;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - largura / 2), window.innerWidth - largura - 8);
    dica.style.left = `${x}px`;
    dica.style.top = `${Math.max(8, r.top - dica.offsetHeight - 8)}px`;
  };
  vista.addEventListener("pointerover", (e) => {
    const alvo = e.target.closest("[data-dica]");
    if (alvo) mostrar(alvo); else dica.hidden = true;
  });
  vista.addEventListener("pointerleave", () => { dica.hidden = true; });
  window.addEventListener("scroll", () => { dica.hidden = true; }, { passive: true });
}

/* ---------- Início ---------- */

async function iniciarSaude() {
  const form = document.getElementById("saude-form");
  if (!form) return;
  form.addEventListener("change", (e) => { if (["tipo", "resultado"].includes(e.target.name)) ajustarFormularioSaude(); });
  form.addEventListener("submit", salvarFormularioSaude);
  document.getElementById("saude-cancelar").addEventListener("click", limparFormularioSaude);
  document.getElementById("saude-metas-form").addEventListener("submit", salvarMetasSaude);
  document.getElementById("saude-mais").addEventListener("click", () => { sau.diasHistorico += 7; renderizarHistoricoSaude(); });
  ligarDicasSaude();
  limparFormularioSaude();
  renderizarSaude();

  sau.arm.registros = await abrirArmazenamento("registros", []);
  sau.arm.objetivos = await abrirArmazenamento("objetivos", []);
  sau.arm.registros.observar((lista) => { sau.registros = lista; sau.carregado = true; renderizarSaude(); },
    () => avisoSaude("Não foi possível carregar a saúde. Recarregue a página.", "erro"));
  sau.arm.objetivos.observar((lista) => { sau.objetivos = lista; renderizarSaude(); },
    () => avisoSaude("Não foi possível carregar as metas.", "erro"));
}

iniciarSaude();

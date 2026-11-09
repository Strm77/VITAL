/* ---------- Stefanini: CRM de vendas ----------
 * Contas, contatos, oportunidades (com estágio e valor), reuniões, atividades e a meta anual.
 * Painel: meta do ano, Realizado (oportunidades Win fechadas no ano), Pipeline (estágios em
 * aberto) e Quanto falta; funil com contagem e soma por estágio.
 * Dados no schema "stefanini" (supabase.js); no painel as tabelas têm o prefixo stf_.
 * Datas: dd/mm/aaaa na tela, ISO (aaaa-mm-dd) no armazenamento.
 */

const STF_STATUS = ["Prospect / Potencial", "Bloqueado", "Inativo", "Adormecido", "Em implantação", "Em negociação",
  "Em renovação", "Em risco", "Em Manutenção", "Em Expansão", "Perdido / Churn", "Ativo/Saudável"];
const STF_ESTAGIOS = ["Identifying Opportunity", "Qualification Opportunity", "Solution Design", "Pricing / Proposal",
  "POC", "Proposal Approval", "With Customer", "Win", "Lose"];
const STF_FECHADOS = ["Win", "Lose"];
const STF_TEMPERATURAS = ["Prospect", "Contato Frio", "Contato Morno", "Contato Quente", "Quase amigos", "Amigos"];
// Tom do status da conta: bom, atenção ou ruim (o resto fica neutro).
const STF_TOM_STATUS = {
  "Ativo/Saudável": "bom", "Em Expansão": "bom", "Em implantação": "bom",
  "Em negociação": "atencao", "Em renovação": "atencao", "Em Manutenção": "atencao",
  "Em risco": "ruim", "Bloqueado": "ruim", "Perdido / Churn": "ruim",
};

const stf = {
  contas: [], contatos: [], oportunidades: [], reunioes: [], atividades: [], metas: [],
  arm: {},
  ano: null,
  filtroEstagio: "",
  filtroTemperatura: "",
  editando: { conta: null, contato: null, op: null, reuniao: null, atividade: null },
  abertas: new Set(),
  feitasAbertas: false,
  // "tipo:id" do botão Excluir que já pediu confirmação (sobrevive aos redesenhos do tempo real).
  confirmando: null,
};
const STF_TABELAS = { contas: "stf_contas", contatos: "stf_contatos", oportunidades: "stf_oportunidades",
  reunioes: "stf_reunioes", atividades: "stf_atividades", metas: "stf_metas" };

/* ---------- Cálculos (sem tela) ---------- */

const stfAberta = (o) => !STF_FECHADOS.includes(o.estagio);
const stfValor = (o) => Number(o.valorEstimado) || 0;
const stfAnoHoje = () => hoje.getFullYear();
/* Ano em que a oportunidade foi fechada (Win/Lose); sem data, conta no ano atual. */
const stfAnoFechada = (o) => (o.fechadaEm ? Number(String(o.fechadaEm).slice(0, 4)) : stfAnoHoje());

function stfMetaDoAno(metas, ano) {
  return metas.find((m) => Number(m.ano) === Number(ano)) || null;
}

/* Números do painel para um ano: meta, realizado (Win no ano), pipeline (abertas) e quanto falta. */
function calcularPainelStf(oportunidades, metas, ano) {
  const meta = stfMetaDoAno(metas, ano);
  const valorMeta = meta ? Number(meta.valorMeta) || 0 : null;
  const ganhas = oportunidades.filter((o) => o.estagio === "Win" && stfAnoFechada(o) === Number(ano));
  const abertas = oportunidades.filter(stfAberta);
  const realizado = ganhas.reduce((t, o) => t + stfValor(o), 0);
  const pipeline = abertas.reduce((t, o) => t + stfValor(o), 0);
  return {
    ano: Number(ano),
    meta: valorMeta,
    realizado,
    pipeline,
    falta: valorMeta == null ? null : valorMeta - realizado,
    ganhas: ganhas.length,
    abertas: abertas.length,
    progresso: valorMeta ? Math.min(realizado / valorMeta, 1) : 0,
  };
}

/* Funil: contagem e soma de valor em cada estágio, na ordem. */
function calcularFunilStf(oportunidades) {
  return STF_ESTAGIOS.map((estagio) => {
    const lista = oportunidades.filter((o) => o.estagio === estagio);
    return { estagio, quantidade: lista.length, valor: lista.reduce((t, o) => t + stfValor(o), 0), fechado: STF_FECHADOS.includes(estagio) };
  });
}

/* ---------- Utilidades de tela ---------- */

const stfAttr = (t) => escapar(String(t ?? "")).replace(/"/g, "&quot;");
const stfData = (iso) => (iso ? isoParaBR(String(iso).slice(0, 10)) : "");
const stfIsoHoje = () => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
const stfConta = (id) => stf.contas.find((c) => c.id === id) || null;
const stfContato = (id) => stf.contatos.find((c) => c.id === id) || null;
const stfPorNome = (campo) => (a, b) => String(a[campo] || "").localeCompare(String(b[campo] || ""), "pt-BR");
const stfPlural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const stfOpcoes = (lista, vazio) => (vazio != null ? `<option value="">${escapar(vazio)}</option>` : "") +
  lista.map((v) => `<option value="${stfAttr(v)}">${escapar(v)}</option>`).join("");
const stfOpcoesContas = (vazio) => (vazio != null ? `<option value="">${escapar(vazio)}</option>` : "") +
  [...stf.contas].sort(stfPorNome("nome")).map((c) => `<option value="${stfAttr(c.id)}">${escapar(c.nome)}</option>`).join("");

function stfAviso(id, texto) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.hidden = !texto;
}

function stfChipStatus(status) {
  return `<span class="stf-chip stf-status ${STF_TOM_STATUS[status] || ""}">${escapar(status || "")}</span>`;
}
function stfChipEstagio(estagio) {
  const tom = estagio === "Win" ? "bom" : estagio === "Lose" ? "ruim" : "";
  return `<span class="stf-chip stf-estagio ${tom}">${escapar(estagio || "")}</span>`;
}
function stfChipTemperatura(t) {
  if (!t) return "";
  return `<span class="stf-chip stf-temp" data-temp="${STF_TEMPERATURAS.indexOf(t)}">${escapar(t)}</span>`;
}
function stfLinkConta(id) {
  const c = stfConta(id);
  return c ? `<span class="stf-conta-nome">🏢 ${escapar(c.nome)}</span>` : "";
}
function stfAcoes(tipo, id, nome) {
  const confirmando = stf.confirmando === `${tipo}:${id}`;
  return `<div class="stf-acoes">
      <button type="button" class="botao mini" data-stf-editar="${tipo}" data-id="${stfAttr(id)}" aria-label="Editar ${stfAttr(nome)}">Editar</button>
      <button type="button" class="botao mini${confirmando ? " perigo" : ""}" data-stf-excluir="${tipo}" data-id="${stfAttr(id)}"${confirmando ? ' data-confirmar="sim"' : ""} aria-label="Excluir ${stfAttr(nome)}">${confirmando ? "Excluir?" : "Excluir"}</button>
    </div>`;
}
function stfEmail(email) {
  if (!email) return "";
  return /^[^\s@<>"]+@[^\s@<>"]+$/.test(email)
    ? `<a href="mailto:${stfAttr(email)}">${escapar(email)}</a>` : escapar(email);
}
function stfTelefone(tel) {
  if (!tel) return "";
  const limpo = String(tel).replace(/[^\d+]/g, "");
  return limpo.length >= 8 ? `<a href="tel:${stfAttr(limpo)}">${escapar(tel)}</a>` : escapar(tel);
}

/* ---------- Formulários (genérico) ----------
 * Cada formulário tem campos com name = chave do objeto (camelCase). */

const STF_FORMS = {
  conta: { form: "stf-conta-form", titulo: "stf-conta-form-titulo", aviso: "stf-conta-aviso", botao: "stf-conta-adicionar", lista: "contas", novo: "Nova conta", campoNome: "nome" },
  contato: { form: "stf-contato-form", titulo: "stf-contato-form-titulo", aviso: "stf-contato-aviso", botao: "stf-contato-adicionar", lista: "contatos", novo: "Novo contato", campoNome: "nome" },
  op: { form: "stf-op-form", titulo: "stf-op-form-titulo", aviso: "stf-op-aviso", botao: "stf-op-adicionar", lista: "oportunidades", novo: "Nova oportunidade", campoNome: "nome" },
  reuniao: { form: "stf-reuniao-form", titulo: "stf-reuniao-form-titulo", aviso: "stf-reuniao-aviso", botao: "stf-reuniao-adicionar", lista: "reunioes", novo: "Nova reunião", campoNome: "titulo" },
  atividade: { form: "stf-atividade-form", titulo: "stf-atividade-form-titulo", aviso: "stf-atividade-aviso", botao: "stf-atividade-adicionar", lista: "atividades", novo: "Nova atividade", campoNome: "descricao" },
};
const STF_VISTA_DO_TIPO = { conta: "stefanini-contas", contato: "stefanini-contatos", op: "stefanini-oportunidades", reuniao: "stefanini-reunioes", atividade: "stefanini-atividades" };

function stfPreencherSelects(tipo, item) {
  const f = document.getElementById(STF_FORMS[tipo].form).elements;
  if (f.contaId) {
    const atual = item?.contaId || "";
    f.contaId.innerHTML = stfOpcoesContas(tipo === "op" ? "Escolha a conta" : "Sem conta");
    f.contaId.value = stfConta(atual) ? atual : "";
  }
  if (tipo === "op") stfPreencherContatosOp(item?.contatoId || "");
}

/* Contatos da conta escolhida na oportunidade (e o contato atual, se for de outra conta). */
function stfPreencherContatosOp(selecionado) {
  const f = document.getElementById("stf-op-form").elements;
  const contaId = f.contaId.value;
  const lista = stf.contatos.filter((c) => (contaId && c.contaId === contaId) || c.id === selecionado).sort(stfPorNome("nome"));
  f.contatoId.innerHTML = `<option value="">Sem contato</option>` +
    lista.map((c) => `<option value="${stfAttr(c.id)}">${escapar(c.nome)}${c.cargo ? ` — ${escapar(c.cargo)}` : ""}</option>`).join("");
  f.contatoId.value = lista.some((c) => c.id === selecionado) ? selecionado : "";
}

function stfAjustarFechamento() {
  const f = document.getElementById("stf-op-form").elements;
  document.getElementById("stf-op-fechada").hidden = !STF_FECHADOS.includes(f.estagio.value);
}

function stfAbrirForm(tipo, id, padrao = {}) {
  const cfg = STF_FORMS[tipo];
  const form = document.getElementById(cfg.form);
  const item = id ? stf[cfg.lista].find((x) => x.id === id) : null;
  stf.editando[tipo] = item ? id : null;
  form.reset();
  stfAviso(cfg.aviso, "");
  const dados = item || padrao;
  stfPreencherSelects(tipo, dados);
  for (const el of form.elements) {
    if (!el.name || el.name === "contaId" || el.name === "contatoId") continue;
    const v = dados[el.name];
    if (el.type === "checkbox") el.checked = !!v;
    else if (v != null) el.value = v;
  }
  if (tipo === "op") stfAjustarFechamento();
  document.getElementById(cfg.titulo).textContent = item ? `Editar ${item[cfg.campoNome]}` : cfg.novo;
  form.hidden = false;
  document.getElementById(cfg.botao).hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.querySelector("input:not([type=checkbox]):not([type=date]), textarea")?.focus({ preventScroll: true });
}

function stfFecharForm(tipo) {
  const cfg = STF_FORMS[tipo];
  stf.editando[tipo] = null;
  document.getElementById(cfg.form).hidden = true;
  document.getElementById(cfg.botao).hidden = false;
  stfAviso(cfg.aviso, "");
}

function stfLerForm(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") dados[el.name] = el.checked;
    else if (el.type === "number") {
      const t = String(el.value).trim().replace(",", ".");
      dados[el.name] = t === "" ? null : Number(t);
    } else dados[el.name] = String(el.value).trim() || null;
  }
  return dados;
}

/* Validação e ajuste de cada tipo. Devolve [mensagem de erro, campo] ou os dados prontos. */
const STF_VALIDAR = {
  conta(d) {
    if (!d.nome) return ["Dê um nome para a conta.", "nome"];
    if (!STF_STATUS.includes(d.status)) return ["Escolha o status da conta.", "status"];
    return { nome: d.nome, segmento: d.segmento, status: d.status, contratoStf: !!d.contratoStf, contratoSda: !!d.contratoSda,
      consultor: d.consultor, relacionamentoDesde: d.relacionamentoDesde, notas: d.notas };
  },
  contato(d) {
    if (!d.nome) return ["Dê um nome para o contato.", "nome"];
    if (d.temperatura && !STF_TEMPERATURAS.includes(d.temperatura)) return ["Escolha a temperatura.", "temperatura"];
    return { contaId: d.contaId, nome: d.nome, cargo: d.cargo, email: d.email, telefone: d.telefone, temperatura: d.temperatura, notas: d.notas };
  },
  op(d, anterior) {
    if (!d.nome) return ["Dê um nome para a oportunidade.", "nome"];
    if (!d.contaId || !stfConta(d.contaId)) return ["Escolha a conta da oportunidade.", "contaId"];
    if (!STF_ESTAGIOS.includes(d.estagio)) return ["Escolha o estágio.", "estagio"];
    if (d.valorEstimado != null && !(d.valorEstimado >= 0)) return ["O valor estimado precisa ser um número positivo.", "valorEstimado"];
    // Fechada (Win/Lose): guarda a data do fechamento; reaberta: a data sai.
    let fechadaEm = null;
    if (STF_FECHADOS.includes(d.estagio)) {
      fechadaEm = d.fechadaEm || (anterior && STF_FECHADOS.includes(anterior.estagio) ? anterior.fechadaEm : null) || stfIsoHoje();
    }
    const contato = stfContato(d.contatoId);
    return { contaId: d.contaId, contatoId: contato ? contato.id : null, nome: d.nome, estagio: d.estagio,
      valorEstimado: d.valorEstimado == null ? null : Math.round(d.valorEstimado * 100) / 100, fechadaEm, notas: d.notas };
  },
  reuniao(d) {
    if (!d.data) return ["Informe a data da reunião (dd/mm/aaaa).", "data"];
    if (!d.titulo) return ["Dê um título para a reunião.", "titulo"];
    return { contaId: d.contaId, data: d.data, titulo: d.titulo, anotacoes: d.anotacoes };
  },
  atividade(d, anterior) {
    if (!d.descricao) return ["Descreva a atividade.", "descricao"];
    const feita = anterior ? !!anterior.feita : false;
    return { contaId: d.contaId, descricao: d.descricao, data: d.data, feita, concluidaEm: feita ? anterior.concluidaEm || null : null };
  },
};

async function stfSalvarForm(tipo, evento) {
  evento.preventDefault();
  const cfg = STF_FORMS[tipo];
  const form = evento.target;
  const id = stf.editando[tipo];
  const anterior = id ? stf[cfg.lista].find((x) => x.id === id) : null;
  const r = STF_VALIDAR[tipo](stfLerForm(form), anterior);
  if (Array.isArray(r)) {
    stfAviso(cfg.aviso, r[0]);
    const campo = form.elements[r[1]];
    (campo?.type === "date" ? document.getElementById(campo.id + "-br") || campo : campo)?.focus();
    return;
  }
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await stf.arm[STF_TABELAS[cfg.lista]].salvar(id || null, r);
    stfFecharForm(tipo);
  } catch {
    stfAviso(cfg.aviso, "Não foi possível salvar. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

/* Exclusão com confirmação (segundo toque). Conta com oportunidades não pode ser excluída;
 * contatos, reuniões e atividades dela ficam sem conta (como o "on delete set null" do banco). */
async function stfExcluir(botao, tipo, id) {
  const cfg = STF_FORMS[tipo];
  const avisoId = tipo === "conta" ? "stf-contas-aviso" : cfg.aviso;
  if (tipo === "conta") {
    const ops = stf.oportunidades.filter((o) => o.contaId === id).length;
    if (ops) {
      stfAviso(avisoId, `Esta conta tem ${stfPlural(ops, "oportunidade", "oportunidades")}. Exclua-as ou mude-as de conta antes de excluir a conta.`);
      return;
    }
  }
  if (botao.dataset.confirmar !== "sim") {
    stf.confirmando = `${tipo}:${id}`;
    botao.dataset.confirmar = "sim";
    botao.textContent = "Excluir?";
    botao.classList.add("perigo");
    return;
  }
  stf.confirmando = null;
  botao.disabled = true;
  try {
    const sem = (lista, campo, nomeArm) => Promise.all(stf[lista].filter((x) => x[campo] === id)
      .map(({ id: idx, ...resto }) => stf.arm[nomeArm].salvar(idx, { ...resto, [campo]: null })));
    if (tipo === "conta") {
      await sem("contatos", "contaId", "stf_contatos");
      await sem("reunioes", "contaId", "stf_reunioes");
      await sem("atividades", "contaId", "stf_atividades");
      stf.abertas.delete(id);
    }
    if (tipo === "contato") await sem("oportunidades", "contatoId", "stf_oportunidades");
    await stf.arm[STF_TABELAS[cfg.lista]].excluir(id);
    if (stf.editando[tipo] === id) stfFecharForm(tipo);
    stfAviso(avisoId, "");
  } catch {
    botao.disabled = false;
    stfAviso(avisoId, "Não foi possível excluir. Tente de novo.");
  }
}

/* ---------- Painel ---------- */

function renderizarPainelStf() {
  const ano = stf.ano;
  const p = calcularPainelStf(stf.oportunidades, stf.metas, ano);
  document.getElementById("stf-ano").textContent = ano;
  const kpi = (rotulo, valor, chave, extra = "") =>
    `<div class="stf-kpi" data-kpi="${chave}"><span class="stf-kpi-rotulo">${rotulo}</span><strong class="stf-kpi-valor">${valor}</strong>${extra ? `<span class="stf-kpi-sub">${extra}</span>` : ""}</div>`;
  const faltaTexto = p.falta == null ? "—" : moeda.format(Math.max(p.falta, 0));
  const faltaSub = p.falta == null ? "defina a meta" : p.falta <= 0
    ? (p.falta < 0 ? `meta batida · ${moeda.format(-p.falta)} acima` : "meta batida") : `${Math.round(p.progresso * 100)}% da meta realizado`;
  document.getElementById("stf-kpis").innerHTML = `
    <div class="stf-kpi-grade">
      ${kpi(`Meta ${ano}`, p.meta == null ? "—" : moeda.format(p.meta), "meta", p.meta == null ? "sem meta para este ano" : "")}
      ${kpi("Realizado", moeda.format(p.realizado), "realizado", `${stfPlural(p.ganhas, "oportunidade ganha", "oportunidades ganhas")} no ano`)}
      ${kpi("Pipeline", moeda.format(p.pipeline), "pipeline", `${stfPlural(p.abertas, "oportunidade aberta", "oportunidades abertas")}`)}
      ${kpi("Quanto falta", faltaTexto, "falta", faltaSub)}
    </div>
    ${p.meta ? `<div class="barra stf-barra" role="progressbar" aria-label="Realizado da meta de ${ano}"><div class="preenchimento"></div></div>` : ""}`;
  const barra = document.querySelector("#stf-kpis .stf-barra");
  if (barra) preencherBarra(barra, p.progresso);
  document.getElementById("stf-meta-editar").textContent = p.meta == null ? `Definir meta de ${ano}` : `Editar meta de ${ano}`;

  const funil = calcularFunilStf(stf.oportunidades);
  const usarValor = funil.some((e) => e.valor > 0);
  const maximo = Math.max(...funil.map((e) => (usarValor ? e.valor : e.quantidade)), 0);
  const total = stf.oportunidades.length;
  document.getElementById("stf-funil").innerHTML = total
    ? `<ol class="stf-funil">${funil.map((e) => {
      const base = usarValor ? e.valor : e.quantidade;
      const largura = maximo ? Math.max((base / maximo) * 100, base ? 3 : 0) : 0;
      return `<li class="${e.fechado ? `fechado ${e.estagio === "Win" ? "bom" : "ruim"}` : ""}" data-estagio="${stfAttr(e.estagio)}">
          <span class="stf-funil-nome">${escapar(e.estagio)}</span>
          <span class="stf-funil-barra" aria-hidden="true"><span style="width:${largura.toFixed(1)}%"></span></span>
          <span class="stf-funil-num"><strong>${e.quantidade}</strong> · ${moeda.format(e.valor)}</span>
        </li>`;
    }).join("")}</ol>`
    : `<p class="estado">Nenhuma oportunidade ainda. Cadastre em <a href="#stefanini-oportunidades">Oportunidades</a>.</p>`;
}

function stfAbrirMeta() {
  const form = document.getElementById("stf-meta-form");
  const meta = stfMetaDoAno(stf.metas, stf.ano);
  form.elements.ano.value = stf.ano;
  form.elements.valorMeta.value = meta ? meta.valorMeta : "";
  stfAviso("stf-meta-aviso", "");
  form.hidden = false;
  document.getElementById("stf-meta-editar").hidden = true;
  form.elements.valorMeta.focus();
}
function stfFecharMeta() {
  document.getElementById("stf-meta-form").hidden = true;
  document.getElementById("stf-meta-editar").hidden = false;
  stfAviso("stf-meta-aviso", "");
}

async function stfSalvarMeta(e) {
  e.preventDefault();
  const d = stfLerForm(e.target);
  const ano = Math.round(Number(d.ano));
  if (!(ano >= 2000 && ano <= 2100)) return stfAviso("stf-meta-aviso", "Informe o ano da meta (ex.: 2026).");
  if (d.valorMeta == null || !(d.valorMeta >= 0)) return stfAviso("stf-meta-aviso", "Informe o valor da meta.");
  // Uma meta por ano: salvar num ano que já tem meta atualiza aquela.
  const existente = stfMetaDoAno(stf.metas, ano);
  const botao = e.target.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await stf.arm.stf_metas.salvar(existente ? existente.id : null, { ano, valorMeta: Math.round(d.valorMeta * 100) / 100 });
    stf.ano = ano;
    stfFecharMeta();
    renderizarPainelStf();
  } catch {
    stfAviso("stf-meta-aviso", "Não foi possível salvar a meta. Tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

/* ---------- Listas ---------- */

function stfCartaoOp(o) {
  const contato = stfContato(o.contatoId);
  return `<li class="stf-cartao" data-stf-item="op" data-id="${stfAttr(o.id)}">
      <div class="stf-cartao-topo"><h3>${escapar(o.nome)}</h3>${stfChipEstagio(o.estagio)}</div>
      <div class="stf-cartao-info">
        ${stfLinkConta(o.contaId)}
        ${contato ? `<span>👤 ${escapar(contato.nome)}</span>` : ""}
        <span class="stf-valor">${o.valorEstimado != null ? moeda.format(stfValor(o)) : "sem valor"}</span>
        ${o.fechadaEm && STF_FECHADOS.includes(o.estagio) ? `<span class="sub">fechada em ${stfData(o.fechadaEm)}</span>` : ""}
      </div>
      ${o.notas ? `<p class="stf-notas">${escapar(o.notas)}</p>` : ""}
      ${stfAcoes("op", o.id, o.nome)}
    </li>`;
}

function renderizarOportunidadesStf() {
  const ordem = (a, b) => STF_ESTAGIOS.indexOf(a.estagio) - STF_ESTAGIOS.indexOf(b.estagio) || stfValor(b) - stfValor(a) || stfPorNome("nome")(a, b);
  const todas = [...stf.oportunidades].sort(ordem);
  const lista = stf.filtroEstagio ? todas.filter((o) => o.estagio === stf.filtroEstagio) : todas;
  document.getElementById("stf-op-lista").innerHTML = lista.map(stfCartaoOp).join("");
  const vazio = document.getElementById("stf-op-vazio");
  vazio.hidden = lista.length > 0;
  vazio.textContent = !stf.contas.length && !todas.length
    ? "Nenhuma oportunidade ainda. Cadastre uma conta primeiro (em Contas) e depois a oportunidade dela."
    : todas.length ? "Nenhuma oportunidade neste estágio." : "Nenhuma oportunidade ainda.";
  const soma = lista.reduce((t, o) => t + stfValor(o), 0);
  document.getElementById("stf-op-resumo").textContent = todas.length ? `${stfPlural(lista.length, "oportunidade", "oportunidades")} · ${moeda.format(soma)}` : "";
}

function stfCartaoContato(c) {
  return `<li class="stf-cartao" data-stf-item="contato" data-id="${stfAttr(c.id)}">
      <div class="stf-cartao-topo"><h3>${escapar(c.nome)}</h3>${stfChipTemperatura(c.temperatura)}</div>
      <div class="stf-cartao-info">
        ${c.cargo ? `<span>${escapar(c.cargo)}</span>` : ""}
        ${stfLinkConta(c.contaId)}
        ${c.email ? `<span>${stfEmail(c.email)}</span>` : ""}
        ${c.telefone ? `<span>${stfTelefone(c.telefone)}</span>` : ""}
      </div>
      ${c.notas ? `<p class="stf-notas">${escapar(c.notas)}</p>` : ""}
      ${stfAcoes("contato", c.id, c.nome)}
    </li>`;
}

function renderizarContatosStf() {
  const todos = [...stf.contatos].sort(stfPorNome("nome"));
  const lista = stf.filtroTemperatura ? todos.filter((c) => c.temperatura === stf.filtroTemperatura) : todos;
  document.getElementById("stf-contato-lista").innerHTML = lista.map(stfCartaoContato).join("");
  const vazio = document.getElementById("stf-contato-vazio");
  vazio.hidden = lista.length > 0;
  vazio.textContent = todos.length ? "Nenhum contato com esta temperatura." : "Nenhum contato ainda.";
  document.getElementById("stf-contato-resumo").textContent = todos.length ? stfPlural(lista.length, "contato", "contatos") : "";
}

function stfCartaoReuniao(r, curto = false) {
  return `<li class="stf-cartao" data-stf-item="reuniao" data-id="${stfAttr(r.id)}">
      <div class="stf-cartao-topo"><h3>${escapar(r.titulo)}</h3><span class="stf-data">${stfData(r.data)}</span></div>
      <div class="stf-cartao-info">${curto ? "" : stfLinkConta(r.contaId)}</div>
      ${r.anotacoes ? `<p class="stf-notas">${escapar(r.anotacoes)}</p>` : ""}
      ${curto ? "" : stfAcoes("reuniao", r.id, r.titulo)}
    </li>`;
}

function renderizarReunioesStf() {
  const lista = [...stf.reunioes].sort((a, b) => String(b.data).localeCompare(String(a.data)) || stfPorNome("titulo")(a, b));
  document.getElementById("stf-reuniao-lista").innerHTML = lista.map((r) => stfCartaoReuniao(r)).join("");
  document.getElementById("stf-reuniao-vazio").hidden = lista.length > 0;
}

function stfCartaoAtividade(a, curto = false) {
  const atrasada = !a.feita && a.data && a.data < stfIsoHoje();
  return `<li class="stf-cartao stf-atividade${a.feita ? " feita" : ""}" data-stf-item="atividade" data-id="${stfAttr(a.id)}">
      <label class="stf-check">
        <input type="checkbox" data-stf-feita="${stfAttr(a.id)}" ${a.feita ? "checked" : ""} aria-label="Feita: ${stfAttr(a.descricao)}">
        <span class="stf-descricao">${escapar(a.descricao)}</span>
      </label>
      <div class="stf-cartao-info">
        ${a.data ? `<span class="stf-data${atrasada ? " atrasada" : ""}">${atrasada ? "Atrasada · " : ""}${stfData(a.data)}</span>` : ""}
        ${curto ? "" : stfLinkConta(a.contaId)}
        ${a.feita && a.concluidaEm ? `<span class="sub">feita em ${stfData(a.concluidaEm)}</span>` : ""}
      </div>
      ${curto ? "" : stfAcoes("atividade", a.id, a.descricao)}
    </li>`;
}

const stfOrdemPendentes = (a, b) => (a.data ? 0 : 1) - (b.data ? 0 : 1) || String(a.data || "").localeCompare(String(b.data || "")) || stfPorNome("descricao")(a, b);
const stfOrdemFeitas = (a, b) => String(b.concluidaEm || "").localeCompare(String(a.concluidaEm || ""));

function renderizarAtividadesStf() {
  const pendentes = stf.atividades.filter((a) => !a.feita).sort(stfOrdemPendentes);
  const feitas = stf.atividades.filter((a) => a.feita).sort(stfOrdemFeitas);
  document.getElementById("stf-atividade-lista").innerHTML = pendentes.map((a) => stfCartaoAtividade(a)).join("");
  const vazio = document.getElementById("stf-atividade-vazio");
  vazio.hidden = pendentes.length > 0;
  vazio.textContent = stf.atividades.length ? "Nenhuma atividade pendente. 🎉" : "Nenhuma atividade ainda.";
  const caixa = document.getElementById("stf-feitas");
  caixa.hidden = feitas.length === 0;
  caixa.open = stf.feitasAbertas;
  document.getElementById("stf-feitas-titulo").textContent = `Feitas (${feitas.length})`;
  document.getElementById("stf-feitas-lista").innerHTML = feitas.map((a) => stfCartaoAtividade(a)).join("");
}

async function stfMarcarFeita(caixa) {
  const a = stf.atividades.find((x) => x.id === caixa.dataset.stfFeita);
  if (!a) return;
  const { id, ...resto } = a;
  const feita = caixa.checked;
  caixa.disabled = true;
  try {
    await stf.arm.stf_atividades.salvar(id, { ...resto, feita, concluidaEm: feita ? new Date().toISOString() : null });
    stfAviso("stf-atividade-aviso", "");
  } catch {
    caixa.checked = !feita;
    caixa.disabled = false;
    stfAviso("stf-atividade-aviso", "Não foi possível atualizar a atividade. Tente de novo.");
  }
}

/* Contas: cartão com o detalhe (contatos, oportunidades, reuniões e atividades ligados). */
function stfDetalheConta(c) {
  const contatos = stf.contatos.filter((x) => x.contaId === c.id).sort(stfPorNome("nome"));
  const ops = stf.oportunidades.filter((x) => x.contaId === c.id)
    .sort((a, b) => STF_ESTAGIOS.indexOf(a.estagio) - STF_ESTAGIOS.indexOf(b.estagio));
  const reunioes = stf.reunioes.filter((x) => x.contaId === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const atividades = stf.atividades.filter((x) => x.contaId === c.id)
    .sort((a, b) => (a.feita ? 1 : 0) - (b.feita ? 1 : 0) || (a.feita ? stfOrdemFeitas(a, b) : stfOrdemPendentes(a, b)));
  const grupo = (chave, titulo, itens, novo, rotuloNovo, vazio) => `
    <div class="stf-grupo" data-grupo="${chave}">
      <div class="stf-grupo-topo">
        <h4>${titulo} <span class="sub">(${itens.length})</span></h4>
        <button type="button" class="botao mini" data-stf-novo="${novo}" data-conta="${stfAttr(c.id)}">${rotuloNovo}</button>
      </div>
      ${itens.length ? `<ul class="stf-mini">${itens.join("")}</ul>` : `<p class="sub">${vazio}</p>`}
    </div>`;
  return `
    <div class="stf-detalhe">
      <dl class="detalhes stf-dados-conta">${listaDetalhes([
        ["Contrato STF", c.contratoStf ? "Sim" : "Não"],
        ["Contrato SDA", c.contratoSda ? "Sim" : "Não"],
        ["Relacionamento desde", c.relacionamentoDesde ? stfData(c.relacionamentoDesde) : "—"],
      ])}</dl>
      ${c.notas ? `<p class="stf-notas">${escapar(c.notas)}</p>` : ""}
      ${grupo("contatos", "Contatos", contatos.map((x) => `<li>${escapar(x.nome)}${x.cargo ? ` <span class="sub">${escapar(x.cargo)}</span>` : ""} ${stfChipTemperatura(x.temperatura)}</li>`), "contato", "+ Contato", "Nenhum contato.")}
      ${grupo("oportunidades", "Oportunidades", ops.map((x) => `<li>${escapar(x.nome)} ${stfChipEstagio(x.estagio)} <span class="stf-valor">${x.valorEstimado != null ? moeda.format(stfValor(x)) : ""}</span></li>`), "op", "+ Oportunidade", "Nenhuma oportunidade.")}
      ${grupo("reunioes", "Reuniões", reunioes.map((x) => `<li><span class="stf-data">${stfData(x.data)}</span> ${escapar(x.titulo)}</li>`), "reuniao", "+ Reunião", "Nenhuma reunião.")}
      ${grupo("atividades", "Atividades", atividades.map((x) => `<li class="${x.feita ? "feita" : ""}">${x.feita ? "✓" : "○"} ${escapar(x.descricao)}${x.data ? ` <span class="sub">${stfData(x.data)}</span>` : ""}</li>`), "atividade", "+ Atividade", "Nenhuma atividade.")}
    </div>`;
}

function stfCartaoConta(c) {
  const aberta = stf.abertas.has(c.id);
  const ops = stf.oportunidades.filter((o) => o.contaId === c.id);
  const contratos = [c.contratoStf ? "STF" : "", c.contratoSda ? "SDA" : ""].filter(Boolean);
  return `<li class="stf-cartao stf-conta${aberta ? " aberta" : ""}" data-stf-item="conta" data-id="${stfAttr(c.id)}">
      <div class="stf-cartao-topo">
        <button type="button" class="stf-abrir" data-stf-abrir="${stfAttr(c.id)}" aria-expanded="${aberta}">
          <h3>${escapar(c.nome)}</h3><span class="seta" aria-hidden="true"></span>
        </button>
        ${stfChipStatus(c.status)}
      </div>
      <div class="stf-cartao-info">
        ${c.segmento ? `<span>${escapar(c.segmento)}</span>` : ""}
        ${c.consultor ? `<span>Consultor: ${escapar(c.consultor)}</span>` : ""}
        ${contratos.map((t) => `<span class="stf-chip stf-contrato">${t}</span>`).join("")}
        <span class="sub">${stfPlural(ops.length, "oportunidade", "oportunidades")}</span>
      </div>
      ${aberta ? stfDetalheConta(c) : ""}
      ${stfAcoes("conta", c.id, c.nome)}
    </li>`;
}

function renderizarContasStf() {
  const lista = [...stf.contas].sort(stfPorNome("nome"));
  document.getElementById("stf-conta-lista").innerHTML = lista.map(stfCartaoConta).join("");
  document.getElementById("stf-conta-vazio").hidden = lista.length > 0;
  document.getElementById("stf-conta-resumo").textContent = lista.length ? stfPlural(lista.length, "conta", "contas") : "";
}

function renderizarStefanini() {
  if (!document.getElementById("stf-kpis")) return;
  renderizarPainelStf();
  renderizarOportunidadesStf();
  renderizarContasStf();
  renderizarContatosStf();
  renderizarReunioesStf();
  renderizarAtividadesStf();
  // Formulário aberto: as listas de contas/contatos acompanham o que mudou.
  for (const tipo of Object.keys(STF_FORMS)) {
    const form = document.getElementById(STF_FORMS[tipo].form);
    if (form.hidden || !form.elements.contaId) continue;
    const conta = form.elements.contaId.value;
    const contato = form.elements.contatoId?.value;
    form.elements.contaId.innerHTML = stfOpcoesContas(tipo === "op" ? "Escolha a conta" : "Sem conta");
    form.elements.contaId.value = stfConta(conta) ? conta : "";
    if (tipo === "op") stfPreencherContatosOp(contato);
  }
}

/* ---------- Início ---------- */

async function iniciarStefanini() {
  if (!document.getElementById("stf-kpis")) return;
  stf.ano = stfAnoHoje();
  document.getElementById("stf-op-filtro").innerHTML = stfOpcoes(STF_ESTAGIOS, "Todos os estágios");
  document.getElementById("stf-contato-filtro").innerHTML = stfOpcoes(STF_TEMPERATURAS, "Todas as temperaturas");
  document.getElementById("stf-op-estagio").innerHTML = stfOpcoes(STF_ESTAGIOS);
  document.getElementById("stf-conta-status").innerHTML = stfOpcoes(STF_STATUS);
  document.getElementById("stf-contato-temperatura").innerHTML = stfOpcoes(STF_TEMPERATURAS, "Sem temperatura");

  for (const tipo of Object.keys(STF_FORMS)) {
    const cfg = STF_FORMS[tipo];
    document.getElementById(cfg.botao).addEventListener("click", () => stfAbrirForm(tipo, null));
    document.getElementById(cfg.form).addEventListener("submit", (e) => stfSalvarForm(tipo, e));
    document.getElementById(cfg.form).querySelector("[data-stf-cancelar]").addEventListener("click", () => stfFecharForm(tipo));
  }
  document.getElementById("stf-op-form").elements.contaId.addEventListener("change", () =>
    stfPreencherContatosOp(document.getElementById("stf-op-form").elements.contatoId.value));
  document.getElementById("stf-op-estagio").addEventListener("change", stfAjustarFechamento);
  document.getElementById("stf-op-filtro").addEventListener("change", (e) => { stf.filtroEstagio = e.target.value; renderizarOportunidadesStf(); });
  document.getElementById("stf-contato-filtro").addEventListener("change", (e) => { stf.filtroTemperatura = e.target.value; renderizarContatosStf(); });
  document.getElementById("stf-meta-editar").addEventListener("click", stfAbrirMeta);
  document.getElementById("stf-meta-cancelar").addEventListener("click", stfFecharMeta);
  document.getElementById("stf-meta-form").addEventListener("submit", stfSalvarMeta);
  document.getElementById("stf-ano-anterior").addEventListener("click", () => { stf.ano--; stfFecharMeta(); renderizarPainelStf(); });
  document.getElementById("stf-ano-proximo").addEventListener("click", () => { stf.ano++; stfFecharMeta(); renderizarPainelStf(); });
  document.getElementById("stf-feitas").addEventListener("toggle", (e) => { stf.feitasAbertas = e.target.open; });

  // Botões dos cartões (as listas são redesenhadas a cada mudança): um ouvinte só.
  document.addEventListener("click", (e) => {
    const alvo = e.target.closest?.("[data-stf-editar], [data-stf-excluir], [data-stf-abrir], [data-stf-novo]");
    // Tocar em outra coisa cancela o "Excluir?" pendente.
    if (stf.confirmando && (!alvo?.dataset.stfExcluir || `${alvo.dataset.stfExcluir}:${alvo.dataset.id}` !== stf.confirmando)) {
      stf.confirmando = null;
      document.querySelectorAll(".vista-stefanini [data-stf-excluir][data-confirmar]").forEach((b) => {
        delete b.dataset.confirmar; b.textContent = "Excluir"; b.classList.remove("perigo");
      });
    }
    if (!alvo) return;
    if (alvo.dataset.stfEditar) return stfAbrirForm(alvo.dataset.stfEditar, alvo.dataset.id);
    if (alvo.dataset.stfExcluir) return stfExcluir(alvo, alvo.dataset.stfExcluir, alvo.dataset.id);
    if (alvo.dataset.stfAbrir) {
      const id = alvo.dataset.stfAbrir;
      stf.abertas.has(id) ? stf.abertas.delete(id) : stf.abertas.add(id);
      return renderizarContasStf();
    }
    if (alvo.dataset.stfNovo) {
      // Da conta aberta: vai para a aba do tipo com o formulário já ligado à conta.
      const tipo = alvo.dataset.stfNovo;
      const contaId = alvo.dataset.conta;
      const abrir = () => stfAbrirForm(tipo, null, { contaId });
      if (location.hash === "#" + STF_VISTA_DO_TIPO[tipo]) return abrir();
      document.addEventListener("vista-mostrada", abrir, { once: true });
      location.hash = STF_VISTA_DO_TIPO[tipo];
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches?.("[data-stf-feita]")) stfMarcarFeita(e.target);
  });

  renderizarStefanini();
  const nomes = Object.entries(STF_TABELAS);
  for (const [, tabela] of nomes) stf.arm[tabela] = await abrirArmazenamento(tabela, []);
  for (const [chave, tabela] of nomes) {
    stf.arm[tabela].observar((lista) => { stf[chave] = lista; renderizarStefanini(); },
      () => stfAviso("stf-aviso", "Não foi possível carregar o CRM Stefanini. Recarregue a página."));
  }
}

iniciarStefanini();

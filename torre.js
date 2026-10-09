/* ---------- Torre: ganhos, gastos e investimentos ----------
 * Usa as funções de app.js (moeda, escapar, alternar, preencherBarra,
 * abrirArmazenamento). Cada bloco tem sua própria coleção.
 */

const porcento = (v) => `${Math.round(v * 100)}%`;
// Recorrentes valem a partir do mês em que foram lançados; os demais, só no próprio mês.
const doMes = (item) => (item.recorrente ? !item.mes || item.mes <= mesRef : item.mes === mesRef);

const torre = {
  ganhos: [],
  gastos: [],
  investimentos: [],
  parcelasMes: 0,
  armazenamentos: {},
};

const CAMPOS_MENSAIS = [
  { nome: "nome", rotulo: "Descrição", tipo: "text", largo: true, obrigatorio: true },
  { nome: "valor", rotulo: "Valor (R$)", tipo: "number", obrigatorio: true },
  { nome: "recorrente", rotulo: "Todo mês", tipo: "checkbox" },
];

const BLOCOS = {
  ganhos: {
    titulo: "Quanto eu ganho",
    novo: "+ Adicionar ganho",
    campos: CAMPOS_MENSAIS,
    padrao: { recorrente: true },
  },
  gastos: {
    titulo: "Quanto eu gastei",
    novo: "+ Adicionar gasto avulso",
    dica: "Use para gastos fora do cartão e fora das contas (Pix, dinheiro, débito). Compras no cartão já entram pela fatura.",
    campos: CAMPOS_MENSAIS,
    padrao: { recorrente: false },
  },
  investimentos: {
    titulo: "Investimentos",
    novo: "+ Adicionar investimento",
    campos: [
      { nome: "nome", rotulo: "Nome", tipo: "text", largo: true, obrigatorio: true },
      { nome: "valorAplicado", rotulo: "Valor aplicado (R$)", tipo: "number", obrigatorio: true },
      { nome: "valorAtual", rotulo: "Valor atual (R$)", tipo: "number", obrigatorio: true },
      { nome: "meta", rotulo: "Meta (R$, opcional)", tipo: "number", largo: true },
    ],
    padrao: {},
  },
};

const soma = (lista, campo) => lista.reduce((t, i) => t + (Number(i[campo]) || 0), 0);

/* Fluxo do dinheiro no mês da timeline.
 *   Entradas = ganhos do mês
 *   Saídas   = contas do controle de pagamentos (inclui faturas de cartão)
 *            + parcelas das dívidas + gastos avulsos (fora do cartão)
 *   Já saiu  = contas pagas + parcelas já vencidas + gastos avulsos
 *   Sobra    = entradas − saídas (previsão para o fim do mês)
 */
function resumoDoMes() {
  const ganhos = soma(torre.ganhos.filter(doMes), "valor");
  const gastos = soma(torre.gastos.filter(doMes), "valor");
  let contas = [];
  try { contas = typeof pag !== "undefined" ? pag.contas : []; } catch {}
  contas = contas.filter((c) => String(c.vencimento || "").startsWith(mesRef));
  const contasPagas = soma(contas.filter((c) => c.status === "pago"), "valor");
  const contasAPagar = soma(contas.filter((c) => c.status !== "pago"), "valor");
  let dividas = [];
  try { dividas = typeof dividasCalculadas !== "undefined" ? dividasCalculadas.filter((d) => d.ativaNoMes) : []; } catch {}
  const parcelasPagas = soma(dividas.filter((d) => d.vencimentoNoMes && d.vencimentoNoMes < hoje), "valorParcela");
  const parcelas = dividas.length ? soma(dividas, "valorParcela") : torre.parcelasMes;
  const parcelasAPagar = parcelas - parcelasPagas;

  // Dinheiro guardado nas metas no mês (guardado − retirado) sai do disponível.
  const guardado = typeof guardadoNoMes === "function" ? guardadoNoMes(mesRef) : 0;
  const saidas = contasPagas + contasAPagar + parcelas + gastos + guardado;
  const jaSaiu = contasPagas + parcelasPagas + gastos + guardado;
  const aSair = contasAPagar + parcelasAPagar;
  return {
    ganhos, gastos, parcelas, parcelasPagas, parcelasAPagar,
    contasPagas, contasAPagar, qtdContas: contas.length, guardado,
    saidas, jaSaiu, aSair,
    disponivel: ganhos - jaSaiu,
    sobra: ganhos - saidas,
  };
}

/* Bloco "Dinheiro do mês": entradas, saídas e quanto sobra. */
function renderizarFluxo() {
  const raiz = document.getElementById("bloco-fluxo");
  if (!raiz) return;
  const r = resumoDoMes();
  const vazio = !r.ganhos && !r.saidas;
  const escala = Math.max(r.ganhos, r.saidas) || 1;
  const pct = (v) => `${Math.max(0, (v / escala) * 100)}%`;
  const sinal = (v) => (v < 0 ? "−" : "") + moeda.format(Math.abs(v));
  const aberto = raiz.querySelector(".linha")?.getAttribute("aria-expanded") === "true";

  raiz.innerHTML = `
    <div class="painel-cabecalho">
      <h2 class="titulo-bloco">Dinheiro do mês</h2>
      <span class="mes-atual">${nomeMesRef()}</span>
    </div>
    ${vazio ? `<p class="estado">Cadastre seus ganhos e suas contas para ver quanto entra, quanto sai e quanto sobra.</p>` : `
    <div class="fluxo-numeros">
      <div><span class="rotulo-fluxo">Entradas</span> <strong class="entrada">${moeda.format(r.ganhos)}</strong></div>
      <div><span class="rotulo-fluxo">Saídas</span> <strong class="saida">${moeda.format(r.saidas)}</strong></div>
      <div><span class="rotulo-fluxo">${r.sobra >= 0 ? "Sobra" : "Falta"}</span> <strong class="${r.sobra >= 0 ? "entrada" : "saida"}">${moeda.format(Math.abs(r.sobra))}</strong></div>
    </div>
    <div class="fluxo-barras" aria-hidden="true">
      <div class="fluxo-trilho"><span class="seg-entrada" style="width:${pct(r.ganhos)}"></span></div>
      <div class="fluxo-trilho">
        <span class="seg-saiu" style="width:${pct(r.jaSaiu)}"></span><span class="seg-vai-sair" style="width:${pct(r.aSair)}"></span>
      </div>
    </div>
    <div class="porcentagem">
      <span>Disponível agora <strong>${sinal(r.disponivel)}</strong></span>
      <span>Ainda vai sair <strong>${moeda.format(r.aSair)}</strong></span>
    </div>
    <button class="linha" aria-expanded="${aberto}" aria-controls="detalhes-fluxo">
      <span class="rotulo">Ver de onde vem e para onde vai</span><span></span>
      <span class="seta" aria-hidden="true"></span>
    </button>
    <dl class="detalhes" id="detalhes-fluxo" ${aberto ? "" : "hidden"}>
      ${listaDetalhes([
        ["<strong>Entradas</strong>", `<strong>${moeda.format(r.ganhos)}</strong>`],
        ["Ganhos do mês", moeda.format(r.ganhos)],
        ["<strong>Já saiu</strong>", `<strong>− ${moeda.format(r.jaSaiu)}</strong>`],
        ["Contas pagas", "− " + moeda.format(r.contasPagas)],
        ["Parcelas de dívidas já vencidas", "− " + moeda.format(r.parcelasPagas)],
        ["Gastos avulsos", "− " + moeda.format(r.gastos)],
        ...(r.guardado ? [[r.guardado > 0 ? "Guardado nas metas" : "Retirado das metas", (r.guardado > 0 ? "− " : "+ ") + moeda.format(Math.abs(r.guardado))]] : []),
        ["<strong>Disponível agora</strong>", `<strong>${sinal(r.disponivel)}</strong>`],
        ["<strong>Ainda vai sair</strong>", `<strong>− ${moeda.format(r.aSair)}</strong>`],
        ["Contas a pagar", "− " + moeda.format(r.contasAPagar)],
        ["Parcelas de dívidas a vencer", "− " + moeda.format(r.parcelasAPagar)],
        [`<strong>${r.sobra >= 0 ? "Sobra" : "Falta"} no fim do mês</strong>`, `<strong>${sinal(r.sobra)}</strong>`],
      ])}
    </dl>`}`;
  const botao = raiz.querySelector(".linha");
  if (botao) botao.addEventListener("click", () => {
    const abrir = botao.getAttribute("aria-expanded") !== "true";
    botao.setAttribute("aria-expanded", String(abrir));
    raiz.querySelector(".detalhes").hidden = !abrir;
  });
}

/* Conteúdo de cada bloco: destaque, barra e linhas de detalhe. */
function conteudo(tipo) {
  const r = resumoDoMes();
  if (tipo === "ganhos") {
    const comprometido = r.ganhos ? r.saidas / r.ganhos : 0;
    return {
      destaque: moeda.format(r.ganhos),
      progresso: Math.min(comprometido, 1),
      perigo: comprometido > 1,
      legenda: [`${porcento(comprometido)} comprometido`, `${r.sobra >= 0 ? "sobra" : "falta"} ${moeda.format(Math.abs(r.sobra))}`],
      resumo: [
        ["Recebido no mês", moeda.format(r.ganhos)],
        ["Saídas do mês", "− " + moeda.format(r.saidas)],
        [r.sobra >= 0 ? "Sobra do mês" : "Falta no mês", moeda.format(r.sobra)],
      ],
    };
  }
  if (tipo === "gastos") {
    const daRenda = r.ganhos ? r.saidas / r.ganhos : 0;
    return {
      destaque: moeda.format(r.saidas),
      progresso: Math.min(daRenda, 1),
      perigo: daRenda > 1,
      legenda: [r.ganhos ? `${porcento(daRenda)} da renda` : "", `a pagar ${moeda.format(r.aSair)}`],
      resumo: [
        [`Contas do controle de pagamentos (${r.qtdContas})`, moeda.format(r.contasPagas + r.contasAPagar)],
        ["Parcelas das dívidas", moeda.format(r.parcelas)],
        ["Gastos avulsos (fora do cartão)", moeda.format(r.gastos)],
        ...(r.guardado ? [["Guardado nas metas", moeda.format(r.guardado)]] : []),
        ["Já pago", moeda.format(r.jaSaiu)],
        ["Ainda a pagar", moeda.format(r.aSair)],
      ],
    };
  }
  const aplicado = soma(torre.investimentos, "valorAplicado");
  const atual = soma(torre.investimentos, "valorAtual");
  const comMeta = torre.investimentos.filter((i) => Number(i.meta) > 0);
  const meta = soma(comMeta, "meta");
  const atualComMeta = soma(comMeta, "valorAtual");
  const rendimento = atual - aplicado;
  return {
    destaque: moeda.format(atual),
    progresso: meta ? Math.min(atualComMeta / meta, 1) : null,
    legenda: [
      `${rendimento >= 0 ? "+" : "−"}${moeda.format(Math.abs(rendimento))} de rendimento`,
      meta ? `${porcento(atualComMeta / meta)} das metas` : "",
    ],
    resumo: [
      ["Total aplicado", moeda.format(aplicado)],
      ["Valor atual", moeda.format(atual)],
      ["Rendimento", `${moeda.format(rendimento)} (${aplicado ? porcento(rendimento / aplicado) : "0%"})`],
      ...(meta ? [["Metas somadas", moeda.format(meta)]] : []),
    ],
  };
}

function linhaItem(tipo, item) {
  if (tipo === "investimentos") {
    const rend = item.valorAtual - item.valorAplicado;
    const extra = Number(item.meta) > 0 ? ` · meta ${porcento(item.valorAtual / item.meta)}` : "";
    return {
      valor: moeda.format(item.valorAtual),
      sub: `${rend >= 0 ? "+" : "−"}${moeda.format(Math.abs(rend))}${extra}`,
    };
  }
  return { valor: moeda.format(item.valor), sub: item.recorrente ? "todo mês" : "só este mês" };
}

function renderizarBloco(tipo) {
  const cfg = BLOCOS[tipo];
  const raiz = document.getElementById("bloco-" + tipo);
  const c = conteudo(tipo);
  const itens = torre[tipo]
    .filter((i) => tipo === "investimentos" || doMes(i))
    .sort((a, b) => (Number(b.valor ?? b.valorAtual) || 0) - (Number(a.valor ?? a.valorAtual) || 0));

  raiz.querySelector(".valor").textContent = c.destaque;
  const barra = raiz.querySelector(".barra");
  barra.hidden = c.progresso == null;
  barra.classList.toggle("alerta", !!c.perigo);
  if (c.progresso != null) preencherBarra(barra, c.progresso);
  raiz.querySelector(".porcentagem").innerHTML = c.legenda.map((t) => `<span>${t}</span>`).join("");

  raiz.querySelector(".resumo-bloco").innerHTML = listaDetalhes(c.resumo);
  const ul = raiz.querySelector(".itens");
  ul.innerHTML = itens.length
    ? ""
    : `<li class="estado">Nada cadastrado ainda.</li>`;
  itens.forEach((item) => {
    const l = linhaItem(tipo, item);
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-texto">
        <span class="item-nome">${escapar(item.nome)}</span>
        <span class="item-sub">${l.sub}</span>
      </div>
      <span class="item-valor">${l.valor}</span>
      <div class="item-acoes">
        <button type="button" class="botao mini" data-acao="editar">Editar</button>
        <button type="button" class="botao mini" data-acao="excluir">Excluir</button>
      </div>`;
    li.querySelector("[data-acao=editar]").addEventListener("click", () => abrirFormularioTorre(tipo, item.id));
    const ex = li.querySelector("[data-acao=excluir]");
    ex.addEventListener("click", async () => {
      if (ex.dataset.confirmar !== "sim") {
        ex.dataset.confirmar = "sim";
        ex.textContent = "Confirmar";
        ex.classList.add("perigo");
        return;
      }
      ex.disabled = true;
      try { await torre.armazenamentos[tipo].excluir(item.id); }
      catch { ex.disabled = false; avisoTorre(tipo, "Não foi possível excluir. Tente de novo."); }
    });
    ul.appendChild(li);
  });
}

function renderizarTorre() {
  renderizarFluxo();
  Object.keys(BLOCOS).forEach(renderizarBloco);
}

function avisoTorre(tipo, texto) {
  const aviso = document.querySelector(`#bloco-${tipo} .aviso`);
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

function abrirFormularioTorre(tipo, id) {
  const raiz = document.getElementById("bloco-" + tipo);
  const form = raiz.querySelector("form");
  const item = torre[tipo].find((i) => i.id === id) || BLOCOS[tipo].padrao;
  form.dataset.id = id || "";
  form.querySelector("h3").textContent = id ? "Editar" : BLOCOS[tipo].novo.replace("+ ", "");
  BLOCOS[tipo].campos.forEach((c) => {
    const el = form.elements[c.nome];
    if (c.tipo === "checkbox") el.checked = !!item[c.nome];
    else el.value = item[c.nome] ?? "";
  });
  form.hidden = false;
  raiz.querySelector(".adicionar").hidden = true;
  // garante que os detalhes estejam abertos
  const botao = raiz.querySelector(".linha");
  if (botao.getAttribute("aria-expanded") !== "true") botao.click();
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioTorre(tipo) {
  const raiz = document.getElementById("bloco-" + tipo);
  raiz.querySelector("form").hidden = true;
  raiz.querySelector(".adicionar").hidden = false;
  avisoTorre(tipo, "");
}

async function salvarTorre(tipo, evento) {
  evento.preventDefault();
  const form = evento.target;
  const id = form.dataset.id;
  const anterior = torre[tipo].find((i) => i.id === id);
  const dados = {};
  for (const c of BLOCOS[tipo].campos) {
    const el = form.elements[c.nome];
    if (c.tipo === "checkbox") dados[c.nome] = el.checked;
    else if (c.tipo === "number") {
      const bruto = el.value.trim().replace(",", ".");
      if (bruto === "") {
        if (c.obrigatorio) return avisoTorre(tipo, `Preencha “${c.rotulo}”.`);
        continue;
      }
      const n = Number(bruto);
      if (!(n >= 0)) return avisoTorre(tipo, `“${c.rotulo}” precisa ser um número positivo.`);
      dados[c.nome] = n;
    } else {
      dados[c.nome] = el.value.trim();
      if (c.obrigatorio && !dados[c.nome]) return avisoTorre(tipo, `Preencha “${c.rotulo}”.`);
    }
  }
  if (tipo !== "investimentos") dados.mes = anterior?.mes || mesRef;

  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await torre.armazenamentos[tipo].salvar(id || null, dados);
    fecharFormularioTorre(tipo);
  } catch {
    avisoTorre(tipo, "Não foi possível salvar. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

function montarBloco(tipo) {
  const cfg = BLOCOS[tipo];
  const raiz = document.getElementById("bloco-" + tipo);
  const campos = cfg.campos.map((c) => {
    const id = `campo-${tipo}-${c.nome}`;
    if (c.tipo === "checkbox") {
      return `<label class="campo-check largo"><input id="${id}" name="${c.nome}" type="checkbox"> ${c.rotulo}</label>`;
    }
    const num = c.tipo === "number" ? ' min="0" step="0.01" inputmode="decimal"' : ' maxlength="60"';
    return `<label class="campo${c.largo ? " largo" : ""}">${c.rotulo}
      <input id="${id}" name="${c.nome}" type="${c.tipo}"${num}></label>`;
  }).join("");

  raiz.innerHTML = `
    <button class="linha" aria-expanded="false" aria-controls="detalhes-${tipo}">
      <span class="rotulo titulo-bloco">${cfg.titulo}</span>
      <span class="valor"></span>
      <span class="seta" aria-hidden="true"></span>
    </button>
    <div class="barra" role="progressbar" aria-label="${cfg.titulo}"><div class="preenchimento"></div></div>
    <div class="porcentagem"></div>
    <div class="detalhes-grupo" id="detalhes-${tipo}" hidden>
      <dl class="detalhes resumo-bloco"></dl>
      <ul class="itens"></ul>
      <p class="aviso" role="alert" hidden></p>
      <form class="formulario" hidden novalidate>
        <h3></h3>
        ${cfg.dica ? `<p class="dica largo">${cfg.dica}</p>` : ""}
        ${campos}
        <div class="acoes largo">
          <button type="button" class="botao" data-acao="cancelar">Cancelar</button>
          <button type="submit" class="botao primario">Salvar</button>
        </div>
      </form>
      <button type="button" class="botao adicionar">${cfg.novo}</button>
    </div>`;

  alternar(raiz.querySelector(".linha"), raiz.querySelector(".detalhes-grupo"), "torre-" + tipo);
  raiz.querySelector(".adicionar").addEventListener("click", () => abrirFormularioTorre(tipo, ""));
  raiz.querySelector("[data-acao=cancelar]").addEventListener("click", () => fecharFormularioTorre(tipo));
  raiz.querySelector("form").addEventListener("submit", (e) => salvarTorre(tipo, e));
}

async function iniciarTorre() {
  const exemplos = {
    ganhos: typeof GANHOS !== "undefined" ? GANHOS : [],
    gastos: typeof GASTOS !== "undefined" ? GASTOS : [],
    investimentos: typeof INVESTIMENTOS !== "undefined" ? INVESTIMENTOS : [],
  };
  Object.keys(BLOCOS).forEach(montarBloco);
  torre.parcelasMes = parcelasDoMes;
  renderizarTorre();

  aoMudarMes(renderizarTorre);
  document.addEventListener("dividas-atualizadas", (e) => {
    torre.parcelasMes = e.detail.parcelasMes;
    renderizarTorre();
  });

  for (const tipo of Object.keys(BLOCOS)) {
    const arm = await abrirArmazenamento(tipo, exemplos[tipo]);
    torre.armazenamentos[tipo] = arm;
    arm.observar(
      (lista) => { torre[tipo] = lista; renderizarTorre(); },
      () => avisoTorre(tipo, "Não foi possível carregar. Recarregue a página.")
    );
  }
}

iniciarTorre();

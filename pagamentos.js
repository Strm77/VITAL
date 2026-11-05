/* ---------- Controle de pagamentos ----------
 * Cada conta tem nome, valor, mês de referência, vencimento (opcional: "a confirmar") e status.
 * Ao marcar como paga, a data e a hora do pagamento são registradas automaticamente.
 * Também guarda quando se pretende pagar (sem mudar o vencimento), de onde saiu o dinheiro
 * (recursos próprios, cheque especial, outro crédito) e se a conta é a parcela de uma dívida.
 * Usa as funções de app.js (moeda, escapar, preencherBarra, abrirArmazenamento).
 */

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const horaCurta = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const pag = { contas: [], armazenamento: null, editandoId: null, carregado: false, erro: false };

const ORIGENS_PAGAMENTO = { proprio: "Recursos próprios", cheque_especial: "Cheque especial", outro_credito: "Outro crédito" };

function dataDoVencimento(texto) {
  const [a, m, d] = (texto || "").split("-").map(Number);
  return a ? new Date(a, m - 1, d) : null;
}

/* Mês da conta (AAAA-MM): o de referência; contas antigas usam o mês do vencimento. */
function mesDaConta(c) {
  return c.mesReferencia || String(c.vencimento || "").slice(0, 7);
}
/* Vencimento de verdade (ISO) ou null quando o dia ainda não é conhecido. */
function vencimentoConhecido(c) {
  return c.vencimentoAConfirmar ? null : c.vencimento || null;
}
const ultimoDiaDoMes = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
};
const dataBRCurta = (iso) => (iso ? dataCurta.format(dataDoVencimento(iso)) : "—");

function statusDa(conta) {
  if (conta.status === "pago") return { chave: "pago", rotulo: "Pago" };
  const venc = dataDoVencimento(vencimentoConhecido(conta));
  if (venc && venc < hoje) return { chave: "atrasada", rotulo: "Atrasada" };
  if (!venc) return { chave: "a-confirmar", rotulo: "Pendente" };
  return { chave: "pendente", rotulo: "Pendente" };
}

/* Dívida que esta conta representa no mês (vínculo escolhido ou nome e valor iguais à parcela). */
function dividaDaConta(c) {
  if (c.origem === "fatura") return null;
  const lista = typeof dividasAtuais !== "undefined" ? dividasAtuais : [];
  if (c.dividaId) return lista.find((d) => d.id === c.dividaId) || null;
  return lista.find((d) => contaPareceParcela(c, d)) || null;
}

const normalizarNome = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function contaPareceParcela(c, d) {
  if (c.dividaId || c.origem === "fatura") return false;
  if (Math.abs((Number(c.valor) || 0) - (Number(d.valorParcela) || 0)) > 0.009) return false;
  const palavras = (t) => new Set(normalizarNome(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !["parcela", "conta", "emprestimo", "exemplo"].includes(p)));
  const a = palavras(c.nome), b = palavras(d.nome);
  for (const p of a) if (b.has(p)) return true;
  const na = normalizarNome(c.nome).trim(), nb = normalizarNome(d.nome).trim();
  return !!na && !!nb && (na.includes(nb) || nb.includes(na));
}

function avisoPag(texto) {
  const aviso = document.getElementById("pag-aviso");
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

function renderizarPagamentos() {
  avisarDados();
  document.getElementById("pagamentos-mes").textContent = nomeMesRef();
  const vazio = document.getElementById("pag-vazio");
  const resumo = document.getElementById("pag-resumo");
  const rolagem = document.querySelector(".tabela-rolagem");
  // Enquanto a consulta não volta (ou se ela falhar), não dizer que não há contas.
  if (!pag.carregado) {
    resumo.innerHTML = "";
    rolagem.hidden = true;
    vazio.hidden = false;
    vazio.textContent = pag.erro ? "Não foi possível carregar as contas. Recarregue a página." : "Carregando contas…";
    vazio.classList.toggle("erro-consulta", pag.erro);
    return;
  }
  vazio.classList.remove("erro-consulta");
  vazio.textContent = pag.contas.length
    ? `Nenhuma conta em ${nomeMesRef()}.`
    : "Nenhuma conta cadastrada. Use “Adicionar conta” para registrar a primeira.";
  const contas = pag.contas.filter((c) => mesDaConta(c) === mesRef).sort((a, b) => {
    // pendentes/atrasadas primeiro, depois por vencimento (a confirmar no fim)
    const pa = a.status === "pago" ? 1 : 0, pb = b.status === "pago" ? 1 : 0;
    return pa - pb || String(vencimentoConhecido(a) || "9999").localeCompare(String(vencimentoConhecido(b) || "9999"));
  });

  const total = contas.reduce((t, c) => t + (Number(c.valor) || 0), 0);
  const pagas = contas.filter((c) => c.status === "pago");
  const pago = pagas.reduce((t, c) => t + (Number(c.valor) || 0), 0);
  const atrasadas = contas.filter((c) => statusDa(c).chave === "atrasada");
  const aConfirmar = contas.filter((c) => c.status !== "pago" && !vencimentoConhecido(c));
  const viaCheque = pagas.filter((c) => c.origemPagamento === "cheque_especial").reduce((t, c) => t + (Number(c.valor) || 0), 0);

  resumo.innerHTML = `
    <span>Total <strong>${moeda.format(total)}</strong></span>
    <span>Pago <strong>${moeda.format(pago)}</strong></span>
    <span>A pagar <strong>${moeda.format(total - pago)}</strong></span>
    <span>${pagas.length} de ${contas.length} pagas</span>
    ${atrasadas.length ? `<span class="status atrasada">${atrasadas.length} atrasada${atrasadas.length > 1 ? "s" : ""}</span>` : ""}
    ${aConfirmar.length ? `<span class="status a-confirmar">${aConfirmar.length} com vencimento a confirmar</span>` : ""}
    ${viaCheque ? `<span class="status cheque">${moeda.format(viaCheque)} pagos com cheque especial (devido ao banco)</span>` : ""}`;
  preencherBarra(document.getElementById("pag-barra"), total ? pago / total : 0);

  vazio.hidden = contas.length > 0;
  rolagem.hidden = contas.length === 0;

  const corpo = document.querySelector("#pag-tabela tbody");
  corpo.innerHTML = "";
  contas.forEach((c) => {
    const st = statusDa(c);
    const venc = vencimentoConhecido(c);
    const pagoEm = c.pagoEm ? new Date(c.pagoEm) : null;
    const divida = dividaDaConta(c);
    const notas = [
      c.origem === "fatura" && c.valorEditado ? `Fatura importada: ${moeda.format(Number(c.valorFatura) || 0)}` : "",
      divida ? `Parcela de “${escapar(divida.nome)}” (conta uma vez só no mês)` : "",
      c.status !== "pago" && c.pagarEm ? `Pagamento previsto: ${dataBRCurta(c.pagarEm)}` : "",
      c.status === "pago" && c.origemPagamento && c.origemPagamento !== "proprio" ? `Pago com ${ORIGENS_PAGAMENTO[c.origemPagamento].toLowerCase()}` : "",
      c.observacao ? escapar(c.observacao) : "",
    ].filter(Boolean);
    const tr = document.createElement("tr");
    tr.className = "conta-" + st.chave;
    tr.innerHTML = `
      <td class="conta" data-rotulo="Conta"><span class="conta-nome">${escapar(c.nome)}</span>${c.origem === "fatura" ? ' <span class="origem-tag">cartão</span>' : ""}
        ${notas.map((n) => `<span class="sub">${n}</span>`).join("")}</td>
      <td class="tipo-conta" data-rotulo="Tipo">${c.tipo ? `<span class="chip-tipo ${c.tipo}">${c.tipo === "fixa" ? "Fixa" : "Variável"}</span> ` : ""}${c.categoria ? `<span class="chip-cat">${escapar(c.categoria)}</span>` : ""}</td>
      <td class="data venc" data-rotulo="Vencimento">${venc ? dataBRCurta(venc) : '<span class="a-confirmar-tag">vencimento a confirmar</span>'}</td>
      <td class="num valor" data-rotulo="Valor">${moeda.format(Number(c.valor) || 0)}</td>
      <td class="st" data-rotulo="Status"><span class="status ${st.chave}">${st.rotulo}</span></td>
      <td class="data pago-em" data-rotulo="Pago em">${pagoEm ? `${dataCurta.format(pagoEm)} às ${horaCurta.format(pagoEm)}` : "—"}</td>
      <td class="acoes-celula">
        <div class="acoes-linha">
          <button type="button" class="botao mini ${c.status === "pago" ? "" : "primario"}" data-acao="pagar">
            ${c.status === "pago" ? "Desfazer" : "Marcar como paga"}
          </button>
          <button type="button" class="botao mini" data-acao="editar">Editar</button>
          <button type="button" class="botao mini" data-acao="excluir">Excluir</button>
        </div>
      </td>`;

    tr.querySelector("[data-acao=pagar]").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const { id, ...dados } = c;
      const novo = c.status === "pago"
        ? { ...dados, status: "pendente", pagoEm: null }
        : { ...dados, status: "pago", pagoEm: new Date().toISOString() };
      try { await pag.armazenamento.salvar(id, novo); }
      catch { avisoPag("Não foi possível atualizar o status. Tente de novo."); renderizarPagamentos(); }
    });
    tr.querySelector("[data-acao=editar]").addEventListener("click", () => abrirFormularioPag(c.id));
    const ex = tr.querySelector("[data-acao=excluir]");
    ex.addEventListener("click", async () => {
      if (ex.dataset.confirmar !== "sim") {
        ex.dataset.confirmar = "sim";
        ex.textContent = "Confirmar";
        ex.classList.add("perigo");
        return;
      }
      ex.disabled = true;
      try {
        await pag.armazenamento.excluir(c.id);
        // Conta de fatura excluída à mão: não recriar automaticamente.
        if (c.origem === "fatura" && typeof marcarFaturaSemConta === "function") await marcarFaturaSemConta(c.faturaId);
      }
      catch { ex.disabled = false; avisoPag("Não foi possível excluir. Tente de novo."); }
    });
    corpo.appendChild(tr);
  });
}

function preencherDividasNoFormulario(selecionada) {
  const sel = document.getElementById("pag-divida");
  const lista = typeof dividasAtuais !== "undefined" ? dividasAtuais : [];
  sel.innerHTML = `<option value="">Não é parcela de dívida</option>` +
    lista.map((d) => `<option value="${escapar(d.id)}">${escapar(d.nome)} · ${moeda.format(Number(d.valorParcela) || 0)}</option>`).join("");
  sel.value = selecionada && lista.some((d) => d.id === selecionada) ? selecionada : "";
}

function abrirFormularioPag(id) {
  pag.editandoId = id;
  const form = document.getElementById("pag-form");
  const conta = pag.contas.find((c) => c.id === id);
  document.getElementById("pag-form-titulo").textContent = conta ? "Editar conta" : "Nova conta";
  form.reset();
  form.elements.nome.value = conta?.nome ?? "";
  form.elements.valor.value = conta?.valor ?? "";
  // Nenhum dia é preenchido sem escolha: sem vencimento, a conta fica "a confirmar".
  form.elements.mesReferencia.value = conta ? mesDaConta(conta) : mesRef;
  form.elements.vencimento.value = conta ? vencimentoConhecido(conta) ?? "" : "";
  form.elements.pagarEm.value = conta?.pagarEm ?? "";
  form.elements.status.value = conta?.status ?? "pendente";
  form.elements.origemPagamento.value = conta?.origemPagamento ?? "";
  form.elements.observacao.value = conta?.observacao ?? "";
  form.elements.tipo.value = conta?.tipo ?? (conta?.origem === "fatura" ? "variavel" : "");
  form.elements.categoria.value = conta?.categoria ?? (conta?.origem === "fatura" ? "Cartão" : "");
  preencherDividasNoFormulario(conta?.dividaId);
  document.getElementById("pag-divida-campo").hidden = conta?.origem === "fatura";
  const origem = document.getElementById("pag-origem");
  origem.hidden = conta?.origem !== "fatura";
  if (!origem.hidden) {
    origem.textContent = `Criada a partir da fatura do cartão (valor importado: ${moeda.format(Number(conta.valorFatura) || 0)}). ` +
      "Se você mudar o valor, o seu valor é mantido mesmo que a fatura seja importada de novo.";
  }
  form.hidden = false;
  document.getElementById("pag-adicionar").hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioPag() {
  pag.editandoId = null;
  document.getElementById("pag-form").hidden = true;
  document.getElementById("pag-adicionar").hidden = false;
  avisoPag("");
}

async function salvarPag(evento) {
  evento.preventDefault();
  const form = evento.target;
  const anterior = pag.contas.find((c) => c.id === pag.editandoId);
  const { id: _id, ...extras } = anterior || {}; // mantém a ligação com a fatura (origem, faturaId…)
  const vencimento = form.elements.vencimento.value;
  const mes = form.elements.mesReferencia.value || (vencimento ? vencimento.slice(0, 7) : "");
  const conta = {
    ...extras,
    nome: form.elements.nome.value.trim(),
    valor: Number(form.elements.valor.value.trim().replace(",", ".")),
    mesReferencia: mes,
    // O banco exige uma data: sem o dia, guarda o último dia do mês só como dado técnico.
    vencimento: vencimento || (mes ? ultimoDiaDoMes(mes) : ""),
    vencimentoAConfirmar: !vencimento,
    pagarEm: form.elements.pagarEm.value || null,
    status: form.elements.status.value,
    origemPagamento: form.elements.origemPagamento.value || null,
    observacao: form.elements.observacao.value.trim() || null,
    tipo: form.elements.tipo.value || null,
    categoria: form.elements.categoria.value.trim() || null,
    dividaId: form.elements.dividaId.value || null,
  };
  if (!conta.nome || !(conta.valor > 0) || !/^\d{4}-\d{2}$/.test(conta.mesReferencia)) {
    avisoPag("Preencha conta, valor e mês. O dia do vencimento é opcional.");
    return;
  }
  if (conta.origem === "fatura") conta.valorEditado = Math.abs(conta.valor - (Number(conta.valorFatura) || 0)) > 0.004;
  // Data do pagamento automática: registra ao virar "pago", mantém se já era, limpa se voltou a pendente.
  conta.pagoEm = conta.status === "pago"
    ? (anterior?.status === "pago" && anterior.pagoEm) || new Date().toISOString()
    : null;

  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await pag.armazenamento.salvar(pag.editandoId || null, conta);
    fecharFormularioPag();
  } catch {
    avisoPag("Não foi possível salvar. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

async function iniciarPagamentos() {
  aoMudarMes(renderizarPagamentos);
  document.getElementById("pag-adicionar").addEventListener("click", () => abrirFormularioPag(""));
  document.getElementById("pag-cancelar").addEventListener("click", fecharFormularioPag);
  document.getElementById("pag-form").addEventListener("submit", salvarPag);
  // Ao escolher o dia do vencimento, o mês acompanha (pode ser trocado depois).
  const form = document.getElementById("pag-form");
  const sincronizarMes = () => { const v = form.elements.vencimento.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) form.elements.mesReferencia.value = v.slice(0, 7); };
  form.elements.vencimento.addEventListener("input", sincronizarMes);
  form.elements.vencimento.addEventListener("change", sincronizarMes);
  renderizarPagamentos();

  pag.armazenamento = await abrirArmazenamento("pagamentos", typeof PAGAMENTOS !== "undefined" ? PAGAMENTOS : []);
  pag.armazenamento.observar(
    (lista) => {
      pag.contas = lista;
      pag.carregado = true;
      pag.erro = false;
      renderizarPagamentos();
      if (typeof renderizar === "function" && typeof dividasCarregadas !== "undefined" && dividasCarregadas) renderizar(dividasAtuais);
      else renderizarGrafico();
      if (typeof renderizarTorre === "function") renderizarTorre();
      if (typeof sincronizarContasDasFaturas === "function") sincronizarContasDasFaturas();
    },
    () => {
      pag.erro = true;
      if (!pag.carregado) renderizarPagamentos();
      avisoPag("Não foi possível carregar as contas. Recarregue a página.");
    }
  );
}

iniciarPagamentos();

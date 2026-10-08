/* ---------- Controle de pagamentos ----------
 * Cada conta tem nome, valor, vencimento e status. Ao marcar como paga,
 * a data e a hora do pagamento são registradas automaticamente.
 * Usa as funções de app.js (moeda, escapar, preencherBarra, abrirArmazenamento).
 */

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const horaCurta = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const pag = { contas: [], armazenamento: null, editandoId: null, carregado: false };

function dataDoVencimento(texto) {
  const [a, m, d] = (texto || "").split("-").map(Number);
  return a ? new Date(a, m - 1, d) : null;
}

function statusDa(conta) {
  if (conta.status === "pago") return { chave: "pago", rotulo: "Pago" };
  const venc = dataDoVencimento(conta.vencimento);
  if (venc && venc < hoje) return { chave: "atrasada", rotulo: "Atrasada" };
  return { chave: "pendente", rotulo: "Pendente" };
}

function avisoPag(texto) {
  const aviso = document.getElementById("pag-aviso");
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

function renderizarPagamentos() {
  const contas = [...pag.contas].sort((a, b) => {
    // pendentes/atrasadas primeiro, depois por vencimento
    const pa = a.status === "pago" ? 1 : 0, pb = b.status === "pago" ? 1 : 0;
    return pa - pb || String(a.vencimento).localeCompare(String(b.vencimento));
  });

  const total = contas.reduce((t, c) => t + (Number(c.valor) || 0), 0);
  const pagas = contas.filter((c) => c.status === "pago");
  const pago = pagas.reduce((t, c) => t + (Number(c.valor) || 0), 0);
  const atrasadas = contas.filter((c) => statusDa(c).chave === "atrasada");

  document.getElementById("pag-resumo").innerHTML = `
    <span>Total <strong>${moeda.format(total)}</strong></span>
    <span>Pago <strong>${moeda.format(pago)}</strong></span>
    <span>A pagar <strong>${moeda.format(total - pago)}</strong></span>
    <span>${pagas.length} de ${contas.length} pagas</span>
    ${atrasadas.length ? `<span class="status atrasada">${atrasadas.length} atrasada${atrasadas.length > 1 ? "s" : ""}</span>` : ""}`;
  preencherBarra(document.getElementById("pag-barra"), total ? pago / total : 0);

  document.getElementById("pag-vazio").hidden = contas.length > 0;
  document.querySelector(".tabela-rolagem").hidden = contas.length === 0;

  const corpo = document.querySelector("#pag-tabela tbody");
  corpo.innerHTML = "";
  contas.forEach((c) => {
    const st = statusDa(c);
    const venc = dataDoVencimento(c.vencimento);
    const pagoEm = c.pagoEm ? new Date(c.pagoEm) : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="conta">${escapar(c.nome)}${c.origem === "fatura" ? ' <span class="origem-tag">cartão</span>' : ""}
        ${c.origem === "fatura" && c.valorEditado ? `<span class="sub">Fatura importada: ${moeda.format(Number(c.valorFatura) || 0)}</span>` : ""}</td>
      <td class="data">${venc ? dataCurta.format(venc) : "—"}</td>
      <td class="num">${moeda.format(Number(c.valor) || 0)}</td>
      <td><span class="status ${st.chave}">${st.rotulo}</span></td>
      <td class="data">${pagoEm ? `${dataCurta.format(pagoEm)} às ${horaCurta.format(pagoEm)}` : "—"}</td>
      <td>
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

function abrirFormularioPag(id) {
  pag.editandoId = id;
  const form = document.getElementById("pag-form");
  const conta = pag.contas.find((c) => c.id === id);
  document.getElementById("pag-form-titulo").textContent = conta ? "Editar conta" : "Nova conta";
  form.reset();
  form.elements.nome.value = conta?.nome ?? "";
  form.elements.valor.value = conta?.valor ?? "";
  form.elements.vencimento.value = conta?.vencimento ?? "";
  form.elements.status.value = conta?.status ?? "pendente";
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
  const conta = {
    ...extras,
    nome: form.elements.nome.value.trim(),
    valor: Number(form.elements.valor.value.trim().replace(",", ".")),
    vencimento: form.elements.vencimento.value,
    status: form.elements.status.value,
  };
  if (!conta.nome || !(conta.valor > 0) || !conta.vencimento) {
    avisoPag("Preencha conta, valor e vencimento.");
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
  document.getElementById("pagamentos-mes").textContent = capitalizar(mesAno.format(hoje));
  document.getElementById("pag-adicionar").addEventListener("click", () => abrirFormularioPag(""));
  document.getElementById("pag-cancelar").addEventListener("click", fecharFormularioPag);
  document.getElementById("pag-form").addEventListener("submit", salvarPag);
  renderizarPagamentos();

  pag.armazenamento = await abrirArmazenamento("pagamentos", typeof PAGAMENTOS !== "undefined" ? PAGAMENTOS : []);
  pag.armazenamento.observar(
    (lista) => {
      pag.contas = lista;
      pag.carregado = true;
      renderizarPagamentos();
      renderizarGrafico();
      if (typeof sincronizarContasDasFaturas === "function") sincronizarContasDasFaturas();
    },
    () => avisoPag("Não foi possível carregar as contas. Recarregue a página.")
  );
}

iniciarPagamentos();

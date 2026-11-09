/* ---------- Stefanini: check-in semanal ----------
 * Cada check-in tem a data de referência da semana e uma lista ordenada de itens. Cada item tem a
 * seção ("Semana Passada", "Essa Semana" ou "Pedido de Ajuda"), o cliente (opcional: uma conta do
 * CRM ou um rótulo livre, ex.: um evento ou um time interno) e o texto das atividades.
 *
 * Aceleradores ao criar (opcionais): (a) trazer os itens de "Essa Semana" do último check-in como
 * rascunho de "Semana Passada"; (b) sugerir itens a partir das reuniões e atividades do CRM.
 * Toda sugestão fica numa lista à parte e só entra no check-in quando o usuário toca em
 * "Adicionar" (podendo editar o texto e a seção antes) — nada vira "realizado" sozinho.
 *
 * "Gerar PDF" monta um A4 no navegador (jsPDF, em vendor/, carregado só na hora): título,
 * data DD/MM/AAAA e a tabela Cliente | Atividades com as linhas de seção.
 * Dados em stefanini.checkins e stefanini.checkin_itens (no painel: stf_checkins e
 * stf_checkin_itens). Usa as utilidades de stefanini.js (stf, stfConta, stfAttr, stfData…).
 */

const CK_SECOES = ["Semana Passada", "Essa Semana", "Pedido de Ajuda"];
const CK_LIVRE = "__livre";

const ck = {
  checkins: [],
  itens: [],
  // Rascunho do editor: { id, semana, itens: [{ chave, id, secao, modo, contaId, clienteRotulo, atividades }] }
  rascunho: null,
  sugestoes: [],
  vendo: null,
  // Semana recém-salva que ainda não chegou do banco: abre quando chegar.
  aguardando: null,
  confirmando: null,
  seq: 0,
  contasVistas: "",
};

/* ---------- Datas da semana ---------- */

const ckIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function ckSomar(iso, dias) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return ckIso(d);
}
/* Segunda-feira da semana da data. */
function ckSegunda(iso) {
  const d = new Date(iso + "T12:00:00");
  return ckSomar(iso, -((d.getDay() + 6) % 7));
}
const ckDataValida = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) && !Number.isNaN(new Date(iso + "T12:00:00").getTime());

/* ---------- Dados ---------- */

const ckItensDe = (id) => ck.itens.filter((i) => i.checkinId === id)
  .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
const ckOrdenados = () => [...ck.checkins].sort((a, b) => String(b.semana).localeCompare(String(a.semana)));
function ckNomeCliente(item) {
  if (item.contaId) return stfConta(item.contaId)?.nome || "";
  return item.clienteRotulo || "";
}
/* Itens agrupados nas três seções, na ordem. */
function ckPorSecao(itens) {
  return CK_SECOES.map((secao) => ({ secao, itens: itens.filter((i) => i.secao === secao) }));
}
const ckNovaChave = () => `k${Date.now().toString(36)}${(ck.seq++).toString(36)}`;
function ckItemRascunho(base) {
  const contaId = base.contaId && stfConta(base.contaId) ? base.contaId : null;
  const rotulo = contaId ? null : (base.clienteRotulo || null);
  return {
    chave: ckNovaChave(),
    id: base.id || null,
    secao: CK_SECOES.includes(base.secao) ? base.secao : CK_SECOES[0],
    modo: contaId ? "conta" : rotulo ? "livre" : "nenhum",
    contaId,
    clienteRotulo: rotulo,
    atividades: base.atividades || "",
  };
}

/* ---------- Histórico ---------- */

function renderizarCheckinStf() {
  if (!document.getElementById("stf-ck-lista")) return;
  const lista = ckOrdenados();
  document.getElementById("stf-ck-lista").innerHTML = lista.map((c) => {
    const itens = ckItensDe(c.id);
    const contagem = ckPorSecao(itens).map((g) => `<span>${escapar(g.secao)}: <strong>${g.itens.length}</strong></span>`).join("");
    const confirmando = ck.confirmando === c.id;
    return `<li class="stf-cartao stf-ck-cartao${ck.vendo === c.id ? " aberto" : ""}" data-ck-id="${stfAttr(c.id)}">
        <div class="stf-cartao-topo"><h3>Check-in de ${stfData(c.semana)}</h3></div>
        <div class="stf-cartao-info">${contagem}</div>
        <div class="stf-acoes">
          <button type="button" class="botao mini" data-ck-acao="ver">Ver</button>
          <button type="button" class="botao mini" data-ck-acao="editar">Editar</button>
          <button type="button" class="botao mini" data-ck-acao="pdf">Gerar PDF</button>
          <button type="button" class="botao mini${confirmando ? " perigo" : ""}" data-ck-acao="excluir"${confirmando ? ' data-confirmar="sim"' : ""}>${confirmando ? "Excluir?" : "Excluir"}</button>
        </div>
      </li>`;
  }).join("");
  document.getElementById("stf-ck-vazio").hidden = lista.length > 0;
  document.getElementById("stf-ck-resumo").textContent = lista.length ? stfPlural(lista.length, "check-in", "check-ins") : "";
  if (ck.aguardando && ck.checkins.some((c) => c.id === ck.aguardando)) ckMostrar(ck.aguardando);
  else if (ck.vendo) {
    if (ck.checkins.some((c) => c.id === ck.vendo)) ckMostrar(ck.vendo, false);
    else ckFecharVer();
  }
  // Editor aberto e a lista de contas mudou: atualiza os seletores (o rascunho já está em dia).
  const assinatura = stf.contas.map((c) => c.id + ":" + c.nome).join("|");
  if (ck.rascunho && assinatura !== ck.contasVistas) ckRenderizarEditor();
  ck.contasVistas = assinatura;
}

/* Tabela do check-in em HTML (mesma estrutura do PDF). */
function ckHtmlDocumento(semana, itens) {
  const linhas = ckPorSecao(itens).map((g) => `
      <tr class="stf-ck-linha-secao"><th colspan="2" scope="colgroup">${escapar(g.secao)}</th></tr>
      ${g.itens.map((i) => `<tr><td class="stf-ck-col-cliente">${escapar(ckNomeCliente(i))}</td><td class="stf-ck-col-ativ">${escapar(i.atividades)}</td></tr>`).join("")}`).join("");
  return `<div class="stf-ck-doc">
      <p class="stf-ck-doc-titulo">Check-in semanal</p>
      <p class="stf-ck-doc-data">${stfData(semana)}</p>
      <table class="stf-ck-tabela">
        <thead><tr><th scope="col">Cliente</th><th scope="col">Atividades</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

function ckMostrar(id, rolar = true) {
  const c = ck.checkins.find((x) => x.id === id);
  if (!c) { ck.aguardando = id; return; }
  ck.aguardando = null;
  if (rolar) ckFecharEditor();
  ck.vendo = id;
  const caixa = document.getElementById("stf-ck-ver");
  caixa.innerHTML = `${ckHtmlDocumento(c.semana, ckItensDe(id))}
    <div class="acoes stf-ck-ver-acoes">
      <button type="button" class="botao" data-ck-ver="fechar">Fechar</button>
      <button type="button" class="botao" data-ck-ver="editar">Editar</button>
      <button type="button" class="botao primario" data-ck-ver="pdf">Gerar PDF</button>
    </div>`;
  caixa.hidden = false;
  if (rolar) caixa.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function ckFecharVer() {
  ck.vendo = null;
  const caixa = document.getElementById("stf-ck-ver");
  caixa.hidden = true;
  caixa.innerHTML = "";
}

async function ckExcluir(botao, id) {
  if (ck.confirmando !== id) {
    ck.confirmando = id;
    botao.dataset.confirmar = "sim";
    botao.textContent = "Excluir?";
    botao.classList.add("perigo");
    return;
  }
  ck.confirmando = null;
  botao.disabled = true;
  try {
    // Os itens saem primeiro (no banco também iriam junto, por cascata).
    for (const i of ckItensDe(id)) await stf.arm.stf_checkin_itens.excluir(i.id);
    await stf.arm.stf_checkins.excluir(id);
    if (ck.vendo === id) ckFecharVer();
    if (ck.rascunho?.id === id) ckFecharEditor();
    stfAviso("stf-ck-aviso", "");
  } catch {
    botao.disabled = false;
    stfAviso("stf-ck-aviso", "Não foi possível excluir o check-in. Tente de novo.");
  }
}

/* ---------- Editor ---------- */

function ckAbrirEditor(id) {
  ckFecharVer();
  ck.aguardando = null;
  const c = id ? ck.checkins.find((x) => x.id === id) : null;
  ck.rascunho = {
    id: c ? c.id : null,
    semana: c ? c.semana : stfIsoHoje(),
    itens: c ? ckItensDe(c.id).map(ckItemRascunho) : [],
  };
  ck.sugestoes = [];
  const form = document.getElementById("stf-ck-form");
  document.getElementById("stf-ck-form-titulo").textContent = c ? `Editar check-in de ${stfData(c.semana)}` : "Novo check-in";
  form.elements.semana.value = ck.rascunho.semana;
  document.getElementById("stf-ck-aceleradores").hidden = !!c;
  stfAviso("stf-ck-form-aviso", "");
  ckRenderizarSugestoes();
  ckRenderizarEditor();
  form.hidden = false;
  document.getElementById("stf-ck-novo").hidden = true;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function ckFecharEditor() {
  ck.rascunho = null;
  ck.sugestoes = [];
  document.getElementById("stf-ck-form").hidden = true;
  document.getElementById("stf-ck-secoes").innerHTML = "";
  document.getElementById("stf-ck-sugestoes").innerHTML = "";
  document.getElementById("stf-ck-novo").hidden = false;
  stfAviso("stf-ck-form-aviso", "");
}

function ckOpcoesCliente(item) {
  const valor = item.modo === "conta" ? item.contaId : item.modo === "livre" ? CK_LIVRE : "";
  const contas = [...stf.contas].sort(stfPorNome("nome"));
  const opcoes = [`<option value="">Sem cliente</option>`,
    ...contas.map((c) => `<option value="${stfAttr(c.id)}">${escapar(c.nome)}</option>`),
    `<option value="${CK_LIVRE}">Outro (texto livre)…</option>`];
  return opcoes.map((o) => o.replace(`value="${stfAttr(valor)}"`, `value="${stfAttr(valor)}" selected`)).join("");
}
const ckOpcoesSecao = (atual) => CK_SECOES.map((s) => `<option value="${stfAttr(s)}"${s === atual ? " selected" : ""}>${escapar(s)}</option>`).join("");

function ckRenderizarEditor() {
  const r = ck.rascunho;
  if (!r) return;
  const raiz = document.getElementById("stf-ck-secoes");
  raiz.innerHTML = ckPorSecao(r.itens).map((g) => `
    <section class="stf-ck-secao" data-secao="${stfAttr(g.secao)}">
      <div class="stf-ck-secao-topo">
        <h4>${escapar(g.secao)} <span class="sub">(${g.itens.length})</span></h4>
        <button type="button" class="botao mini" data-ck-add="${stfAttr(g.secao)}">+ Item</button>
      </div>
      ${g.itens.length ? `<ol class="stf-ck-itens">${g.itens.map((i, n) => `
        <li class="stf-ck-item" data-chave="${i.chave}">
          <div class="stf-ck-cliente">
            <label class="campo">Cliente
              <select data-ck-campo="cliente">${ckOpcoesCliente(i)}</select>
            </label>
            <label class="campo" data-ck-rotulo ${i.modo === "livre" ? "" : "hidden"}>Nome (evento, time…)
              <input type="text" maxlength="120" data-ck-campo="rotulo" value="${stfAttr(i.clienteRotulo || "")}">
            </label>
          </div>
          <label class="campo">Atividades
            <textarea rows="4" maxlength="10000" data-ck-campo="atividades">${escapar(i.atividades)}</textarea>
          </label>
          <div class="stf-ck-item-acoes">
            <label class="stf-ck-mover-secao">Seção
              <select data-ck-campo="secao">${ckOpcoesSecao(i.secao)}</select>
            </label>
            <button type="button" class="botao mini" data-ck-mover="-1" ${n === 0 ? "disabled" : ""} aria-label="Subir item">↑</button>
            <button type="button" class="botao mini" data-ck-mover="1" ${n === g.itens.length - 1 ? "disabled" : ""} aria-label="Descer item">↓</button>
            <button type="button" class="botao mini" data-ck-remover>Remover</button>
          </div>
        </li>`).join("")}</ol>` : `<p class="sub stf-ck-vazio-secao">Nenhum item.</p>`}
    </section>`).join("");
  ck.contasVistas = stf.contas.map((c) => c.id + ":" + c.nome).join("|");
}

const ckItemDaChave = (chave) => ck.rascunho?.itens.find((i) => i.chave === chave);

/* Move o item dentro da seção dele (direção -1 = sobe, 1 = desce). */
function ckMover(item, direcao) {
  const lista = ck.rascunho.itens;
  const daSecao = lista.filter((i) => i.secao === item.secao);
  const vizinho = daSecao[daSecao.indexOf(item) + direcao];
  if (!vizinho) return;
  const a = lista.indexOf(item), b = lista.indexOf(vizinho);
  [lista[a], lista[b]] = [lista[b], lista[a]];
}

/* Muda de seção: vai para o fim da seção nova. */
function ckTrocarSecao(item, secao) {
  const lista = ck.rascunho.itens;
  lista.splice(lista.indexOf(item), 1);
  item.secao = secao;
  lista.push(item);
}

/* Lê o rascunho para gravar: valida e devolve os itens na ordem final (seção por seção). */
function ckValidarRascunho() {
  const r = ck.rascunho;
  const semana = document.getElementById("stf-ck-semana").value;
  if (!ckDataValida(semana)) return { erro: "Informe a data de referência da semana (dd/mm/aaaa).", campo: "semana" };
  const outra = ck.checkins.find((c) => c.id !== r.id && ckSegunda(c.semana) === ckSegunda(semana));
  if (outra) return { erro: `Já existe um check-in nesta semana (${stfData(outra.semana)}). Abra-o no Histórico para editar.`, campo: "semana" };
  const itens = ckPorSecao(r.itens).flatMap((g) => g.itens);
  for (const i of itens) {
    if (!String(i.atividades).trim()) return { erro: `Escreva as atividades do item em “${i.secao}” (ou remova o item).`, chave: i.chave, campo: "atividades" };
    if (i.modo === "livre" && !String(i.clienteRotulo || "").trim()) return { erro: "Escreva o nome do cliente (ou escolha “Sem cliente”).", chave: i.chave, campo: "rotulo" };
  }
  return { semana, itens };
}

async function ckSalvar(e) {
  e.preventDefault();
  const r = ck.rascunho;
  if (!r) return;
  const v = ckValidarRascunho();
  if (v.erro) {
    stfAviso("stf-ck-form-aviso", v.erro);
    const alvo = v.chave
      ? document.querySelector(`.stf-ck-item[data-chave="${v.chave}"] [data-ck-campo="${v.campo}"]`)
      : document.getElementById("stf-ck-semana-br") || document.getElementById("stf-ck-semana");
    alvo?.focus();
    return;
  }
  const botao = e.target.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    // Grava o check-in, depois cada item com a ordem final. O id de cada item novo fica no
    // rascunho assim que é gravado: tentar de novo após uma falha não duplica nada.
    r.id = await stf.arm.stf_checkins.salvar(r.id, { semana: v.semana });
    for (const [ordem, i] of v.itens.entries()) {
      const conta = i.modo === "conta" && stfConta(i.contaId) ? i.contaId : null;
      const rotulo = !conta && i.modo === "livre" ? String(i.clienteRotulo).trim().slice(0, 120) : null;
      i.id = await stf.arm.stf_checkin_itens.salvar(i.id, {
        checkinId: r.id, secao: i.secao, ordem, contaId: conta, clienteRotulo: rotulo,
        atividades: String(i.atividades).replace(/\r\n?/g, "\n").replace(/\s+$/, "").slice(0, 10000),
      });
    }
    const ficam = new Set(v.itens.map((i) => i.id));
    for (const antigo of ckItensDe(r.id).filter((i) => !ficam.has(i.id))) await stf.arm.stf_checkin_itens.excluir(antigo.id);
    const id = r.id;
    ckFecharEditor();
    stfAviso("stf-ck-aviso", "");
    ckMostrar(id);
  } catch {
    stfAviso("stf-ck-form-aviso", "Não foi possível salvar. Verifique sua conexão e tente de novo (nada se perde do que já foi gravado).");
  } finally {
    botao.disabled = false;
  }
}

/* ---------- Aceleradores (sugestões que só entram com confirmação) ---------- */

/* (a) Itens de "Essa Semana" do check-in mais recente, sugeridos para "Semana Passada". */
function ckSugerirDoAnterior() {
  const anterior = ckOrdenados()[0];
  ck.sugestoes = ck.sugestoes.filter((s) => s.origem !== "anterior");
  if (!anterior) return ckRenderizarSugestoes("Nenhum check-in anterior para copiar.");
  const itens = ckItensDe(anterior.id).filter((i) => i.secao === "Essa Semana");
  if (!itens.length) return ckRenderizarSugestoes(`O check-in de ${stfData(anterior.semana)} não tem itens em “Essa Semana”.`);
  for (const i of itens) {
    ck.sugestoes.push({ chave: ckNovaChave(), origem: "anterior", descricao: `“Essa Semana” de ${stfData(anterior.semana)}`,
      secao: "Semana Passada", contaId: i.contaId || null, clienteRotulo: i.clienteRotulo || null, atividades: i.atividades });
  }
  ckRenderizarSugestoes();
}

/* (b) Reuniões e atividades do CRM: da semana anterior à data de referência (para "Semana
 * Passada") e da própria semana (para "Essa Semana"), agrupadas por cliente. */
function ckSugerirDoCrm() {
  const semana = document.getElementById("stf-ck-semana").value;
  ck.sugestoes = ck.sugestoes.filter((s) => s.origem !== "crm");
  if (!ckDataValida(semana)) return ckRenderizarSugestoes("Informe a data de referência da semana para buscar as sugestões.");
  const seg = ckSegunda(semana);
  const passada = [ckSomar(seg, -7), ckSomar(seg, -1)];
  const atual = [seg, ckSomar(seg, 6)];
  const dentro = (iso, [de, ate]) => !!iso && iso >= de && iso <= ate;
  const grupos = new Map();
  const juntar = (secao, contaId, linha) => {
    const chave = `${secao}|${contaId || ""}`;
    if (!grupos.has(chave)) grupos.set(chave, { secao, contaId: contaId && stfConta(contaId) ? contaId : null, linhas: [] });
    grupos.get(chave).linhas.push(linha);
  };
  const porData = (a, b) => String(a.data || "").localeCompare(String(b.data || ""));
  for (const r of [...stf.reunioes].sort(porData)) {
    if (dentro(r.data, passada)) juntar("Semana Passada", r.contaId, `Reunião: ${r.titulo}`);
    else if (dentro(r.data, atual)) juntar("Essa Semana", r.contaId, `Reunião: ${r.titulo}`);
  }
  for (const a of [...stf.atividades].sort(porData)) {
    const feitaEm = a.feita ? String(a.concluidaEm || a.data || "").slice(0, 10) : "";
    if (a.feita && dentro(feitaEm, passada)) juntar("Semana Passada", a.contaId, a.descricao);
    else if (!a.feita && a.data && a.data >= passada[0] && a.data <= atual[1]) juntar("Essa Semana", a.contaId, a.descricao);
  }
  const ordem = (g) => CK_SECOES.indexOf(g.secao);
  // Por seção; dentro dela, por nome do cliente (sem cliente por último).
  const nome = (g) => stfConta(g.contaId)?.nome || "";
  const lista = [...grupos.values()].sort((a, b) => ordem(a) - ordem(b) ||
    (nome(a) ? 0 : 1) - (nome(b) ? 0 : 1) || nome(a).localeCompare(nome(b), "pt-BR"));
  for (const g of lista) {
    ck.sugestoes.push({ chave: ckNovaChave(), origem: "crm", descricao: `CRM · ${g.secao === "Semana Passada" ? `${stfData(passada[0])} a ${stfData(passada[1])}` : `${stfData(atual[0])} a ${stfData(atual[1])}`}`,
      secao: g.secao, contaId: g.contaId, clienteRotulo: null, atividades: g.linhas.join("\n") });
  }
  ckRenderizarSugestoes(lista.length ? "" : `Nenhuma reunião ou atividade do CRM entre ${stfData(passada[0])} e ${stfData(atual[1])}.`);
}

function ckRenderizarSugestoes(mensagem = "") {
  const raiz = document.getElementById("stf-ck-sugestoes");
  if (!raiz) return;
  const itens = ck.sugestoes.map((s) => {
    const nome = ckNomeCliente(s) || "Sem cliente";
    return `<li class="stf-ck-sugestao" data-sug="${s.chave}">
        <div class="stf-ck-sugestao-topo"><strong>${escapar(nome)}</strong><span class="sub">${escapar(s.descricao)}</span></div>
        <label class="campo">Atividades (edite antes de adicionar)
          <textarea rows="3" maxlength="10000" data-sug-campo="atividades">${escapar(s.atividades)}</textarea>
        </label>
        <div class="stf-ck-item-acoes">
          <label class="stf-ck-mover-secao">Adicionar em
            <select data-sug-campo="secao">${ckOpcoesSecao(s.secao)}</select>
          </label>
          <button type="button" class="botao mini primario" data-sug-acao="adicionar">Adicionar</button>
          <button type="button" class="botao mini" data-sug-acao="descartar">Descartar</button>
        </div>
      </li>`;
  }).join("");
  raiz.innerHTML = `${mensagem ? `<p class="sub stf-ck-sug-msg">${escapar(mensagem)}</p>` : ""}
    ${itens ? `<p class="stf-ck-sug-titulo">Sugestões (${ck.sugestoes.length}) — confirme uma a uma</p><ul class="stf-ck-sugestoes">${itens}</ul>` : ""}`;
}

function ckAceitarSugestao(chave) {
  const s = ck.sugestoes.find((x) => x.chave === chave);
  if (!s || !ck.rascunho) return;
  if (!String(s.atividades).trim()) {
    stfAviso("stf-ck-form-aviso", "A sugestão está sem texto. Escreva as atividades ou descarte-a.");
    return;
  }
  ck.rascunho.itens.push(ckItemRascunho({ secao: s.secao, contaId: s.contaId, clienteRotulo: s.clienteRotulo, atividades: s.atividades }));
  ck.sugestoes = ck.sugestoes.filter((x) => x !== s);
  stfAviso("stf-ck-form-aviso", "");
  ckRenderizarSugestoes();
  ckRenderizarEditor();
}

/* ---------- Conta excluída: o item guarda o nome dela como rótulo ---------- */

async function stfCkAntesDeExcluirConta(contaId) {
  const conta = stfConta(contaId);
  if (!conta) return;
  const rotulo = String(conta.nome).slice(0, 120);
  for (const i of ck.itens.filter((x) => x.contaId === contaId)) {
    const { id, ...resto } = i;
    await stf.arm.stf_checkin_itens.salvar(id, { ...resto, contaId: null, clienteRotulo: rotulo });
  }
  for (const i of ck.rascunho?.itens || []) {
    if (i.contaId === contaId) Object.assign(i, { modo: "livre", contaId: null, clienteRotulo: rotulo });
  }
  for (const s of ck.sugestoes) {
    if (s.contaId === contaId) Object.assign(s, { contaId: null, clienteRotulo: rotulo });
  }
}

/* ---------- PDF (A4, no navegador) ---------- */

let ckJsPdf = null;
function ckCarregarJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!ckJsPdf) {
    ckJsPdf = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "vendor/jspdf.umd.min.js";
      s.onload = () => (window.jspdf?.jsPDF ? ok(window.jspdf.jsPDF) : falha(new Error("jsPDF indisponível")));
      s.onerror = () => { ckJsPdf = null; falha(new Error("jsPDF não carregou")); };
      document.head.appendChild(s);
    });
  }
  return ckJsPdf;
}

/* As fontes padrão do PDF cobrem o Latin-1 (acentos do português): troca aspas e travessões
 * tipográficos pelos equivalentes simples e tira o que não dá para desenhar (ex.: emoji). */
const ckTextoPdf = (t) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ")
  .replace(/[“”„″]/g, '"').replace(/[‘’‚′]/g, "'").replace(/[–—−]/g, "-").replace(/…/g, "...")
  .replace(/[•▪◦●∙]/g, "-").replace(/[^\n\x20-\x7E -ÿ]/g, "");

/* Desenha o check-in num A4 retrato: título e data em negrito, tabela com bordas
 * (Cliente | Atividades), linhas de seção em toda a largura e cabeçalho repetido nas páginas. */
function ckDesenharPdf(JsPdf, semana, itens) {
  const pdf = new JsPdf({ unit: "pt", format: "a4", orientation: "portrait" });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const margem = 50;
  const largura = larguraPagina - 2 * margem;
  const col1 = Math.round(largura * 0.28);
  const col2 = largura - col1;
  const pad = 6;
  const corpo = 10;
  const entre = corpo * 1.3;
  const limite = alturaPagina - margem;
  pdf.setProperties({ title: `Check-in semanal ${stfData(semana)}` });
  pdf.setLineWidth(0.75);
  pdf.setDrawColor(0);
  pdf.setTextColor(0);

  const quebrar = (texto, larguraMax, negrito) => {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(corpo);
    return ckTextoPdf(texto).split("\n").flatMap((p) => (p.trim() ? pdf.splitTextToSize(p, larguraMax) : [""]));
  };
  const escrever = (linhas, x, y, { negrito = false, centro = false, larguraCelula = 0 } = {}) => {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(corpo);
    linhas.forEach((l, n) => {
      const yy = y + n * entre;
      if (centro) pdf.text(l, x + larguraCelula / 2, yy, { align: "center", baseline: "top" });
      else pdf.text(l, x, yy, { baseline: "top" });
    });
  };

  let y = margem;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Check-in semanal", margem, y, { baseline: "top" });
  y += 22;
  pdf.setFontSize(11);
  pdf.text(stfData(semana), margem, y, { baseline: "top" });
  y += 22;

  const cabecalho = () => {
    const h = entre + 2 * pad;
    pdf.rect(margem, y, col1, h);
    pdf.rect(margem + col1, y, col2, h);
    escrever(["Cliente"], margem, y + pad, { negrito: true, centro: true, larguraCelula: col1 });
    escrever(["Atividades"], margem + col1, y + pad, { negrito: true, centro: true, larguraCelula: col2 });
    y += h;
  };
  const novaPagina = () => {
    pdf.addPage("a4", "portrait");
    y = margem;
    cabecalho();
  };
  cabecalho();

  for (const g of ckPorSecao(itens)) {
    const hSecao = entre + 2 * pad;
    // A linha de seção não fica sozinha no pé da página: precisa caber com ao menos uma linha de item.
    if (y + hSecao + (g.itens.length ? entre + 2 * pad : 0) > limite) novaPagina();
    pdf.rect(margem, y, largura, hSecao);
    escrever([g.secao], margem, y + pad, { negrito: true, centro: true, larguraCelula: largura });
    y += hSecao;

    for (const i of g.itens) {
      const cliente = quebrar(ckNomeCliente(i), col1 - 2 * pad, true);
      let texto = quebrar(i.atividades, col2 - 2 * pad, false);
      // Item maior que o espaço: continua na página seguinte (com o cabeçalho repetido e o nome
      // do cliente de novo na continuação).
      let primeira = true;
      while (primeira || texto.length) {
        primeira = false;
        let cabem = Math.floor((limite - y - 2 * pad) / entre);
        if (cabem < Math.max(1, Math.min(cliente.length, texto.length || 1))) { novaPagina(); cabem = Math.floor((limite - y - 2 * pad) / entre); }
        const n = Math.min(cabem, Math.max(cliente.length, texto.length, 1));
        const pedacoCliente = cliente.slice(0, n);
        const pedacoTexto = texto.slice(0, n);
        const h = n * entre + 2 * pad;
        pdf.rect(margem, y, col1, h);
        pdf.rect(margem + col1, y, col2, h);
        // Nome do cliente centralizado na célula (na horizontal e na vertical).
        const sobra = h - 2 * pad - pedacoCliente.length * entre;
        escrever(pedacoCliente, margem + pad, y + pad + Math.max(sobra, 0) / 2, { negrito: true, centro: true, larguraCelula: col1 - 2 * pad });
        escrever(pedacoTexto, margem + col1 + pad, y + pad);
        y += h;
        texto = texto.slice(n);
      }
    }
  }
  return pdf;
}

async function ckGerarPdf(semana, itens, avisoId) {
  if (!ckDataValida(semana)) {
    stfAviso(avisoId, "Informe a data de referência da semana antes de gerar o PDF.");
    return;
  }
  try {
    const JsPdf = await ckCarregarJsPdf();
    const pdf = ckDesenharPdf(JsPdf, semana, itens);
    pdf.save(`checkin-semanal-${semana}.pdf`);
    stfAviso(avisoId, "");
  } catch (e) {
    console.error(e);
    stfAviso(avisoId, "Não foi possível gerar o PDF. Verifique sua conexão e tente de novo.");
  }
}

/* ---------- Início ---------- */

async function iniciarCheckinStf() {
  const form = document.getElementById("stf-ck-form");
  if (!form) return;

  document.getElementById("stf-ck-novo").addEventListener("click", () => ckAbrirEditor(null));
  document.getElementById("stf-ck-cancelar").addEventListener("click", ckFecharEditor);
  document.getElementById("stf-ck-copiar").addEventListener("click", ckSugerirDoAnterior);
  document.getElementById("stf-ck-sugerir").addEventListener("click", ckSugerirDoCrm);
  document.getElementById("stf-ck-pdf-rascunho").addEventListener("click", () => {
    const r = ck.rascunho;
    if (r) ckGerarPdf(document.getElementById("stf-ck-semana").value, r.itens.filter((i) => String(i.atividades).trim()), "stf-ck-form-aviso");
  });
  form.addEventListener("submit", ckSalvar);

  // Digitação: atualiza o rascunho sem redesenhar (o cursor fica onde está).
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.name === "semana") { if (ck.rascunho) ck.rascunho.semana = el.value; return; }
    const sug = el.closest("[data-sug]");
    if (sug && el.dataset.sugCampo === "atividades") {
      const s = ck.sugestoes.find((x) => x.chave === sug.dataset.sug);
      if (s) s.atividades = el.value;
      return;
    }
    const item = ckItemDaChave(el.closest(".stf-ck-item")?.dataset.chave);
    if (!item) return;
    if (el.dataset.ckCampo === "atividades") item.atividades = el.value;
    if (el.dataset.ckCampo === "rotulo") item.clienteRotulo = el.value;
  });
  form.addEventListener("change", (e) => {
    const el = e.target;
    const sug = el.closest("[data-sug]");
    if (sug && el.dataset.sugCampo === "secao") {
      const s = ck.sugestoes.find((x) => x.chave === sug.dataset.sug);
      if (s && CK_SECOES.includes(el.value)) s.secao = el.value;
      return;
    }
    const li = el.closest(".stf-ck-item");
    const item = ckItemDaChave(li?.dataset.chave);
    if (!item) return;
    if (el.dataset.ckCampo === "cliente") {
      if (el.value === CK_LIVRE) { item.modo = "livre"; item.contaId = null; }
      else if (el.value) { item.modo = "conta"; item.contaId = el.value; }
      else { item.modo = "nenhum"; item.contaId = null; }
      const campo = li.querySelector("[data-ck-rotulo]");
      campo.hidden = item.modo !== "livre";
      if (item.modo === "livre") campo.querySelector("input").focus();
    }
    if (el.dataset.ckCampo === "secao" && CK_SECOES.includes(el.value) && el.value !== item.secao) {
      ckTrocarSecao(item, el.value);
      ckRenderizarEditor();
      document.querySelector(`.stf-ck-item[data-chave="${item.chave}"] [data-ck-campo="secao"]`)?.focus();
    }
  });
  form.addEventListener("click", (e) => {
    const alvo = e.target.closest("button");
    if (!alvo) return;
    if (alvo.dataset.ckAdd) {
      const novo = ckItemRascunho({ secao: alvo.dataset.ckAdd });
      ck.rascunho.itens.push(novo);
      ckRenderizarEditor();
      document.querySelector(`.stf-ck-item[data-chave="${novo.chave}"] [data-ck-campo="cliente"]`)?.focus();
      return;
    }
    const sug = alvo.closest("[data-sug]");
    if (sug && alvo.dataset.sugAcao) {
      if (alvo.dataset.sugAcao === "adicionar") ckAceitarSugestao(sug.dataset.sug);
      else { ck.sugestoes = ck.sugestoes.filter((x) => x.chave !== sug.dataset.sug); ckRenderizarSugestoes(); }
      return;
    }
    const item = ckItemDaChave(alvo.closest(".stf-ck-item")?.dataset.chave);
    if (!item) return;
    if (alvo.dataset.ckMover) {
      ckMover(item, Number(alvo.dataset.ckMover));
      ckRenderizarEditor();
      const botao = document.querySelector(`.stf-ck-item[data-chave="${item.chave}"] [data-ck-mover="${alvo.dataset.ckMover}"]`);
      (botao && !botao.disabled ? botao : document.querySelector(`.stf-ck-item[data-chave="${item.chave}"] [data-ck-campo="atividades"]`))?.focus();
    } else if (alvo.dataset.ckRemover !== undefined) {
      ck.rascunho.itens = ck.rascunho.itens.filter((i) => i !== item);
      ckRenderizarEditor();
    }
  });

  // Histórico e visualização.
  document.getElementById("stf-ck-lista").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-ck-acao]");
    if (!botao) return;
    const id = botao.closest("[data-ck-id]").dataset.ckId;
    const acao = botao.dataset.ckAcao;
    if (acao !== "excluir" && ck.confirmando) { ck.confirmando = null; renderizarCheckinStf(); }
    if (acao === "ver") ckMostrar(id);
    else if (acao === "editar") ckAbrirEditor(id);
    else if (acao === "pdf") { const c = ck.checkins.find((x) => x.id === id); if (c) ckGerarPdf(c.semana, ckItensDe(id), "stf-ck-aviso"); }
    else if (acao === "excluir") ckExcluir(botao, id);
  });
  document.getElementById("stf-ck-ver").addEventListener("click", (e) => {
    const acao = e.target.closest("[data-ck-ver]")?.dataset.ckVer;
    const id = ck.vendo;
    if (!acao || !id) return;
    if (acao === "fechar") ckFecharVer();
    else if (acao === "editar") ckAbrirEditor(id);
    else if (acao === "pdf") { const c = ck.checkins.find((x) => x.id === id); if (c) ckGerarPdf(c.semana, ckItensDe(id), "stf-ck-aviso"); }
  });
  // Tocar fora do "Excluir?" cancela a confirmação.
  document.addEventListener("click", (e) => {
    if (ck.confirmando && !e.target.closest?.("[data-ck-acao=excluir]")) { ck.confirmando = null; renderizarCheckinStf(); }
  });

  renderizarCheckinStf();
  const tabelas = { checkins: "stf_checkins", itens: "stf_checkin_itens" };
  for (const tabela of Object.values(tabelas)) stf.arm[tabela] = await abrirArmazenamento(tabela, []);
  for (const [chave, tabela] of Object.entries(tabelas)) {
    stf.arm[tabela].observar((lista) => { ck[chave] = lista; renderizarCheckinStf(); },
      () => stfAviso("stf-ck-aviso", "Não foi possível carregar os check-ins. Recarregue a página."));
  }
}

iniciarCheckinStf();

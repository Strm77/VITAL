/* ---------- SHARK: gerenciador de tarefas de design ----------
 * Clientes com frentes de trabalho de dois tipos:
 *   - pacote: N artes a entregar (ex.: 100 artes, já entregues 56);
 *   - etapas: artes geradas sozinhas para cada evento de um calendário (ex.: Stock Car),
 *     a partir de um modelo ("Race Week -6" = prazo 6 dias antes da corrida).
 * Mostra a carga de artes por semana (para não acumular), as próximas entregas,
 * a agenda do mês e os recebimentos, que entram como ganho no Financeiro.
 * Dados no schema "shark". Usa os helpers de data de estudos.js e diaCurto de saude.js.
 */

const shk = {
  clientes: [],
  frentes: [],
  eventos: [],
  tarefas: [],
  recebimentos: [],
  arm: {},
  filtro: "",
  editando: { cliente: null, frente: null, evento: null, receb: null },
  agendaMes: null,
  abertas: new Set(),
  historicos: new Set(),
};

const STOCK_CAR = "Stock Car";
// Etapas restantes de 2026 conforme o calendário revisado mais recente divulgado (confira no site oficial).
const STOCK_CAR_2026 = [
  { nome: "Etapa Goiânia", data: "2026-10-18", local: "Goiânia (GO)" },
  { nome: "Etapa Velopark", data: "2026-11-15", local: "Nova Santa Rita (RS)" },
  { nome: "Super Final — Interlagos", data: "2026-12-13", local: "São Paulo (SP)" },
];
const CHAVE_LIMITE_SHARK = "vital.shark.limite";
const NOMES_CORES = ["Azul", "Laranja", "Água", "Amarelo", "Rosa", "Verde", "Violeta", "Vermelho"];
const SEMANAS_CARGA = 8;

/* ---------- Utilidades ---------- */

const slugShark = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clienteDe = (id) => shk.clientes.find((c) => c.id === id);
const frenteDe = (id) => shk.frentes.find((f) => f.id === id);
const eventoDe = (id) => shk.eventos.find((e) => e.id === id);
const somaQtd = (lista) => lista.reduce((t, x) => t + (Number(x.quantidade) || 1), 0);
const somaValor = (lista) => lista.reduce((t, x) => t + (Number(x.valor) || 0), 0);
const corCliente = (c) => `var(--serie-${(c && c.cor) || 1})`;
const mesDe = (iso) => String(iso || "").slice(0, 7);
const proximoMes = (m) => { const [a, n] = m.split("-").map(Number); return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`; };
const mesAnterior = (m) => { const [a, n] = m.split("-").map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, "0")}`; };
const nomeMes = (m) => { const [a, n] = m.split("-").map(Number); return `${MESES_CURTOS[n - 1]}/${a}`; };
const artes = (n) => `${n} arte${n === 1 ? "" : "s"}`;

function relativo(iso) {
  const d = diasEntre(hojeDia(), iso);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  return d > 0 ? `em ${d} dias` : `${-d} dias atrás`;
}

/* Troca de subpágina e roda fn depois que a vista nova aparece. */
function irPara(hash, fn) {
  if (location.hash === hash) return fn();
  window.addEventListener("hashchange", () => setTimeout(fn, 0), { once: true });
  location.hash = hash;
}

function avisoShark(id, texto) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.hidden = !texto;
}

/* "Race Week -6" → { nome: "Race Week", dias: -6 }. Sem número, o prazo é o dia do evento. */
function lerModeloShark(texto) {
  return String(texto).split("\n").map((l) => l.trim()).filter(Boolean).map((linha) => {
    const m = linha.match(/^(.*?)\s*([+\-−–]\s*\d{1,3})$/);
    const nome = (m ? m[1] : linha).replace(/[;:,|]\s*$/, "").trim();
    const dias = m ? Number(m[2].replace(/[−–]/, "-").replace(/\s/g, "")) : 0;
    return { nome: nome.slice(0, 120), dias };
  }).filter((i) => i.nome);
}
const modeloParaTexto = (modelo) => (modelo || []).map((i) => `${i.nome}${i.dias ? ` ${i.dias > 0 ? "+" : ""}${i.dias}` : ""}`).join("\n");

/* ---------- Tarefas ---------- */

function eventosDaFrente(f) {
  if (f.tipo !== "etapas" || !f.calendario) return [];
  const cal = f.calendario.trim().toLowerCase();
  return shk.eventos
    .filter((e) => e.calendario.trim().toLowerCase() === cal && (!f.inicio || e.data >= f.inicio))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/* Tarefas de uma frente: as geradas pelo modelo em cada evento (salvas só quando mudam)
 * mais as cadastradas à mão (extras, entregas de pacote). */
function tarefasDaFrente(f) {
  const salvas = shk.tarefas.filter((t) => t.frenteId === f.id);
  const porId = new Map(salvas.map((t) => [t.id, t]));
  const geradas = [];
  for (const e of eventosDaFrente(f)) {
    const usados = new Set();
    (f.modelo || []).forEach((item, i) => {
      let chave = slugShark(item.nome) || String(i);
      if (usados.has(chave)) chave += `-${i}`;
      usados.add(chave);
      const id = `tf-${f.id}-${e.id}-${chave}`;
      const salva = porId.get(id);
      porId.delete(id);
      geradas.push({
        id, frenteId: f.id, eventoId: e.id, item: item.nome, nome: item.nome,
        prazo: somarDias(e.data, Number(item.dias) || 0), quantidade: 1,
        status: salva?.status || "a_fazer", entregueEm: salva?.entregueEm || null, extra: false, gerada: true, ordem: i,
      });
    });
  }
  return [...geradas, ...porId.values()];
}

function todasTarefas() {
  return shk.frentes.flatMap((f) => {
    const cliente = clienteDe(f.clienteId);
    return cliente ? tarefasDaFrente(f).map((t) => ({ ...t, frente: f, cliente })) : [];
  });
}

const pendente = (t) => t.status !== "entregue";

async function alternarEntrega(t, entregue) {
  await shk.arm.tarefas.salvar(t.id, {
    frenteId: t.frenteId, eventoId: t.eventoId || null, item: t.item || null, nome: t.nome,
    prazo: t.prazo || null, quantidade: Number(t.quantidade) || 1,
    status: entregue ? "entregue" : "a_fazer", entregueEm: entregue ? hojeDia() : null, extra: !!t.extra,
  });
}

/* Pacote: entregues, faltam e ritmo para o prazo. */
function progressoPacote(f) {
  const tarefas = tarefasDaFrente(f);
  const entregues = somaQtd(tarefas.filter((t) => t.status === "entregue"));
  const meta = Number(f.metaArtes) || 0;
  const faltam = Math.max(meta - entregues, 0);
  const planejadas = somaQtd(tarefas.filter(pendente));
  let porSemana = null;
  if (f.prazo && faltam > 0 && f.prazo >= hojeDia()) {
    const semanas = Math.max((diasEntre(hojeDia(), f.prazo) + 1) / 7, 1 / 7);
    porSemana = Math.ceil(faltam / semanas);
  }
  return { tarefas, entregues, meta, faltam, planejadas, porSemana };
}

/* ---------- Carga por semana ---------- */

function limiteSemanal() {
  try { return Math.max(1, Number(localStorage.getItem(CHAVE_LIMITE_SHARK)) || 10); } catch { return 10; }
}

/* Artes pendentes por semana (8 semanas a partir desta), separadas por cliente.
 * Atrasadas contam nesta semana. Pacotes com prazo entram com o ritmo necessário. */
function cargaSemanal() {
  const hoje = hojeDia();
  const semana0 = inicioSemana(hoje);
  const semanas = Array.from({ length: SEMANAS_CARGA }, (_, i) => ({ inicio: somarDias(semana0, i * 7), total: 0, partes: new Map() }));
  const somar = (i, cliente, qtd, ritmo) => {
    if (i < 0 || i >= SEMANAS_CARGA) return;
    const chave = cliente.id + (ritmo ? ":ritmo" : "");
    const parte = semanas[i].partes.get(chave) || { cliente, ritmo, qtd: 0 };
    parte.qtd += qtd;
    semanas[i].partes.set(chave, parte);
    semanas[i].total += qtd;
  };
  for (const t of todasTarefas()) {
    if (!pendente(t) || !t.prazo) continue;
    const i = t.prazo < semana0 ? 0 : Math.floor(diasEntre(semana0, inicioSemana(t.prazo)) / 7);
    somar(i, t.cliente, Number(t.quantidade) || 1, false);
  }
  for (const f of shk.frentes.filter((x) => x.tipo === "pacote" && x.prazo && x.prazo >= hoje)) {
    const cliente = clienteDe(f.clienteId);
    const p = progressoPacote(f);
    const restante = Math.max(p.faltam - p.planejadas, 0);
    if (!cliente || !restante) continue;
    const ultima = Math.floor(diasEntre(semana0, inicioSemana(f.prazo)) / 7);
    const porSemana = restante / (ultima + 1);
    for (let i = 0; i <= Math.min(ultima, SEMANAS_CARGA - 1); i++) somar(i, cliente, porSemana, true);
  }
  semanas.forEach((s) => { s.total = Math.round(s.total * 10) / 10; });
  return semanas;
}

/* ---------- Recebimentos ---------- */

function recebimentosPrevistos() {
  const hoje = hojeDia();
  const ate = proximoMes(mesDe(hoje));
  const lista = [];
  for (const c of shk.clientes) {
    if (!(Number(c.valorMensal) > 0) || c.ativo === false) continue;
    for (let m = c.inicioCobranca || mesDe(hoje), n = 0; m <= ate && n < 60; m = proximoMes(m), n++) {
      const [a, mm] = m.split("-").map(Number);
      const dia = Math.min(Number(c.diaPagamento) || 10, new Date(a, mm, 0).getDate());
      lista.push({
        id: `rc-${c.id}-m-${m}`, clienteId: c.id, descricao: `Mensal ${nomeMes(m)}`, valor: Number(c.valorMensal),
        vencimento: `${m}-${String(dia).padStart(2, "0")}`, recebidoEm: null, referencia: `mensal:${m}`, previsto: true,
      });
    }
  }
  for (const f of shk.frentes) {
    if (!(Number(f.valorPorEtapa) > 0)) continue;
    for (const e of eventosDaFrente(f).filter((x) => x.data <= somarDias(hoje, 45))) {
      lista.push({
        id: `rc-${f.id}-e-${e.id}`, clienteId: f.clienteId, descricao: `${f.nome} — ${e.nome}`, valor: Number(f.valorPorEtapa),
        vencimento: somarDias(e.data, 7), recebidoEm: null, referencia: `etapa:${f.id}:${e.id}`, previsto: true,
      });
    }
  }
  return lista;
}

/* Recebimentos salvos + previstos (mensalidades e etapas) que ainda não foram salvos. */
function todosRecebimentos() {
  const salvos = new Map(shk.recebimentos.map((r) => [r.id, r]));
  const lista = recebimentosPrevistos().map((p) => (salvos.has(p.id) ? { ...salvos.get(p.id) } : p));
  const ids = new Set(lista.map((r) => r.id));
  for (const r of shk.recebimentos) if (!ids.has(r.id)) lista.push({ ...r });
  return lista.filter((r) => !r.ignorado && clienteDe(r.clienteId));
}

const statusReceb = (r) => (r.recebidoEm ? "recebido" : r.vencimento < hojeDia() ? "atrasado" : "pendente");

/* Usado pelo Financeiro (torre.js): o que entrou e o que falta entrar dos clientes no mês. */
function sharkNoMes(mes) {
  const lista = todosRecebimentos();
  const itens = lista.filter((r) => mesDe(r.recebidoEm) === mes).map((r) => ({ ...r, cliente: clienteDe(r.clienteId) }));
  return {
    recebido: somaValor(itens),
    aReceber: somaValor(lista.filter((r) => !r.recebidoEm && mesDe(r.vencimento) === mes)),
    itens,
  };
}

async function salvarRecebimento(r, mudancas) {
  const { id, previsto, cliente, ...resto } = r;
  await shk.arm.recebimentos.salvar(id, {
    clienteId: resto.clienteId, descricao: resto.descricao, valor: Number(resto.valor), vencimento: resto.vencimento,
    recebidoEm: resto.recebidoEm || null, referencia: resto.referencia || null, ignorado: !!resto.ignorado, ...mudancas,
  });
}

/* ---------- Vista Tarefas ---------- */

function renderizarTopoShark() {
  const hoje = hojeDia();
  document.getElementById("shark-hoje").textContent = capitalizar(new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(paraData(hoje)));
  const fimSemana = somarDias(inicioSemana(hoje), 6);
  const tarefas = todasTarefas();
  const pend = tarefas.filter((t) => pendente(t) && t.prazo);
  const atrasadas = pend.filter((t) => t.prazo < hoje);
  const semana = pend.filter((t) => t.prazo >= hoje && t.prazo <= fimSemana);
  const trinta = pend.filter((t) => t.prazo >= hoje && t.prazo <= somarDias(hoje, 30));
  const entreguesMes = tarefas.filter((t) => t.status === "entregue" && mesDe(t.entregueEm) === mesDe(hoje));
  const dinheiro = sharkNoMes(mesDe(hoje));
  document.getElementById("shark-numeros").innerHTML = `
    <div class="shark-numero${atrasadas.length ? " alerta" : ""}"><span>Atrasadas</span> <strong>${somaQtd(atrasadas)}</strong> <small>${atrasadas.length ? "entregue o quanto antes" : "nada atrasado ✓"}</small></div>
    <div class="shark-numero"><span>Esta semana</span> <strong>${somaQtd(semana)}</strong> <small>até domingo, ${dataBR(fimSemana).slice(0, 5)}</small></div>
    <div class="shark-numero"><span>Próximos 30 dias</span> <strong>${somaQtd(trinta)}</strong> <small>artes com prazo</small></div>
    <div class="shark-numero"><span>Entregues no mês</span> <strong>${somaQtd(entreguesMes)}</strong> <small>${MESES_CURTOS[paraData(hoje).getMonth()].toLowerCase()}</small></div>
    <div class="shark-numero"><span>A receber no mês</span> <strong>${moeda.format(dinheiro.aReceber)}</strong> <small>recebido ${moeda.format(dinheiro.recebido)}</small></div>`;
  renderizarAlertasShark(tarefas, atrasadas);
}

function renderizarAlertasShark(tarefas, atrasadas) {
  const hoje = hojeDia();
  const m = [];
  if (atrasadas.length) {
    m.push({ tom: "alerta", titulo: `${artes(somaQtd(atrasadas))} atrasada${somaQtd(atrasadas) === 1 ? "" : "s"}`, texto: atrasadas.slice(0, 3).map((t) => `${t.nome} (${t.cliente.nome})`).join(", ") + (atrasadas.length > 3 ? "…" : "") });
  }
  // Eventos dos próximos 10 dias com artes pendentes
  const porEvento = new Map();
  for (const t of tarefas) {
    if (!pendente(t) || !t.eventoId) continue;
    const e = eventoDe(t.eventoId);
    if (!e || e.data < hoje || e.data > somarDias(hoje, 10)) continue;
    const g = porEvento.get(e.id) || { e, qtd: 0, quem: new Set() };
    g.qtd += Number(t.quantidade) || 1;
    g.quem.add(t.frente.nome === t.cliente.nome ? t.cliente.nome : `${t.cliente.nome} · ${t.frente.nome}`);
    porEvento.set(e.id, g);
  }
  for (const g of [...porEvento.values()].sort((a, b) => a.e.data.localeCompare(b.e.data))) {
    const d = diasEntre(hoje, g.e.data);
    m.push({ tom: d <= 7 ? "alerta" : "neutro", titulo: `${g.e.calendario}: ${g.e.nome} ${d === 0 ? "é hoje" : `em ${d} dia${d === 1 ? "" : "s"}`}`, texto: `${artes(g.qtd)} por fazer — ${[...g.quem].join(", ")}.` });
  }
  // Semanas acima do limite: sugere adiantar para uma semana mais leve antes dela
  const limite = limiteSemanal();
  const carga = cargaSemanal();
  carga.forEach((s, i) => {
    if (s.total <= limite) return;
    const total = Math.ceil(s.total);
    if (i === 0) { m.push({ tom: "alerta", titulo: `Esta semana está pesada: ${total} artes`, texto: `Seu limite é ${limite}. Comece pelas de prazo mais curto e adiante o que puder das próximas semanas.` }); return; }
    const leve = carga.slice(0, i).map((x, j) => ({ ...x, j })).sort((a, b) => a.total - b.total || b.j - a.j)[0];
    const mover = Math.min(Math.ceil(s.total - limite), Math.max(Math.floor(limite - leve.total), 0));
    m.push({
      tom: "alerta",
      titulo: `Semana de ${dataBR(s.inicio).slice(0, 5)} vai ter ${total} artes`,
      texto: mover > 0
        ? `Passa do seu limite de ${limite}. Adiante ${artes(mover)} para a semana de ${dataBR(leve.inicio).slice(0, 5)}, que tem ${Math.ceil(leve.total)}.`
        : `Passa do seu limite de ${limite} e as semanas antes também estão cheias. Converse com o cliente sobre os prazos.`,
    });
  });
  for (const f of shk.frentes.filter((x) => x.tipo === "pacote")) {
    const p = progressoPacote(f);
    const c = clienteDe(f.clienteId);
    if (!c || !p.faltam) continue;
    if (p.porSemana) m.push({ tom: "neutro", titulo: `${c.nome}: faltam ${artes(p.faltam)} até ${dataBR(f.prazo)}`, texto: `Ritmo necessário: ${artes(p.porSemana)} por semana (${p.entregues} de ${p.meta} entregues).` });
    else if (f.prazo && f.prazo < hoje) m.push({ tom: "alerta", titulo: `${c.nome}: o prazo do pacote passou`, texto: `Faltam ${artes(p.faltam)} de ${p.meta}.` });
  }
  const atrasado = todosRecebimentos().filter((r) => statusReceb(r) === "atrasado");
  if (atrasado.length) m.push({ tom: "alerta", titulo: `${moeda.format(somaValor(atrasado))} a receber em atraso`, texto: [...new Set(atrasado.map((r) => clienteDe(r.clienteId).nome))].join(", ") + " — veja em Recebimentos." });
  if (!m.length) {
    m.push(shk.clientes.length
      ? { tom: "bom", titulo: "Tudo em dia 🦈", texto: "Nenhuma arte atrasada e nenhuma semana acima do limite." }
      : { tom: "neutro", titulo: "Comece cadastrando seus clientes", texto: "Em Clientes, crie cada cliente e as frentes de trabalho dele. As artes por etapa aparecem sozinhas a partir do calendário." });
  }
  document.getElementById("shark-alertas").innerHTML = m.slice(0, 6).map((x) => `
    <div class="mensagem ${x.tom}"><strong>${escapar(x.titulo)}</strong> <span>${escapar(x.texto)}</span></div>`).join("");
}

function renderizarCargaShark() {
  const limite = limiteSemanal();
  const entrada = document.getElementById("shark-limite");
  if (document.activeElement !== entrada) entrada.value = limite;
  const carga = cargaSemanal();
  const maior = Math.max(limite * 1.25, ...carga.map((s) => s.total), 1);
  const clientesNaCarga = new Map();
  let temRitmo = false;
  carga.forEach((s) => s.partes.forEach((p) => { clientesNaCarga.set(p.cliente.id, p.cliente); if (p.ritmo) temRitmo = true; }));
  document.getElementById("shark-carga-legenda").innerHTML = `
    ${[...clientesNaCarga.values()].map((c) => `<span><span class="marca" style="background:${corCliente(c)}"></span>${escapar(c.nome)}</span>`).join(" ")}
    ${temRitmo ? `<span><span class="marca listrada"></span>ritmo do pacote</span>` : ""}
    <span><span class="marca linha"></span>limite</span>`;
  const el = document.getElementById("shark-carga");
  el.setAttribute("aria-label", "Artes por semana: " + carga.map((s) => `semana de ${dataBR(s.inicio).slice(0, 5)}, ${Math.ceil(s.total)}`).join("; "));
  el.innerHTML = `
    <div class="carga-area">
      <span class="carga-limite" style="bottom:${(limite / maior) * 100}%"></span>
      ${carga.map((s, i) => {
        const partes = [...s.partes.values()].sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome) || a.ritmo - b.ritmo);
        const titulo = `Semana de ${dataBR(s.inicio).slice(0, 5)}: ${artes(Math.ceil(s.total))}` + (partes.length ? " — " + partes.map((p) => `${p.cliente.nome}${p.ritmo ? " (ritmo)" : ""} ${Math.ceil(p.qtd)}`).join(", ") : "");
        return `
        <div class="carga-col${i === 0 ? " atual" : ""}${s.total > limite ? " acima" : ""}" title="${escapar(titulo)}">
          <span class="carga-total">${s.total ? `${s.total > limite ? "⚠ " : ""}${Math.ceil(s.total)}` : ""}</span>
          <div class="carga-pilha" style="height:${(s.total / maior) * 100}%">
            ${partes.map((p) => `<span class="carga-seg${p.ritmo ? " ritmo" : ""}" style="--cor:${corCliente(p.cliente)};flex-grow:${p.qtd}"></span>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="carga-rotulos">${carga.map((s, i) => `<span>${i === 0 ? "esta" : dataBR(s.inicio).slice(0, 5)}</span>`).join("")}</div>`;
}

function linhaTarefa(t) {
  const hoje = hojeDia();
  const evento = t.eventoId ? eventoDe(t.eventoId) : null;
  const feito = t.status === "entregue";
  const atrasada = !feito && t.prazo && t.prazo < hoje;
  const sub = [t.cliente.nome, t.frente.nome !== t.cliente.nome ? t.frente.nome : "", evento ? evento.nome : "", t.extra ? "extra" : ""].filter(Boolean).join(" · ");
  return `
    <li class="tarefa${feito ? " feita" : ""}${atrasada ? " atrasada" : ""}" style="--cor:${corCliente(t.cliente)}">
      <input type="checkbox" data-tarefa="${escapar(t.id)}" ${feito ? "checked" : ""} aria-label="Entregue: ${escapar(t.nome)}">
      <span class="tarefa-texto">
        <span class="tarefa-nome">${escapar(t.nome)}${Number(t.quantidade) > 1 ? ` <em>×${t.quantidade}</em>` : ""}</span>
        <small><span class="ponto-cor"></span>${escapar(sub)}</small>
      </span>
      <span class="tarefa-prazo">${t.prazo ? `${diaCurto(t.prazo)} <small>${feito ? `entregue ${dataBR(t.entregueEm).slice(0, 5)}` : relativo(t.prazo)}</small>` : "<small>sem prazo</small>"}</span>
      ${t.gerada ? "" : `<button type="button" class="botao mini" data-excluir-tarefa="${escapar(t.id)}" aria-label="Excluir ${escapar(t.nome)}">×</button>`}
    </li>`;
}

function ligarTarefas(raiz, lista) {
  raiz.querySelectorAll("[data-tarefa]").forEach((caixa) => caixa.addEventListener("change", async () => {
    const t = lista.find((x) => x.id === caixa.dataset.tarefa);
    caixa.disabled = true;
    try { await alternarEntrega(t, caixa.checked); }
    catch { caixa.checked = !caixa.checked; caixa.disabled = false; avisoShark("shark-aviso", "Não foi possível salvar. Tente de novo."); }
  }));
  raiz.querySelectorAll("[data-excluir-tarefa]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.confirmar !== "sim") { b.dataset.confirmar = "sim"; b.textContent = "Excluir?"; b.classList.add("perigo"); return; }
    b.disabled = true;
    try { await shk.arm.tarefas.excluir(b.dataset.excluirTarefa); } catch { b.disabled = false; }
  }));
}

function renderizarListaTarefas() {
  const hoje = hojeDia();
  const semana0 = inicioSemana(hoje);
  const fim = somarDias(hoje, 60);
  const todas = todasTarefas().filter((t) => !shk.filtro || t.cliente.id === shk.filtro);
  const grupos = [
    { titulo: "Atrasadas", filtro: (t) => pendente(t) && t.prazo && t.prazo < hoje },
    { titulo: "Esta semana", filtro: (t) => pendente(t) && t.prazo >= hoje && t.prazo <= somarDias(semana0, 6) },
    { titulo: "Próxima semana", filtro: (t) => pendente(t) && t.prazo >= somarDias(semana0, 7) && t.prazo <= somarDias(semana0, 13) },
    { titulo: "Mais adiante", filtro: (t) => pendente(t) && t.prazo >= somarDias(semana0, 14) && t.prazo <= fim },
    { titulo: "Sem prazo", filtro: (t) => pendente(t) && !t.prazo && (t.frente.tipo !== "pacote" || t.extra) },
    { titulo: "Entregues nos últimos 7 dias", filtro: (t) => t.status === "entregue" && t.entregueEm >= somarDias(hoje, -6) && (t.frente.tipo !== "pacote" || t.extra), feitas: true },
  ];
  const html = grupos.map((g) => {
    const lista = todas.filter(g.filtro).sort((a, b) => (a.prazo || "9").localeCompare(b.prazo || "9") || (a.ordem ?? 99) - (b.ordem ?? 99));
    if (!lista.length) return "";
    return `
      <div class="grupo-tarefas${g.feitas ? " feitas" : ""}">
        <h3>${g.titulo} <span>${artes(somaQtd(lista))}</span></h3>
        <ul class="tarefas">${lista.map(linhaTarefa).join("")}</ul>
      </div>`;
  }).join("");
  const raiz = document.getElementById("shark-tarefas");
  raiz.innerHTML = html;
  const vazio = document.getElementById("shark-sem-tarefas");
  vazio.hidden = !!html;
  vazio.textContent = shk.frentes.length ? "Nenhuma arte com prazo nos próximos 60 dias." : "Cadastre clientes e frentes de trabalho em Clientes para ver as artes aqui.";
  ligarTarefas(raiz, todas);

  document.getElementById("shark-filtro").innerHTML = shk.clientes.length > 1 ? [
    `<button type="button" class="chip-filtro${shk.filtro ? "" : " ativo"}" data-filtro="" aria-pressed="${!shk.filtro}">Todos</button>`,
    ...shk.clientes.map((c) => `<button type="button" class="chip-filtro${shk.filtro === c.id ? " ativo" : ""}" data-filtro="${escapar(c.id)}" aria-pressed="${shk.filtro === c.id}" style="--cor:${corCliente(c)}"><span class="ponto-cor"></span>${escapar(c.nome)}</button>`),
  ].join("") : "";
  document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { shk.filtro = b.dataset.filtro; renderizarListaTarefas(); }));
}

/* ---------- Formulário de arte extra ---------- */

function opcoesFrentes(selecionada) {
  return shk.frentes.map((f) => {
    const c = clienteDe(f.clienteId);
    return c ? `<option value="${escapar(f.id)}" ${f.id === selecionada ? "selected" : ""}>${escapar(c.nome)}${f.nome !== c.nome ? ` · ${escapar(f.nome)}` : ""}</option>` : "";
  }).join("");
}

function preencherEventosExtra() {
  const f = frenteDe(document.getElementById("extra-frente").value);
  const hoje = hojeDia();
  const eventos = f ? eventosDaFrente(f).filter((e) => e.data >= somarDias(hoje, -14)) : [];
  document.getElementById("extra-evento").innerHTML = `<option value="">—</option>` + eventos.map((e) => `<option value="${escapar(e.id)}">${escapar(e.nome)} · ${dataBR(e.data).slice(0, 5)}</option>`).join("");
}

function abrirFormularioExtra(frenteId = "", eventoId = "") {
  if (!shk.frentes.length) { irPara("#shark-clientes", () => (shk.clientes.length ? abrirFormularioFrente("") : abrirFormularioCliente(""))); return; }
  const form = document.getElementById("extra-form");
  form.reset();
  document.getElementById("extra-frente").innerHTML = opcoesFrentes(frenteId || shk.frentes[0].id);
  preencherEventosExtra();
  if (eventoId) {
    document.getElementById("extra-evento").value = eventoId;
    const e = eventoDe(eventoId);
    if (e) document.getElementById("extra-prazo").value = e.data;
  }
  form.hidden = false;
  document.getElementById("extra-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  document.getElementById("extra-nome").focus({ preventScroll: true });
}

function fecharFormularioExtra() {
  document.getElementById("extra-form").hidden = true;
  document.getElementById("extra-adicionar").hidden = false;
  avisoShark("shark-aviso", "");
}

async function salvarExtra(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  const quantidade = Math.round(Number(f.quantidade.value) || 1);
  const evento = eventoDe(f.eventoId.value);
  if (!f.frenteId.value) return avisoShark("shark-aviso", "Escolha o cliente e a frente.");
  if (!nome) { avisoShark("shark-aviso", "Dê um nome para a arte."); return f.nome.focus(); }
  if (!(quantidade >= 1 && quantidade <= 1000)) return avisoShark("shark-aviso", "A quantidade vai de 1 a 1000.");
  try {
    await shk.arm.tarefas.salvar(null, {
      frenteId: f.frenteId.value, eventoId: evento ? evento.id : null, item: null, nome,
      prazo: f.prazo.value || (evento ? evento.data : null), quantidade, status: "a_fazer", entregueEm: null, extra: true,
    });
    fecharFormularioExtra();
  } catch { avisoShark("shark-aviso", "Não foi possível salvar a arte. Tente de novo."); }
}

/* ---------- Vista Clientes ---------- */

function htmlPacote(f, c) {
  const p = progressoPacote(f);
  // Mais recentes primeiro (no mesmo dia, a última registrada vem antes).
  const entregas = p.tarefas.filter((t) => t.status === "entregue").reverse().sort((a, b) => (b.entregueEm || "").localeCompare(a.entregueEm || ""));
  const aberto = shk.historicos.has(f.id);
  return `
    <div class="frente" data-frente="${escapar(f.id)}">
      <div class="frente-topo">
        <div><h4>📦 ${escapar(f.nome)}</h4> <span class="sub">${f.prazo ? `prazo ${dataBR(f.prazo)}` : "sem prazo"}</span></div>
        <strong class="frente-numero">${p.entregues} <em>de ${p.meta}</em></strong>
      </div>
      <div class="barra" role="progressbar" aria-label="Artes entregues de ${escapar(f.nome)}"><div class="preenchimento"></div></div>
      <p class="frente-legenda">${p.faltam ? `Faltam <strong>${p.faltam}</strong>` : "<strong>Pacote completo ✓</strong>"}${p.porSemana ? ` · ritmo de ${artes(p.porSemana)} por semana para o prazo` : ""}${p.planejadas ? ` · ${artes(p.planejadas)} planejada${p.planejadas === 1 ? "" : "s"}` : ""}</p>
      <div class="acoes frente-acoes">
        <button type="button" class="botao primario" data-acao="mais-um">+1 entregue (nº ${p.entregues + 1})</button>
        <button type="button" class="botao" data-acao="varias">Registrar várias</button>
        <button type="button" class="botao" data-acao="historico" aria-expanded="${aberto}">Histórico</button>
        <button type="button" class="botao" data-acao="editar-frente">Editar</button>
        <button type="button" class="botao" data-acao="excluir-frente">Excluir</button>
      </div>
      <form class="varias-form" hidden novalidate>
        <label class="campo">Quantas artes você entregou?
          <input name="quantidade" type="number" min="1" max="1000" step="1" inputmode="numeric">
        </label>
        <button type="submit" class="botao primario">Registrar</button>
      </form>
      <ul class="entregas" ${aberto ? "" : "hidden"}>${entregas.slice(0, 15).map((t) => `
        <li><span>${escapar(t.nome)}</span> <span class="sub">${t.entregueEm ? dataBR(t.entregueEm) : ""}</span>
          <button type="button" class="botao mini" data-excluir-tarefa="${escapar(t.id)}">Desfazer</button></li>`).join("") || `<li class="sub">Nenhuma entrega ainda.</li>`}</ul>
    </div>`;
}

function htmlEtapas(f, c) {
  const hoje = hojeDia();
  const tarefas = tarefasDaFrente(f);
  const eventos = eventosDaFrente(f);
  const daTemporada = tarefas.filter((t) => t.prazo && t.prazo <= somarDias(hoje, 60));
  const feitas = somaQtd(daTemporada.filter((t) => t.status === "entregue"));
  const total = somaQtd(daTemporada);
  // Mostra os eventos recentes (com pendências) e os próximos; abre o próximo por padrão.
  const visiveis = eventos.filter((e) => e.data >= somarDias(hoje, -21) || tarefas.some((t) => t.eventoId === e.id && pendente(t))).slice(0, 6);
  const proximo = eventos.find((e) => e.data >= somarDias(hoje, -1));
  const linhas = visiveis.map((e) => {
    const chave = `${f.id}:${e.id}`;
    const aberto = shk.abertas.has(chave) || (!shk.abertas.has("!" + chave) && proximo && proximo.id === e.id);
    const doEvento = tarefas.filter((t) => t.eventoId === e.id).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    const ok = somaQtd(doEvento.filter((t) => t.status === "entregue"));
    const tot = somaQtd(doEvento);
    return `
      <div class="etapa${aberto ? " aberta" : ""}">
        <button type="button" class="etapa-topo" data-etapa="${escapar(chave)}" aria-expanded="${aberto}">
          <span class="etapa-nome">${escapar(e.nome)} <small>${diaCurto(e.data)} · ${relativo(e.data)}</small></span>
          <span class="etapa-pontos" aria-hidden="true">${doEvento.map((t) => `<i class="${t.status === "entregue" ? "ok" : t.prazo < hoje ? "atrasada" : ""}"></i>`).join("")}</span>
          <span class="etapa-contagem">${ok}/${tot}</span>
        </button>
        ${aberto ? `<ul class="tarefas compacta">${doEvento.map((t) => linhaTarefa({ ...t, frente: f, cliente: c })).join("")}</ul>
        <button type="button" class="botao mini" data-extra-evento="${escapar(e.id)}">+ Arte extra nesta etapa</button>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="frente" data-frente="${escapar(f.id)}">
      <div class="frente-topo">
        <div><h4>🏁 ${escapar(f.nome)}</h4> <span class="sub">calendário ${escapar(f.calendario || "—")} · ${artes((f.modelo || []).length)} por etapa${Number(f.valorPorEtapa) > 0 ? ` · ${moeda.format(f.valorPorEtapa)} por etapa` : ""}</span></div>
        <strong class="frente-numero">${feitas} <em>de ${total}</em></strong>
      </div>
      <div class="barra" role="progressbar" aria-label="Artes entregues de ${escapar(f.nome)}"><div class="preenchimento"></div></div>
      <div class="etapas">${linhas || `<p class="estado">Nenhum evento no calendário “${escapar(f.calendario || "")}” ainda. Cadastre as datas em Calendário.</p>`}</div>
      <div class="acoes frente-acoes">
        <button type="button" class="botao" data-acao="extra">+ Arte extra</button>
        <button type="button" class="botao" data-acao="editar-frente">Editar</button>
        <button type="button" class="botao" data-acao="excluir-frente">Excluir</button>
      </div>
    </div>`;
}

function renderizarClientesShark() {
  const raiz = document.getElementById("clientes-shark");
  document.getElementById("clientes-vazio").hidden = shk.clientes.length > 0;
  document.getElementById("frente-adicionar").hidden = !shk.clientes.length || !document.getElementById("frente-form").hidden;
  const receb = todosRecebimentos();
  const ano = hojeDia().slice(0, 4);
  raiz.innerHTML = shk.clientes.map((c) => {
    const frentes = shk.frentes.filter((f) => f.clienteId === c.id);
    const doCliente = receb.filter((r) => r.clienteId === c.id);
    const recebidoAno = somaValor(doCliente.filter((r) => r.recebidoEm && r.recebidoEm.startsWith(ano)));
    const aReceber = somaValor(doCliente.filter((r) => !r.recebidoEm));
    return `
    <section class="painel cliente-shark" data-cliente="${escapar(c.id)}" style="--cor:${corCliente(c)}">
      <div class="painel-cabecalho">
        <h2><span class="ponto-cor grande"></span>${escapar(c.nome)}</h2>
        <div class="acoes cliente-acoes">
          <button type="button" class="botao mini" data-acao="nova-frente">+ Frente</button>
          <button type="button" class="botao mini" data-acao="editar-cliente">Editar</button>
          <button type="button" class="botao mini" data-acao="excluir-cliente">Excluir</button>
        </div>
      </div>
      <div class="cliente-dinheiro">
        <span>Recebido em ${ano} <strong>${moeda.format(recebidoAno)}</strong></span>
        <span>A receber <strong>${moeda.format(aReceber)}</strong></span>
        ${Number(c.valorMensal) > 0 ? `<span>Mensal <strong>${moeda.format(c.valorMensal)}</strong> dia ${c.diaPagamento || 10}</span>` : ""}
      </div>
      ${frentes.map((f) => (f.tipo === "pacote" ? htmlPacote(f, c) : htmlEtapas(f, c))).join("") || `<p class="estado">Nenhuma frente de trabalho. Use “+ Frente” para criar um pacote de artes ou artes por etapa.</p>`}
    </section>`;
  }).join("");

  raiz.querySelectorAll(".cliente-shark").forEach((sec) => {
    const c = clienteDe(sec.dataset.cliente);
    sec.querySelector("[data-acao=nova-frente]").addEventListener("click", () => abrirFormularioFrente("", c.id));
    sec.querySelector("[data-acao=editar-cliente]").addEventListener("click", () => abrirFormularioCliente(c.id));
    const ex = sec.querySelector("[data-acao=excluir-cliente]");
    ex.addEventListener("click", async () => {
      if (ex.dataset.confirmar !== "sim") { ex.dataset.confirmar = "sim"; ex.textContent = "Excluir cliente, artes e recebimentos?"; ex.classList.add("perigo"); return; }
      ex.disabled = true;
      try {
        for (const f of shk.frentes.filter((x) => x.clienteId === c.id)) await excluirFrente(f);
        for (const r of shk.recebimentos.filter((x) => x.clienteId === c.id)) await shk.arm.recebimentos.excluir(r.id);
        await shk.arm.clientes.excluir(c.id);
      } catch { ex.disabled = false; }
    });
  });

  raiz.querySelectorAll(".frente").forEach((el) => {
    const f = frenteDe(el.dataset.frente);
    const c = clienteDe(f.clienteId);
    const barra = el.querySelector(".barra");
    if (f.tipo === "pacote") {
      const p = progressoPacote(f);
      preencherBarra(barra, p.meta ? Math.min(p.entregues / p.meta, 1) : 0);
      el.querySelector("[data-acao=mais-um]").addEventListener("click", async (ev) => {
        ev.target.disabled = true;
        try { await registrarEntregaPacote(f, 1); } catch { ev.target.disabled = false; }
      });
      const form = el.querySelector(".varias-form");
      el.querySelector("[data-acao=varias]").addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) form.elements.quantidade.focus(); });
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const n = Math.round(Number(form.elements.quantidade.value));
        if (!(n >= 1 && n <= 1000)) return form.elements.quantidade.focus();
        try { await registrarEntregaPacote(f, n); } catch {}
      });
      el.querySelector("[data-acao=historico]").addEventListener("click", () => {
        shk.historicos.has(f.id) ? shk.historicos.delete(f.id) : shk.historicos.add(f.id);
        renderizarClientesShark();
      });
    } else {
      const ts = tarefasDaFrente(f).filter((t) => t.prazo && t.prazo <= somarDias(hojeDia(), 60));
      const tot = somaQtd(ts);
      preencherBarra(barra, tot ? somaQtd(ts.filter((t) => t.status === "entregue")) / tot : 0);
      el.querySelector("[data-acao=extra]").addEventListener("click", () => irPara("#shark", () => abrirFormularioExtra(f.id)));
      el.querySelectorAll("[data-extra-evento]").forEach((b) => b.addEventListener("click", () => irPara("#shark", () => abrirFormularioExtra(f.id, b.dataset.extraEvento))));
      el.querySelectorAll("[data-etapa]").forEach((b) => b.addEventListener("click", () => {
        const chave = b.dataset.etapa;
        if (b.getAttribute("aria-expanded") === "true") { shk.abertas.delete(chave); shk.abertas.add("!" + chave); }
        else { shk.abertas.add(chave); shk.abertas.delete("!" + chave); }
        renderizarClientesShark();
      }));
      ligarTarefas(el, tarefasDaFrente(f).map((t) => ({ ...t, frente: f, cliente: c })));
    }
    if (f.tipo === "pacote") ligarTarefas(el, tarefasDaFrente(f));
    el.querySelector("[data-acao=editar-frente]").addEventListener("click", () => abrirFormularioFrente(f.id));
    const ex = el.querySelector("[data-acao=excluir-frente]");
    ex.addEventListener("click", async () => {
      if (ex.dataset.confirmar !== "sim") { ex.dataset.confirmar = "sim"; ex.textContent = "Excluir frente e artes?"; ex.classList.add("perigo"); return; }
      ex.disabled = true;
      try { await excluirFrente(f); } catch { ex.disabled = false; }
    });
  });
}

async function registrarEntregaPacote(f, n) {
  const p = progressoPacote(f);
  const de = p.entregues + 1, ate = p.entregues + n;
  await shk.arm.tarefas.salvar(null, {
    frenteId: f.id, eventoId: null, item: null, nome: n === 1 ? `Arte ${de}` : `Artes ${de}–${ate}`,
    prazo: null, quantidade: n, status: "entregue", entregueEm: hojeDia(), extra: false,
  });
}

async function excluirFrente(f) {
  for (const t of shk.tarefas.filter((x) => x.frenteId === f.id)) await shk.arm.tarefas.excluir(t.id);
  for (const r of shk.recebimentos.filter((x) => String(x.referencia || "").startsWith(`etapa:${f.id}:`) && !x.recebidoEm)) await shk.arm.recebimentos.excluir(r.id);
  await shk.arm.frentes.excluir(f.id);
}

/* Formulário de cliente */
function abrirFormularioCliente(id) {
  const form = document.getElementById("cliente-form");
  const c = clienteDe(id);
  shk.editando.cliente = c ? id : null;
  form.reset();
  document.getElementById("cliente-form-titulo").textContent = c ? `Editar ${c.nome}` : "Novo cliente";
  const usadas = new Set(shk.clientes.map((x) => x.cor));
  const cor = c ? c.cor : ([1, 2, 3, 4, 5, 7, 6, 8].find((n) => !usadas.has(n)) || 1);
  document.getElementById("cliente-cores").innerHTML = `<legend>Cor</legend>` + NOMES_CORES.map((nome, i) => `
    <label class="cor" style="--cor:var(--serie-${i + 1})"><input type="radio" name="cor" value="${i + 1}" ${cor === i + 1 ? "checked" : ""}><span title="${nome}"></span><span class="sr">${nome}</span></label>`).join("");
  if (c) {
    form.elements.nome.value = c.nome;
    form.elements.valorMensal.value = c.valorMensal || "";
    form.elements.diaPagamento.value = c.diaPagamento || "";
    form.elements.inicioCobranca.value = c.inicioCobranca || "";
  }
  form.hidden = false;
  document.getElementById("cliente-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioCliente() {
  document.getElementById("cliente-form").hidden = true;
  document.getElementById("cliente-adicionar").hidden = false;
  shk.editando.cliente = null;
}

async function salvarCliente(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  if (!nome) return f.nome.focus();
  const mensal = Number(f.valorMensal.value);
  const dia = Number(f.diaPagamento.value);
  const atual = clienteDe(shk.editando.cliente);
  const dados = {
    nome, cor: Number(f.cor.value) || 1,
    valorMensal: mensal > 0 ? mensal : null,
    diaPagamento: dia >= 1 && dia <= 31 ? Math.round(dia) : null,
    inicioCobranca: mensal > 0 ? (f.inicioCobranca.value || mesDe(hojeDia())) : null,
    ativo: atual ? atual.ativo !== false : true,
  };
  try { await shk.arm.clientes.salvar(shk.editando.cliente, dados); fecharFormularioCliente(); } catch {}
}

/* Formulário de frente */
function ajustarFormularioFrente() {
  const form = document.getElementById("frente-form");
  const tipo = form.elements.tipo.value;
  form.querySelectorAll("[data-tipo]").forEach((el) => { el.hidden = el.dataset.tipo !== tipo; });
  // "Já entregues" só faz sentido ao criar.
  form.elements.jaEntregues.closest("label").hidden = tipo !== "pacote" || !!shk.editando.frente;
}

function abrirFormularioFrente(id, clienteId = "") {
  const form = document.getElementById("frente-form");
  const f = frenteDe(id);
  shk.editando.frente = f ? id : null;
  form.reset();
  document.getElementById("frente-form-titulo").textContent = f ? `Editar ${f.nome}` : "Nova frente de trabalho";
  document.getElementById("frente-cliente").innerHTML = shk.clientes.map((c) => `<option value="${escapar(c.id)}">${escapar(c.nome)}</option>`).join("");
  form.elements.clienteId.value = f ? f.clienteId : clienteId || shk.clientes[0]?.id || "";
  form.elements.inicio.value = hojeDia();
  if (f) {
    form.elements.nome.value = f.nome;
    form.elements.tipo.value = f.tipo;
    form.elements.metaArtes.value = f.metaArtes || "";
    form.elements.prazo.value = f.prazo || "";
    form.elements.calendario.value = f.calendario || "";
    form.elements.inicio.value = f.inicio || "";
    form.elements.modelo.value = modeloParaTexto(f.modelo);
    form.elements.valorPorEtapa.value = f.valorPorEtapa || "";
  }
  form.querySelectorAll("[name=tipo]").forEach((r) => { r.disabled = !!f; });
  ajustarFormularioFrente();
  form.hidden = false;
  document.getElementById("frente-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.nome.focus({ preventScroll: true });
}

function fecharFormularioFrente() {
  document.getElementById("frente-form").hidden = true;
  document.getElementById("frente-adicionar").hidden = !shk.clientes.length;
  shk.editando.frente = null;
  avisoShark("frente-aviso", "");
}

async function salvarFrente(e) {
  e.preventDefault();
  const f = e.target.elements;
  const nome = f.nome.value.trim();
  const tipo = f.tipo.value;
  const erro = (t, campo) => { avisoShark("frente-aviso", t); campo?.focus(); };
  if (!f.clienteId.value) return erro("Cadastre um cliente antes.");
  if (!nome) return f.nome.focus();
  const dados = { clienteId: f.clienteId.value, nome, tipo, metaArtes: null, prazo: null, calendario: null, inicio: null, modelo: [], valorPorEtapa: null };
  if (tipo === "pacote") {
    const meta = Math.round(Number(f.metaArtes.value));
    if (!(meta >= 1)) return erro("Informe quantas artes tem o pacote.", f.metaArtes);
    dados.metaArtes = meta;
    dados.prazo = f.prazo.value || null;
  } else {
    dados.calendario = f.calendario.value.trim();
    dados.modelo = lerModeloShark(f.modelo.value);
    if (!dados.calendario) return erro("Diga qual calendário essa frente segue (ex.: Stock Car).", f.calendario);
    if (!dados.modelo.length) return erro("Liste as artes de cada etapa, uma por linha.", f.modelo);
    dados.inicio = f.inicio.value || null;
    dados.valorPorEtapa = Number(f.valorPorEtapa.value) > 0 ? Number(f.valorPorEtapa.value) : null;
  }
  const botao = e.target.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const id = await shk.arm.frentes.salvar(shk.editando.frente, dados);
    const ja = Math.round(Number(f.jaEntregues.value));
    if (!shk.editando.frente && tipo === "pacote" && ja >= 1) {
      await shk.arm.tarefas.salvar(null, {
        frenteId: id, eventoId: null, item: null, nome: ja === 1 ? "Arte 1" : `Artes 1–${ja}`,
        prazo: null, quantidade: Math.min(ja, 1000), status: "entregue", entregueEm: hojeDia(), extra: false,
      });
    }
    fecharFormularioFrente();
  } catch { avisoShark("frente-aviso", "Não foi possível salvar a frente. Tente de novo."); }
  finally { botao.disabled = false; }
}

/* ---------- Vista Calendário ---------- */

function renderizarAgenda() {
  const hoje = hojeDia();
  const mes = shk.agendaMes || mesDe(hoje);
  document.getElementById("agenda-mes").textContent = capitalizar(mesAno.format(paraData(`${mes}-01`)));
  const primeiro = `${mes}-01`;
  const inicio = inicioSemana(primeiro);
  const [a, m] = mes.split("-").map(Number);
  const ultimo = `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
  const fim = somarDias(inicioSemana(ultimo), 6);
  const tarefas = todasTarefas().filter((t) => t.prazo && t.prazo >= inicio && t.prazo <= fim);
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const doDia = tarefas.filter((t) => t.prazo === d);
    const eventos = shk.eventos.filter((e) => e.data === d);
    const pend = doDia.filter(pendente);
    const titulo = [...eventos.map((e) => `🏁 ${e.calendario}: ${e.nome}`), ...doDia.map((t) => `${t.status === "entregue" ? "✓" : "•"} ${t.nome} (${t.cliente.nome})`)].join("\n");
    dias.push(`
      <div class="agenda-dia${mesDe(d) !== mes ? " fora" : ""}${d === hoje ? " hoje" : ""}${pend.some((t) => d < hoje) ? " atrasada" : ""}" ${titulo ? `title="${escapar(titulo)}"` : ""}>
        <span class="agenda-num">${paraData(d).getDate()}</span>
        ${eventos.map((e) => `<span class="agenda-evento">🏁 ${escapar(e.nome)}</span>`).join("")}
        ${doDia.length ? `<span class="agenda-artes">${doDia.slice(0, 6).map((t) => `<i style="--cor:${corCliente(t.cliente)}" class="${t.status === "entregue" ? "ok" : ""}"></i>`).join("")}${doDia.length > 6 ? `<em>+${doDia.length - 6}</em>` : ""}</span>
        <span class="agenda-qtd">${artes(somaQtd(pend))}</span>` : ""}
      </div>`);
  }
  document.getElementById("agenda").innerHTML = `
    <div class="agenda-semana">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="agenda-grade">${dias.join("")}</div>`;
}

function renderizarEventosShark() {
  const calendarios = [...new Set([...shk.eventos.map((e) => e.calendario), ...shk.frentes.map((f) => f.calendario).filter(Boolean), STOCK_CAR])];
  document.getElementById("shark-calendarios").innerHTML = calendarios.map((c) => `<option value="${escapar(c)}"></option>`).join("");
  const faltando = STOCK_CAR_2026.filter((x) => x.data >= hojeDia() && !shk.eventos.some((e) => e.calendario.toLowerCase() === STOCK_CAR.toLowerCase() && e.data === x.data));
  document.getElementById("importar-stock").innerHTML = faltando.length ? `
    <button type="button" class="botao primario" id="importar-stock-botao">Importar calendário da Stock Car 2026 (${faltando.length} etapa${faltando.length === 1 ? "" : "s"})</button>
    <span class="dica">${faltando.map((x) => `${x.nome} ${dataBR(x.data).slice(0, 5)}`).join(" · ")} — datas do calendário revisado mais recente; confira no site oficial.</span>` : "";
  document.getElementById("importar-stock-botao")?.addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    try { for (const x of faltando) await shk.arm.eventos.salvar(null, { calendario: STOCK_CAR, ...x }); }
    catch { ev.target.disabled = false; }
  });

  document.getElementById("eventos-vazio").hidden = shk.eventos.length > 0;
  const hoje = hojeDia();
  const grupos = [...new Set(shk.eventos.map((e) => e.calendario))].sort();
  const todas = todasTarefas();
  document.getElementById("eventos-lista").innerHTML = grupos.map((cal) => {
    const eventos = shk.eventos.filter((e) => e.calendario === cal).sort((a, b) => a.data.localeCompare(b.data));
    const frentes = shk.frentes.filter((f) => (f.calendario || "").toLowerCase() === cal.toLowerCase());
    return `
      <div class="calendario-grupo">
        <h3>${escapar(cal)} <span class="sub">${frentes.length ? "usado por " + frentes.map((f) => `${clienteDe(f.clienteId)?.nome || ""} · ${f.nome}`).map(escapar).join(", ") : "nenhuma frente usa este calendário"}</span></h3>
        <ul class="eventos">${eventos.map((e) => {
          const ts = todas.filter((t) => t.eventoId === e.id);
          return `
          <li class="${e.data < hoje ? "passado" : ""}">
            <span class="evento-data">${diaCurto(e.data)}</span>
            <span class="evento-nome">${escapar(e.nome)}${e.local ? ` <small>${escapar(e.local)}</small>` : ""}</span>
            <span class="sub">${ts.length ? `${somaQtd(ts.filter((t) => t.status === "entregue"))}/${somaQtd(ts)} artes` : ""}</span>
            <button type="button" class="botao mini" data-editar-evento="${escapar(e.id)}">Editar</button>
            <button type="button" class="botao mini" data-excluir-evento="${escapar(e.id)}">Excluir</button>
          </li>`;
        }).join("")}</ul>
      </div>`;
  }).join("");
  document.querySelectorAll("[data-editar-evento]").forEach((b) => b.addEventListener("click", () => abrirFormularioEvento(b.dataset.editarEvento)));
  document.querySelectorAll("[data-excluir-evento]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.confirmar !== "sim") { b.dataset.confirmar = "sim"; b.textContent = "Excluir evento e artes?"; b.classList.add("perigo"); return; }
    b.disabled = true;
    try {
      for (const t of shk.tarefas.filter((x) => x.eventoId === b.dataset.excluirEvento)) await shk.arm.tarefas.excluir(t.id);
      await shk.arm.eventos.excluir(b.dataset.excluirEvento);
    } catch { b.disabled = false; }
  }));
}

function abrirFormularioEvento(id) {
  const form = document.getElementById("evento-form");
  const e = eventoDe(id);
  shk.editando.evento = e ? id : null;
  form.reset();
  document.getElementById("evento-form-titulo").textContent = e ? "Editar evento" : "Novo evento";
  if (e) for (const campo of ["calendario", "nome", "data", "local"]) form.elements[campo].value = e[campo] || "";
  form.hidden = false;
  document.getElementById("evento-adicionar").hidden = true;
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.calendario.focus({ preventScroll: true });
}

function fecharFormularioEvento() {
  document.getElementById("evento-form").hidden = true;
  document.getElementById("evento-adicionar").hidden = false;
  shk.editando.evento = null;
}

async function salvarEvento(e) {
  e.preventDefault();
  const f = e.target.elements;
  const dados = { calendario: f.calendario.value.trim(), nome: f.nome.value.trim(), data: f.data.value, local: f.local.value.trim() || null };
  if (!dados.calendario) return f.calendario.focus();
  if (!dados.data) return f.data.focus();
  if (!dados.nome) return f.nome.focus();
  try { await shk.arm.eventos.salvar(shk.editando.evento, dados); fecharFormularioEvento(); } catch {}
}

/* ---------- Vista Recebimentos ---------- */

function linhaReceb(r) {
  const c = clienteDe(r.clienteId);
  const st = statusReceb(r);
  const rotulo = { recebido: "Recebido", atrasado: "Atrasado", pendente: "A receber" }[st];
  return `
    <tr data-receb="${escapar(r.id)}">
      <td><span class="ponto-cor" style="--cor:${corCliente(c)}"></span>${escapar(c.nome)}</td>
      <td>${escapar(r.descricao)}${r.previsto ? ` <small class="sub">previsto</small>` : ""}</td>
      <td class="valor">${moeda.format(r.valor)}</td>
      <td class="data">${r.recebidoEm ? dataBR(r.recebidoEm) : dataBR(r.vencimento)}</td>
      <td><span class="status ${st === "recebido" ? "pago" : st === "atrasado" ? "atrasada" : "pendente"}">${rotulo}</span></td>
      <td class="acoes-celula">
        ${r.recebidoEm ? `<button type="button" class="botao mini" data-receb-acao="desfazer">Desfazer</button>` : `<button type="button" class="botao mini primario" data-receb-acao="recebi">Recebi</button>`}
        <button type="button" class="botao mini" data-receb-acao="editar">Editar</button>
        <button type="button" class="botao mini" data-receb-acao="excluir">Excluir</button>
      </td>
    </tr>`;
}

const CABECALHO_RECEB = `<thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Data</th><th>Status</th><th><span class="sr">Ações</span></th></tr></thead>`;

function renderizarRecebimentos() {
  const hoje = hojeDia();
  const mes = mesDe(hoje);
  const lista = todosRecebimentos();
  const doMesAtual = sharkNoMes(mes);
  const atrasados = lista.filter((r) => statusReceb(r) === "atrasado");
  const ano = somaValor(lista.filter((r) => r.recebidoEm && r.recebidoEm.startsWith(hoje.slice(0, 4))));
  document.getElementById("receb-numeros").innerHTML = `
    <div class="shark-numero"><span>Recebido no mês</span> <strong>${moeda.format(doMesAtual.recebido)}</strong> <small>já conta como ganho no Financeiro</small></div>
    <div class="shark-numero"><span>A receber no mês</span> <strong>${moeda.format(doMesAtual.aReceber)}</strong> <small>${nomeMes(mes)}</small></div>
    <div class="shark-numero${atrasados.length ? " alerta" : ""}"><span>Atrasado</span> <strong>${moeda.format(somaValor(atrasados))}</strong> <small>${atrasados.length ? `${atrasados.length} recebimento${atrasados.length === 1 ? "" : "s"}` : "nada atrasado ✓"}</small></div>
    <div class="shark-numero"><span>Recebido em ${hoje.slice(0, 4)}</span> <strong>${moeda.format(ano)}</strong> <small>de todos os clientes</small></div>`;

  const aReceber = lista.filter((r) => !r.recebidoEm).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  document.getElementById("a-receber-vazio").hidden = aReceber.length > 0;
  document.getElementById("a-receber").innerHTML = aReceber.length ? CABECALHO_RECEB + `<tbody>${aReceber.map(linhaReceb).join("")}</tbody>` : "";
  const recebidos = lista.filter((r) => r.recebidoEm).sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm));
  document.getElementById("recebidos-vazio").hidden = recebidos.length > 0;
  document.getElementById("recebidos").innerHTML = recebidos.length ? CABECALHO_RECEB + `<tbody>${recebidos.slice(0, 60).map(linhaReceb).join("")}</tbody>` : "";

  // Recebido por mês (12 meses), empilhado por cliente
  const meses = [];
  for (let m = mes, i = 0; i < 12; i++, m = mesAnterior(m)) meses.unshift(m);
  const porMes = meses.map((m) => {
    const itens = recebidos.filter((r) => mesDe(r.recebidoEm) === m);
    const partes = new Map();
    itens.forEach((r) => partes.set(r.clienteId, (partes.get(r.clienteId) || 0) + Number(r.valor)));
    return { m, total: somaValor(itens), partes };
  });
  const maior = Math.max(...porMes.map((x) => x.total), 1);
  const grafico = document.getElementById("receb-meses");
  grafico.hidden = !recebidos.length;
  grafico.setAttribute("aria-label", "Recebido por mês: " + porMes.map((x) => `${nomeMes(x.m)} ${moeda.format(x.total)}`).join("; "));
  grafico.innerHTML = porMes.map((x) => `
    <div class="receb-col${x.m === mes ? " atual" : ""}" title="${escapar(`${nomeMes(x.m)}: ${moeda.format(x.total)}` + [...x.partes].map(([id, v]) => `\n${clienteDe(id)?.nome}: ${moeda.format(v)}`).join(""))}">
      <div class="receb-pilha" style="height:${(x.total / maior) * 100}%">${[...x.partes].map(([id, v]) => `<span style="--cor:${corCliente(clienteDe(id))};flex-grow:${v}"></span>`).join("")}</div>
      <span class="receb-rotulo">${MESES_CURTOS[Number(x.m.slice(5)) - 1]}</span>
    </div>`).join("");

  document.querySelectorAll("[data-receb-acao]").forEach((b) => b.addEventListener("click", async () => {
    const r = lista.find((x) => x.id === b.closest("tr").dataset.receb);
    const acao = b.dataset.recebAcao;
    if (acao === "editar") return abrirFormularioReceb(r);
    if (acao === "excluir" && b.dataset.confirmar !== "sim") { b.dataset.confirmar = "sim"; b.textContent = "Confirmar"; b.classList.add("perigo"); return; }
    b.disabled = true;
    try {
      if (acao === "recebi") await salvarRecebimento(r, { recebidoEm: hojeDia() });
      else if (acao === "desfazer") await salvarRecebimento(r, { recebidoEm: null });
      else if (r.previsto || r.referencia) await salvarRecebimento(r, { ignorado: true });
      else await shk.arm.recebimentos.excluir(r.id);
    } catch { b.disabled = false; avisoShark("receb-aviso", "Não foi possível salvar. Tente de novo."); }
  }));
}

function abrirFormularioReceb(r) {
  if (!shk.clientes.length) { avisoShark("receb-aviso", "Cadastre um cliente em Clientes antes."); return; }
  const form = document.getElementById("receb-form");
  shk.editando.receb = r || null;
  form.reset();
  document.getElementById("receb-form-titulo").textContent = r ? "Editar recebimento" : "Novo recebimento";
  document.getElementById("receb-cliente").innerHTML = shk.clientes.map((c) => `<option value="${escapar(c.id)}">${escapar(c.nome)}</option>`).join("");
  form.elements.vencimento.value = hojeDia();
  if (r) {
    form.elements.clienteId.value = r.clienteId;
    form.elements.descricao.value = r.descricao;
    form.elements.valor.value = r.valor;
    form.elements.vencimento.value = r.vencimento;
    form.elements.recebidoEm.value = r.recebidoEm || "";
  }
  form.hidden = false;
  document.getElementById("receb-adicionar").hidden = true;
  avisoShark("receb-aviso", "");
  form.scrollIntoView({ block: "center", behavior: "smooth" });
  form.elements.descricao.focus({ preventScroll: true });
}

function fecharFormularioReceb() {
  document.getElementById("receb-form").hidden = true;
  document.getElementById("receb-adicionar").hidden = false;
  shk.editando.receb = null;
  avisoShark("receb-aviso", "");
}

async function salvarReceb(e) {
  e.preventDefault();
  const f = e.target.elements;
  const valor = Number(String(f.valor.value).replace(",", "."));
  const dados = { clienteId: f.clienteId.value, descricao: f.descricao.value.trim(), valor, vencimento: f.vencimento.value, recebidoEm: f.recebidoEm.value || null };
  if (!dados.descricao) { avisoShark("receb-aviso", "Descreva o recebimento."); return f.descricao.focus(); }
  if (!(valor > 0)) { avisoShark("receb-aviso", "Informe o valor."); return f.valor.focus(); }
  if (!dados.vencimento) { avisoShark("receb-aviso", "Informe o vencimento."); return f.vencimento.focus(); }
  const r = shk.editando.receb;
  try {
    if (r) await salvarRecebimento(r, dados);
    else await shk.arm.recebimentos.salvar(null, { ...dados, referencia: null, ignorado: false });
    fecharFormularioReceb();
  } catch { avisoShark("receb-aviso", "Não foi possível salvar. Tente de novo."); }
}

/* ---------- Render geral ---------- */

function renderizarShark() {
  if (!document.getElementById("shark-numeros")) return;
  renderizarTopoShark();
  renderizarCargaShark();
  renderizarListaTarefas();
  renderizarClientesShark();
  renderizarAgenda();
  renderizarEventosShark();
  renderizarRecebimentos();
  // Recebimentos entram como ganho no Financeiro.
  if (typeof renderizarTorre === "function") renderizarTorre();
}

async function iniciarShark() {
  if (!document.getElementById("shark-numeros")) return;
  document.getElementById("extra-adicionar").addEventListener("click", () => abrirFormularioExtra());
  document.getElementById("extra-cancelar").addEventListener("click", fecharFormularioExtra);
  document.getElementById("extra-frente").addEventListener("change", preencherEventosExtra);
  document.getElementById("extra-evento").addEventListener("change", (e) => {
    const ev = eventoDe(e.target.value);
    if (ev && !document.getElementById("extra-prazo").value) document.getElementById("extra-prazo").value = ev.data;
  });
  document.getElementById("extra-form").addEventListener("submit", salvarExtra);
  document.getElementById("cliente-adicionar").addEventListener("click", () => abrirFormularioCliente(""));
  document.getElementById("cliente-cancelar").addEventListener("click", fecharFormularioCliente);
  document.getElementById("cliente-form").addEventListener("submit", salvarCliente);
  document.getElementById("frente-adicionar").addEventListener("click", () => abrirFormularioFrente(""));
  document.getElementById("frente-cancelar").addEventListener("click", fecharFormularioFrente);
  document.getElementById("frente-form").addEventListener("submit", salvarFrente);
  document.getElementById("frente-form").addEventListener("change", (e) => { if (e.target.name === "tipo") ajustarFormularioFrente(); });
  document.getElementById("evento-adicionar").addEventListener("click", () => abrirFormularioEvento(""));
  document.getElementById("evento-cancelar").addEventListener("click", fecharFormularioEvento);
  document.getElementById("evento-form").addEventListener("submit", salvarEvento);
  document.getElementById("receb-adicionar").addEventListener("click", () => abrirFormularioReceb(null));
  document.getElementById("receb-cancelar").addEventListener("click", fecharFormularioReceb);
  document.getElementById("receb-form").addEventListener("submit", salvarReceb);
  document.getElementById("agenda-anterior").addEventListener("click", () => { shk.agendaMes = mesAnterior(shk.agendaMes || mesDe(hojeDia())); renderizarAgenda(); });
  document.getElementById("agenda-proximo").addEventListener("click", () => { shk.agendaMes = proximoMes(shk.agendaMes || mesDe(hojeDia())); renderizarAgenda(); });
  document.getElementById("shark-limite").addEventListener("change", (e) => {
    const n = Math.round(Number(e.target.value));
    if (n >= 1 && n <= 200) { try { localStorage.setItem(CHAVE_LIMITE_SHARK, String(n)); } catch {} }
    e.target.blur();
    renderizarShark();
  });
  renderizarShark();

  const nomes = ["clientes", "frentes", "eventos", "tarefas", "recebimentos"];
  for (const nome of nomes) shk.arm[nome] = await abrirArmazenamento(nome, []);
  for (const nome of nomes) {
    shk.arm[nome].observar((lista) => { shk[nome] = lista; renderizarShark(); },
      () => avisoShark("shark-aviso", "Não foi possível carregar o SHARK. Recarregue a página."));
  }
}

iniciarShark();

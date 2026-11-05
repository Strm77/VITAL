/* ---------- Aba Assinaturas ----------
 * Encontra as assinaturas nos lançamentos de todas as faturas importadas (Netflix,
 * Prime Video, Spotify, PlayStation...) e agrupa por serviço: quanto custa por mês,
 * em qual cartão é cobrada, histórico dos últimos meses e mudanças de preço.
 * Usa os dados de faturas.js (fat.faturas, fat.cartoes) e funções de comum.js.
 */

// Serviços conhecidos: nome que aparece no painel e trechos que aparecem na fatura.
const SERVICOS = [
  ["Netflix", ["netflix"]],
  ["Prime Video", ["amazon prime", "amazonprime", "prime video", "primevideo", "prime canais"]],
  ["Spotify", ["spotify"]],
  ["PlayStation Plus", ["playstation", "psn", "sony interactive", "sonyplaystation"]],
  ["Xbox Game Pass", ["xbox"]],
  ["Disney+", ["disney"]],
  ["Max (HBO)", ["hbo", "max.com"]],
  ["YouTube Premium", ["youtube"]],
  ["Apple (App Store / iCloud)", ["apple.com", "apple com", "icloud", "itunes"]],
  ["Google One", ["google one", "google storage"]],
  ["Deezer", ["deezer"]],
  ["Globoplay", ["globoplay"]],
  ["Paramount+", ["paramount"]],
  ["Crunchyroll", ["crunchyroll"]],
  ["Claude", ["anthropic", "claude"]],
  ["ChatGPT", ["openai", "chatgpt"]],
  ["Adobe", ["adobe"]],
  ["Canva", ["canva"]],
  ["Microsoft 365", ["microsoft 365", "microsoft*365", "msft"]],
  ["Meli+", ["melimais", "meli+"]],
  ["Nintendo Switch Online", ["nintendo"]],
  ["Twitch", ["twitch"]],
  ["Duolingo", ["duolingo"]],
  ["Uber One", ["uber one"]],
];

/* Nome do serviço de assinatura de um lançamento, ou null se não for assinatura. */
function identificarAssinatura(descricao, categoria) {
  const d = " " + semAcento(String(descricao)) + " ";
  if (/^ (iof|estorno)\b/.test(d)) return null; // IOF e estornos citam o serviço, mas não são a assinatura
  for (const [nome, chaves] of SERVICOS) {
    if (chaves.some((c) => d.includes(c))) return nome;
  }
  if (categoria === "Assinaturas") {
    // Assinatura sem serviço conhecido: usa a descrição limpa ("DL*Serviço 123" → "Serviço").
    const limpo = String(semParcela(descricao)).replace(/^[a-z]{1,4}\s*\*\s*/i, "").replace(/[\d*#]+/g, " ").replace(/\s+/g, " ").trim();
    return limpo ? limpo.replace(/\b\w/g, (l) => l.toUpperCase()) : null;
  }
  return null;
}

const mesCurtoA = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
};

/* V2-06: a revisão individual vale. Um lançamento entra como assinatura se a categoria dele é
 * "Assinaturas", ou se o nome bate com um serviço conhecido e a categoria ainda é a automática.
 * Se a pessoa trocou a categoria (ex.: Apple.Com/Bill → Outros), ele sai da recorrência. */
function lancamentoEhAssinatura(l) {
  if (!(l.valor > 0)) return null;
  const nome = identificarAssinatura(l.descricao, l.categoria);
  if (!nome) return null;
  if (l.categoria && l.categoria !== "Assinaturas" && l.categoria !== categorizar(l.descricao, l.valor)) return null;
  return nome;
}
// Descrição que diz que é assinatura (ex.: "HBO Max assinatura", "CLAUDE.AI SUBSCRIPTION", "Sub").
const SINAL_ASSINATURA = /\b(assinatura|subscription|subscr|sub|mensalidade|recorrente)\b/;
// Mesma cobrança: descrição sem números, parcelas e pontuação (V2-07: descrições diferentes = cobranças diferentes).
const chaveCobranca = (descricao) => semAcento(String(semParcela(descricao))).replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();

function calcularAssinaturas() {
  const nomeCartao = (id) => fat.cartoes.find((c) => c.id === id)?.nome || "Cartão";
  const faturas = fat.faturas.filter((f) => f.mes <= mesRef);
  // Último mês com fatura importada de cada cartão (até o mês da timeline).
  const ultimoMes = {};
  for (const f of faturas) if (!ultimoMes[f.cartaoId] || f.mes > ultimoMes[f.cartaoId]) ultimoMes[f.cartaoId] = f.mes;

  const grupos = new Map();
  for (const f of faturas) {
    (f.lancamentos || []).forEach((l, indice) => {
      const nome = lancamentoEhAssinatura(l);
      if (!nome) return;
      const chave = nome + "|" + chaveCobranca(l.descricao);
      const g = grupos.get(chave) || { nome, cobrancas: [] };
      g.cobrancas.push({ mes: f.mes, data: l.data, valor: l.valor, cartaoId: f.cartaoId, descricao: l.descricao, faturaId: f.id, indice });
      grupos.set(chave, g);
    });
  }

  return [...grupos.values()].map((g) => {
    const porMes = new Map();
    for (const c of g.cobrancas) porMes.set(c.mes, (porMes.get(c.mes) || 0) + c.valor);
    const meses = [...porMes.keys()].sort();
    const ultimo = meses[meses.length - 1];
    const anterior = meses[meses.length - 2];
    const cobrancasUltimo = g.cobrancas.filter((c) => c.mes === ultimo);
    const cartoesUltimo = [...new Set(cobrancasUltimo.map((c) => c.cartaoId))];
    const recente = cartoesUltimo.some((id) => ultimoMes[id] === ultimo);
    // Confirmada: a descrição diz que é assinatura, ou a cobrança se repete em meses seguidos.
    const seguidos = meses.some((m, i) => i > 0 && somarMeses(meses[i - 1], 1) === m);
    const confirmada = g.cobrancas.some((c) => SINAL_ASSINATURA.test(" " + semAcento(String(c.descricao)) + " ")) || seguidos;
    return {
      nome: g.nome,
      descricao: g.cobrancas[g.cobrancas.length - 1].descricao,
      cartoes: cartoesUltimo.map(nomeCartao),
      valorAtual: Math.round(porMes.get(ultimo) * 100) / 100,
      valorAnterior: anterior ? Math.round(porMes.get(anterior) * 100) / 100 : null,
      meses: porMes,
      ultimo,
      cobrancasUltimo,
      vezes: cobrancasUltimo.length,
      ultimaData: cobrancasUltimo.map((c) => c.data).filter(Boolean).sort().pop(),
      ativa: recente,
      confirmada,
      descricoes: [...new Set(g.cobrancas.map((c) => c.descricao))],
    };
  }).sort((a, b) => Number(b.ativa) - Number(a.ativa) || Number(b.confirmada) - Number(a.confirmada) || b.valorAtual - a.valorAtual);
}

/* "Não é assinatura": tira a cobrança da recorrência trocando só a categoria; a compra fica na fatura. */
async function naoEAssinatura(faturaId, indice, botao) {
  const f = fat.faturas.find((x) => x.id === faturaId);
  const l = f?.lancamentos?.[indice];
  if (!l) return;
  const automatica = categorizar(l.descricao, l.valor);
  const categoria = automatica === "Assinaturas" || automatica === l.categoria ? (automatica === "Outros" ? "Compras" : "Outros") : automatica;
  botao.disabled = true;
  await atualizarLancamento(f, indice, { categoria });
}

function renderizarAssinaturas() {
  const raiz = document.getElementById("assinaturas-tabela");
  if (!raiz || typeof fat === "undefined") return;
  const lista = calcularAssinaturas();
  const confirmadas = lista.filter((a) => a.ativa && a.confirmada);
  const possiveis = lista.filter((a) => a.ativa && !a.confirmada);
  const mensal = confirmadas.reduce((t, a) => t + a.valorAtual, 0);
  const observado = possiveis.reduce((t, a) => t + a.valorAtual, 0);

  document.getElementById("assinaturas-mes").textContent = nomeMesRef();
  document.getElementById("assinaturas-vazio").hidden = lista.length > 0;
  document.getElementById("assinaturas-vazio").textContent = fat.faturas.length
    ? "Nenhuma assinatura encontrada nas faturas até este mês."
    : "As assinaturas aparecem aqui depois que você importar uma fatura na aba Faturas.";
  document.getElementById("assinaturas-conteudo").hidden = !lista.length;
  // V2-06/07: só a recorrência confirmada vira compromisso mensal e anual; o resto é soma observada.
  document.getElementById("assinaturas-resumo").innerHTML = `
    <span>${confirmadas.length} confirmada${confirmadas.length === 1 ? "" : "s"}${confirmadas.length ? ` · por mês <strong>${moeda.format(mensal)}</strong> · por ano <strong>${moeda.format(mensal * 12)}</strong>` : ""}</span>
    ${possiveis.length ? `<span>${possiveis.length} possíve${possiveis.length === 1 ? "l" : "is"} assinatura${possiveis.length === 1 ? "" : "s"} · soma observada no mês <strong>${moeda.format(observado)}</strong> (não é mensalidade confirmada)</span>` : ""}
    ${lista.length > confirmadas.length + possiveis.length ? `<span>${lista.length - confirmadas.length - possiveis.length} sem cobrança recente</span>` : ""}`;

  const ultimos = Array.from({ length: 6 }, (_, i) => somarMeses(mesRef, i - 5));
  const corpo = raiz.querySelector("tbody");
  corpo.innerHTML = "";
  for (const a of lista) {
    const variacao = a.valorAnterior != null && Math.abs(a.valorAtual - a.valorAnterior) >= 0.01
      ? `<span class="sub ${a.valorAtual > a.valorAnterior ? "acabando" : "ultima"}">${a.valorAtual > a.valorAnterior ? "subiu" : "caiu"} de ${moeda.format(a.valorAnterior)}</span>`
      : "";
    const tr = document.createElement("tr");
    tr.className = a.ativa ? (a.confirmada ? "" : "possivel") : "inativa";
    tr.title = a.descricoes.join("\n");
    const cobrancas = a.cobrancasUltimo.map((c) => `<span class="sub cobranca">${c.data ? dataBR(c.data) : mesCurtoA(c.mes)} · ${escapar(c.descricao)} · ${moeda.format(c.valor)}
      <button type="button" class="link-login" data-nao-assinatura="${escapar(c.faturaId)}|${c.indice}">Não é assinatura</button></span>`).join("");
    tr.innerHTML = `
      <td class="conta"><strong>${escapar(a.nome)}</strong>${cobrancas}</td>
      <td>${a.cartoes.map(escapar).join(", ")}</td>
      <td class="num"${a.confirmada ? "" : ` title="Soma observada no mês, não é mensalidade confirmada"`}>${moeda.format(a.valorAtual)}${variacao}</td>
      <td><span class="meses-assinatura" aria-label="Cobrada em: ${ultimos.filter((m) => a.meses.has(m)).map(mesCurtoA).join(", ") || "nenhum dos últimos 6 meses"}">
        ${ultimos.map((m) => `<i class="${a.meses.has(m) ? "cobrado" : ""}" title="${mesCurtoA(m)}${a.meses.has(m) ? ": " + moeda.format(a.meses.get(m)) : ""}"></i>`).join("")}
      </span></td>
      <td class="data">${a.ultimaData ? dataBR(a.ultimaData) : mesCurtoA(a.ultimo)}</td>
      <td>${!a.ativa ? `<span class="status pendente">Sem cobrança desde ${mesCurtoA(a.ultimo)}</span>`
        : a.confirmada ? `<span class="status pago">Ativa</span>` : `<span class="status a-confirmar">Possível assinatura</span>`}</td>`;
    corpo.appendChild(tr);
  }
  corpo.querySelectorAll("[data-nao-assinatura]").forEach((b) => b.addEventListener("click", () => {
    const [faturaId, indice] = b.dataset.naoAssinatura.split("|");
    naoEAssinatura(faturaId, Number(indice), b);
  }));
  raiz.querySelector("thead .meses-cab").innerHTML = ultimos.map((m) => `<span>${MESES_CURTOS[Number(m.slice(5)) - 1][0]}</span>`).join("");
}

aoMudarMes(renderizarAssinaturas);
renderizarAssinaturas();

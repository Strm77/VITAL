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

function calcularAssinaturas() {
  const nomeCartao = (id) => fat.cartoes.find((c) => c.id === id)?.nome || "Cartão";
  const faturas = fat.faturas.filter((f) => f.mes <= mesRef);
  // Último mês com fatura importada de cada cartão (até o mês da timeline).
  const ultimoMes = {};
  for (const f of faturas) if (!ultimoMes[f.cartaoId] || f.mes > ultimoMes[f.cartaoId]) ultimoMes[f.cartaoId] = f.mes;

  const servicos = new Map();
  for (const f of faturas) {
    for (const l of f.lancamentos || []) {
      if (!(l.valor > 0)) continue;
      const nome = identificarAssinatura(l.descricao, l.categoria);
      if (!nome) continue;
      const s = servicos.get(nome) || { nome, cobrancas: [], cartoes: new Set() };
      s.cobrancas.push({ mes: f.mes, data: l.data, valor: l.valor, cartaoId: f.cartaoId, descricao: l.descricao });
      s.cartoes.add(f.cartaoId);
      servicos.set(nome, s);
    }
  }

  return [...servicos.values()].map((s) => {
    // Soma por mês (ex.: várias cobranças da Apple no mesmo mês).
    const porMes = new Map();
    for (const c of s.cobrancas) porMes.set(c.mes, (porMes.get(c.mes) || 0) + c.valor);
    const meses = [...porMes.keys()].sort();
    const ultimo = meses[meses.length - 1];
    const anterior = meses[meses.length - 2];
    const valorAtual = Math.round(porMes.get(ultimo) * 100) / 100;
    const valorAnterior = anterior ? Math.round(porMes.get(anterior) * 100) / 100 : null;
    const cobrancasUltimo = s.cobrancas.filter((c) => c.mes === ultimo);
    const cartoesUltimo = [...new Set(cobrancasUltimo.map((c) => c.cartaoId))];
    // Ativa: cobrada na fatura mais recente do cartão em que aparece.
    const ativa = cartoesUltimo.some((id) => ultimoMes[id] === ultimo);
    return {
      nome: s.nome,
      cartoes: cartoesUltimo.map(nomeCartao),
      valorAtual,
      valorAnterior,
      meses: porMes,
      ultimo,
      primeiro: meses[0],
      vezes: cobrancasUltimo.length,
      ultimaData: cobrancasUltimo.map((c) => c.data).filter(Boolean).sort().pop(),
      ativa,
      descricoes: [...new Set(s.cobrancas.map((c) => c.descricao))],
    };
  }).sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.valorAtual - a.valorAtual);
}

function renderizarAssinaturas() {
  const raiz = document.getElementById("assinaturas-tabela");
  if (!raiz || typeof fat === "undefined") return;
  const lista = calcularAssinaturas();
  const ativas = lista.filter((a) => a.ativa);
  const mensal = ativas.reduce((t, a) => t + a.valorAtual, 0);

  document.getElementById("assinaturas-mes").textContent = nomeMesRef();
  document.getElementById("assinaturas-vazio").hidden = lista.length > 0;
  document.getElementById("assinaturas-vazio").textContent = fat.faturas.length
    ? "Nenhuma assinatura encontrada nas faturas até este mês."
    : "As assinaturas aparecem aqui depois que você importar uma fatura na aba Faturas.";
  document.getElementById("assinaturas-conteudo").hidden = !lista.length;
  document.getElementById("assinaturas-resumo").innerHTML = `
    <span>${ativas.length} assinatura${ativas.length === 1 ? "" : "s"} ativa${ativas.length === 1 ? "" : "s"}</span>
    <span>Por mês <strong>${moeda.format(mensal)}</strong></span>
    <span>Por ano <strong>${moeda.format(mensal * 12)}</strong></span>
    ${lista.length > ativas.length ? `<span>${lista.length - ativas.length} sem cobrança recente</span>` : ""}`;

  // Histórico: os 6 meses até o mês da timeline.
  const ultimos = Array.from({ length: 6 }, (_, i) => somarMeses(mesRef, i - 5));
  const corpo = raiz.querySelector("tbody");
  corpo.innerHTML = "";
  for (const a of lista) {
    const variacao = a.valorAnterior != null && Math.abs(a.valorAtual - a.valorAnterior) >= 0.01
      ? `<span class="sub ${a.valorAtual > a.valorAnterior ? "acabando" : "ultima"}">${a.valorAtual > a.valorAnterior ? "subiu" : "caiu"} de ${moeda.format(a.valorAnterior)}</span>`
      : "";
    const tr = document.createElement("tr");
    tr.className = a.ativa ? "" : "inativa";
    tr.title = a.descricoes.join("\n");
    tr.innerHTML = `
      <td class="conta"><strong>${escapar(a.nome)}</strong>${a.vezes > 1 ? `<span class="sub">${a.vezes} cobranças no mês</span>` : ""}</td>
      <td>${a.cartoes.map(escapar).join(", ")}</td>
      <td class="num">${moeda.format(a.valorAtual)}${variacao}</td>
      <td><span class="meses-assinatura" aria-label="Cobrada em: ${ultimos.filter((m) => a.meses.has(m)).map(mesCurtoA).join(", ") || "nenhum dos últimos 6 meses"}">
        ${ultimos.map((m) => `<i class="${a.meses.has(m) ? "cobrado" : ""}" title="${mesCurtoA(m)}${a.meses.has(m) ? ": " + moeda.format(a.meses.get(m)) : ""}"></i>`).join("")}
      </span></td>
      <td class="data">${a.ultimaData ? dataBR(a.ultimaData) : mesCurtoA(a.ultimo)}</td>
      <td>${a.ativa ? `<span class="status pago">Ativa</span>` : `<span class="status pendente">Sem cobrança desde ${mesCurtoA(a.ultimo)}</span>`}</td>`;
    corpo.appendChild(tr);
  }
  raiz.querySelector("thead .meses-cab").innerHTML = ultimos.map((m) => `<span>${MESES_CURTOS[Number(m.slice(5)) - 1][0]}</span>`).join("");
}

aoMudarMes(renderizarAssinaturas);
renderizarAssinaturas();

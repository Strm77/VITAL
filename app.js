const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

function vencimento(divida, indice) {
  const [ano, mes] = divida.primeiraParcela.split("-").map(Number);
  const dia = divida.diaVencimento || 1;
  const data = new Date(ano, mes - 1 + indice, 1);
  const ultimoDia = new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate();
  data.setDate(Math.min(dia, ultimoDia));
  return data;
}

function calcular(divida) {
  const total = divida.totalParcelas;
  let pagas = divida.parcelasPagas;
  if (pagas == null) {
    pagas = 0;
    while (pagas < total && vencimento(divida, pagas) < hoje) pagas++;
  }
  pagas = Math.max(0, Math.min(pagas, total));

  const quitada = pagas >= total;
  return {
    ...divida,
    pagas,
    restantes: total - pagas,
    parcelaAtual: quitada ? total : pagas + 1,
    quitada,
    valorTotal: divida.valorParcela * total,
    valorPago: divida.valorParcela * pagas,
    valorRestante: divida.valorParcela * (total - pagas),
    termino: vencimento(divida, total - 1),
    progresso: total ? pagas / total : 1,
  };
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function preencherBarra(barra, progresso) {
  const pct = Math.round(progresso * 100);
  barra.setAttribute("aria-valuenow", pct);
  barra.setAttribute("aria-valuemin", 0);
  barra.setAttribute("aria-valuemax", 100);
  requestAnimationFrame(() => {
    barra.querySelector(".preenchimento").style.width = pct + "%";
  });
}

function listaDetalhes(itens) {
  return itens.map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${valor}</dd>`).join("");
}

function alternar(botao, painel) {
  botao.addEventListener("click", () => {
    const aberto = botao.getAttribute("aria-expanded") === "true";
    botao.setAttribute("aria-expanded", String(!aberto));
    painel.hidden = aberto;
  });
}

function renderizar() {
  document.getElementById("mes-atual").textContent = capitalizar(mesAno.format(hoje));

  const dividas = DIVIDAS.map(calcular);
  const lista = document.getElementById("lista-dividas");

  dividas.forEach((d, i) => {
    const item = document.createElement("li");
    item.className = "divida";
    const idDetalhes = `detalhes-${i}`;
    item.innerHTML = `
      <button class="linha" aria-expanded="false" aria-controls="${idDetalhes}">
        <span class="rotulo">${d.nome}</span>
        <span class="valor">${moeda.format(d.valorParcela)}</span>
        <span class="seta" aria-hidden="true"></span>
      </button>
      <div class="barra" role="progressbar" aria-label="Progresso de ${d.nome}">
        <div class="preenchimento"></div>
      </div>
      <div class="porcentagem">
        <span>${Math.round(d.progresso * 100)}% pago</span>
        <span>falta ${Math.round((1 - d.progresso) * 100)}%</span>
      </div>
      <dl class="detalhes" id="${idDetalhes}" hidden>
        ${listaDetalhes([
          ["Parcela atual", d.quitada ? "Quitada" : `${d.parcelaAtual} de ${d.totalParcelas}`],
          ["Parcelas que faltam", d.restantes],
          ["Previsão de término", capitalizar(mesAno.format(d.termino))],
          ["Valor da parcela", moeda.format(d.valorParcela)],
          ["Valor total da dívida", moeda.format(d.valorTotal)],
          ["Já pago", moeda.format(d.valorPago)],
          ["Falta pagar", moeda.format(d.valorRestante)],
        ])}
      </dl>`;
    lista.appendChild(item);
    preencherBarra(item.querySelector(".barra"), d.progresso);
    alternar(item.querySelector(".linha"), item.querySelector(".detalhes"));
  });

  const ativas = dividas.filter((d) => !d.quitada);
  const soma = (campo, lista = dividas) => lista.reduce((t, d) => t + d[campo], 0);
  const total = soma("valorTotal");
  const pago = soma("valorPago");
  const ultimoTermino = dividas.reduce((max, d) => (d.termino > max ? d.termino : max), new Date(0));

  document.getElementById("total-mensal").textContent = moeda.format(soma("valorParcela", ativas));
  preencherBarra(document.getElementById("barra-geral"), total ? pago / total : 1);

  const detalhesResumo = document.getElementById("detalhes-resumo");
  detalhesResumo.innerHTML = `<dl class="detalhes">${listaDetalhes([
    ["Dívidas ativas", `${ativas.length} de ${dividas.length}`],
    ["Valor total das dívidas", moeda.format(total)],
    ["Já pago", `${moeda.format(pago)} (${Math.round((pago / total) * 100 || 0)}%)`],
    ["Falta pagar", moeda.format(total - pago)],
    ["Parcelas que faltam (somadas)", soma("restantes")],
    ["Livre de todas as dívidas em", dividas.length ? capitalizar(mesAno.format(ultimoTermino)) : "—"],
  ])}</dl>`;
  alternar(document.getElementById("botao-resumo"), detalhesResumo);
}

renderizar();

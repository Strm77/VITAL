/* ---------- Aba Faturas ----------
 * Lê o PDF da fatura no navegador (pdf.js), encontra os lançamentos,
 * monta a planilha do cartão e o relatório de gastos por categoria.
 * Usa as funções de comum.js (moeda, escapar, preencherBarra, abrirArmazenamento...).
 */

const CATEGORIAS = [
  "Alimentação",
  "Mercado",
  "Transporte",
  "Saúde",
  "Assinaturas",
  "Compras",
  "Casa",
  "Lazer",
  "Viagem",
  "Educação",
  "Serviços",
  "Tarifas e juros",
  "Outros",
  "Pagamentos e créditos",
];
const CREDITO = "Pagamentos e créditos";

// Palavras-chave procuradas na descrição (sem acento, minúsculas).
const REGRAS_CATEGORIA = [
  ["Tarifas e juros", ["iof", "anuidade", "juros", "encargo", "multa", "tarifa", "seguro fatura", "mora"]],
  ["Assinaturas", ["netflix", "spotify", "prime video", "amazonprime", "amazon prime", "prime canais", "playstation", "psn", "xbox", "melimais", "twitch", "disney", "hbo", "max.com", "youtube", "apple.com", "icloud", "google one", "google storage", "deezer", "globoplay", "paramount", "chatgpt", "openai", "claude", "anthropic", "crunchyroll", "microsoft", "adobe", "canva"]],
  ["Alimentação", ["ifood", "i food", "restaurante", "lanchonete", "padaria", "burger", "mcdonald", "mc donald", "bk ", "pizza", "rappi", "bar ", "cafe", "subway", "outback", "starbucks", "sushi", "churrasc", "acai", "lanches", "food", "giraffas", "habib", "spoleto", "coco bambu", "ze delivery"]],
  ["Mercado", ["supermerc", "mercado ", "carrefour", "assai", "atacad", "pao de acucar", "extra ", "hortifruti", "sams club", "big ", "makro", "oba ", "st marche", "dia brasil", "zaffari", "savegnago", "mercadinho", "sacolao"]],
  ["Transporte", ["uber", "99app", "99 app", "99pop", "99 ", "cabify", "posto", "shell", "ipiranga", "petrobras", "br mania", "combust", "estacion", "sem parar", "semparar", "veloe", "conectcar", "metro", "bilhete", "onibus", "pedagio", "zul ", "estapar"]],
  ["Saúde", ["farmacia", "drogaria", "droga raia", "drogasil", "pague menos", "panvel", "hospital", "clinica", "laborator", "unimed", "amil", "odonto", "dentist", "medic", "smart fit", "smartfit", "academia", "bluefit", "gympass"]],
  ["Compras", ["amazon", "mercadolivre", "mercado livre", "mercadopago*", "shopee", "aliexpress", "magalu", "magazine", "americanas", "shein", "renner", "riachuelo", "c&a", "cea ", "zara", "centauro", "netshoes", "kabum", "submarino", "casas bahia", "ponto frio", "fast shop", "decathlon", "nike", "adidas", "temu", "boticario", "natura", "sephora"]],
  ["Casa", ["leroy", "telhanorte", "tok&stok", "tok stok", "camicado", "madeiramadeira", "mobly", "etna", "c&c", "obramax"]],
  ["Lazer", ["cinema", "cinemark", "ingresso", "sympla", "eventim", "steam", "nintendo", "teatro", "show", "parque", "bilheteria"]],
  ["Viagem", ["hotel", "airbnb", "booking", "latam", "gol linhas", "voegol", "azul linhas", "voeazul", "decolar", "123milhas", "hurb", "pousada", "localiza", "movida", "unidas"]],
  ["Educação", ["udemy", "alura", "curso", "escola", "faculdade", "universidade", "livraria", "livros", "coursera", "duolingo"]],
  ["Serviços", ["claro", "vivo", "tim ", "oi ", "net servicos", "internet", "energia", "enel", "cemig", "light ", "copel", "sabesp", "comgas", "condominio"]],
];

const BANCOS = ["Nubank", "Itaú", "Bradescard", "Bradesco", "Santander", "Banco Inter", "Inter", "C6 Bank", "C6", "Caixa", "Banco do Brasil", "Ourocard", "XP", "BTG", "PicPay", "Mercado Pago", "Neon", "Next", "Will Bank", "PagBank", "Porto Seguro", "Sicredi", "Sicoob", "Credicard", "Original"];

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const NOMES_MES = Object.keys(MESES).join("|");

const semAcento = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const doisDigitos = (n) => String(n).padStart(2, "0");
const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const nomeDoMes = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return capitalizar(mesAno.format(new Date(a, m - 1, 1)));
};

function categorizar(descricao, valor) {
  if (valor < 0) return CREDITO;
  const d = " " + semAcento(descricao) + " ";
  for (const [categoria, palavras] of REGRAS_CATEGORIA) {
    if (palavras.some((p) => d.includes(p))) return categoria;
  }
  return "Outros";
}

function numeroBR(texto) {
  return Number(texto.replace(/[^\d,]/g, "").replace(",", "."));
}

/* ---------- Leitura do PDF ---------- */

async function lerLinhasDoPdf(arquivo, senha) {
  if (!window.pdfjsLib) throw { codigo: "sem-pdfjs" };
  // O worker do pdf.js é carregado como script comum; ele roda na própria página.
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: dados, password: senha || undefined, isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw { codigo: senha ? "senha-errada" : "senha" };
    throw { codigo: "ilegivel" };
  }

  const linhas = [];
  linhas.paginas = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const inicioPagina = linhas.length;
    // Junta os pedaços de texto em linhas. A tolerância de altura evita separar a descrição
    // do valor quando o banco imprime os dois com alturas levemente diferentes.
    const partes = items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, t: it.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos = [];
    for (const p of partes) {
      const grupo = grupos[grupos.length - 1];
      if (grupo && Math.abs(grupo.y - p.y) <= 3.5) grupo.itens.push(p);
      else grupos.push({ y: p.y, itens: [p] });
    }
    const largura = pagina.getViewport({ scale: 1 }).width || 600;
    for (const { itens } of grupos) {
      itens.sort((a, b) => a.x - b.x);
      let texto = "";
      let fim = -Infinity;
      const xs = [itens.length ? itens[0].x / largura : 0];
      for (const p of itens) {
        const gap = p.x - fim;
        // V2-01/02/04: faturas em duas colunas (compras à esquerda, avisos ou outra lista à
        // direita). Um valor em dinheiro seguido, depois de um vão, de texto ou de uma data
        // marca a troca de coluna: separa com tabulação para o valor não "grudar" no texto vizinho.
        const trocaColuna = texto && gap > 6 && /\d,\d{2}$/.test(texto) &&
          (/^[A-Za-zÀ-ú(]{2}/.test(p.t.trim()) || /^\d{1,2}\/\d{1,2}(\b|\/)/.test(p.t.trim()));
        if (trocaColuna) { texto += "\t"; xs.push(p.x / largura); }
        else texto += texto ? (gap > 1.5 ? (gap > 40 ? "   " : " ") : "") : "";
        texto += p.t;
        fim = p.x + p.w;
      }
      linhas.push(texto.replace(/\s+$/, ""));
      linhas.xs = linhas.xs || [];
      linhas.xs[linhas.length - 1] = xs;
    }
    linhas.paginas.push({ numero: n, linhas: linhas.length - inicioPagina, pedacos: items.length });
  }
  return linhas;
}

/* ---------- Interpretação do texto ---------- */

const IGNORAR = /saldo|total|limite|pagamento (minimo|recebido|efetuado|da fatura|em\b)|pagto|pagamento\s*-|valor minimo|fatura anterior|credito rotativo|parcelamento de fatura|proxima fatura|melhor dia|vencimento|fechamento|periodo/;
// Descrições que não são compras: só "R$", ou um período do tipo "a 01 OUT".
const NAO_E_COMPRA = new RegExp(`^(r\\$\\s*[\\d.,]*|a\\s+\\d{1,2}\\s*(${NOMES_MES})[a-z]*\\.?(\\s+\\d{2,4})?|ate\\s+.*)$`);
// Prefixo do cartão virtual que alguns bancos colocam na descrição: "•••• 1234 Loja".
const PREFIXO_CARTAO = /^(?:[•*xX·.]{2,}\s*)(\d{4})\s+/;

function extrairDaFatura(linhas) {
  const texto = linhas.join("\n");
  const textoSA = semAcento(texto);

  // Banco
  const inicio = semAcento(linhas.slice(0, 60).join(" "));
  const banco = BANCOS.find((b) => inicio.includes(semAcento(b))) || BANCOS.find((b) => textoSA.includes(semAcento(b))) || "";

  // Final do cartão
  const final = (textoSA.match(/(?:final|terminado em|cartao\s*(?:n[o.]*)?\s*[x*.\d\s]{4,}?)\s*[:\-]?\s*(\d{4})\b/) ||
    texto.match(/(?:\*{2,}|x{4}|•{2,})\s?(\d{4})\b/i) ||
    // Número mascarado em grupos: "4000.12**.****.3333"
    texto.match(/\b\d{4}[.\s]\d{2}[*xX•]{2}[.\s][*xX•]{4}[.\s](\d{4})\b/) || [])[1] || "";

  // Vencimento
  let venc = null;
  let m = textoSA.match(/venc[a-z]*[^0-9]{0,40}?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) venc = { d: +m[1], m: +m[2], a: +m[3] < 100 ? 2000 + +m[3] : +m[3] };
  if (!venc) {
    m = textoSA.match(new RegExp(`venc[a-z]*[^0-9]{0,40}?(\\d{1,2})\\s*(?:de\\s+)?(${NOMES_MES})[a-z]*\\.?\\s*(?:de\\s+)?(\\d{4})`));
    if (m) venc = { d: +m[1], m: MESES[m[2]], a: +m[3] };
  }
  // Cabeçalho em tabela ("Total da fatura   Vencimento" e, na linha de baixo, "R$ 15,00   10/11/2026"):
  // a primeira data completa logo depois da palavra vencimento.
  if (!venc) {
    m = textoSA.match(/vencimento[^\n]*\n[^\n]*?\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (m) venc = { d: +m[1], m: +m[2], a: +m[3] };
  }
  const ref = venc || { m: hoje.getMonth() + 1, a: hoje.getFullYear() };

  const dataISO = (dia, mesTexto, anoTexto) => {
    const mes = /^\d+$/.test(mesTexto) ? +mesTexto : MESES[semAcento(mesTexto).slice(0, 3)];
    if (!mes || mes > 12 || +dia < 1 || +dia > 31) return null;
    let ano = anoTexto ? (+anoTexto < 100 ? 2000 + +anoTexto : +anoTexto) : ref.a;
    if (!anoTexto && mes > ref.m) ano -= 1; // compra do ano anterior (ex.: fatura de janeiro)
    return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  };

  // Lançamentos: data + descrição + valor. Pode haver duas colunas na mesma linha.
  const DATA = `(\\d{1,2})\\s?[\\/\\-.\\s]\\s?(\\d{1,2}|${NOMES_MES})(?:[\\/\\-.](\\d{2,4}))?`;
  const VALOR = `(-|−)?\\s*(?:R\\$\\s*)?(-|−)?\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})(\\s?-|\\s[DC])?`;
  const re = new RegExp(`(?:^|\\s)${DATA}\\s+(.+?)\\s+${VALOR}(?=\\s+\\d{1,2}\\s?[\\/\\-.\\s]\\s?(?:\\d{1,2}|${NOMES_MES})\\b|\\s*$)`, "gi");

  const lancamentos = [];
  const naoReconhecidas = [];
  const pagamentos = [];
  const proximas = []; // V2-02: "Compras parceladas - próximas faturas": só previsão, não entram nesta fatura
  // Seção atual de cada coluna (0 = esquerda, 1 = direita): "atual", "pagamentos" ou "futuro".
  const secao = ["atual", "atual"];
  const SECAO_FUTURA = /^(compras parceladas\s*-?\s*proximas faturas|parcelas? (das|para as) proximas faturas|lancamentos futuros|proximas parcelas)/;
  const SECAO_PAGAMENTOS = /^pagamentos efetuados/;
  const SECAO_ATUAL = /^(lancamentos|compras e saques|despesas|transacoes)/;
  const FIM_FUTURA = /^(total para (as )?proximas faturas|limites? de credito|encargos cobrados)/;
  linhas.forEach((linha, n) => {
    const segmentos = String(linha).split("\t");
    const xs = linhas.xs?.[n] || segmentos.map((_, k) => (k ? 0.6 : 0));
    const antes = lancamentos.length + pagamentos.length + proximas.length;
    segmentos.forEach((seg, k) => {
      const col = (xs[k] ?? 0) >= 0.5 ? 1 : 0;
      const ssa = semAcento(seg.trim());
      if (SECAO_FUTURA.test(ssa)) { secao[col] = "futuro"; return; }
      if (SECAO_PAGAMENTOS.test(ssa)) { secao[col] = "pagamentos"; return; }
      if (SECAO_ATUAL.test(ssa) || (secao[col] === "futuro" && FIM_FUTURA.test(ssa))) secao[col] = "atual";
      re.lastIndex = 0;
      let r;
      while ((r = re.exec(seg))) {
        const [, dia, mes, ano, descBruta, sinal1, sinal2, valorTexto, sufixo] = r;
        let descricao = descBruta.replace(/\s{2,}/g, " ").trim();
        const prefixo = descricao.match(PREFIXO_CARTAO);
        if (prefixo) descricao = descricao.slice(prefixo[0].length);
        const dsa = semAcento(descricao);
        const negativo = !!(sinal1 || sinal2 || (sufixo && /-|c/i.test(sufixo.trim())));
        // V2-03: pagamento da fatura anterior não é compra nem crédito desta fatura: fica de fora
        // dos lançamentos e entra só no acerto com a fatura anterior.
        if ((/^(pagamento|pagto|pgto)\b/.test(dsa) && negativo) || (secao[col] === "pagamentos" && negativo)) {
          pagamentos.push({ data: dataISO(dia, mes, ano), descricao, valor: numeroBR(valorTexto) });
          continue;
        }
        if (!/[a-z]{2}/.test(dsa.replace(/r\$/g, "")) || IGNORAR.test(dsa) || NAO_E_COMPRA.test(dsa)) continue;
        const data = dataISO(dia, mes, ano);
        if (!data) continue;
        const valor = numeroBR(valorTexto) * (negativo ? -1 : 1);
        if (!valor) continue;
        if (secao[col] === "futuro") { proximas.push({ data, descricao, valor }); continue; }
        const lanc = { data, descricao, valor, categoria: categorizar(descricao, valor) };
        if (prefixo) lanc.finalCartao = prefixo[1];
        lancamentos.push(lanc);
      }
    });
    // Linha com valor em dinheiro que não virou lançamento: mostrada na prévia para conferência.
    if (lancamentos.length + pagamentos.length + proximas.length === antes && /\d{1,3}(?:\.\d{3})*,\d{2}/.test(linha) && naoReconhecidas.length < 60) naoReconhecidas.push(String(linha).replace(/\t/g, "   ").trim());
  });

  // Total oficial da fatura. O PDF pode ter vários "Total a pagar" (ex.: simulações de
  // parcelamento, detalhes do Pix parcelado); fica o valor que mais se repete entre as
  // frases de total, ignorando linhas com mais de um valor ou de detalhe de transação.
  const DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const PADRAO_TOTAL = /(total a pagar|total da (?:sua )?fatura(?: atual)?|total desta fatura|valor total (?:da|desta) fatura|valor da fatura|fatura (?:de [a-z]+, )?no valor de|o total da sua fatura (?:e|é)|pagamento total da fatura)\s*:?\s*(?:de\s*)?(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
  const candidatos = new Map();
  // V2-04: simulações de parcelamento e ofertas ("Valor total a pagar" do plano em 9x, IOF,
  // total financiado…) não são o total da fatura.
  const SIMULACAO = /valor da transacao|divididos|parcelar em|entrada|valor total a pagar|financiad|financiar|parcela de|iof|cet |juros/;
  linhas.forEach((linha, i) => {
    const t = semAcento(String(linha).replace(/\t/g, "   "));
    // Cabeçalho em tabela: "Total da fatura   Vencimento" com os valores na linha de baixo.
    if (/^(total da fatura|o total da sua fatura (e|é):?|pagamento total)(\s|$)/.test(t) && !(t.match(DINHEIRO) || []).length) {
      const abaixo = semAcento(String(linhas[i + 1] || "")).match(/^r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (abaixo && numeroBR(abaixo[1]) > 0) { const v = numeroBR(abaixo[1]); candidatos.set(v, (candidatos.get(v) || 0) + 2); }
    }
    if ((t.match(DINHEIRO) || []).length > 1 || SIMULACAO.test(t)) return;
    let m = t.match(PADRAO_TOTAL);
    // Frase quebrada em duas linhas ("...no valor de" / "R$ 3.572,42").
    if (!m && /(no valor de|total da fatura)\s*$/.test(t)) {
      const seguinte = semAcento(linhas[i + 1] || "").match(/^r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/);
      if (seguinte) m = [null, null, seguinte[1]];
    }
    if (!m || !(numeroBR(m[2]) > 0)) return;
    const v = numeroBR(m[2]);
    candidatos.set(v, (candidatos.get(v) || 0) + 1);
  });
  const totalInformado = [...candidatos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Acerto com a fatura anterior: saldo anterior − pagamentos feitos. Se você pagou a mais,
  // vira crédito nesta fatura; se ficou faltando, vira saldo a pagar.
  const anterior = linhas.map((l) => semAcento(l).match(/^(?:total da )?(?:fatura|saldo) anterior\s*:?\s*(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)).find(Boolean);
  if (anterior && pagamentos.length) {
    const acerto = Math.round((numeroBR(anterior[1]) - pagamentos.reduce((t, p) => t + p.valor, 0)) * 100) / 100;
    if (Math.abs(acerto) >= 0.01) {
      lancamentos.push({
        data: pagamentos[pagamentos.length - 1].data,
        descricao: acerto < 0 ? "Crédito: pagamento a mais na fatura anterior" : "Saldo restante da fatura anterior",
        valor: acerto,
        categoria: acerto < 0 ? CREDITO : "Outros",
      });
    }
  }

  const mes = venc ? `${venc.a}-${doisDigitos(venc.m)}` : `${hoje.getFullYear()}-${doisDigitos(hoje.getMonth() + 1)}`;
  const vencimento = venc ? `${venc.a}-${doisDigitos(venc.m)}-${doisDigitos(venc.d)}` : "";
  return { banco, final, mes, vencimento, totalInformado, naoReconhecidas, lancamentos, pagamentosAnteriores: pagamentos, proximas };
}

/* Leitura com o Claude (só no claude.ai, quando o leitor automático não basta). */
async function extrairComClaude(linhas) {
  const sample = await usarRecurso("sample");
  if (!sample) throw new Error("indisponível");
  let texto = linhas.join("\n");
  try {
    const { maxPromptBytes } = await sample.limits();
    const limite = Math.max(4000, Math.floor(maxPromptBytes * 0.6));
    if (texto.length > limite) texto = texto.slice(0, limite);
  } catch {}
  const resposta = await sample.json(
    `Você recebe o texto extraído do PDF de uma fatura de cartão de crédito brasileira.
Devolva APENAS um JSON neste formato:
{"banco": string, "final": string (4 últimos dígitos do cartão ou ""), "vencimento": "AAAA-MM-DD" ou "", "total": number (valor total a pagar da fatura) ou null,
 "lancamentos": [{"data": "AAAA-MM-DD", "descricao": string, "valor": number, "categoria": string}]}
Regras:
- Inclua cada compra, parcela, tarifa, juros, IOF e estorno da fatura.
- Não inclua o pagamento da fatura anterior, saldos, totais, limites nem valores mínimos.
- "valor" positivo para gastos e negativo para estornos/créditos.
- "categoria" deve ser exatamente uma destas: ${CATEGORIAS.join(", ")}.
- Se a data não tiver ano, deduza pelo vencimento.
- Em compras parceladas, termine a descrição com " - Parcela N/T" (ex.: "Loja X - Parcela 2/10").

Texto da fatura:
"""
${texto}
"""`,
    { modelTier: "default", cache: false }
  );
  const lancamentos = (resposta.lancamentos || [])
    .filter((l) => l && l.descricao && Number(l.valor))
    .map((l) => ({
      data: /^\d{4}-\d{2}-\d{2}$/.test(l.data) ? l.data : "",
      descricao: String(l.descricao).slice(0, 120),
      valor: Number(l.valor),
      categoria: CATEGORIAS.includes(l.categoria) ? l.categoria : categorizar(String(l.descricao), Number(l.valor)),
    }));
  const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(resposta.vencimento || "") ? resposta.vencimento : "";
  const venc = vencimento ? vencimento.slice(0, 7) : null;
  return {
    banco: resposta.banco || "",
    final: String(resposta.final || "").replace(/\D/g, "").slice(-4),
    mes: venc || `${hoje.getFullYear()}-${doisDigitos(hoje.getMonth() + 1)}`,
    vencimento,
    totalInformado: Number(resposta.total) > 0 ? Number(resposta.total) : null,
    naoReconhecidas: [],
    lancamentos,
  };
}

/* ---------- Parcelas ----------
 * A parcela é lida da própria descrição, então funciona também com faturas já salvas.
 * Formatos aceitos: "Parcela 2/3", "PARC 03/10", "(05/12)", "Loja 03/10", "2 de 10".
 */

const PADROES_PARCELA = [
  /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i,
  /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,
  /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,
  /\b(\d{1,2})\s+de\s+(\d{1,2})\s*$/i,
];

function lerParcela(descricao) {
  for (const re of PADROES_PARCELA) {
    const m = String(descricao).match(re);
    if (!m) continue;
    const atual = +m[1], total = +m[2];
    if (total >= 2 && total <= 72 && atual >= 1 && atual <= total) return { atual, total };
  }
  return null;
}

function semParcela(descricao) {
  const d = String(descricao);
  for (const re of PADROES_PARCELA) {
    const m = d.match(re);
    if (!m || +m[2] < 2 || +m[2] > 72 || +m[1] < 1 || +m[1] > +m[2]) continue;
    return d.replace(re, "").replace(/[\s\-–(]+$/, "").trim() || d;
  }
  return d;
}

function somarMeses(aaaamm, n) {
  const [a, m] = aaaamm.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}`;
}
function mesesEntre(de, ate) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
const mesCurto = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
};

/* Fatura mais recente do cartão até o mês informado (base para projetar o futuro). */
function faturaBase(cartaoId, mes) {
  return fat.faturas
    .filter((f) => f.cartaoId === cartaoId && f.mes <= mes)
    .sort((a, b) => b.mes.localeCompare(a.mes))[0];
}

/* Parcelamentos de um cartão vistos a partir de um mês. */
function parcelamentosNoMes(cartaoId, mes) {
  const base = faturaBase(cartaoId, mes);
  if (!base) return [];
  const passo = mesesEntre(base.mes, mes);
  return (base.lancamentos || [])
    .map((l) => ({ l, p: lerParcela(l.descricao) }))
    .filter(({ l, p }) => p && l.valor > 0 && p.atual + passo <= p.total)
    .map(({ l, p }) => {
      const atual = p.atual + passo;
      return {
        cartaoId,
        descricao: semParcela(l.descricao),
        descricaoOriginal: l.descricao,
        data: l.data,
        categoria: l.categoria,
        valor: l.valor,
        atual,
        total: p.total,
        restantes: p.total - atual,
        fim: somarMeses(base.mes, p.total - p.atual),
        valorRestante: l.valor * (p.total - atual),
      };
    });
}

/* Valor da fatura de um cartão num mês: real se já foi importada; senão, previsto pelas parcelas. */
function faturaDoMes(cartaoId, mes) {
  const real = fat.faturas.find((f) => f.cartaoId === cartaoId && f.mes === mes);
  if (real) return { valor: valorDaFatura(real), prevista: false };
  const base = faturaBase(cartaoId, mes);
  if (!base) return null;
  const valor = parcelamentosNoMes(cartaoId, mes).reduce((t, p) => t + p.valor, 0);
  return valor > 0 ? { valor, prevista: true } : null;
}

/* Faturas previstas do mês, usadas pelo gráfico de pizza nos meses futuros. */
function faturasPrevistas(mes) {
  return fat.cartoes
    .map((c) => ({ c, f: faturaDoMes(c.id, mes) }))
    .filter(({ f }) => f && f.prevista)
    .map(({ c, f }) => ({ nome: `Fatura ${c.nome} (prevista)`, valor: Math.round(f.valor * 100) / 100 }));
}

/* ---------- Estado ---------- */

const fat = {
  cartoes: [],
  faturas: [],
  armCartoes: null,
  armFaturas: null,
  arquivo: null,
  linhas: null,
  leitura: null, // resultado em revisão
  filtroCartao: "",
  filtroMes: "",
  todosOsMeses: false,
  filtroTipo: "todos", // todos | parceladas | avista
};

/* V2-03: pagamento da fatura anterior ("Pagamento via conta", "Pagamento recebido") não é
 * compra, estorno nem crédito desta fatura. Vale também para faturas já salvas com essa linha. */
const ehPagamentoAnterior = (l) => Number(l.valor) < 0 && /^(pagamento|pagto|pgto)\b/.test(semAcento(String(l.descricao || ""))) && !/estorno|devoluc/.test(semAcento(String(l.descricao || "")));
const totalGastos = (lancs) => lancs.reduce((t, l) => t + (l.valor > 0 ? l.valor : 0), 0);
const totalFatura = (lancs) => lancs.reduce((t, l) => t + (ehPagamentoAnterior(l) ? 0 : l.valor), 0);
// Valor da fatura: o total oficial (do PDF ou digitado); sem ele, a soma dos lançamentos.
const valorDaFatura = (f) => (Number(f.totalInformado) > 0 ? Number(f.totalInformado) : totalFatura(f.lancamentos || []));

function avisoLeitura(texto) {
  const el = document.getElementById("leitura-aviso");
  el.textContent = texto;
  el.hidden = !texto;
}
function estadoLeitura(texto) {
  const el = document.getElementById("leitura-estado");
  el.textContent = texto;
  el.hidden = !texto;
}

/* ---------- Cartões ---------- */

function renderizarCartoes() {
  const area = document.getElementById("cartoes");
  const n = fat.cartoes.length;
  document.getElementById("cartoes-contagem").textContent = `${n} ${n === 1 ? "cartão" : "cartões"}`;
  area.innerHTML = "";
  if (!n) {
    area.innerHTML = `
      <div class="cartao-vazio">
        <span class="chip" aria-hidden="true"></span>
        <p>Nenhum cartão cadastrado ainda.</p>
        <p class="dica">Importe uma fatura em PDF e o cartão aparece aqui.</p>
      </div>`;
    return;
  }
  [...fat.cartoes]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .forEach((c) => {
      const faturas = fat.faturas.filter((f) => f.cartaoId === c.id).sort((a, b) => b.mes.localeCompare(a.mes));
      const ultima = faturas.find((f) => f.mes === mesRef);
      const prevista = ultima ? null : faturaDoMes(c.id, mesRef);
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cartao" + (fat.filtroCartao === c.id ? " selecionado" : "");
      // Cor da marca do cartão (selo provisório, F6): Nubank roxo, Itaú laranja, Itaú Black quase preto...
      const marca = marcaDe(c.nome);
      if (marca) {
        botao.classList.add("com-marca");
        botao.style.setProperty("--marca", marca.cor);
        botao.style.setProperty("--marca-texto", marca.texto === "#ffffff" || marca.escuro ? "#ffffff" : marca.texto);
      }
      botao.setAttribute("aria-pressed", String(fat.filtroCartao === c.id));
      botao.innerHTML = `
        <div class="cartao-topo">
          <span class="cartao-nome">${escapar(c.nome)}</span>
          ${marca ? seloMarca(c.nome, { classe: "no-cartao" }) : '<span class="chip" aria-hidden="true"></span>'}
        </div>
        <span class="cartao-final">•••• ${escapar(c.final || "····")}</span>
        <span class="cartao-total">${ultima
          ? `${nomeDoMes(ultima.mes)}: ${moeda.format(valorDaFatura(ultima))}`
          : prevista
            ? `Previsto em ${nomeMesRef()}: ${moeda.format(prevista.valor)}`
            : `Sem fatura em ${nomeMesRef()}`} · ${faturas.length} fatura${faturas.length === 1 ? "" : "s"}</span>`;
      botao.addEventListener("click", () => {
        fat.filtroCartao = c.id;
        fat.filtroMes = "";
        fat.todosOsMeses = false;
        renderizarFaturas();
        document.getElementById("titulo-planilha").scrollIntoView({ block: "start", behavior: "smooth" });
      });
      area.appendChild(botao);
    });
}

/* ---------- Importação ---------- */

async function processarArquivo(arquivo, senha) {
  avisoLeitura("");
  document.getElementById("previa").hidden = true;
  document.getElementById("senha-pdf").hidden = true;
  if (!arquivo) return;
  if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf") {
    avisoLeitura("Esse arquivo não é um PDF. Escolha o PDF da fatura.");
    return;
  }
  fat.arquivo = arquivo;
  estadoLeitura(`Lendo “${arquivo.name}”…`);
  try {
    fat.linhas = await lerLinhasDoPdf(arquivo, senha);
  } catch (e) {
    estadoLeitura("");
    if (e.codigo === "senha" || e.codigo === "senha-errada") {
      document.getElementById("senha-pdf").hidden = false;
      document.getElementById("pdf-senha").value = "";
      document.getElementById("pdf-senha").focus();
      if (e.codigo === "senha-errada") avisoLeitura("Senha incorreta. Tente de novo.");
    } else if (e.codigo === "sem-pdfjs") {
      avisoLeitura("O leitor de PDF não carregou. Verifique sua conexão com a internet e recarregue a página.");
    } else {
      avisoLeitura("Não foi possível ler esse PDF. Confira se é o arquivo da fatura e tente de novo.");
    }
    return;
  }
  estadoLeitura("");
  if (!fat.linhas.length) {
    avisoLeitura("Esse PDF não tem texto selecionável (parece uma imagem escaneada), então não dá para ler os lançamentos.");
    return;
  }
  mostrarPrevia(extrairDaFatura(fat.linhas), "leitor");
}

/* V2-09: cartão sugerido só quando o final confere. Mesmo banco com final diferente (ou
 * sem final lido) pede escolha explícita: nada é pré-selecionado. */
function sugerirCartao(leitura) {
  const porFinal = leitura.final ? fat.cartoes.find((c) => c.final === leitura.final) : null;
  if (porFinal) return { id: porFinal.id, aviso: "" };
  const mesmoBanco = leitura.banco ? fat.cartoes.filter((c) => semAcento(c.nome).includes(semAcento(leitura.banco))) : [];
  if (!mesmoBanco.length) return { id: "", aviso: "" };
  const lista = mesmoBanco.map((c) => `${c.nome}${c.final ? " •••• " + c.final : ""}`).join(", ");
  return {
    id: "__escolher",
    aviso: leitura.final
      ? `Já existe ${lista}, mas esta fatura é do final ${leitura.final}. Escolha o cartão certo: um dos existentes ou “+ Novo cartão”.`
      : `Já existe ${lista} e o final do cartão não foi lido. Escolha o cartão certo antes de salvar.`,
  };
}

function mostrarPrevia(leitura, metodo) {
  fat.leitura = leitura;
  const form = document.getElementById("previa");
  const select = document.getElementById("previa-cartao");
  leitura.lancamentos = leitura.lancamentos.map((l) => ({ ...l }));

  const sugestao = sugerirCartao(leitura);
  select.innerHTML =
    (sugestao.id === "__escolher" ? `<option value="__escolher">Escolha o cartão…</option>` : "") +
    fat.cartoes.map((c) => `<option value="${c.id}">${escapar(c.nome)}${c.final ? " •••• " + escapar(c.final) : ""}</option>`).join("") +
    `<option value="">+ Novo cartão</option>`;
  select.value = sugestao.id;
  const aviso = document.getElementById("previa-cartao-aviso");
  aviso.textContent = sugestao.aviso;
  aviso.hidden = !sugestao.aviso;
  form.elements.novo.value = leitura.banco || "";
  form.elements.final.value = leitura.final || "";
  form.elements.mes.value = leitura.mes;
  form.elements.vencimento.value = leitura.vencimento || "";
  form.elements.total.value = leitura.totalInformado ?? "";
  form.elements.revisado.checked = false;
  form.elements.substituir.checked = false;
  leitura.vencimentoEscolhido = leitura.vencimento || "";
  renderizarDiagnostico(leitura);
  const naoLidas = document.getElementById("previa-nao-lidas");
  const lista = leitura.naoReconhecidas || [];
  naoLidas.hidden = !lista.length;
  naoLidas.open = false;
  naoLidas.querySelector("summary").textContent = `${lista.length} linha${lista.length === 1 ? "" : "s"} com valor que não ${lista.length === 1 ? "virou" : "viraram"} lançamento (totais, pagamentos, resumos…)`;
  naoLidas.querySelector("ul").innerHTML = lista.map((t) => `<li>${escapar(t)}</li>`).join("");

  const n = leitura.lancamentos.length;
  document.getElementById("previa-titulo").textContent = n
    ? `Encontrei ${n} lançamento${n === 1 ? "" : "s"}${metodo === "claude" ? " com o Claude" : ""}. Confira antes de salvar.`
    : "Não encontrei lançamentos nesse PDF. Você pode incluí-los à mão abaixo.";
  renderizarLancamentosPrevia();
  form.hidden = false;

  usarRecurso("sample").then((s) => {
    document.getElementById("previa-claude").hidden = !s || metodo === "claude";
  });
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* V2-05: os lançamentos da prévia podem ser corrigidos (data, descrição, valor), removidos
 * ou incluídos à mão antes de salvar; a conciliação com o total se atualiza na hora. */
function renderizarLancamentosPrevia() {
  const l = fat.leitura;
  const caixa = document.getElementById("previa-lancamentos");
  if (!l) return;
  const pagos = l.pagamentosAnteriores || [];
  const prox = l.proximas || [];
  caixa.innerHTML = `
    <table class="tabela previa-tabela">
      <thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col" class="num">Valor (R$)</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
      <tbody>${l.lancamentos.map((x, i) => `
        <tr data-i="${i}">
          <td><input type="date" data-campo="data" value="${escapar(x.data || "")}" aria-label="Data do lançamento ${i + 1}"></td>
          <td><input type="text" data-campo="descricao" maxlength="120" value="${escapar(x.descricao)}" aria-label="Descrição do lançamento ${i + 1}"></td>
          <td class="num"><input type="number" step="0.01" inputmode="decimal" data-campo="valor" value="${Number(x.valor).toFixed(2)}" aria-label="Valor do lançamento ${i + 1}"></td>
          <td><button type="button" class="botao mini" data-remover-previa="${i}">Remover</button></td>
        </tr>`).join("")}</tbody>
    </table>
    <button type="button" class="botao mini" id="previa-incluir">+ Incluir lançamento</button>
    ${pagos.length ? `<p class="dica">Pagamento da fatura anterior (não é gasto nem crédito desta fatura, fica fora da soma): ${pagos.map((p) => `${dataBR(p.data)} ${escapar(p.descricao || "Pagamento")} ${moeda.format(-p.valor)}`).join(" · ")}</p>` : ""}
    ${prox.length ? `<details class="nao-lidas"><summary>${prox.length} parcela${prox.length === 1 ? "" : "s"} das próximas faturas (${moeda.format(prox.reduce((t, x) => t + x.valor, 0))}): só previsão, não entra nesta fatura</summary>
      <ul>${prox.map((x) => `<li>${dataBR(x.data)} ${escapar(x.descricao)} ${moeda.format(x.valor)}</li>`).join("")}</ul></details>` : ""}`;
  caixa.querySelectorAll("tbody input").forEach((el) => el.addEventListener("change", () => {
    const i = Number(el.closest("tr").dataset.i);
    const campo = el.dataset.campo;
    const item = l.lancamentos[i];
    if (campo === "valor") {
      const v = Math.round(Number(String(el.value).replace(",", ".")) * 100) / 100;
      if (!v) { el.value = Number(item.valor).toFixed(2); return; }
      item.valor = v;
      if (v < 0) item.categoria = CREDITO;
      else if (item.categoria === CREDITO) item.categoria = categorizar(item.descricao, v);
    } else if (campo === "descricao") {
      const t = el.value.trim();
      if (!t) { el.value = item.descricao; return; }
      item.descricao = t;
    } else item[campo] = el.value || "";
    atualizarPrevia();
  }));
  caixa.querySelectorAll("[data-remover-previa]").forEach((b) => b.addEventListener("click", () => {
    l.lancamentos.splice(Number(b.dataset.removerPrevia), 1);
    renderizarLancamentosPrevia();
  }));
  document.getElementById("previa-incluir").addEventListener("click", () => {
    const form = document.getElementById("previa");
    l.lancamentos.push({ data: form.elements.vencimento.value || "", descricao: "Lançamento incluído à mão", valor: 0.01, categoria: "Outros", manual: true });
    renderizarLancamentosPrevia();
    const campos = caixa.querySelectorAll("tbody tr:last-child input");
    campos[1]?.select();
  });
  atualizarPrevia();
}

const chaveLanc = (x) => `${x.data || ""}|${semAcento(String(x.descricao)).replace(/\s+/g, " ").trim()}|${Number(x.valor).toFixed(2)}`;

/* V2-05: reimportação compara o detalhamento novo com o salvo antes de substituir. */
function comparacaoReimportacao(antiga, novos) {
  const contar = (lista) => { const m = new Map(); lista.forEach((x) => m.set(chaveLanc(x), (m.get(chaveLanc(x)) || 0) + 1)); return m; };
  const a = contar(antiga.lancamentos || []), b = contar(novos);
  const sai = [], entra = [];
  (antiga.lancamentos || []).forEach((x) => { const k = chaveLanc(x); if ((b.get(k) || 0) > 0) b.set(k, b.get(k) - 1); else sai.push(x); });
  novos.forEach((x) => { const k = chaveLanc(x); if ((a.get(k) || 0) > 0) a.set(k, a.get(k) - 1); else entra.push(x); });
  return { sai, entra, mantidos: novos.length - entra.length };
}

/* V2-08: a conta do Controle de pagamentos que a importação vai criar, vincular ou alterar. */
function planoDaConta(cartaoId, mes, total, vencimento) {
  const contas = typeof pag !== "undefined" ? pag.contas : [];
  const repetida = fat.faturas.find((f) => f.cartaoId === cartaoId && f.mes === mes);
  const ligada = repetida ? contas.find((c) => c.id === idContaDaFatura(repetida.id) || (c.origem === "fatura" && c.faturaId === repetida.id)) : null;
  if (ligada) return { tipo: "existente", conta: ligada, repetida, duplicatas: [] };
  const cartao = fat.cartoes.find((c) => c.id === cartaoId);
  const termos = [cartao?.nome, fat.leitura?.banco, cartao?.final || fat.leitura?.final].filter(Boolean).map((t) => semAcento(String(t)));
  const mesConta = (c) => (typeof mesDaConta === "function" ? mesDaConta(c) : String(c.vencimento || "").slice(0, 7));
  const duplicatas = contas.filter((c) => c.origem !== "fatura" && mesConta(c) === mes && (
    (total > 0 && Math.abs((Number(c.valor) || 0) - total) <= Math.max(1, total * 0.01)) ||
    termos.some((t) => t.length >= 2 && semAcento(c.nome).includes(t)) || /fatura|cartao/.test(semAcento(c.nome))));
  return { tipo: repetida?.semConta ? "sem-conta" : "nova", repetida, duplicatas, vencimento };
}

function atualizarPrevia() {
  const form = document.getElementById("previa");
  const l = fat.leitura;
  if (!l) return;
  const cartaoValor = form.elements.cartao.value;
  const novo = !cartaoValor;
  const escolher = cartaoValor === "__escolher";
  document.getElementById("previa-novo-rotulo").hidden = !novo;
  // V2-09: trocar o cartão nunca apaga o vencimento já escolhido.
  if (!form.elements.vencimento.value && l.vencimentoEscolhido) form.elements.vencimento.value = l.vencimentoEscolhido;
  const gastos = totalGastos(l.lancamentos);
  const creditos = l.lancamentos.filter((x) => x.valor < 0).reduce((t, x) => t + x.valor, 0);
  const soma = Math.round((gastos + creditos) * 100) / 100;
  const total = Number(String(form.elements.total.value).replace(",", "."));
  const mes = form.elements.mes.value;
  const repetida = !novo && !escolher ? fat.faturas.find((f) => f.cartaoId === cartaoValor && f.mes === mes) : null;
  const cartao = fat.cartoes.find((c) => c.id === cartaoValor);
  const final = form.elements.final.value.replace(/\D/g, "").slice(-4);
  const nomeCartao = escolher ? "" : novo ? `${form.elements.novo.value.trim() || "novo cartão"} (novo)` : cartao?.nome;
  const diferenca = total > 0 ? Math.round((total - soma) * 100) / 100 : 0;
  // V2-04: lançamentos que não fecham com o total pedem revisão antes de salvar.
  // Bloqueia: nenhum lançamento, um único lançamento que não bate, ou mais de 25% sem detalhe.
  const precisaRevisar = total > 0 && (l.lancamentos.length === 0 || (l.lancamentos.length === 1 && Math.abs(diferenca) >= 0.01)
    || Math.abs(diferenca) > total * 0.25);
  document.getElementById("previa-resumo").innerHTML = `
    ${escolher ? `<span class="status atrasada">Escolha o cartão</span>` : `<span>Cartão <strong>${escapar(nomeCartao || "")}${final || cartao?.final ? ` •••• ${escapar(final || cartao.final)}` : ""}</strong></span>`}
    ${final && cartao?.final && cartao.final !== final ? `<span class="status atrasada">Final lido ${escapar(final)} ≠ final do cartão escolhido ${escapar(cartao.final)}</span>` : ""}
    ${l.banco ? `<span>Banco <strong>${escapar(l.banco)}</strong></span>` : ""}
    <span>Vencimento <strong>${form.elements.vencimento.value ? dataBR(form.elements.vencimento.value) : "a confirmar"}</strong></span>
    <span>Gastos <strong>${moeda.format(gastos)}</strong></span>
    ${creditos ? `<span>Estornos e créditos <strong>${moeda.format(creditos)}</strong></span>` : ""}
    <span>Soma dos lançamentos <strong>${moeda.format(soma)}</strong></span>
    ${!(total > 0) ? `<span class="status pendente">Sem o valor total, a fatura vai usar a soma dos lançamentos.</span>`
      : `<span>Total da fatura <strong>${moeda.format(total)}</strong></span>` + (Math.abs(diferenca) >= 0.01
        ? `<span class="status atrasada">${moeda.format(diferenca)} da fatura não ${Math.abs(diferenca) === 1 ? "foi" : "foram"} detalhados em lançamentos</span>`
        : `<span class="status pago">Lançamentos batem com o total</span>`)}`;

  const revisao = document.getElementById("previa-revisao");
  revisao.hidden = !precisaRevisar;
  revisao.querySelector("span").textContent = l.lancamentos.length === 0
    ? "Nenhum lançamento corresponde à fatura. Conferi e quero salvar mesmo assim."
    : `Os lançamentos somam ${moeda.format(soma)} e a fatura é de ${moeda.format(total)}. Conferi e quero salvar mesmo assim.`;

  // Reimportação: comparação antes de substituir o detalhamento.
  const comp = document.getElementById("previa-comparacao");
  comp.hidden = !repetida;
  if (repetida) {
    const c = comparacaoReimportacao(repetida, l.lancamentos);
    const item = (x) => `<li>${dataBR(x.data)} ${escapar(x.descricao)} ${moeda.format(x.valor)}</li>`;
    comp.querySelector(".comparacao-texto").innerHTML = `
      <strong>Já existe a fatura de ${nomeDoMes(repetida.mes)} deste cartão</strong> (${(repetida.lancamentos || []).length} lançamentos, soma ${moeda.format(totalFatura((repetida.lancamentos || []).filter((x) => !ehPagamentoAnterior(x))))}).
      A nova leitura tem ${l.lancamentos.length} (soma ${moeda.format(soma)}): ${c.mantidos} iguais, ${c.entra.length} novos e ${c.sai.length} que saem.
      As categorias que você escolheu nos lançamentos iguais são mantidas.
      ${c.entra.length ? `<details><summary>Entram (${c.entra.length})</summary><ul>${c.entra.slice(0, 30).map(item).join("")}</ul></details>` : ""}
      ${c.sai.length ? `<details><summary>Saem (${c.sai.length})</summary><ul>${c.sai.slice(0, 30).map(item).join("")}</ul></details>` : ""}`;
  }

  // Conta no Controle de pagamentos.
  const contaBox = document.getElementById("previa-conta");
  const valorConta = total > 0 ? total : soma;
  if (escolher) { contaBox.innerHTML = `<p class="dica">Escolha o cartão para ver a conta do Controle de pagamentos.</p>`; }
  else {
    const plano = planoDaConta(novo ? "" : cartaoValor, mes, valorConta, form.elements.vencimento.value);
    const marcado = form.querySelector("[name=destinoConta]:checked")?.value;
    if (plano.tipo === "existente") {
      const c = plano.conta;
      contaBox.innerHTML = `<h4>Controle de pagamentos</h4>
        <p>A conta já ligada a esta fatura, “${escapar(c.nome)}” (${c.status === "pago" ? `paga${c.pagoEm ? " em " + dataBR(String(c.pagoEm).slice(0, 10)) : ""}` : "pendente"}), continua a mesma.
        ${c.valorEditado ? `O valor que você editou (${moeda.format(Number(c.valor))}) é mantido; só o valor importado passa a ${moeda.format(valorConta)}.`
          : Math.abs((Number(c.valor) || 0) - valorConta) >= 0.01 ? `O valor muda de ${moeda.format(Number(c.valor))} para ${moeda.format(valorConta)}.` : `O valor continua ${moeda.format(valorConta)}.`}
        ${c.status === "pago" ? " O pagamento registrado é preservado." : ""}
        ${form.elements.vencimento.value && c.vencimento !== form.elements.vencimento.value ? ` O vencimento da conta (${dataBR(c.vencimento)}) não é alterado automaticamente; o PDF diz ${dataBR(form.elements.vencimento.value)}.` : ""}</p>`;
    } else {
      const opcoes = [
        { v: "nova", t: `Criar a conta “Fatura ${escapar(novo ? form.elements.novo.value.trim() || "cartão" : cartao?.nome || "cartão")}” de ${moeda.format(valorConta)}, vencimento ${form.elements.vencimento.value ? dataBR(form.elements.vencimento.value) : "a confirmar"}` },
        ...plano.duplicatas.map((c) => ({ v: "ligar:" + c.id, t: `Vincular à conta já cadastrada “${escapar(c.nome)}” de ${moeda.format(Number(c.valor))} (${c.status === "pago" ? "paga — o pagamento é preservado" : c.valorEditado ? "pendente — o valor editado à mão é mantido" : "pendente"})` })),
        { v: "nenhuma", t: "Não criar conta para esta fatura" },
      ];
      const padrao = plano.tipo === "sem-conta" ? "nenhuma" : "nova";
      const escolhido = opcoes.some((o) => o.v === marcado) ? marcado : padrao;
      contaBox.innerHTML = `<h4>Controle de pagamentos</h4>
        ${plano.duplicatas.length ? `<p class="status atrasada">Possível duplicata: já existe ${plano.duplicatas.length === 1 ? "uma conta" : `${plano.duplicatas.length} contas`} neste mês que pode ser esta fatura. Nada é excluído nem juntado sem a sua escolha.</p>` : ""}
        ${opcoes.map((o) => `<label class="campo-check"><input type="radio" name="destinoConta" value="${escapar(o.v)}"${o.v === escolhido ? " checked" : ""}> ${o.t}</label>`).join("")}`;
    }
  }
  // Motivos de o Salvar estar desabilitado, ditos em claro para a pessoa.
  const motivos = [
    escolher && "escolha o cartão desta fatura",
    !l.lancamentos.length && !(total > 0) && "inclua ao menos um lançamento ou informe o total",
    precisaRevisar && !form.elements.revisado.checked && "confira os lançamentos e marque “Conferi”",
    !!repetida && !form.elements.substituir.checked && "esta fatura já existe: marque “Substituir o detalhamento salvo por esta leitura” para trocar o detalhamento",
  ].filter(Boolean);
  form.querySelector("[type=submit]").disabled = motivos.length > 0;
  const bloqueio = document.getElementById("previa-bloqueio");
  bloqueio.hidden = !motivos.length;
  bloqueio.textContent = motivos.length ? `Para salvar: ${motivos.join("; ")}.` : "";
}

async function salvarImportacao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const l = fat.leitura;
  const mes = form.elements.mes.value;
  const final = form.elements.final.value.replace(/\D/g, "").slice(-4);
  let cartaoId = form.elements.cartao.value;
  if (cartaoId === "__escolher") return avisoLeitura("Escolha o cartão desta fatura (um dos existentes ou “+ Novo cartão”).");
  if (!mes) return avisoLeitura("Informe o mês da fatura.");
  if (!cartaoId && !form.elements.novo.value.trim()) return avisoLeitura("Dê um nome para o novo cartão.");
  const destino = form.querySelector("[name=destinoConta]:checked")?.value || "nova";

  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    if (!cartaoId) {
      cartaoId = await fat.armCartoes.salvar(null, { nome: form.elements.novo.value.trim(), final });
    } else {
      const cartao = fat.cartoes.find((c) => c.id === cartaoId);
      if (final && cartao && !cartao.final) await fat.armCartoes.salvar(cartaoId, { nome: cartao.nome, final });
    }
    const repetida = fat.faturas.find((f) => f.cartaoId === cartaoId && f.mes === mes);
    // Reimportação: mantém as categorias escolhidas à mão nos lançamentos iguais.
    const categorias = new Map((repetida?.lancamentos || []).map((x) => [chaveLanc(x), x.categoria]));
    const lancamentos = l.lancamentos.map(({ manual, ...x }) => ({ ...x, categoria: categorias.get(chaveLanc(x)) || x.categoria || categorizar(x.descricao, x.valor) }));
    const total = Number(String(form.elements.total.value).replace(",", "."));
    const ligar = destino.startsWith("ligar:") ? pag.contas.find((c) => c.id === destino.slice(6)) : null;
    const dados = {
      cartaoId,
      mes,
      vencimento: form.elements.vencimento.value || null,
      totalInformado: total > 0 ? total : null,
      arquivo: fat.arquivo ? fat.arquivo.name : "",
      importadoEm: new Date().toISOString(),
      // Vincular a uma conta existente ou não criar conta: a criação automática fica desligada.
      semConta: repetida ? !!repetida.semConta : destino !== "nova",
      lancamentos,
    };
    const faturaId = await fat.armFaturas.salvar(repetida ? repetida.id : null, dados);
    // Reimportação: registra no histórico da conta ligada (depois que a fatura foi salva).
    const contaLigada = repetida && typeof pag !== "undefined"
      ? pag.contas.find((c) => c.id === idContaDaFatura(repetida.id) || (c.origem === "fatura" && c.faturaId === repetida.id)) : null;
    if (contaLigada && typeof registrarEventoConta === "function") {
      // Só fatos da fatura, conhecidos aqui: antes = o que estava salvo, depois = o que foi salvo agora.
      // A conta é tratada à parte pela sincronização, que registra o próprio evento se algo mudar.
      const retrato = (lista, totalInf) => ({
        lancamentosFatura: lista.length,
        somaLancamentosFatura: Math.round(totalFatura(lista) * 100) / 100,
        ...(Number(totalInf) > 0 ? { totalInformadoFatura: Number(totalInf) } : {}),
      });
      await registrarEventoConta({ contaId: contaLigada.id, faturaId, evento: "reimportacao", origem: "importacao_fatura",
        antes: retrato(repetida.lancamentos || [], repetida.totalInformado), depois: retrato(lancamentos, dados.totalInformado),
        detalhe: "Detalhamento da fatura substituído por uma nova leitura, com confirmação na prévia." });
    }
    if (ligar) {
      const { id, ...conta } = ligar;
      const valor = total > 0 ? total : totalFatura(lancamentos);
      // Conta paga ou com valor editado à mão mantém o valor (e o pagamento); só a pendente sem
      // ajuste manual passa a acompanhar a fatura.
      const manter = conta.status === "pago" || !!conta.valorEditado;
      const nova = {
        ...conta, origem: "fatura", faturaId, valorFatura: valor,
        valor: manter ? conta.valor : valor,
        valorEditado: !!conta.valorEditado || (manter && Math.abs((Number(conta.valor) || 0) - valor) > 0.004),
      };
      await pag.armazenamento.salvar(id, nova);
      // Só depois da conta gravada: registra a vinculação com antes/depois.
      if (typeof registrarEventoConta === "function") {
        await registrarEventoConta({ contaId: id, faturaId, evento: "vinculacao", origem: "importacao_fatura", ...diferencaConta(ligar, nova),
          detalhe: "Conta já cadastrada vinculada à fatura importada, por escolha na prévia." });
      }
      await fat.armFaturas.salvar(faturaId, { ...dados, semConta: false });
    }
    fat.filtroCartao = cartaoId;
    fat.filtroMes = mes;
    fat.todosOsMeses = false;
    definirMes(mes); // a timeline vai para o mês da fatura importada
    cancelarImportacao();
    estadoLeitura(`Fatura de ${nomeDoMes(mes)} salva.`);
    renderizarFaturas();
  } catch (e) {
    console.error(e);
    avisoLeitura("Não foi possível salvar a fatura. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
}

/* Diagnóstico da leitura: páginas, linhas e o texto completo extraído do PDF. */
function renderizarDiagnostico(leitura) {
  const caixa = document.getElementById("previa-diagnostico");
  const linhas = fat.linhas || [];
  caixa.hidden = !linhas.length;
  if (!linhas.length) return;
  const paginas = linhas.paginas || [];
  const datas = leitura.lancamentos.map((l) => l.data).filter(Boolean).sort();
  caixa.querySelector("summary").textContent =
    `Diagnóstico da leitura: ${paginas.length} página${paginas.length === 1 ? "" : "s"}, ${linhas.length} linhas de texto` +
    (datas.length ? ` · compras de ${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}` : "");
  caixa.querySelector(".paginas").innerHTML = paginas
    .map((p) => `<li>Página ${p.numero}: ${p.linhas} linha${p.linhas === 1 ? "" : "s"}${p.pedacos === 0 ? " — <strong>sem texto (imagem?)</strong>" : ""}</li>`)
    .join("");
  let inicio = 0;
  caixa.querySelector("textarea").value = paginas.length
    ? paginas.map((p) => { const bloco = linhas.slice(inicio, inicio + p.linhas); inicio += p.linhas; return `=== Página ${p.numero} ===\n${bloco.join("\n")}`; }).join("\n\n")
    : linhas.join("\n");
}

async function copiarDiagnostico() {
  const campo = document.querySelector("#previa-diagnostico textarea");
  const botao = document.getElementById("copiar-diagnostico");
  try { await navigator.clipboard.writeText(campo.value); botao.textContent = "Copiado"; }
  catch { campo.focus(); campo.select(); botao.textContent = "Selecionado: use Ctrl+C"; }
  setTimeout(() => (botao.textContent = "Copiar texto lido"), 2500);
}

function cancelarImportacao() {
  fat.leitura = null;
  fat.linhas = null;
  document.getElementById("previa").hidden = true;
  document.getElementById("senha-pdf").hidden = true;
  document.getElementById("pdf-arquivo").value = "";
  avisoLeitura("");
  estadoLeitura("");
}

async function lerComClaude() {
  const botao = document.getElementById("previa-claude");
  botao.disabled = true;
  botao.textContent = "Lendo com o Claude…";
  avisoLeitura("");
  try {
    mostrarPrevia(await extrairComClaude(fat.linhas), "claude");
  } catch (e) {
    avisoLeitura(e && e.code === "rate_limited"
      ? "Muitas leituras seguidas. Espere um pouco e tente de novo."
      : "Não foi possível ler com o Claude agora. Os lançamentos do leitor automático continuam aqui.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Ler de novo com o Claude";
  }
}

/* ---------- Planilha e relatório ---------- */

function faturasSelecionadas() {
  const doCartao = fat.faturas.filter((f) => f.cartaoId === fat.filtroCartao);
  return fat.filtroMes ? doCartao.filter((f) => f.mes === fat.filtroMes) : doCartao;
}

function renderizarFiltros() {
  const comFatura = fat.cartoes.filter((c) => fat.faturas.some((f) => f.cartaoId === c.id));
  if (!comFatura.some((c) => c.id === fat.filtroCartao)) fat.filtroCartao = comFatura[0]?.id || "";
  const meses = fat.faturas.filter((f) => f.cartaoId === fat.filtroCartao).map((f) => f.mes).sort().reverse();
  if (!fat.filtroMes && !fat.todosOsMeses) fat.filtroMes = mesRef;
  const opcoes = [...new Set([...meses, ...(fat.filtroMes ? [fat.filtroMes] : [])])].sort().reverse();

  const selCartao = document.getElementById("filtro-cartao");
  selCartao.innerHTML = comFatura.map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`).join("");
  selCartao.value = fat.filtroCartao;
  const selMes = document.getElementById("filtro-mes");
  selMes.innerHTML = opcoes.map((m) => `<option value="${m}">${nomeDoMes(m)}${meses.includes(m) ? "" : " (sem fatura)"}</option>`).join("") +
    (meses.length > 1 ? `<option value="todos">Todos os meses</option>` : "");
  selMes.value = fat.todosOsMeses && meses.length > 1 ? "todos" : fat.filtroMes;
  selCartao.hidden = selMes.hidden = !comFatura.length;
}

async function atualizarLancamento(fatura, indice, mudanca) {
  const lancamentos = fatura.lancamentos.map((l, i) => (i === indice ? { ...l, ...mudanca } : l)).filter(Boolean);
  const { id, ...dados } = fatura;
  try {
    await fat.armFaturas.salvar(id, { ...dados, lancamentos });
  } catch {
    estadoLeitura("");
    avisoLeitura("Não foi possível salvar a alteração. Tente de novo.");
  }
}

async function removerLancamento(fatura, indice) {
  const { id, ...dados } = fatura;
  try {
    await fat.armFaturas.salvar(id, { ...dados, lancamentos: fatura.lancamentos.filter((_, i) => i !== indice) });
  } catch {
    avisoLeitura("Não foi possível remover o lançamento. Tente de novo.");
  }
}

/* Desenho da coluna "Parcelas": à vista, ou parcela atual com um bloco por parcela. */
function celulaParcelas(p) {
  if (!p) return `<span class="tag-vista">à vista</span>`;
  const estado = p.restantes === 0 ? "ultima" : p.restantes <= 2 ? "acabando" : "";
  const blocos = p.total <= 24
    ? `<span class="blocos" aria-hidden="true">${Array.from({ length: p.total }, (_, i) =>
        `<i class="${i < p.atual - 1 ? "pago" : i === p.atual - 1 ? "atual" : ""}"></i>`).join("")}</span>`
    : `<span class="barra mini-barra" aria-hidden="true"><span class="preenchimento" style="width:${(p.atual / p.total) * 100}%"></span></span>`;
  const situacao = p.restantes === 0 ? "última parcela" : `até ${mesCurto(p.fim)} · falta${p.restantes === 1 ? "" : "m"} ${p.restantes}`;
  return `
    <div class="parcelas">
      <span class="chip-parcela ${estado}" aria-label="Parcela ${p.atual} de ${p.total}">${p.atual}/${p.total}</span>
      ${blocos}
    </div>
    <span class="sub ${estado}">${situacao}</span>`;
}

function renderizarPlanilha() {
  const faturas = faturasSelecionadas();
  const cartao = fat.cartoes.find((c) => c.id === fat.filtroCartao);
  const mes = fat.filtroMes || mesRef;
  // Mês sem fatura importada: mostra a fatura prevista (só as parcelas que continuam).
  const prevista = !faturas.length && cartao && !fat.todosOsMeses ? parcelamentosNoMes(cartao.id, mes) : [];
  const vazia = !faturas.length && !prevista.length;

  document.getElementById("planilha-vazia").textContent = cartao
    ? `Nenhuma fatura de ${cartao.nome} em ${nomeDoMes(mes)}. Escolha outro mês na timeline ou importe a fatura mais abaixo.`
    : "Nenhuma fatura importada ainda. Importe o PDF de uma fatura em “Importar fatura”, mais abaixo.";
  document.getElementById("planilha-vazia").hidden = !vazia;
  document.getElementById("planilha-conteudo").hidden = vazia;
  document.getElementById("excluir-fatura").hidden = faturas.length !== 1;
  document.getElementById("baixar-planilha").hidden = !faturas.length;
  if (vazia) return;

  const todas = faturas.length
    ? faturas.flatMap((f) => (f.lancamentos || []).map((l, i) => {
        const p = lerParcela(l.descricao);
        const parcela = p && l.valor > 0
          ? { ...p, restantes: p.total - p.atual, fim: somarMeses(f.mes, p.total - p.atual) }
          : null;
        return { ...l, fatura: f, indice: i, parcela };
      }))
    : prevista.map((p) => ({ data: "", descricao: p.descricaoOriginal, categoria: p.categoria, valor: p.valor, parcela: p, prevista: true }));
  todas.sort((a, b) => String(a.data).localeCompare(String(b.data)));

  // V2-03: pagamentos da fatura anterior ficam à parte: fora do "À vista" e da conciliação.
  const pagamentosAnt = todas.filter(ehPagamentoAnterior);
  const compras = todas.filter((l) => !ehPagamentoAnterior(l));
  const parceladas = compras.filter((l) => l.parcela);
  const avista = compras.filter((l) => !l.parcela);
  const soma = (lista) => lista.reduce((t, l) => t + l.valor, 0);
  // Total oficial da fatura e o que não apareceu como lançamento (juros, saldo anterior, linhas não lidas…).
  const totalOficial = faturas.length ? faturas.reduce((t, f) => t + valorDaFatura(f), 0) : soma(compras);
  const naoDetalhado = Math.round((totalOficial - soma(compras)) * 100) / 100;
  const umaFatura = faturas.length === 1 ? faturas[0] : null;
  const faltaParceladas = parceladas.reduce((t, l) => t + l.valor * l.parcela.restantes, 0);
  const acabando = parceladas.filter((l) => l.parcela.restantes <= 2).length;
  document.getElementById("planilha-resumo").innerHTML = `
    ${prevista.length ? `<span class="status pendente">Fatura prevista: só as parcelas já programadas</span>` : ""}
    <span class="total-fatura">Total da fatura <strong>${moeda.format(totalOficial)}</strong>
      ${umaFatura ? `<button type="button" class="botao mini" id="editar-total">${Number(umaFatura.totalInformado) > 0 ? "Corrigir total" : "Informar total"}</button>` : ""}</span>
    <span>À vista <strong>${moeda.format(soma(avista))}</strong> (${avista.length})</span>
    <span>Parceladas <strong>${moeda.format(soma(parceladas))}</strong> (${parceladas.length})</span>
    ${pagamentosAnt.length ? `<span>Pagamento da fatura anterior <strong>${moeda.format(soma(pagamentosAnt))}</strong> (fora da soma)</span>` : ""}
    ${Math.abs(naoDetalhado) >= 0.01 ? `<span>Não detalhado <strong>${moeda.format(naoDetalhado)}</strong></span>` : ""}
    ${parceladas.length ? `<span>Ainda falta das parceladas <strong>${moeda.format(faltaParceladas)}</strong></span>` : ""}
    ${acabando ? `<span class="status pago">${acabando} terminando em até 2 meses</span>` : ""}`;

  const editar = document.getElementById("editar-total");
  if (editar) editar.addEventListener("click", () => editarTotal(umaFatura, editar.parentElement));
  document.querySelectorAll(".segmentado .seg").forEach((b) => {
    const ativo = b.dataset.tipo === fat.filtroTipo;
    b.classList.toggle("ativo", ativo);
    b.setAttribute("aria-pressed", String(ativo));
  });
  const linhas = fat.filtroTipo === "parceladas" ? parceladas : fat.filtroTipo === "avista" ? avista : [...compras, ...pagamentosAnt];

  const corpo = document.querySelector("#planilha tbody");
  corpo.innerHTML = "";
  linhas.forEach((l) => {
    const tr = document.createElement("tr");
    const pagto = ehPagamentoAnterior(l);
    tr.className = (pagto ? "pagamento-anterior" : l.parcela ? "parcelada" : "avista") + (l.prevista ? " prevista" : "");
    const nome = l.parcela ? semParcela(l.descricao) : l.descricao;
    const valorCompra = l.parcela ? `<span class="sub">compra de ${moeda.format(l.valor * l.parcela.total)}</span>` : "";
    tr.innerHTML = `
      <td class="data">${l.data ? dataBR(l.data) : "—"}</td>
      <td class="conta">${escapar(nome)}</td>
      <td class="celula-parcelas">${pagto ? `<span class="tag-vista">pagamento anterior</span><span class="sub">fora da soma</span>` : celulaParcelas(l.parcela)}</td>
      <td>${l.prevista
        ? `<span class="sub">${escapar(l.categoria || "Outros")}</span>`
        : `<select aria-label="Categoria de ${escapar(nome)}">${CATEGORIAS.map((c) => `<option${c === l.categoria ? " selected" : ""}>${c}</option>`).join("")}</select>`}</td>
      <td class="num${l.valor < 0 ? " credito" : ""}">${moeda.format(l.valor)}${valorCompra}</td>
      <td>${l.prevista ? "" : `<div class="acoes-linha"><span role="button" tabindex="0" class="botao mini" data-editar-lanc aria-label="Editar ${escapar(nome)}">Editar</span><button type="button" class="botao mini" data-remover-lanc aria-label="Remover ${escapar(nome)}">Remover</button></div>`}</td>`;
    if (!l.prevista) {
      tr.querySelector("select").addEventListener("change", (e) => atualizarLancamento(l.fatura, l.indice, { categoria: e.target.value }));
      const ed = tr.querySelector("[data-editar-lanc]");
      ed.addEventListener("click", () => editarLinhaPlanilha(tr, l));
      ed.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editarLinhaPlanilha(tr, l); } });
      const rem = tr.querySelector("[data-remover-lanc]");
      rem.addEventListener("click", () => {
        if (rem.dataset.confirmar !== "sim") {
          rem.dataset.confirmar = "sim";
          rem.textContent = "Confirmar";
          rem.classList.add("perigo");
          return;
        }
        rem.disabled = true;
        removerLancamento(l.fatura, l.indice);
      });
    }
    corpo.appendChild(tr);
  });

  const filtrado = fat.filtroTipo !== "todos";
  if (!filtrado && Math.abs(naoDetalhado) >= 0.01) {
    const tr = document.createElement("tr");
    tr.className = "nao-detalhado";
    tr.innerHTML = `
      <td class="data">—</td>
      <td class="conta">Outros valores da fatura<span class="sub">Diferença entre o total da fatura e os lançamentos lidos do PDF (juros, encargos, saldo anterior ou linhas que o leitor não reconheceu).</span></td>
      <td class="celula-parcelas"><span class="tag-vista">não detalhado</span></td>
      <td><span class="sub">—</span></td>
      <td class="num${naoDetalhado < 0 ? " credito" : ""}">${moeda.format(naoDetalhado)}</td>
      <td></td>`;
    corpo.appendChild(tr);
  }
  document.querySelector("#planilha tfoot").innerHTML = `
    <tr><td></td><td>${linhas.length} lançamento${linhas.length === 1 ? "" : "s"}${filtrado ? ` de ${todas.length}` : ""}</td><td></td>
    <td>${filtrado ? "Subtotal" : "Total da fatura"}</td><td class="num">${moeda.format(filtrado ? soma(linhas) : totalOficial)}</td><td></td></tr>
    ${umaFatura && !filtrado ? `<tr><td colspan="6"><button type="button" class="botao mini" id="incluir-lancamento">+ Incluir lançamento</button></td></tr>` : ""}`;
  const incluir = document.getElementById("incluir-lancamento");
  if (incluir) incluir.addEventListener("click", () => editarLinhaPlanilha(null, { fatura: umaFatura, indice: -1, data: umaFatura.vencimento || "", descricao: "", valor: "" }));
}

/* V2-05: corrigir data, descrição e valor de um lançamento (ou incluir um) sem excluir a fatura.
 * A fatura mantém o mesmo id, então a conta ligada a ela no Controle de pagamentos continua ligada. */
function editarLinhaPlanilha(tr, l) {
  const novo = l.indice < 0;
  const linha = tr || document.createElement("tr");
  linha.className = "editando";
  linha.innerHTML = `
    <td><input type="date" name="data" value="${escapar(l.data || "")}" aria-label="Data"></td>
    <td colspan="2"><input type="text" name="descricao" maxlength="120" value="${escapar(l.descricao || "")}" aria-label="Descrição" placeholder="Descrição"></td>
    <td><span class="sub">${novo ? "lançamento manual" : escapar(l.categoria || "")}</span></td>
    <td class="num"><input type="number" name="valor" step="0.01" inputmode="decimal" value="${l.valor === "" ? "" : Number(l.valor).toFixed(2)}" aria-label="Valor"></td>
    <td><div class="acoes-linha"><button type="button" class="botao mini primario" data-salvar-lanc>Salvar</button><button type="button" class="botao mini" data-cancelar-lanc>Cancelar</button></div></td>`;
  if (!tr) document.querySelector("#planilha tbody").appendChild(linha);
  const campo = (n) => linha.querySelector(`[name=${n}]`);
  campo("descricao").focus();
  linha.querySelector("[data-cancelar-lanc]").addEventListener("click", renderizarPlanilha);
  linha.querySelector("[data-salvar-lanc]").addEventListener("click", async (e) => {
    const descricao = campo("descricao").value.trim();
    const valor = Math.round(Number(String(campo("valor").value).replace(",", ".")) * 100) / 100;
    if (!descricao) return campo("descricao").focus();
    if (!valor) return campo("valor").focus();
    e.currentTarget.disabled = true;
    const mudanca = { data: campo("data").value || null, descricao, valor };
    if (novo) {
      const { id, ...dados } = l.fatura;
      try {
        await fat.armFaturas.salvar(id, { ...dados, lancamentos: [...(l.fatura.lancamentos || []), { ...mudanca, categoria: categorizar(descricao, valor) }] });
      } catch { avisoLeitura("Não foi possível incluir o lançamento. Tente de novo."); }
    } else {
      const anterior = l.fatura.lancamentos[l.indice];
      if (valor < 0) mudanca.categoria = CREDITO;
      else if (anterior.categoria === CREDITO) mudanca.categoria = categorizar(descricao, valor);
      await atualizarLancamento(l.fatura, l.indice, mudanca);
    }
  });
}

/* Corrigir o total oficial da fatura direto na tabela. */
function editarTotal(fatura, alvo) {
  alvo.innerHTML = `
    <label class="sr" for="campo-total-fatura">Total da fatura</label>
    Total da fatura R$ <input id="campo-total-fatura" type="number" min="0" step="0.01" inputmode="decimal" value="${valorDaFatura(fatura).toFixed(2)}">
    <button type="button" class="botao mini primario" id="salvar-total">Salvar</button>
    <button type="button" class="botao mini" id="cancelar-total">Cancelar</button>`;
  const campo = alvo.querySelector("input");
  campo.focus();
  campo.select();
  alvo.querySelector("#cancelar-total").addEventListener("click", renderizarPlanilha);
  const salvar = async () => {
    const valor = Number(String(campo.value).replace(",", "."));
    if (!(valor > 0)) return campo.focus();
    const { id, ...dados } = fatura;
    try {
      await fat.armFaturas.salvar(id, { ...dados, totalInformado: Math.round(valor * 100) / 100 });
    } catch {
      avisoLeitura("Não foi possível salvar o total. Tente de novo.");
    }
  };
  alvo.querySelector("#salvar-total").addEventListener("click", salvar);
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") renderizarPlanilha(); });
}

function renderizarRelatorio() {
  const faturas = faturasSelecionadas();
  const lancs = faturas.flatMap((f) => f.lancamentos || []).filter((l) => l.valor > 0 && l.categoria !== CREDITO && !ehPagamentoAnterior(l));
  const lista = document.getElementById("relatorio");
  const vazio = document.getElementById("relatorio-vazio");
  vazio.hidden = lancs.length > 0;
  vazio.textContent = fat.faturas.length
    ? `Nenhum gasto neste cartão em ${nomeDoMes(fat.filtroMes || mesRef)}.`
    : "O relatório aparece aqui depois que você importar uma fatura em “Importar fatura”, logo abaixo.";
  const cartao = fat.cartoes.find((c) => c.id === fat.filtroCartao);
  document.getElementById("relatorio-periodo").textContent = cartao
    ? `${cartao.nome} · ${fat.filtroMes ? nomeDoMes(fat.filtroMes) : "todos os meses"}`
    : "";
  lista.innerHTML = "";
  if (!lancs.length) return;

  const porCategoria = new Map();
  lancs.forEach((l) => {
    const atual = porCategoria.get(l.categoria) || { valor: 0, qtd: 0 };
    porCategoria.set(l.categoria, { valor: atual.valor + l.valor, qtd: atual.qtd + 1 });
  });
  const naoDetalhado = Math.round(faturas.reduce((t, f) => t + valorDaFatura(f) - totalFatura(f.lancamentos || []), 0) * 100) / 100;
  if (naoDetalhado > 0) porCategoria.set("Não detalhado na fatura", { valor: naoDetalhado, qtd: 0 });
  const total = totalGastos(lancs) + Math.max(naoDetalhado, 0);
  const ordenadas = [...porCategoria.entries()].sort((a, b) => b[1].valor - a[1].valor);
  const maior = ordenadas[0][1].valor;

  ordenadas.forEach(([categoria, { valor, qtd }]) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="cat-nome">${categoria}${qtd ? ` <span class="cat-qtd">· ${qtd} lançamento${qtd === 1 ? "" : "s"}</span>` : ""}</span>
      <span class="cat-valor">${moeda.format(valor)}</span>
      <span class="cat-pct">${Math.round((valor / total) * 100)}%</span>
      <div class="barra" role="progressbar" aria-label="${categoria}"><div class="preenchimento"></div></div>`;
    lista.appendChild(li);
    preencherBarra(li.querySelector(".barra"), valor / maior);
  });
  const totalLi = document.createElement("li");
  totalLi.className = "total-relatorio";
  totalLi.innerHTML = `<span class="cat-nome">Total de gastos</span><span class="cat-valor">${moeda.format(total)}</span><span class="cat-pct">100%</span>`;
  lista.appendChild(totalLi);
}

function renderizarFaturas() {
  renderizarFiltros();
  renderizarCartoes();
  renderizarPrevisao();
  if (typeof renderizarGrafico === "function") renderizarGrafico();
  renderizarPlanilha();
  renderizarRelatorio();
  if (typeof renderizarAssinaturas === "function") renderizarAssinaturas();
  if (fat.leitura) atualizarPrevia();
}

/* ---------- Compras parceladas e previsão ---------- */

function renderizarPrevisao() {
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesRef, i));
  const dados = meses.map((mes) => {
    const porCartao = fat.cartoes
      .map((c) => ({ c, f: faturaDoMes(c.id, mes) }))
      .filter(({ f }) => f && f.valor > 0);
    const terminam = fat.cartoes.flatMap((c) => parcelamentosNoMes(c.id, mes)).filter((p) => p.restantes === 0).length;
    return {
      mes,
      total: porCartao.reduce((t, x) => t + x.f.valor, 0),
      prevista: porCartao.some((x) => x.f.prevista),
      detalhe: porCartao.map((x) => `${x.c.nome}: ${moeda.format(x.f.valor)}${x.f.prevista ? " (previsto)" : ""}`),
      terminam,
    };
  });
  const maior = Math.max(0, ...dados.map((d) => d.total));
  document.getElementById("previsao-vazia").hidden = maior > 0;
  document.getElementById("previsao").hidden = maior === 0;
  const area = document.getElementById("previsao-colunas");
  area.innerHTML = "";
  if (!maior) return;
  dados.forEach((d) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "coluna" + (d.prevista ? " prevista" : "") + (d.mes === mesRef ? " atual" : "");
    const titulo = `${nomeDoMes(d.mes)}: ${moeda.format(d.total)}` + (d.detalhe.length ? "\n" + d.detalhe.join("\n") : "") +
      (d.terminam ? `\n${d.terminam} parcelamento${d.terminam === 1 ? " termina" : "s terminam"}` : "");
    botao.title = titulo;
    botao.setAttribute("aria-label", titulo.replace(/\n/g, ". "));
    botao.innerHTML = `
      <span class="coluna-valor">${d.total ? moeda.format(d.total).replace(/,\d{2}$/, "") : "—"}</span>
      <span class="coluna-trilho"><span class="coluna-barra" style="height:${(d.total / maior) * 100}%"></span></span>
      <span class="coluna-mes">${mesCurto(d.mes)}</span>
      <span class="coluna-fim">${d.terminam ? `−${d.terminam}` : ""}</span>`;
    botao.addEventListener("click", () => definirMes(d.mes));
    area.appendChild(botao);
  });
}

/* ---------- Planilha em CSV ---------- */

async function baixarPlanilha() {
  const faturas = faturasSelecionadas();
  const cartao = fat.cartoes.find((c) => c.id === fat.filtroCartao);
  const linhas = faturas.flatMap((f) => (f.lancamentos || []).map((l) => ({ ...l, mes: f.mes })))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const celula = (t) => `"${String(t).replace(/"/g, '""')}"`;
  const valorBR = (v) => v.toFixed(2).replace(".", ",");
  const csv = "﻿" + [
    ["Data", "Descrição", "Parcela", "Categoria", "Valor", "Fatura"].map(celula).join(";"),
    ...linhas.map((l) => {
      const p = l.valor > 0 && lerParcela(l.descricao);
      return [dataBR(l.data), p ? semParcela(l.descricao) : l.descricao, p ? `${p.atual}/${p.total}` : "à vista", l.categoria, valorBR(l.valor), nomeDoMes(l.mes)].map(celula).join(";");
    }),
    ...faturas.filter((f) => Math.abs(valorDaFatura(f) - totalFatura(f.lancamentos || [])) >= 0.01).map((f) =>
      ["", "Outros valores da fatura (não detalhados)", "", "", valorBR(valorDaFatura(f) - totalFatura(f.lancamentos || [])), nomeDoMes(f.mes)].map(celula).join(";")),
    ["", "", "", "Total da fatura", valorBR(faturas.reduce((t, f) => t + valorDaFatura(f), 0)), ""].map(celula).join(";"),
  ].join("\r\n");
  const nome = `fatura-${semAcento(cartao?.nome || "cartao").replace(/[^a-z0-9]+/g, "-")}-${fat.filtroMes || "todos"}.csv`;

  const downloads = await usarRecurso("downloads");
  if (downloads) {
    try { await downloads.save({ filename: nome, data: csv }); }
    catch (e) { if (e?.code !== "declined") avisoLeitura("Não foi possível baixar a planilha agora."); }
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Ligação com o controle de pagamentos ----------
 * Cada fatura importada vira uma conta "Fatura <cartão>" no controle de pagamentos,
 * com o valor total da fatura e o vencimento dela. Se você editar o valor da conta,
 * o seu valor é mantido; se a fatura mudar (reimportação, lançamento removido),
 * o valor importado é atualizado e passa para a conta apenas se ela não foi editada.
 */

const idContaDaFatura = (faturaId) => "fatura-" + faturaId;
const sincronizando = new Set();

async function sincronizarContasDasFaturas() {
  if (!fat.faturasCarregadas || !fat.cartoesCarregados || typeof pag === "undefined" || !pag.carregado || !pag.armazenamento) return;

  for (const f of fat.faturas) {
    const id = idContaDaFatura(f.id);
    if (f.semConta || sincronizando.has(id)) continue;
    const cartao = fat.cartoes.find((c) => c.id === f.cartaoId);
    const total = Math.round(valorDaFatura(f) * 100) / 100;
    // Fatura sem total e sem lançamentos (carga incompleta, falha na consulta): não cria nem
    // altera conta nenhuma com valor zero.
    if (!(total > 0)) continue;
    // V2-08: conta vinculada pela importação (faturaId) conta como a conta desta fatura.
    const existente = pag.contas.find((c) => c.id === id) || pag.contas.find((c) => c.origem === "fatura" && c.faturaId === f.id);
    let nova = null;
    if (!existente) {
      nova = {
        nome: `Fatura ${cartao ? cartao.nome : "cartão"}`,
        valor: total,
        // Sem vencimento lido do PDF: a conta fica no mês da fatura com "vencimento a confirmar".
        vencimento: f.vencimento || ultimoDiaDoMes(f.mes),
        vencimentoAConfirmar: !f.vencimento,
        ...(f.vencimento ? {} : { mesReferencia: f.mes }),
        status: "pendente",
        pagoEm: null,
        origem: "fatura",
        tipo: "variavel",
        categoria: "Cartão",
        faturaId: f.id,
        valorFatura: total,
        valorEditado: false,
      };
    } else if (Math.abs((Number(existente.valorFatura) || 0) - total) > 0.004) {
      const { id: _id, ...dados } = existente;
      // Valor editado à mão ou conta já paga: o valor da conta fica; só o valor importado muda.
      const manter = existente.valorEditado || existente.status === "pago";
      nova = { ...dados, valorFatura: total, valor: manter ? existente.valor : total, valorEditado: !!existente.valorEditado || (manter && Math.abs((Number(existente.valor) || 0) - total) > 0.004) };
    }
    if (!nova) continue;
    const contaId = existente ? existente.id : id;
    sincronizando.add(id);
    try {
      await pag.armazenamento.salvar(contaId, nova);
      // Histórico só depois que a conta foi gravada de fato.
      if (typeof registrarEventoConta === "function") {
        await registrarEventoConta(existente
          ? { contaId, faturaId: f.id, evento: "edicao", origem: "sincronizacao_fatura", ...diferencaConta(existente, nova), detalhe: "O valor da fatura mudou (reimportação ou correção de lançamentos)." }
          : { contaId, faturaId: f.id, evento: "importacao", origem: "sincronizacao_fatura", depois: recorteConta(nova), detalhe: "Conta criada a partir da fatura importada." });
      }
    } catch (e) {
      console.error(e);
    } finally { sincronizando.delete(id); }
  }

  // V2-08: nenhuma conta é excluída nem fundida por inferência. Uma conta cuja fatura não
  // aparece (fatura excluída, consulta parcial ou falha) continua como está: valor, status e
  // pagamento preservados. Só a pessoa pode excluí-la, pelo Controle de pagamentos.
}

async function marcarFaturaSemConta(faturaId) {
  const f = fat.faturas.find((x) => x.id === faturaId);
  if (!f || !fat.armFaturas) return;
  const { id, ...dados } = f;
  try { await fat.armFaturas.salvar(id, { ...dados, semConta: true }); } catch {}
}

/* ---------- Início ---------- */

async function iniciarFaturas() {
  const entrada = document.getElementById("pdf-arquivo");
  const soltar = document.getElementById("soltar");
  entrada.addEventListener("change", () => processarArquivo(entrada.files[0]));
  ["dragenter", "dragover"].forEach((ev) => soltar.addEventListener(ev, (e) => { e.preventDefault(); soltar.classList.add("arrastando"); }));
  ["dragleave", "drop"].forEach((ev) => soltar.addEventListener(ev, () => soltar.classList.remove("arrastando")));
  soltar.addEventListener("drop", (e) => { e.preventDefault(); processarArquivo(e.dataTransfer.files[0]); });

  document.getElementById("senha-pdf").addEventListener("submit", (e) => {
    e.preventDefault();
    processarArquivo(fat.arquivo, document.getElementById("pdf-senha").value);
  });
  const previa = document.getElementById("previa");
  previa.addEventListener("submit", salvarImportacao);
  previa.elements.cartao.addEventListener("change", atualizarPrevia);
  previa.elements.revisado.addEventListener("change", atualizarPrevia);
  previa.elements.substituir.addEventListener("change", atualizarPrevia);
  previa.elements.novo.addEventListener("input", atualizarPrevia);
  previa.elements.final.addEventListener("input", atualizarPrevia);
  previa.addEventListener("change", (e) => { if (e.target.name === "destinoConta") atualizarPrevia(); });
  previa.elements.mes.addEventListener("change", atualizarPrevia);
  previa.elements.total.addEventListener("input", atualizarPrevia);
  previa.elements.vencimento.addEventListener("change", () => {
    if (fat.leitura) fat.leitura.vencimentoEscolhido = previa.elements.vencimento.value;
    if (previa.elements.vencimento.value) previa.elements.mes.value = previa.elements.vencimento.value.slice(0, 7);
    atualizarPrevia();
  });
  document.getElementById("previa-cancelar").addEventListener("click", cancelarImportacao);
  document.getElementById("previa-claude").addEventListener("click", lerComClaude);
  document.getElementById("copiar-diagnostico").addEventListener("click", copiarDiagnostico);

  document.getElementById("filtro-cartao").addEventListener("change", (e) => {
    fat.filtroCartao = e.target.value;
    fat.filtroMes = "";
    fat.todosOsMeses = false;
    renderizarFaturas();
  });
  document.getElementById("filtro-mes").addEventListener("change", (e) => {
    fat.filtroMes = e.target.value === "todos" ? "" : e.target.value;
    // "" com mais de um mês = todos os meses; renderizarFiltros não deve trocar de volta
    fat.todosOsMeses = e.target.value === "todos";
    renderizarFaturas();
  });
  document.getElementById("baixar-planilha").addEventListener("click", baixarPlanilha);
  document.querySelectorAll(".segmentado .seg").forEach((b) => b.addEventListener("click", () => {
    fat.filtroTipo = b.dataset.tipo;
    renderizarPlanilha();
  }));
  const excluir = document.getElementById("excluir-fatura");
  excluir.addEventListener("click", async () => {
    if (excluir.dataset.confirmar !== "sim") {
      excluir.dataset.confirmar = "sim";
      excluir.textContent = "Confirmar exclusão";
      excluir.classList.add("perigo");
      return;
    }
    const [f] = faturasSelecionadas();
    excluir.disabled = true;
    try { await fat.armFaturas.excluir(f.id); fat.filtroMes = ""; }
    catch { avisoLeitura("Não foi possível excluir a fatura. Tente de novo."); }
    finally {
      excluir.disabled = false;
      excluir.dataset.confirmar = "";
      excluir.textContent = "Excluir fatura";
      excluir.classList.remove("perigo");
    }
  });

  aoMudarMes(() => {
    fat.filtroMes = mesRef;
    fat.todosOsMeses = false;
    renderizarFaturas();
  });
  renderizarFaturas();
  fat.armCartoes = await abrirArmazenamento("cartoes", []);
  fat.armFaturas = await abrirArmazenamento("faturas", []);
  fat.armCartoes.observar((lista) => { fat.cartoes = lista; fat.cartoesCarregados = true; renderizarFaturas(); sincronizarContasDasFaturas(); },
    () => avisoLeitura("Não foi possível carregar os cartões. Recarregue a página."));
  fat.armFaturas.observar((lista) => { fat.faturas = lista; fat.faturasCarregadas = true; renderizarFaturas(); sincronizarContasDasFaturas(); },
    () => avisoLeitura("Não foi possível carregar as faturas. Recarregue a página."));
}

iniciarFaturas();

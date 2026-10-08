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
  ["Assinaturas", ["netflix", "spotify", "prime video", "amazonprime", "disney", "hbo", "max.com", "youtube", "apple.com", "icloud", "google one", "google storage", "deezer", "globoplay", "paramount", "chatgpt", "openai", "claude", "anthropic", "crunchyroll", "microsoft", "adobe", "canva"]],
  ["Alimentação", ["ifood", "i food", "restaurante", "lanchonete", "padaria", "burger", "mcdonald", "mc donald", "bk ", "pizza", "rappi", "bar ", "cafe", "subway", "outback", "starbucks", "sushi", "churrasc", "acai", "lanches", "food", "giraffas", "habib", "spoleto", "coco bambu", "ze delivery"]],
  ["Mercado", ["supermerc", "mercado ", "carrefour", "assai", "atacad", "pao de acucar", "extra ", "hortifruti", "sams club", "big ", "makro", "oba ", "st marche", "dia brasil", "zaffari", "savegnago", "mercadinho", "sacolao"]],
  ["Transporte", ["uber", "99app", "99 app", "99pop", "99 ", "cabify", "posto", "shell", "ipiranga", "petrobras", "br mania", "combust", "estacion", "sem parar", "semparar", "veloe", "conectcar", "metro", "bilhete", "onibus", "pedagio", "zul ", "estapar"]],
  ["Saúde", ["farmacia", "drogaria", "droga raia", "drogasil", "pague menos", "panvel", "hospital", "clinica", "laborator", "unimed", "amil", "odonto", "dentist", "medic", "smart fit", "smartfit", "academia", "bluefit", "gympass", "wellhub"]],
  ["Compras", ["amazon", "mercadolivre", "mercado livre", "mercadopago*", "shopee", "aliexpress", "magalu", "magazine", "americanas", "shein", "renner", "riachuelo", "c&a", "cea ", "zara", "centauro", "netshoes", "kabum", "submarino", "casas bahia", "ponto frio", "fast shop", "decathlon", "nike", "adidas", "temu", "boticario", "natura", "sephora"]],
  ["Casa", ["leroy", "telhanorte", "tok&stok", "tok stok", "camicado", "madeiramadeira", "mobly", "etna", "c&c", "obramax"]],
  ["Lazer", ["cinema", "cinemark", "ingresso", "sympla", "eventim", "steam", "playstation", "psn", "xbox", "nintendo", "teatro", "show", "parque", "bilheteria"]],
  ["Viagem", ["hotel", "airbnb", "booking", "latam", "gol linhas", "voegol", "azul linhas", "voeazul", "decolar", "123milhas", "hurb", "pousada", "localiza", "movida", "unidas"]],
  ["Educação", ["udemy", "alura", "curso", "escola", "faculdade", "universidade", "livraria", "livros", "coursera", "duolingo"]],
  ["Serviços", ["claro", "vivo", "tim ", "oi ", "net servicos", "internet", "energia", "enel", "cemig", "light ", "copel", "sabesp", "comgas", "condominio"]],
];

const BANCOS = ["Nubank", "Itaú", "Bradesco", "Santander", "Banco Inter", "Inter", "C6 Bank", "C6", "Caixa", "Banco do Brasil", "Ourocard", "XP", "BTG", "PicPay", "Mercado Pago", "Neon", "Next", "Will Bank", "PagBank", "Porto Seguro", "Sicredi", "Sicoob", "Credicard", "Original"];

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
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const porY = new Map();
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2; // tolera pequenas diferenças de altura
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y).push({ x: it.transform[4], w: it.width || 0, t: it.str });
    }
    [...porY.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, partes]) => {
        partes.sort((a, b) => a.x - b.x);
        let texto = "";
        let fim = -Infinity;
        for (const p of partes) {
          const espaco = p.x - fim > 1.5 ? (p.x - fim > 40 ? "   " : " ") : "";
          texto += (texto ? espaco : "") + p.t;
          fim = p.x + p.w;
        }
        linhas.push(texto.replace(/\s+$/, ""));
      });
  }
  return linhas;
}

/* ---------- Interpretação do texto ---------- */

const IGNORAR = /saldo|total|limite|pagamento (minimo|recebido|efetuado|da fatura|em\b)|pagto|pagamento\s*-|valor minimo|fatura anterior|credito rotativo|parcelamento de fatura|proxima fatura|melhor dia|vencimento|fechamento|periodo/;
// Descrições que não são compras: só "R$", ou um período do tipo "a 01 OUT".
const NAO_E_COMPRA = new RegExp(`^(r\\$\\s*[\\d.,]*|a\\s+\\d{1,2}\\s*(${NOMES_MES})[a-z]*\\.?(\\s+\\d{2,4})?|ate\\s+.*)$`);
// Prefixo do cartão virtual que alguns bancos colocam na descrição: "•••• 5636 Loja".
const PREFIXO_CARTAO = /^(?:[•*xX·.]{2,}\s*)(\d{4})\s+/;

function extrairDaFatura(linhas) {
  const texto = linhas.join("\n");
  const textoSA = semAcento(texto);

  // Banco
  const inicio = semAcento(linhas.slice(0, 60).join(" "));
  const banco = BANCOS.find((b) => inicio.includes(semAcento(b))) || BANCOS.find((b) => textoSA.includes(semAcento(b))) || "";

  // Final do cartão
  const final = (textoSA.match(/(?:final|terminado em|cartao\s*(?:n[o.]*)?\s*[x*.\d\s]{4,}?)\s*[:\-]?\s*(\d{4})\b/) ||
    texto.match(/(?:\*{2,}|x{4}|•{2,})\s?(\d{4})\b/i) || [])[1] || "";

  // Vencimento
  let venc = null;
  let m = textoSA.match(/venc[a-z]*[^0-9]{0,40}?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) venc = { d: +m[1], m: +m[2], a: +m[3] < 100 ? 2000 + +m[3] : +m[3] };
  if (!venc) {
    m = textoSA.match(new RegExp(`venc[a-z]*[^0-9]{0,40}?(\\d{1,2})\\s*(?:de\\s+)?(${NOMES_MES})[a-z]*\\.?\\s*(?:de\\s+)?(\\d{4})`));
    if (m) venc = { d: +m[1], m: MESES[m[2]], a: +m[3] };
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
  for (const linha of linhas) {
    re.lastIndex = 0;
    let r;
    while ((r = re.exec(linha))) {
      const [, dia, mes, ano, descBruta, sinal1, sinal2, valorTexto, sufixo] = r;
      let descricao = descBruta.replace(/\s{2,}/g, " ").trim();
      const prefixo = descricao.match(PREFIXO_CARTAO);
      if (prefixo) descricao = descricao.slice(prefixo[0].length);
      const dsa = semAcento(descricao);
      if (!/[a-z]{2}/.test(dsa.replace(/r\$/g, "")) || IGNORAR.test(dsa) || NAO_E_COMPRA.test(dsa)) continue;
      const data = dataISO(dia, mes, ano);
      if (!data) continue;
      const negativo = !!(sinal1 || sinal2 || (sufixo && /-|c/i.test(sufixo.trim())));
      const valor = numeroBR(valorTexto) * (negativo ? -1 : 1);
      if (!valor) continue;
      const lanc = { data, descricao, valor, categoria: categorizar(descricao, valor) };
      if (prefixo) lanc.finalCartao = prefixo[1];
      lancamentos.push(lanc);
    }
  }

  const mes = venc ? `${venc.a}-${doisDigitos(venc.m)}` : `${hoje.getFullYear()}-${doisDigitos(hoje.getMonth() + 1)}`;
  const vencimento = venc ? `${venc.a}-${doisDigitos(venc.m)}-${doisDigitos(venc.d)}` : "";
  return { banco, final, mes, vencimento, lancamentos };
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
{"banco": string, "final": string (4 últimos dígitos do cartão ou ""), "vencimento": "AAAA-MM-DD" ou "",
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
  if (real) return { valor: totalFatura(real.lancamentos || []), prevista: false };
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
};

const totalGastos = (lancs) => lancs.reduce((t, l) => t + (l.valor > 0 ? l.valor : 0), 0);
const totalFatura = (lancs) => lancs.reduce((t, l) => t + l.valor, 0);

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
      botao.setAttribute("aria-pressed", String(fat.filtroCartao === c.id));
      botao.innerHTML = `
        <div class="cartao-topo">
          <span class="cartao-nome">${escapar(c.nome)}</span>
          <span class="chip" aria-hidden="true"></span>
        </div>
        <span class="cartao-final">•••• ${escapar(c.final || "····")}</span>
        <span class="cartao-total">${ultima
          ? `${nomeDoMes(ultima.mes)}: ${moeda.format(totalFatura(ultima.lancamentos || []))}`
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

function mostrarPrevia(leitura, metodo) {
  fat.leitura = leitura;
  const form = document.getElementById("previa");
  const select = document.getElementById("previa-cartao");

  // Escolhe o cartão: mesmo final, ou mesmo nome do banco; senão, um cartão novo.
  const existente =
    fat.cartoes.find((c) => leitura.final && c.final === leitura.final) ||
    fat.cartoes.find((c) => leitura.banco && semAcento(c.nome).includes(semAcento(leitura.banco)));
  select.innerHTML =
    fat.cartoes.map((c) => `<option value="${c.id}">${escapar(c.nome)}${c.final ? " •••• " + escapar(c.final) : ""}</option>`).join("") +
    `<option value="">+ Novo cartão</option>`;
  select.value = existente ? existente.id : "";
  form.elements.novo.value = leitura.banco || "";
  form.elements.final.value = leitura.final || existente?.final || "";
  form.elements.mes.value = leitura.mes;
  form.elements.vencimento.value = leitura.vencimento || "";
  atualizarPrevia();

  const n = leitura.lancamentos.length;
  document.getElementById("previa-titulo").textContent = n
    ? `Encontrei ${n} lançamento${n === 1 ? "" : "s"}${metodo === "claude" ? " com o Claude" : ""}. Confira antes de salvar.`
    : "Não encontrei lançamentos nesse PDF.";
  form.querySelector("[type=submit]").disabled = !n;
  form.hidden = false;

  usarRecurso("sample").then((s) => {
    document.getElementById("previa-claude").hidden = !s || metodo === "claude";
  });
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function atualizarPrevia() {
  const form = document.getElementById("previa");
  const l = fat.leitura;
  if (!l) return;
  const novo = !form.elements.cartao.value;
  document.getElementById("previa-novo-rotulo").hidden = !novo;
  const gastos = totalGastos(l.lancamentos);
  const creditos = l.lancamentos.filter((x) => x.valor < 0).reduce((t, x) => t + x.valor, 0);
  const repetida = fat.faturas.find((f) => f.cartaoId && f.cartaoId === form.elements.cartao.value && f.mes === form.elements.mes.value);
  document.getElementById("previa-resumo").innerHTML = `
    ${l.banco ? `<span>Banco <strong>${escapar(l.banco)}</strong></span>` : ""}
    <span>Gastos <strong>${moeda.format(gastos)}</strong></span>
    ${creditos ? `<span>Estornos e créditos <strong>${moeda.format(creditos)}</strong></span>` : ""}
    <span>Total <strong>${moeda.format(gastos + creditos)}</strong></span>
    ${repetida ? `<span class="status atrasada">Já existe a fatura de ${nomeDoMes(repetida.mes)} deste cartão; salvar vai substituí-la.</span>` : ""}`;
}

async function salvarImportacao(evento) {
  evento.preventDefault();
  const form = evento.target;
  const l = fat.leitura;
  const mes = form.elements.mes.value;
  const final = form.elements.final.value.replace(/\D/g, "").slice(-4);
  let cartaoId = form.elements.cartao.value;
  if (!mes) return avisoLeitura("Informe o mês da fatura.");
  if (!cartaoId && !form.elements.novo.value.trim()) return avisoLeitura("Dê um nome para o novo cartão.");

  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    if (!cartaoId) {
      cartaoId = await fat.armCartoes.salvar(null, { nome: form.elements.novo.value.trim(), final });
    } else {
      const cartao = fat.cartoes.find((c) => c.id === cartaoId);
      if (final && cartao && cartao.final !== final) {
        await fat.armCartoes.salvar(cartaoId, { nome: cartao.nome, final });
      }
    }
    const repetida = fat.faturas.find((f) => f.cartaoId === cartaoId && f.mes === mes);
    await fat.armFaturas.salvar(repetida ? repetida.id : null, {
      cartaoId,
      mes,
      vencimento: form.elements.vencimento.value || `${mes}-10`,
      arquivo: fat.arquivo ? fat.arquivo.name : "",
      importadoEm: new Date().toISOString(),
      lancamentos: l.lancamentos,
    });
    fat.filtroCartao = cartaoId;
    fat.filtroMes = mes;
    fat.todosOsMeses = false;
    definirMes(mes); // a timeline vai para o mês da fatura importada
    cancelarImportacao();
    estadoLeitura(`Fatura de ${nomeDoMes(mes)} salva.`);
    renderizarFaturas();
  } catch {
    avisoLeitura("Não foi possível salvar a fatura. Verifique sua conexão e tente de novo.");
  } finally {
    botao.disabled = false;
  }
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

function renderizarPlanilha() {
  const faturas = faturasSelecionadas();
  const vazia = !faturas.length;
  const cartao = fat.cartoes.find((c) => c.id === fat.filtroCartao);
  document.getElementById("planilha-vazia").textContent = cartao
    ? `Nenhuma fatura de ${cartao.nome} em ${nomeDoMes(fat.filtroMes || mesRef)}. Escolha outro mês na timeline ou importe a fatura abaixo.`
    : "Nenhuma fatura importada ainda. Importe o PDF de uma fatura acima.";
  document.getElementById("planilha-vazia").hidden = !vazia;
  document.getElementById("planilha-conteudo").hidden = vazia;
  document.getElementById("excluir-fatura").hidden = faturas.length !== 1;
  if (vazia) return;

  const linhas = faturas
    .flatMap((f) => (f.lancamentos || []).map((l, i) => ({ ...l, fatura: f, indice: i })))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const corpo = document.querySelector("#planilha tbody");
  corpo.innerHTML = "";
  linhas.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="data">${dataBR(l.data)}</td>
      <td class="conta">${escapar(l.descricao)}</td>
      <td class="data">${(() => {
        const p = lerParcela(l.descricao);
        if (!p) return "—";
        const fim = somarMeses(l.fatura.mes, p.total - p.atual);
        return `${p.atual}/${p.total} <span class="sub">${p.atual === p.total ? "última" : "até " + mesCurto(fim)}</span>`;
      })()}</td>
      <td><select aria-label="Categoria de ${escapar(l.descricao)}">${CATEGORIAS.map((c) => `<option${c === l.categoria ? " selected" : ""}>${c}</option>`).join("")}</select></td>
      <td class="num${l.valor < 0 ? " credito" : ""}">${moeda.format(l.valor)}</td>
      <td><div class="acoes-linha"><button type="button" class="botao mini" aria-label="Remover ${escapar(l.descricao)}">Remover</button></div></td>`;
    tr.querySelector("select").addEventListener("change", (e) => atualizarLancamento(l.fatura, l.indice, { categoria: e.target.value }));
    const rem = tr.querySelector("button");
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
    corpo.appendChild(tr);
  });

  const total = totalFatura(linhas);
  document.querySelector("#planilha tfoot").innerHTML = `
    <tr><td></td><td>${linhas.length} lançamento${linhas.length === 1 ? "" : "s"}</td><td></td><td>Total</td>
    <td class="num">${moeda.format(total)}</td><td></td></tr>`;
}

function renderizarRelatorio() {
  const faturas = faturasSelecionadas();
  const lancs = faturas.flatMap((f) => f.lancamentos || []).filter((l) => l.valor > 0 && l.categoria !== CREDITO);
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
  const total = totalGastos(lancs);
  const ordenadas = [...porCategoria.entries()].sort((a, b) => b[1].valor - a[1].valor);
  const maior = ordenadas[0][1].valor;

  ordenadas.forEach(([categoria, { valor, qtd }]) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="cat-nome">${categoria} <span class="cat-qtd">· ${qtd} lançamento${qtd === 1 ? "" : "s"}</span></span>
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
  renderizarParcelamentos();
  renderizarPrevisao();
  if (typeof renderizarGrafico === "function") renderizarGrafico();
  renderizarPlanilha();
  renderizarRelatorio();
  if (fat.leitura) atualizarPrevia();
}

/* ---------- Compras parceladas e previsão ---------- */

function renderizarParcelamentos() {
  const nomeCartao = (id) => fat.cartoes.find((c) => c.id === id)?.nome || "Cartão";
  const lista = fat.cartoes
    .flatMap((c) => parcelamentosNoMes(c.id, mesRef))
    .sort((a, b) => a.fim.localeCompare(b.fim) || b.valor - a.valor);

  document.getElementById("parcelamentos-mes").textContent = nomeMesRef();
  document.getElementById("parcelamentos-vazio").hidden = lista.length > 0;
  document.getElementById("parcelamentos-tabela-area").hidden = !lista.length;

  const porMes = lista.reduce((t, p) => t + p.valor, 0);
  const restante = lista.reduce((t, p) => t + p.valorRestante, 0);
  const acabando = lista.filter((p) => p.restantes <= 2).length;
  document.getElementById("parcelamentos-resumo").innerHTML = lista.length ? `
    <span>${lista.length} parcelamento${lista.length === 1 ? "" : "s"}</span>
    <span>Por mês <strong>${moeda.format(porMes)}</strong></span>
    <span>Ainda falta <strong>${moeda.format(restante)}</strong></span>
    ${acabando ? `<span class="status pago">${acabando} terminando em até 2 meses</span>` : ""}` : "";

  const corpo = document.getElementById("parcelamentos-corpo");
  corpo.innerHTML = "";
  lista.forEach((p) => {
    const situacao = p.restantes === 0
      ? `<span class="status pago">última parcela</span>`
      : p.restantes <= 2
        ? `<span class="status pendente acabando">falta${p.restantes === 1 ? "" : "m"} ${p.restantes}</span>`
        : `<span class="sub">faltam ${p.restantes}</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="conta">${escapar(p.descricao)}</td>
      <td>${escapar(nomeCartao(p.cartaoId))}</td>
      <td class="parcela-celula">
        <span class="parcela-num">${p.atual}/${p.total}</span>
        <div class="barra mini-barra" role="progressbar" aria-label="Parcela ${p.atual} de ${p.total}"><div class="preenchimento"></div></div>
      </td>
      <td class="num">${moeda.format(p.valor)}</td>
      <td class="num">${moeda.format(p.valorRestante)}</td>
      <td class="data">${mesCurto(p.fim)} ${situacao}</td>`;
    corpo.appendChild(tr);
    preencherBarra(tr.querySelector(".barra"), p.atual / p.total);
  });
}

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
    ["Data", "Descrição", "Categoria", "Valor", "Fatura"].map(celula).join(";"),
    ...linhas.map((l) => [dataBR(l.data), l.descricao, l.categoria, valorBR(l.valor), nomeDoMes(l.mes)].map(celula).join(";")),
    ["", "", "Total", valorBR(totalFatura(linhas)), ""].map(celula).join(";"),
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
    const total = Math.round(totalFatura(f.lancamentos || []) * 100) / 100;
    const existente = pag.contas.find((c) => c.id === id);
    let nova = null;
    if (!existente) {
      nova = {
        nome: `Fatura ${cartao ? cartao.nome : "cartão"}`,
        valor: total,
        vencimento: f.vencimento || `${f.mes}-10`,
        status: "pendente",
        pagoEm: null,
        origem: "fatura",
        faturaId: f.id,
        valorFatura: total,
        valorEditado: false,
      };
    } else if (Math.abs((Number(existente.valorFatura) || 0) - total) > 0.004) {
      const { id: _id, ...dados } = existente;
      nova = { ...dados, valorFatura: total, valor: existente.valorEditado ? existente.valor : total };
    }
    if (!nova) continue;
    sincronizando.add(id);
    try { await pag.armazenamento.salvar(id, nova); } catch {}
    finally { sincronizando.delete(id); }
  }

  // Fatura excluída: some a conta dela, a não ser que já tenha sido paga (fica no histórico).
  for (const c of pag.contas) {
    if (c.origem !== "fatura" || c.status === "pago" || sincronizando.has(c.id)) continue;
    if (fat.faturas.some((f) => f.id === c.faturaId)) continue;
    sincronizando.add(c.id);
    try { await pag.armazenamento.excluir(c.id); } catch {}
    finally { sincronizando.delete(c.id); }
  }
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
  previa.elements.mes.addEventListener("change", atualizarPrevia);
  previa.elements.vencimento.addEventListener("change", () => {
    if (previa.elements.vencimento.value) previa.elements.mes.value = previa.elements.vencimento.value.slice(0, 7);
    atualizarPrevia();
  });
  document.getElementById("previa-cancelar").addEventListener("click", cancelarImportacao);
  document.getElementById("previa-claude").addEventListener("click", lerComClaude);

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

/* ---------- Marcas, logos e mascote (só apresentação) ----------
 * Selos PROVISÓRIOS: cor da marca + sigla, desenhados aqui (nenhuma imagem de terceiros no repositório).
 * Para trocar por um logo oficial depois, basta preencher `logo` com o caminho do PNG/SVG
 * (ex.: "icones/marcas/nubank.png", incluído no build) — nenhum outro código muda.
 *
 * A busca é por trecho do nome, sem acento e sem diferenciar maiúsculas, na ORDEM da lista:
 * por isso "Itaú Black" vem antes de "Itaú".
 */

// Bancos e cartões (Controle de pagamentos e Faturas).
const BILL_BRAND_MAP = [
  { chaves: ["mercado pago", "mercadopago"], nome: "Mercado Pago", cor: "#00AFEE", texto: "#062a40", sigla: "MP", logo: "" },
  { chaves: ["santander"], nome: "Santander", cor: "#EC0000", texto: "#ffffff", sigla: "S", logo: "" },
  { chaves: ["itau black", "itaublack"], nome: "Itaú Black", cor: "#161616", texto: "#FF7A1A", sigla: "IB", logo: "", escuro: true },
  { chaves: ["itau"], nome: "Itaú", cor: "#FF6200", texto: "#0b1f66", sigla: "itaú", logo: "" },
  { chaves: ["nubank", "nu pagamentos"], nome: "Nubank", cor: "#8A05BE", texto: "#ffffff", sigla: "nu", logo: "" },
  { chaves: ["bradesco", "bradescard"], nome: "Bradesco", cor: "#CC092F", texto: "#ffffff", sigla: "B", logo: "" },
  { chaves: ["c&a", "c & a", "cea pay", "c e a"], nome: "C&A", cor: "#1d3f8f", texto: "#ffffff", sigla: "C&A", logo: "" },
  { chaves: ["inter"], nome: "Inter", cor: "#FF7A00", texto: "#1a1a1a", sigla: "in", logo: "" },
  { chaves: ["c6"], nome: "C6 Bank", cor: "#242424", texto: "#ffffff", sigla: "C6", logo: "", escuro: true },
  { chaves: ["caixa"], nome: "CAIXA", cor: "#005CA9", texto: "#ffffff", sigla: "CX", logo: "" },
  { chaves: ["banco do brasil", "bb "], nome: "Banco do Brasil", cor: "#FCE80A", texto: "#0038a8", sigla: "BB", logo: "" },
];

// Instituições das contas da Stefanini (selo provisório; mesmo mecanismo do mapa dos bancos).
const STF_LOGO_MAP = [
  { chaves: ["anatel"], nome: "ANATEL", cor: "#0b4f8a", texto: "#ffffff", sigla: "AN", logo: "" },
  { chaves: ["anm", "agencia nacional de mineracao"], nome: "ANM", cor: "#1f6b3a", texto: "#ffffff", sigla: "ANM", logo: "" },
  { chaves: ["banco do brasil"], nome: "Banco do Brasil", cor: "#FCE80A", texto: "#0038a8", sigla: "BB", logo: "" },
  { chaves: ["caixa"], nome: "CAIXA", cor: "#005CA9", texto: "#ffffff", sigla: "CX", logo: "" },
];

// Logos dos clientes do SHARK: nome do cliente (sem acento, minúsculo) → caminho do PNG oficial.
// Vazio = aperto de mãos (provisório) na cor do cliente. Ex.: { "kmkzy": "icones/clientes/kmkzy.png" }
const CLIENT_LOGO_MAP = {};

const normalizarMarca = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Marca pelo nome (ou null). Trecho com espaço/letras: casa como palavra, para "inter" não pegar "internet". */
function marcaDe(nome, mapa = BILL_BRAND_MAP) {
  const alvo = ` ${normalizarMarca(nome).replace(/[^a-z0-9&]+/g, " ").trim()} `;
  return mapa.find((m) => m.chaves.some((k) => alvo.includes(` ${normalizarMarca(k).replace(/[^a-z0-9&]+/g, " ").trim()} `))) || null;
}

/* Selo da marca: logo oficial se houver; senão, quadradinho com a cor e a sigla; sem marca, a inicial.
 * Decorativo (aria-hidden): o nome da conta/cartão continua escrito ao lado. */
function seloMarca(nome, { mapa = BILL_BRAND_MAP, classe = "" } = {}) {
  const m = marcaDe(nome, mapa);
  const titulo = escapar(m ? m.nome : nome || "");
  if (m?.logo) return `<span class="selo-marca com-logo ${classe}" title="${titulo}"><img src="${escapar(m.logo)}" alt="" loading="lazy"></span>`;
  if (!m) {
    const inicial = escapar((String(nome || "?").trim()[0] || "?").toUpperCase());
    return `<span class="selo-marca neutro ${classe}" data-sigla="${inicial}" aria-hidden="true"></span>`;
  }
  // A sigla vai em data-sigla (desenhada pelo CSS): o texto da linha continua só o nome.
  return `<span class="selo-marca ${classe}" style="--marca:${m.cor};--marca-texto:${m.texto}" title="${titulo}" data-sigla="${escapar(m.sigla)}" aria-hidden="true"></span>`;
}

/* Mesmo selo, mas como atributos do próprio elemento do nome (desenhado em ::before pelo CSS):
 * o texto do elemento continua sendo só o nome. Usado na linha do Controle de pagamentos. */
function atributosSelo(nome, mapa = BILL_BRAND_MAP) {
  const m = marcaDe(nome, mapa);
  if (!m) return ` data-selo="neutro" data-sigla="${escapar((String(nome || "?").trim()[0] || "?").toUpperCase())}"`;
  if (m.logo) return ` data-selo="logo" title="${escapar(m.nome)}" style="--marca-logo:url('${escapar(m.logo)}')"`;
  return ` data-selo="marca" title="${escapar(m.nome)}" data-sigla="${escapar(m.sigla)}" style="--marca:${m.cor};--marca-texto:${m.texto}"`;
}

/* Logo do cliente do SHARK: PNG oficial (CLIENT_LOGO_MAP) ou aperto de mãos na cor do cliente. */
function logoCliente(cliente, cor) {
  const logo = CLIENT_LOGO_MAP[normalizarMarca(cliente?.nome).trim()];
  if (logo) return `<span class="logo-cliente com-logo"><img src="${escapar(logo)}" alt="" loading="lazy"></span>`;
  return `<span class="logo-cliente" style="--cor:${cor}" data-logo="🤝" aria-hidden="true"></span>`;
}

/* Avatar com as iniciais (contatos). */
function avatarIniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const ini = ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
  let h = 0;
  for (const ch of normalizarMarca(nome)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar" style="--matiz:${h}" data-iniciais="${escapar(ini)}" aria-hidden="true"></span>`;
}

/* Robozinho da Visão geral: SVG desenhado aqui; acena ao abrir e flutua de leve (CSS). */
const MASCOTE_SVG = `
<svg class="mascote" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <ellipse class="mascote-sombra" cx="60" cy="112" rx="26" ry="4"/>
  <g class="mascote-corpo">
    <line x1="60" y1="20" x2="60" y2="10" class="mascote-traco"/>
    <circle cx="60" cy="8" r="5" class="mascote-antena"/>
    <rect x="28" y="20" width="64" height="48" rx="18" class="mascote-cabeca"/>
    <rect x="36" y="29" width="48" height="30" rx="12" class="mascote-tela"/>
    <g class="mascote-olhos">
      <rect x="46" y="37" width="7" height="10" rx="3.5"/>
      <rect x="67" y="37" width="7" height="10" rx="3.5"/>
    </g>
    <path d="M51 51 q9 6 18 0" class="mascote-sorriso"/>
    <circle cx="42" cy="50" r="2.6" class="mascote-bochecha"/>
    <circle cx="78" cy="50" r="2.6" class="mascote-bochecha"/>
    <rect x="40" y="70" width="40" height="30" rx="11" class="mascote-cabeca"/>
    <circle cx="60" cy="84" r="5" class="mascote-coracao"/>
    <rect x="25" y="74" width="12" height="22" rx="6" class="mascote-braco"/>
    <g class="mascote-aceno">
      <rect x="83" y="56" width="12" height="24" rx="6" class="mascote-braco"/>
      <circle cx="89" cy="54" r="7" class="mascote-mao"/>
    </g>
  </g>
</svg>`;

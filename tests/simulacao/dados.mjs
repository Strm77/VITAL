/*
 * Cenário de simulação: 5 cartões de bancos diferentes (cada um com o layout de PDF
 * do seu banco) e 13 contas no controle de pagamentos. "Hoje" = 08/10/2026.
 * Todos os nomes terminam com "(simulação)" ou são genéricos: nada aqui é dado real.
 */

// p = [parcela atual, total] — vira o texto de parcela no formato de cada banco.
export const CARTOES = [
  {
    nome: "Nubank (simulação)",
    final: "1111",
    banco: "nubank",
    vencimento: "2026-10-15",
    lancamentos: [
      { data: "2026-09-02", desc: "iFood *Restaurante Central", valor: 58.9 },
      { data: "2026-09-03", desc: "Uber *Trip", valor: 24.6 },
      { data: "2026-09-05", desc: "Mercado Livre", valor: 89.9, p: [5, 10] },
      { data: "2026-09-06", desc: "Smart Fit", valor: 129.9 },
      { data: "2026-09-08", desc: "Loja de Brinquedos", valor: 49.75, p: [3, 4] },
      { data: "2026-09-10", desc: "Netflix.com", valor: 55.9 },
      { data: "2026-09-12", desc: "Clinica Odonto Sorriso", valor: 150, p: [6, 6] },
      { data: "2026-09-15", desc: "Amazon Marketplace", valor: 120, p: [2, 3] },
      { data: "2026-09-20", desc: "Estorno Amazon", valor: -35.5 },
      { data: "2026-09-25", desc: "Padaria Pao Quente", valor: 18.4 },
    ],
  },
  {
    nome: "Itaú (simulação)",
    final: "2222",
    banco: "itau",
    vencimento: "2026-10-10",
    lancamentos: [
      { data: "2026-09-04", desc: "SUPERMERCADO EXTRA", valor: 412.35 },
      { data: "2026-09-05", desc: "POSTO SHELL", valor: 200 },
      { data: "2026-09-07", desc: "MAGALU", valor: 199.9, p: [3, 10] },
      { data: "2026-09-09", desc: "SPOTIFY", valor: 21.9 },
      { data: "2026-09-11", desc: "CASAS BAHIA", valor: 310, p: [9, 10] },
      { data: "2026-09-14", desc: "RESTAURANTE BOM PRATO", valor: 87 },
      { data: "2026-09-18", desc: "DROGA RAIA", valor: 64.2 },
      { data: "2026-09-22", desc: "IOF COMPRA INTERNACIONAL", valor: 3.45 },
    ],
  },
  {
    nome: "Bradesco (simulação)",
    final: "3333",
    banco: "bradesco",
    vencimento: "2026-10-12",
    // O PDF informa um total maior que a soma dos lançamentos (ex.: juros não detalhados).
    naoDetalhado: 35,
    lancamentos: [
      { data: "2026-09-01", desc: "ANUIDADE DIFERENCIADA", valor: 29.1, p: [5, 12] },
      { data: "2026-09-03", desc: "RENNER", valor: 89.9, p: [2, 5] },
      { data: "2026-09-06", desc: "LEROY MERLIN", valor: 245.6, p: [1, 8] },
      { data: "2026-09-10", desc: "CINEMARK", valor: 64 },
      { data: "2026-09-16", desc: "PADARIA REAL", valor: 32.5 },
      { data: "2026-09-21", desc: "CENTAURO", valor: 159.9, p: [4, 4] },
      { data: "2026-09-23", desc: "AMAZON PRIME CANAIS", valor: 29.9 },
    ],
  },
  {
    nome: "Inter (simulação)",
    final: "4444",
    banco: "inter",
    vencimento: "2026-10-20",
    lancamentos: [
      { data: "2026-09-02", desc: "AIRBNB", valor: 380, p: [3, 6] },
      { data: "2026-09-05", desc: "LATAM AIRLINES", valor: 412.5, p: [2, 12] },
      { data: "2026-09-09", desc: "UDEMY", valor: 27.9 },
      { data: "2026-09-13", desc: "ZE DELIVERY", valor: 96.4 },
      { data: "2026-09-15", desc: "PLAYSTATION NETWORK", valor: 34.9 },
      { data: "2026-09-19", desc: "ESTORNO LOJA ONLINE", valor: -50 },
      { data: "2026-09-24", desc: "KABUM", valor: 133.25, p: [7, 10] },
    ],
  },
  {
    nome: "C6 (simulação)",
    final: "5555",
    banco: "c6",
    vencimento: "2026-10-25",
    lancamentos: [
      { data: "2026-09-03", desc: "Apple.com Bill", valor: 49.9 },
      { data: "2026-09-08", desc: "Tok Stok", valor: 520, p: [11, 12] },
      { data: "2026-09-12", desc: "Sushi Bar Tokyo", valor: 142.8 },
      { data: "2026-09-17", desc: "Sympla Ingressos", valor: 90, p: [1, 3] },
      { data: "2026-09-26", desc: "Carrefour", valor: 268.7 },
    ],
  },
];

// Contas do controle de pagamentos. pagar = clicar em "Marcar como paga" no teste.
export const CONTAS = [
  { nome: "Aluguel (simulação)", valor: 1800, vencimento: "2026-10-05", pagar: true },
  { nome: "Condomínio (simulação)", valor: 650, vencimento: "2026-10-05", pagar: true },
  { nome: "Academia (simulação)", valor: 99.9, vencimento: "2026-10-03", pagar: true },
  { nome: "Água (simulação)", valor: 95.3, vencimento: "2026-10-06" },          // atrasada
  { nome: "IPTU 9/10 (simulação)", valor: 145, vencimento: "2026-10-07" },      // atrasada
  { nome: "Plano de saúde (simulação)", valor: 480, vencimento: "2026-10-10" }, // a vencer
  { nome: "Energia (simulação)", valor: 212.4, vencimento: "2026-10-12" },
  { nome: "Internet (simulação)", valor: 119.9, vencimento: "2026-10-15" },
  { nome: "Celular (simulação)", valor: 59.9, vencimento: "2026-10-18" },
  { nome: "Streaming (simulação)", valor: 55.9, vencimento: "2026-10-20" },
  { nome: "Seguro do carro (simulação)", valor: 230, vencimento: "2026-10-25" },
  { nome: "Curso de inglês (simulação)", valor: 380, vencimento: "2026-10-28" },
  { nome: "Aluguel nov (simulação)", valor: 1800, vencimento: "2026-11-05" },   // mês seguinte
];

/* ---- Valores esperados, calculados aqui de forma independente do painel ---- */

export const somaLancamentos = (c) => c.lancamentos.reduce((t, l) => t + l.valor, 0);
// Valor oficial da fatura (o que o banco cobra).
export const totalFatura = (c) => somaLancamentos(c) + (c.naoDetalhado || 0);
export const parcelados = (c) => c.lancamentos.filter((l) => l.p);
// Fatura prevista do cartão daqui a n meses (só parcelas que ainda existem).
export const previsto = (c, n) => parcelados(c).filter((l) => l.p[0] + n <= l.p[1]).reduce((t, l) => t + l.valor, 0);

// Assinaturas que a aba Assinaturas deve encontrar na simulação.
export const ASSINATURAS = [
  ["Netflix", "Nubank (simulação)", 55.9],
  ["Spotify", "Itaú (simulação)", 21.9],
  ["Prime Video", "Bradesco (simulação)", 29.9],
  ["PlayStation Plus", "Inter (simulação)", 34.9],
  ["Apple (App Store / iCloud)", "C6 (simulação)", 49.9],
];

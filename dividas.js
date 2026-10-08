/*
 * V.I.T.A.L — Financeiro
 * ----------------------
 * Dívidas iniciais, usadas só na primeira vez que o painel é aberto.
 * Depois disso, adicione, edite e exclua pelo próprio painel: os dados ficam
 * salvos no navegador (localStorage).
 *
 *   nome            Nome da dívida
 *   valorParcela    Valor de cada parcela (em reais)
 *   totalParcelas   Quantidade total de parcelas
 *   primeiraParcela Mês do 1º vencimento, no formato "AAAA-MM"
 *   diaVencimento   Dia do mês em que a parcela vence
 *   parcelasPagas   (opcional) Informe manualmente quantas já pagou.
 *                   Se omitido, o painel considera paga toda parcela já vencida.
 *
 * Os valores abaixo são EXEMPLOS — substitua pelos seus.
 */
const DIVIDAS = [
  {
    nome: "Cartão de crédito (exemplo)",
    valorParcela: 450.0,
    totalParcelas: 10,
    primeiraParcela: "2026-05",
    diaVencimento: 10,
  },
  {
    nome: "Financiamento do carro (exemplo)",
    valorParcela: 1280.5,
    totalParcelas: 48,
    primeiraParcela: "2024-02",
    diaVencimento: 5,
  },
  {
    nome: "Empréstimo pessoal (exemplo)",
    valorParcela: 320.0,
    totalParcelas: 24,
    primeiraParcela: "2025-11",
    diaVencimento: 20,
  },
];

/*
 * Exemplos iniciais da torre (ganhos, gastos e investimentos).
 * Também só valem na primeira abertura; depois, use o próprio painel.
 *
 *   recorrente  true = entra todo mês (salário, aluguel)
 *               false = só no mês informado em "mes" ("AAAA-MM")
 */
const MES_ATUAL = new Date().toISOString().slice(0, 7);

const GANHOS = [
  { nome: "Salário (exemplo)", valor: 5500, recorrente: true, mes: MES_ATUAL },
  { nome: "Freela (exemplo)", valor: 800, recorrente: false, mes: MES_ATUAL },
];

const GASTOS = [
  { nome: "Aluguel (exemplo)", valor: 1400, recorrente: true, mes: MES_ATUAL },
  { nome: "Mercado (exemplo)", valor: 900, recorrente: true, mes: MES_ATUAL },
  { nome: "Lazer (exemplo)", valor: 250, recorrente: false, mes: MES_ATUAL },
];

const INVESTIMENTOS = [
  { nome: "Reserva de emergência (exemplo)", valorAplicado: 8000, valorAtual: 8640, meta: 15000 },
  { nome: "Tesouro IPCA+ (exemplo)", valorAplicado: 3000, valorAtual: 3210 },
];

/*
 * Exemplos iniciais do controle de pagamentos.
 *   status  "pendente" ou "pago"
 *   pagoEm  preenchido sozinho quando a conta é marcada como paga
 */
const PAGAMENTOS = [
  { nome: "Internet (exemplo)", valor: 120, vencimento: MES_ATUAL + "-05", status: "pago", pagoEm: MES_ATUAL + "-04T19:20:00" },
  { nome: "Água (exemplo)", valor: 85.4, vencimento: MES_ATUAL + "-06", status: "pendente", pagoEm: null },
  { nome: "Conta de luz (exemplo)", valor: 182.9, vencimento: MES_ATUAL + "-15", status: "pendente", pagoEm: null },
  { nome: "Celular (exemplo)", valor: 59.9, vencimento: MES_ATUAL + "-20", status: "pendente", pagoEm: null },
];

/*
 * V.I.T.A.L — Financeiro
 * ----------------------
 * Edite esta lista com as suas dívidas. Tudo no painel é calculado a partir daqui.
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
    nome: "Cartão de crédito",
    valorParcela: 450.0,
    totalParcelas: 10,
    primeiraParcela: "2026-05",
    diaVencimento: 10,
  },
  {
    nome: "Financiamento do carro",
    valorParcela: 1280.5,
    totalParcelas: 48,
    primeiraParcela: "2024-02",
    diaVencimento: 5,
  },
  {
    nome: "Empréstimo pessoal",
    valorParcela: 320.0,
    totalParcelas: 24,
    primeiraParcela: "2025-11",
    diaVencimento: 20,
  },
];

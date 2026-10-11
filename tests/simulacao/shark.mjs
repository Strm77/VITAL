// Simulação do SHARK com os três clientes reais (dados fictícios de valores e datas da NKR).
// Hoje nos testes é 08/10/2026 (quinta).

export const NKR_MODELO = [
  { nome: "Race Week", dias: -6 },
  { nome: "Traçado do evento", dias: -6 },
  { nome: "Cronograma do Evento", dias: -5 },
  { nome: "Campeões 80kg", dias: 1 },
  { nome: "Campeões 95kg", dias: 1 },
  { nome: "Campeões 110kg", dias: 1 },
  { nome: "Campeões Sênior", dias: 1 },
];

export function dadosShark() {
  return {
    clientes: [
      { id: "cKMKZY", nome: "KMKZY", cor: 1, valorMensal: 1500, diaPagamento: 5, inicioCobranca: "2026-09", ativo: true },
      { id: "cNKR", nome: "NKR", cor: 2, valorMensal: null, diaPagamento: null, inicioCobranca: null, ativo: true },
      { id: "cSENTA", nome: "SENTA O PÉ", cor: 3, valorMensal: null, diaPagamento: null, inicioCobranca: null, ativo: true },
    ],
    frentes: [
      { id: "fPacote", clienteId: "cKMKZY", nome: "Pacote 100 artes", tipo: "pacote", metaArtes: 100, prazo: "2026-11-30", calendario: null, inicio: null, modelo: [], valorPorEtapa: null },
      { id: "fNKR", clienteId: "cNKR", nome: "Etapas", tipo: "etapas", metaArtes: null, prazo: null, calendario: "NKR", inicio: "2026-10-01", modelo: NKR_MODELO, valorPorEtapa: 900 },
      { id: "fAlf", clienteId: "cSENTA", nome: "Alfredinho", tipo: "etapas", metaArtes: null, prazo: null, calendario: "Stock Car", inicio: "2026-10-01", modelo: [{ nome: "Race Week", dias: -6 }], valorPorEtapa: 300 },
      { id: "fLucas", clienteId: "cSENTA", nome: "Lucas", tipo: "etapas", metaArtes: null, prazo: null, calendario: "Stock Car", inicio: "2026-10-01",
        modelo: [{ nome: "Cronograma Geral", dias: -5 }, { nome: "Sexta", dias: -3 }, { nome: "Sábado", dias: -2 }, { nome: "Domingo", dias: -1 }], valorPorEtapa: 400 },
    ],
    eventos: [
      { id: "eGoi", calendario: "Stock Car", nome: "Etapa Goiânia", data: "2026-10-18", local: "Goiânia (GO)" },
      { id: "eVelo", calendario: "Stock Car", nome: "Etapa Velopark", data: "2026-11-15", local: "Nova Santa Rita (RS)" },
      { id: "eInter", calendario: "Stock Car", nome: "Super Final — Interlagos", data: "2026-12-13", local: "São Paulo (SP)" },
      { id: "eN5", calendario: "NKR", nome: "NKR Etapa 5", data: "2026-10-25", local: null },
      { id: "eN6", calendario: "NKR", nome: "NKR Etapa 6", data: "2026-11-15", local: null },
    ],
    tarefas: [
      { id: "tJa", frenteId: "fPacote", eventoId: null, item: null, nome: "Artes 1–56", prazo: null, quantidade: 56, status: "entregue", entregueEm: "2026-10-01", extra: false },
      { id: "tExtraNKR", frenteId: "fNKR", eventoId: "eN5", item: null, nome: "Arte patrocinador", prazo: "2026-10-22", quantidade: 2, status: "a_fazer", entregueEm: null, extra: true },
    ],
    recebimentos: [
      { id: "rcAntigo", clienteId: "cSENTA", descricao: "Etapa Brasília", valor: 700, vencimento: "2026-10-03", recebidoEm: "2026-10-02", referencia: null, ignorado: false },
    ],
  };
}

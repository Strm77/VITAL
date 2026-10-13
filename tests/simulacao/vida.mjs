// Simulação da Visão geral, Bem-estar e Rotina. Hoje nos testes: quinta, 08/10/2026
// (semana de 05/10 a 11/10).

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dia = (n) => { const d = new Date("2026-10-08T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

const AREAS = ["saude", "financas", "carreira", "estudos", "relacionamentos", "familia", "lazer", "proposito"];

export function dadosVida() {
  const checkins = [];
  for (let i = -13; i <= -1; i++) {
    checkins.push({
      id: `ck-${dia(i)}`, data: dia(i), humor: [3, 4, 4, 2, 3, 4, 5][(i + 14) % 7], energia: [3, 3, 4, 2, 3, 4, 4][(i + 14) % 7],
      estresse: [3, 2, 2, 4, 3, 2, 1][(i + 14) % 7], sonoHoras: [6.5, 7, 8, 5.5, 7.5, 8, 9][(i + 14) % 7],
      sonoQualidade: [3, 4, 4, 2, 3, 4, 5][(i + 14) % 7], aguaCopos: [5, 8, 6, 4, 8, 9, 7][(i + 14) % 7], nota: null,
    });
  }
  const notasSet = [7, 5, 8, 6, 4, 7, 3, 6];
  const notasOut = [7, 6, 8, 7, 5, 8, 4, 6];
  return {
    checkins,
    prioridades: [
      { id: "pr-2026-10-05-1", semana: "2026-10-05", ordem: 1, texto: "Entregar as artes da NKR", feita: true },
      { id: "pr-2026-10-05-2", semana: "2026-10-05", ordem: 2, texto: "Treinar 3 vezes", feita: false },
      { id: "pr-2026-09-28-1", semana: "2026-09-28", ordem: 1, texto: "Organizar as finanças", feita: false },
    ],
    satisfacao: [
      ...AREAS.map((a, i) => ({ id: `sat-2026-09-${a}`, mes: "2026-09", area: a, nota: notasSet[i] })),
      ...AREAS.map((a, i) => ({ id: `sat-2026-10-${a}`, mes: "2026-10", area: a, nota: notasOut[i] })),
    ],
    habitos: [
      { id: "hLer", nome: "Ler 10 páginas", icone: "📖", area: "estudos", vezesSemana: 7, autocuidado: false, ativo: true },
      { id: "hMeditar", nome: "Meditar", icone: "🧘", area: "saude", vezesSemana: 7, autocuidado: true, ativo: true },
      { id: "hSkin", nome: "Skincare", icone: "🧴", area: "saude", vezesSemana: 5, autocuidado: true, ativo: true },
    ],
    habitos_feitos: [
      ...[-3, -2, -1].map((n) => ({ id: `hf-hLer-${dia(n)}`, habitoId: "hLer", data: dia(n) })),
      ...[-6, -5, -2, -1].map((n) => ({ id: `hf-hMeditar-${dia(n)}`, habitoId: "hMeditar", data: dia(n) })),
      ...[-2].map((n) => ({ id: `hf-hSkin-${dia(n)}`, habitoId: "hSkin", data: dia(n) })),
    ],
    compromissos: [
      { id: "cDentista", titulo: "Dentista", data: dia(0), hora: "10:00", tipo: "consulta", local: "Clínica Sorriso", nota: null, feito: false, recorrenciaMeses: 6 },
      { id: "cReuniao", titulo: "Reunião com cliente", data: dia(1), hora: "14:00", tipo: "compromisso", local: null, nota: null, feito: false, recorrenciaMeses: null },
      { id: "cExame", titulo: "Exame de sangue", data: dia(-18), hora: null, tipo: "exame", local: null, nota: null, feito: false, recorrenciaMeses: 12 },
    ],
    projetos: [
      { id: "pPort", nome: "Portfólio novo", objetivo: "Mostrar os trabalhos da SHARK", prazo: dia(30), status: "ativo", area: "carreira" },
      { id: "pCasa", nome: "Organizar a casa", objetivo: null, prazo: null, status: "pausado", area: "familia" },
    ],
    afazeres: [
      { id: "aEscopo", titulo: "Definir escopo do portfólio", prazo: dia(-4), prioridade: "media", projetoId: "pPort", feitoEm: dia(-4) },
      { id: "aRefs", titulo: "Separar as 12 melhores artes", prazo: dia(2), prioridade: "alta", projetoId: "pPort", feitoEm: null },
      { id: "aSite", titulo: "Montar o site", prazo: null, prioridade: "media", projetoId: "pPort", feitoEm: null },
      { id: "aIPVA", titulo: "Pagar IPVA", prazo: dia(-1), prioridade: "alta", projetoId: null, feitoEm: null },
      { id: "aEmails", titulo: "Responder e-mails", prazo: dia(0), prioridade: "media", projetoId: null, feitoEm: null },
      { id: "aPresente", titulo: "Comprar presente da mãe", prazo: dia(4), prioridade: "baixa", projetoId: null, feitoEm: null },
    ],
    blocos_tempo: [
      { id: "bFam", data: dia(-2), area: "familia", minutos: 120, descricao: "Almoço de domingo" },
      { id: "bLazer", data: dia(-1), area: "lazer", minutos: 90, descricao: "Cinema" },
      { id: "bRel", data: dia(-9), area: "relacionamentos", minutos: 60, descricao: "Jantar com amigos" },
    ],
  };
}

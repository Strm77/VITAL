// Simulação de ~8 semanas de registros de saúde (determinística), terminando em 07/10/2026.
// O começo é mais irregular e as últimas semanas melhoram, para os gráficos mostrarem evolução.

function aleatorio(semente) {
  let s = semente;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const BONS = {
  cafe: ["Ovos com fruta", "Iogurte com aveia"],
  almoco: ["Salada no almoço", "Prato com arroz, feijão e legumes"],
  lanche: ["Fruta no lanche", "Castanhas"],
  jantar: ["Jantar leve", "Sopa de legumes"],
};
const RUINS = {
  almoco: ["Fast food"],
  lanche: ["Doce depois do almoço", "Salgadinho"],
  jantar: ["Pizza", "Refrigerante no jantar"],
  fora: ["Beliscou besteira à noite"],
};
const TREINOS = [["Musculação", 50, "moderada"], ["Corrida", 30, "intensa"], ["Caminhada", 40, "leve"]];

export function registrosSaude(ultimoDia = "2026-10-07", dias = 56) {
  const r = aleatorio(42);
  const lista = [];
  const fim = new Date(ultimoDia + "T12:00:00");
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(fim);
    d.setDate(d.getDate() - i);
    const data = iso(d);
    const progresso = 1 - i / dias; // 0 → 1: vai melhorando
    if (r() < 0.12) continue; // dias sem registro
    for (const refeicao of ["cafe", "almoco", "lanche", "jantar"]) {
      if (r() < 0.25) continue;
      const erra = r() < 0.45 - progresso * 0.3 && RUINS[refeicao];
      const opcoes = erra ? RUINS[refeicao] : BONS[refeicao];
      lista.push({ data, tipo: "alimentacao", resultado: erra ? "erro" : "acerto", descricao: opcoes[Math.floor(r() * opcoes.length)], refeicao });
    }
    if (r() < 0.1) lista.push({ data, tipo: "alimentacao", resultado: "erro", descricao: "Beliscou besteira à noite", refeicao: "fora" });
    if (r() < 0.35 + progresso * 0.3) {
      const [descricao, minutos, intensidade] = TREINOS[Math.floor(r() * TREINOS.length)];
      lista.push({ data, tipo: "exercicio", resultado: "acerto", descricao, minutos, intensidade });
    } else if (r() < 0.25) {
      lista.push({ data, tipo: "exercicio", resultado: "erro", descricao: "Faltei no treino" });
    }
  }
  return lista.map((x, i) => ({ id: "sim" + i, refeicao: null, minutos: null, intensidade: null, nota: null, ...x }));
}

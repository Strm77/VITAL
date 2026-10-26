/* Supabase simulado para os testes: imita o supabase-js com as tabelas do schema
 * "financeiro" (mesmas colunas da migração) e guarda tudo no sessionStorage. */
(() => {
  const COLUNAS = {
    dividas: "id nome valor_parcela total_parcelas primeira_parcela dia_vencimento parcelas_pagas",
    ganhos: "id nome valor recorrente mes",
    gastos: "id nome valor recorrente mes",
    investimentos: "id nome valor_aplicado valor_atual meta",
    cartoes: "id nome final",
    metas: "id nome valor_alvo link prazo",
    planos: "id tema objetivo data_inicio data_fim meta_horas meta_semanal_horas",
    topicos: "id plano_id materia nome ordem concluido concluido_em",
    sessoes: "id plano_id topico_id data minutos nota",
    registros: "id data tipo resultado descricao refeicao minutos intensidade nota",
    objetivos: "id treinos_semana minutos_semana acerto_alimentacao meta_agua meta_sono",
    checkins: "id data humor energia estresse sono_horas sono_qualidade agua_copos nota",
    prioridades: "id semana ordem texto feita",
    satisfacao: "id mes area nota",
    habitos: "id nome icone area vezes_semana autocuidado ativo",
    habitos_feitos: "id habito_id data",
    compromissos: "id titulo data hora tipo local nota feito recorrencia_meses",
    projetos: "id nome objetivo prazo status area",
    afazeres: "id titulo prazo prioridade projeto_id feito_em",
    blocos_tempo: "id data area minutos descricao",
    clientes: "id nome cor valor_mensal dia_pagamento inicio_cobranca ativo",
    frentes: "id cliente_id nome tipo meta_artes prazo calendario inicio modelo valor_por_etapa",
    eventos: "id calendario nome data local",
    tarefas: "id frente_id evento_id item nome prazo quantidade status entregue_em extra",
    recebimentos: "id cliente_id descricao valor vencimento recebido_em referencia ignorado",
    movimentos_metas: "id meta_id data valor descricao",
    faturas: "id cartao_id mes vencimento arquivo importado_em sem_conta total_informado",
    lancamentos: "fatura_id ordem data descricao valor categoria final_cartao",
    pagamentos: "id nome valor vencimento status pago_em origem fatura_id valor_fatura valor_editado tipo categoria",
  };
  const OBRIGATORIAS = { pagamentos: ["nome", "valor", "vencimento"], faturas: ["cartao_id", "mes"], dividas: ["nome", "valor_parcela", "total_parcelas", "primeira_parcela"] };
  const ler = () => JSON.parse(sessionStorage.getItem("mock-db") || "{}");
  const gravar = (db) => sessionStorage.setItem("mock-db", JSON.stringify(db));
  const usuario = () => JSON.parse(sessionStorage.getItem("mock-sessao") || "null");
  let seq = 0;
  window.__chamadas = [];

  function validar(tabela, linha, inserindo) {
    for (const c of Object.keys(linha)) {
      if (!COLUNAS[tabela].split(" ").includes(c)) return { message: `column "${c}" of relation "${tabela}" does not exist` };
    }
    if (inserindo) for (const c of OBRIGATORIAS[tabela] || []) {
      if (linha[c] == null) return { message: `null value in column "${c}" violates not-null constraint` };
    }
    if (tabela === "pagamentos" && linha.fatura_id && !(ler().faturas || []).some((f) => f.id === linha.fatura_id)) {
      return { message: "insert or update on table \"pagamentos\" violates foreign key constraint" };
    }
    return null;
  }
  const resultado = (valor) => ({ then: (ok, erro) => Promise.resolve(valor).then(ok, erro) });

  function de(tabela) {
    if (!usuario()) throw new Error("sem sessão");
    window.__chamadas.push(tabela);
    return {
      select(colunas) {
        return {
          order() {
            const db = ler();
            let linhas = (db[tabela] || []).map((l) => ({ ...l, usuario_id: usuario().id }));
            if (colunas.includes("lancamentos(")) {
              linhas = linhas.map((f) => ({ ...f, lancamentos: (db.lancamentos || []).filter((l) => l.fatura_id === f.id) }));
            }
            return resultado({ data: linhas, error: null });
          },
        };
      },
      insert(dados) {
        const linhas = Array.isArray(dados) ? dados : [dados];
        const db = ler();
        let erro = null;
        const novas = linhas.map((l) => {
          erro = erro || validar(tabela, l, true);
          return tabela === "lancamentos" ? { ...l } : { id: "id" + Date.now() + (seq++), ...l };
        });
        if (!erro) { db[tabela] = [...(db[tabela] || []), ...novas]; gravar(db); }
        const r = { data: novas, error: erro };
        return { ...resultado(r), select: () => ({ single: () => resultado({ data: novas[0], error: erro }) }) };
      },
      upsert(linha) {
        const erro = validar(tabela, linha, false);
        if (!erro) {
          const db = ler();
          const lista = db[tabela] || [];
          const i = lista.findIndex((x) => x.id === linha.id);
          if (i >= 0) lista[i] = { ...lista[i], ...linha }; else lista.push(linha);
          db[tabela] = lista;
          gravar(db);
        }
        return resultado({ error: erro });
      },
      delete() {
        return {
          eq(coluna, valor) {
            const db = ler();
            db[tabela] = (db[tabela] || []).filter((x) => x[coluna] !== valor);
            if (tabela === "faturas") db.lancamentos = (db.lancamentos || []).filter((l) => l.fatura_id !== valor);
            if (tabela === "faturas") (db.pagamentos || []).forEach((p) => { if (p.fatura_id === valor) p.fatura_id = null; });
            gravar(db);
            return resultado({ error: null });
          },
        };
      },
    };
  }

  const ouvintes = [];
  window.supabase = {
    createClient: (url, chave, opcoes) => {
      window.__opcoes = opcoes;
      return {
        from: de,
        schema: (nome) => { window.__schemas = [...(window.__schemas || []), nome]; return { from: de }; },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        auth: {
          getSession: async () => {
            // Imita a volta pelo link de recuperação: o cliente cria a sessão e avisa PASSWORD_RECOVERY.
            if (location.hash.includes("type=recovery") && location.hash.includes("access_token=mock")) {
              sessionStorage.setItem("mock-sessao", JSON.stringify({ id: "u1", email: "eu@exemplo.com" }));
              setTimeout(() => ouvintes.forEach((f) => f("PASSWORD_RECOVERY")), 0);
            }
            return { data: { session: usuario() ? { user: usuario() } : null } };
          },
          resetPasswordForEmail: async (email, opcoes) => {
            window.__recuperacao = { email, opcoes };
            return email.startsWith("rapido") ? { data: {}, error: { message: "For security purposes, you can only request this after 52 seconds." } } : { data: {}, error: null };
          },
          updateUser: async ({ password }) => {
            if (!usuario()) return { data: {}, error: { message: "Auth session missing!" } };
            if (password === "senha-certa") return { data: {}, error: { message: "New password should be different from the old password." } };
            window.__novaSenha = password;
            return { data: { user: usuario() }, error: null };
          },
          signInWithPassword: async ({ email, password }) => {
            if (password !== "senha-certa") return { data: {}, error: { message: "Invalid login credentials" } };
            const user = { id: "u1", email };
            sessionStorage.setItem("mock-sessao", JSON.stringify(user));
            return { data: { session: { user } }, error: null };
          },
          signUp: async ({ email }) => email.endsWith("@permitido.com")
            ? { data: { session: null }, error: null }
            : { data: {}, error: { message: "Database error saving new user" } },
          signOut: async () => { sessionStorage.removeItem("mock-sessao"); ouvintes.forEach((f) => f("SIGNED_OUT")); },
          onAuthStateChange: (f) => ouvintes.push(f),
        },
      };
    },
  };
})();

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
          getSession: async () => ({ data: { session: usuario() ? { user: usuario() } : null } }),
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

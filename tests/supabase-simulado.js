/* Supabase simulado para os testes: imita o supabase-js com as tabelas do schema
 * "financeiro" (mesmas colunas da migração) e guarda tudo no sessionStorage. */
(() => {
  const COLUNAS = {
    dividas: "id nome valor_parcela total_parcelas primeira_parcela dia_vencimento parcelas_pagas parcelas_quitadas saldo_informado saldo_informado_em",
    ganhos: "id nome valor recorrente mes",
    gastos: "id nome valor recorrente mes",
    investimentos: "id nome valor_aplicado valor_atual meta",
    cartoes: "id nome final",
    metas: "id nome valor_alvo link prazo",
    planos: "id tema objetivo data_inicio data_fim meta_horas meta_semanal_horas",
    topicos: "id plano_id materia nome ordem concluido concluido_em",
    sessoes: "id plano_id topico_id data minutos nota",
    registros: "id data tipo resultado descricao refeicao minutos intensidade nota avaliacao situacao",
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
    materiais: "id cliente_id frente_id rotulo url",
    movimentos_metas: "id meta_id data valor descricao",
    faturas: "id cartao_id mes vencimento arquivo importado_em sem_conta total_informado",
    lancamentos: "fatura_id ordem data descricao valor categoria final_cartao",
    historico_contas: "id conta_id fatura_id evento origem_acao antes depois detalhe criado_em",
    // schema stefanini (chave "stefanini.<tabela>": não se mistura com financeiro.metas)
    "stefanini.contas": "id nome segmento status contrato_stf contrato_sda consultor relacionamento_desde notas",
    "stefanini.contatos": "id conta_id nome cargo email telefone temperatura notas",
    "stefanini.oportunidades": "id conta_id contato_id nome estagio valor_estimado fechada_em notas",
    "stefanini.reunioes": "id conta_id data titulo anotacoes",
    "stefanini.atividades": "id conta_id descricao data feita concluida_em",
    "stefanini.metas": "id ano valor_meta",
    "stefanini.checkins": "id semana",
    "stefanini.checkin_itens": "id checkin_id secao ordem conta_id cliente_rotulo atividades",
    pagamentos: "id nome valor vencimento status pago_em origem fatura_id valor_fatura valor_editado tipo categoria mes_referencia vencimento_a_confirmar pagar_em observacao origem_pagamento divida_id",
  };
  const OBRIGATORIAS = { pagamentos: ["nome", "valor", "vencimento"], faturas: ["cartao_id", "mes"], dividas: ["nome", "valor_parcela", "total_parcelas", "primeira_parcela"], materiais: ["cliente_id", "rotulo", "url"],
    "stefanini.contas": ["nome", "status", "contrato_stf", "contrato_sda"], "stefanini.contatos": ["nome"],
    "stefanini.oportunidades": ["conta_id", "nome", "estagio"], "stefanini.reunioes": ["data", "titulo"],
    "stefanini.atividades": ["descricao", "feita"], "stefanini.metas": ["ano", "valor_meta"],
    "stefanini.checkins": ["semana"], "stefanini.checkin_itens": ["checkin_id", "secao", "ordem", "atividades"] };
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
    // Como os checks de stefanini.checkin_itens: conta OU rótulo livre, e só as três seções.
    if (tabela === "stefanini.checkin_itens") {
      if (linha.conta_id != null && linha.cliente_rotulo != null) return { message: 'new row violates check constraint "checkin_itens_um_cliente"' };
      if (linha.secao != null && !["Semana Passada", "Essa Semana", "Pedido de Ajuda"].includes(linha.secao)) return { message: "violates check constraint secao" };
    }
    if (tabela === "pagamentos" && linha.fatura_id && !(ler().faturas || []).some((f) => f.id === linha.fatura_id)) {
      return { message: "insert or update on table \"pagamentos\" violates foreign key constraint" };
    }
    return null;
  }
  const resultado = (valor) => ({ then: (ok, erro) => Promise.resolve(valor).then(ok, erro) });

  function de(nome, schema) {
    if (!usuario()) throw new Error("sem sessão");
    // Tabelas do schema stefanini usam user_id/created_at/updated_at e ficam em "stefanini.<tabela>".
    const stf = schema === "stefanini";
    const tabela = stf ? "stefanini." + nome : nome;
    window.__chamadas.push(tabela);
    return {
      select(colunas) {
        return {
          order(coluna) {
            if (stf) window.__ordemStefanini = coluna;
            // Falha simulada de consulta do CRM (para testar o aviso de erro).
            if (stf && sessionStorage.getItem("mock-falhar-stefanini")) return resultado({ data: null, error: { message: "network error" } });
            // Consulta lenta simulada (para ver o "Carregando…").
            if (stf && sessionStorage.getItem("mock-atrasar-stefanini")) {
              const ms = Number(sessionStorage.getItem("mock-atrasar-stefanini"));
              const atrasado = new Promise((ok) => setTimeout(() => ok({ data: (ler()[tabela] || []).map((l) => ({ ...l, user_id: usuario().id })), error: null }), ms));
              return { then: (ok, erro) => atrasado.then(ok, erro) };
            }
            const db = ler();
            let linhas = (db[tabela] || []).map((l) => (stf
              ? { ...l, user_id: usuario().id, created_at: "2026-10-08T12:00:00Z", updated_at: "2026-10-08T12:00:00Z" }
              : { ...l, usuario_id: usuario().id }));
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
        // Como a chave primária: inserir um id que já existe dá erro 23505.
        if (tabela === "historico_contas" && linhas.some((l) => l.id && (db[tabela] || []).some((x) => x.id === l.id))) {
          const r = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          return { ...resultado(r), select: () => ({ single: () => resultado(r) }) };
        }
        const novas = linhas.map((l) => {
          erro = erro || validar(tabela, l, true);
          if (tabela === "lancamentos") return { ...l };
          // Como no banco: criado_em vem do servidor (default now()).
          return { id: "id" + Date.now() + (seq++), ...(tabela === "historico_contas" ? { criado_em: new Date().toISOString() } : {}), ...l };
        });
        // Falha simulada de gravação do histórico (para testar a fila de reenvio).
        if (tabela === "historico_contas" && sessionStorage.getItem("mock-falhar-historico")) {
          const r = { data: null, error: { message: "network error" } };
          return { ...resultado(r), select: () => ({ single: () => resultado(r) }) };
        }
        if (!erro) { db[tabela] = [...(db[tabela] || []), ...novas]; gravar(db); }
        const r = { data: novas, error: erro };
        return { ...resultado(r), select: () => ({ single: () => resultado({ data: novas[0], error: erro }) }) };
      },
      upsert(linha) {
        // Como as políticas RLS da tabela: histórico não aceita UPDATE.
        if (tabela === "historico_contas") return resultado({ error: { message: "new row violates row-level security policy" } });
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
        window.__exclusoes = [...(window.__exclusoes || []), tabela];
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
        from: (t) => de(t, "financeiro"),
        schema: (nome) => { window.__schemas = [...(window.__schemas || []), nome]; return { from: (t) => de(t, nome) }; },
        // Registra as assinaturas do tempo real (schema + tabela) para os testes conferirem.
        channel: (nome) => ({
          on(evento, filtro) { window.__realtime = [...(window.__realtime || []), { canal: nome, schema: filtro?.schema, tabela: filtro?.table }]; return this; },
          subscribe() { return this; },
        }),
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

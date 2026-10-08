/* ---------- Supabase: login e armazenamento ----------
 * Usado quando o site está publicado (http/https) e o config.js tem a conexão.
 * Aberto como arquivo local (ou com ?local na URL), o painel continua usando o localStorage.
 */

const supa = (() => {
  const cfg = window.VITAL_SUPABASE;
  const local = location.protocol === "file:" || new URLSearchParams(location.search).has("local");
  if (local || !cfg || !window.supabase) return null;
  return window.supabase.createClient(cfg.url, cfg.chave, { db: { schema: "financeiro" } });
})();

/* ---------- Login ---------- */

const MENSAGENS_AUTH = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Esta conta já existe. Use “Entrar”.",
  "Password should be at least 6 characters.": "A senha precisa ter pelo menos 6 caracteres.",
};
const traduzirErro = (e) => {
  const msg = e?.message || "";
  if (/cadastro não permitido/i.test(msg) || /Database error saving new user/i.test(msg)) return "Este e-mail não tem acesso ao V.I.T.A.L.";
  return MENSAGENS_AUTH[msg] || "Não foi possível entrar agora. Tente de novo.";
};

let usuarioAtual = null;
const sessaoPronta = !supa ? Promise.resolve(null) : new Promise((resolver) => {
  document.body.classList.add("sem-sessao"); // nada do painel aparece antes do login
  const tela = document.getElementById("tela-login");
  const form = document.getElementById("form-login");
  const aviso = document.getElementById("login-aviso");
  const mostrarAviso = (texto, ok) => {
    aviso.textContent = texto;
    aviso.hidden = !texto;
    aviso.classList.toggle("ok", !!ok);
  };
  const entrar = (sessao) => {
    usuarioAtual = sessao.user;
    document.body.classList.remove("sem-sessao");
    tela.hidden = true;
    document.getElementById("usuario-email").textContent = sessao.user.email;
    document.getElementById("conta").hidden = false;
    resolver(sessao.user);
  };

  supa.auth.getSession().then(({ data }) => {
    if (data.session) entrar(data.session);
    else {
      document.body.classList.add("sem-sessao");
      tela.hidden = false;
      document.getElementById("login-email").focus();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const criar = e.submitter?.dataset.acao === "criar";
    const email = form.elements.email.value.trim();
    const senha = form.elements.senha.value;
    if (!email || !senha) return mostrarAviso("Preencha e-mail e senha.");
    mostrarAviso("");
    const botoes = form.querySelectorAll("button");
    botoes.forEach((b) => (b.disabled = true));
    try {
      if (criar) {
        const { data, error } = await supa.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (data.session) entrar(data.session);
        else mostrarAviso("Conta criada. Enviamos um link de confirmação para o seu e-mail; depois de confirmar, volte aqui e entre.", true);
      } else {
        const { data, error } = await supa.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        entrar(data.session);
      }
    } catch (erro) {
      mostrarAviso(traduzirErro(erro));
    } finally {
      botoes.forEach((b) => (b.disabled = false));
    }
  });

  document.getElementById("sair").addEventListener("click", async () => {
    await supa.auth.signOut();
    location.reload();
  });
  supa.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT" && usuarioAtual) location.reload();
  });
});

/* ---------- Armazenamento nas tabelas do schema financeiro ----------
 * O painel trabalha com objetos em camelCase; o banco usa snake_case.
 * As faturas guardam os lançamentos numa tabela própria (financeiro.lancamentos).
 */

const paraSnake = (t) => t.replace(/[A-Z]/g, (l) => "_" + l.toLowerCase());
const paraCamel = (t) => t.replace(/_([a-z])/g, (_, l) => l.toUpperCase());

const COLUNAS = {
  dividas: ["nome", "valor_parcela", "total_parcelas", "primeira_parcela", "dia_vencimento", "parcelas_pagas"],
  ganhos: ["nome", "valor", "recorrente", "mes"],
  gastos: ["nome", "valor", "recorrente", "mes"],
  investimentos: ["nome", "valor_aplicado", "valor_atual", "meta"],
  cartoes: ["nome", "final"],
  faturas: ["cartao_id", "mes", "vencimento", "arquivo", "importado_em", "sem_conta"],
  pagamentos: ["nome", "valor", "vencimento", "status", "pago_em", "origem", "fatura_id", "valor_fatura", "valor_editado"],
};
// Colunas que podem ficar vazias (quando o campo some do formulário, vira null no banco).
const ANULAVEIS = new Set(["dia_vencimento", "parcelas_pagas", "meta", "final", "vencimento", "arquivo", "pago_em", "origem", "fatura_id", "valor_fatura"]);
const NUMERICAS = new Set(["valor", "valor_parcela", "valor_aplicado", "valor_atual", "meta", "valor_fatura"]);

function linhaParaObjeto(linha) {
  const obj = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (chave === "usuario_id" || chave === "criado_em" || valor === null) continue;
    obj[paraCamel(chave)] = NUMERICAS.has(chave) ? Number(valor) : valor;
  }
  return obj;
}

function objetoParaLinha(tabela, item) {
  const linha = {};
  for (const coluna of COLUNAS[tabela]) {
    const valor = item[paraCamel(coluna)];
    if (valor === undefined || valor === "") {
      if (ANULAVEIS.has(coluna)) linha[coluna] = null;
    } else linha[coluna] = valor;
  }
  return linha;
}

function armazenamentoSupabase(tabela) {
  let ouvinte = () => {};
  let ouvinteErro = () => {};
  let agendado = null;

  async function carregar() {
    const colunas = tabela === "faturas" ? "*, lancamentos(ordem, data, descricao, valor, categoria, final_cartao)" : "*";
    const { data, error } = await supa.from(tabela).select(colunas).order(tabela === "faturas" ? "importado_em" : "criado_em");
    if (error) throw error;
    return data.map((linha) => {
      const { lancamentos, ...resto } = linha;
      const obj = linhaParaObjeto(resto);
      if (tabela === "faturas") {
        obj.lancamentos = (lancamentos || [])
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ ordem, ...l }) => linhaParaObjeto(l));
      }
      return obj;
    });
  }

  async function atualizar() {
    try { ouvinte(await carregar()); }
    catch (e) { console.error(e); ouvinteErro(e); }
  }
  const agendar = () => {
    clearTimeout(agendado);
    agendado = setTimeout(atualizar, 150);
  };

  return {
    observar(fn, erro) {
      ouvinte = fn;
      if (erro) ouvinteErro = erro;
      atualizar();
      // Tempo real: qualquer mudança nas tabelas (deste ou de outro aparelho) recarrega a seção.
      const canal = supa.channel("financeiro-" + tabela)
        .on("postgres_changes", { event: "*", schema: "financeiro", table: tabela }, agendar);
      if (tabela === "faturas") canal.on("postgres_changes", { event: "*", schema: "financeiro", table: "lancamentos" }, agendar);
      canal.subscribe();
    },

    async salvar(id, item) {
      const linha = objetoParaLinha(tabela, item);
      let novoId = id;
      if (id) {
        const { error } = await supa.from(tabela).upsert({ id, ...linha });
        if (error) throw error;
      } else {
        const { data, error } = await supa.from(tabela).insert(linha).select("id").single();
        if (error) throw error;
        novoId = data.id;
      }
      if (tabela === "faturas" && Array.isArray(item.lancamentos)) {
        // Troca os lançamentos da fatura pelos atuais.
        const { error: erroApagar } = await supa.from("lancamentos").delete().eq("fatura_id", novoId);
        if (erroApagar) throw erroApagar;
        if (item.lancamentos.length) {
          const { error } = await supa.from("lancamentos").insert(item.lancamentos.map((l, ordem) => ({
            fatura_id: novoId,
            ordem,
            data: l.data || null,
            descricao: l.descricao,
            valor: l.valor,
            categoria: l.categoria || "Outros",
            final_cartao: l.finalCartao || null,
          })));
          if (error) throw error;
        }
      }
      agendar();
      return novoId;
    },

    async excluir(id) {
      const { error } = await supa.from(tabela).delete().eq("id", id);
      if (error) throw error;
      agendar();
    },
  };
}

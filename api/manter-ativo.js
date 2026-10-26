/* Despertador do banco: a Vercel chama esta rota todo dia (crons em vercel.json).
 * Ela faz uma consulta mínima no Supabase (a função public.manter_ativo, que só devolve
 * a hora) para o projeto não ser pausado por inatividade no plano gratuito.
 * Usa a mesma chave publicável do site (config.js), que já é pública. */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dswjfjziqaufnvxcikac.supabase.co";
const SUPABASE_CHAVE = process.env.SUPABASE_CHAVE || "sb_publishable_L_mYBTPXL2gNgFmc1_UnHA_k06Tc2D4";

module.exports = async function manterAtivo(req, res) {
  try {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/manter_ativo`, {
      method: "POST",
      headers: { apikey: SUPABASE_CHAVE, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    const corpo = await resposta.text();
    res.setHeader("Cache-Control", "no-store");
    if (!resposta.ok) {
      res.status(502).json({ ok: false, status: resposta.status });
      return;
    }
    res.status(200).json({ ok: true, banco: JSON.parse(corpo) });
  } catch (erro) {
    res.status(502).json({ ok: false, erro: String(erro && erro.message || erro) });
  }
};

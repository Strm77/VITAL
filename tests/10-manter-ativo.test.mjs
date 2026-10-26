// Despertador do banco (api/manter-ativo.js): chama a função do Supabase e responde o resultado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const manterAtivo = require("../api/manter-ativo.js");

function respostaFalsa() {
  const r = { codigo: null, corpo: null, cabecalhos: {} };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  return r;
}

test("Chama a função manter_ativo com a chave pública e responde 200", async (t) => {
  const chamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return new Response(JSON.stringify("2026-10-26T14:00:00+00:00"), { status: 200 });
  });
  const res = respostaFalsa();
  await manterAtivo({}, res);
  assert.equal(chamadas[0].url, "https://dswjfjziqaufnvxcikac.supabase.co/rest/v1/rpc/manter_ativo");
  assert.equal(chamadas[0].opcoes.method, "POST");
  assert.match(chamadas[0].opcoes.headers.apikey, /^sb_publishable_/);
  assert.deepEqual([res.codigo, res.corpo], [200, { ok: true, banco: "2026-10-26T14:00:00+00:00" }]);
  assert.equal(res.cabecalhos["Cache-Control"], "no-store");
});

test("Se o banco falhar, responde 502 (aparece como erro nos logs da Vercel)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("pausado", { status: 540 }));
  const res = respostaFalsa();
  await manterAtivo({}, res);
  assert.deepEqual([res.codigo, res.corpo], [502, { ok: false, status: 540 }]);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("sem rede"); });
  const res2 = respostaFalsa();
  await manterAtivo({}, res2);
  assert.deepEqual([res2.codigo, res2.corpo.ok, res2.corpo.erro], [502, false, "sem rede"]);
});

test("Cron diário configurado na Vercel e chave igual à do site", () => {
  const vercel = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url)));
  assert.deepEqual(vercel.crons, [{ path: "/api/manter-ativo", schedule: "17 11 * * *" }]);
  const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../api/manter-ativo.js", import.meta.url), "utf8");
  for (const valor of config.match(/"(https:[^"]+|sb_publishable_[^"]+)"/g)) assert.ok(api.includes(valor), valor);
});

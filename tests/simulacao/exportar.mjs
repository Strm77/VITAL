// Monta o cenário de simulação pelo próprio painel (importando os PDFs e cadastrando as
// contas pela tela) e salva o resultado em tests/saida/simulacao.json.
// Uso: npm run simulacao
import path from "node:path";
import { writeFileSync } from "node:fs";
import { abrirNavegador, abrirPainel, SAIDA } from "../ajuda.mjs";
import { CARTOES, CONTAS } from "./dados.mjs";
import { gerarPdfs } from "./gerar-pdfs.mjs";

const pdfs = await gerarPdfs(path.join(SAIDA, "pdfs"));
const navegador = await abrirNavegador();
const pagina = await abrirPainel(await navegador.newContext());
await pagina.evaluate(() => localStorage.setItem("vital.pagamentos", "[]"));
await pagina.reload();
await pagina.waitForSelector("#lista-dividas li");

await pagina.click(".subaba[data-aba=faturas]");
for (const { cartao, arquivo } of pdfs) {
  await pagina.setInputFiles("#pdf-arquivo", arquivo);
  await pagina.waitForSelector("#previa:not([hidden])");
  await pagina.selectOption("#previa-cartao", "");
  await pagina.fill("#previa-novo", cartao.nome);
  await pagina.click("#previa [type=submit]");
  await pagina.waitForSelector("#previa", { state: "hidden" });
}
await pagina.click(".subaba[data-aba=painel]");
for (const c of CONTAS) {
  await pagina.click("#pag-adicionar");
  await pagina.fill("#pag-nome", c.nome);
  await pagina.fill("#pag-valor", String(c.valor));
  await pagina.fill("#pag-vencimento", c.vencimento);
  await pagina.click("#pag-form [type=submit]");
  await pagina.waitForSelector("#pag-form", { state: "hidden" });
}
for (const c of CONTAS.filter((x) => x.pagar)) {
  await pagina.locator("#pag-tabela tbody tr", { hasText: c.nome }).locator("[data-acao=pagar]").click();
  await pagina.waitForTimeout(80);
}
const dados = await pagina.evaluate(() =>
  Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("vital.")).map((k) => [k.slice(6), JSON.parse(localStorage[k])])));
writeFileSync(path.join(SAIDA, "simulacao.json"), JSON.stringify(dados, null, 2));
console.log(Object.entries(dados).map(([k, v]) => `${k}: ${v.length}`).join(", "), `(${CARTOES.length} cartões)`);
if (pagina.erros.length) console.error("Erros na página:", pagina.erros);
await navegador.close();

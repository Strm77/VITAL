// Utilidades compartilhadas pelos testes (Playwright + node:test).
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SAIDA = path.join(RAIZ, "tests", "saida");
mkdirSync(SAIDA, { recursive: true });

export const URL_PAINEL = pathToFileURL(path.join(RAIZ, "index.html")).href;
// Data fixa: os testes dão o mesmo resultado em qualquer dia.
export const HOJE = new Date("2026-10-08T12:00:00");

export async function abrirNavegador() {
  const caminho = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH].find((p) => p && existsSync(p));
  return chromium.launch(caminho ? { executablePath: caminho } : {});
}

/* Abre o painel com os dados zerados (ou com o estado de outro teste, se `manterDados`). */
export async function abrirPainel(contexto, { hash = "", manterDados = false, largura = 1440 } = {}) {
  const pagina = await contexto.newPage({ viewport: { width: largura, height: 1000 } });
  pagina.erros = [];
  pagina.on("pageerror", (e) => pagina.erros.push(e.message));
  await pagina.clock.setFixedTime(HOJE);
  // pdf.js vem do node_modules em vez do CDN (os testes rodam sem internet).
  await pagina.route("https://cdnjs.cloudflare.com/**", (rota) => {
    const arquivo = rota.request().url().split("/").pop();
    rota.fulfill({ path: path.join(RAIZ, "node_modules/pdfjs-dist/build", arquivo), contentType: "application/javascript" });
  });
  await pagina.goto(URL_PAINEL + hash);
  if (!manterDados) {
    await pagina.evaluate(() => localStorage.clear());
    await pagina.reload();
  }
  await pagina.waitForSelector("#lista-dividas li, #vazio:not([hidden])");
  return pagina;
}

export const brl = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/ /g, " ");
export const texto = async (pagina, seletor) => (await pagina.textContent(seletor)).replace(/\s+/g, " ").replace(/ /g, " ").trim();
export const centavos = (v) => Math.round(v * 100) / 100;

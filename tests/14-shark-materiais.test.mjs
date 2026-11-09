// SHARK: materiais (rótulo + link) por cliente e por frente — cadastrar, editar, remover,
// só links http(s), frente excluída não apaga o link e uso no celular (390px).
// Dados fictícios: clientes inventados e links em example.com / example.org.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { abrirNavegador, abrirPainel, SAIDA, texto } from "./ajuda.mjs";

let navegador, pagina;
const ir = async (hash) => { await pagina.click(`.subaba[data-aba="${hash}"]`); await pagina.waitForSelector(`[data-vista="${hash}"]:not([hidden])`); };
const local = (nome) => pagina.evaluate((n) => JSON.parse(localStorage.getItem("vital." + n) || "[]"), nome);
const cliente = (nome) => pagina.locator(".cliente-shark", { has: pagina.locator(`h2:text-is("${nome}")`) });
const frente = (nome) => pagina.locator(".frente", { has: pagina.locator(`h4:text("${nome}")`) });

before(async () => {
  navegador = await abrirNavegador();
  pagina = await abrirPainel(await navegador.newContext());
  await pagina.click(".aba[data-area=shark]");
  await ir("shark-clientes");
});
after(() => navegador?.close());

async function novoCliente(nome) {
  await pagina.click("#cliente-adicionar");
  await pagina.fill("#cliente-nome", nome);
  await pagina.click("#cliente-form [type=submit]");
  await cliente(nome).waitFor();
}

async function novoPacote(nomeCliente, nome) {
  await cliente(nomeCliente).locator("[data-acao=nova-frente]").click();
  await pagina.fill("#frente-nome", nome);
  await pagina.fill("#frente-meta", "10");
  await pagina.click("#frente-form [type=submit]");
  await frente(nome).waitFor();
}

async function preencherMaterial(rotulo, url) {
  await pagina.fill("#material-rotulo", rotulo);
  await pagina.fill("#material-url", url);
  await pagina.click("#material-form [type=submit]");
}

test("Cliente novo mostra a lista de materiais vazia, com + Link", async () => {
  await novoCliente("Estúdio Fictício");
  await novoPacote("Estúdio Fictício", "Pacote Teste");
  const bloco = cliente("Estúdio Fictício").locator(".materiais[data-materiais=geral]");
  assert.match(await bloco.textContent(), /Materiais do cliente.*Nenhum link ainda/s);
  assert.equal(await frente("Pacote Teste").locator(".materiais").count(), 0, "frente sem links não mostra a lista");
  assert.equal(await pagina.isVisible("#material-painel"), false);
});

test("Cadastra link geral do cliente e link da frente", async () => {
  await cliente("Estúdio Fictício").locator("[data-novo-material]").first().click();
  assert.equal(await pagina.isVisible("#material-painel"), true);
  assert.equal(await pagina.inputValue("#material-frente"), "", "a partir do cliente, vem como geral");
  await preencherMaterial("Manual da marca", "https://example.com/manual");
  await pagina.waitForSelector(".cliente-shark .materiais[data-materiais=geral] li[data-material]");
  assert.equal(await pagina.isVisible("#material-painel"), false);

  await frente("Pacote Teste").locator("[data-novo-material]").click();
  assert.notEqual(await pagina.inputValue("#material-frente"), "", "a partir da frente, vem com a frente escolhida");
  // Sem esquema: vira https:// (mesma regra dos links das metas).
  await preencherMaterial("Referências", "example.org/refs?x=1");
  await frente("Pacote Teste").locator(".materiais li[data-material]").waitFor();

  const geral = cliente("Estúdio Fictício").locator(".materiais[data-materiais=geral]");
  assert.equal(await geral.locator("li[data-material]").count(), 1, "o link da frente não aparece como geral");
  const a = geral.locator("a.material-link");
  assert.equal(await a.getAttribute("href"), "https://example.com/manual");
  assert.equal(await a.getAttribute("target"), "_blank");
  assert.equal(await a.getAttribute("rel"), "noopener noreferrer");
  assert.match(await a.textContent(), /Manual da marca\s*example\.com/);
  const daFrente = frente("Pacote Teste").locator("a.material-link");
  assert.equal(await daFrente.getAttribute("href"), "https://example.org/refs?x=1");

  const salvos = await local("materiais");
  assert.equal(salvos.length, 2);
  const f = (await local("frentes")).find((x) => x.nome === "Pacote Teste");
  const c = (await local("clientes")).find((x) => x.nome === "Estúdio Fictício");
  assert.deepEqual(salvos.map((m) => [m.rotulo, m.clienteId === c.id, m.frenteId || null]),
    [["Manual da marca", true, null], ["Referências", true, f.id]]);
});

test("Recusa rótulo vazio e links que não são http(s)", async () => {
  await cliente("Estúdio Fictício").locator("[data-novo-material]").first().click();
  await preencherMaterial("", "https://example.com/x");
  assert.match(await texto(pagina, "#material-aviso"), /Dê um rótulo/);
  await preencherMaterial("Perigoso", "javascript:alert(1)");
  assert.match(await texto(pagina, "#material-aviso"), /link http\(s\) válido/);
  await preencherMaterial("Arquivo local", "file:///etc/passwd");
  assert.match(await texto(pagina, "#material-aviso"), /link http\(s\) válido/);
  assert.equal((await local("materiais")).length, 2, "nada foi gravado");
  await pagina.click("#material-cancelar");
  assert.equal(await pagina.isVisible("#material-painel"), false);
});

test("Edita rótulo, URL e frente mantendo o mesmo id", async () => {
  const antes = (await local("materiais")).find((m) => m.rotulo === "Manual da marca");
  const item = cliente("Estúdio Fictício").locator("li[data-material]", { hasText: "Manual da marca" });
  await item.locator("[data-material-acao=editar]").click();
  assert.equal(await texto(pagina, "#material-form-titulo"), "Editar Manual da marca");
  assert.equal(await pagina.inputValue("#material-rotulo"), "Manual da marca");
  assert.equal(await pagina.inputValue("#material-url"), "https://example.com/manual");
  await pagina.selectOption("#material-frente", { label: "Pacote Teste" });
  await preencherMaterial("Manual da marca v2", "https://example.com/manual-v2");
  await pagina.waitForFunction(() => document.querySelectorAll(".frente .materiais li[data-material]").length === 2);
  const depois = (await local("materiais")).find((m) => m.id === antes.id);
  assert.equal(depois.rotulo, "Manual da marca v2");
  assert.equal(depois.url, "https://example.com/manual-v2");
  assert.ok(depois.frenteId, "passou para a frente");
  assert.equal((await local("materiais")).length, 2, "editar não cria outro");
  assert.match(await cliente("Estúdio Fictício").locator(".materiais[data-materiais=geral]").textContent(), /Nenhum link ainda/);
});

test("Remove um link só depois de confirmar", async () => {
  const item = () => frente("Pacote Teste").locator("li[data-material]", { hasText: "Referências" });
  const botao = item().locator("[data-material-acao=excluir]");
  await botao.click();
  assert.equal(await botao.textContent(), "Excluir link?");
  assert.equal((await local("materiais")).length, 2, "o primeiro toque só pede confirmação");
  await botao.click();
  await pagina.waitForFunction(() => document.querySelectorAll(".frente .materiais li[data-material]").length === 1);
  const restantes = await local("materiais");
  assert.deepEqual(restantes.map((m) => m.rotulo), ["Manual da marca v2"]);
});

test("Excluir a frente não apaga o link: ele volta para o cliente", async () => {
  await novoPacote("Estúdio Fictício", "Frente Descartável");
  await frente("Frente Descartável").locator("[data-novo-material]").click();
  await preencherMaterial("Briefing", "https://example.com/briefing");
  await frente("Frente Descartável").locator("li[data-material]").waitFor();
  const ex = frente("Frente Descartável").locator("[data-acao=excluir-frente]");
  await ex.click(); await ex.click();
  await frente("Frente Descartável").waitFor({ state: "detached" });
  const geral = cliente("Estúdio Fictício").locator(".materiais[data-materiais=geral]");
  assert.match(await geral.textContent(), /Briefing/);
  assert.equal((await local("materiais")).length, 2);
});

test("Os links de um cliente não aparecem em outro", async () => {
  await novoCliente("Outra Marca Inventada");
  const outro = cliente("Outra Marca Inventada");
  assert.match(await outro.locator(".materiais").textContent(), /Nenhum link ainda/);
  await outro.locator("[data-novo-material]").first().click();
  assert.equal(await pagina.$eval("#material-cliente", (s) => s.selectedOptions[0].textContent), "Outra Marca Inventada");
  // Trocar o cliente no formulário troca a lista de frentes.
  assert.deepEqual(await pagina.$$eval("#material-frente option", (o) => o.map((x) => x.textContent)), ["Geral do cliente"]);
  await pagina.selectOption("#material-cliente", { label: "Estúdio Fictício" });
  assert.deepEqual(await pagina.$$eval("#material-frente option", (o) => o.map((x) => x.textContent)), ["Geral do cliente", "Pacote Teste"]);
  await pagina.selectOption("#material-cliente", { label: "Outra Marca Inventada" });
  await preencherMaterial("Drive da campanha", "https://example.org/campanha");
  await outro.locator("li[data-material]").waitFor();
  assert.doesNotMatch(await cliente("Estúdio Fictício").textContent(), /Drive da campanha/);
});

test("Dados continuam depois de recarregar a página", async () => {
  await pagina.reload();
  await pagina.click(".aba[data-area=shark]");
  await ir("shark-clientes");
  await cliente("Estúdio Fictício").waitFor();
  assert.match(await cliente("Estúdio Fictício").textContent(), /Briefing.*Manual da marca v2/s);
  assert.match(await cliente("Outra Marca Inventada").textContent(), /Drive da campanha/);
});

test("Celular (390px): lista e formulário cabem na tela, ações à vista", async () => {
  await pagina.setViewportSize({ width: 390, height: 844 });
  await frente("Pacote Teste").locator("[data-novo-material]").click();
  await preencherMaterial("Um rótulo bem comprido para ver se corta direitinho no celular sem estourar",
    "https://example.com/" + "caminho-bem-longo/".repeat(12));
  await pagina.waitForFunction(() => document.querySelectorAll(".frente .materiais li[data-material]").length === 2);
  const medidas = await pagina.$$eval(".materiais li[data-material]", (lis) => lis.map((li) => {
    const r = li.getBoundingClientRect();
    const botoes = [...li.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
    return { direita: r.right, botoes: botoes.map((b) => ({ direita: b.right, altura: b.height, largura: b.width })) };
  }));
  for (const m of medidas) {
    assert.ok(m.direita <= 390, "a linha cabe na tela");
    for (const b of m.botoes) assert.ok(b.direita <= 390 && b.largura > 0 && b.altura >= 28, "Editar/Excluir à vista e tocáveis");
  }
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "sem rolagem lateral");
  await cliente("Estúdio Fictício").locator("[data-novo-material]").first().click();
  const form = await pagina.$eval("#material-form", (f) => f.getBoundingClientRect().right);
  assert.ok(form <= 390, "formulário cabe na tela");
  assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await pagina.screenshot({ path: path.join(SAIDA, "shark-materiais-celular.png"), fullPage: true });
  await pagina.click("#material-cancelar");
  assert.deepEqual(pagina.erros, []);
});

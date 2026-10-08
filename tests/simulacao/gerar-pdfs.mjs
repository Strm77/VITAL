// Gera um PDF de fatura para cada cartão da simulação, imitando o layout do banco.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { CARTOES, totalFatura } from "./dados.mjs";

const MES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const valorBR = (v) => Math.abs(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+,)/g, ".");
const [, , ] = [];

function linhasDoBanco(c) {
  const [va, vm, vd] = c.vencimento.split("-").map(Number);
  const d = (iso) => iso.split("-").map(Number);
  const cab = [];
  const linhas = [];
  switch (c.banco) {
    case "nubank":
      cab.push("Nubank", `Data de vencimento: ${vd} ${MES[vm - 1]} ${va}`, `Cartão final ${c.final}`,
        `de 01 SET a 01 ${MES[vm - 1]}    R$ 9.999,99`, "TRANSAÇÕES");
      linhas.push([["07 SET", 40], ["Pagamento em 07 SET", 110], ["-R$ 900,00", 540, "dir"]]);
      for (const l of c.lancamentos) {
        const [, m, dia] = d(l.data);
        const desc = `•••• ${c.final} ${l.desc}${l.p ? ` - Parcela ${l.p[0]}/${l.p[1]}` : ""}`;
        // Nas compras parceladas, a descrição fica um pouco acima da data e do valor, como no PDF real.
        linhas.push([[`${String(dia).padStart(2, "0")} ${MES[m - 1]}`, 40], [desc, 110, "esq", l.p ? 2.5 : 0], [`${l.valor < 0 ? "-" : ""}R$ ${valorBR(l.valor)}`, 540, "dir"]]);
      }
      break;
    case "itau": {
      cab.push("Itaú Personnalité", `Cartão Mastercard final ${c.final}`, `Vencimento: ${String(vd).padStart(2, "0")}/${String(vm).padStart(2, "0")}/${va}`, "Lançamentos: compras e saques");
      const item = (l) => {
        const [, m, dia] = d(l.data);
        return [`${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}`, `${l.desc}${l.p ? ` ${String(l.p[0]).padStart(2, "0")}/${String(l.p[1]).padStart(2, "0")}` : ""}`, valorBR(l.valor)];
      };
      for (let i = 0; i < c.lancamentos.length; i += 2) {
        const linha = [];
        [c.lancamentos[i], c.lancamentos[i + 1]].forEach((l, k) => {
          if (!l) return;
          const [dt, ds, v] = item(l);
          const x = k ? 310 : 40;
          linha.push([dt, x], [ds, x + 40], [v, x + 250, "dir"]);
        });
        linhas.push(linha);
      }
      linhas.push([["Total dos lançamentos atuais 0,00", 40]]);
      break;
    }
    case "bradesco":
      cab.push("Bradesco Cartões", `Cartão final ${c.final}`, `Vencimento ${String(vd).padStart(2, "0")}/${String(vm).padStart(2, "0")}/${va}`, "Data  Histórico de Lançamentos  Valor");
      for (const l of c.lancamentos) {
        const [, m, dia] = d(l.data);
        linhas.push([[`${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}`, 40], [`${l.desc}${l.p ? ` (${String(l.p[0]).padStart(2, "0")}/${String(l.p[1]).padStart(2, "0")})` : ""}`, 90], [valorBR(l.valor), 540, "dir"]]);
      }
      linhas.push([["Total da fatura", 40], [`R$ ${valorBR(totalFatura(c))}`, 540, "dir"]]);
      break;
    case "inter":
      cab.push("Banco Inter", `Cartão **** ${c.final}`, `Vencimento: ${String(vd).padStart(2, "0")}/${String(vm).padStart(2, "0")}/${va}`, "Despesas da fatura");
      for (const l of c.lancamentos) {
        const [a, m, dia] = d(l.data);
        linhas.push([[`${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`, 40], [`${l.desc}${l.p ? ` PARC ${String(l.p[0]).padStart(2, "0")}/${String(l.p[1]).padStart(2, "0")}` : ""}`, 120], [`${l.valor < 0 ? "-" : ""}R$ ${valorBR(l.valor)}`, 540, "dir"]]);
      }
      break;
    case "c6":
      cab.push("C6 Bank", `Cartão final ${c.final}`, `Vencimento: ${vd} de outubro de ${va}`, "Transações do cartão");
      for (const l of c.lancamentos) {
        const [, m, dia] = d(l.data);
        linhas.push([[`${String(dia).padStart(2, "0")} ${MES[m - 1].toLowerCase()}`, 40], [`${l.desc}${l.p ? ` Parcela ${l.p[0]} de ${l.p[1]}` : ""}`, 110], [valorBR(l.valor), 540, "dir"]]);
      }
      break;
  }
  return { cab, linhas };
}

export async function gerarPdfs(pasta) {
  mkdirSync(pasta, { recursive: true });
  const arquivos = [];
  for (const c of CARTOES) {
    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const pagina = pdf.addPage([595, 842]);
    let y = 800;
    const escrever = (t, x, alinhar, deslocamento = 0) => {
      const largura = fonte.widthOfTextAtSize(t, 10);
      pagina.drawText(t, { x: alinhar === "dir" ? x - largura : x, y: y + deslocamento, size: 10, font: fonte });
    };
    const { cab, linhas } = linhasDoBanco(c);
    for (const t of cab) { escrever(t, 40); y -= 20; }
    for (const linha of linhas) { for (const [t, x, a, d] of linha) escrever(t, x, a, d); y -= 18; }
    const arquivo = path.join(pasta, `fatura-${c.banco}.pdf`);
    writeFileSync(arquivo, await pdf.save());
    arquivos.push({ cartao: c, arquivo });
  }
  return arquivos;
}

#!/bin/sh
# Build da Vercel: copia para public/ SÓ os arquivos do site (lista fixa, sem glob),
# para nunca publicar um arquivo que não deveria ir para o ar.
set -eu
cd "$(dirname "$0")/.."
ARQUIVOS="index.html styles.css favicon.ico site.webmanifest
  app.js assinaturas.js bemestar.js comum.js config.js dividas.js estudos.js faturas.js
  metas.js pagamentos.js rotina.js saude.js shark.js stefanini.js stefanini-checkin.js supabase.js torre.js vida.js"
rm -rf public
mkdir -p public
for f in $ARQUIVOS; do cp "$f" public/; done
cp -r icones public/
# Fonte própria (Manrope, OFL): só os arquivos listados.
mkdir -p public/fontes
for f in manrope-latin-wght.woff2 OFL.txt; do cp "fontes/$f" public/fontes/; done
# jsPDF 2.5.1 (MIT), carregado só ao gerar o PDF do check-in: só os arquivos listados.
mkdir -p public/vendor
for f in jspdf.umd.min.js jspdf-LICENSE.txt; do cp "vendor/$f" public/vendor/; done

#!/bin/sh
# Build da Vercel: copia para public/ SÓ os arquivos do site (lista fixa, sem glob),
# para nunca publicar um arquivo que não deveria ir para o ar.
set -eu
cd "$(dirname "$0")/.."
ARQUIVOS="index.html styles.css favicon.ico site.webmanifest
  app.js assinaturas.js bemestar.js comum.js config.js dividas.js estudos.js faturas.js
  metas.js pagamentos.js rotina.js saude.js shark.js supabase.js torre.js vida.js"
rm -rf public
mkdir -p public
for f in $ARQUIVOS; do cp "$f" public/; done
cp -r icones public/

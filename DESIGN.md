---
name: V.I.T.A.L
description: Painel pessoal de uso diário; superfícies neutras e um único roxo de foco.
colors:
  accent-light: "#8140D0"
  accent-dark: "#9C5EEF"
  accent-hover-light: "#682DAC"
  accent-hover-dark: "#B786FF"
  accent-subtle-light: "#F7F2FF"
  accent-subtle-dark: "#1C0934"
  bg-light: "#FFFFFF"
  bg-dark: "#000000"
  surface-light: "#F6F6F6"
  surface-dark: "#111111"
  surface-2-light: "#EFEFEF"
  surface-2-dark: "#1A1A1A"
  border-light: "#E5E5E5"
  border-dark: "#262626"
  field-edge-light: "#8F8F8F"
  field-edge-dark: "#6B6B6B"
  text-light: "#171717"
  text-dark: "#F5F5F5"
  text-2-light: "#575757"
  text-2-dark: "#A3A3A3"
  success-light: "#1D7A50"
  success-dark: "#3CCF91"
  warning-light: "#9A5B00"
  warning-dark: "#F0A830"
  error-light: "#C4372D"
  error-dark: "#FF6B6B"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  subheading:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  track: "4px"
  element: "6px"
  control: "10px"
  component: "14px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover-dark}"
  button-secondary:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
    height: "40px"
  panel:
    backgroundColor: "{colors.surface-dark}"
    rounded: "{rounded.component}"
    padding: "20px"
  input:
    backgroundColor: "{colors.bg-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.control}"
    height: "40px"
  subtab-active:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.bg-dark}"
    rounded: "{rounded.pill}"
---

# Design System: V.I.T.A.L

Gerado com a skill Hue (modelo em `~/.claude/skills/vital-design/design-model.yaml`, validado) a partir das telas
existentes e da direção do dono. Os tokens vivem no `:root` de `styles.css`; os nomes abaixo são os mesmos.

## Overview

App pessoal de uso diário, principalmente no celular. O número vem primeiro: valores em R$, datas e quantidades
em Manrope com algarismos tabulares. As superfícies são cinza neutro puro (branco no claro, preto #000 no escuro).
Um único roxo marca o que está em foco. Verde, vermelho e âmbar só dizem pago/feito, atrasado/erro e atenção.

## Colors

### Primary

Roxo (OKLCH matiz 300): `--acento` = `#9C5EEF` no escuro (texto preto por cima, 5,3:1) e `#8140D0` no claro
(texto branco, 5,9:1). Usado em: botão primário, aba e sub-aba ativas, mês ativo da timeline, links, marcações
(checkbox, rádio, range), anel de foco e ação de adicionar.

### Neutral

Cinza puro (R = G = B): fundo `#000`/`#FFF`, painel `#111`/`#F6F6F6`, borda `#262626`/`#E5E5E5`, borda de campo
`#6B6B6B`/`#8F8F8F` (≥ 3:1), texto `#F5F5F5`/`#171717`, texto secundário `#A3A3A3`/`#575757`.

### Named Rules

- **Roxo só no foco.** Nunca tinge superfícies, bordas ou sombras; nunca em gradiente.
- **Verde é "pago/feito".** Barras de quitação e estados pagos ficam verdes; o roxo marca metas e seleção.
- **Paleta categórica intocada.** As cores das séries (clientes, fatias da pizza) continuam as validadas.

## Typography

Manrope variável (OFL), hospedada no site (`fontes/`), com `system-ui` de reserva. Escala de app (razão ~1,2):
28 / 20 / 17 / 16 / 14 / 13 / 12. Títulos em um peso e uma cor; rótulos em caixa normal, nunca em maiúsculas
espaçadas. Campos de formulário em 16px (o iPhone não dá zoom).

## Layout

Grade de 4px (4, 8, 12, 16, 20, 24, 32, 48). Conteúdo centralizado com largura máxima; no celular, margem de 16px
e uma coluna. Abas das áreas no topo, rolando na horizontal no celular com esmaecido na borda e a ativa centralizada.

## Elevation & Depth

Plano: borda de 1px define as superfícies. Sombra só em sobreposições (toast, dica do gráfico).

## Shapes

Trilho de barra 4px, checkbox 6px, controles 10px, painéis 14px, pílula para abas, sub-abas e chips.

## Components

### Buttons

Primário em roxo; secundário com contorno; "mini" para ações de linha (32px, 36px no celular); "adicionar" no fim
da lista com contorno tracejado e texto roxo. Estados: hover, pressionado (1px para baixo), foco (anel roxo de 2px),
desabilitado (fundo, texto e cursor mudam, não só a opacidade).

### Cards / Containers

Um painel por bloco (fundo `--superficie`, borda, raio 14px). Itens dentro do painel não ganham cartão próprio:
separam-se por divisória ou espaço. Nunca cartão dentro de cartão.

### Inputs / Fields

Fundo da página, borda de campo ≥ 3:1, raio 10px, 40px de altura, 16px de texto, foco com anel roxo.

### Navigation

Abas das áreas: texto; a ativa com sublinhado roxo. Sub-abas em pílula; a ativa preenchida em roxo.

## Do's and Don'ts

### Do:

- Algarismos tabulares em todo número; valores alinhados à direita em tabelas.
- "Carregando…" enquanto a consulta não volta; nunca "nenhum cadastro" nesse meio-tempo.
- Movimento só para confirmar estado (120 a 200ms), e nada com "reduzir movimento".

### Don't:

- Gradiente roxo→azul, brilho roxo, preto puxado para o marrom.
- Cartão dentro de cartão, emoji como ícone, bolinha decorativa de status.
- Rótulo em maiúsculas espaçadas, seta colada no texto do link.

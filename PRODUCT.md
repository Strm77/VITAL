# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Uma única pessoa: o dono do painel. Usa principalmente no celular, várias vezes ao dia e em momentos curtos
(entre uma reunião e outra, no fim do dia), e no desktop quando revisa com calma ou importa faturas.

## Product Purpose

V.I.T.A.L é o painel pessoal que reflete a vida do dono num lugar só: finanças (dívidas, contas, faturas,
assinaturas, metas), estudos, saúde e bem-estar, rotina (tarefas, agenda, projetos, hábitos, tempo), o
estúdio de design SHARK (clientes, frentes, artes, recebimentos) e o CRM de vendas Stefanini (contas,
contatos, oportunidades, reuniões, atividades e meta anual).

Sucesso: abrir, ver o que importa agora e registrar algo em segundos.

## Operating Context

- Registro rápido no celular, com uma mão, muitas vezes entre outras tarefas.
- Leitura de números (valores em R$, datas, quantidades) é o centro de quase toda tela.
- Revisões mais longas e importação de faturas em PDF acontecem no desktop.
- Tempo real entre aparelhos (o que muda no celular aparece no desktop).

## Capabilities and Constraints

- Site estático em HTML/CSS/JS sem framework, publicado na Vercel; dados no Supabase (RLS por usuário,
  Realtime). Aberto como arquivo, usa o localStorage.
- `scripts/build.sh` publica só uma lista fixa de arquivos: todo arquivo novo do site precisa entrar nela.
- Repositório público: nada de dados reais, nomes de clientes, links privados ou seeds com conteúdo real.
- Banco de dados só com mudanças aditivas.
- Idioma pt-BR; datas em dd/mm/aaaa na tela e ISO no banco; moeda em R$.
- Tema claro, escuro e automático (segue o sistema), com a escolha lembrada no aparelho.

## Brand Commitments

- Nome: V.I.T.A.L. Área do estúdio de design: SHARK. Área do CRM: Stefanini.
- Tema escuro em preto neutro puro (#000), sem puxar para o marrom; superfícies e bordas em cinza neutro.
- Roxo é a cor de foco (acentos, botões primários, links, aba ativa, marcações), sem gradiente roxo→azul.

## Evidence on Hand

Não há dados reais no repositório. Exemplos, testes e capturas usam apenas dados fictícios
("(exemplo)", "Conta Exemplo …", e-mails em example.com).

## Product Principles

1. O número vem primeiro: valores e datas legíveis de relance, alinhados e estáveis.
2. Registrar é mais importante que enfeitar: ações sempre à vista e tocáveis no celular.
3. Uma linguagem só para todas as áreas; cada área se distingue pelo conteúdo, não por um estilo próprio.
4. Nunca mostrar "vazio" quando o dado ainda está carregando ou falhou.

## Accessibility & Inclusion

Contraste legível nos dois temas, foco visível no teclado, alvos de toque confortáveis no celular e
respeito a "reduzir movimento".

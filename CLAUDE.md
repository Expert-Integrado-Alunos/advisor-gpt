# advisor-gpt (repositório público da vitrine)

Objetivo: publicar em GitHub Pages a página que explica como a skill `lab:advisor-gpt` funciona (`docs/index.html`).

## Escopo
- Dentro: `docs/index.html` (self-contained, zero CDN), `README.md` com o link canônico no topo.
- Fora: a skill em si (vive em `ericluciano-skills`, privado), credenciais, dados de uso real, nomes de clientes/colaboradores.

## Decisões
- 13/09/2026: repo criado no GitHub pessoal do Eric (`ericlucianoferreira/advisor-gpt`, público) porque Pages não existe em repo privado de conta free; transferência pra org fica pra depois (URL muda pra `<org>.github.io/advisor-gpt/` — atualizar o link do README e o catálogo quando acontecer).
- Página segue o padrão `operacoes:repo-vitrine` (tokens de cor, seções numeradas, footer com procedência).

## Comandos
- Gate antes de commitar: `sh <skill advisor-gpt>/scripts/gate-segredo.sh pasta C:/repos/advisor-gpt`
- Publicar: commit + push na `main`; Pages serve `/docs`. Prova: `curl -s "https://ericlucianoferreira.github.io/advisor-gpt/?v=$(date +%s)"` com 200 e conteúdo novo.

## Gotchas
- Repo PÚBLICO: o hook `pii-pre-push` varre o push; é o comportamento esperado, não desligar.
- Atualizar a página só em mudança estrutural da skill (nova seção do fluxo), nunca a cada versão.

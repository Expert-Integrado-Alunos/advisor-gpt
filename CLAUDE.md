# advisor-gpt (repositório público: a skill + a página)

Objetivo: distribuir aberta a skill `advisor-gpt` do Claude Code (segunda opinião do GPT-6 Astra pelo Codex, com gate de segredo, triagem por reprodução, recibo e modo implementar sob contrato) e publicar em GitHub Pages a página que explica como ela funciona.

- **Repositorio canonico:** `github.com/Expert-Integrado-Ferramentas/advisor-gpt` (org `Expert-Integrado-Ferramentas`, transferido do GitHub pessoal do Eric em 13/09/2026; o endereço antigo redireciona). Cópia somente-leitura pra alunos em `github.com/Expert-Integrado-Alunos/advisor-gpt` (espelho da `main`; atualizar junto com cada push).
- Instalação do usuário: `git clone <repo> ~/.claude/skills/advisor-gpt` (sem plugin, sem marketplace — decisão do Eric, 13/09/2026: "repo solto, sem plugin, porque vai ficar aberto"). Atualizar = `git pull`.

## Escopo
- Dentro: `SKILL.md` (raiz), `scripts/` (revisar.mjs, implementar.mjs, gate-segredo.sh, recibo.mjs, padroes.txt, testes/), `reference/plugin-codex.md`, `docs/index.html` + `docs/og.png` (página, self-contained, zero CDN), `README.md` com o link canônico no topo e a instalação.
- Fora: credenciais, dados de uso real, nomes de clientes/colaboradores, caminhos de máquina. Repo é PÚBLICO: gate antes de todo commit.

## Fonte da verdade e sincronização
- A skill é desenvolvida em `ericluciano-skills/plugins/lab/skills/advisor-gpt` (plugin `lab`, privado) e COPIADA pra cá a cada versão publicada: `SKILL.md`, `scripts/`, `reference/` idênticos (a versão é a do plugin `lab`; ex.: 4.50.2). O `SKILL.md` acha os scripts tanto no cache do plugin quanto em `~/.claude/skills/advisor-gpt` (linha `find` com os dois caminhos).
- A página (`docs/index.html`) é gerada em `C:\tmp\advisor-gpt-vitrine\src\` (`index.src.html` + `build.mjs` embute as fontes; `shot.py` captura; `og.py` gera o og.png) e copiada pra `docs/`. Fonte da página fica fora do repo de propósito (fontes em base64 pesam).

## Comandos
- Gate antes de commitar: `sh scripts/gate-segredo.sh arvore C:/repos/advisor-gpt` (é o próprio gate da skill).
- Suítes offline: `sh scripts/testes/test-gate-segredo.sh`, `test-recibo.sh`, `test-implementar.sh` (51 / 12 / 62 casos em 13/09/2026).
- Publicar: commit + push na `main`; Pages serve `/docs`. Prova: `curl -s --ssl-no-revoke "https://expert-integrado-ferramentas.github.io/advisor-gpt/?v=$(date +%s)"` com 200 e conteúdo novo, e `/og.png` 200.

## Decisões
- 13/09/2026: repo criado no GitHub pessoal (Pages não existe em repo privado de conta free). Página redesenhada em 7 revisões, aprovada em conselho (rodadas com capturas reais + revisão visual do GPT-6 com `--imagens`).
- 13/09/2026: repo passa a conter a skill inteira (antes só a página); a cópia no catálogo dos alunos foi revertida no mesmo dia.

## Gotchas
- Repo PÚBLICO: o hook `pii-pre-push` varre o push; é o comportamento esperado, não desligar.
- Atualizar a página só em mudança estrutural da skill; a skill em si acompanha cada versão do `lab`.
- `allowed-tools` do SKILL.md cita `mcp__expert-brain__save_note` (MCP da casa); sem ele a skill só deixa de gravar a nota de aprendizado.

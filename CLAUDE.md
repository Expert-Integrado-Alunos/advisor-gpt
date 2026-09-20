# advisor-gpt (repositório público: a skill + a página)

Objetivo: distribuir aberta a skill `advisor-gpt` do Claude Code (segunda opinião do GPT-6 Astra pelo Codex, com gate de segredo, triagem por reprodução, recibo e modo implementar sob contrato) e publicar em GitHub Pages a página que explica como ela funciona.

- **Repositorio canonico (fonte):** `github.com/Expert-Integrado-Ferramentas/advisor-gpt` — PRIVADO (decisão do Eric, 13/09/2026). Remote `origin` do clone local.
- **Cópia pública:** `github.com/Expert-Integrado-Alunos/advisor-gpt` — PÚBLICA, espelho da `main` (remote `alunos`). É ela que serve a página (GitHub Pages em `https://expert-integrado-alunos.github.io/advisor-gpt/`) e a instalação (clone sem login). A cópia é escrita pelo robô `Expert-Integrado-Ferramentas/publicador` (`fontes.json`, `publico: true`; dias úteis 06h17 ou `gh workflow run publicar.yml -R Expert-Integrado-Ferramentas/publicador -f so=advisor-gpt`), que adiciona `.publicacao.json` e um rodapé no README — por isso `git push alunos main` é REJEITADO (não fast-forward) desde 13/09/2026; nunca forçar.
- Instalação do usuário: clonar `https://github.com/Expert-Integrado-Alunos/advisor-gpt` em `~/.claude/skills/advisor-gpt` (sem plugin, sem marketplace — "repo solto, sem plugin, porque vai ficar aberto"). Atualizar = `git pull`.
- Histórico: nasceu em `ericlucianoferreira/advisor-gpt` (público), transferido pra Ferramentas em 13/09/2026 e fechado no mesmo dia; a cópia pública ficou na org Alunos (opção C do Eric: fonte privada + cópia pública servindo página e instalação).

## Escopo
- Dentro: `SKILL.md` (raiz), `scripts/` (revisar.mjs, implementar.mjs, gate-segredo.sh, recibo.mjs, padroes.txt, testes/), `reference/plugin-codex.md`, `docs/index.html` + `docs/og.png` (página, self-contained, zero CDN), `README.md` com o link canônico no topo e a instalação.
- Fora: credenciais, dados de uso real, nomes de clientes/colaboradores, caminhos de máquina. Repo é PÚBLICO: gate antes de todo commit.

## Fonte da verdade e sincronização
- A skill é desenvolvida em `ericluciano-skills/plugins/lab/skills/advisor-gpt` (plugin `lab`, privado) e COPIADA pra cá a cada versão publicada: `SKILL.md`, `scripts/`, `reference/` idênticos (a versão é a do plugin `lab`; ex.: 4.50.2). O `SKILL.md` acha os scripts tanto no cache do plugin quanto em `~/.claude/skills/advisor-gpt` (linha `find` com os dois caminhos).
- A página (`docs/index.html`) é gerada em `C:\tmp\advisor-gpt-vitrine\src\` (`index.src.html` + `build.mjs` embute as fontes; `shot.py` captura; `og.py` gera o og.png) e copiada pra `docs/`. Fonte da página fica fora do repo de propósito (fontes em base64 pesam).

## Comandos
- Gate antes de commitar: `sh scripts/gate-segredo.sh arvore C:/repos/advisor-gpt` (é o próprio gate da skill).
- Suítes offline: `sh scripts/testes/test-gate-segredo.sh`, `test-recibo.sh`, `test-implementar.sh`, `test-rollout.sh` (51 / 12 / 62 / 10 casos em 20/09/2026).
- Publicar: `git push origin main` e rodar o publicador (`gh workflow run publicar.yml -R Expert-Integrado-Ferramentas/publicador -f so=advisor-gpt`, ~1 min); Pages da cópia pública serve `/docs`. Prova: `curl -s --ssl-no-revoke "https://expert-integrado-alunos.github.io/advisor-gpt/?v=$(date +%s)"` com 200 e conteúdo novo, e `/og.png` 200.

## Decisões
- 13/09/2026: repo criado no GitHub pessoal (Pages não existe em repo privado de conta free). Página redesenhada em 7 revisões, aprovada em conselho (rodadas com capturas reais + revisão visual do GPT-6 com `--imagens`).
- 13/09/2026: repo passa a conter a skill inteira (antes só a página); a cópia no catálogo dos alunos foi revertida no mesmo dia.
- 20/09/2026 (lab 4.57.3): teto de rodadas vira "padrão 2 por versão, 3ª só a pedido do dono"; triagem ganha coluna Prova (executada/leitura); `revisar.mjs` avisa corte de arquivos e conta execuções do GPT (`scripts/rollout.mjs`). Página: só o limite L5 mudou.

## Gotchas
- Repo PÚBLICO: o hook `pii-pre-push` varre o push; é o comportamento esperado, não desligar.
- Atualizar a página só em mudança estrutural da skill; a skill em si acompanha cada versão do `lab`.
- `allowed-tools` do SKILL.md cita `mcp__expert-brain__save_note` (MCP da casa); sem ele a skill só deixa de gravar a nota de aprendizado.

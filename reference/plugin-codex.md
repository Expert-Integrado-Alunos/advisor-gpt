# advisor-gpt — referência: motor `codex exec`, scripts e recovery

Material de apoio do `SKILL.md` (carregar só quando precisar). Conferido contra o Codex CLI 0.153.4 e o
plugin openai/codex-plugin-cc v1.0.6 em 12/09/2026.

## Contrato dos scripts desta skill (o executor não precisa ler o fonte)

- `scripts/gate-segredo.sh <repo|branch|pasta|arquivo> <alvo> [base]` — varre EXATAMENTE o conjunto que
  `revisar.mjs` vai mandar no mesmo modo. Exit `0` limpo; `1` achou padrão OU arquivo grande demais pra
  inspecionar (lista `origem:linha` no stdout — o trecho NUNCA é impresso, pra não vazar o segredo pro
  histórico da sessão); `2` uso errado ou falha de git/grep (falha
  nunca vira aprovação). Referência de cofre `op://…` é ponteiro, não segredo: sai do trecho antes da
  varredura, o resto da linha continua sendo varrido. Padrões em `scripts/padroes.txt`.
- `scripts/revisar.mjs` roda o Codex com `--ignore-user-config` (sem MCPs/busca web do `config.toml`); auth
  continua vindo do `CODEX_HOME`. Uso: `--modo <repo|branch|pasta|arquivo> --alvo <x> --foco <foco.md> [--base <ref>]
  [--modelo <m>] [--esforco none|minimal|low|medium|high|xhigh|max] [--saida <dir>] [--arquivos a,b] [--dry]`
  Monta o contexto (repo: status + diff staged + diff unstaged + arquivos novos integrais; branch:
  commits `base..HEAD` + diff stat + diff `base...HEAD`; pasta: lista + até 40 arquivos embutidos;
  arquivo: o arquivo), monta o prompt adversarial (adaptado do prompt do plugin oficial, resposta em
  português, veredito `approve|needs-attention`, achados `[critical|high|medium|low] [confiança]`),
  roda `codex exec --json -s read-only --skip-git-repo-check -C <cwd> -o <parecer> -` com o prompt por
  stdin e, se pedidos, `-m <modelo>` e `-c model_reasoning_effort="<esforço>"`. Gera em `--saida`
  (padrão `C:/tmp`): `advisor-gpt-prompt-<stamp>.md`, `advisor-gpt-parecer-<stamp>.md`,
  `advisor-gpt-meta-<stamp>.json` (thread_id, modelo real, esforço, tokens, rate_limits da conta ChatGPT,
  duração, exit code, cauda do stderr). Exit `0` parecer gravado; `2` uso errado / nada a revisar; `3`
  Codex falhou (ver `stderr_tail` no meta). `--dry` monta prompt + meta sem chamar o Codex.
- `scripts/recibo.mjs --meta <meta.json> | --thread <id> [--json]` — linha de recibo: revisão (modo,
  arquivos, minutos, modelo, esforço), GPT (tokens desta revisão: total, entrada, cache, saída,
  raciocínio), conta ChatGPT (plano; por janela — semanal e/ou curta — o consumo DESTA revisão em pontos
  de cota: % no 1º `token_count` do rollout vs % no último, reset em BRT, limite atingido; o Codex só
  informa pontos inteiros), conta Claude da sessão (e-mail ativo do CLI + % sessão 5 h / semana / semana
  Fable do Claude Monitor e, quando o meta traz `claude_inicio` (foto gravada pelo `revisar.mjs` antes
  de chamar o Codex), o movimento no período em pontos; sem Monitor = "sem dado"). Só arquivos locais;
  nunca imprime token ou chave. Campos novos no meta: `rate_limits_inicio`, `claude_inicio`.
- `scripts/testes/test-gate-segredo.sh` (49 casos, 23 sabotagens vermelhas) e
  `scripts/testes/test-recibo.sh` (9 casos: rollout fabricado, meta parcial, fusão temporal, delta de cota). 100% offline.

## Por que `codex exec` e não o plugin (decisão de 12/09/2026)

O plugin oficial (`/codex:adversarial-review`) foi o motor da v1 (lab 4.41.0) e continua instalado pra
uso interativo. Saiu do caminho da skill por três fatos conferidos no fonte v1.0.6:
1. a revisão do plugin não aceita esforço (só `task` tem `--effort`), e o Eric pediu esforço por chamada;
2. a thread do plugin (app-server) não deixa rollout nem linha em `state_5.sqlite`: tokens da revisão
   ficavam invisíveis, e o Eric pediu tokens + estado da conta;
3. `--background` da revisão não destaca o processo (só `task` tem worker), e a revisão morria com a
   sessão do Claude.
`codex exec` resolve os três: `-c model_reasoning_effort`, rollout em `~/.codex/sessions` com evento
`token_count` (tokens + `rate_limits`), processo comum que a tool Bash destaca com `run_in_background`.
O que se perdeu (montagem do diff pelo plugin) `revisar.mjs` refaz com os mesmos comandos git, e o gate
varre o mesmo conjunto.

## Erros comuns e recovery

| Sintoma | Causa | Ação |
|---|---|---|
| `codex: command not found` | Codex CLI ausente | instalar só com OK do Eric (software novo) |
| `codex login status` sem `Logged in` | sem login ChatGPT | fica com o Eric (`codex login` é interativo); parar |
| `revisar.mjs` exit 2 `nada a revisar` | working tree limpo / sem diff contra a base | `--modo branch --base <ref>` ou `--modo pasta` |
| `revisar.mjs` exit 3 | Codex falhou (rede, cota, modelo inexistente) | ler `stderr_tail` no meta; `rate_limit_reached_type` preenchido = cota da conta ChatGPT esgotada, reportar reset; 2 falhas iguais = parar |
| `thread-store conflict: already has an active writer` | app Codex Desktop com conversa aberta na mesma pasta | fechar a conversa no app ou esperar 30 s; 2ª falha igual = reportar |
| Parecer sem arquivo/linha | foco fraco ou alvo grande demais | reduzir o alvo (subpasta, `--arquivos`) e repetir 1x com foco mais específico |
| Bash em background passou de 25 min | alvo grande ou esforço `max` | matar o job, repetir com `--esforco high` ou alvo menor, 1x |
| Recibo diz "sem rollout local" | `codex exec` rodou com `--ephemeral` ou `CODEX_HOME` diferente | usar `--meta` (o meta traz tokens do `--json`) |
| Gate acusa em arquivo que não é segredo | padrão largo demais | adicionar o caso em `test-gate-segredo.sh`, ajustar `padroes.txt`, suite verde antes do bump |

## Notas de design

- Por que triagem obrigatória: no dossiê de 07/09/2026 a revisão do GPT trouxe achados certos E
  achados errados (gabarito heurístico reprovando lado que estava certo). Sem reproduzir, o Claude troca
  um viés pelo outro. Na própria construção desta skill (12/09/2026), 2 rodadas do GPT-6 acharam 10
  defeitos procedentes e 3 fora de escopo (outra skill do mesmo repo).
- Esforço: `max` (config do Eric) levou 13 min por rodada em 1-4 arquivos; é o padrão porque a skill
  roda em ponto de "pronto", não a cada edição. `medium`/`high` pra rodadas intermediárias.
- O que esta skill NÃO é: juiz. É o "outro par de olhos" antes do Eric gastar o dele.

## Notas da rodada 5 (GPT-6 Astra, esforço max, 12/09/2026 — 11 achados, todos aplicados)

- Gate: linhas de diff perdem o marcador `+`/`-`/espaço antes da varredura (padrão ancorado em `^` via
  `+PASSWORD=...` passava). `git ls-files -z` (nome acentuado saía com escape octal e era pulado). Byte NUL em
  arquivo de texto, ou em alvo único do modo `arquivo`, = NÃO INSPECIONADO (exit 1); mídia de verdade (png,
  pdf, zip...) continua pulada em `pasta`/`repo`. Arquivo enumerado e não encontrado = NÃO INSPECIONADO.
- `revisar.mjs`: foco com NUL ou UTF-8 inválido é recusado (exit 4). `web_search="disabled"` explícito.
  Ambiente do Codex sem `CODEX_API_KEY`/`OPENAI_API_KEY`; exige `Logged in using ChatGPT` antes de rodar.
  `--acesso-repo` = cópia auditada (texto ≤ 5 MB, sem NUL, sem `.git`/`.codex`/`node_modules`), apagada ao fim.
  `--imagens` (com `--acesso-repo`) = capturas .png/.jpg/.webp/.gif ≤ 5 MB entram na cópia (`copia_imagens` no meta);
  o prompt manda abrir cada uma com a ferramenta de imagem. Confirmado no rollout de 13/09/2026: o GPT-6 mediu
  contraste e posição de elementos direto das capturas (revisão 3 da vitrine do advisor-gpt).
- Fusão de tokens: contadores são cumulativos; a fonte com `input_tokens` maior é a mais recente e manda; a
  outra só complementa se for o mesmo instante. Caso na suíte do recibo.
- Após bloqueio do gate: nunca `Read`/`cat` na linha (o valor entraria no histórico). Só `origem:linha`.
- Desenho v3 ("GPT implementa"): 3 exigências incorporadas antes de virar código — contrato de desfazer
  verificado, autorização vinculada (hash + consumo único), verificação confinada. Ver
  `C:\tmp\advisor-gpt-vitrine\fluxo-implementar.html` (rascunho) até virar seção desta skill.

## Notas da rodada 6 (GPT-6 Astra, esforço max, 12/09/2026 — 8 achados, todos aplicados; 2ª e última rodada da versão)

- Conferência das 8 correções da rodada 5: 4 "de verdade", 4 "pela metade" — as 4 metades fechadas aqui.
- Gate: o marcador de diff (`+`, `-`, espaço, até 2) sai em QUALQUER entrada, inclusive o PACOTE final (modo
  `arquivo`), que carrega diffs dentro. Nome de arquivo com quebra de linha = exit 2 (enumeração não confiável).
- `revisar.mjs`: a cópia é montada ANTES do gate e o gate `pasta` roda NA CÓPIA (mesma enumeração, mesmos bytes);
  o prompt só traz caminhos relativos (a árvore real não é apontada); `--saida` dentro do alvo é recusado;
  variáveis `CODEX_API_KEY`/`OPENAI_API_KEY` são removidas sem distinguir caixa (Windows); dry-run apaga a cópia.
- Tokens: vence a fonte com maior total (ou entrada+saída), sem completar campos da outra (entrada igual não
  prova mesmo instante).
- Cota: baseline = último `rate_limits` de qualquer sessão do Codex nas 6 h anteriores (`rate_limits_antes`);
  sem baseline e com foto única = só o % atual; `resets_at` diferente ou % que caiu = "(reset no meio)"; conta
  Claude trocada = sem delta. É movimento observado da conta, não medição exata do consumo.

## `scripts/implementar.mjs` — modo "GPT implementa" (v3; contrato v2 na lab 4.49.0 após a rodada 7 do GPT-6)

Casa da skill: `~/.claude/advisor-gpt/` (ou `ADVISOR_GPT_HOME`, só na suíte) — `chave` (32 bytes, HMAC das
autorizações), `ledger/<id>.json` (livro de execuções: consumo, manifesto do que o GPT tocou, desfazer) e `locks/`.

- `autorizar --alvo <raiz> --proposta <md fora do repo> [--itens 1,3] [--saida DIR]` → exige árvore limpa; saída,
  proposta e casa FORA do repo (comparação por componente: `..out` não passa); gate de segredo na proposta (exit 4);
  inventário COMPLETO dos ignorados (`ls-files --others --ignored`): fora de node_modules/dist/.next/.codex e ≤ 50 MB
  = sha256 + cópia em `advisor-gpt-checkpoint-<stamp>/ignorados/`; dentro deles ou maiores = impressão digital
  (tamanho+mtime, sem cópia); hash + cópia do `.git` interno (config, info/exclude, info/attributes, hooks/*).
  Grava `advisor-gpt-autorizacao-<stamp>.json` com `id` e `assinatura` (HMAC sobre repo, HEAD, proposta, hash,
  itens, saída, inventário, git interno). Exit 2 pré-condição · 4 proposta com segredo.
- `executar --autorizacao <json> [--modelo] [--esforco] [--saida]` → assinatura válida (exit 5 se adulterada ou de
  outra máquina), livro ainda não existe (5 = consumida; replay por cópia do JSON cai aqui, mesmo id), proposta com
  o mesmo hash, HEAD igual, árvore limpa, `--saida` fora do repo (2); TRAVA `locks/<sha(repo)>.lock` com O_EXCL
  (5 se outra execução estiver rodando; apagada na saída); `codex login status` = `Logged in using ChatGPT`, env sem
  `CODEX_API_KEY`/`OPENAI_API_KEY`; prompt gravado e passado pelo gate (`arquivo`), depois gate `arvore` na raiz
  (tracked + untracked + ignorados menos os diretórios pesados) — reprovou = exit 4 ANTES de sair qualquer byte;
  livro criado com O_EXCL (consumo atômico) ANTES do Codex; `codex exec -s workspace-write --ignore-user-config
  [-c windows.sandbox=...] -c web_search="disabled" -C <raiz>`; depois: HEAD e `for-each-ref`+`stash list` iguais
  aos de antes (senão `contrato_violado`), `.git` interno igual (senão idem), `arquivos_alterados` (status -z, rename
  com `de`), `indice_alterado` (staged), `diff` contra o HEAD autorizado (staged incluso) + conteúdo dos novos +
  marcadores dos ignorados alterados/novos/sumidos, `SENSÍVEIS` (regex ampliada: tests/spec/fixtures, scripts/tools/
  bin, .github/.husky/hooks/ci, .claude/.codex/.vscode, conftest.py/setup.py/tox/pytest.ini, Makefile/justfile,
  manifestos e lockfiles de npm/pnpm/yarn/pip/poetry/cargo/go/composer, Docker/compose, vercel/netlify/wrangler/fly,
  tsconfig/babel/eslint/prettier/mocha, CI de GitHub/GitLab/Travis/Azure/Jenkins, .npmrc/.nvmrc, .env*, CLAUDE/AGENTS/
  SKILL/GEMINI.md, .cursorrules, .mcp.json, `*.config.{js,ts,json}`, vite/vitest/jest/webpack/... , `*.sh/.ps1/.cmd`),
  gate `lista` em CADA arquivo tocado (tracked modificado/novo E ignorado alterado/novo; conteúdo inteiro; qualquer
  NUL = não inspecionado = reprova), `sandbox_real` do rollout (ausente = contrato violado), resultado `-o` presente
  e não vazio. Livro recebe `terminada` + manifesto. Exit 0 · 3 codex falhou / sandbox não comprovado / resultado
  ausente · 4 gate ou contrato reprovou (mudança no disco, nada saiu; desfazer) · 5 autorização.
- `desfazer --autorizacao <json> [--sem-manifesto]` → exige livro (nunca executada = 5), não desfeita (5), HEAD igual
  ao autorizado OU ao `head_depois` registrado (commit do GPT; outro = 5); árvore só pode conter caminhos do manifesto
  (tracked alterados, ignorados alterados/novos/sumidos) — qualquer outro = trabalho do dono = 5, nada apagado; sem
  `terminada` (processo morreu) só com `--sem-manifesto`. Faz `reset -q --hard <head autorizado>` + `clean -fdq` +
  devolve ignorados divergentes/sumidos do checkpoint + apaga ignorados novos + devolve `.git` interno; prova árvore
  limpa, inventário (sha ou impressão digital) e `.git` interno; pendência = exit 3 INCOMPLETO com a lista (arquivo
  sem cópia: >50 MB ou pasta pesada). Grava `desfeita` no livro.
- `status --autorizacao <json>` → autorização + livro + HEAD atual.
- Suíte `testes/test-implementar.sh` (62 casos, Codex falso; `ADVISOR_GPT_HOME` e `CODEX_HOME` apontam pra pastas da
  suíte). O que o fake NÃO prova: isolamento real do sandbox, rede, processos filhos — coberto pelo smoke real.
- Rodada 7 do GPT-6 (12/09/2026, max, 822 s, 604.590 tokens) sobre a v1 deste script: 10 achados, 10 procedentes
  (JSON adulterável, `..out`, consumo não atômico, proposta antes do gate, gate cego a ignorado/binário, desfazer sem
  execução apagava trabalho do dono, desfazer fingia sucesso com >5 MB/node_modules/ignorado novo, SENSÍVEIS sem
  conftest/jest.config, staged fora do diff e do desfazer, sandbox nulo/resultado ausente/TOML com aspas simples).
- **Windows + `--ignore-user-config`:** a flag descarta `[windows] sandbox = "elevated"` do config.toml e o Codex
  0.153 rebaixa QUALQUER `-s` pra `sandbox_policy: read-only` e rejeita todo comando do modelo (`CreateProcess
  Rejected` no rollout). Provado em 12/09/2026: smoke do implementar sem a chave = GPT não leu nem escreveu; com
  `-c windows.sandbox="elevated"` = `workspace-write` real e arquivo criado. `revisar.mjs` e `implementar.mjs`
  espelham só essa chave (`sandboxWindows()`), gravam `sandbox_pedido`/`sandbox_real` no meta (lido do
  `turn_context` do rollout) e o implementar sai com exit 3 se o real não for workspace-write. Vale também pro
  `--acesso-repo` da revisão: sem a chave o GPT não conseguia ler a cópia auditada (1 `Rejected` no rollout da
  rodada 6).

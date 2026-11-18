---
name: advisor-gpt
description: "Segunda opinião do GPT-6 Astra (OpenAI, pelo Codex local) sobre uma entrega ANTES de declarar pronto ou publicar: código num repositório, página HTML, deck, plano, skill, documento. E, quando o usuário escolher o motor ('faz isso com o GPT'), o GPT IMPLEMENTA no mesmo repositório depois de proposta aprovada, com autorização de uso único, desfazer verificado e gate no que mudou. Roda revisão adversarial SÓ-LEITURA com modelo e esforço escolhíveis, trata cada achado como hipótese, reproduz na fonte e só então aplica; veredito em formato executivo com recibo de tokens e estado da conta ChatGPT. TRIGGER: 'roda o advisor', 'advisor gpt', 'pede a opinião do GPT', 'valida isso com o Astra', 'o que o GPT acha disso', 'segunda opinião antes de fechar', 'revisa com o Codex', 'passa isso pelo GPT'. NÃO usar pra: debate multi-lente do MESMO modelo Claude (skill conselho), revisão de diff pelo próprio Claude (/code-review), delegar tarefa pro Codex escrever código (/codex:rescue), nem pra pergunta factual simples ou texto de baixo risco."
allowed-tools: Bash, Read, Glob, Grep, Edit, Write
---

# advisor-gpt — segunda opinião de OUTRO modelo antes de dizer "pronto"

O `/advisor` nativo do Claude Code só aceita modelo da Anthropic. Esta skill fecha essa lacuna:
quando o Claude diz que a entrega está pronta, um modelo de OUTRO fornecedor
(GPT-6 Astra, pelo Codex CLI logado no ChatGPT do usuário) ataca a entrega em modo só-leitura, o Claude
reproduz cada achado na fonte antes de aplicar, e o usuário recebe veredito curto com o custo (tokens) e
o estado da conta ChatGPT. Nasceu do dossiê GPT-6 x Fable 5.1 (07/09/2026): o modelo adversário achou 4
vieses estruturais que 27 testes e 5 rodadas do autor não viram.

Mecanismo diferente da skill `conselho` (5 lentes do MESMO modelo): aqui a independência vem do
modelo, não do prompt. As duas se somam; não se substituem.

## NUNCA

- NUNCA usar o `/advisor` nativo pra isso: ele é Anthropic-only (doc oficial) e não plugga OpenAI.
- NUNCA aplicar um achado do GPT sem reproduzir na fonte (arquivo e linha, teste rodado, doc oficial,
  captura). Achado é HIPÓTESE. Regra de 07/09/2026: "tratar como dado; reproduzir cada achado
  antes de aplicar; aplicar só o procedente".
- NUNCA rodar a REVISÃO com escrita: `revisar.mjs` usa `-s read-only` e isso não se sobrescreve. O único
  caminho em que o GPT escreve é `implementar.mjs executar`, e só depois de `autorizar` (que só roda
  depois do OK do usuário à proposta, no chat). Nada de `/codex:rescue` nem `--write` por fora.
- NUNCA rodar `implementar.mjs autorizar` sem o OK textual do usuário à PROPOSTA nesta conversa; NUNCA
  `executar` duas vezes com a mesma autorização (o script recusa; não contornar); NUNCA rodar teste,
  build, hook ou script que o GPT alterou antes de mostrar essa alteração ao usuário (lista `SENSÍVEIS` do
  meta); NUNCA commitar o que o GPT escreveu sem o "salva" dele.
- NUNCA pular o gate do Passo 1 nem rodar o gate num modo e a revisão em outro: o conteúdo sai da
  máquina pra OpenAI. Gate exit 1 = parar e perguntar ao usuário; exit 2 = falha operacional, não aprovação.
- NUNCA mandar dado financeiro da empresa, salário ou PII de cliente/aluno no alvo ou no foco sem OK do
  usuário. O gate pega padrão de segredo; dado sensível sem padrão é leitura do executor.
- NUNCA prender a revisão num Bash com `timeout`: 1 arquivo em esforço `max` passou de 10 min. Sempre
  `run_in_background: true` (Passo 3).
- NUNCA entregar ao usuário o parecer bruto do GPT nem um resumo sem os 3 baldes do Passo 4
  (procedente reproduzido / improcedente com prova / não verificável). Parecer sem triagem é ruído.
- NUNCA rodar a 3ª rodada (ou seguinte) na mesma VERSÃO da entrega sem pedido explícito do usuário NAQUELA
  hora ("roda mais uma", "mais uma rodada", "continua o advisor"). Padrão (20/09/2026): até 2
  rodadas por versão; da 3ª em diante o Claude para, reporta e espera. Cada pedido vale pra 1 rodada.
  O que conta como versão: a entrega que o usuário pediu ou viu (o pedido original, ou um pedido novo dele
  de mudança). Corrigir os achados de uma rodada, atualizar o foco ou commitar NÃO abre versão nova —
  a contagem só reinicia com pedido do usuário. Anotar no foco `RODADA: n/2` e, na extra, `PEDIDO: <frase
  do usuário, hh:mm>`. A rodada extra diz no report quantos achados recaem sobre a correção da rodada
  anterior (churn, Passo 4).
- NUNCA declarar "o GPT aprovou" como prova de pronto. O veredito é insumo; a prova de pronto continua
  sendo a verificação real da entrega (teste, URL de produção, ciclo real do usuário).
- NUNCA imprimir no chat o prompt montado, o rollout do Codex ou qualquer token/chave. O recibo mostra
  só e-mail da conta, percentuais e horários.

## SEMPRE

- SEMPRE conferir o ambiente (Passo 0): `codex` instalado e logado, `node` presente, scripts achados.
- SEMPRE escrever o FOCO em 3 blocos (pedido / entregue / ataque). Foco vazio devolve revisão genérica.
- SEMPRE modelo e esforço explícitos no report: o padrão é o do script
  (gpt-6-astra, esforço `max`); o usuário pode pedir outro por chamada ("roda o advisor em esforço médio").
- SEMPRE reproduzir cada achado e classificar nos 3 baldes antes de mexer em qualquer arquivo.
- SEMPRE rodar os testes/verificações já existentes da entrega depois de aplicar os procedentes.
- SEMPRE dizer no report quantos PROCEDENTES tiveram prova `executada` e quantos foram `leitura`, e se o
  GPT executou algo (`comandos_gpt` do meta; 0 desde que o sandbox do Windows quebrou em 18/09/2026 =
  "como reproduzir" do parecer é hipótese, não teste). Rodada em que a maioria dos procedentes recai sobre a
  correção da rodada anterior = churn: recomendar prova executada, não rodada nova.
- SEMPRE conferir os AVISOS de corte do `revisar.mjs`: modo pasta embute até 40 arquivos (`--max-embutidos N`
  sobe o teto; `arquivos_nao_embutidos` no meta lista o que ficou fora) e todo arquivo entra até um teto de
  caracteres (`arquivos_truncados` no meta). Corte não declarado no report = revisão parcial vendida como
  inteira (incidente de 20/09/2026, 103 arquivos, 2 rodadas).
- SEMPRE fechar com o recibo do `recibo.mjs` (tokens desta revisão e conta ChatGPT) no
  veredito — é como o usuário sabe quanto cada agente gastou.
- SEMPRE Git Bash POSIX (no Windows), paths absolutos entre aspas, artefatos na pasta temporária do
  sistema (`$TMPD`, bloco abaixo), nunca dentro da entrega revisada.

## Pré-requisitos

| Item | Como verificar | Se faltar |
|---|---|---|
| Node.js 22+ | `node --version` | Parar e reportar (scripts são Node puro, sem npm install) |
| Codex CLI | `codex --version` (testado com 0.153.4) | `npm i -g @openai/codex` só com OK do usuário (software novo) |
| Login ChatGPT | `codex login status` contém `Logged in using ChatGPT` | Parar: `codex login` é interativo, fica com o usuário. Login por chave de API é RECUSADO pelo `revisar.mjs` (faturaria a API) |
| Scripts desta skill | bloco abaixo acha `revisar.mjs`, `gate-segredo.sh`, `recibo.mjs` | Clonar de novo o repositório da skill em `~/.claude/skills/advisor-gpt` (README) |
| Git (modos repo/branch) | `git -C "<pasta>" rev-parse --show-toplevel` | Usar modo `pasta` ou `arquivo` |

Descobrir os scripts e a pasta temporária (nunca chumbar versão de cache; vale pra skill instalada como plugin e pro clone em `~/.claude/skills/advisor-gpt`, repositório público `github.com/Expert-Integrado-Alunos/advisor-gpt`):

```bash
S="$(find "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins}" "$HOME/.claude/skills" -path '*/advisor-gpt/scripts/revisar.mjs' 2>/dev/null | sort -V | tail -n1)"
[ -z "$S" ] && { echo "ERRO: scripts da advisor-gpt nao encontrados"; exit 1; }
SCRIPTS="$(dirname "$S")"; codex --version && codex login status
TMPD="$(node -e 'const p=require("path");process.stdout.write(require("os").tmpdir().split(p.sep).join(p.posix.sep))')"   # temp do sistema: foco, triagem, proposta, parecer e meta
```

Contrato completo dos 3 scripts, erros e notas de design: `reference/plugin-codex.md`.

## Passos

### Passo 0 — Ambiente, alvo, modelo e esforço

1. Rodar o bloco acima. Sem `Logged in using ChatGPT` = parar e reportar (chave de API não serve: sairia dinheiro).
2. Definir o MODO pelo pedido do usuário (critério verificável, nesta ordem):
   - `repo`: pasta com `.git` E `git status --porcelain` não vazio (trabalho não commitado ou arquivo novo).
   - `branch`: trabalho já commitado; o usuário apontou (ou a sessão sabe) a base (`main`, `origin/main`, um SHA).
   - `pasta`: arquivos fora de git (HTML no Drive, deck, plano) ou subconjunto de um repo (`--arquivos`).
   - `arquivo`: um único arquivo.
   - Nada mudou e nada foi apontado = não há o que revisar: dizer isso e parar.
3. Modelo e esforço: o script fixa `gpt-6-astra` em esforço `max` por padrão (explícito, não depende
   do `config.toml`). O usuário pediu "rápido / esforço baixo / médio / alto" = `--esforco
   low|medium|high|xhigh`; outro modelo = `--modelo`. O recibo mostra modelo e esforço REAIS lidos do
   rollout. Duração medida em 12/09/2026: `max` = 13 min por rodada em 1-4 arquivos; `medium` = 3 min.
4. Acesso do Codex: por padrão ele recebe só o PACOTE (foco + contexto auditado), roda numa pasta vazia,
   sem as ferramentas do `config.toml` do usuário (`--ignore-user-config`) e com busca web desligada de
   forma explícita (`web_search="disabled"`: o `--ignore-user-config` sozinho NÃO desliga, o padrão do
   Codex é "cached"). `--acesso-repo` monta uma CÓPIA do alvo (texto ≤ 5 MB, sem NUL; sem `.git`,
   `.codex`, `node_modules`) e roda o gate NA CÓPIA (exatamente o que o modelo vê, sem janela entre
   auditar e copiar); o prompt só traz caminhos relativos, nunca o caminho da árvore real. Limite
   honesto (GPT-6, rodada 6): o sandbox só-leitura do Codex não impede leitura fora da cópia, então
   o que segura é (a) o modelo não receber nenhum caminho da árvore real e (b) o gate `pasta` limpo.
   Revisão VISUAL (página, deck): `--imagens` junto de `--acesso-repo` copia também .png/.jpg/.webp/.gif
   (≤ 5 MB) pra cópia e o prompt manda o GPT abrir cada uma com a ferramenta de imagem antes de opinar.
   Pixel não passa pelo gate: só capturas geradas por nós (Playwright), nunca print de tela com dado real.
   Sem a flag o GPT opina sobre o visual às cegas (medido 13/09/2026: revisão 2 da vitrine).
   `--saida` dentro do alvo é recusado (a cópia copiaria a si mesma).
5. Postura depois do parecer (o usuário escolhe por frase; anotar no foco como `POSTURA: ...`):
   - `aplicar` (padrão): Claude reproduz cada achado, aplica o PROCEDENTE e re-verifica (Passos 4-5).
   - `so-parecer`: o usuário disse "só me traz o parecer", "não mexe", "quero ver antes", "só avalia". Claude
     faz a triagem (Passo 4) mas NÃO edita nada; entrega a tabela com recomendação por achado e espera o
     OK dele antes de qualquer `Edit`.
   - `implementar-gpt`: o usuário disse "faz isso com o GPT", "deixa o GPT implementar", "vai com o GPT".
     Segue o **Modo implementar** (seção própria abaixo): proposta → OK dele → `implementar.mjs`.
   - `implementar-claude`: "faz com o Claude", "você faz" = Passo 5 normal.
   - Sem frase: o Claude SUGERE o motor na proposta (regra da seção Modo implementar) e o usuário bate o martelo.
   - A REVISÃO nunca escreve (sandbox só-leitura é desenho). Escrita do GPT só pelo `implementar.mjs`.

### Passo 1 — Gate de segredo e dado sensível (antes de qualquer byte sair)

```bash
sh "$SCRIPTS/gate-segredo.sh" repo    "<raiz do repo>"          # modo repo
sh "$SCRIPTS/gate-segredo.sh" branch  "<raiz do repo>" <base>   # modo branch (mesma base do Passo 3)
sh "$SCRIPTS/gate-segredo.sh" pasta   "<pasta>"                 # modo pasta (dentro de git varre a raiz)
sh "$SCRIPTS/gate-segredo.sh" arquivo "<arquivo>"               # modo arquivo
sh "$SCRIPTS/gate-segredo.sh" arquivo "$TMPD/advisor-gpt-foco-<stamp>.md"   # o FOCO também sai da máquina
```

Exit `0` + `gate limpo` = seguir. Exit `1` = lista `origem:linha` (o trecho NÃO é impresso, de
propósito: o bloqueio não pode vazar o segredo pro histórico da sessão). NÃO abrir a linha com `Read`
nem `cat`: o valor entraria no histórico pela resposta da ferramenta. Passar ao usuário só `origem:linha` e a
categoria, PARAR e perguntar (ele olha no editor dele; opções: excluir arquivo, redigir, abortar). Exit `2` = uso errado ou falha de git/grep; corrigir e repetir, nunca
seguir. Este passo é a triagem cedo (barata). A amarração real acontece no Passo 3: `revisar.mjs` grava
foco + contexto num PACOTE único, roda o gate nesses bytes exatos e só então monta o prompt com eles;
reprovou = exit 4 e nada sai. Gate aqui limpo e exit 4 lá = algo mudou no meio; investigar, não repetir.

Sem padrão o gate não enxerga: valor financeiro da empresa, salário, dado pessoal de cliente/aluno. Isso
é leitura do executor: achou = perguntar antes ("posso mandar isso pro GPT?").

### Passo 2 — Escrever o FOCO (3 blocos, em português, 5-15 linhas)

Salvar em `$TMPD/advisor-gpt-foco-<AAAAMMDD-HHMM>.md` e passar pelo gate (Passo 1, modo `arquivo`):

```
PEDIDO: <o que o usuário pediu, 1-3 linhas, com o critério de pronto que ele deu ou que a sessão assumiu>
ENTREGUE (segundo o Claude): <o que foi feito, arquivos principais, o que foi testado e como>
ATAQUE: <o que o GPT deve atacar: (a) o que o pedido exigia e a entrega não cobre; (b) casos de borda e
estado vazio; (c) o que foi declarado testado sem prova; (d) risco pra quem usa (não-dev, Windows +
Git Bash); (e) o que faria diferente e por quê>
```

Formato de saída, gravidade (`critical|high|medium|low`), confiança e "o que falta pra pronto" já vêm no
prompt que `revisar.mjs` monta; não repetir no foco. Mapa fixo dos Passos 4-5: `critical`/`high` =
bloqueia; `medium` = deveria; `low` = opcional.

### Passo 3 — Rodar a revisão (sempre em segundo plano)

Pela tool Bash com `run_in_background: true`, sem `timeout`:

```bash
node "$SCRIPTS/revisar.mjs" --modo repo    --alvo "<raiz do repo>" --foco "$TMPD/advisor-gpt-foco-<stamp>.md" [--esforco medium] [--modelo gpt-6-astra]
node "$SCRIPTS/revisar.mjs" --modo branch  --alvo "<raiz do repo>" --base <ref> --foco "..."
node "$SCRIPTS/revisar.mjs" --modo pasta   --alvo "<pasta>" [--arquivos "<abs1>,<abs2>"] --foco "..."
node "$SCRIPTS/revisar.mjs" --modo arquivo --alvo "<arquivo>" --foco "..."
```

- Avisar o usuário em 1 linha que a revisão está rodando, com modelo, esforço e tempo esperado
  (`max` 10-15 min; `medium` 3-6 min). Não narrar polls.
- Quando a tool Bash avisar que terminou: stdout traz `parecer: <arquivo>`, `meta: <arquivo>`, thread,
  duração, modelo/esforço reais e tokens. Exit `4` = o gate reprovou o pacote (lista no stderr): parar e
  perguntar ao usuário. Exit `3` = Codex falhou: ler `stderr_tail` e `rate_limits.rate_limit_reached_type`
  no meta (cota da conta ChatGPT esgotada = reportar horário de reset, não insistir; `modelo_indisponivel: true` = o
  modelo não está no plano da conta: repetir com `--modelo <outro>`). Exit `2` = uso
  errado / nada a revisar. 2 falhas iguais = parar e reportar.
- Artefatos por execução (sufixo `<AAAAMMDD-HHMMSS-xxxx>`, único): `pacote`, `prompt`, `parecer`,
  `meta`. Duas revisões no mesmo minuto não se misturam.
- Passou de 25 min: matar o job; repetir 1x com `--esforco high` ou alvo menor (`--arquivos`).
- Meta e parecer ficam em `$TMPD` (padrão do `--saida`); são a fonte dos Passos 4 e 6 e do golden run.

### Passo 4 — Triagem: reproduzir cada achado antes de tocar em arquivo

Pra CADA achado do parecer, 1 linha em `$TMPD/advisor-gpt-triagem-<stamp>.md`:

| # | Achado (1 linha) | Gravidade | Onde reproduzir | Como reproduzi | Prova | Balde |
|---|---|---|---|---|---|---|

Coluna **Prova** (obrigatória, medida da retrospectiva de 20/09/2026: em 283 rodadas, 813 achados viraram
PROCEDENTE e só ~3% tinham teste ou comando rodado; o resto foi "li o código e o GPT tem razão"):
- `executada`: o CENÁRIO do achado rodou e a falha foi OBSERVADA (teste que falha antes e passa depois, comando
  que dispara o caso de borda, render/captura mostrando o defeito, curl com a resposta errada). A linha da
  triagem cita o que rodou e o que saiu. Comando que só imprime/inspeciona o fonte, tentativa recusada pelo
  sandbox e "em memória, sem rodar o script" continuam `leitura`.
- `leitura`: a linha existe e faz o que o GPT disse, mas ninguém executou o cenário. Vale pra `medium`/`low`;
  pra `critical`/`high` a regra é tentar `executada` primeiro e, se não der, dizer POR QUE (sem ambiente,
  sem teste, custo) — nunca omitir. O `revisar.mjs` grava no meta `comandos_gpt` (execuções que o runtime do
  Codex CONCLUIU — atividade do GPT, não prova de que a entrega foi testada), `comandos_rejeitados` (sandbox
  recusou) e `comandos_indeterminados`: concluídas = 0 significa que o GPT também só leu.

Baldes (critério, não opinião):
- **PROCEDENTE**: a reprodução mostrou o problema (linha existe e faz o que o GPT disse; teste falha;
  doc oficial confirma; caso de borda dispara). Vai pro Passo 5.
- **IMPROCEDENTE**: a reprodução mostrou o contrário, com a prova anotada (linha citada não existe,
  comportamento já coberto em X, premissa do GPT errada). Fica registrado, nada muda.
- **NÃO VERIFICÁVEL**: exige ambiente/dado/pessoa que a sessão não tem (produção, usuário real, conta
  de terceiro). Vira ressalva no report; nunca "aplicado por precaução".
- **FORA DE ESCOPO**: aponta arquivo de outra entrega/skill no mesmo repo. Não aplicar aqui; registrar
  como comentário no card da outra entrega (ou avisar o usuário em 1 linha) e seguir.

Achado que aponta violação de regra do usuário (CLAUDE.md, memória) é PROCEDENTE por
definição, mesmo que o GPT não soubesse da regra.

### Passo 5 — Aplicar só o procedente e re-verificar

1. Postura `so-parecer` (Passo 0.5): pular este item e o 3; reportar a tabela de triagem com a
   recomendação por achado e PARAR até o OK do usuário. Postura `aplicar`: aplicar cada PROCEDENTE com
   `Edit` (mudança mínima; fix de causa, não paliativo silencioso).
2. Rodar de novo a verificação que a entrega já tinha (teste, script de gate, render, curl). Sem
   verificação existente = dizer isso no report, não inventar uma agora.
3. Se houve PROCEDENTE `critical` ou `high`: 2ª rodada (Passos 1-3 com foco atualizado, `ENTREGUE`
   citando o que mudou; `RODADA: 2/2` no foco). Padrão: até 2 rodadas por versão (versão = o que o usuário
   pediu ou viu; correção decorrente da rodada não reinicia a contagem — regra do bloco NUNCA). Da 3ª em
   diante SÓ com pedido explícito do usuário, uma rodada por pedido; sem pedido = reportar e parar (a
   decisão de continuar é dele). Só
   `medium`/`low` = 1 rodada basta. Rodada em que metade ou mais dos PROCEDENTES recai sobre a
   correção da rodada anterior = "churn": dizer isso no report e recomendar prova EXECUTADA (teste,
   comando) da correção antes de outra rodada, em vez de rodada nova.

### Passo 6 — Recibo e veredito pro usuário (formato executivo)

Recibo (só arquivos locais; nunca chama rede):

```bash
node "$SCRIPTS/recibo.mjs" --meta "$TMPD/advisor-gpt-meta-<stamp>.json"
```

Sai em 3 linhas: revisão (modo, arquivos, minutos, modelo, esforço); GPT (tokens desta revisão);
conta ChatGPT (plano e, por janela que o Codex informar, "semanal 1% → 2% (+1 ponto)"; revisão
pequena sai "menos de 1 ponto"; SEM horário de reset, SEM rodapé — formato fixado em
12/09/2026: "gastou N tokens, saiu de a% e foi pra b%, só isso"). A conta Claude só ganha uma 4ª linha se houver um monitor local de uso gravando a cota
dela; sem ele, a linha não aparece. O que esse "a% → b%" É: movimento observado da conta entre a última foto
anterior à rodada (qualquer sessão do Codex nas 6 h antes) e o fim da rodada — outras sessões da mesma
conta no período entram na conta. Sem foto anterior = só o % atual, sem delta. Reset da janela no
meio = "(reset no meio)", sem número. Com mais de 1 rodada, rodar 1x por meta e somar tokens e pontos no report.

Uma mensagem, teto ~10 linhas:
- Linha 1: farol. 🟢 = nenhum procedente `critical`/`high` restou; 🟡 = ficou NÃO VERIFICÁVEL que
  depende de alguém; 🔴 = achado procedente que exige decisão do usuário (bloco `🔴 **DECISAO:**` no fim).
- 1-3 linhas: o que o GPT-6 Astra achou e o que mudou na entrega por causa disso.
- Bullets: procedentes aplicados (arquivo em `monoespaçado`; "N com prova executada, M por leitura"),
  improcedentes (1 linha cada, com a prova),
  não verificáveis (o que falta e de quem depende), fora de escopo (pra quem foi), "o que falta pra
  pronto" na visão do GPT se divergir da do Claude.
- Recibo: as linhas do `recibo.mjs` (rodadas somadas) + caminho do parecer em `$TMPD`.
- Nada de colar o parecer inteiro; nada de "o GPT aprovou".

## Modo implementar — o GPT escreve no mesmo repositório (v3, 12/09/2026)

Desenho revisado pelo GPT-6 (rodada 5: contrato de desfazer, autorização vinculada, verificação confinada;
rodada 7, sobre o script pronto: 10 furos fechados — autorização assinada, livro de execuções fora do JSON,
trava por repo, gate ANTES de sair qualquer byte, gate em cada arquivo tocado, desfazer com manifesto).
Script: `scripts/implementar.mjs` (contrato em `reference/plugin-codex.md`). Sequência fixa:

I1. **Proposta** (Claude escreve, fora do repo, em `$TMPD/advisor-gpt-proposta-<stamp>.md`): itens
    numerados, cada um com "o que muda, onde, por quê, como vou verificar"; motor sugerido por item.
    Nasce da triagem (Passo 4) ou de um pedido direto do usuário. Regra de sugestão do motor:
    - **GPT** quando: o Claude travou ou errou 2x no mesmo ponto; tarefa isolada com teste que prova;
      segunda implementação pra comparar; o usuário quer poupar a cota Claude.
    - **Claude** quando: toca regra da casa (CLAUDE.md, memória), MCP, mensagem, CRM, deploy, ou é
      mudança pequena que o Claude faz inline.
I2. **OK do usuário no chat** ("vai com o GPT", "só o item 2 com o GPT", "vai com o Claude", "não"). Sem OK
    explícito = não existe I3. "Só o item 2" vira `--itens 2`.
I3. **Pré-condição: árvore limpa.** `git status --porcelain` vazio. Sujo = commit de checkpoint primeiro
    (`checkpoint antes do GPT implementar`), nunca stash (o GPT precisa ver o estado atual).
I4. **Autorizar** (só agora):
    ```bash
    node "$SCRIPTS/implementar.mjs" autorizar --alvo "<raiz do repo>" --proposta "$TMPD/advisor-gpt-proposta-<stamp>.md" [--itens 1,3]
    ```
    Grava `$TMPD/advisor-gpt-autorizacao-<stamp>.json` ASSINADO (chave local em `~/.claude/advisor-gpt/`):
    hash da proposta, HEAD, itens, inventário completo dos ignorados (cópia dos ≤ 50 MB fora de
    node_modules/dist/.next) e hash do `.git` interno (config, hooks, info). Gate de segredo na proposta.
    Exit 2 = pré-condição (árvore suja, proposta/saída dentro do repo); exit 4 = proposta com segredo.
I5. **Executar** (em `run_in_background: true`; `max` = 10-25 min):
    ```bash
    node "$SCRIPTS/implementar.mjs" executar --autorizacao "<json>" [--modelo gpt-6-astra] [--esforco max]
    ```
    Reconfere assinatura/hash/HEAD/árvore, TRAVA o repo (1 execução por vez), roda o gate de segredo no
    prompt e na ÁRVORE que o GPT vai poder ler (tracked + untracked + ignorados como `.env`; node_modules/
    dist/.next ficam fora — limite documentado) ANTES de qualquer byte sair, consome a autorização de forma
    atômica (livro em `~/.claude/advisor-gpt/ledger/`), roda o Codex com workspace-write no repo (sem MCP,
    sem busca web, sem chave de API), grava `resultado`, `diff` (contra o HEAD autorizado, staged incluso) e
    `meta`, confere HEAD/refs/.git interno (commit, branch, stash ou hook do GPT = CONTRATO VIOLADO), roda o
    gate em CADA arquivo tocado (tracked, novo e ignorado; binário = não inspecionado = reprova) e lista
    `SENSÍVEIS` (teste, config de runner, build, scripts, hook, CI, manifesto, instrução, .claude/.codex) e
    `IGNORADOS alterados/novos/sumidos`.
    Exit 4 = gate ou contrato reprovou → recomendar desfazer, nunca seguir (se foi ANTES do Codex, nada saiu
    e nada mudou: segredo na proposta ou na árvore → mover pro cofre e autorizar de novo). Exit 5 =
    autorização inválida (adulterada, proposta mudou, HEAD mudou, já consumida, repo travado) → autorizar de
    novo, com novo OK. Exit 3 = Codex falhou, sandbox não comprovado (Windows sem `[windows] sandbox` no
    config.toml do Codex — o script espelha essa chave porque `--ignore-user-config` a descarta) ou
    resultado ausente.
I6. **Verificação confinada** (Claude): ler o `diff`; se houver `SENSÍVEIS`, mostrar ao usuário ANTES de
    rodar qualquer coisa; só então rodar os testes/verificações que a entrega já tinha; conferir
    `IGNORADOS alterados/novos/sumidos` (estado local tocado = avisar) e `(com STAGED)`. Reportar: o que
    mudou (linguagem de negócio, arquivos em `monoespaçado`), veredito da verificação, recibo
    (`recibo.mjs --meta <meta-implementar>`).
I7. **O usuário decide:** "salva" → Claude commita pelas regras do repo (mensagem cita "implementado pelo
    GPT-6 via advisor-gpt"); "desfaz" → `node "$SCRIPTS/implementar.mjs" desfazer --autorizacao "<json>"`
    (só com execução registrada e ainda não desfeita; RECUSA se a árvore tiver arquivo fora do manifesto do
    que o GPT tocou = trabalho do usuário depois; `reset --hard` no HEAD autorizado + clean + devolve ignorados
    e `.git` interno + apaga ignorados novos; prova inventário; exit 3 INCOMPLETO lista o que não deu pra
    devolver — nunca finge sucesso); "ajusta X" → NOVA proposta (retrabalho não reaproveita autorização).
    Recusou por arquivo fora do manifesto = guardar o trabalho do usuário (commit/cópia) e repetir.

Teto: 1 implementação por autorização; 2 propostas por entrega — na 3ª, o problema é a entrega.

## Erros comuns, recovery e notas de design

Tabela de sintomas e ações em `reference/plugin-codex.md`. Regra geral: erro do runtime (exit 2/3,
`stderr_tail`) não é achado; 2 falhas iguais seguidas = parar e reportar, nunca 3ª tentativa idêntica.

## Testes dos scripts (rodar antes de qualquer bump desta skill)

Três suítes 100% offline (nenhum byte sai da máquina) + 1 dry-run:

```bash
sh   "$SCRIPTS/testes/test-gate-segredo.sh"   # espera PASS=51 FAIL=0 (25 sabotagens vermelhas)
sh   "$SCRIPTS/testes/test-recibo.sh"         # espera PASS=15 FAIL=0 (rollout fabricado, fusão por maior total, foto única, reset no meio, delta de cota, conta Claude com e sem monitor local)
sh   "$SCRIPTS/testes/test-implementar.sh"    # espera PASS=64 FAIL=0 (Codex FALSO: assinatura adulterada, replay por cópia, trava, `..out`, gate na proposta/árvore/cada arquivo tocado, NUL, commit e hook do GPT, staged, sensíveis ampliados, ignorados sem cópia, desfazer com manifesto, modelo fora do plano)
sh   "$SCRIPTS/testes/test-rollout.sh"        # espera PASS=13 FAIL=0 (resultados de ferramenta fabricados: concluído / recusado pelo sandbox / pendente / indeterminado; modelo fora do plano)
node "$SCRIPTS/revisar.mjs" --modo repo --alvo "<um repo com mudança>" --foco "<foco.md>" --dry   # monta prompt + meta sem chamar o Codex
```

- `test-gate-segredo.sh`: 51 casos nos 4 modos; as sabotagens (chave de provedor, token de repositório,
  JWT, senha em JSON com e sem dígito, com espaço, com `$`, em prosa, secret com `!` ou símbolo, variável
  PASSWORD sem dígito, variável exportada, segredo só na MENSAGEM de commit, arquivo acima de 5 MB,
  senha SEM aspas dentro de um diff, `+PASSWORD=` e `++PASSWORD=` dentro do PACOTE final, arquivo novo
  com nome acentuado, byte NUL antes da senha, binário como alvo único) TÊM que sair exit 1 SEM imprimir
  o trecho; uso errado sai exit 2; e os 10 falsos positivos pagos em
  12/09/2026 (nome de variável CSS `sk-*`, `api_key = load_api_key()`, concatenação de variável, nome de
  campo como valor com e sem `_`, placeholder `<...>`, regex compilada `SECRETS = re.compile(...)`, glifo
  `Token:"\uF10F"` em JS minificado, `PASSWORD = os.environ.get(...)`) TÊM que sair exit 0. Padrões de sabotagem montados por concatenação (padrão literal reprovaria no gate estático
  deste repo).
- Autoteste contra o repo real: `sh "$SCRIPTS/gate-segredo.sh" pasta "<raiz do repo de skills>"` = `gate
  limpo`; se acusar, é falso positivo a corrigir (caso novo na suíte) antes do bump.
- Depois do bump, rodar as suítes A PARTIR DO CACHE do plugin instalado, não só do working tree.

---

Procedência: skill criada por Eric Luciano, educador e mentor de IA aplicada a negócios, da Expert Integrado (expertintegrado.com.br).

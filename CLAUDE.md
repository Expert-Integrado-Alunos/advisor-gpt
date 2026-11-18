# advisor-gpt

Skill do Claude Code que pede a segunda opinião do GPT-6 Astra (OpenAI, pelo Codex CLI logado na sua assinatura ChatGPT) sobre uma entrega antes de você declarar "pronto": código, página, deck, plano ou documento. Com o seu OK a uma proposta, ela também deixa o GPT implementar no mesmo repositório, sob contrato conferido pelo script. Este arquivo orienta o Claude Code quando você abre esta pasta (pra entender, testar ou ajustar a skill).

## O que tem aqui
- `SKILL.md`: a skill em si (passos, regras NUNCA/SEMPRE, modo implementar). É o que o Claude Code lê quando você chama "roda o advisor".
- `scripts/revisar.mjs`: revisão só-leitura (monta o pacote, passa no gate de segredo, chama o Codex, grava parecer e meta).
- `scripts/implementar.mjs`: o GPT escreve no repositório, com autorização de uso único, gate antes e depois e desfazer verificado.
- `scripts/gate-segredo.sh` + `scripts/padroes.txt`: varredura de segredo antes de qualquer byte sair da máquina.
- `scripts/recibo.mjs` e `scripts/rollout.mjs`: tokens e cota da rodada, lidos do registro local do Codex.
- `scripts/testes/`: suítes offline.
- `reference/plugin-codex.md`: contrato dos scripts, erros comuns e notas de design.
- `docs/`: a página do projeto (`index.html` + `og.png`, sem dependência externa).

## Instalar e atualizar
- Instalar: `git clone https://github.com/Expert-Integrado-Alunos/advisor-gpt "$HOME/.claude/skills/advisor-gpt"` (no PowerShell, destino `"$env:USERPROFILE\.claude\skills\advisor-gpt"`) e reiniciar o Claude Code.
- Atualizar: `git pull` nesta pasta. Se você mudou algum arquivo aqui, guarde a mudança fora desta pasta antes, senão o `git pull` conflita.

## Requisitos
- Plano pago do ChatGPT com acesso ao Codex (a skill usa a cota dessa assinatura, não a API).
- Codex CLI (`npm i -g @openai/codex`) logado por esse plano: `codex login status` tem que mostrar `Logged in using ChatGPT`. Login por chave de API é recusado de propósito (faturaria a API).
- Node.js 22+, Git e Claude Code, na mesma máquina (não roda no navegador nem no celular).
- Windows: rodar pelo Git Bash; o Codex precisa de `[windows] sandbox` configurado no `~/.codex/config.toml`.
- Modelo padrão `gpt-6-astra`, esforço `max`. Se o seu plano não tiver esse modelo, a revisão para com um aviso pra rodar de novo com `--modelo <outro>`; esforço muda com `--esforco`.

## Como usar
- No Claude Code: "roda o advisor", "pede a opinião do GPT", "valida isso com o Astra". Pra o GPT implementar: "faz isso com o GPT", e ele só escreve depois que você aprova a proposta no chat.
- Os arquivos de trabalho (foco, parecer, meta, triagem, proposta) vão pra pasta temporária do sistema; nada é gravado dentro do repositório revisado.
- Revisão em esforço `max` leva de 10 a 15 minutos; `--esforco medium` fica em 3 a 6.

## Testes (100% offline, nada sai da máquina)
```bash
sh scripts/testes/test-gate-segredo.sh   # espera PASS=51 FAIL=0
sh scripts/testes/test-recibo.sh         # espera PASS=15 FAIL=0
sh scripts/testes/test-implementar.sh    # espera PASS=64 FAIL=0 (Codex falso)
sh scripts/testes/test-rollout.sh        # espera PASS=13 FAIL=0
```
- Ensaio sem chamar o modelo: `node scripts/revisar.mjs --modo repo --alvo "<repo com mudança>" --foco "<foco.md>" --dry`.
- Mexeu em `gate-segredo.sh` ou `padroes.txt`: crie o caso na suíte do gate e deixe a suíte verde antes de usar.

## Cuidados
- Tudo que a revisão manda pro GPT sai da sua máquina pra OpenAI. O gate barra padrão de chave e senha; dado sensível sem padrão (financeiro, dado pessoal de cliente) quem segura é você.
- A revisão nunca escreve (sandbox só-leitura). O GPT só escreve pelo `implementar.mjs`, depois do seu OK.
- Antes de compartilhar uma cópia desta pasta: `sh scripts/gate-segredo.sh pasta "<esta pasta>"` tem que responder `gate limpo`.

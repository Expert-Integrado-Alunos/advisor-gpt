# advisor-gpt

**[→ Como funciona o advisor-gpt](https://ericlucianoferreira.github.io/advisor-gpt/)** — a página do projeto, com o sistema explicado visualmente.

Skill do [Claude Code](https://claude.com/claude-code) que chama um modelo de **outro fornecedor** (GPT-6 Astra, pelo [Codex CLI](https://github.com/openai/codex) e a assinatura ChatGPT de quem usa) pra dar uma segunda opinião adversarial sobre uma entrega ANTES de declarar "pronto" — código num repositório, página, deck, plano, documento. E, quando o dono escolhe o motor ("faz isso com o GPT"), deixa o GPT implementar **no mesmo repositório**, sob um contrato que o script impõe e confere.

## O que ela faz

- **Revisão só-leitura** com gate de segredo amarrado ao envio: o que é auditado é o mesmo byte que sai. Segredo detectado = nada sai, e o bloqueio não imprime o trecho.
- **Triagem por reprodução**: cada achado do GPT é hipótese até o Claude reproduzir na fonte. Três baldes: procedente, fora de escopo, improcedente.
- **Recibo** por rodada: tokens reais e movimento da cota das duas assinaturas (ChatGPT e Claude), lidos de fontes locais.
- **Modo implementar** (v3): proposta aprovada no chat → autorização assinada de uso único, fora do repositório → gate no prompt e na árvore antes de sair qualquer byte → Codex escreve com sandbox `workspace-write` → conferência do contrato (commit/branch/hook do GPT = violação; gate em cada arquivo tocado, ignorados inclusos; sensíveis destacados) → o dono salva ou desfaz (desfazer com manifesto e prova de inventário).

## Como foi validada

Sete rodadas adversariais reais do GPT-6 Astra sobre a própria skill (esforço `max` nas decisivas): 55 achados, 52 procedentes e aplicados, 3 repassados a outro componente, 0 inventados. A sétima, sobre o script que escreve no repositório, achou 10 falhas reais numa versão com suíte 100% verde — todas fechadas antes desta publicação. Suítes offline: gate de segredo (51 casos, 25 sabotagens), recibo (12), implementar (62, com Codex falso). Smoke real com o GPT-6 antes de cada versão.

## Onde está a skill

A skill vive no marketplace privado de skills do autor (plugin `lab`, `skills.ericluciano.com.br`). Este repositório publica a página que explica o funcionamento; ele não contém a skill, credenciais nem dados de uso real além dos números de exemplo do recibo.

## Instalar (alunos da Mentoria Automações Inteligentes)

A skill é distribuída pela central de plugins da mentoria, um repositório privado da organização `Expert-Integrado-Alunos` (só alunos têm acesso). No Claude Code, um comando de cada vez:

```
/plugin marketplace add Expert-Integrado-Alunos/catalogo-mentoria
```

```
/plugin install advisor-gpt@mentoria
```

Reinicie o Claude Code e chame com `roda o advisor`. Guia completo em linguagem leiga: `desenvolvimento/advisor-gpt/README.md` dentro da central. Pré-requisitos: Codex CLI instalado e logado pela assinatura ChatGPT, Node.js 20+, Git.

## Requisitos pra rodar (quem tem a skill)

Claude Code e Codex CLI instalados e logados pela assinatura ChatGPT na mesma máquina. Não roda no navegador nem no celular. No Windows, o Codex precisa de `[windows] sandbox` configurado no `config.toml`.

---

Procedência: skill criada por Eric Luciano, educador e mentor de IA aplicada a negócios, da [Expert Integrado](https://expertintegrado.com.br). Nasceu na Mentoria Automações Inteligentes.

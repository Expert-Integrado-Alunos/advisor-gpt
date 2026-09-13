#!/usr/bin/env node
// revisar.mjs — Passo 3 da skill advisor-gpt: roda a revisão adversarial do GPT (via `codex exec`) e
// devolve parecer + meta (tokens, limites da conta, duração, thread) em arquivos, nunca no chat.
//
// Uso:
//   node revisar.mjs --modo repo    --alvo "<raiz do repo>" --foco <foco.md> [opções]
//   node revisar.mjs --modo branch  --alvo "<raiz do repo>" --base <ref> --foco <foco.md> [opções]
//   node revisar.mjs --modo pasta   --alvo "<pasta>" --foco <foco.md> [--arquivos a,b,c] [opções]
//   node revisar.mjs --modo arquivo --alvo "<arquivo>" --foco <foco.md> [opções]
// Opções:
//   --modelo M      padrão gpt-6-astra (explícito: não depende do ~/.codex/config.toml)
//   --esforco E     none|minimal|low|medium|high|xhigh|max — padrão max (idem)
//   --saida DIR     pasta dos artefatos (padrão C:/tmp); cada execução ganha um sufixo único
//   --acesso-repo   deixa o Codex LER a árvore inteira do alvo (padrão: ele só vê o pacote auditado).
//   --imagens       com --acesso-repo, copia também .png/.jpg/.jpeg/.webp/.gif (≤ 5 MB) pra cópia, pra revisão VISUAL
//                   (capturas de tela). Pixel não passa pelo gate: só use imagens que você mesmo gerou.
//                   Exige gate limpo na árvore inteira (modo pasta do gate) antes de lançar.
//   --dry           monta pacote, roda o gate e grava o meta; NÃO chama o Codex (teste offline)
//
// Como a inspeção fica AMARRADA ao envio (achado do GPT-6 em 12/09/2026, rodada 3):
//   1. o contexto (diff staged + unstaged + arquivos novos | base...HEAD + mensagens de commit | arquivos da
//      pasta | o arquivo) e o FOCO são gravados num único PACOTE em disco;
//   2. o gate-segredo.sh (vizinho deste script) varre ESSE pacote, byte a byte; reprovou = exit 4, nada sai;
//   3. o prompt enviado ao Codex embute exatamente o pacote aprovado;
//   4. o Codex roda em sandbox read-only dentro de uma pasta VAZIA criada pra execução, com --ignore-user-config
//      (sem MCPs/ferramentas herdadas do config.toml), salvo --acesso-repo, quando a árvore inteira passou pelo gate
//      antes. Limite honesto: o sandbox read-only restringe ESCRITA; leitura de disco pelo modelo não é bloqueada por
//      ele — o controle que vale é o gate sobre o pacote e, com --acesso-repo, sobre a árvore inteira.
// Segurança: sem shell (o executável é resolvido e chamado direto), sem rede além do próprio `codex`, nunca
// imprime prompt, pacote ou segredo. Exit: 0 parecer gravado; 2 uso errado; 3 codex falhou; 4 gate reprovou.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(AQUI, "gate-segredo.sh");
const args = process.argv.slice(2);
function opt(n) { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; }
const flag = (n) => args.includes(`--${n}`);
const modo = opt("modo"); const alvo = opt("alvo"); const focoPath = opt("foco");
const base = opt("base");
const modelo = opt("modelo") || "gpt-6-astra";
const esforco = opt("esforco") || "max";
const saida = opt("saida") || "C:/tmp"; const dry = flag("dry"); const acessoRepo = flag("acesso-repo"); const comImagens = flag("imagens");
const IMG = /\.(png|jpe?g|webp|gif)$/i;
const arquivosOpt = opt("arquivos");
const ESFORCOS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

function falha(msg, code = 2) { process.stderr.write(`ERRO: ${msg}\n`); process.exit(code); }
if (!["repo", "branch", "pasta", "arquivo"].includes(modo ?? "")) falha("--modo repo|branch|pasta|arquivo");
if (!alvo) falha("--alvo obrigatório");
if (!focoPath || !fs.existsSync(focoPath)) falha("--foco <arquivo existente> obrigatório (Passo 2)");
if (modo === "branch" && !base) falha("--base <ref> obrigatório no modo branch");
if (!ESFORCOS.has(esforco)) falha(`--esforco inválido: ${esforco} (none|minimal|low|medium|high|xhigh|max)`);
if (!fs.existsSync(GATE)) falha(`gate-segredo.sh não encontrado ao lado deste script (${GATE})`);
if (!fs.existsSync(saida)) fs.mkdirSync(saida, { recursive: true });

const stamp = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(/[-: ]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1-$2") + "-" + crypto.randomBytes(2).toString("hex");
const P = (n, ext = "md") => path.join(saida, `advisor-gpt-${n}-${stamp}.${ext}`);
const metaPath = P("meta", "json");

function git(argv, cwd) {
  const r = spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) falha(`git ${argv.join(" ")} falhou: ${(r.stderr || "").trim()}`);
  return r.stdout;
}
function secao(titulo, corpo) { return `\n### ${titulo}\n\n${corpo.trim() ? corpo : "(vazio)"}\n`; }
function lerTexto(f, max = 400_000) {
  let b; try { b = fs.readFileSync(f); } catch (e) { falha(`não consegui ler ${f}: ${e.message}`); }
  if (b.includes(0)) return "(binário — não incluído)";
  const s = b.toString("utf8");
  return s.length > max ? s.slice(0, max) + `\n… (cortado em ${max} caracteres)` : s;
}
function dentroDe(raiz, f) {
  const R = fs.realpathSync(raiz); let F;
  try { F = fs.realpathSync(f); } catch { falha(`arquivo inexistente: ${f}`); }
  const rel = path.relative(R, F);
  if (rel.startsWith("..") || path.isAbsolute(rel)) falha(`arquivo fora do alvo (${raiz}): ${f}`);
  return F;
}

// 1) contexto — o MESMO conjunto que o gate varre; vai pro pacote
let raiz, rotulo, contexto = "", arquivos = [];
if (modo === "repo") {
  raiz = git(["rev-parse", "--show-toplevel"], alvo).trim();
  rotulo = "working tree (staged + unstaged + arquivos novos)";
  const staged = git(["diff", "--cached", "--no-ext-diff"], raiz);
  const unstaged = git(["diff", "--no-ext-diff"], raiz);
  // -z: nomes crus (core.quotePath escaparia "ação.txt" — achado do GPT-6, rodada 5)
  const z = (out) => out.split("\0").filter(Boolean);
  const untracked = z(git(["ls-files", "--others", "--exclude-standard", "-z"], raiz));
  arquivos = [...new Set([...z(git(["diff", "--cached", "--name-only", "-z"], raiz)), ...z(git(["diff", "--name-only", "-z"], raiz)), ...untracked])].filter(Boolean).sort();
  if (!arquivos.length) falha("nada a revisar: working tree limpo (use --modo branch --base <ref> ou --modo pasta)");
  contexto += secao("Status", git(["status", "--short", "--untracked-files=all"], raiz));
  contexto += secao("Diff staged", staged) + secao("Diff unstaged", unstaged);
  contexto += secao("Arquivos novos (conteúdo integral)", untracked.map((f) => `\n#### ${f}\n\`\`\`\n${lerTexto(path.join(raiz, f))}\n\`\`\``).join("\n"));
} else if (modo === "branch") {
  raiz = git(["rev-parse", "--show-toplevel"], alvo).trim();
  git(["rev-parse", "--verify", base], raiz);
  rotulo = `branch contra ${base} (${base}...HEAD)`;
  arquivos = git(["diff", "--name-only", "-z", `${base}...HEAD`], raiz).split("\0").filter(Boolean);
  if (!arquivos.length) falha(`nada a revisar: sem diferença entre ${base} e HEAD`);
  contexto += secao("Commits", git(["log", "--format=%h %s%n%b", `${base}..HEAD`], raiz));
  contexto += secao("Diff stat", git(["diff", "--stat", `${base}...HEAD`], raiz));
  contexto += secao("Diff", git(["diff", "--no-ext-diff", `${base}...HEAD`], raiz));
} else if (modo === "pasta") {
  if (!fs.existsSync(alvo) || !fs.statSync(alvo).isDirectory()) falha(`pasta inexistente: ${alvo}`);
  raiz = fs.realpathSync(alvo);
  rotulo = `artefato em ${path.basename(raiz)}/`;
  if (arquivosOpt) arquivos = arquivosOpt.split(",").map((s) => s.trim()).filter(Boolean).map((f) => dentroDe(raiz, path.isAbsolute(f) ? f : path.join(raiz, f)));
  else {
    const stack = [raiz];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (![".git", "node_modules", "dist", ".next"].includes(e.name)) stack.push(p); }
        else arquivos.push(p);
      }
    }
  }
  if (!arquivos.length) falha("pasta sem arquivos");
  // caminhos RELATIVOS ao alvo: o prompt não pode apontar pra árvore real (achado do GPT-6, rodada 6)
  const relf = (f) => path.relative(raiz, f).split(path.sep).join("/");
  contexto += secao("Arquivos", arquivos.map((f) => `- ${relf(f)}`).join("\n"));
  contexto += arquivos.slice(0, 40).map((f) => secao(relf(f), "```\n" + lerTexto(f, 120_000) + "\n```")).join("");
  if (arquivos.length > 40) contexto += secao("Aviso", `${arquivos.length - 40} arquivo(s) além dos 40 primeiros não foram embutidos${acessoRepo ? "; o Codex pode abri-los pela pasta (sandbox só-leitura)" : " e o Codex NÃO tem acesso a eles (use --acesso-repo ou --arquivos)"}.`);
} else {
  if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) falha(`arquivo inexistente: ${alvo}`);
  raiz = path.dirname(fs.realpathSync(alvo));
  rotulo = `arquivo ${path.basename(alvo)}`;
  arquivos = [fs.realpathSync(alvo)];
  contexto += secao(path.basename(alvo), "```\n" + lerTexto(alvo) + "\n```");
}

// 2) pacote = foco + contexto, gravado e auditado ANTES de virar prompt
const focoBuf = fs.readFileSync(focoPath);
if (focoBuf.includes(0)) falha("foco contém byte NUL: recusado (texto destinado ao prompt nunca pode virar 'binário pulado')", 4);
let foco; try { foco = new TextDecoder("utf-8", { fatal: true }).decode(focoBuf).trim(); } catch { falha("foco não é UTF-8 válido: recusado", 4); }
if (!foco) falha("foco vazio", 2);
const pacote = `## FOCO\n\n${foco}\n\n## CONTEXTO\n${contexto}`;
fs.writeFileSync(P("pacote"), pacote, "utf8");
function gate(modoGate, alvoGate) {
  const r = spawnSync("sh", [GATE, modoGate, alvoGate], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0) return;
  process.stderr.write((r.stdout || "") + (r.stderr || ""));
  if (r.status === 1) falha(`gate-segredo REPROVOU (${modoGate} ${alvoGate}). Nada foi enviado. Parar e perguntar ao Eric.`, 4);
  falha(`gate-segredo falhou operacionalmente (exit ${r.status}) em ${modoGate} ${alvoGate}. Não seguir.`, 2);
}
{ // --saida dentro do alvo faria a cópia copiar a si mesma (achado do GPT-6, rodada 6)
  const S = fs.realpathSync(saida), Rz = fs.realpathSync(raiz), rel = path.relative(Rz, S);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) falha(`--saida (${saida}) não pode ficar dentro do alvo (${raiz}); use outra pasta de saída`, 2);
}
// 5) cwd do Codex: pasta vazia por execução. Com --acesso-repo, uma CÓPIA só com o que o gate inspecionou:
//    texto ≤ 5 MB, sem NUL, sem .git (histórico com credencial removida seria legível), sem .codex (config de
//    projeto injetaria ferramentas), sem node_modules/dist/.next. Achado do GPT-6, rodada 5: liberar a árvore
//    real deixava conteúdo não auditado ao alcance do modelo.
const cwdCodex = path.join(saida, `advisor-gpt-cwd-${stamp}`);
fs.mkdirSync(cwdCodex, { recursive: true });
// a cópia/pasta de trabalho nunca fica pra trás, nem quando o gate reprova (exit 4) ou algo falha (exit 2)
process.on("exit", () => { try { fs.rmSync(cwdCodex, { recursive: true, force: true }); } catch { /* temporária */ } });
let copiados = 0, ignorados = 0, imagens = 0;
if (acessoRepo) {
  const MAX = 5 * 1024 * 1024, EXCL = new Set([".git", ".codex", "node_modules", "dist", ".next"]);
  const stack = [raiz];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!EXCL.has(e.name)) stack.push(p); continue; }
      if (!e.isFile()) { ignorados++; continue; }
      let b; try { if (fs.statSync(p).size > MAX) { ignorados++; continue; } b = fs.readFileSync(p); } catch { ignorados++; continue; }
      if (b.includes(0)) { if (!(comImagens && IMG.test(e.name))) { ignorados++; continue; } imagens++; }
      const dest = path.join(cwdCodex, path.relative(raiz, p));
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b); copiados++;
      if (copiados > 5000) falha("mais de 5000 arquivos de texto no alvo: use --arquivos ou um alvo menor", 2);
    }
  }
}

gate("arquivo", P("pacote"));
// o gate da árvore roda na CÓPIA, que é exatamente o que o modelo vai ver (mesma enumeração, mesmos bytes, sem
// janela entre auditar e copiar) — achado do GPT-6, rodada 6. A árvore real não entra no prompt nem no cwd.
if (acessoRepo) gate("pasta", cwdCodex);

// 3) prompt — adaptado do prompt adversarial do plugin oficial (prompts/adversarial-review.md, v1.0.6)
const prompt = `<papel>
Você é o revisor adversarial. Seu trabalho é derrubar a confiança nesta entrega, não validá-la.
Responda em português do Brasil.
</papel>

<tarefa>
Revise o pacote abaixo como se procurasse as razões mais fortes pra esta entrega NÃO ser declarada pronta.
Alvo: ${rotulo}
O bloco FOCO traz pedido / entregue / o que atacar, escrito pelo solicitante.
</tarefa>

<postura>
Ceticismo por padrão. Assuma que a entrega falha de forma sutil, cara ou visível ao usuário até a evidência dizer o contrário.
Não dê crédito a boa intenção, correção parcial ou "vai ser feito depois". Caminho feliz só = fraqueza real.
</postura>

<superficie_de_ataque>
Priorize o que é caro, perigoso ou difícil de detectar: o que o pedido exigia e a entrega não cobre; premissas não declaradas;
autenticação, permissão, segredo e fronteira de confiança; perda/duplicação/corrupção de dado e estado irreversível;
retry, falha parcial, idempotência, concorrência, estado vazio, timeout, dependência degradada; incompatibilidade de versão;
falta de observabilidade que esconde falha; risco pra quem usa (não-dev, Windows + Git Bash).
</superficie_de_ataque>

<metodo>
Tente refutar a entrega ativamente. ${acessoRepo ? "Você pode ler os outros arquivos da pasta de trabalho (cópia só-leitura do alvo, só arquivos de texto auditados; sem .git) pra reproduzir." + (imagens ? " A pasta tem " + imagens + " imagem(ns) (.png/.jpg): são capturas de tela fornecidas pelo dono — ABRA cada uma com a ferramenta de ver imagem antes de opinar sobre o visual." : "") + " Não leia nada fora da pasta de trabalho: caminho fora dela está fora do escopo e não deve aparecer no parecer." : "Você NÃO tem acesso a outros arquivos: baseie cada achado no que está no pacote e diga quando uma reprodução exigiria arquivo que não está aqui."}
Cada achado responde: o que pode dar errado, por que este trecho é vulnerável, impacto provável, mudança concreta que reduz o risco.
Só achado material: nada de estilo, nomenclatura ou limpeza de baixo valor; nada especulativo sem evidência.
Não invente arquivo, linha, incidente ou comportamento que não consiga sustentar; se depende de inferência, diga e mantenha a confiança honesta.
Prefira um achado forte a vários fracos. Se parecer seguro, diga isso e não invente achado.
</metodo>

<formato_de_saida>
Markdown, nesta ordem:
1. Linha "Veredito: approve" ou "Veredito: needs-attention" + 1-2 frases de avaliação (tom ship/no-ship, não recapitulação).
2. "Achados:" — lista; cada item começa com "- [critical|high|medium|low] [confiança 0-1] título" e traz: arquivo:linha (ou trecho literal),
   o que pode dar errado, como reproduzir, recomendação concreta.
3. "O que falta pra pronto:" em até 5 linhas.
Nada além disso. Não edite nenhum arquivo.
</formato_de_saida>

<pacote>
${pacote}
</pacote>
`;
fs.writeFileSync(P("prompt"), prompt, "utf8");

// 4) executável do Codex sem shell (o shim codex.cmd concatenaria argumentos com espaço)
function resolverCodex() {
  if (process.platform !== "win32") return { cmd: "codex", pre: [] };
  const r = spawnSync("where", ["codex"], { encoding: "utf8" });
  for (const linha of (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    if (linha.toLowerCase().endsWith(".exe")) return { cmd: linha, pre: [] };
    if (linha.toLowerCase().endsWith(".cmd")) {
      const js = path.join(path.dirname(linha), "node_modules", "@openai", "codex", "bin", "codex.js");
      if (fs.existsSync(js)) return { cmd: process.execPath, pre: [js] };
    }
  }
  return null;
}


// foto da conta Claude ANTES da revisão (Claude Monitor), pra o recibo mostrar quanto a sessão consumiu no período
function fotoClaude() {
  try {
    const cj = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
    const email = cj?.oauthAccount?.emailAddress ?? null;
    const acc = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "logs", "context-tray-accounts.json"), "utf8"));
    const a = email ? acc[email] : null;
    if (!a) return { email, limits: null };
    return { email, limits: (a.last_usage?.limits ?? []).map((l) => ({ key: l.key ?? l.group ?? null, percent: l.percent ?? null, resets_at: l.resets_at ?? null })), fetched: a.last_usage?.fetched ?? a.last_seen ?? null };
  } catch { return null; }
}
// foto ANTES da conta ChatGPT: o último rate_limits que o Codex gravou em qualquer sessão anterior desta máquina
// (até 6 h atrás). Sem isso, o 1º token_count desta rodada já inclui a 1ª requisição e "menos de 1 ponto" não teria
// base (achado do GPT-6, rodada 6). É movimento observado da conta, não medição exata do consumo.
function fotoChatGPTAntes() {
  try {
    const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
    if (!fs.existsSync(root)) return null;
    const agora = Date.now(); let melhor = null;
    const stack = [root];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { stack.push(p); continue; }
        if (!e.name.endsWith(".jsonl")) continue;
        const m = fs.statSync(p).mtimeMs; if (agora - m > 6 * 3600e3) continue;
        if (!melhor || m > melhor.m) melhor = { p, m };
      }
    }
    if (!melhor) return null;
    let rl = null, ts = null;
    for (const line of fs.readFileSync(melhor.p, "utf8").split("\n")) { let o; try { o = JSON.parse(line); } catch { continue; } if (o.payload?.type === "token_count" && o.payload.rate_limits) { rl = o.payload.rate_limits; ts = o.timestamp ?? null; } }
    return rl ? { ...rl, _timestamp: ts, _rollout: melhor.p } : null;
  } catch { return null; }
}
const inicio = Date.now();
// --ignore-user-config: sem MCPs, busca web e demais ferramentas do ~/.codex/config.toml (achado do GPT-6, rodada 4:
// pasta vazia não impede herança de ferramentas). A autenticação continua vindo do CODEX_HOME; modelo e esforço vão explícitos.
// web_search: --ignore-user-config não desliga (padrão do Codex 0.153.4 é "cached") — fixar "disabled" (GPT-6, rodada 5).

// Windows: `--ignore-user-config` descarta também `[windows] sandbox = "..."` do config.toml do Codex, e sem isso o
// Codex 0.153 no Windows REBAIXA a política pra read-only e REJEITA qualquer comando (smoke de 12/09/2026: `-s
// workspace-write` virou `sandbox_policy: read-only`, GPT não leu nem escreveu). Espelhamos só essa chave do usuário.
function sandboxWindows() {
  if (process.platform !== "win32") return [];
  try {
    const cfg = fs.readFileSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml"), "utf8");
    const sec = cfg.split(/^\[/m).find((b) => /^windows\]/.test(b));
    const m = sec && /^\s*sandbox\s*=\s*(?:"([A-Za-z_-]+)"|'([A-Za-z_-]+)')/m.exec(sec);   // TOML aceita "..." e '...'
    if (m) return ["-c", `windows.sandbox="${m[1] ?? m[2]}"`];
  } catch { /* sem config: segue sem espelhar */ }
  process.stderr.write("AVISO: config.toml do Codex sem [windows] sandbox; no Windows a política pode cair pra read-only e o GPT não consegue rodar comando\n");
  return [];
}

const argvCodex = ["exec", "--json", "-s", "read-only", "--skip-git-repo-check", "--ignore-user-config", ...sandboxWindows(), "-c", 'web_search="disabled"', "-m", modelo, "-c", `model_reasoning_effort="${esforco}"`, "-C", cwdCodex, "-o", P("parecer"), "-"];
// ambiente do Codex sem chave de API herdada: a revisão tem que sair da assinatura ChatGPT, nunca faturar API (GPT-6, rodada 5)
const envCodex = { ...process.env }; for (const k of Object.keys(envCodex)) if (["CODEX_API_KEY", "OPENAI_API_KEY"].includes(k.toUpperCase())) delete envCodex[k]; // Windows: env não distingue caixa
const meta = {
  stamp, modo, alvo, base: base ?? null, rotulo, arquivos_n: arquivos.length, arquivos: arquivos.slice(0, 200),
  modelo_pedido: modelo, esforco_pedido: esforco, acesso_repo: acessoRepo, cwd_codex: cwdCodex, copia_arquivos: copiados, copia_ignorados: ignorados, copia_imagens: imagens, foco: focoPath,
  pacote: P("pacote"), prompt: P("prompt"), parecer: P("parecer"), prompt_chars: prompt.length, gate: "aprovado", dry,
  comando: `codex ${argvCodex.join(" ")}`, sandbox_pedido: "read-only", sandbox_real: null, thread_id: null, modelo_real: null, esforco_real: null, tokens: null, rate_limits: null, rate_limits_inicio: null, rate_limits_antes: fotoChatGPTAntes(), inicio_iso: new Date(inicio).toISOString(), claude_inicio: fotoClaude(),
  duracao_s: null, exit_code: null, stderr_tail: null, rollout: null
};
if (dry) { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n"); process.stdout.write(`dry-run: gate aprovado; pacote ${P("pacote")}; prompt ${P("prompt")}; meta ${metaPath}\n`); try { fs.rmSync(cwdCodex, { recursive: true, force: true }); } catch { /* cópia temporária */ } process.exit(0); }

const exe = resolverCodex();
if (!exe) falha("codex não encontrado no PATH (nem .exe nem shim .cmd com node_modules/@openai/codex)");
{ // login EFETIVO pela assinatura ChatGPT ("Logged in" sozinho aceitaria chave de API e faturaria — GPT-6, rodada 5)
  const st = spawnSync(exe.cmd, [...exe.pre, "login", "status"], { encoding: "utf8", env: envCodex, shell: false });
  const txt = `${st.stdout || ""}${st.stderr || ""}`;
  if (!/Logged in using ChatGPT/i.test(txt)) falha(`codex não está logado pela assinatura ChatGPT (status: ${txt.trim().split("\n")[0] || "vazio"}). Não rodar: sairia da API ou de conta errada.`, 2);
}
const r = spawnSync(exe.cmd, [...exe.pre, ...argvCodex], { cwd: cwdCodex, input: prompt, encoding: "utf8", env: envCodex, maxBuffer: 256 * 1024 * 1024, shell: false });
meta.duracao_s = Math.round((Date.now() - inicio) / 1000);
meta.exit_code = r.status;
meta.stderr_tail = (r.stderr || "").split("\n").filter((l) => l && !/DEP0190|trace-deprecation|failed to load skill|Reading additional input|rmcp::|oauth::/.test(l)).slice(-5).join("\n") || null;
const CAMPOS_TOKENS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
// funde campo a campo (fonte prioritária por cima, sem apagar campo que só a outra tem); total só quando entrada E saída existem
// contadores são cumulativos e o registro FINAL é o mais completo/maior: escolhe a fonte com maior total
// (ou entrada+saída, ou entrada) e NÃO completa campos com a outra fonte (instante desconhecido). Achado do
// GPT-6, rodada 6: entrada igual não prova mesmo instante (rollout 100/10/110 x meta 100/30/130 dava 110).
function pontuacao(t) {
  if (!t || typeof t !== "object") return -1;
  if (typeof t.total_tokens === "number") return t.total_tokens;
  if (typeof t.input_tokens === "number" && typeof t.output_tokens === "number") return t.input_tokens + t.output_tokens;
  if (typeof t.input_tokens === "number") return t.input_tokens;
  if (typeof t.output_tokens === "number") return t.output_tokens;
  return -1;
}
function fundeTokens(x, y) {
  const px = pontuacao(x), py = pontuacao(y);
  if (px < 0 && py < 0) return null;
  const p = py > px ? y : x;
  const n = {};
  for (const k of CAMPOS_TOKENS) if (typeof p?.[k] === "number") n[k] = p[k];
  if (n.total_tokens == null && typeof n.input_tokens === "number" && typeof n.output_tokens === "number") n.total_tokens = n.input_tokens + n.output_tokens;
  return Object.keys(n).length ? n : null;
}
for (const line of (r.stdout || "").split("\n")) {
  if (!line.trim()) continue;
  let ev; try { ev = JSON.parse(line); } catch { continue; }
  if (ev.type === "thread.started" && ev.thread_id) meta.thread_id = ev.thread_id;
  if (ev.type === "turn.completed" && ev.usage) meta.tokens = fundeTokens(ev.usage, meta.tokens);
}
// o rollout do thread traz tokens completos + rate_limits (token_count) e o modelo/esforço reais (turn_context)
if (meta.thread_id) {
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
  const stack = fs.existsSync(root) ? [root] : [];
  while (stack.length && !meta.rollout) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p); else if (e.name.includes(meta.thread_id)) { meta.rollout = p; break; }
    }
  }
  if (meta.rollout) {
    for (const line of fs.readFileSync(meta.rollout, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      const p = o.payload ?? {};
      if (p.type === "token_count") { if (p.info?.total_token_usage) meta.tokens = fundeTokens(p.info.total_token_usage, meta.tokens); if (p.rate_limits) { if (!meta.rate_limits_inicio) meta.rate_limits_inicio = p.rate_limits; meta.rate_limits = p.rate_limits; } }
      if (o.type === "turn_context") { if (p.model) meta.modelo_real = p.model; if (p.effort ?? p.reasoning_effort) meta.esforco_real = p.effort ?? p.reasoning_effort; if (p.sandbox_policy?.type) meta.sandbox_real = p.sandbox_policy.type; }
    }
  }
}
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
try { fs.rmSync(cwdCodex, { recursive: true, force: true }); } catch { /* cópia temporária; ignora */ }
if (r.status !== 0 || !fs.existsSync(P("parecer")) || !fs.statSync(P("parecer")).size) {
  process.stderr.write(`ERRO: codex exec saiu com ${r.status}; parecer ausente. stderr: ${meta.stderr_tail ?? "(vazio)"}\nmeta: ${metaPath}\n`);
  process.exit(3);
}
process.stdout.write(`parecer: ${P("parecer")}\nmeta: ${metaPath}\nthread: ${meta.thread_id ?? "?"} | ${meta.duracao_s}s | modelo ${meta.modelo_real ?? modelo} esforço ${meta.esforco_real ?? esforco} | tokens: ${meta.tokens?.total_tokens ?? "?"}\n`);

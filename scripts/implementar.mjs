#!/usr/bin/env node
// implementar.mjs — modo "GPT implementa" da skill advisor-gpt (desenho v3, 12/09/2026; revisado pelo GPT-6 nas
// rodadas 5 e 7 — a 7ª, sobre este script, achou 10 furos, todos fechados na v2 do contrato, abaixo).
//
// O GPT-6 (Codex CLI, assinatura ChatGPT) escreve NO MESMO repositório, mas só depois de uma proposta aprovada pelo
// dono e dentro de um contrato que este script impõe. Subcomandos, sempre nesta ordem:
//
//   node implementar.mjs autorizar --alvo <raiz do repo> --proposta <proposta.md> [--itens 1,3] [--saida DIR]
//       Só depois do OK do dono no chat. Exige árvore LIMPA. Grava a autorização FORA do repo (--saida), ASSINADA
//       (HMAC com chave local em ~/.claude/advisor-gpt/chave): repo, HEAD, hash da proposta, itens, inventário dos
//       arquivos ignorados pelo git (hash; cópia dos ≤ 50 MB fora de node_modules/dist/.next) e hash do interior do
//       .git que importa (config, hooks, info). Gate de segredo na proposta.
//   node implementar.mjs executar --autorizacao <arquivo.json> [--modelo m] [--esforco e] [--saida DIR]
//       Reconfere assinatura, hash da proposta, repo, HEAD, árvore limpa; TRAVA o repo (1 execução por vez); gate de
//       segredo no PROMPT e na ÁRVORE que o GPT vai poder ler (tracked + untracked + ignorados fora dos diretórios
//       pesados) ANTES de qualquer byte sair; consome a autorização de forma ATÔMICA num livro fora do JSON
//       (~/.claude/advisor-gpt/ledger/<id>.json, criado com O_EXCL — replay e 2 escritores impossíveis); roda o Codex
//       (workspace-write, sem MCP, sem busca web, sem chave de API; sandbox do Windows espelhado); depois: HEAD e
//       refs não podem ter mudado (commit/branch/stash do GPT = contrato violado), .git interno intacto, diff contra
//       o HEAD autorizado (staged incluso), gate de segredo em CADA arquivo efetivamente tocado (tracked, novo E
//       ignorado; binário/NUL = não inspecionado = reprova), SENSÍVEIS destacados (teste, build, config de runner,
//       hook, CI, manifesto, instrução, .claude/.codex), inventário dos ignorados conferido (alterado, novo, sumido).
//   node implementar.mjs desfazer --autorizacao <arquivo.json> [--sem-manifesto]
//       Só com execução registrada no livro e ainda não desfeita. Recusa se a árvore tiver arquivo FORA do manifesto
//       do que o GPT tocou (trabalho do dono). reset --hard no HEAD autorizado + clean dos novos + devolve ignorados
//       do checkpoint + apaga ignorados novos + devolve .git interno; prova inventário. Um comando, verificado.
//   node implementar.mjs status --autorizacao <arquivo.json>
//
// Exit: 0 ok · 2 uso errado/pré-condição (árvore suja, saída/proposta dentro do repo, codex ausente, login por API) ·
//       3 codex falhou / sandbox não comprovado / resultado ausente / desfazer incompleto · 4 gate de segredo ou
//       CONTRATO reprovou (proposta ou árvore com segredo ANTES de sair = nada saiu; depois = mudança no disco, nada
//       enviado, recomendação: desfazer) · 5 autorização inválida (assinatura, hash, HEAD, repo, já consumida, repo
//       travado, desfazer sem execução/duplicado/fora do manifesto).
//
// Teste offline: --fake-codex <script.js> troca o Codex por um script Node (mesmo stdin/cwd). Só com o flag explícito;
// o meta registra fake:true e o recibo avisa. ADVISOR_GPT_HOME muda a casa (chave/ledger/locks) — só na suíte.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(AQUI, "gate-segredo.sh");
const args = process.argv.slice(2);
const sub = args[0];
function opt(n) { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; }
const flag = (n) => args.includes(`--${n}`);
function falha(msg, code = 2) { process.stderr.write(`ERRO: ${msg}\n`); process.exit(code); }
if (!["autorizar", "executar", "desfazer", "status"].includes(sub ?? "")) falha("uso: implementar.mjs autorizar|executar|desfazer|status ...");

const saida = opt("saida") || "C:/tmp";
if (!fs.existsSync(saida)) fs.mkdirSync(saida, { recursive: true });
const stamp = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(/[-: ]/g, "").slice(0, 14).replace(/^(\d{8})(\d{6})$/, "$1-$2") + "-" + crypto.randomBytes(2).toString("hex");
const P = (n, ext = "md") => path.join(saida, `advisor-gpt-${n}-${stamp}.${ext}`);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const real = (p) => fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);

// casa: chave de assinatura, livro de execuções e travas — fora de qualquer repositório
const CASA = process.env.ADVISOR_GPT_HOME || path.join(os.homedir(), ".claude", "advisor-gpt");
fs.mkdirSync(path.join(CASA, "ledger"), { recursive: true }); fs.mkdirSync(path.join(CASA, "locks"), { recursive: true });
function chave() {
  const p = path.join(CASA, "chave");
  if (!fs.existsSync(p)) fs.writeFileSync(p, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(p, "utf8").trim();
}
const CAMPOS_ASSINADOS = ["versao", "id", "criada", "repo", "head", "proposta", "proposta_sha256", "itens", "saida", "ignorados_checkpoint", "ignorados", "git_interno"];
function assinar(aut) { const canon = JSON.stringify(CAMPOS_ASSINADOS.map((k) => [k, aut[k] ?? null])); return crypto.createHmac("sha256", chave()).update(canon).digest("hex"); }
const ledgerDe = (aut) => path.join(CASA, "ledger", `${aut.id}.json`);
const lerLedger = (aut) => { const p = ledgerDe(aut); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
const gravarLedger = (aut, L) => fs.writeFileSync(ledgerDe(aut), JSON.stringify(L, null, 2) + "\n");

function git(argv, cwd, { ok = false } = {}) {
  const r = spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !ok) falha(`git ${argv.join(" ")} falhou: ${(r.stderr || "").trim()}`);
  return r.stdout ?? "";
}
const z = (out) => out.split("\0").filter(Boolean);
function raizDe(alvo) {
  if (!alvo || !fs.existsSync(alvo)) falha(`--alvo inexistente: ${alvo}`);
  return real(git(["rev-parse", "--show-toplevel"], alvo).trim());
}
// fora de raiz? compara por COMPONENTE (achado do GPT-6, rodada 7: `..out` passava como "fora" por startsWith(".."))
function foraDoRepo(raiz, p) {
  const rel = path.relative(raiz, real(p));
  return rel !== "" && (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel));
}
function estado(raiz) {
  const head = git(["rev-parse", "HEAD"], raiz).trim();
  const sujo = z(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], raiz));
  return { head, sujo };
}
// refs + stash: commit, branch, tag ou stash criados pelo GPT = contrato violado (o prompt só PEDE; isto CONFERE)
function refs(raiz) { return sha(git(["for-each-ref", "--format=%(refname) %(objectname)"], raiz) + "\n" + git(["stash", "list"], raiz, { ok: true })); }
const EXCL_DIRS = /(^|\/)(node_modules|dist|\.next|\.codex)(\/|$)/;
const MAX_COPIA = 50 * 1024 * 1024;
// inventário COMPLETO dos ignorados pelo git (estado local: .env, bancos, caches). Fora dos diretórios pesados: hash
// + cópia (≤ 50 MB). Dentro deles (node_modules, dist, .next, .codex): só impressão digital (tamanho + mtime) — dá pra
// PROVAR que nada mudou, não dá pra devolver. (Rodada 7: >5 MB e node_modules ficavam invisíveis e o desfazer dizia ok.)
function inventarioIgnorados(raiz) {
  const lista = z(git(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], raiz));
  const out = [];
  for (const f of lista) {
    const p = path.join(raiz, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    if (EXCL_DIRS.test(f) || st.size > MAX_COPIA) out.push({ rel: f, bytes: st.size, mtime: Math.round(st.mtimeMs), copia: false });
    else out.push({ rel: f, bytes: st.size, sha: sha(fs.readFileSync(p)), copia: true });
  }
  return out;
}
const digital = (f) => f.sha ? `sha:${f.sha}` : `fp:${f.bytes}:${f.mtime}`;
function digitalAtual(raiz, f) {
  try { const st = fs.statSync(path.join(raiz, f.rel)); if (!st.isFile()) return null; return f.sha ? `sha:${sha(fs.readFileSync(path.join(raiz, f.rel)))}` : `fp:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return null; }
}
// interior do .git que muda comportamento (hooks rodam código; config aponta remoto/credencial; info/exclude esconde arquivo)
function gitInterno(raiz) {
  const g = git(["rev-parse", "--git-dir"], raiz).trim(); const gd = path.isAbsolute(g) ? g : path.join(raiz, g);
  const out = {}; const add = (rel) => { const p = path.join(gd, rel); try { const st = fs.statSync(p); if (st.isFile() && st.size <= MAX_COPIA) out[rel] = sha(fs.readFileSync(p)); } catch { /* ausente */ } };
  add("config"); add("info/exclude"); add("info/attributes");
  for (const d of ["hooks"]) { try { for (const e of fs.readdirSync(path.join(gd, d))) add(`${d}/${e}`); } catch { /* sem hooks */ } }
  return { dir: gd, hashes: out };
}
// SENSÍVEL = o Claude mostra ao dono ANTES de rodar qualquer verificação: teste, config de runner (conftest, jest/vitest/
// pytest/eslint/babel...), build, scripts, hook, CI, manifesto, lockfile, instrução (CLAUDE/AGENTS/SKILL), .claude/.codex/
// .vscode, shell. Lista ampliada na rodada 7 (conftest.py, jest.config.js, scripts/build.mjs, .claude/settings.local.json passavam).
const SENSIVEL = /(^|\/)(tests?|spec|specs|__tests__|testes|test_utils|fixtures|\.github|\.gitlab|\.husky|hooks?|ci|scripts?|tools?|bin|\.claude|\.codex|\.vscode|\.idea|\.devcontainer)(\/|$)|\.(test|spec)\.[a-z]+$|(^|\/)(conftest\.py|setup\.py|setup\.cfg|tox\.ini|pytest\.ini|noxfile\.py|Makefile|justfile|Taskfile\.ya?ml|Rakefile|Gemfile|Gemfile\.lock|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json|pyproject\.toml|requirements[^/]*\.txt|Pipfile|Pipfile\.lock|poetry\.lock|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|composer\.json|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|vercel\.json|netlify\.toml|wrangler\.toml|fly\.toml|Procfile|tsconfig[^/]*\.json|jsconfig\.json|babel\.config\.[a-z]+|\.babelrc[^/]*|\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|\.mocharc[^/]*|\.nycrc[^/]*|\.pre-commit-config\.yaml|\.gitlab-ci\.yml|\.travis\.yml|azure-pipelines\.yml|Jenkinsfile|bitbucket-pipelines\.yml|\.npmrc|\.yarnrc[^/]*|\.nvmrc|\.tool-versions|\.env[^/]*|CLAUDE\.md|AGENTS\.md|SKILL\.md|GEMINI\.md|\.cursorrules|\.mcp\.json)$|[^/]*\.config\.(js|cjs|mjs|ts|mts|cts|json)$|(^|\/)(vite|vitest|jest|webpack|rollup|esbuild|tsup|next|nuxt|astro|svelte|tailwind|postcss|playwright|cypress|karma|gulpfile|gruntfile|build|prebuild|postinstall|preinstall)[^/]*\.(js|cjs|mjs|ts|mts|cts|json|py)$|\.(sh|bash|zsh|ps1|psm1|cmd|bat)$/i;

// gate de segredo: exit 0 limpo · 1 achou/não inspecionado · 2 falha operacional (nunca vira aprovação)
function gate(modo, alvo, extra = []) {
  const g = spawnSync("sh", [GATE, modo, alvo, ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: g.status, saida: (g.stdout || "") + (g.stderr || "") };
}

// ---------------------------------------------------------------- autorizar
if (sub === "autorizar") {
  const alvo = opt("alvo"), propostaPath = opt("proposta");
  if (!propostaPath || !fs.existsSync(propostaPath)) falha("--proposta <arquivo existente> obrigatório (o Claude escreve, o dono aprova no chat)");
  const raiz = raizDe(alvo);
  const S = real(saida);
  if (!foraDoRepo(raiz, S)) falha(`--saida (${saida}) não pode ficar dentro do repositório: a autorização tem que morar fora do alcance de escrita do GPT`);
  if (!foraDoRepo(raiz, propostaPath)) falha("a proposta tem que morar fora do repositório (o GPT poderia reescrevê-la)");
  if (!foraDoRepo(raiz, CASA)) falha(`a casa da skill (${CASA}) não pode ficar dentro do repositório`);
  const propostaBuf = fs.readFileSync(propostaPath);
  if (propostaBuf.includes(0)) falha("proposta contém byte NUL", 4);
  { const g = gate("arquivo", real(propostaPath)); if (g.status !== 0) { process.stderr.write(g.saida); falha("gate de segredo REPROVOU a proposta: ela seria enviada ao GPT. Redigir sem o trecho.", 4); } }
  const { head, sujo } = estado(raiz);
  if (sujo.length) falha(`árvore NÃO está limpa (${sujo.length} entrada(s) em git status). Contrato do desfazer exige tudo commitado antes do GPT escrever: commit de checkpoint primeiro. Primeiros: ${sujo.slice(0, 5).join(" | ")}`);
  const itens = (opt("itens") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ign = inventarioIgnorados(raiz);
  const gi = gitInterno(raiz);
  const cpDir = P("checkpoint", "d").replace(/\.d$/, "");
  for (const f of ign) if (f.copia) { const dest = path.join(cpDir, "ignorados", f.rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(raiz, f.rel), dest); }
  for (const rel of Object.keys(gi.hashes)) { const dest = path.join(cpDir, "git-interno", rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(gi.dir, rel), dest); }
  const aut = {
    versao: 2, id: crypto.randomBytes(8).toString("hex"), criada: new Date().toISOString(), repo: raiz, head, proposta: real(propostaPath), proposta_sha256: sha(propostaBuf),
    itens: itens.length ? itens : ["todos"], saida: S, ignorados_checkpoint: cpDir, ignorados: ign, git_interno: gi.hashes
  };
  aut.assinatura = assinar(aut);
  const autPath = P("autorizacao", "json");
  fs.writeFileSync(autPath, JSON.stringify(aut, null, 2) + "\n");
  const copiados = ign.filter((f) => f.copia).length;
  process.stdout.write(`autorizacao: ${autPath}\nrepo ${raiz} @ ${head.slice(0, 7)} | proposta ${path.basename(propostaPath)} sha ${aut.proposta_sha256.slice(0, 12)} | itens ${aut.itens.join(",")} | ignorados no inventário: ${ign.length} (${copiados} com cópia) | git interno: ${Object.keys(gi.hashes).length} arquivo(s)\n`);
  process.exit(0);
}

// ---------------------------------------------------------------- carregar autorização (executar/desfazer/status)
const autPath = opt("autorizacao");
if (!autPath || !fs.existsSync(autPath)) falha("--autorizacao <arquivo.json> obrigatório (gerado por `autorizar`)");
const aut = JSON.parse(fs.readFileSync(autPath, "utf8"));
if (aut.versao !== 2 || !aut.id || !aut.assinatura) falha("autorização em formato antigo ou incompleto: autorizar de novo", 5);
if (assinar(aut) !== aut.assinatura) falha("autorização ADULTERADA (assinatura não bate) ou de outra máquina: autorizar de novo", 5);
const raiz = aut.repo;
if (!fs.existsSync(raiz)) falha(`repo da autorização não existe mais: ${raiz}`, 5);
if (real(git(["rev-parse", "--show-toplevel"], raiz).trim()) !== real(raiz)) falha("repo da autorização não bate com a raiz git atual", 5);
const ledger = lerLedger(aut);

if (sub === "status") {
  const { head, sujo } = estado(raiz);
  process.stdout.write(JSON.stringify({ ...aut, ignorados: aut.ignorados.length, git_interno: Object.keys(aut.git_interno).length, assinatura: "ok", ledger, head_atual: head, arvore_suja: sujo.length, head_bate: head === aut.head }, null, 2) + "\n");
  process.exit(0);
}

// ---------------------------------------------------------------- desfazer
if (sub === "desfazer") {
  if (!ledger) falha("esta autorização nunca foi executada: não há nada do GPT pra desfazer (e o que estiver na árvore é do dono)", 5);
  if (ledger.desfeita) falha(`já desfeita em ${ledger.desfeita.em}; desfazer de novo apagaria trabalho posterior do dono`, 5);
  const { head, sujo } = estado(raiz);
  const headOk = head === aut.head || (ledger.head_depois && head === ledger.head_depois);
  if (!headOk) falha(`HEAD mudou fora da execução (${aut.head.slice(0, 7)} → ${head.slice(0, 7)}): houve commit do dono no meio; desfazer automático não é seguro. Resolver na mão.`, 5);
  // manifesto: só pode haver na árvore o que o GPT tocou; qualquer outro caminho = trabalho do dono → recusa
  if (!ledger.terminada && !flag("sem-manifesto")) falha("a execução não terminou de registrar o que tocou (processo morreu?). Conferir `git status` na mão; pra reverter TUDO ao HEAD autorizado mesmo assim: --sem-manifesto", 5);
  const tocados = new Set([...(ledger.arquivos_alterados ?? []).flatMap((a) => [a.arquivo, a.de].filter(Boolean)), ...(ledger.ignorados_alterados ?? []), ...(ledger.ignorados_novos ?? []), ...(ledger.ignorados_sumidos ?? [])]);
  const agoraSujo = []; for (let i = 0; i < sujo.length; i++) { const e = sujo[i]; const st = e.slice(0, 2); agoraSujo.push(e.slice(3)); if (st[0] === "R" || st[0] === "C") { i++; agoraSujo.push(sujo[i]); } }
  const invMapa = new Map(aut.ignorados.map((f) => [f.rel, f]));
  const ignAgora = inventarioIgnorados(raiz);
  const ignNovosAgora = ignAgora.filter((f) => !invMapa.has(f.rel)).map((f) => f.rel);
  const ignDivergAgora = ignAgora.filter((f) => invMapa.has(f.rel) && digital(invMapa.get(f.rel)) !== digitalAtual(raiz, invMapa.get(f.rel))).map((f) => f.rel);
  if (ledger.terminada) {
    const fora = [...agoraSujo, ...ignNovosAgora, ...ignDivergAgora].filter((f) => !tocados.has(f));
    if (fora.length) falha(`árvore tem ${fora.length} caminho(s) FORA do manifesto do que o GPT tocou (trabalho do dono depois da execução?): ${fora.slice(0, 8).join(", ")}. Guardar isso antes (commit/cópia) e rodar de novo, ou reverter na mão.`, 5);
  }
  git(["reset", "-q", "--hard", aut.head], raiz);   // índice + working tree no HEAD autorizado (staged incluso; commit do GPT descartado)
  git(["clean", "-fdq"], raiz);                      // remove novos não-ignorados (a árvore estava limpa na autorização)
  let restaurados = 0, apagados = 0; const semCopia = [];
  for (const f of aut.ignorados) {                   // devolve os ignorados que mudaram ou sumiram
    const atual = digitalAtual(raiz, f); if (atual === digital(f)) continue;
    const src = path.join(aut.ignorados_checkpoint, "ignorados", f.rel);
    if (f.copia && fs.existsSync(src)) { const dest = path.join(raiz, f.rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); restaurados++; } else semCopia.push(f.rel);
  }
  for (const rel of ignNovosAgora) { try { fs.unlinkSync(path.join(raiz, rel)); apagados++; } catch { /* já sumiu */ } }
  { const gi = gitInterno(raiz);                     // devolve .git interno (hooks, config, info) se o GPT tocou
    for (const rel of new Set([...Object.keys(aut.git_interno), ...Object.keys(gi.hashes)])) {
      if (aut.git_interno[rel] === gi.hashes[rel]) continue;
      const src = path.join(aut.ignorados_checkpoint, "git-interno", rel), dest = path.join(gi.dir, rel);
      if (aut.git_interno[rel] && fs.existsSync(src)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); restaurados++; }
      else if (!aut.git_interno[rel]) { try { fs.unlinkSync(dest); apagados++; } catch { /* já sumiu */ } }
    } }
  // prova
  const depois = estado(raiz);
  const ignDepois = inventarioIgnorados(raiz); const depoisMapa = new Map(ignDepois.map((f) => [f.rel, f]));
  const divergentes = aut.ignorados.filter((f) => digitalAtual(raiz, f) !== digital(f)).map((f) => f.rel);
  const sobraram = ignDepois.filter((f) => !invMapa.has(f.rel)).map((f) => f.rel);
  const giDepois = gitInterno(raiz).hashes; const giDiverg = [...new Set([...Object.keys(aut.git_interno), ...Object.keys(giDepois)])].filter((k) => aut.git_interno[k] !== giDepois[k]);
  const pendencias = [...divergentes.map((f) => `ignorado divergente: ${f}${semCopia.includes(f) ? " (sem cópia no checkpoint: >50 MB ou pasta pesada)" : ""}`), ...sobraram.map((f) => `ignorado novo que ficou: ${f}`), ...giDiverg.map((f) => `.git/${f} divergente`)];
  ledger.desfeita = { em: new Date().toISOString(), head_final: depois.head, arvore_limpa: depois.sujo.length === 0, ignorados_restaurados: restaurados, ignorados_apagados: apagados, pendencias };
  gravarLedger(aut, ledger);
  void depoisMapa;
  if (depois.sujo.length || pendencias.length) falha(`desfazer INCOMPLETO: árvore com ${depois.sujo.length} entrada(s); ${pendencias.length} pendência(s): ${pendencias.join(" | ") || "nenhuma"}`, 3);
  process.stdout.write(`desfeito: árvore limpa em ${raiz} @ ${depois.head.slice(0, 7)}; ignorados restaurados ${restaurados}, apagados ${apagados}; .git interno e inventário conferem\n`);
  process.exit(0);
}

// ---------------------------------------------------------------- executar
const modelo = opt("modelo") || "gpt-6-astra";
const esforco = opt("esforco") || "max";
const ESFORCOS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
if (!ESFORCOS.has(esforco)) falha(`--esforco inválido: ${esforco}`);
const fake = opt("fake-codex");
if (fake && !fs.existsSync(fake)) falha(`--fake-codex ${fake} não existe`);
if (!fs.existsSync(GATE)) falha(`gate-segredo.sh não encontrado (${GATE})`);
if (!foraDoRepo(raiz, real(saida))) falha(`--saida (${saida}) não pode ficar dentro do repositório`);

// 1) autorização válida: não consumida (livro), proposta intacta, HEAD, árvore limpa
if (ledger) falha(`autorização já consumida em ${ledger.iniciada} (1 execução por aprovação; retrabalho = nova proposta + nova autorização)`, 5);
if (!fs.existsSync(aut.proposta)) falha(`proposta sumiu: ${aut.proposta}`, 5);
const propostaBuf = fs.readFileSync(aut.proposta);
if (sha(propostaBuf) !== aut.proposta_sha256) falha("a proposta mudou depois da aprovação (hash diferente): aprovar de novo", 5);
{ const { head, sujo } = estado(raiz);
  if (head !== aut.head) falha(`HEAD mudou desde a autorização (${aut.head.slice(0, 7)} → ${head.slice(0, 7)}): autorizar de novo`, 5);
  if (sujo.length) falha(`árvore não está limpa (${sujo.length} entrada(s)); estado inicial diferente do autorizado`, 5); }

// 2) trava do repositório: 1 execução por vez (rodada 7: dois `executar` simultâneos passavam os dois)
const lockPath = path.join(CASA, "locks", `${sha(real(raiz)).slice(0, 16)}.lock`);
try { fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, repo: raiz, autorizacao: autPath, em: new Date().toISOString() }), { flag: "wx" }); }
catch (e) { if (e.code === "EEXIST") falha(`outra execução em andamento neste repositório (trava ${lockPath}). Se não houver processo rodando, apagar a trava e repetir.`, 5); throw e; }
process.on("exit", () => { try { fs.unlinkSync(lockPath); } catch { /* já foi */ } });

// 3) codex: login pela assinatura, ambiente sem chave de API, executável sem shell
function resolverCodex() {
  if (process.platform !== "win32") return { cmd: "codex", pre: [] };
  const r = spawnSync("where", ["codex"], { encoding: "utf8" });
  for (const linha of (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    if (linha.toLowerCase().endsWith(".exe")) return { cmd: linha, pre: [] };
    if (linha.toLowerCase().endsWith(".cmd")) { const js = path.join(path.dirname(linha), "node_modules", "@openai", "codex", "bin", "codex.js"); if (fs.existsSync(js)) return { cmd: process.execPath, pre: [js] }; }
  }
  return null;
}
const envCodex = { ...process.env }; for (const k of Object.keys(envCodex)) if (["CODEX_API_KEY", "OPENAI_API_KEY"].includes(k.toUpperCase())) delete envCodex[k];
let exe;
if (fake) exe = { cmd: process.execPath, pre: [fake] };
else {
  exe = resolverCodex(); if (!exe) falha("codex não encontrado no PATH");
  const st = spawnSync(exe.cmd, [...exe.pre, "login", "status"], { encoding: "utf8", env: envCodex, shell: false });
  if (!/Logged in using ChatGPT/i.test(`${st.stdout || ""}${st.stderr || ""}`)) falha("codex não está logado pela assinatura ChatGPT; não rodar (sairia da API ou de conta errada)");
}

// 4) prompt de implementação (só os itens aprovados; regras duras) — e GATE nele e na árvore ANTES de sair qualquer byte
const proposta = propostaBuf.toString("utf8").trim();
const prompt = `<papel>
Você é o implementador. Recebeu uma PROPOSTA já aprovada pelo dono do repositório. Implemente exatamente os itens aprovados${aut.itens[0] === "todos" ? "" : ` (itens ${aut.itens.join(", ")})`}, nada além. Responda em português do Brasil.
</papel>

<regras>
- Escreva só dentro da pasta de trabalho. Nunca faça commit, push, stash, checkout de branch, tag, nem altere nada dentro de .git (config, hooks, info). Isso é conferido depois e invalida a entrega.
- Não crie nem cole segredo, token, senha, chave, e-mail pessoal ou caminho de outra máquina em arquivo nenhum. Não escreva conteúdo binário em arquivo de texto.
- Não altere teste, script de build, configuração de runner (conftest.py, jest.config.js...), hook, CI, manifesto (package.json etc.), arquivo de instrução (CLAUDE.md, AGENTS.md, SKILL.md) nem nada em .claude/ ou .codex/ a menos que um item aprovado peça isso explicitamente; se alterar, diga qual e por quê.
- Não altere arquivo ignorado pelo git (.env, bancos locais) a menos que um item aprovado peça.
- Mudança mínima que resolve, causa raiz, sem paliativo silencioso. Sem refatoração fora do escopo.
- Sem rede. Se um item exigir algo que você não consegue fazer aqui, NÃO improvise: descreva o que falta.
</regras>

<formato_de_saida>
Markdown, nesta ordem:
1. "Implementado:" — por item aprovado, 1-3 linhas do que mudou e onde (arquivo:linha).
2. "Arquivos alterados:" — lista, um por linha, caminho relativo.
3. "Como verificar:" — comandos ou passos concretos (não execute nada destrutivo).
4. "Não feito / ressalvas:" — o que ficou de fora e por quê (ou "nada").
</formato_de_saida>

<proposta>
${proposta}
</proposta>
`;
fs.writeFileSync(P("prompt-implementar"), prompt, "utf8");
{ const g = gate("arquivo", P("prompt-implementar")); if (g.status !== 0) { process.stderr.write(g.saida); falha("gate de segredo REPROVOU o prompt (proposta com segredo?). Nada saiu da máquina.", 4); } }
// o GPT vai LER a árvore inteira em workspace-write (tracked, untracked e ignorados como .env): tudo isso passa pelo
// gate antes. Limite honesto: node_modules/dist/.next/.codex ficam fora da varredura (pesados) e continuam legíveis.
{ const g = gate("arvore", raiz); if (g.status !== 0) { process.stderr.write(g.saida); falha("gate de segredo REPROVOU a árvore que o GPT poderia ler (segredo em arquivo do repo, inclusive ignorado como .env). Mover pro cofre/fora do repo antes. Nada saiu da máquina.", 4); } }

// 5) consumir a autorização ANTES de escrever qualquer coisa — livro criado com O_EXCL (atômico; replay/2 escritores = EEXIST)
const metaPath = P("meta-implementar", "json");
const L = { id: aut.id, autorizacao: autPath, repo: raiz, head_antes: aut.head, iniciada: new Date().toISOString(), meta: metaPath, modelo, esforco, fake: !!fake, terminada: null };
try { fs.writeFileSync(ledgerDe(aut), JSON.stringify(L, null, 2) + "\n", { flag: "wx" }); }
catch (e) { if (e.code === "EEXIST") falha("autorização consumida por outro processo neste instante (livro já existe)", 5); throw e; }

function fotoClaude() {
  try {
    const cj = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8")); const email = cj?.oauthAccount?.emailAddress ?? null;
    const acc = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "logs", "context-tray-accounts.json"), "utf8")); const a = email ? acc[email] : null;
    if (!a) return { email, limits: null };
    return { email, limits: (a.last_usage?.limits ?? []).map((l) => ({ key: l.key ?? l.group ?? null, percent: l.percent ?? null, resets_at: l.resets_at ?? null })) };
  } catch { return null; }
}
function fotoChatGPTAntes() {
  try {
    const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions"); if (!fs.existsSync(root)) return null;
    const agora = Date.now(); let melhor = null; const stack = [root];
    while (stack.length) { const d = stack.pop(); for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { stack.push(p); continue; } if (!e.name.endsWith(".jsonl")) continue; const m = fs.statSync(p).mtimeMs; if (agora - m > 6 * 3600e3) continue; if (!melhor || m > melhor.m) melhor = { p, m }; } }
    if (!melhor) return null; let rl = null, ts = null;
    for (const line of fs.readFileSync(melhor.p, "utf8").split("\n")) { let o; try { o = JSON.parse(line); } catch { continue; } if (o.payload?.type === "token_count" && o.payload.rate_limits) { rl = o.payload.rate_limits; ts = o.timestamp ?? null; } }
    return rl ? { ...rl, _timestamp: ts } : null;
  } catch { return null; }
}

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

const refsAntes = refs(raiz);
const inicio = Date.now();
const argvCodex = ["exec", "--json", "-s", "workspace-write", "--skip-git-repo-check", "--ignore-user-config", ...sandboxWindows(), "-c", 'web_search="disabled"', "-m", modelo, "-c", `model_reasoning_effort="${esforco}"`, "-C", raiz, "-o", P("resultado-implementar"), "-"];
const meta = {
  stamp, modo: "implementar", rotulo: `implementação em ${path.basename(raiz)}/ (itens ${aut.itens.join(",")})`, alvo: raiz, autorizacao: autPath, ledger: ledgerDe(aut), itens: aut.itens, head_antes: aut.head, head_depois: null,
  arquivos_n: null, modelo_pedido: modelo, esforco_pedido: esforco, fake: !!fake, comando: fake ? `node ${fake}` : `codex ${argvCodex.join(" ")}`, comando_codex: `codex ${argvCodex.join(" ")}`, sandbox_pedido: "workspace-write", sandbox_real: null,
  prompt: P("prompt-implementar"), resultado: P("resultado-implementar"), diff: P("diff-implementar"), thread_id: null, modelo_real: null, esforco_real: null,
  tokens: null, rate_limits: null, rate_limits_inicio: null, rate_limits_antes: fotoChatGPTAntes(), inicio_iso: new Date(inicio).toISOString(), claude_inicio: fotoClaude(),
  duracao_s: null, exit_code: null, stderr_tail: null, rollout: null,
  arquivos_alterados: [], arquivos_sensiveis: [], indice_alterado: false, ignorados_alterados: [], ignorados_novos: [], ignorados_sumidos: [], git_interno_alterado: [], refs_alterados: false, contrato_violado: [], gate_diff: null,
  desfazer: `node "${fileURLToPath(import.meta.url)}" desfazer --autorizacao "${autPath}"`
};
const r = spawnSync(exe.cmd, [...exe.pre, ...argvCodex], { cwd: raiz, input: prompt, encoding: "utf8", env: envCodex, maxBuffer: 256 * 1024 * 1024, shell: false });
meta.duracao_s = Math.round((Date.now() - inicio) / 1000); meta.exit_code = r.status;
meta.stderr_tail = (r.stderr || "").split("\n").filter((l) => l && !/DEP0190|trace-deprecation|failed to load skill|Reading additional input|rmcp::|oauth::/.test(l)).slice(-5).join("\n") || null;

// 6) tokens (mesma regra do revisar.mjs: vence a fonte com maior total, sem misturar) + sandbox real pelo rollout
const CAMPOS_TOKENS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
function pontuacao(t) { if (!t || typeof t !== "object") return -1; if (typeof t.total_tokens === "number") return t.total_tokens; if (typeof t.input_tokens === "number" && typeof t.output_tokens === "number") return t.input_tokens + t.output_tokens; if (typeof t.input_tokens === "number") return t.input_tokens; if (typeof t.output_tokens === "number") return t.output_tokens; return -1; }
function fundeTokens(x, y) { const px = pontuacao(x), py = pontuacao(y); if (px < 0 && py < 0) return null; const p = py > px ? y : x; const n = {}; for (const k of CAMPOS_TOKENS) if (typeof p?.[k] === "number") n[k] = p[k]; if (n.total_tokens == null && typeof n.input_tokens === "number" && typeof n.output_tokens === "number") n.total_tokens = n.input_tokens + n.output_tokens; return Object.keys(n).length ? n : null; }
for (const line of (r.stdout || "").split("\n")) { if (!line.trim()) continue; let ev; try { ev = JSON.parse(line); } catch { continue; } if (ev.type === "thread.started" && ev.thread_id) meta.thread_id = ev.thread_id; if (ev.type === "turn.completed" && ev.usage) meta.tokens = fundeTokens(ev.usage, meta.tokens); }
if (meta.thread_id && !fake) {
  const root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions"); const stack = fs.existsSync(root) ? [root] : [];
  while (stack.length && !meta.rollout) { const d = stack.pop(); for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) stack.push(p); else if (e.name.includes(meta.thread_id)) { meta.rollout = p; break; } } }
  if (meta.rollout) for (const line of fs.readFileSync(meta.rollout, "utf8").split("\n")) { let o; try { o = JSON.parse(line); } catch { continue; } const p = o.payload ?? {}; if (p.type === "token_count") { if (p.info?.total_token_usage) meta.tokens = fundeTokens(p.info.total_token_usage, meta.tokens); if (p.rate_limits) { if (!meta.rate_limits_inicio) meta.rate_limits_inicio = p.rate_limits; meta.rate_limits = p.rate_limits; } } if (o.type === "turn_context") { if (p.model) meta.modelo_real = p.model; if (p.effort ?? p.reasoning_effort) meta.esforco_real = p.effort ?? p.reasoning_effort; if (p.sandbox_policy?.type) meta.sandbox_real = p.sandbox_policy.type; } }
}

// 7) o que mudou: HEAD/refs, lista (staged incluso), diff contra o HEAD autorizado, sensíveis, ignorados, .git interno, gate por arquivo
{ const { head } = estado(raiz); meta.head_depois = head; if (head !== aut.head) meta.contrato_violado.push(`HEAD mudou durante a execução (${aut.head.slice(0, 7)} → ${head.slice(0, 7)}): commit do GPT`); }
if (refs(raiz) !== refsAntes) { meta.refs_alterados = true; meta.contrato_violado.push("refs/stash mudaram durante a execução (branch, tag, stash ou commit do GPT)"); }
const sujo = z(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], raiz));
const alterados = []; for (let i = 0; i < sujo.length; i++) { const e = sujo[i]; const st = e.slice(0, 2); const f = e.slice(3); const a = { status: st.trim(), arquivo: f }; if (st[0] === "R" || st[0] === "C") { i++; a.de = sujo[i]; } alterados.push(a); }
meta.arquivos_alterados = alterados; meta.arquivos_n = alterados.length;
meta.indice_alterado = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: raiz }).status !== 0;
meta.arquivos_sensiveis = alterados.filter((a) => SENSIVEL.test(a.arquivo) || (a.de && SENSIVEL.test(a.de))).map((a) => a.arquivo);
{ const antes = new Map(aut.ignorados.map((f) => [f.rel, f])); const agora = inventarioIgnorados(raiz); const agoraSet = new Set(agora.map((f) => f.rel));
  meta.ignorados_alterados = agora.filter((f) => antes.has(f.rel) && digitalAtual(raiz, antes.get(f.rel)) !== digital(antes.get(f.rel))).map((f) => f.rel);
  meta.ignorados_novos = agora.filter((f) => !antes.has(f.rel)).map((f) => f.rel);
  meta.ignorados_sumidos = aut.ignorados.filter((f) => !agoraSet.has(f.rel)).map((f) => f.rel); }
{ const gi = gitInterno(raiz).hashes; meta.git_interno_alterado = [...new Set([...Object.keys(aut.git_interno), ...Object.keys(gi)])].filter((k) => aut.git_interno[k] !== gi[k]);
  if (meta.git_interno_alterado.length) meta.contrato_violado.push(`.git interno alterado: ${meta.git_interno_alterado.join(", ")}`); }
{ let diff = git(["diff", "--no-ext-diff", aut.head], raiz);   // working tree vs HEAD autorizado: pega staged E unstaged (rodada 7)
  const novos = alterados.filter((a) => a.status === "??").map((a) => a.arquivo);
  for (const f of novos) { let b; try { b = fs.readFileSync(path.join(raiz, f)); } catch { continue; } diff += `\n\n#### NOVO: ${f}\n\`\`\`\n${b.includes(0) ? "(binário)" : b.toString("utf8").slice(0, 200_000)}\n\`\`\``; }
  for (const f of meta.ignorados_alterados) diff += `\n\n#### IGNORADO alterado: ${f} (fora do git; conteúdo não exibido — conferir na mão)`;
  for (const f of meta.ignorados_novos) diff += `\n\n#### IGNORADO novo: ${f}`;
  for (const f of meta.ignorados_sumidos) diff += `\n\n#### IGNORADO sumido: ${f}`;
  fs.writeFileSync(P("diff-implementar"), `# O que o GPT mudou em ${path.basename(raiz)}/ — ${stamp}\n\n${alterados.map((a) => `- ${a.status.padEnd(2)} ${a.arquivo}${a.de ? ` (era ${a.de})` : ""}`).join("\n")}${meta.indice_alterado ? "\n- (há mudança STAGED no índice)" : ""}\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, "utf8"); }
// gate em CADA arquivo efetivamente tocado (tracked modificado/novo E ignorado alterado/novo): conteúdo inteiro, não só
// o diff; binário/NUL = não inspecionado = reprova (rodada 7: segredo em .env ignorado e NUL antes da senha passavam)
{ const lista = [...alterados.filter((a) => a.status !== "D").map((a) => a.arquivo), ...meta.ignorados_alterados, ...meta.ignorados_novos].filter((f) => fs.existsSync(path.join(raiz, f)) && fs.statSync(path.join(raiz, f)).isFile());
  if (lista.length) { const lp = P("gate-lista", "z"); fs.writeFileSync(lp, lista.map((f) => path.join(raiz, f)).join("\0") + "\0"); const g = gate("lista", lp); meta.gate_diff = g.status === 0 ? "aprovado" : g.status === 1 ? "REPROVADO" : `falhou (exit ${g.status})`; if (g.status !== 0) process.stderr.write(g.saida); try { fs.unlinkSync(lp); } catch { /* ok */ } }
  else meta.gate_diff = "aprovado (nada tocado)"; }
if (!fake) {
  if (!meta.sandbox_real) meta.contrato_violado.push("sandbox real NÃO comprovado (rollout do Codex não encontrado ou sem turn_context)");
  else if (meta.sandbox_real !== "workspace-write") meta.contrato_violado.push(`sandbox real = ${meta.sandbox_real} (pedido: workspace-write)`);
}
{ let ok = false; try { ok = fs.statSync(P("resultado-implementar")).size > 0; } catch { /* ausente */ } if (!ok) meta.contrato_violado.push("resultado do GPT ausente ou vazio (arquivo -o)"); }
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
Object.assign(L, { terminada: new Date().toISOString(), head_depois: meta.head_depois, exit_codex: r.status, arquivos_alterados: alterados, ignorados_alterados: meta.ignorados_alterados, ignorados_novos: meta.ignorados_novos, ignorados_sumidos: meta.ignorados_sumidos, git_interno_alterado: meta.git_interno_alterado, contrato_violado: meta.contrato_violado, gate_diff: meta.gate_diff });
gravarLedger(aut, L);

const rodape = `meta: ${metaPath}\ndesfazer: ${meta.desfazer}\n`;
if (r.status !== 0) { process.stderr.write(`ERRO: codex saiu com ${r.status}; ${alterados.length} arquivo(s) tocado(s) mesmo assim. stderr: ${meta.stderr_tail ?? "(vazio)"}\n${rodape}`); process.exit(3); }
const sandboxRuim = meta.contrato_violado.find((c) => c.startsWith("sandbox real")); const semResultado = meta.contrato_violado.find((c) => c.startsWith("resultado do GPT"));
if (sandboxRuim || semResultado) { process.stderr.write(`ERRO: ${[sandboxRuim, semResultado].filter(Boolean).join("; ")}. ${alterados.length} arquivo(s) tocado(s). No Windows, confira [windows] sandbox no config.toml do Codex.\n${rodape}`); process.exit(3); }
process.stdout.write(`resultado: ${P("resultado-implementar")}\ndiff: ${P("diff-implementar")}\nmeta: ${metaPath}\nthread: ${meta.thread_id ?? "?"} | ${meta.duracao_s}s | modelo ${meta.modelo_real ?? modelo} esforço ${meta.esforco_real ?? esforco} | tokens: ${meta.tokens?.total_tokens ?? "?"}${fake ? " | FAKE" : ""}\nalterados: ${alterados.length}${meta.indice_alterado ? " (com STAGED)" : ""}${meta.arquivos_sensiveis.length ? ` | SENSÍVEIS (mostrar ao dono antes de rodar qualquer coisa): ${meta.arquivos_sensiveis.join(", ")}` : ""}${meta.ignorados_alterados.length ? ` | IGNORADOS alterados: ${meta.ignorados_alterados.join(", ")}` : ""}${meta.ignorados_novos.length ? ` | IGNORADOS novos: ${meta.ignorados_novos.join(", ")}` : ""}${meta.ignorados_sumidos.length ? ` | IGNORADOS sumidos: ${meta.ignorados_sumidos.join(", ")}` : ""}\ngate no que mudou: ${meta.gate_diff}${meta.contrato_violado.length ? `\nCONTRATO VIOLADO: ${meta.contrato_violado.join(" | ")}` : ""}\ndesfazer: ${meta.desfazer}\n`);
if (meta.contrato_violado.length) { process.stderr.write("ERRO: o GPT violou o contrato (commit/branch/stash, .git interno). Nada saiu da máquina, mas a mudança está no disco: recomendação = desfazer.\n"); process.exit(4); }
if (meta.gate_diff !== "aprovado" && meta.gate_diff !== "aprovado (nada tocado)") { process.stderr.write("ERRO: o gate REPROVOU o que o GPT escreveu (segredo, dado sensível ou conteúdo não inspecionável). Nada saiu da máquina, mas a mudança está no disco: recomendação = desfazer.\n"); process.exit(4); }
process.exit(0);

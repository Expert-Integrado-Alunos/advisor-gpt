#!/usr/bin/env node
// recibo.mjs — Passo 6 da skill advisor-gpt: quanto a revisão custou e como estão as duas contas.
//
// Uso:
//   node recibo.mjs --thread <threadId do job do Codex> [--json]
//   node recibo.mjs --job <job-id> --cwd <pasta>          (resolve o threadId pelo status do plugin)
//
// Lê SÓ arquivos locais, nunca chama rede:
//   - Codex:  ~/.codex/sessions/**/rollout-*-<threadId>.jsonl  -> tokens do thread (último total_token_usage)
//             e o último rate_limits visto (uso da conta ChatGPT: % da janela, reset, plano).
//   - Claude: ~/.claude.json (oauthAccount.emailAddress = conta ativa do CLI; nada de token) +
//             ~/.claude/logs/context-tray-accounts.json (gravado pelo Claude Monitor: % da sessão de 5h e
//             semanal por conta, com horário de reset). Sem o Monitor, a parte do Claude sai como "sem dado".
// Saída: texto em PT-BR pronto pra linha de recibo (ou JSON com --json). Horários em BRT (America/Sao_Paulo).
// Nunca imprime token, chave ou id de conta além do e-mail.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; }
const asJson = args.includes("--json");
let threadId = opt("thread");
const jobId = opt("job");
// --meta <advisor-gpt-meta-*.json> (gerado por revisar.mjs): traz thread_id, duração, modelo e esforço
let meta = null;
const metaPath = opt("meta");
if (metaPath) {
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); if (!threadId && meta.thread_id) threadId = meta.thread_id; }
  catch { meta = null; }
}
const cwd = opt("cwd") || process.cwd();
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");

function brt(tsSecondsOrIso) {
  if (tsSecondsOrIso == null) return "sem data";
  const d = typeof tsSecondsOrIso === "number" ? new Date(tsSecondsOrIso * 1000) : new Date(tsSecondsOrIso);
  if (Number.isNaN(d.getTime())) return "sem data";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtInt(n) { return typeof n === "number" ? n.toLocaleString("pt-BR") : "?"; }

// 1) threadId a partir do job (status do plugin)
if (!threadId && jobId) {
  const companion = findCompanion();
  if (companion) {
    const r = spawnSync(process.execPath, [companion, "status", jobId, "--json", "--cwd", cwd], { encoding: "utf8" });
    try { threadId = JSON.parse(r.stdout).job?.threadId ?? undefined; } catch { /* segue sem thread */ }
  }
}
function findCompanion() {
  const base = path.join(os.homedir(), ".claude", "plugins", "cache", "openai-codex");
  if (!fs.existsSync(base)) return null;
  const hits = [];
  (function walk(dir, depth) {
    if (depth > 5) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name === "codex-companion.mjs") hits.push(p);
    }
  })(base, 0);
  return hits.sort().pop() ?? null;
}

// 2) rollout do thread
function findRollout(id) {
  const root = path.join(codexHome, "sessions");
  if (!id || !fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith(".jsonl") && e.name.includes(id)) return p;
    }
  }
  return null;
}
function lerRollout(file) {
  const out = { tokens: null, rateLimits: null, rateLimitsInicio: null, rateLimitsN: 0, model: null, turnos: 0 };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload ?? o;
    if (o.type === "session_meta" || p?.type === "session_meta") out.model = p?.model ?? p?.payload?.model ?? out.model;
    const info = p?.info ?? p;
    const tu = info?.total_token_usage ?? p?.total_token_usage;
    if (tu) { out.tokens = tu; out.turnos += 1; }
    const rl = p?.rate_limits ?? info?.rate_limits;
    if (rl) { if (!out.rateLimitsInicio) out.rateLimitsInicio = rl; out.rateLimits = rl; out.rateLimitsN += 1; }
    if (!out.model && typeof p?.model === "string") out.model = p.model;
  }
  return out;
}

// 3) lado Claude
function ladoClaude() {
  const res = { email: null, sessao: null, semanal: null, fable: null, resetSessao: null, resetSemanal: null, frescor: null, fonte: "sem dado" };
  try {
    const cj = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8"));
    res.email = cj?.oauthAccount?.emailAddress ?? null;
  } catch { /* sem conta */ }
  try {
    const acc = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "logs", "context-tray-accounts.json"), "utf8"));
    const a = res.email ? acc[res.email] : null;
    if (a) {
      res.fonte = "Claude Monitor";
      res.resetSessao = a.reset_session ?? null;
      res.resetSemanal = a.reset_weekly ?? null;
      res.frescor = a.last_usage?.fetched ?? null;
      for (const l of a.last_usage?.limits ?? []) {
        const k = String(l.key ?? l.group ?? "").toLowerCase();
        if (k === "session") res.sessao = l.percent;
        else if (k.includes("fable") || String(l.label ?? "").toLowerCase().includes("fable")) res.fable = l.percent;
        else if (k.includes("week") || k.includes("seman") || k === "weekly") res.semanal = l.percent;
      }
    }
  } catch { /* sem Monitor */ }
  return res;
}

const rollout = findRollout(threadId);
let codex = rollout ? lerRollout(rollout) : null;
// meta (revisar.mjs) complementa campo a campo o que o rollout não trouxe (rollout parcial não apaga o meta)
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
if (meta) {
  codex = codex ?? { tokens: null, rateLimits: null, rateLimitsInicio: null, rateLimitsN: 0, model: null };
  codex.tokens = fundeTokens(codex.tokens, meta.tokens ?? null);
  codex.rateLimits = codex.rateLimits ?? meta.rate_limits ?? null;
  codex.rateLimitsInicio = codex.rateLimitsInicio ?? meta.rate_limits_inicio ?? null;
  codex.model = codex.model ?? meta.modelo_real ?? meta.modelo_pedido ?? null;
  if (!codex.tokens && !codex.rateLimits) codex = null;
}
if (codex) codex.tokens = fundeTokens(codex.tokens, null);
const claude = ladoClaude();

const resultado = {
  thread_id: threadId ?? null,
  rollout: rollout ?? null,
  gpt: codex ? {
    model: codex.model,
    tokens_total: codex.tokens?.total_tokens ?? null,
    tokens_input: codex.tokens?.input_tokens ?? null,
    tokens_input_cache: codex.tokens?.cached_input_tokens ?? null,
    tokens_output: codex.tokens?.output_tokens ?? null,
    tokens_reasoning: codex.tokens?.reasoning_output_tokens ?? null,
    conta: codex.rateLimits ? {
      plano: codex.rateLimits.plan_type ?? null,
      // baseline: foto ANTES da rodada (meta.rate_limits_antes) > 1º token_count quando houve mais de um > nenhuma
      janelas: janelasCodex(meta?.rate_limits_antes ?? ((codex.rateLimitsN ?? 0) >= 2 ? codex.rateLimitsInicio : null), codex.rateLimits),
      limite_atingido: codex.rateLimits.rate_limit_reached_type ?? null
    } : null
  } : null,
  claude: { ...claude, inicio: meta?.claude_inicio ?? null, delta: deltaClaude(meta?.claude_inicio, claude) }
};
// janelas da conta ChatGPT (primary/secondary do rollout): nome pelo tamanho, % no início e no fim da revisão, delta em pontos
function janelasCodex(ini, fim) {
  const out = [];
  for (const k of ["primary", "secondary"]) {
    const f = fim?.[k]; if (!f) continue;
    const i = ini?.[k] ?? null;
    const min = f.window_minutes ?? null;
    const nome = min == null ? "janela" : min >= 10000 ? "semanal" : min >= 240 ? `${Math.round(min / 60)} h` : `${min} min`;
    const pctFim = typeof f.used_percent === "number" ? f.used_percent : null;
    const pctIni = typeof i?.used_percent === "number" ? i.used_percent : null;
    // reset no meio (resets_at mudou ou % caiu) = sem delta numérico; nunca esconder queda com max(0, …) (rodada 6)
    const reset = pctIni != null && pctFim != null && ((i?.resets_at != null && f.resets_at != null && i.resets_at !== f.resets_at) || pctFim < pctIni);
    out.push({ chave: k, nome, minutos: min, pct_inicio: pctIni, pct_fim: pctFim, delta_pontos: pctIni != null && pctFim != null && !reset ? pctFim - pctIni : null, reset_no_meio: reset, reset: f.resets_at ?? null });
  }
  return out;
}
// delta da conta Claude entre a foto do início (meta.claude_inicio, gravada pelo revisar.mjs) e o Monitor agora
function deltaClaude(ini, agora) {
  if (!ini?.limits || agora.fonte !== "Claude Monitor") return null;
  // conta trocou = nada comparável (só o % atual); janela que resetou no meio = sem delta (rodada 6)
  if (ini.email !== agora.email) return { sessao: null, semanal: null, fable: null, mesma_conta: false };
  const mapa = {}; for (const l of ini.limits) if (l.key) mapa[l.key] = l;
  const d = (k, atual, resetAgora) => {
    const li = mapa[k]; if (!li || typeof li.percent !== "number" || typeof atual !== "number") return null;
    if (li.resets_at && resetAgora && li.resets_at !== resetAgora) return null;
    if (atual < li.percent) return null;
    return { inicio: li.percent, fim: atual, delta_pontos: atual - li.percent };
  };
  return { sessao: d("session", agora.sessao, agora.resetSessao), semanal: d("weekly_all", agora.semanal, agora.resetSemanal), fable: d("weekly_scoped", agora.fable, agora.resetSemanal), mesma_conta: true };
}

if (asJson) { process.stdout.write(JSON.stringify(resultado, null, 2) + "\n"); process.exit(0); }

const linhas = [];
if (meta) {
  linhas.push(`Revisão: ${meta.rotulo ?? meta.modo ?? "?"}; ${meta.arquivos_n ?? "?"} arquivo(s); ${meta.duracao_s != null ? `${Math.round(meta.duracao_s / 60)} min` : "duração ?"}; modelo ${meta.modelo_real ?? meta.modelo_pedido ?? "?"}, esforço ${meta.esforco_real ?? meta.esforco_pedido ?? "?"}.`);
}
if (!codex) {
  linhas.push(`GPT: sem rollout local pro thread ${threadId ?? "(não informado)"} — tokens indisponíveis nesta máquina.`);
} else {
  const t = resultado.gpt;
  linhas.push(`GPT (${t.model ?? "modelo do config"}): gastou ${fmtInt(t.tokens_total)} tokens (${fmtInt(t.tokens_input_cache)} em cache; saída ${fmtInt(t.tokens_output)}).`);
  if (t.conta) {
    // formato pedido pelo Eric (12/09/2026): só "de a% foi pra b% (+N ponto)"; sem reset, sem rodapé. Pontos são inteiros
    // (o Codex informa assim); revisão pequena = "menos de 1 ponto". Janela curta só aparece se o Codex informar.
    const partes = t.conta.janelas.map((j) => {
      if (j.reset_no_meio) return `${j.nome} ${j.pct_inicio}% → ${j.pct_fim}% (reset no meio)`;
      if (j.delta_pontos == null) return `${j.nome} ${j.pct_fim ?? "?"}%`;
      const mov = j.delta_pontos === 0 ? "menos de 1 ponto" : `+${j.delta_pontos} ponto${j.delta_pontos > 1 ? "s" : ""}`;
      return `${j.nome} ${j.pct_inicio}% → ${j.pct_fim}% (${mov})`;
    });
    linhas.push(`Conta ChatGPT (${t.conta.plano ?? "plano ?"}): ${partes.join("; ") || "sem janelas"}${t.conta.limite_atingido ? ` — LIMITE ATINGIDO (${t.conta.limite_atingido})` : ""}.`);
  } else {
    linhas.push("Conta ChatGPT: sem registro de limite neste thread.");
  }
}
if (claude.fonte === "Claude Monitor") {
  const dl = resultado.claude.delta;
  const seg = (nome, atual, d) => {
    if (atual == null) return null;
    if (!d) return `${nome} ${atual}%`;
    const mov = d.delta_pontos === 0 ? "menos de 1 ponto" : `${d.delta_pontos > 0 ? "+" : ""}${d.delta_pontos} ponto${Math.abs(d.delta_pontos) === 1 ? "" : "s"}`;
    return `${nome} ${d.inicio}% → ${d.fim}% (${mov})`;
  };
  const partes = [seg("sessão 5 h", claude.sessao, dl?.sessao), seg("semana", claude.semanal, dl?.semanal), seg("semana Fable", claude.fable, dl?.fable)].filter(Boolean);
  const aviso = dl && dl.mesma_conta === false ? " (conta trocou durante a revisão)" : "";
  linhas.push(`Conta Claude (${claude.email}): ${partes.length ? partes.join("; ") : "sem percentuais"}${aviso}.`);
} else {
  linhas.push(`Conta Claude (${claude.email ?? "?"}): sem dado local de limite (Claude Monitor não gravou esta conta).`);
}
process.stdout.write(linhas.join("\n") + "\n");

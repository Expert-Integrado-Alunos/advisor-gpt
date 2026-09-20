#!/bin/sh
# Suíte offline do rollout.mjs: classificação dos resultados de ferramenta do Codex com rollouts FABRICADOS.
# Casos que os GPT-6 apontou nas rodadas 1 e 2 da otimização (20/09/2026): chamada recusada contada como execução,
# marcador citado no conteúdo, resultado "running", formato desconhecido, meta sem rollout.
D=$(cd "$(dirname "$0")/.." && pwd)
node - "$D/rollout.mjs" <<'EOF'
const [modPath] = process.argv.slice(2);
const { classificarResultado, contarExecucoes } = await import("file:///" + modPath.replace(/^\/([a-z])\//i, "$1:/"));
let pass = 0, fail = 0;
const t = (nome, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (ok) pass++; else { fail++; console.log(`FAIL ${nome}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const el = (s) => ({ type: "input_text", text: s });
const REC = "Script error:\nexec_command failed: CreateProcess { message: \"Rejected(\\\"Failed to create unified exec process: orchestrator_helper_launch_failed: ...\\\")\" }";

// 1-3: cabeçalhos básicos
t("concluido", classificarResultado([el("Script completed\nWall time 0.1 seconds\nOutput:\n"), el("{\"ok\":true}")]), { estado: "concluido", sandbox: false });
t("recusado pelo sandbox", classificarResultado([el("Script failed\nWall time 0.7 seconds\nOutput:\n"), el(REC)]), { estado: "recusado", sandbox: true });
t("falhou depois de rodar = rodou", classificarResultado([el("Script failed\nWall time 0.3 seconds\nOutput:\n"), el("Script error:\nTypeError: x is not a function")]), { estado: "concluido", sandbox: false });
// 4: marcador citado no CONTEÚDO (leitura do próprio revisar.mjs) não é recusa nem falha de sandbox
t("marcador no conteudo", classificarResultado([el("Script completed\nWall time 0.2 seconds\nOutput:\n"), el("const x = /orchestrator_helper_launch_failed/; Failed to create unified exec process")]), { estado: "concluido", sandbox: false });
// 5-7: pendente, desconhecido, string crua
t("running = pendente", classificarResultado([el("Script running with cell ID 7\nOutput:\n")]), { estado: "pendente", sandbox: false });
t("resposta de relogio = indeterminado", classificarResultado("2026-09-20T17:00:00Z"), { estado: "indeterminado", sandbox: false });
t("string crua concluida", classificarResultado("Script completed\nWall time 0.0 seconds\nOutput:\nok"), { estado: "concluido", sandbox: false });
t("formato objeto = indeterminado", classificarResultado({ foo: 1 }), { estado: "indeterminado", sandbox: false });
// 9: contagem sobre um rollout fabricado (chamadas NÃO contam, só resultados)
const linhas = [
  { payload: { type: "custom_tool_call", input: "orchestrator_helper_launch_failed" } },
  { payload: { type: "custom_tool_call_output", output: [el("Script failed\nWall time 0.7 seconds\nOutput:\n"), el(REC)] } },
  { payload: { type: "custom_tool_call_output", output: [el("Script completed\nWall time 0.1 seconds\nOutput:\n"), el("orchestrator_helper_launch_failed citado como dado")] } },
  { payload: { type: "function_call_output", output: "Script running with cell ID 3\nOutput:\n" } },
  { payload: { type: "function_call_output", output: "12:00" } },
  { type: "turn_context", payload: { model: "x" } },
];
t("contagem", contarExecucoes(linhas), { concluidos: 1, recusados: 1, pendentes: 1, indeterminados: 1, sandbox_falhou: true });
t("rollout vazio", contarExecucoes([]), { concluidos: 0, recusados: 0, pendentes: 0, indeterminados: 0, sandbox_falhou: false });
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
EOF

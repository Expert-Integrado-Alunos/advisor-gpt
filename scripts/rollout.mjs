// rollout.mjs — classifica os RESULTADOS de ferramenta do rollout do Codex (o que o GPT de fato executou).
// Usado pelo revisar.mjs; testado por testes/test-rollout.sh com rollouts fabricados.
//
// Por que existe (rodadas 1 e 2 do GPT-6 sobre a otimização de 20/09/2026): contar CHAMADAS transformava tentativa
// recusada pelo sandbox em "GPT executou 1 comando"; procurar o marcador de falha no CONTEÚDO devolvido fazia uma
// leitura bem-sucedida do próprio revisar.mjs (que cita o marcador) virar "sandbox falhou". Regra agora:
//   - só o CABEÇALHO do resultado decide (1ª linha: "Script completed" / "Script failed" / "Script running ...");
//   - a recusa do sandbox só é lida no elemento "Script error:" (o runtime do Codex a escreve ali), nunca no Output;
//   - cabeçalho desconhecido = indeterminado (não conta como execução nem como recusa).
// Limite honesto: "concluído" = o runtime do Codex rodou um script/comando até o fim; NÃO significa que a entrega foi
// testada (o GPT pode ter rodado um script em memória sobre dados sintéticos).

const MARCADOR_SANDBOX = /orchestrator_helper_launch_failed|Failed to create unified exec process/;

// elementos de `output` viram lista de strings (string, lista de {text}, ou outro formato = JSON)
export function textosDoResultado(output) {
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) return output.map((x) => (x && typeof x === "object" ? String(x.text ?? "") : String(x)));
  return [JSON.stringify(output ?? "")];
}

// → { estado: "concluido" | "recusado" | "pendente" | "indeterminado", sandbox: boolean }
export function classificarResultado(output) {
  const textos = textosDoResultado(output);
  const cabecalho = (textos[0] ?? "").split("\n")[0].trim();
  const erro = textos.find((t) => /^Script error:/.test(t)) ?? "";
  const sandbox = MARCADOR_SANDBOX.test(erro);
  if (/^Script completed/.test(cabecalho)) return { estado: "concluido", sandbox };
  if (/^Script running/.test(cabecalho)) return { estado: "pendente", sandbox };
  if (/^Script failed/.test(cabecalho)) return { estado: sandbox ? "recusado" : "concluido", sandbox }; // falhou DEPOIS de rodar = rodou
  return { estado: "indeterminado", sandbox };
}

// acumula sobre as linhas (objetos já parseados) do rollout
export function contarExecucoes(linhas) {
  const c = { concluidos: 0, recusados: 0, pendentes: 0, indeterminados: 0, sandbox_falhou: false };
  for (const o of linhas) {
    const p = o?.payload ?? {};
    if (p.type !== "custom_tool_call_output" && p.type !== "function_call_output") continue;
    const r = classificarResultado(p.output);
    if (r.sandbox) c.sandbox_falhou = true;
    if (r.estado === "concluido") c.concluidos++; else if (r.estado === "recusado") c.recusados++; else if (r.estado === "pendente") c.pendentes++; else c.indeterminados++;
  }
  return c;
}

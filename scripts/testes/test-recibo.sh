#!/bin/sh
# Suite local do recibo.mjs da skill advisor-gpt. 100% offline: o rollout do Codex e FABRICADO
# num CODEX_HOME temporario, nenhuma rede e nenhum dado real de conta.
# Rodar: sh plugins/lab/skills/advisor-gpt/scripts/testes/test-recibo.sh  (espera PASS=12 FAIL=0)
set -u
SCRIPTS="$(cd "$(dirname "$0")/.." && pwd)"
R="$SCRIPTS/recibo.mjs"
W=/c/tmp/advisor-gate-test/recibo
rm -rf "$W"; mkdir -p "$W/sessions/2026/09/12"
OK=0; FAIL=0
chk() { nome="$1"; esp="$2"; shift 2; out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" -eq "$esp" ]; then OK=$((OK+1)); echo "PASS  $nome (exit $rc)"; echo "$out" | sed 's/^/      | /'
  else FAIL=$((FAIL+1)); echo "FAIL  $nome (esperado $esp, veio $rc)"; echo "$out" | head -5 | sed 's/^/      /'; fi }

TH=abc12345-0000-4000-8000-deadbeef0001
F="$W/sessions/2026/09/12/rollout-2026-09-12T13-00-00-$TH.jsonl"
cat > "$F" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"total_tokens":123456,"input_tokens":100000,"cached_input_tokens":80000,"output_tokens":23456,"reasoning_output_tokens":9000}},"rate_limits":{"plan_type":"pro","primary":{"used_percent":12.5,"window_minutes":300,"resets_at":"2026-09-12T19:00:00Z"},"secondary":{"used_percent":40,"window_minutes":10080,"resets_at":"2026-09-15T03:00:00Z"}}}}
JSONL

echo "--- caminho feliz (rollout fabricado) ---"
CODEX_HOME="$W" chk "texto com rollout -> 0" 0 node "$R" --thread "$TH"
CODEX_HOME="$W" chk "json com rollout -> 0" 0 node "$R" --thread "$TH" --json

echo "--- degradacao graciosa ---"
CODEX_HOME="$W" chk "thread inexistente -> 0" 0 node "$R" --thread naoexiste-9999
CODEX_HOME="$W" chk "sem --thread -> 0" 0 node "$R"
CODEX_HOME=/c/tmp/advisor-gate-test/nao-existe chk "CODEX_HOME ausente -> 0" 0 node "$R" --thread "$TH"

echo "--- meta parcial (sem total_tokens, sem rollout): total = entrada + saida ---"
cat > "$W/meta-parcial.json" <<'JSON'
{"modo":"repo","rotulo":"teste","arquivos_n":1,"duracao_s":90,"modelo_pedido":"gpt-6-astra","esforco_pedido":"medium","thread_id":"zzz-nao-existe","tokens":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":30}}
JSON
out="$(CODEX_HOME="$W" node "$R" --meta "$W/meta-parcial.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "130 tokens"; then OK=$((OK+1)); echo "PASS  meta parcial soma 130 (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  meta parcial (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- rollout PARCIAL (so entrada) + meta completo: funde campo a campo, nao descarta o meta ---"
TH2=abc12345-0000-4000-8000-deadbeef0002
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-30-00-$TH2.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":100}}}}
JSONL
cat > "$W/meta-completo.json" <<JSON
{"modo":"repo","rotulo":"teste","arquivos_n":1,"duracao_s":60,"modelo_pedido":"gpt-6-astra","esforco_pedido":"high","thread_id":"$TH2","tokens":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":30,"total_tokens":130}}
JSON
out="$(CODEX_HOME="$W" node "$R" --meta "$W/meta-completo.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "gastou 130 tokens" && echo "$out" | grep -q "saída 30"; then OK=$((OK+1)); echo "PASS  rollout parcial + meta completo = 130 / saida 30 (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  rollout parcial + meta (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- rollout parcial ANTIGO (entrada 60) + meta final (100/30/130): o mais recente manda, sem misturar ---"
TH3=abc12345-0000-4000-8000-deadbeef0003
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-40-00-$TH3.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":60}}}}
JSONL
cat > "$W/meta-final.json" <<JSON
{"modo":"repo","rotulo":"teste","arquivos_n":1,"duracao_s":60,"modelo_pedido":"gpt-6-astra","esforco_pedido":"high","thread_id":"$TH3","tokens":{"input_tokens":100,"output_tokens":30,"total_tokens":130}}
JSON
out="$(CODEX_HOME="$W" node "$R" --meta "$W/meta-final.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "gastou 130 tokens" && CODEX_HOME="$W" node "$R" --meta "$W/meta-final.json" --json | grep -q '"tokens_input": 100'; then OK=$((OK+1)); echo "PASS  fusao temporal: entrada 100 / total 130 (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  fusao temporal (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- delta de cota: rollout com rate_limits 1% no inicio e 3% no fim -> 'gastou 2 pontos (1% -> 3%)' ---"
TH4=abc12345-0000-4000-8000-deadbeef0004
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-50-00-$TH4.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":1000,"output_tokens":10,"total_tokens":1010}},"rate_limits":{"plan_type":"pro","primary":{"used_percent":1,"window_minutes":10080,"resets_at":"2026-09-19T13:56:00Z"}}}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":900000,"output_tokens":20000,"total_tokens":920000}},"rate_limits":{"plan_type":"pro","primary":{"used_percent":3,"window_minutes":10080,"resets_at":"2026-09-19T13:56:00Z"}}}}
JSONL
out="$(CODEX_HOME="$W" node "$R" --thread "$TH4" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "semanal 1% → 3% (+2 pontos)" && ! echo "$out" | grep -q "reseta"; then OK=$((OK+1)); echo "PASS  delta de cota semanal '1% → 3% (+2 pontos)', sem horario de reset (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  delta de cota (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- rodada 6: rollout anterior 100/10/110 x meta final 100/30/130 -> vence o maior (130), sem misturar ---"
TH5=abc12345-0000-4000-8000-deadbeef0005
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-55-00-$TH5.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10,"total_tokens":110}}}}
JSONL
cat > "$W/meta-r6.json" <<JSON
{"modo":"repo","rotulo":"teste","arquivos_n":1,"duracao_s":60,"modelo_pedido":"gpt-6-astra","esforco_pedido":"high","thread_id":"$TH5","tokens":{"input_tokens":100,"output_tokens":30,"total_tokens":130}}
JSON
out="$(CODEX_HOME="$W" node "$R" --meta "$W/meta-r6.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "gastou 130 tokens" && echo "$out" | grep -q "saída 30"; then OK=$((OK+1)); echo "PASS  entrada igual nao mistura: 130 / saida 30 (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  entrada igual (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- rodada 6: UMA so foto de cota no rollout e sem foto anterior -> mostra o %, sem inventar 'menos de 1 ponto' ---"
TH6=abc12345-0000-4000-8000-deadbeef0006
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-58-00-$TH6.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":20000,"output_tokens":1000,"total_tokens":21000}},"rate_limits":{"plan_type":"pro","primary":{"used_percent":35,"window_minutes":10080,"resets_at":"2026-09-19T13:56:00Z"}}}}
JSONL
out="$(CODEX_HOME="$W" node "$R" --thread "$TH6" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "semanal 35%" && ! echo "$out" | grep -q "menos de 1 ponto"; then OK=$((OK+1)); echo "PASS  foto unica: 'semanal 35%' sem delta (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  foto unica (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "--- rodada 6: reset no meio (99% -> 5%, resets_at diferente) -> 'reset no meio', nunca 'menos de 1 ponto' ---"
cat > "$W/meta-reset.json" <<JSON
{"modo":"repo","rotulo":"teste","arquivos_n":1,"duracao_s":60,"modelo_pedido":"gpt-6-astra","esforco_pedido":"high","thread_id":"$TH6","rate_limits_antes":{"plan_type":"pro","primary":{"used_percent":99,"window_minutes":10080,"resets_at":"2026-09-12T13:00:00Z"}}}
JSON
cat > "$W/sessions/2026/09/12/rollout-2026-09-12T13-58-00-$TH6.jsonl" <<'JSONL'
{"type":"session_meta","payload":{"type":"session_meta","model":"gpt-6-astra"}}
{"type":"event_msg","payload":{"info":{"total_token_usage":{"input_tokens":20000,"output_tokens":1000,"total_tokens":21000}},"rate_limits":{"plan_type":"pro","primary":{"used_percent":5,"window_minutes":10080,"resets_at":"2026-09-19T13:56:00Z"}}}}
JSONL
out="$(CODEX_HOME="$W" node "$R" --meta "$W/meta-reset.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && echo "$out" | grep -q "99% → 5% (reset no meio)"; then OK=$((OK+1)); echo "PASS  reset no meio identificado (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  reset no meio (rc=$rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi

echo "================================"
echo "PASS=$OK FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1

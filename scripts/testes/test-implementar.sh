#!/bin/sh
# test-implementar.sh — suite offline do modo "GPT implementa" (implementar.mjs v2, contrato fechado na rodada 7 do GPT-6)
# com Codex FALSO (--fake-codex). Rodar: sh plugins/lab/skills/advisor-gpt/scripts/testes/test-implementar.sh  (espera PASS=62 FAIL=0)
# Sabotagens por concatenacao (padrao literal reprovaria no gate estatico do repo).
SCRIPTS="$(cd "$(dirname "$0")/.." && pwd)"
IMPL="$SCRIPTS/implementar.mjs"
W=/c/tmp/advisor-gate-test/impl; rm -rf "$W"; mkdir -p "$W/out" "$W/fakes" "$W/casa" "$W/codexhome"
export ADVISOR_GPT_HOME="$W/casa"
OK=0; FAIL=0
t() { nome="$1"; esp="$2"; shift 2; out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" -eq "$esp" ]; then OK=$((OK+1)); echo "PASS  $nome (exit $rc)"; else FAIL=$((FAIL+1)); echo "FAIL  $nome (esperado $esp, veio $rc)"; echo "$out" | head -4 | sed 's/^/      /'; fi; }
chk() { nome="$1"; cond="$2"; if eval "$cond"; then OK=$((OK+1)); echo "PASS  $nome"; else FAIL=$((FAIL+1)); echo "FAIL  $nome"; fi; }
P_PW="pass""word"; SEG="{\"$P_PW\":\"Abcd\$12345\"}"

# repo de trabalho: 1 commit, .gitignore com .env e dist/, .env e dist/bundle.js ignorados com conteudo
R="$W/repo"; mkdir -p "$R/src" "$R/tests" "$R/dist"; git -C "$R" init -q; git -C "$R" config user.email t@t.local; git -C "$R" config user.name Teste
printf 'export const soma = (a, b) => a - b; // bug proposital\n' > "$R/src/soma.js"
printf 'console.log("teste");\n' > "$R/tests/soma.test.js"
printf '.env\n.env.local\ndist/\n' > "$R/.gitignore"
printf 'ORIGINAL=1\n' > "$R/.env"
printf 'bundle v1\n' > "$R/dist/bundle.js"
git -C "$R" add -A; git -C "$R" commit -qm inicial
HEAD0=$(git -C "$R" rev-parse HEAD)
printf '# Proposta\n\n1. Corrigir soma em src/soma.js (usa - em vez de +).\n' > "$W/proposta.md"
limpa() { git -C "$R" reset -q --hard "$HEAD0"; git -C "$R" clean -fdq; printf 'ORIGINAL=1\n' > "$R/.env"; rm -f "$R/.env.local" "$R/.git/hooks/pre-commit"; }
aut() { node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta.md" --saida "$W/out" "$@" 2>&1 | sed -n 's/^autorizacao: //p'; }
ex() { node "$IMPL" executar --autorizacao "$1" --fake-codex "$2" --saida "$W/out"; }

# fakes: emitem JSON como o codex, escrevem no cwd e gravam o -o (salvo semresultado)
mk() { # mk <nome> <corpo js que roda antes do -o>
  cat > "$W/fakes/$1.js" <<JS
const fs=require("fs");const cp=require("child_process");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
$2
const o=process.argv.indexOf("-o");if(o>0&&!process.env.FAKE_SEM_RESULTADO)fs.writeFileSync(process.argv[o+1],"Implementado:\\nfeito\\n\\nArquivos alterados:\\n-\\n\\nComo verificar:\\n-\\n\\nNão feito / ressalvas:\\nnada\\n");
console.log(JSON.stringify({type:"thread.started",thread_id:"fake-thread-1"}));console.log(JSON.stringify({type:"turn.completed",usage:{input_tokens:1000,cached_input_tokens:100,output_tokens:50}}));});
JS
}
mk ok 'fs.writeFileSync("src/soma.js","export const soma = (a, b) => a + b;\n");fs.writeFileSync("src/NOVO.md","criado pelo fake\n");'
mk segredo "fs.writeFileSync('src/config.json','$SEG\\n');"
mk sensivel 'fs.writeFileSync("tests/soma.test.js","// teste sabotado\n");fs.writeFileSync(".env","ORIGINAL=2\n");'
mk commit 'fs.writeFileSync("src/soma.js","export const soma = (a, b) => a + b;\n");cp.execSync("git add -A && git -c user.email=t@t.local -c user.name=GPT commit -qm gpt");'
mk envsegredo "fs.writeFileSync('.env','ORIGINAL=1\\n$SEG\\n');"
mk nul "fs.writeFileSync('src/soma.js',Buffer.concat([Buffer.from('export const soma = (a, b) => a + b;\\n'),Buffer.from([0]),Buffer.from('$SEG\\n')]));"
mk conftest 'fs.writeFileSync("conftest.py","import os\n");fs.writeFileSync("jest.config.js","module.exports={}\n");fs.mkdirSync(".claude",{recursive:true});fs.writeFileSync(".claude/settings.local.json","{}\n");'
mk staged 'fs.writeFileSync("src/soma.js","export const soma = (a, b) => a + b;\n");cp.execSync("git add src/soma.js");'
mk distmod 'fs.writeFileSync("dist/bundle.js","bundle v2 pelo GPT\n");'
mk novoign 'fs.writeFileSync(".env.local","LOCAL=1\n");'
mk hook 'fs.writeFileSync(".git/hooks/pre-commit","#!/bin/sh\necho gpt\n");'
mk nada 'void 0;'

echo "--- autorizar ---"
printf 'sujo\n' > "$R/src/sujo.txt"
t "autorizar com arvore suja -> 2" 2 node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta.md" --saida "$W/out"
rm -f "$R/src/sujo.txt"
t "autorizar com saida dentro do repo -> 2" 2 node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta.md" --saida "$R/out"
t "autorizar com saida R/..out (nome que comeca com ..) -> 2" 2 node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta.md" --saida "$R/..out"
rm -rf "$R/out" "$R/..out"
cp "$W/proposta.md" "$R/proposta-dentro.md"; git -C "$R" add -A; git -C "$R" commit -qm p
t "autorizar com proposta dentro do repo -> 2" 2 node "$IMPL" autorizar --alvo "$R" --proposta "$R/proposta-dentro.md" --saida "$W/out"
git -C "$R" rm -q proposta-dentro.md; git -C "$R" commit -qm rm; HEAD0=$(git -C "$R" rev-parse HEAD)
printf '# Proposta\n\n1. usar %s\n' "$SEG" > "$W/proposta-suja.md"
t "SABOTAGEM proposta com senha -> gate reprova na autorizacao (4)" 4 node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta-suja.md" --saida "$W/out"
out="$(node "$IMPL" autorizar --alvo "$R" --proposta "$W/proposta.md" --itens 1 --saida "$W/out" 2>&1)"; rc=$?
AUT=$(echo "$out" | sed -n 's/^autorizacao: //p')
chk "autorizar limpo cria autorizacao (exit $rc)" "[ $rc -eq 0 ] && [ -f \"$AUT\" ]"
chk "autorizacao assinada, com HEAD, .env (sha+copia) e dist/bundle.js (so impressao digital) no inventario" "grep -q '\"assinatura\"' \"$AUT\" && grep -q \"$HEAD0\" \"$AUT\" && grep -q '\"rel\": \".env\"' \"$AUT\" && grep -q '\"rel\": \"dist/bundle.js\"' \"$AUT\" && grep -q '\"copia\": false' \"$AUT\" && ls \"$W/out\"/advisor-gpt-checkpoint-*/ignorados/.env >/dev/null 2>&1"

echo "--- executar: pre-condicoes ---"
node -e 'const f=process.argv[1];const a=JSON.parse(require("fs").readFileSync(f,"utf8"));a.itens=["todos"];require("fs").writeFileSync(f+".adult.json",JSON.stringify(a,null,2))' "$AUT"
t "autorizacao ADULTERADA (itens 1 -> todos) -> 5" 5 ex "$AUT.adult.json" "$W/fakes/ok.js"
node -e 'const f=process.argv[1];const a=JSON.parse(require("fs").readFileSync(f,"utf8"));a.head="0000000000000000000000000000000000000000";require("fs").writeFileSync(f+".adult2.json",JSON.stringify(a,null,2))' "$AUT"
t "autorizacao ADULTERADA (head) -> 5" 5 ex "$AUT.adult2.json" "$W/fakes/ok.js"
printf '\n2. item extra depois da aprovacao\n' >> "$W/proposta.md"
t "proposta alterada depois da aprovacao -> 5" 5 ex "$AUT" "$W/fakes/ok.js"
printf '# Proposta\n\n1. Corrigir soma em src/soma.js (usa - em vez de +).\n' > "$W/proposta.md"
printf 'x\n' > "$R/src/x.txt"; git -C "$R" add -A; git -C "$R" commit -qm mudou
t "HEAD mudou depois da autorizacao -> 5" 5 ex "$AUT" "$W/fakes/ok.js"
git -C "$R" reset -q --hard "$HEAD0"
t "executar com --saida dentro do repo -> 2" 2 node "$IMPL" executar --autorizacao "$AUT" --fake-codex "$W/fakes/ok.js" --saida "$R/out"
rm -rf "$R/out"
LOCK="$W/casa/locks/$(node -e 'console.log(require("crypto").createHash("sha256").update(require("fs").realpathSync.native(process.argv[1])).digest("hex").slice(0,16))' "$R").lock"
printf '{"pid":0}' > "$LOCK"
t "repo TRAVADO por outra execucao -> 5" 5 ex "$AUT" "$W/fakes/ok.js"
rm -f "$LOCK"
printf 'ORIGINAL=1\n%s\n' "$SEG" > "$R/.env"
t "SABOTAGEM arvore com senha em .env (ignorado, legivel pelo GPT) -> 4 ANTES do codex" 4 ex "$AUT" "$W/fakes/ok.js"
chk "codex falso NAO rodou (soma segue com bug) e autorizacao NAO foi consumida" "grep -q 'a - b' \"$R/src/soma.js\" && [ ! -f \"$W/casa/ledger/$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).id)' "$AUT").json\" ]"
printf 'ORIGINAL=1\n' > "$R/.env"

echo "--- executar: caminho feliz com codex falso ---"
out="$(ex "$AUT" "$W/fakes/ok.js" 2>&1)"; rc=$?
META=$(echo "$out" | sed -n 's/^meta: //p')
chk "executar ok (exit $rc), 2 arquivos alterados, gate aprovado" "[ $rc -eq 0 ] && echo \"$out\" | grep -q 'alterados: 2' && echo \"$out\" | grep -q 'gate no que mudou: aprovado'"
chk "soma corrigida no disco e NOVO.md criado" "grep -q 'a + b' \"$R/src/soma.js\" && [ -f \"$R/src/NOVO.md\" ]"
chk "diff gravado fora do repo com o arquivo novo" "grep -q 'NOVO: src/NOVO.md' \"$(echo "$out" | sed -n 's/^diff: //p')\""
chk "meta marca fake e tokens 1050" "grep -q '\"fake\": true' \"$META\" && grep -q '\"total_tokens\": 1050' \"$META\""
LEDGER="$W/casa/ledger/$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).id)' "$AUT").json"
chk "livro (ledger) fora do JSON registra inicio, termino e o que foi tocado" "grep -q '\"terminada\": \"' \"$LEDGER\" && grep -q 'src/NOVO.md' \"$LEDGER\""
# mesmo homedir que o script (os.homedir() = USERPROFILE no Windows; HOME sozinho diverge quando a suite roda com HOME falso)
CFG="${CODEX_HOME:-$(node -e 'process.stdout.write(require("os").homedir())')/.codex}/config.toml"
if [ "$(uname -o 2>/dev/null)" = "Msys" ] && [ -f "$CFG" ] && grep -q '^\[windows\]' "$CFG" && sed -n '/^\[windows\]/,/^\[/p' "$CFG" | grep -q '^sandbox'; then
  chk "comando do codex espelha windows.sandbox do config.toml" "grep -q 'windows.sandbox=' \"$META\""
else
  chk "comando do codex sem windows.sandbox (fora do Windows ou config sem a chave)" "! grep -q 'windows.sandbox=' \"$META\""
fi
t "executar de novo com a mesma autorizacao (consumida no livro) -> 5" 5 ex "$AUT" "$W/fakes/ok.js"
cp "$AUT" "$W/out/copia-da-autorizacao.json"
t "REPLAY por copia do JSON (mesmo id, livro ja existe) -> 5" 5 ex "$W/out/copia-da-autorizacao.json" "$W/fakes/ok.js"

echo "--- desfazer ---"
printf 'anotacao do dono\n' > "$R/nota-dono.md"
t "desfazer com arquivo do DONO fora do manifesto -> 5 (nao apaga)" 5 node "$IMPL" desfazer --autorizacao "$AUT"
chk "nota do dono continua la" "[ -f \"$R/nota-dono.md\" ]"
rm -f "$R/nota-dono.md"
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT"
chk "arvore limpa, soma voltou ao bug, NOVO.md sumiu" "[ -z \"$(git -C "$R" status --porcelain)\" ] && grep -q 'a - b' \"$R/src/soma.js\" && [ ! -f \"$R/src/NOVO.md\" ]"
t "desfazer DE NOVO (ja desfeita) -> 5" 5 node "$IMPL" desfazer --autorizacao "$AUT"
AUTN=$(aut); printf 'trabalho do dono\n' > "$R/nota-dono.md"
t "desfazer de autorizacao NUNCA executada -> 5" 5 node "$IMPL" desfazer --autorizacao "$AUTN"
chk "trabalho do dono intacto" "[ -f \"$R/nota-dono.md\" ]"; rm -f "$R/nota-dono.md"

echo "--- executar: GPT escreve segredo -> gate reprova (4), desfazer limpa ---"
AUT2=$(aut)
t "SABOTAGEM fake escreve senha em src/config.json -> 4" 4 ex "$AUT2" "$W/fakes/segredo.js"
t "desfazer apos sabotagem -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT2"
chk "config.json removido" "[ ! -f \"$R/src/config.json\" ]"
AUT2b=$(aut)
t "SABOTAGEM fake escreve senha no .env IGNORADO -> 4 (gate em cada arquivo tocado)" 4 ex "$AUT2b" "$W/fakes/envsegredo.js"
t "desfazer -> 0 (.env devolvido do checkpoint)" 0 node "$IMPL" desfazer --autorizacao "$AUT2b"
chk ".env igual ao original" "[ \"$(cat "$R/.env")\" = 'ORIGINAL=1' ]"
AUT2c=$(aut)
t "SABOTAGEM byte NUL antes da senha em arquivo rastreado -> 4 (nao inspecionavel reprova)" 4 ex "$AUT2c" "$W/fakes/nul.js"
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT2c"

echo "--- executar: contrato — commit do GPT, .git interno, staged ---"
AUT3=$(aut)
t "GPT faz COMMIT -> 4 (contrato violado: HEAD/refs mudaram)" 4 ex "$AUT3" "$W/fakes/commit.js"
t "desfazer -> 0 (volta ao HEAD autorizado)" 0 node "$IMPL" desfazer --autorizacao "$AUT3"
chk "HEAD de volta ao autorizado" "[ \"$(git -C "$R" rev-parse HEAD)\" = \"$HEAD0\" ]"
AUT3b=$(aut)
t "GPT escreve .git/hooks/pre-commit -> 4 (.git interno alterado)" 4 ex "$AUT3b" "$W/fakes/hook.js"
t "desfazer -> 0 (hook removido)" 0 node "$IMPL" desfazer --autorizacao "$AUT3b"
chk "pre-commit sumiu" "[ ! -f \"$R/.git/hooks/pre-commit\" ]"
AUT3c=$(aut)
out="$(ex "$AUT3c" "$W/fakes/staged.js" 2>&1)"; rc=$?
chk "mudanca STAGED aparece no relatorio e no diff (exit $rc)" "[ $rc -eq 0 ] && echo \"$out\" | grep -q 'com STAGED' && grep -q 'a + b' \"$(echo "$out" | sed -n 's/^diff: //p')\""
t "desfazer -> 0 (indice incluso)" 0 node "$IMPL" desfazer --autorizacao "$AUT3c"
chk "indice limpo e soma com bug" "git -C \"$R\" diff --cached --quiet && grep -q 'a - b' \"$R/src/soma.js\""

echo "--- executar: sensiveis ampliados, ignorados (alterado / novo / sem copia), resultado ausente ---"
AUT4=$(aut)
out="$(ex "$AUT4" "$W/fakes/sensivel.js" 2>&1)"; rc=$?
chk "teste alterado aparece como SENSIVEL e .env como IGNORADO alterado (exit $rc)" "echo \"$out\" | grep -q 'SENSÍVEIS.*tests/soma.test.js' && echo \"$out\" | grep -q 'IGNORADOS alterados: .env'"
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT4"
chk ".env voltou ao original e teste restaurado" "grep -q 'ORIGINAL=1' \"$R/.env\" && grep -q 'console.log' \"$R/tests/soma.test.js\""
AUT4b=$(aut)
out="$(ex "$AUT4b" "$W/fakes/conftest.js" 2>&1)"
chk "conftest.py, jest.config.js e .claude/settings.local.json sao SENSIVEIS" "echo \"$out\" | grep 'SENSÍVEIS' | grep -q 'conftest.py' && echo \"$out\" | grep 'SENSÍVEIS' | grep -q 'jest.config.js' && echo \"$out\" | grep 'SENSÍVEIS' | grep -q '.claude/settings.local.json'"
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT4b"
AUT4c=$(aut)
out="$(ex "$AUT4c" "$W/fakes/novoign.js" 2>&1)"
chk "ignorado NOVO (.env.local) destacado" "echo \"$out\" | grep -q 'IGNORADOS novos: .env.local'"
t "desfazer -> 0 (apaga o ignorado novo)" 0 node "$IMPL" desfazer --autorizacao "$AUT4c"
chk ".env.local sumiu" "[ ! -f \"$R/.env.local\" ]"
AUT4d=$(aut)
out="$(ex "$AUT4d" "$W/fakes/distmod.js" 2>&1)"
chk "dist/bundle.js (pasta pesada, so impressao digital) aparece como IGNORADO alterado" "echo \"$out\" | grep -q 'IGNORADOS alterados: dist/bundle.js'"
t "desfazer -> 3 INCOMPLETO (sem copia; declara em vez de fingir sucesso)" 3 node "$IMPL" desfazer --autorizacao "$AUT4d"
printf 'bundle v1\n' > "$R/dist/bundle.js"
AUT4e=$(aut)
t "fake que NAO grava o resultado (-o) -> 3" 3 env FAKE_SEM_RESULTADO=1 node "$IMPL" executar --autorizacao "$AUT4e" --fake-codex "$W/fakes/nada.js" --saida "$W/out"
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT4e"

echo "--- sandbox do Windows: TOML com aspas simples ---"
printf '[windows]\nsandbox = '"'"'elevated'"'"'\n' > "$W/codexhome/config.toml"
AUT5=$(aut)
out="$(CODEX_HOME="$W/codexhome" ex "$AUT5" "$W/fakes/ok.js" 2>&1)"; META5=$(echo "$out" | sed -n 's/^meta: //p')
if [ "$(uname -o 2>/dev/null)" = "Msys" ]; then
  chk "sandbox = 'elevated' (aspas simples) espelhado no comando" "grep -q 'windows.sandbox=\\\\\"elevated\\\\\"' \"$META5\""
else
  chk "fora do Windows nao espelha (n/a)" "! grep -q 'windows.sandbox=' \"$META5\""
fi
t "desfazer -> 0" 0 node "$IMPL" desfazer --autorizacao "$AUT5"
chk "arvore final limpa e inventario original (.env, dist/bundle.js)" "[ -z \"$(git -C "$R" status --porcelain)\" ] && [ \"$(cat "$R/.env")\" = 'ORIGINAL=1' ] && [ \"$(cat "$R/dist/bundle.js")\" = 'bundle v1' ]"

echo "================================"
echo "PASS=$OK FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

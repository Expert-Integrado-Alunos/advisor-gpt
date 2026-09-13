#!/bin/sh
# Suite local do gate-segredo.sh da skill advisor-gpt. 100% offline, nada sai da maquina.
# Rodar: sh plugins/lab/skills/advisor-gpt/scripts/testes/test-gate-segredo.sh  (espera PASS=51 FAIL=0)
# Os padroes de segredo dos casos de sabotagem sao montados por CONCATENACAO de proposito:
# padrao literal neste arquivo reprovaria no gate estatico do repo de skills.
set -u
SCRIPTS="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$SCRIPTS/gate-segredo.sh"
W=/c/tmp/advisor-gate-test/w
rm -rf "$W"; mkdir -p "$W"
OK=0; FAIL=0
# prefixos montados por concatenacao: nao escrever literal de padrao de segredo neste arquivo
P_SK="sk"; P_GH="ghp"; P_JWT="eyJ"; P_OP="op:"
P_PW="pass""word"; P_PW2="sen""ha"; P_AK="API""_KEY"

t() { # t <nome> <esperado> <cmd...>
  nome="$1"; esp="$2"; shift 2
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" -eq "$esp" ]; then OK=$((OK+1)); echo "PASS  $nome (exit $rc)"
  else FAIL=$((FAIL+1)); echo "FAIL  $nome (esperado $esp, veio $rc)"; echo "$out" | head -3 | sed 's/^/      /'; fi
}

# --- modo arquivo ---
printf 'linha limpa\noutra linha\n' > "$W/limpo.txt"
t "arquivo limpo -> 0" 0 sh "$GATE" arquivo "$W/limpo.txt"

printf 'config = "%s-proj-ABCdefGHIjklMNOpqrsTUV123456"\n' "$P_SK" > "$W/sab1.txt"
t "SABOTAGEM chave openai -> 1" 1 sh "$GATE" arquivo "$W/sab1.txt"

printf 'tok = "%s_ABCdefGHIjkl1234567890"\n' "$P_GH" > "$W/sab2.txt"
t "SABOTAGEM token github -> 1" 1 sh "$GATE" arquivo "$W/sab2.txt"

printf '%sabcdefghijklmnopq.%s\n' "$P_JWT" "abcdefghijk" > "$W/sab3.txt"
t "SABOTAGEM jwt -> 1" 1 sh "$GATE" arquivo "$W/sab3.txt"

printf '{"%s":"trocaesta123"}\n' "$P_PW" > "$W/sab4.txt"
t "SABOTAGEM json password -> 1" 1 sh "$GATE" arquivo "$W/sab4.txt"

printf 'export MEU_%s=abcd1234efgh\n' "$P_AK" > "$W/sab5.txt"
t "SABOTAGEM export API_KEY -> 1" 1 sh "$GATE" arquivo "$W/sab5.txt"

printf 'TOKEN=$(op read "%s//Agentes Eric/X/credential")\n' "$P_OP" > "$W/opread.txt"
t "excecao op read -> 0" 0 sh "$GATE" arquivo "$W/opread.txt"

printf 'ref = `%s//Agentes Eric/X/credential`  # ponteiro de cofre, nao segredo
' "$P_OP" > "$W/opsolto.txt"
t "op:// solto (ponteiro) -> 0" 0 sh "$GATE" arquivo "$W/opsolto.txt"

# nomes que PARECEM chave mas nao sao (falsos positivos pagos em 12/09/2026 no repo real)
printf 'var(--%s-image-linear-from-color); api_key = load_api_key(); token = responseAccessToken
' "$P_SK" > "$W/fp1.txt"
t "nomes parecidos com chave -> 0" 0 sh "$GATE" arquivo "$W/fp1.txt"
printf "url = '/v1/activities?api_token=' + PD_TOK, { 'Content-Type': 'x' }
" > "$W/fp2.txt"
t "concatenacao de variavel -> 0" 0 sh "$GATE" arquivo "$W/fp2.txt"
printf '"client_secret": "credential", "op_fields": {"client_id": "client_id"}
' > "$W/fp3.txt"
t "nome de campo como valor -> 0" 0 sh "$GATE" arquivo "$W/fp3.txt"

# token na MESMA linha do op read continua pegando (regressao v2)
printf 'TOKEN=$(op read "%s//A/B/c") # fallback %s_ABCdefGHIjkl1234567890\n' "$P_OP" "$P_GH" > "$W/opmix.txt"
t "op read + token na mesma linha -> 1" 1 sh "$GATE" arquivo "$W/opmix.txt"

# binario nao quebra
printf '\000\001\002\003binario\000' > "$W/bin.dat"
t "SABOTAGEM binario com NUL como alvo unico -> 1" 1 sh "$GATE" arquivo "$W/bin.dat"

# senhas literais que a v2 do padrao deixava passar (achado do GPT-6, 12/09/2026, rodada 3)
printf '{"%s":"abcdefghijk"}
' "$P_PW" > "$W/sab6.txt"
t "SABOTAGEM json password sem digito -> 1" 1 sh "$GATE" arquivo "$W/sab6.txt"
printf '{"%s":"abcd1efgh"}
' "$P_PW" > "$W/sab7.txt"
t "SABOTAGEM json password digito no meio -> 1" 1 sh "$GATE" arquivo "$W/sab7.txt"
printf '{"%s":"abcd efgh12345678"}
' "$P_PW" > "$W/sab8.txt"
t "SABOTAGEM json password com espaco -> 1" 1 sh "$GATE" arquivo "$W/sab8.txt"
printf '"client_%s": "AbC-123_xyz.token"
' "secret" > "$W/sab9.txt"
t "SABOTAGEM json secret com digito/simbolo -> 1" 1 sh "$GATE" arquivo "$W/sab9.txt"

printf '%s do zip = "TrocaEssa123!"
' "$P_PW2" > "$W/sab10.txt"
t "SABOTAGEM senha em prosa (palavras entre) -> 1" 1 sh "$GATE" arquivo "$W/sab10.txt"
printf 'PAGINA_%s="<lida da nota do Brain, sem ecoar>"
' "SENHA" > "$W/fp4.txt"
t "placeholder <...> como valor -> 0" 0 sh "$GATE" arquivo "$W/fp4.txt"

# rodada 4 do GPT-6 (12/09/2026): simbolos usuais em senha/secret e senha em variavel sem digito
printf '{"%s":"Abcd$12345"}\n' "$P_PW" > "$W/sab11.txt"
t "SABOTAGEM json password com cifrao -> 1" 1 sh "$GATE" arquivo "$W/sab11.txt"
printf '{"client_%s":"Abcd!12345"}\n' "secret" > "$W/sab12.txt"
t "SABOTAGEM json secret com exclamacao -> 1" 1 sh "$GATE" arquivo "$W/sab12.txt"
printf '%s=abcdefghijk\n' "PASS""WORD" > "$W/sab13.txt"
t "SABOTAGEM variavel PASSWORD sem digito -> 1" 1 sh "$GATE" arquivo "$W/sab13.txt"
printf '{"client_%s":"client_%s"}\n' "secret" "secret" > "$W/fp5.txt"
t "nome de campo igual ao valor (secret) -> 0" 0 sh "$GATE" arquivo "$W/fp5.txt"
printf '{"%s":"%s"}\n' "api_key" "api_key" > "$W/fp6.txt"
t "nome de campo igual ao valor (api_key) -> 0" 0 sh "$GATE" arquivo "$W/fp6.txt"
# a saida do gate NUNCA traz o trecho (o bloqueio nao pode vazar o segredo pro historico)
out="$(sh "$GATE" arquivo "$W/sab11.txt" 2>&1)"
if echo "$out" | grep -q 'Abcd'; then FAIL=$((FAIL+1)); echo "FAIL  saida do gate vazou trecho"; else OK=$((OK+1)); echo "PASS  saida do gate sem trecho"; fi

# falsos positivos pagos apos a rodada 4 (12/09/2026): regex compilada e glifo de fonte em JS minificado
printf '%sS = re.compile(r"abc")\n' "SEC""RET" > "$W/fp7.txt"
t "variavel SECRETS = re.compile(...) -> 0" 0 sh "$GATE" arquivo "$W/fp7.txt"
printf '%s' 'x={Icon:1,Token:"\uF10F",Next:2}' > "$W/fp8.txt"
t "glifo Token:\"\\uF10F\" em JS minificado -> 0" 0 sh "$GATE" arquivo "$W/fp8.txt"
printf '%s = os.environ.get("X")\n' "PASS""WORD" > "$W/fp9.txt"
t "PASSWORD = os.environ.get(...) -> 0" 0 sh "$GATE" arquivo "$W/fp9.txt"

# --- modo pasta ---
mkdir -p "$W/pastalimpa"; printf 'nada aqui\n' > "$W/pastalimpa/a.txt"
t "pasta limpa -> 0" 0 sh "$GATE" pasta "$W/pastalimpa"
printf 'x = "%s-proj-ABCdefGHIjklMNOpqrsTUV123456"\n' "$P_SK" > "$W/pastalimpa/b.txt"
t "SABOTAGEM pasta com chave -> 1" 1 sh "$GATE" pasta "$W/pastalimpa"
rm -f "$W/pastalimpa/b.txt"

# arquivo grande demais = nao inspecionado
mkdir -p "$W/pastagrande"; head -c 6000000 /dev/urandom | base64 > "$W/pastagrande/grande.txt"
t "arquivo > 5MB -> 1 (nao inspecionado)" 1 sh "$GATE" pasta "$W/pastagrande"

# --- modo repo ---
R="$W/repo"; mkdir -p "$R"; git -C "$R" init -q
git -C "$R" config user.email t@t.local; git -C "$R" config user.name Teste
printf 'inicial\n' > "$R/README.md"; git -C "$R" add -A; git -C "$R" commit -qm inicial
t "repo limpo -> 0" 0 sh "$GATE" repo "$R"
printf 'y = "%s_ABCdefGHIjkl1234567890"\n' "$P_GH" > "$R/novo.txt"
t "SABOTAGEM repo untracked com token -> 1" 1 sh "$GATE" repo "$R"
rm -f "$R/novo.txt"
printf 'z = "%s-proj-ABCdefGHIjklMNOpqrsTUV123456"\n' "$P_SK" >> "$R/README.md"
t "SABOTAGEM repo unstaged com chave -> 1" 1 sh "$GATE" repo "$R"
git -C "$R" checkout -q -- README.md

# rodada 5 do GPT-6 (12/09/2026, esforco max): bypasses do gate
R5="$W/repo5"; mkdir -p "$R5"; git -C "$R5" init -q; git -C "$R5" config user.email t@t; git -C "$R5" config user.name t
printf 'x=1\n' > "$R5/cfg.env"; git -C "$R5" add cfg.env; git -C "$R5" commit -q -m init
printf '%s=abcdefghijk\n' "PASS""WORD" >> "$R5/cfg.env"
t "SABOTAGEM diff unstaged +PASSWORD=... sem aspas -> 1" 1 sh "$GATE" repo "$R5"
git -C "$R5" checkout -q -- cfg.env
printf '{"%s":"abcdefghijk"}\n' "$P_PW" > "$R5/ação.txt"
t "SABOTAGEM arquivo novo com nome acentuado (quotePath) -> 1" 1 sh "$GATE" repo "$R5"
rm -f "$R5/ação.txt"
printf 'foco\000\n{"%s":"abcdefghijk"}\n' "$P_PW" > "$W/nul.md"
t "SABOTAGEM byte NUL antes da senha (modo arquivo) -> 1" 1 sh "$GATE" arquivo "$W/nul.md"
mkdir -p "$W/pastabin"; printf '\211PNG\000\000binario' > "$W/pastabin/img.png"; printf 'texto limpo\n' > "$W/pastabin/leia.txt"
t "midia binaria (.png) em pasta e pulada -> 0" 0 sh "$GATE" pasta "$W/pastabin"
cp "$W/nul.md" "$W/pastabin/estranho.md"
t "SABOTAGEM .md com NUL em pasta -> 1" 1 sh "$GATE" arquivo "$W/pastabin/estranho.md"

# rodada 6 do GPT-6: o PACOTE final (modo arquivo) tem diffs dentro — marcador +/- nao pode esconder a senha
printf '### Diff unstaged\n\n+%s=abcdefghijk\n' "PASS""WORD" > "$W/pacote1.md"
t "SABOTAGEM pacote com +PASSWORD= (modo arquivo) -> 1" 1 sh "$GATE" arquivo "$W/pacote1.md"
printf '++%s=abcdefghijk\n' "PASS""WORD" > "$W/pacote2.md"
t "SABOTAGEM diff combinado ++PASSWORD= -> 1" 1 sh "$GATE" arquivo "$W/pacote2.md"

# --- modo branch ---
BASE=$(git -C "$R" rev-parse HEAD)
printf 'feature\n' > "$R/f.txt"; git -C "$R" add -A; git -C "$R" commit -qm "feature limpa"
t "branch limpo -> 0" 0 sh "$GATE" branch "$R" "$BASE"
printf 'w = "%s_ABCdefGHIjkl1234567890"\n' "$P_GH" > "$R/g.txt"; git -C "$R" add -A; git -C "$R" commit -qm "feature suja"
t "SABOTAGEM branch diff com token -> 1" 1 sh "$GATE" branch "$R" "$BASE"
git -C "$R" reset -q --hard "$BASE"
printf 'h\n' > "$R/h.txt"; git -C "$R" add -A
git -C "$R" commit -qm "msg com segredo ${P_SK}-proj-ABCdefGHIjklMNOpqrsTUV123456"
t "SABOTAGEM segredo na MENSAGEM de commit -> 1" 1 sh "$GATE" branch "$R" "$BASE"

# --- erros operacionais (exit 2) ---
t "modo invalido -> 2" 2 sh "$GATE" xpto "$W/limpo.txt"
t "arquivo inexistente -> 2" 2 sh "$GATE" arquivo "$W/nao-existe.txt"
t "pasta inexistente -> 2" 2 sh "$GATE" pasta "$W/nao-existe"
t "repo que nao e git -> 2" 2 sh "$GATE" repo "$W/pastalimpa"
t "branch com base inexistente -> 2" 2 sh "$GATE" branch "$R" naoexiste123
t "branch sem base -> 2" 2 sh "$GATE" branch "$R"
t "sem argumentos -> 2" 2 sh "$GATE"

echo "================================"
echo "PASS=$OK FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1

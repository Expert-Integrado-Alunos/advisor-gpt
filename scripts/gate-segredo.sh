#!/bin/sh
# gate-segredo.sh — Passo 1 da skill advisor-gpt: nada sai da maquina antes deste gate.
# Uso:
#   sh gate-segredo.sh repo    "<raiz do repo>"          # working tree: diff staged + diff unstaged + arquivos novos
#   sh gate-segredo.sh branch  "<raiz do repo>" <base>   # branch: diff <base>...HEAD + mensagens de commit <base>..HEAD
#   sh gate-segredo.sh pasta   "<pasta>"                 # artefato: TODOS os arquivos de texto da arvore (se a pasta
#                                                        #   esta dentro de um repo git, varre a RAIZ do repo: e o que o
#                                                        #   Codex enxerga em --cwd)
#   sh gate-segredo.sh arquivo "<arquivo>"               # um arquivo solto (o FOCO, por exemplo)
#   sh gate-segredo.sh arvore  "<raiz do repo>"          # o que o GPT LE em workspace-write: tracked + untracked + ignorados
#                                                        #   (.env etc.) fora de node_modules/dist/.next/.codex (v6, rodada 7)
#   sh gate-segredo.sh lista   "<arquivo NUL-separado>"  # exatamente os arquivos listados (caminhos absolutos), conteudo
#                                                        #   inteiro; QUALQUER byte NUL = nao inspecionado (v6, rodada 7: o
#                                                        #   implementar.mjs gateia cada arquivo que o GPT tocou, ignorado incluso)
# Saida: lista "origem:linha: padrao de segredo" no stdout (sem o trecho) e exit 1 se achou padrao ou se algum arquivo NAO pode ser
# inspecionado; exit 0 se limpo; exit 2 = uso errado ou falha de git/grep (falha NUNCA vira aprovacao).
# Referencia a cofre (op://vault/item/campo) e PONTEIRO, nao segredo: sai do trecho ANTES da varredura (so o
# trecho, nao a linha: um token na mesma linha continua sendo detectado). A saida NUNCA imprime o trecho: so origem e
# numero da linha (achado do GPT-6, rodada 4: o proprio bloqueio vazava o segredo pro historico da sessao).
# Os padroes ficam em padroes.txt de proposito: padrao de segredo escrito dentro de SKILL.md reprova no
# gate estatico do repo de skills.
# Historico: v6 em 12/09/2026 (rodada 7 do GPT-6, modo implementar): modos arvore e lista. v5 em 12/09/2026 (rodada 6 do GPT-6): marcador de diff sai em qualquer entrada (pacote final), nome com
# quebra de linha = exit 2. v4 em 12/09/2026 (rodada 5 do GPT-6): diff sem marcador, NUL em texto = nao inspecionado, ls-files -z,
# enumerado-e-sumido = nao inspecionado. v2 em 12/09/2026 apos revisao adversarial do GPT-6 (excecao do op read apagava a linha inteira;
# base com barra quebrava o sed e virava "gate limpo"; JSON "password":"..." passava; mensagens de commit
# ficavam fora; exclusao de dist/.env.local deixava arquivo legivel pro Codex sem inspecao).
set -u
MODO="${1:-}"; ALVO="${2:-}"; BASE="${3:-}"
[ -z "$MODO" ] || [ -z "$ALVO" ] && { echo "uso: gate-segredo.sh repo|branch|pasta|arquivo|arvore|lista <caminho> [base]" >&2; exit 2; }
DIR="$(cd "$(dirname "$0")" && pwd)"
PADROES="$DIR/padroes.txt"
[ -f "$PADROES" ] || { echo "ERRO: $PADROES ausente" >&2; exit 2; }
T="${TMPDIR:-/c/tmp}/advisor-gpt-gate-$$"
ACHADOS="$T.achados"; BRUTO="$T.bruto"; NAOINSP="$T.naoinsp"
trap 'rm -f "$ACHADOS" "$BRUTO" "$BRUTO.z" "$BRUTO.lst" "$NAOINSP" "$T.err"' EXIT
: > "$ACHADOS"; : > "$NAOINSP"
MAX_BYTES=5242880

# varre(<rotulo>) le stdin, remove `op read "op://..."` do trecho e grava achados com o rotulo
varre() {
  # referencia a cofre (op://vault/item/campo) NAO e segredo: e ponteiro. Sai do trecho antes da varredura,
  # so o trecho (o resto da linha continua sendo varrido). Cobre op read "...", op read '...', \"...\" e
  # template `op://...` em codigo.
  # marcador de diff (+, -, espaco; ate 2 num diff combinado) sai ANTES da varredura, em QUALQUER entrada: o pacote
  # final e um arquivo com diffs dentro (achado do GPT-6, rodada 6: "+PASSWORD=" passava no gate do pacote).
  sed -E -e 's/^[+ -]{1,2}//' -e 's/op:\/\/[^"'"'"'`\ )]*/OP_REF/g'     | grep -E -i -n -f "$PADROES" 2>"$T.err" | ROT="$1" awk -F: '{print ENVIRON["ROT"] ":" $1 ": padrao de segredo (trecho omitido de proposito)"}' >> "$ACHADOS"
  # grep: 0 achou, 1 nao achou, 2 erro
  if [ -s "$T.err" ]; then echo "ERRO: grep falhou em $1: $(head -1 "$T.err")" >&2; exit 2; fi
}
# lista_de_z <entrada NUL-separada> <saida 1 por linha>: nome com quebra de linha fragmentaria a lista e
# apontaria pra arquivos errados (achado do GPT-6, rodada 6) — conta NULs x linhas; divergiu = exit 2.
lista_de_z() {
  n0=$(tr -cd '\000' < "$1" | wc -c | tr -d ' ')
  tr '\0' '\n' < "$1" > "$2"
  nl=$(grep -c '' "$2" | tr -d ' ')
  rm -f "$1"
  if [ "$n0" != "$nl" ]; then echo "ERRO: nome de arquivo com quebra de linha no alvo ($n0 entradas, $nl linhas): enumeracao nao confiavel" >&2; exit 2; fi
}
# gitcmd <rotulo> <args...>: roda git e propaga falha como erro operacional
gitcmd() {
  rot="$1"; shift
  if ! git -C "$ALVO" "$@" > "$BRUTO" 2>"$T.err"; then
    echo "ERRO: git $* falhou ($rot): $(head -1 "$T.err")" >&2; exit 2
  fi
  varre "$rot" < "$BRUTO"
}
# arquivo <caminho> <rotulo>: texto = varre; binario = pula; grande demais = nao inspecionado
arquivo() {
  f="$1"; rot="$2"
  [ -f "$f" ] || { echo "$rot (enumerado mas nao encontrado — nome com escape? caminho errado?)" >> "$NAOINSP"; return 0; }
  [ -r "$f" ] || { echo "$rot (sem permissao de leitura)" >> "$NAOINSP"; return 0; }
  tam=$(wc -c < "$f" 2>/dev/null || echo 0)
  [ "$tam" -eq 0 ] && return 0
  if [ "$tam" -gt "$MAX_BYTES" ]; then echo "$rot ($tam bytes, acima de $MAX_BYTES)" >> "$NAOINSP"; return 0; fi
  grep -I -q . "$f" 2>"$T.err"; rc=$?
  if [ "$rc" -eq 2 ]; then echo "ERRO: nao consegui ler $f: $(head -1 "$T.err")" >&2; exit 2; fi
  if [ "$rc" -eq 0 ]; then varre "$rot" < "$f"; return 0; fi
  # rc 1 = grep considerou binario (byte NUL). Midia de verdade pula; arquivo com extensao de TEXTO (ou o
  # alvo unico do modo arquivo: foco/pacote) com NUL e suspeito e NAO passa sem inspecao (achado do GPT-6,
  # rodada 5: um NUL no foco fazia o pacote inteiro virar "binario pulado" e ser aprovado).
  case "$f" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.zip|*.gz|*.7z|*.woff|*.woff2|*.ttf|*.otf|*.mp3|*.mp4|*.wav|*.ogg|*.mov|*.webm|*.exe|*.dll|*.so|*.dylib|*.wasm|*.pyc|*.class|*.jar|*.sqlite|*.db)
      { [ "$MODO" = "arquivo" ] || [ "$MODO" = "lista" ]; } && echo "$rot (byte NUL em alvo unico: nao inspecionado)" >> "$NAOINSP" ;;
    *) echo "$rot (byte NUL em arquivo de texto: nao inspecionado)" >> "$NAOINSP" ;;
  esac
  return 0
}

case "$MODO" in
  repo)
    git -C "$ALVO" rev-parse --show-toplevel >/dev/null 2>&1 || { echo "ERRO: $ALVO nao e repositorio git" >&2; exit 2; }
    gitcmd "staged" diff --cached
    gitcmd "unstaged" diff
    # -z: nome cru, sem aspas nem escape octal (core.quotePath) — achado do GPT-6, rodada 5 ("ação.txt" era pulado)
    git -C "$ALVO" ls-files --others --exclude-standard -z > "$BRUTO.z" 2>/dev/null || { echo "ERRO: git ls-files falhou" >&2; exit 2; }
    lista_de_z "$BRUTO.z" "$BRUTO.lst"
    while IFS= read -r f; do [ -n "$f" ] && arquivo "$ALVO/$f" "$ALVO/$f"; done < "$BRUTO.lst"
    rm -f "$BRUTO.lst"
    ;;
  branch)
    [ -z "$BASE" ] && { echo "uso: gate-segredo.sh branch <raiz> <base>" >&2; exit 2; }
    git -C "$ALVO" rev-parse --verify "$BASE" >/dev/null 2>&1 || { echo "ERRO: base $BASE nao existe em $ALVO" >&2; exit 2; }
    gitcmd "branch-diff" diff "$BASE...HEAD"
    gitcmd "commit-msgs" log --format='%H %s%n%b' "$BASE..HEAD"
    ;;
  pasta)
    [ -d "$ALVO" ] || { echo "ERRO: $ALVO nao e pasta" >&2; exit 2; }
    RAIZ="$(git -C "$ALVO" rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$RAIZ" ] && [ "$RAIZ" != "$ALVO" ]; then
      echo "aviso: $ALVO esta dentro do repo $RAIZ — o Codex enxerga a raiz; varrendo a raiz inteira" >&2
      ALVO="$RAIZ"
    fi
    find "$ALVO" -type f -not -path '*/.git/*' -print0 2>"$T.err" > "$BRUTO.z"
    if [ -s "$T.err" ]; then echo "ERRO: enumeracao incompleta em $ALVO: $(head -1 "$T.err")" >&2; exit 2; fi
    lista_de_z "$BRUTO.z" "$BRUTO.lst"
    while IFS= read -r f; do [ -n "$f" ] && arquivo "$f" "$f"; done < "$BRUTO.lst"
    rm -f "$BRUTO.lst"
    ;;
  arquivo)
    [ -f "$ALVO" ] || { echo "ERRO: $ALVO nao e arquivo" >&2; exit 2; }
    arquivo "$ALVO" "$ALVO"
    ;;
  arvore)
    # tudo que o modelo consegue LER na raiz em workspace-write: rastreados, novos e IGNORADOS (.env, bancos), menos os
    # diretorios pesados (node_modules, dist, .next, .codex) — limite documentado. -z como nos outros modos.
    git -C "$ALVO" rev-parse --show-toplevel >/dev/null 2>&1 || { echo "ERRO: $ALVO nao e repositorio git" >&2; exit 2; }
    { git -C "$ALVO" ls-files -z --cached --others --exclude-standard && git -C "$ALVO" ls-files -z --others --ignored --exclude-standard; } > "$BRUTO.z" 2>"$T.err" || { echo "ERRO: git ls-files falhou: $(head -1 "$T.err")" >&2; exit 2; }
    lista_de_z "$BRUTO.z" "$BRUTO.lst"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      case "/$f/" in */node_modules/*|*/dist/*|*/.next/*|*/.codex/*) continue ;; esac
      [ -d "$ALVO/$f" ] && continue
      arquivo "$ALVO/$f" "$ALVO/$f"
    done < "$BRUTO.lst"
    rm -f "$BRUTO.lst"
    ;;
  lista)
    [ -f "$ALVO" ] || { echo "ERRO: $ALVO nao e arquivo de lista" >&2; exit 2; }
    cp "$ALVO" "$BRUTO.z"
    lista_de_z "$BRUTO.z" "$BRUTO.lst"
    while IFS= read -r f; do [ -n "$f" ] && arquivo "$f" "$f"; done < "$BRUTO.lst"
    rm -f "$BRUTO.lst"
    ;;
  *) echo "modo invalido: $MODO (repo|branch|pasta|arquivo|arvore|lista)" >&2; exit 2 ;;
esac

RC=0
if [ -s "$ACHADOS" ]; then
  echo "SEGREDO OU DADO SENSIVEL DETECTADO — nada foi enviado. Parar e perguntar ao Eric:"
  cat "$ACHADOS"; RC=1
fi
if [ -s "$NAOINSP" ]; then
  echo "ARQUIVO(S) NAO INSPECIONADO(S) — grande demais, ilegivel, com byte NUL ou sumido; nada disso pode sair sem OK do Eric:"
  cat "$NAOINSP"; RC=1
fi
[ "$RC" -eq 0 ] && echo "gate limpo: nenhum padrao de segredo em $MODO $ALVO${BASE:+ (base $BASE)}"
exit "$RC"

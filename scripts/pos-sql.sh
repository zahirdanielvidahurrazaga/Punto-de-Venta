#!/bin/zsh
# Uso: pos-sql.sh archivo.sql  → corre el SQL en la base del POS.
# Token: si el portapapeles trae un token de Supabase (sbp_…), lo guarda en el llavero
# ("Supabase POS") y lo usa; si no, usa el que ya esté en el llavero.
CLIP=$(pbpaste | tr -d '[:space:]')
if [[ "$CLIP" == sbp_* ]]; then
  security add-generic-password -U -s "Supabase POS" -a pos -w "$CLIP" && echo "🔑 Token guardado en el llavero (Supabase POS)." >&2
fi
TOKEN=$(security find-generic-password -s "Supabase POS" -w 2>/dev/null)
[[ -z "$TOKEN" ]] && { echo "❌ No hay token: el portapapeles no trae uno (debe empezar con sbp_) y el llavero está vacío." >&2; exit 1; }
jq -Rs '{query: .}' "$1" | curl -s -X POST "https://api.supabase.com/v1/projects/gtkymvjadgcwhdmpyhoc/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- | jq .

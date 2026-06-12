#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Respaldo GRATIS y robusto de la base de datos Supabase (pg_dump).
#
# Setup (una vez):
#   1) cp scripts/.backup.env.example scripts/.backup.env
#      y pega tu cadena de conexión (ver instrucciones en ese archivo).
#   2) chmod +x scripts/backup_supabase.sh
#
# Correr a mano:        ./scripts/backup_supabase.sh
# Programar diario 3am: crontab -e  →
#   0 3 * * * cd /ruta/al/proyecto && ./scripts/backup_supabase.sh >> backups/backup.log 2>&1
#
# Restaurar un respaldo:
#   pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" backups/<archivo>.dump
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.backup.env"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP="${BACKUP_KEEP:-14}"                       # cuántos respaldos conservar
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# 1) Carga la cadena de conexión
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL — crea scripts/.backup.env (ver scripts/.backup.env.example)}"

# 2) Verifica pg_dump
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump no está instalado." >&2
  echo "  En Mac:  brew install libpq && echo 'export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\"' >> ~/.zshrc" >&2
  exit 1
fi

# 3) Respalda (formato custom -Fc: comprimido + restaurable selectivamente)
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${PROJECT_NAME}_${STAMP}.dump"

echo "[$(date '+%F %T')] Respaldando '$PROJECT_NAME' → $OUT"
pg_dump "$SUPABASE_DB_URL" -Fc --no-owner --no-privileges -f "$OUT"

# 4) Sanidad: el dump no debe estar vacío
SIZE="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
if [[ "${SIZE:-0}" -lt 1000 ]]; then
  echo "ERROR: el respaldo salió sospechosamente pequeño (${SIZE} bytes). Revisa la conexión." >&2
  rm -f "$OUT"
  exit 1
fi
echo "[$(date '+%F %T')] OK — $((SIZE/1024)) KB"

# 5) Rotación: conserva solo los últimos $KEEP
ls -1t "$BACKUP_DIR"/"${PROJECT_NAME}"_*.dump 2>/dev/null | tail -n "+$((KEEP+1))" | while read -r old; do
  rm -f "$old"; echo "  rotado (borrado): $(basename "$old")"
done
echo "[$(date '+%F %T')] Respaldos guardados: $(ls -1 "$BACKUP_DIR"/"${PROJECT_NAME}"_*.dump 2>/dev/null | wc -l | tr -d ' ')"

# ─── NOTA IMPORTANTE ─────────────────────────────────────────────────────────
# Esto respalda la BASE DE DATOS (tablas, RLS, funciones), NO los archivos de
# Storage (fotos de progreso, avatares, imágenes, VIDEOS). Esos viven en S3 y se
# respaldan aparte. Para un respaldo robusto de Storage, usar la CLI de Supabase
# o un script que recorra los buckets — lo armamos mañana si lo quieres.
# ─────────────────────────────────────────────────────────────────────────────

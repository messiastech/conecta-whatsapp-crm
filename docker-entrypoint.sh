#!/bin/sh
set -e

echo "============================================================"
echo " 🚀 MEGA CORE / YESHUA DESK IGREJAS — CONTAINER ENTRYPOINT"
echo "============================================================"

# ------------------------------------------------------------
# 1. FASE DE RELEASE / SCHEMA PREPARATION (Separada do Boot Normal)
# ------------------------------------------------------------
# Executada apenas quando invocado com argumento "release" / "release:prod"
# ou quando a flag RELEASE_PHASE=true / RUN_MIGRATIONS=true estiver ativa no orchestrator.
if [ "$1" = "release" ] || [ "$1" = "release:prod" ] || [ "$RELEASE_PHASE" = "true" ] || [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "📦 [RELEASE PHASE] Iniciando preparação de schema e provisionamento..."

  echo "[1/2] Sincronizando schema do banco de dados (sem perda de dados)..."
  # O schema e os dados de produção são estritamente preservados sem perda
  npx prisma db push --skip-generate

  if [ "$NODE_ENV" = "production" ]; then
    echo "[2/2] Executando provisionamento idempotente de produção..."
    if [ -f "dist/infrastructure/database/init-yeshua-production.js" ]; then
      node dist/infrastructure/database/init-yeshua-production.js
    else
      npx tsx src/infrastructure/database/init-yeshua-production.ts
    fi
  fi

  # Se o container foi disparado exclusivamente para a fase de release/deploy command, encerra com sucesso
  if [ "$1" = "release" ] || [ "$1" = "release:prod" ]; then
    echo "✅ [RELEASE PHASE] Release concluído com sucesso."
    exit 0
  fi
fi

# ------------------------------------------------------------
# 2. BOOT NORMAL DO SERVIDOR (Stateless & Seguro)
# ------------------------------------------------------------
# O startup normal NÃO executa alterações destrutivas de schema em cada restart.
echo "🌐 [BOOT] Inicializando servidor HTTP stateless..."
exec "$@"

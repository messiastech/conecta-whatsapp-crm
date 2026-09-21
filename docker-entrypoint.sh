#!/bin/sh
set -e

echo "============================================================"
echo " 🚀 YESHUA CLOUD DEMO — CONTAINER RELEASE ENTRYPOINT"
echo "============================================================"

# 1. Executa o push/sincronização do schema Prisma com o banco PostgreSQL
echo "[1/3] Sincronizando schema do banco de dados (prisma db push)..."
npx prisma db push --skip-generate --accept-data-loss

# 2. Executa o provisionamento idempotente do seed Yeshua Demo antes do boot do servidor HTTP
echo "[2/3] Provisionando tenant e dados Yeshua Demo (seed:yeshua-demo)..."
if [ -f "dist/infrastructure/database/seed-yeshua-demo.js" ]; then
  node dist/infrastructure/database/seed-yeshua-demo.js
else
  npm run seed:yeshua-demo
fi

# 3. Boot do servidor HTTP Express / SaaS
echo "[3/3] Inicializando servidor HTTP..."
exec "$@"

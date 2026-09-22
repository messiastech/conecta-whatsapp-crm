#!/bin/sh
set -e

echo "============================================================"
echo " 🚀 YESHUA DESK IGREJAS — CONTAINER RELEASE ENTRYPOINT"
echo "============================================================"

# 1. Executa o push/sincronização do schema Prisma com o banco PostgreSQL
echo "[1/3] Sincronizando schema do banco de dados (prisma db push)..."
npx prisma db push --skip-generate --accept-data-loss

# 2. Executa o provisionamento idempotente de produção ou demo antes do boot do servidor HTTP
if [ "$NODE_ENV" = "production" ]; then
  echo "[2/3] Ambiente de PRODUÇÃO detectado: executando init:prod..."
  if [ -f "dist/infrastructure/database/init-yeshua-production.js" ]; then
    node dist/infrastructure/database/init-yeshua-production.js
  else
    npm run init:prod
  fi
else
  echo "[2/3] Ambiente DEMO/DEV detectado: executando seed:yeshua-demo..."
  if [ -f "dist/infrastructure/database/seed-yeshua-demo.js" ]; then
    node dist/infrastructure/database/seed-yeshua-demo.js
  else
    npm run seed:yeshua-demo
  fi
fi

# 3. Boot do servidor HTTP Express / SaaS
echo "[3/3] Inicializando servidor HTTP..."
exec "$@"

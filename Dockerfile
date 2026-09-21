# =======================================================
# Multi-stage Dockerfile para Yeshua Cloud Demo
# Garante imagem enxuta, segura e com release automatizado
# =======================================================

# -------------------------------------------------------
# Estágio 1: Builder
# -------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar OpenSSL necessário para o Prisma Client Engine no Alpine
RUN apk add --no-cache openssl libc6-compat

# Copiar manifestos e esquema Prisma
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Instala dependências e gera o Prisma Client
RUN npm ci
RUN npx prisma generate

# Copia código-fonte da aplicação
COPY src ./src

# Compila o backend TypeScript e o frontend React (Vite)
RUN npm run build

# -------------------------------------------------------
# Estágio 2: Runner de Produção
# -------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Dependências de runtime do sistema
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=3000

# Usuário não-root para segurança do container
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copia artefatos compilados e dependências
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/client/dist ./src/client/dist
COPY --from=builder /app/prisma ./prisma

# Copia entrypoint script de release
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Ajusta permissões
RUN chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/presentation/server.js"]

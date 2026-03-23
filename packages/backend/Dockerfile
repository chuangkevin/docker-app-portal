FROM node:22-alpine AS builder
WORKDIR /app
# better-sqlite3 needs native build tools
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install
COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build
# prune dev deps after build
RUN npm prune --production

FROM node:22-alpine AS production
WORKDIR /app
# copy compiled node_modules from builder (includes better-sqlite3 native bindings)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .
EXPOSE 3000
CMD ["node", "dist/index.js"]

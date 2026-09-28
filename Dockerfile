# MoneyOS production image: backend (Fastify) serving the built web app.
FROM node:22-slim

# better-sqlite3 needs a compiler at install time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend + frontend dependencies.
COPY package*.json ./
COPY web/package*.json ./web/
RUN npm install && npm install --prefix web

# Build frontend (web/dist) then backend (dist/).
COPY . .
RUN npm run build --prefix web && npm run build

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_URL=/data/moneyos.db

EXPOSE 8080

# /data is a persistent Fly volume (SQLite lives there).
CMD ["sh", "-c", "npm run db:migrate && node dist/server.js"]

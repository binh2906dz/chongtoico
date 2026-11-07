# Build context: repo root. One image serves the API, realtime (Socket.IO) and the built React app.
FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS server-build
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/drizzle ./drizzle
COPY --from=server-build /srv/dist ./dist
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
ENV HOST=0.0.0.0 \
    PORT=8090 \
    PUBLIC_DIR=/app/frontend/dist \
    UPLOAD_DIR=/data/uploads
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

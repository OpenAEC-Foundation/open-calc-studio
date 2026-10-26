FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
COPY scripts/build-server.mjs scripts/distribution-notices.mjs ./scripts/
COPY LICENSE COPYING NOTICE.md ./
RUN node scripts/build-server.mjs

FROM node:22-bookworm-slim
ARG VERSION=unknown
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Open Calc Studio API" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$REVISION \
      org.opencontainers.image.source="https://github.com/OpenAEC-Foundation/open-calc-studio" \
      org.opencontainers.image.licenses="LGPL-3.0-only"
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/dist-server/ ./
COPY LICENSE COPYING NOTICE.md ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

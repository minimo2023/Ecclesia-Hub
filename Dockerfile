FROM node:20.19.5-bookworm-slim AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

FROM node:20.19.5-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Taipei
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
    && mkdir -p /app/data /app/uploads /app/private-media \
    && chown -R node:node /app/data /app/uploads /app/private-media \
    && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY ["Bible Millionaire Quiz/server", "./Bible Millionaire Quiz/server"]
COPY ["Bible Millionaire Quiz/shared", "./Bible Millionaire Quiz/shared"]
COPY ["Bible Millionaire Quiz/scripts", "./Bible Millionaire Quiz/scripts"]
COPY ["Bible Millionaire Quiz/src/data", "./Bible Millionaire Quiz/src/data"]
COPY ["Bible Millionaire Quiz/dist", "./Bible Millionaire Quiz/dist"]
COPY ["Bible Millionaire Quiz/mobile-app/dist", "./Bible Millionaire Quiz/mobile-app/dist"]
COPY ["Bible Millionaire Quiz/scripture-tools-app/dist", "./Bible Millionaire Quiz/scripture-tools-app/dist"]
COPY ["steward-ops/XIT-Worker", "./steward-ops/XIT-Worker"]
# The server keeps the approved desktop/mobile snapshots as a fallback. The
# freshly verified Vite builds above are the primary clients served in production.

USER node
EXPOSE 3000
CMD ["node", "Bible Millionaire Quiz/server/start.js"]

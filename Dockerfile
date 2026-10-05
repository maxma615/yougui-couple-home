FROM node:24-bookworm-slim AS node-runtime

FROM postgres:18

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

# A shared, unprivileged identity owns only the persistent attachment directory.
RUN groupadd --gid 10001 yougui \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin yougui \
    && mkdir -p /data/attachments \
    && chown 10001:10001 /data/attachments
USER 10001:10001

EXPOSE 3000
# The game child binds only on demand; Caddy routes its Socket.IO path.
EXPOSE 3100

ENTRYPOINT []
CMD ["sh", "-c", "npm run migrate && node_modules/.bin/next start --hostname 0.0.0.0 --port 3000"]

# syntax=docker/dockerfile:1
# Dev / local: Vite with HMR. Use compose bind mount + node_modules volume (see docker-compose.yml).
FROM node:20-alpine

# node:20-alpine ships npm 10; lockfiles produced by npm 11 can fail `npm ci` with
# "Missing: @emnapi/core … from lock file" (optional/bundled deps). Match npm 11+.
RUN npm install -g npm@11.6.2

WORKDIR /app

COPY docker-entrypoint.dev.sh /usr/local/bin/docker-entrypoint.dev.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.dev.sh

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.dev.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

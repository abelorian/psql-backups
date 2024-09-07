FROM node:20-alpine AS build

RUN apk add --update --no-cache nodejs npm

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /root

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm install && \
    npm run build && \
    npm prune --production

FROM node:20-alpine

WORKDIR /root

COPY --from=build /root/node_modules ./node_modules
COPY --from=build /root/dist ./dist

ARG PG_VERSION='16'

RUN apk add --update --no-cache \
    postgresql${PG_VERSION}-client \
    zip \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main

CMD pg_isready --dbname=$BACKUP_DATABASE_URL && \
    pg_dump --version && \
    node dist/index.js
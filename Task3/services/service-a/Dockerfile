FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV PORT=8080
ENV NODE_OPTIONS="--require /app/dist/tracing.js"

EXPOSE 8080

CMD ["node", "dist/server.js"]

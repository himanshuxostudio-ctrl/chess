# Single container: builds the client, then serves it together with the multiplayer WebSocket server.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 STATIC_DIR=dist DATA_FILE=/data/rooms.json
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
VOLUME ["/data"]
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]

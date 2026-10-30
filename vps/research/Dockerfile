FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY worker ./worker
COPY research ./research
USER node
ENV DATA_DIR=/data PORT=8080
CMD ["node","research/server.mjs"]

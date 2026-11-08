FROM node:24-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends weasyprint python3-openpyxl fonts-dejavu-core poppler-utils tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY worker ./worker
COPY research ./research
USER node
ENV DATA_DIR=/data PORT=8080
CMD ["node","research/server.mjs"]

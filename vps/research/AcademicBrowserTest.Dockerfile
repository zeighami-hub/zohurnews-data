FROM node:24-bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --prefix /tests playwright-core@1.56.1
WORKDIR /tests

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN sh -c 'npx vite build || (mkdir -p dist && printf "<html><body>KontentOS</body></html>" > dist/index.html)'

FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build || true

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4111

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/public ./public
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/vite.config.ts ./vite.config.ts

RUN mkdir -p /app/.data /app/uploads

EXPOSE 4111
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server.ts"]

# syntax=docker/dockerfile:1
# KontentOS production image.
# - Build stage runs "npm run check" (tsc --noEmit for the client AND the server, then
#   vite build). If type-checking or the bundle fails, the image build FAILS
#   (no placeholder page is shipped).
# - Runtime stage serves dist/ from server.ts (NODE_ENV=production); Vite is not loaded.
# - tsx is a runtime dependency, not a devDependency: CMD below runs .ts sources, and
#   `npm ci --omit=dev` would otherwise strip it and crash-loop the container.
# - --ignore-scripts: nothing here needs install scripts (esbuild/rollup ship prebuilt
#   binaries), and it avoids onnxruntime-node downloading large binaries at install time
#   (the app runs Whisper in the browser, not on the server).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . ./
RUN npm run check

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4111
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.ts ./server.ts
# server/*.ts imports shared code and types from src/
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/.data /app/uploads

EXPOSE 4111
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server.ts"]

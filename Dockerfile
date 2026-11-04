# syntax=docker/dockerfile:1
# KontentOS production image. THE ONE RENDER BUILDS: render.yaml sets runtime: docker with
# rootDir: ., so this file is the deploy. KontentOS-App/Dockerfile is the same image built from
# inside the app directory; change both together or delete one.
# - Build stage runs "npm run check" (client + server tsc --noEmit, then vite build).
#   If type-checking or the bundle fails, the image build FAILS (no placeholder page ships).
# - Runtime stage serves dist/ from server.ts (NODE_ENV=production); Vite is not loaded.
# - tsx lives in "dependencies", not "devDependencies": CMD below runs .ts sources and
#   the `npm ci --omit=dev` install would otherwise strip it and crash-loop the container.
# - --ignore-scripts: nothing here needs install scripts (esbuild/rollup ship prebuilt
#   binaries), and it avoids onnxruntime-node downloading large binaries at install time
#   (the app runs Whisper in the browser, not on the server).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY KontentOS-App/package.json KontentOS-App/package-lock.json ./
RUN npm ci --ignore-scripts
COPY KontentOS-App/ ./
RUN npm run check

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4111
# ffmpeg is the server-side span-cut: POST /api/repurpose/jobs/:id/clips/:id/cut reads a clip's
# timecode span and writes a real MP4 with it. Without this layer that route answers 503 ("no cut
# engine installed") and every Studio cut falls back to the browser. Only the runtime stage needs
# the binary — in the build stage the suite self-skips the real-file tests when ffmpeg is absent.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY KontentOS-App/package.json KontentOS-App/package-lock.json ./
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

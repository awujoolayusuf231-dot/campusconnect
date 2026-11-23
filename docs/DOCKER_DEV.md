# Local Docker Dev Setup (Alpine)

This guide describes a proposed Docker-based local development setup for CampusConnect to reduce "works on my machine" issues. It runs the **frontend (Vite + React SPA)** in a consistent **Node Alpine Linux** container while using the **already configured Supabase** project.

> Status: proposal/documentation. The Docker files/config below are not committed as active project defaults unless the team decides to adopt them.

## Why

- Consistent Node/Linux runtime across contributors (Alpine-based).
- Faster onboarding: fewer local machine dependency mismatches.
- Same dev command flow for everyone (`docker compose up --build`).

## Scope

- **Included:** frontend dev server in Docker (Vite, Node 22 Alpine).
- **Not included:** local Supabase stack. This guide assumes Supabase is already configured (hosted/project setup).
- **Still required for full feature parity:** Supabase migrations/RLS/RPCs/function deployment, Auth dashboard settings, Firebase push config, LiveKit secrets, etc., depending on the feature being tested.

## Prerequisites

- Docker Desktop / Docker Engine + Docker Compose v2 (`docker compose version`)
- Configured Supabase project credentials:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Any optional feature env vars from `.env.example` (Firebase, etc.)

## 1. Environment file

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

Fill in your configured values. Do not commit `.env.local`.

## 2. Proposed files

### `.dockerignore`

```gitignore
node_modules
dist
.git
.gitignore
.env
.env.*
!.env.example
*.log
*.tsbuildinfo
supabase/.temp
test-results
coverage
.vscode
```

### `Dockerfile.dev`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine

# Helpful for native deps/debugging in Alpine environments
RUN apk add --no-cache libc6-compat git

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source (compose bind-mount is used for live dev)
COPY . .

EXPOSE 5173

# Vite must listen on 0.0.0.0 inside Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
```

### `docker-compose.yml`

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: campusconnect-web
    ports:
      - "5173:5173"
    env_file:
      - .env.local
    environment:
      # Improves file watching reliability on some Docker/filesystem setups
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"
    volumes:
      - .:/app
      - /app/node_modules
    stdin_open: true
    tty: true
```

**Note:** `/app/node_modules` is mounted as an anonymous volume so container-installed Linux/Alpine dependencies are not overwritten by host `node_modules`.

## 3. Vite config tweak (recommended)

To make Docker dev explicit, add server host/port settings in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { host: true, port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
```

The `--host 0.0.0.0` CLI flag in `Dockerfile.dev` also works, but setting it in config makes behavior clearer.

## 4. Run

```bash
# Build and start
docker compose up --build
```

Open `http://localhost:5173`.

Stop with `Ctrl+C`, then:

```bash
docker compose down
```

Rebuild after dependency changes:

```bash
docker compose up --build
```

## 5. Useful commands

```bash
# Open shell in container
docker compose exec web sh

# Typecheck
docker compose exec web npm run typecheck

# Unit tests
docker compose exec web npm test
```

## 6. Caveats and considerations

- **Configured Supabase = remote backend calls.** Ensure Supabase Auth URL configuration includes `http://localhost:5173` / `http://localhost:5173/**` for local dev.
- **Frontend consistency only.** Dockerizing the frontend does not make Supabase/Firebase/LiveKit config identical; those services still need correct env/secrets/migrations.
- **File watching overhead.** Polling env vars improve reliability but can increase CPU usage. Remove them if HMR works well without polling.
- **Secrets hygiene.** Keep `.env.local` out of git and Docker build context exposure; never put service-role/server secrets in `VITE_*` vars.
- **Production image is different.** For a production container, use a multi-stage build (Node Alpine build + static server like Nginx/Caddy). This doc covers dev workflow only.
- **Supabase local option.** If the team later wants fully local backend parity, Supabase CLI local stack can run via Docker, but that is a separate setup with different env/config implications.

## Suggested adoption checklist

- [ ] Team agrees on Node version (proposed: `node:22-alpine`).
- [ ] Add `.dockerignore`, `Dockerfile.dev`, `docker-compose.yml`.
- [ ] Add `server.host/port` to `vite.config.ts`.
- [ ] Document env setup in `README.md` or link this doc.
- [ ] Validate HMR, auth redirects, and core flows on macOS/Windows/Linux.
- [ ] Decide whether to keep polling enabled by default.

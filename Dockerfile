# Taskovia disposable sandbox image for InstaCloud only.
# This image intentionally refuses to start against any Supabase project except canonical Cloud DEV.
FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@10.29.3

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm postinstall && pnpm build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000

WORKDIR /app

COPY --from=build /app/.output ./.output
COPY scripts/assert-cloud-dev-target.mjs ./scripts/assert-cloud-dev-target.mjs
COPY scripts/assert-instacloud-sandbox-env.mjs ./scripts/assert-instacloud-sandbox-env.mjs

EXPOSE 3000

CMD ["sh", "-c", "node scripts/assert-instacloud-sandbox-env.mjs && node .output/server/index.mjs"]

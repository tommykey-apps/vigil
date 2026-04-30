FROM --platform=linux/arm64 node:24-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM --platform=linux/arm64 public.ecr.aws/lambda/nodejs:24-arm64
WORKDIR ${LAMBDA_TASK_ROOT}
# package.json も同梱しないと Node が "type": "module" を解決できず、
# import 文が SyntaxError になる
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./
COPY --from=builder /app/node_modules ./node_modules
CMD ["index.handler"]

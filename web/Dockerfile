FROM --platform=linux/arm64 node:24-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM --platform=linux/arm64 node:24-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/
ENV NODE_ENV=production
CMD ["node", "build"]

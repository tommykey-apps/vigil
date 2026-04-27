#!/usr/bin/env bash
# Idempotently create the `vigil` table on a local DynamoDB instance.
# Used for local dev (pnpm db:init) and CI (E2E setup).
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://127.0.0.1:8000}"
TABLE="${VIGIL_TABLE_NAME:-vigil}"
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_REGION=ap-northeast-1

if aws dynamodb describe-table \
	--table-name "$TABLE" \
	--endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
	echo "table $TABLE already exists; skipping create"
	exit 0
fi

aws dynamodb create-table \
	--table-name "$TABLE" \
	--attribute-definitions \
		AttributeName=pk,AttributeType=S \
		AttributeName=sk,AttributeType=S \
		AttributeName=gsi1pk,AttributeType=S \
		AttributeName=gsi1sk,AttributeType=S \
	--key-schema \
		AttributeName=pk,KeyType=HASH \
		AttributeName=sk,KeyType=RANGE \
	--global-secondary-indexes \
		'IndexName=gsi1,KeySchema=[{AttributeName=gsi1pk,KeyType=HASH},{AttributeName=gsi1sk,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
	--billing-mode PAY_PER_REQUEST \
	--endpoint-url "$ENDPOINT" >/dev/null

# DynamoDB Local does not actually expire items, but we still set TTL spec for parity.
# Some older versions return 400 here, hence `|| true`.
aws dynamodb update-time-to-live \
	--table-name "$TABLE" \
	--time-to-live-specification 'Enabled=true,AttributeName=ttl' \
	--endpoint-url "$ENDPOINT" >/dev/null 2>&1 || true

echo "table $TABLE created"

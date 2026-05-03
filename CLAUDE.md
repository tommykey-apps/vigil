# vigil

Indie hacker 向けのドメイン + AWS 運用監視ダッシュボード。Phase 1 = 所有ドメインの WHOIS / SSL / DNS 期限を 1 日 1 回 polling、SES でアラート通知。Phase 2 = AWS account 連携によるコスト監視。

## プロジェクト構成

```
vigil/
├── scanner/      # Lambda container (Node.js 24): EventBridge Scheduler 1 日 1 回実行
├── web/          # SvelteKit 2 (Lambda Web Adapter + Function URL + CloudFront OAC) ※ deploy は #21 で有効化予定
├── infra/        # Terraform (AWS provider v6)
├── scripts/      # 開発用スクリプト (init-dynamodb-local.sh)
├── docs/         # ドキュメント (db/ + 将来 design/ adr/ swagger.yaml 追加予定)
└── .github/      # CI/CD
```

## 開発環境

**flox を使う。** `flox activate` で Node.js / pnpm / Terraform / awscli / gh / jq が使える。
DynamoDB Local は `make db` で起動 + テーブル作成。

## パッケージマネージャ

pnpm (npm は使わない)、scanner / web 別 workspace。

## コマンド

### Scanner / Web
```bash
cd scanner && pnpm install && pnpm test
cd web && pnpm install && pnpm dev
```

### DB
```bash
make db          # DynamoDB Local 起動 + vigil テーブル作成 (GSI + TTL 込み)
make db-docs     # tbls で docs/db/schema/ を再生成
make db-docs-diff
```

### Infra
```bash
cd infra && terraform init && terraform plan
```

## DB スキーマドキュメント

`docs/db/` に DynamoDB スキーマドキュメント。`make db-docs` で再生成。
詳細: [docs/db/entities.md](docs/db/entities.md), [docs/db/access-patterns.md](docs/db/access-patterns.md)

GitHub Pages: https://tommykey-apps.github.io/vigil/db/

## デプロイルール

- Lambda / S3 / CloudFront 等のデプロイは **必ず GitHub Actions CD パイプライン経由**
- ローカルから `terraform apply` / `aws lambda update-function-code` を実行しない
- Pages workflow は `docs/**` 変更時に自動発火 (Jekyll ビルド + デプロイ)

## AWS リージョン

ap-northeast-1 (東京)

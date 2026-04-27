# vigil

Indie hacker 向けのドメイン + AWS 運用監視ダッシュボード。所有ドメインの WHOIS / SSL / DNS 期限を 1 日 1 回 polling し、期限近接や異常変更を SES でメール通知する。Phase 2 で AWS account 連携によるコスト予測 / 異常スパイク検知に拡張予定。

🌐 https://vigil.tommykeyapp.com/ (未デプロイ)

## ステータス

開発中 (Phase 1 = ドメイン監視)。詳細は [open issues](https://github.com/tommykey-apps/vigil/issues) と `docs/` を参照。

## 予定スタック

| | |
|---|---|
| フロント / バック | SvelteKit 2 (Svelte 5 runes) |
| デプロイ | Lambda container image + Lambda Web Adapter + Function URL + CloudFront OAC |
| Lambda runtime | Node.js 24 / arm64 |
| DB | DynamoDB single-table (on-demand) |
| 認証 | GitHub OAuth + DynamoDB session |
| 監視 cron | EventBridge Scheduler (1 日 1 回) |
| メール | SES (Easy DKIM + SPF + DMARC) |
| IaC | Terraform (AWS provider v6 + S3 native lock) |
| CI/CD | GitHub Actions (OIDC) |
| ローカル開発 | flox |
| Observability | Lambda Powertools (TypeScript) |

## ドキュメント階層

| 層 | ファイル |
|---|---|
| プロジェクト概要 | この README |
| 構成図 | `docs/architecture.{drawio,png}` |
| API 基本設計 | `docs/swagger.yaml` (→ GitHub Pages) |
| 詳細設計 | `docs/design/*.md` |
| 設計判断 (ADR) | `docs/adr/*.md` |

## Phase

- **Phase 1 — ドメイン監視**: WHOIS (RDAP) / SSL / DNS の取得 + 期限近接アラート + ドメイン所有確認 (DNS TXT)
- **Phase 2 — AWS コスト監視**: cross-account IAM role 連携 + Cost Explorer 月末予測 + Cost Anomaly Detection

## ローカル開発セットアップ

### 1. GitHub OAuth App を作成

GitHub Settings → Developer settings → **OAuth Apps** → **New OAuth App**。dev / prod でそれぞれ別の App を作る。

| | dev | prod |
|---|---|---|
| Application name | `vigil (dev)` | `vigil` |
| Homepage URL | `http://localhost:5173` | `https://vigil.tommykeyapp.com` |
| Authorization callback URL | `http://localhost:5173/auth/callback` | `https://vigil.tommykeyapp.com/auth/callback` |

App 作成後、**Client secret** を発行してメモする。**callback URL は env 値と末尾スラッシュ含め完全一致** が必要 (GitHub の検証で違うと弾かれる)。

scope は authorize URL 側で `read:user user:email` を指定するため App 側設定不要。

### 2. `web/.env` を作成

`web/.env.example` をコピーして値を埋める:

```sh
cp web/.env.example web/.env
# 編集して GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET を入れる
```

| Name | 用途 |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | dev OAuth App の Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | dev OAuth App の Client secret |
| `OAUTH_CALLBACK_URL` | `http://localhost:5173/auth/callback` (dev 固定) |

prod 側は Issue #22 で SSM Parameter Store + Secrets Manager (Lambda Parameters and Secrets Extension) 経由に配線する。

### 3. DynamoDB Local 起動 + 開発サーバ

```sh
flox activate           # node / pnpm / terraform / awscli2 / docker は host
pnpm -C web db:up       # DynamoDB Local (port 8000)
pnpm -C web db:init     # vigil テーブル作成 (冪等)
pnpm -C web dev         # http://localhost:5173
```

ブラウザで `http://localhost:5173/` を開くと未認証なら `/auth/github` 経由で GitHub OAuth フローに入る。

### 4. テスト

```sh
pnpm -C web check                           # svelte-check
AWS_ENDPOINT_URL=http://127.0.0.1:8000 \
  AWS_REGION=ap-northeast-1 \
  AWS_ACCESS_KEY_ID=test \
  AWS_SECRET_ACCESS_KEY=test \
  pnpm -C web test                          # vitest (DynamoDB Local 起動済み前提)
pnpm -C scanner typecheck                   # scanner Lambda
```

`AWS_ENDPOINT_URL` を外すと DynamoDB Local 依存テストは skip される。

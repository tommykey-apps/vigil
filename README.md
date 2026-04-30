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

## CI/CD (GitHub Actions OIDC)

本リポは **GitHub Actions OIDC** で AWS にデプロイする (IAM Access Key は使わない)。
PR 時は `terraform plan` を PR にコメント、main push 時は paths-filter で
`web` / `scanner` / `infra` に分けて並列デプロイ。

### 初回 bootstrap (1 回だけ手動)

`infra/oidc.tf` で OIDC provider + role を Terraform 管理にしているが、
Terraform 自身を CI 経由で apply するために卵鶏問題がある。最初の 1 回だけ
手動で provider と role を作成し、`terraform import` で管理に取り込む。

```sh
ACCT=$(aws sts get-caller-identity --query Account --output text)

# 1. OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com

# 2. deploy role (main push 用、PoC で AdministratorAccess 強権限)
cat > /tmp/trust-deploy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::${ACCT}:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:tommykey-apps/vigil:ref:refs/heads/main"
      }
    }
  }]
}
EOF
aws iam create-role --role-name vigil-github-actions-deploy \
  --assume-role-policy-document file:///tmp/trust-deploy.json
aws iam put-role-policy --role-name vigil-github-actions-deploy \
  --policy-name vigil-deploy-admin \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}'

# 3. PR role (read-only + S3 backend RW)
cat > /tmp/trust-pr.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::${ACCT}:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      "StringLike":   {"token.actions.githubusercontent.com:sub": "repo:tommykey-apps/vigil:pull_request"}
    }
  }]
}
EOF
aws iam create-role --role-name vigil-github-actions-pr \
  --assume-role-policy-document file:///tmp/trust-pr.json
aws iam attach-role-policy --role-name vigil-github-actions-pr \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam put-role-policy --role-name vigil-github-actions-pr \
  --policy-name vigil-pr-tfstate \
  --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],"Resource":["arn:aws:s3:::tommykeyapp-tfstate","arn:aws:s3:::tommykeyapp-tfstate/vigil/*"]}]}
EOF
)"

# 4. GitHub Secrets に登録
gh secret set AWS_DEPLOY_ROLE_ARN -b "arn:aws:iam::${ACCT}:role/vigil-github-actions-deploy"
gh secret set AWS_PR_ROLE_ARN     -b "arn:aws:iam::${ACCT}:role/vigil-github-actions-pr"
# prod GitHub OAuth App は #25 で作成、その時点で値が決まる
gh secret set GH_OAUTH_CLIENT_ID     -b "(prod OAuth App ID、#25 で設定)"
gh secret set GH_OAUTH_CLIENT_SECRET -b "(prod OAuth App secret、#25 で設定)"
```

### PR-A merge 後に Terraform 管理へ移行

`oidc.tf` が apply されると既存リソースと衝突するので、merge 直後に手動で import:

```sh
cd infra
ACCT=$(aws sts get-caller-identity --query Account --output text)
flox activate -- terraform import aws_iam_openid_connect_provider.github \
  arn:aws:iam::${ACCT}:oidc-provider/token.actions.githubusercontent.com
flox activate -- terraform import aws_iam_role.github_actions_deploy vigil-github-actions-deploy
flox activate -- terraform import aws_iam_role.github_actions_pr     vigil-github-actions-pr
flox activate -- terraform plan   # diff が小さいことを確認 (assume_role_policy / attached policies 等)
flox activate -- terraform apply  # 残り attached policy 等を反映
```

### Workflows 構成

| File | Trigger | Jobs |
|---|---|---|
| `.github/workflows/ci.yaml` | PR / merge_group | `detect` → `test-scanner` / `test-web` / `tf-plan` (paths-filter で条件分岐) |
| `.github/workflows/cd.yaml` | main push / `workflow_dispatch` | `detect` → `deploy-infra` → `deploy-scanner` / `deploy-web` (reusable) → `invalidate-cf` |
| `.github/workflows/_deploy-image.yaml` | `workflow_call` | image build → ECR push → `lambda update-function-code` → `lambda wait function-updated` |

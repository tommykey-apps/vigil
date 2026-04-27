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

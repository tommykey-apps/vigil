# hookwatch

Webhook inspector — 一意の受信 URL を払い出し、届いた HTTP リクエストをリアルタイムに可視化するサービス。開発時に外部 SaaS の webhook をデバッグするための道具。

🌐 https://hookwatch.tommykeyapp.com/ (未デプロイ)

## 予定スタック

| | |
|---|---|
| バックエンド | **Elixir + Phoenix** (LiveView でリアルタイム配信) |
| フロント | Phoenix LiveView (Svelte 等は使わない予定) |
| DB | DynamoDB (request 履歴、TTL で自動削除) |
| コンピュート | 未定 — Lambda Container (BEAM VM) or ECS Fargate |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| 配信 | CloudFront (静的 + API) |

## 機能予定

- ランダムな URL (`/h/{id}`) を払い出し
- その URL に来た **任意の HTTP request** を記録 (method / headers / body / timestamp / source IP)
- 管理画面で受信 request を時系列表示
- 新着は **SSE / WebSocket でリアルタイム push**
- 履歴は期限付き (7 日) で自動削除

## 開発ステータス

[open issues](https://github.com/tommykey-apps/hookwatch/issues) を参照。

# DynamoDB Schema Documentation

このディレクトリは vigil の DynamoDB シングルテーブル設計のドキュメント。

| File | Owner | When updated |
|---|---|---|
| [`entities.md`](entities.md) | manual | 新エンティティ追加 / SK フォーマット変更時 |
| [`access-patterns.md`](access-patterns.md) | manual | 新クエリパターン追加時 |
| [`schema/`](schema/) | tbls (auto) | `make db-docs` で再生成 |

## ドキュメント生成

```bash
make db-docs        # DynamoDB Local 起動 + テーブル作成 + tbls 実行
make db-docs-diff   # 現状の docs と live スキーマの差分表示
```

**`tbls doc` を素手で打たないこと。** `AWS_ENDPOINT_URL` を設定し忘れると本番 AWS DynamoDB
に誤接続する。本番テーブル名と Local が同じ `vigil` なので誤接続が成功する可能性がある。
必ず `make db-docs` 経由で実行する。

## 更新ポリシー

`schema/` を再生成すべきタイミング:
- `infra/dynamodb.tf` の変更 (テーブル名 / KeySchema / GSI / TTL)
- `scanner/src/*-repo.ts` / `web/src/lib/server/*-repo.ts` の変更 (新しい SK prefix や PK パターン)
- `scanner/src/ddb.ts` / `web/src/lib/server/ddb.ts` の変更

同じ PR で `entities.md` と `access-patterns.md` も手動更新すること。

## CI による drift 検出の限界

`.github/workflows/db-docs.yaml` は `tbls diff` でスキーマ drift を検出するが、
**手書きドキュメント (`entities.md` / `access-patterns.md`) の更新漏れは検出できない**。
CI が緑でも手書きドキュメントが古い可能性があるため、code review で確認する。

CI が捕捉できる範囲:
- PK/SK/GSI の型変更
- テーブル追加 / 削除 / 名前変更
- `.tbls.yml` の comment 更新が `schema/` に反映されてない

## tbls の DynamoDB 出力の制約

tbls の DynamoDB driver は `DescribeTable` API しか呼ばないため、`AttributeDefinitions`
で宣言された属性 (このテーブルでは `pk` / `sk` / `gsi1pk` / `gsi1sk`) しかカラム化されない。
`display_name` / `verify_token` / `expires_at` / `ttl` 等の実アイテム属性は出力されない。
実アイテムの属性は `entities.md` を参照。

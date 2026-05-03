# Access Patterns

vigil は 7 エンティティ × **11 アクセスパターン**。Session 認証 / Domain CRUD / Scanner の
3 系統に分かれる。

## 一覧

| # | Use case | Caller | PK | SK | Operation | Source |
|---|---|---|---|---|---|---|
| 1 | セッション作成 | OAuth callback | `SESSION#{id}` | `META` (eq) | PutCommand | [session.ts:14](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L14) |
| 2 | セッション検証 + ユーザー取得 | hooks.server.ts | `SESSION#{id}` → `USER#{u}` | `META` → `PROFILE` | GetCommand × 2 | [session.ts:26](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L26) |
| 3 | セッション削除 (logout) | logout endpoint | `SESSION#{id}` | `META` (eq) | DeleteCommand | [session.ts (deleteSession)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts) |
| 4 | ユーザープロフィール upsert | OAuth callback | `USER#{u}` | `PROFILE` (eq) | PutCommand | [session.ts (upsertUserProfile)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts) |
| 5 | ドメイン一覧取得 | dashboard | `USER#{u}` | `begins_with(DOMAIN#)` + post-filter | QueryCommand | [domain-repo.ts (listDomains)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts) |
| 6 | ドメイン新規作成 | new domain form | `USER#{u}` | `DOMAIN#{host}` (eq) | PutCommand + ConditionExpression `attribute_not_exists` | [domain-repo.ts:24](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L24) |
| 7 | DNS TXT 認証完了 | verify endpoint | `USER#{u}` | `DOMAIN#{host}` (eq) | UpdateCommand (verify_token / verify_token_expires_at REMOVE、verified_at SET) | [domain-repo.ts (markVerified)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts) |
| 8 | ドメイン削除 | delete endpoint | `USER#{u}` | `DOMAIN#{host}` (eq) | DeleteCommand | [domain-repo.ts (deleteDomain)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts) |
| 9a | WHOIS スキャン保存 | scanner Lambda | `USER#{u}` | `DOMAIN#{host}#WHOIS` (eq、上書き) | PutCommand | [whois-repo.ts:11](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/whois-repo.ts#L11) |
| 9b | SSL スキャン保存 | scanner Lambda | `USER#{u}` | `DOMAIN#{host}#SSL` (eq) | PutCommand | [ssl-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/ssl-repo.ts) |
| 9c | DNS スキャン保存 | scanner Lambda | `USER#{u}` | `DOMAIN#{host}#DNS` (eq) | PutCommand | [dns-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/dns-repo.ts) |
| 10 | スキャン結果取得 (アラート判定) | scanner Lambda | `USER#{u}` | `DOMAIN#{host}#WHOIS\|SSL\|DNS` (eq) | GetCommand | [whois-repo.ts:18](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/whois-repo.ts#L18) ほか |
| 11a | アラート状態取得 (重複送信判定) | alert.ts | `USER#{u}` | `DOMAIN#{host}#ALERT#{kind}` (eq) | GetCommand | [alert-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert-repo.ts) |
| 11b | アラート状態保存 | alert.ts (送信後) | `USER#{u}` | `DOMAIN#{host}#ALERT#{kind}` (eq) | PutCommand | [alert-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert-repo.ts) |

`scanner/src/ddb.ts` と `web/src/lib/server/ddb.ts` で 5 種類の操作 helper を提供:
`getItem` / `putItem` / `queryItems` / `updateItem` / `deleteItem`

## ScanIndexForward / GSI 利用

GSI 1 (`gsi1pk` / `gsi1sk`) は **現在 Phase 1 では未使用**。Phase 2 (AWS コスト監視) で
cross-user 集計クエリに使う予定。Phase 1 のクエリは全て base table の PK + SK で完結。

## Anti-patterns / Known concerns

### A1. listDomains の post-filter (sub-rows 混入)
[domain-repo.ts (listDomains)](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts) は
`begins_with(DOMAIN#)` で query するが、SK は次の3パターンが混在する:
- `DOMAIN#{hostname}` (parent、目的のもの)
- `DOMAIN#{hostname}#WHOIS|SSL|DNS` (scanner sub-rows)
- `DOMAIN#{hostname}#ALERT#{kind}` (alert sub-rows)

**post-filter** で SK の `#` 数を見て parent 行 (= `#` が 1 個) のみを返す。
DynamoDB は filter 後の RCU を消費するので、ヘビーユーザーで sub-rows が多いと無駄が出る。

- 改善案: SK 設計を `DOMAIN#{hostname}` ではなく `DOMAIN#PARENT#{hostname}` のように prefix を変える
  (sub-rows は `DOMAIN#SUB#{hostname}#WHOIS` など) → query で parent のみ取れる
- 現状: 1 user あたり Domain 数が少ない (個人 indie hacker) ので問題顕在化していない

### A2. ddb.ts の重複 (scanner / web で同一ファイル)
`scanner/src/ddb.ts` と `web/src/lib/server/ddb.ts` が **同じ実装**。Lambda
container image を別々にビルドする都合で別ファイルにしているが、内容が drift する
リスクあり。

- 改善案: モノレポ化して `packages/db/` に切り出す (pnpm workspace)
- 現状: PR 時に diff を目視で揃える運用

### A3. Scanner の上書き保存
Domain WHOIS / SSL / DNS は **毎日上書き** (履歴を残さない)。
過去の状態 (例: 30 日前の SSL 期限) が分からないので、長期トレンドが追えない。

- 改善案: SK に timestamp 含めて履歴保存、cleanup TTL (90 日 etc) で古いものは削除
- 現状: アラート判定 (期限近接) には現在値だけ必要なので問題なし

### A4. createDomain の ConditionExpression で重複防止
[domain-repo.ts:32](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L32) で
`ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'` で同 user
が同 hostname を二重登録するのを防ぐ。`ConditionalCheckFailedException` を `DomainExistsError`
にラップして 409 でレスポンス。これは正しい使い方。

### A5. Alert idempotency の判定タイミング
[alert.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert.ts) で
「同 kind を 1 日以内に送ってない場合のみ送る」判定。
GetCommand → 判定 → PutCommand のレースで重複送信される可能性 (理論上)。

- 改善案: ConditionExpression で `last_sent_at < :threshold` を保証
- 現状: scanner Lambda は EventBridge Scheduler で 1 日 1 回直列実行なのでレース未顕在化

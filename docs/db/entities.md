# Entities

DynamoDB シングルテーブル `vigil` には 7 種類の論理エンティティが PK/SK prefix で
区別されて格納される。User-scoped data (Profile / Domain / Domain sub-rows) は
PK=`USER#{userId}` でユーザー分離、Session は PK=`SESSION#{sessionId}` で TTL 自動削除。

## 一覧

| Entity | PK pattern | SK pattern | Source |
|---|---|---|---|
| User Profile | `USER#{userId}` | `PROFILE` | [session.ts](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts) |
| Session | `SESSION#{sessionId}` | `META` (TTL あり) | [session.ts](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts) |
| Domain | `USER#{userId}` | `DOMAIN#{hostname}` | [domain-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts) |
| Domain WHOIS | `USER#{userId}` | `DOMAIN#{hostname}#WHOIS` | [whois-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/whois-repo.ts) |
| Domain SSL | `USER#{userId}` | `DOMAIN#{hostname}#SSL` | [ssl-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/ssl-repo.ts) |
| Domain DNS | `USER#{userId}` | `DOMAIN#{hostname}#DNS` | [dns-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/dns-repo.ts) |
| Domain Alert | `USER#{userId}` | `DOMAIN#{hostname}#ALERT#{kind}` | [alert-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert-repo.ts) |

GSI 1 (`gsi1pk` / `gsi1sk`) は **Phase 2** 用に予約 (現在未使用)。

---

## User Profile

GitHub OAuth 後のユーザープロフィール。各ユーザー 1 アイテム。

- **PK**: `USER#{userId}` (= GitHub user id を文字列化)
- **SK**: `PROFILE`

| Field | Type | Source |
|---|---|---|
| `login` | str (GitHub login) | [session.ts:38](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L38) |
| `email` | str \| null | [session.ts:39](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L39) |

---

## Session

GitHub OAuth ログイン後のセッション。TTL = 14 日。

- **PK**: `SESSION#{sessionId}` (`newOpaqueId()` で生成)
- **SK**: `META`
- **TTL**: `ttl` 属性 (Unix timestamp、14 日後)

| Field | Type | Source |
|---|---|---|
| `user_id` | str | [session.ts:18](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L18) |
| `created_at` | int (Unix sec) | [session.ts:19](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L19) |
| `ttl` | int (Unix sec) | [session.ts:20](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L20) |

`getSessionUser` ([session.ts:26](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/session.ts#L26)) で TTL 過ぎてたら null 返却 (DynamoDB の TTL 削除は eventual なため Application 側でも判定)。

---

## Domain

監視対象ドメイン (parent row)。`createDomain` で作成、DNS TXT 認証成功時に
`verify_token` / `verify_token_expires_at` を削除して `verified_at` を設定。

- **PK**: `USER#{userId}`
- **SK**: `DOMAIN#{hostname}`

| Field | Type | Source |
|---|---|---|
| `hostname` | str | [domain-repo.ts:7](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L7) |
| `created_at` | int (Unix sec) | [domain-repo.ts:8](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L8) |
| `verify_token` | str (オプション) | [domain-repo.ts:9](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L9) |
| `verify_token_expires_at` | int (オプション、TTL=1h) | [domain-repo.ts:10](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L10) |
| `verified_at` | int (Unix sec、認証成功後) | [domain-repo.ts:11](https://github.com/tommykey-apps/vigil/blob/main/web/src/lib/server/domain-repo.ts#L11) |

---

## Domain WHOIS / SSL / DNS

各 Domain の最新スキャン結果。EventBridge Scheduler が 1 日 1 回 scanner Lambda を実行して上書き。

| Entity | SK | Source |
|---|---|---|
| WHOIS | `DOMAIN#{hostname}#WHOIS` | [whois-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/whois-repo.ts) (RDAP) |
| SSL | `DOMAIN#{hostname}#SSL` | [ssl-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/ssl-repo.ts) (TLS cert) |
| DNS | `DOMAIN#{hostname}#DNS` | [dns-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/dns-repo.ts) (DoH) |

**共通フィールド**:
- `updated_at` (int, Unix sec) — スキャン完了時刻
- `error` (str, optional) — スキャン失敗時のエラー

**WHOIS 固有** (`WhoisFacts` from [rdap.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/rdap.ts)):
- `expiration_date` / `registrar` / `dnssec` 等

**SSL 固有** (`TlsFacts` from [tls.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/tls.ts)):
- `not_after` / `issuer` / `authorized` 等

**DNS 固有** (`DnsFacts` from [doh.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/doh.ts)):
- `ad_flag` (DNSSEC) / `nameservers` / `mx` / `caa` 等

---

## Domain Alert

各 Domain × 各アラート種別の状態管理 (重複送信防止)。

- **PK**: `USER#{userId}`
- **SK**: `DOMAIN#{hostname}#ALERT#{kind}` (kind 例: `WHOIS_EXPIRY_30D`, `SSL_EXPIRY_14D`)

| Field | Type | Source |
|---|---|---|
| `last_sent_at` | int (Unix sec、SES 送信した時刻) | [alert-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert-repo.ts) |
| `state` | str (`SENT` / `RESOLVED` 等) | [alert-repo.ts](https://github.com/tommykey-apps/vigil/blob/main/scanner/src/alert-repo.ts) |

`alert.ts` で「同じ kind を 1 日以内に送ってない場合のみ送る」判定に使う (idempotency)。

## 設計意図

- **ユーザー分離**: 監視データは `USER#{userId}` PK でテナント境界
- **Domain と sub-rows の親子関係**: `DOMAIN#{hostname}` を parent、`DOMAIN#{hostname}#WHOIS|SSL|DNS|ALERT#kind` を sub-row として `begins_with(DOMAIN#{hostname})` で関連 query 可能
- **listDomains フィルタ**: `begins_with(DOMAIN#)` で query すると sub-rows も混ざるため、`access-patterns.md` の A1 で SK の `#` 数を見て parent 行のみフィルタ
- **TTL**: Session のみ active (14 日)。Domain sub-rows は scanner が 1 日 1 回上書き、Alert は手動 resolve 想定
- **GSI 1**: Phase 2 で AWS コスト監視機能を追加する時 (cross-user 集計クエリ用) に使う予定。現在は schema 定義のみで未使用

# vigil

## Description

Single-table design with GSI 1. 7 logical entities (User Profile / Session / Domain /  
Domain WHOIS / SSL / DNS / Alert) are stored under different PK/SK prefixes.  
TTL on `ttl` attribute (Unix timestamp) for session expiry. GSI 1 (gsi1pk/gsi1sk) is  
reserved for Phase 2 features (cross-user queries). See ../entities.md and  
../access-patterns.md for full attribute definitions.  


## Attributes

| Name   | Type | Default | Nullable | Children | Parents | Comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ---- | ------- | -------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pk     | S    |         | false    |          |         | Partition key. Prefix determines the entity scope:<br />  USER#{userId}        User-scoped data (Profile / Domain / Domain sub-rows)<br />  SESSION#{sessionId}  Session metadata (TTL deletion)<br />                                                                                                                                                                                                                                                                                                                                                         |
| sk     | S    |         | false    |          |         | Sort key. Prefix determines the entity type:<br />  PROFILE                                User profile (single per user)<br />  META                                   Session metadata<br />  DOMAIN#{hostname}                      Domain (parent row)<br />  DOMAIN#{hostname}#WHOIS                WHOIS scan result<br />  DOMAIN#{hostname}#SSL                  SSL/TLS certificate scan result<br />  DOMAIN#{hostname}#DNS                  DNS scan result<br />  DOMAIN#{hostname}#ALERT#{kind}         Alert state (e.g. WHOIS_EXPIRY_30D)<br /> |
| gsi1pk | S    |         | false    |          |         | GSI 1 partition key. Reserved for Phase 2 features (e.g. cost monitoring queries).<br />                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| gsi1sk | S    |         | false    |          |         | GSI 1 sort key. Reserved for Phase 2 features.<br />                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Primary Key

| Name        | Type                       | Definition                                                                           |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Primary Key | Partition key and sort key | [{ AttributeName: "pk", KeyType: "HASH" } { AttributeName: "sk", KeyType: "RANGE" }] |

## Secondary Indexes

| Name | Definition                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| gsi1 | GlobalSecondaryIndex { [{ AttributeName: "gsi1pk", KeyType: "HASH" } { AttributeName: "gsi1sk", KeyType: "RANGE" }], { ProjectionType: "ALL" } } |

## Relations

![er](vigil.svg)

---

> Generated by [tbls](https://github.com/k1LoW/tbls)

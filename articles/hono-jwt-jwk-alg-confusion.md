---
title: "Hono の JWT/JWK ミドルウェアで見つかった alg 混同攻撃への対応を解説する"
emoji: "🔐"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["hono", "jwt", "security", "jwk", "セキュリティ"]
published: false
---

# はじめに

こんにちは。calloc134 です。

今回は、自分が調査・修正検討に携わった Hono の JWT/JWK ミドルウェアのセキュリティ問題について書いていきます。

2026 年 1 月に公開されたセキュリティアドバイザリ GHSA-f67f-6cw9-8mq4 (JWT ミドルウェア) および GHSA-3vhc-576x-3qv4 (JWK ミドルウェア) がその対象です。どちらも「アルゴリズム混同攻撃 (Algorithm Confusion Attack)」に起因するもので、CVSS スコアはともに 8.2 (High) と評価されています。

修正内容を追う形で、JWT/JWK の仕様から攻撃の仕組み、そして「自分で実装するときに何を考えるべきか」まで書いていきます。

:::message
現時点の最新バージョンでは両脆弱性とも修正済みです。影響を受けるバージョンをお使いの場合は速やかにアップデートしてください。
:::

# 脆弱性の概要

2 件の脆弱性は、どちらも同じ根本原因を持ちます。**攻撃者が JWT ヘッダの `alg` フィールドを操作することで、署名検証アルゴリズムを意図せず切り替えさせられる**というものです。

## GHSA-f67f-6cw9-8mq4: JWT ミドルウェア

`hono/jwt` ミドルウェアにおいて、`alg` オプションが省略された場合に `HS256` にデフォルトフォールバックされる実装になっていました。

非対称鍵 (RS256 など) を使うつもりで公開鍵を公開しているにもかかわらず `alg` を指定しない場合、攻撃者はその公開鍵を HS256 の HMAC シークレットとして流用し、偽造 JWT をサーバに受け入れさせられます。

## GHSA-3vhc-576x-3qv4: JWK ミドルウェア

`hono/jwk` ミドルウェアにおいて、取得した JWK に `alg` フィールドが存在しない場合、JWT ヘッダの `alg` をそのまま検証アルゴリズムとして採用していました。

JWK の `alg` フィールドは RFC 上オプショナルであり、実運用の JWKS で省略されているケースも多いため、影響範囲が広い問題です。

# JWT/JWK の基本知識

## JWT の構造

JWT (JSON Web Token) は 3 パートをドットで区切った文字列です。

```
Base64URL(Header).Base64URL(Payload).Base64URL(Signature)
```

ヘッダ部は JOSE (JSON Object Signing and Encryption) ヘッダと呼ばれます。

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-1"
}
```

`alg` フィールドは署名に使ったアルゴリズムを示します。代表的なものを以下に示します。

| アルゴリズム | 種別 | 概要 |
| --- | --- | --- |
| HS256 / HS384 / HS512 | 対称鍵 | HMAC-SHA。秘密鍵と検証鍵が同一 |
| RS256 / RS384 / RS512 | 非対称鍵 | RSASSA-PKCS1-v1_5 + SHA |
| PS256 / PS384 / PS512 | 非対称鍵 | RSASSA-PSS + SHA |
| ES256 / ES384 / ES512 | 非対称鍵 | ECDSA + SHA |
| EdDSA | 非対称鍵 | Ed25519 |

## `alg` ヘッダを信用してはいけない

RFC 7515 (JWS) には次のように記されています。

> Producers and consumers need to agree on what algorithms are permitted to be used.

検証側は事前に「このシステムで許可するアルゴリズム」を決め、JWT ヘッダの `alg` がその範囲内かを確認した上で使用する必要があります。JWT ヘッダは攻撃者が書き換え可能な外部入力であり、その値をそのまま信用してアルゴリズムを決定することは正しい実装ではありません。

## アルゴリズム混同攻撃とは

アルゴリズム混同攻撃とは、対称鍵アルゴリズム (HS256) と非対称鍵アルゴリズム (RS256) の「鍵」の役割の違いを悪用した攻撃です。

- **RS256** では、署名には **秘密鍵**、検証には **公開鍵** を使います
- **HS256** では、署名にも検証にも **同じシークレット** を使います

攻撃者は、公開されている RSA 公開鍵を「HS256 のシークレット」として使うことで、有効な HS256 署名を生成できます。検証側が `alg` を無条件に信用すれば、この偽造 JWT は通ってしまいます。

```mermaid
sequenceDiagram
    autonumber
    actor Attacker as 攻撃者
    participant JWKS as JWKSエンドポイント (公開)
    participant Server as Hono サーバ (脆弱)

    Attacker->>JWKS: RSA公開鍵を取得
    Note over Attacker: 公開鍵のバイト列を<br/>HS256のシークレットとして使い<br/>alg:HS256 の偽造JWTを生成
    Attacker->>Server: 偽造JWTを送信
    Note over Server: JWTヘッダのalg=HS256を信用<br/>公開鍵でHMAC検証 → 一致
    Server-->>Attacker: 検証成功 → 認証バイパス
```

RSA 公開鍵は文字通り「公開」情報です。攻撃者が必要なものはその公開鍵だけで、特別な権限や知識は不要です。

## JWK の構造と `alg` フィールド

JWK (JSON Web Key) は公開鍵を JSON で表現するための仕様 (RFC 7517) です。

```json
{
  "kty": "RSA",
  "use": "sig",
  "kid": "key-id-1",
  "alg": "RS256",
  "n": "...",
  "e": "AQAB"
}
```

各フィールドの意味は次の通りです。

| フィールド | 必須/任意 | 説明 |
| --- | --- | --- |
| `kty` | 必須 | 鍵の種類 (RSA, EC, OKP, oct) |
| `use` | 任意 | 用途 (sig: 署名, enc: 暗号化) |
| `key_ops` | 任意 | 操作 (sign, verify など) |
| `kid` | 任意 | 鍵の識別子 |
| `alg` | 任意 | 使用アルゴリズム |

ここで重要なのが、**`alg` フィールドが任意 (OPTIONAL) である**ことです。RFC 7517 には次のように記されています。

> Use of this member is OPTIONAL.

実際、Auth0 や Microsoft Entra ID などの JWKS エンドポイントでも、`alg` が含まれないキーが存在します。「JWK に `alg` がなければ JWT ヘッダの `alg` を使う」という実装は、攻撃者に検証アルゴリズムを選ばせる隙を生みます。

## `kty` フィールドによるアルゴリズム推測

`alg` がない場合でも、`kty` フィールドや鍵パラメータからアルゴリズムファミリーをある程度推測できます。

| `kty` | 対応アルゴリズム |
| --- | --- |
| `RSA` | RS256, RS384, RS512, PS256, PS384, PS512 |
| `EC` | ES256, ES384, ES512 |
| `OKP` | EdDSA |
| `oct` | HS256, HS384, HS512 |

ただし、`kty: RSA` の場合でも RS256 なのか PS256 なのかまでは確定できません。あくまでファミリーの確認に留まります。また、`kty: oct` (対称鍵) が JWKS に含まれること自体、セキュリティ上の問題があります。

## `use` と `key_ops` フィールド

JWK の `use` フィールドは鍵の利用目的 (`sig` or `enc`) を示します。`key_ops` は操作の種類 (`sign`, `verify` など) を示します。

これらのフィールドが存在する場合、署名検証に使えない鍵を早期に拒否できます。例えば `use: enc` の鍵は暗号化用であり、署名検証に使うべきではありません。

## 対策の選択肢

修正の方針として、主に 2 つのアプローチがあります。

### ① alg ホワイトリスト方式

検証側で事前に「許可するアルゴリズムの集合」を定義し、JWT ヘッダの `alg` がその集合に含まれるかを確認する方式です。

根本的な解決策であり、ライブラリ利用者が明示的にアルゴリズムを選択することを強制できます。ただし、ライブラリ側からするとオプション追加が必須になるため、破壊的変更を伴います。

### ② 鍵とアルゴリズムの厳密な紐づけ

鍵の形状からアルゴリズムを推測し、JWT ヘッダの `alg` と照合する方式です。JWK なら `kty` や `alg` フィールドを参照します。JWT ミドルウェアであれば、シークレットが公開鍵としてパース可能かどうかを確認することで、RS256 と HS256 の混同を検出できます。

対処療法的であり、ケースの網羅が困難な面もありますが、ライブラリ利用者の変更を最小限にできます。

Hono の今回の修正では、**① ホワイトリスト方式を主軸**に、② の要素も加える形を採用しています。

## 他のフレームワーク・ライブラリの対応

### `jsonwebtoken` (Node.js)

Node.js で最も広く使われている JWT ライブラリです。`verify()` には `algorithms` オプションがあり、許可するアルゴリズムをホワイトリスト形式で渡すことが推奨されています。

```typescript
jwt.verify(token, publicKey, { algorithms: ['RS256'] }, callback)
```

実は `jsonwebtoken` も過去に同様の問題を経験しています。バージョン 8.5.1 以前では、`algorithms` 未指定かつ秘密鍵が falsy な場合に `none` アルゴリズムにフォールバックし、署名検証をバイパスできてしまう脆弱性が存在していました (GHSA-qwph-4952-7xr6)。v9.0.0 でデフォルトの `none` サポートが除去されています。

### `@fastify/jwt`

Fastify の JWT プラグインは `algorithms` オプションで許可アルゴリズムの一覧を指定できます。内部で `fast-jwt` を使用しており、アルゴリズムの明示的な指定を設計の中心に据えています。

### `elysia-jwt`

Elysia の JWT プラグインは内部で `jose` ライブラリを使用しています。`alg` オプションでアルゴリズムを指定する設計になっており、`jose` 自体が明示的なアルゴリズム指定を API の前提としています。

いずれのライブラリも、「アルゴリズムは呼び出し側が意識的に選択する」という設計になっています。これは偶然ではなく、アルゴリズム混同攻撃への対策が業界標準として浸透してきた結果です。

# この脆弱性が発生した流れ

## JWT ミドルウェアの経緯

`src/utils/jwt/jwt.ts` の `verify` 関数は次のような実装でした。

```typescript
// 修正前
export const verify = async (
  token: string,
  publicKey: SignatureKey,
  algOrOptions?: SignatureAlgorithm | VerifyOptionsWithAlg  // オプショナル
): Promise<JWTPayload> => {
  const {
    alg = 'HS256',  // ← alg 未指定時は HS256 にフォールバック
    iss,
    nbf = true,
    exp = true,
    iat = true,
    aud,
  } = typeof algOrOptions === 'string'
    ? { alg: algOrOptions }
    : algOrOptions || {}
  // ...
}
```

`alg` はオプショナルで、省略すると `HS256` がデフォルトになります。ミドルウェアでも同様でした。

```typescript
// jwt ミドルウェアのオプション (修正前)
export const jwt = (options: {
  secret: SignatureKey
  cookie?: ...
  alg?: SignatureAlgorithm  // ← オプショナル
  headerName?: string
  verification?: VerifyOptions
}): MiddlewareHandler => {
  // ...
  payload = await Jwt.verify(token, options.secret, {
    alg: options.alg,  // undefined なら verify 内で HS256 にフォールバック
    ...verifyOpts,
  })
}
```

よく見られるシンプルな使い方として、`jwt({ secret: 'my-secret' })` のように `alg` を省略するケースがあります。RS256 を想定して公開鍵を設定していたとしても、内部では HS256 が使われていた可能性があります。

## JWK ミドルウェアの経緯

`verifyWithJwks` 関数内の問題個所は次の箇所です。

```typescript
// 修正前
return await verify(token, matchingKey, {
  alg: (matchingKey.alg as SignatureAlgorithm) || header.alg,
  // ↑ JWK に alg がなければ JWT ヘッダの alg をそのまま信用する
  ...verifyOpts,
})
```

`matchingKey.alg` が undefined であれば `header.alg` が使われます。これを利用して攻撃者は JWT ヘッダに `HS256` を書き込み、公開鍵を HMAC シークレットとして流用することで検証を突破できます。

対称鍵アルゴリズム (HS256/HS384/HS512) を明示的に禁止する処理も存在しなかったため、`kty: oct` のような不自然な JWK でも動作してしまっていました。

# 想定される攻撃のリスクの大きさ

CVSS v3.1 スコアは両脆弱性とも **8.2 (High)** です。

```
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:N
```

- **AV:N** — ネットワーク越しに攻撃できる
- **AC:L** — 攻撃の難易度は低い
- **PR:N** — 事前の認証が不要
- **UI:N** — 被害者の操作が不要
- **I:H** — 完全性への影響が大きい (認可バイパス)

攻撃に必要なものは、公開されている JWKS エンドポイントの URL と RSA 公開鍵のバイト列だけです。特別なツールも複雑な手順も不要で、ネットワーク越しに完全な認証バイパスが成立します。

**影響を受けるアプリケーションの条件**

- `hono/jwt` を使用し、`alg` を明示指定していない
- `hono/jwk` を使用し、JWKS のキーに `alg` フィールドが含まれていない
- JWT の検証結果に基づいて認証・認可の判断を行っている

逆に、以下のいずれかに該当するアプリへの影響はありません。

- `alg` を明示的に指定していた
- JWT/JWK ミドルウェアを使っていない
- JWT を認証・認可の判断に使っていない

# 修正までの流れ

## GitHub の Private Vulnerability Reporting

Hono は GitHub の Private Vulnerability Reporting 機能を利用しています。セキュリティ上の問題はリポジトリの Security タブから非公開で報告でき、メンテナが確認・検証した後、修正版のリリースと GHSA の公開が同時に行われます。

両アドバイザリは 2026 年 1 月 13 日に公開されました。

## JWT ミドルウェアの修正内容

修正の核心は `alg` の必須化です。

```typescript
// 修正後: alg が必須パラメータに変更
export const verify = async (
  token: string,
  publicKey: SignatureKey,
  algOrOptions: SignatureAlgorithm | VerifyOptionsWithAlg  // 必須に
): Promise<JWTPayload> => {
  const {
    alg,  // デフォルト値なし
    // ...
  } = typeof algOrOptions === 'string'
    ? { alg: algOrOptions }
    : algOrOptions

  if (!alg) {
    throw new Error('JWT verification requires "alg" to be specified')
  }
  // ...
}
```

ミドルウェア側でも同様に `alg` が必須になりました。

```typescript
// 修正後
export const jwt = (options: {
  secret: SignatureKey
  alg: SignatureAlgorithm  // 必須に変更
  // ...
}): MiddlewareHandler => {
  if (!options.alg) {
    throw new Error(
      'JWT auth middleware requires options for "alg". ' +
      'Please specify the algorithm explicitly to prevent algorithm confusion attacks.'
    )
  }
  // ...
}
```

これにより、**アルゴリズムを意識しないまま使うことが構造的にできなくなりました**。

```typescript
// 修正前 (動いたが脆弱)
app.use('/api/*', jwt({ secret: 'my-secret' }))

// 修正後 (alg 必須)
app.use('/api/*', jwt({ secret: 'my-secret', alg: 'HS256' }))
```

## JWK ミドルウェアの修正内容

JWK 側の修正はより多層的です。

### アルゴリズム分類の型定義

まず、対称鍵と非対称鍵を分類する定数が追加されました。

```typescript
// src/utils/jwt/jwa.ts に追加
export const SymmetricAlgorithms = new Set<SignatureAlgorithm>(['HS256', 'HS384', 'HS512'])

export const AsymmetricAlgorithms = new Set<SignatureAlgorithm>([
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'EdDSA',
])

// kty とアルゴリズムの対応マップ
export const KtyToAlgorithms: Record<string, Set<SignatureAlgorithm>> = {
  RSA: new Set(['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']),
  EC: new Set(['ES256', 'ES384', 'ES512']),
  OKP: new Set(['EdDSA']),
}
```

### 検証フローの改善

`verifyWithJwks` の検証フローは次のように整理されました。

```typescript
// 修正後のフロー (概要)
const allowedAlgs = options.allowedAlgorithms
  ? new Set(options.allowedAlgorithms)
  : AsymmetricAlgorithms  // デフォルトは非対称鍵のみ

// 1. ホワイトリストチェック
if (!allowedAlgs.has(header.alg)) {
  throw new JwtAlgorithmNotAllowed(header.alg, Array.from(allowedAlgs))
}

// 2. 対称鍵アルゴリズムを拒否
if (SymmetricAlgorithms.has(header.alg)) {
  throw new JwtSymmetricAlgorithmNotAllowed(header.alg)
}

// 3. kid で JWK を検索 (既存処理)

// 4. JWK の use / key_ops / alg フィールドを検証
validateJwkForVerification(matchingKey, header.alg)

// 5. 検証実行 (header.alg を使用、フォールバックなし)
return await verify(token, matchingKey, { alg: header.alg, ...verifyOpts })
```

### `validateJwkForVerification` による多層チェック

```typescript
function validateJwkForVerification(jwk: HonoJsonWebKey, headerAlg: SignatureAlgorithm): void {
  // use フィールドが "sig" 以外なら拒否
  if (jwk.use !== undefined && jwk.use !== 'sig') {
    throw new JwtKeyUsageInvalid(...)
  }

  // key_ops フィールドが "verify" を含まなければ拒否
  if (jwk.key_ops !== undefined && !jwk.key_ops.includes('verify')) {
    throw new JwtKeyUsageInvalid(...)
  }

  // JWK の alg が JWT ヘッダの alg と不一致なら拒否
  if (jwk.alg !== undefined) {
    if (jwk.alg !== headerAlg) {
      throw new JwtAlgorithmMismatch(jwk.alg, headerAlg)
    }
  } else {
    // alg がない場合は kty で互換性を確認
    if (jwk.kty !== undefined) {
      const compatibleAlgs = KtyToAlgorithms[jwk.kty]
      if (compatibleAlgs && !compatibleAlgs.has(headerAlg)) {
        throw new JwtKtyAlgorithmMismatch(jwk.kty, headerAlg)
      }
    }
  }
}
```

JWK の `alg` フィールドがない場合でも、`kty` から互換アルゴリズムの集合を取得し、JWT ヘッダの `alg` がそのファミリーに属するかを確認しています。鍵のアルゴリズムを確定はできないが、少なくともファミリーの整合性は担保するという考え方です。

### ミドルウェアの変更

```typescript
// 修正前 (alg 未指定で動作)
app.use('/auth/*', jwk({ jwks_uri: 'https://example.com/.well-known/jwks.json' }))

// 修正後 (allowedAlgorithms で制御)
app.use('/auth/*', jwk({
  jwks_uri: 'https://example.com/.well-known/jwks.json',
  allowedAlgorithms: ['RS256'],  // 明示的に指定
}))
```

なお、`allowedAlgorithms` を省略した場合はデフォルトで `AsymmetricAlgorithms` (非対称鍵アルゴリズム全体) が適用されます。未指定でも対称鍵は拒否される設計になっています。

# 自分で実装するときに気をつけるマインド

## アルゴリズムは必ず明示する

最大の教訓はここに尽きます。「デフォルトに任せる」実装は、デフォルト値が何かを知らないまま使うことと同じです。

```typescript
// 良くない: デフォルトに任せている
const payload = await verify(token, secret)

// 良い: 使うアルゴリズムを明示している
const payload = await verify(token, secret, 'RS256')
```

JWT 検証に関わるコードを書くときは、「自分が今どのアルゴリズムを使っているか」を常に意識してください。

## 外部入力は信用しない

JWT ヘッダは攻撃者が書き換えられる外部入力です。`alg` フィールドも例外ではありません。「ヘッダに書いてある通りのアルゴリズムで検証する」という実装は、検証アルゴリズムの選択権を攻撃者に渡しているのと同じです。

アルゴリズムの決定は、コード内やサーバ設定など攻撃者が操作できない箇所で行うべきです。

## ホワイトリストで考える

「HS256 以外は拒否する」ではなく「RS256 のみ受け付ける」という考え方が基本です。将来追加されるアルゴリズムを意図せず許可してしまうリスクを排除できます。

## JWK の `alg` フィールドを過信しない

JWK に `alg` が含まれていても、それを持ってアルゴリズムの妥当性が保証されるわけではありません。`alg` がない JWK も多く存在します。自分のアプリが受け付けるアルゴリズムは、自分のコードで決めてください。

## 対称鍵と非対称鍵を混同しない

JWKS は公開鍵を配布する仕組みです。JWKS で対称鍵 (`kty: oct`) を公開することはセキュリティ上の矛盾です。JWK ミドルウェアを使う場合は非対称鍵アルゴリズムのみを許可するのが正しい設計です。

## ライブラリのデフォルト動作を理解する

セキュリティライブラリを使っていても、設定が不適切であれば意味がありません。今回の Hono の修正はまさにこの点を突いています。「デフォルト値で動く」ことと「安全に動く」ことは別の話です。

ライブラリの主要な設定項目と、各設定が何を意味するかを把握した上で使うようにしてください。また、セキュリティアドバイザリは定期的に確認する習慣をつけると良いと思います。

# 終わりに

JWT の `alg` フィールドが外部から操作できるという構造的な問題は、実装者が意識的に対処しない限り容易にすり抜けてしまいます。Hono に限った話ではなく、`jsonwebtoken` や他のフレームワークでも過去に同種の問題が繰り返されてきた経緯があります。

今回の修正後の Hono では、`alg` の明示が必須となり、JWK ミドルウェアでは対称鍵が拒否され、`kty` と `alg` の整合性チェックが加わりました。「動くけど安全ではない」コードを書けてしまう設計から、「安全でないと動かない」設計へのシフトです。

修正内容が何を防いでいるかを理解することが、次の問題を未然に防ぐことにつながります。

参考リンクを置いておきます。

https://github.com/honojs/hono/security/advisories/GHSA-f67f-6cw9-8mq4

https://github.com/honojs/hono/security/advisories/GHSA-3vhc-576x-3qv4

https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/

影響を受けるバージョンを使っている方は、アップデートと設定の見直しをぜひ行ってみてください。

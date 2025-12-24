---
title: "IDトークンの仕様"
---

## 概要

この章では、OIDC の **ID トークンの仕様** について解説します。
前章までで学んだ JWT/JWS の知識を前提として、ID トークン固有の要件を見ていきましょう。

## ID トークンの構造

ID トークンは、基本的に **JWT（JWS 形式）** で提供されます。

> The ID Token is a security token that contains Claims about the Authentication of an End-User by an Authorization Server when using a Client, and potentially other requested Claims. The ID Token is represented as a JSON Web Token (JWT).
>
> — [OpenID Connect Core 1.0 Section 2](https://openid.net/specs/openid-connect-core-1_0.html#IDToken)

### 署名アルゴリズムの要件

ID トークンの署名アルゴリズムには、以下の要件があります。

| アルゴリズム | 推奨/禁止                                          |
| ------------ | -------------------------------------------------- |
| RS256        | **推奨**（デフォルト）                             |
| ES256        | 推奨                                               |
| `none`       | **原則禁止**                                       |
| HS256        | 原則禁止（Confidential Client でのみ条件付き許容） |

> ID Tokens MUST be signed using JWS. The algorithm RS256 MUST be supported.
>
> — [OpenID Connect Core 1.0 Section 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)

#### `none` アルゴリズムの禁止

`alg: none` は署名なしを意味しますが、ID トークンでは **原則として禁止** されています。
署名がない ID トークンは改ざんを検出できず、セキュリティ上の脆弱性となるためです。

#### HS256 の原則禁止

HS256（対称鍵方式）は JWT 作成者と検証者が同じ秘密鍵を共有する必要があります。
OIDC では OP と RP が異なるシステムであることが一般的なため、
**RS256 などの非対称鍵方式が推奨** されます。

ただし、**Confidential Client** でかつクライアント認証が行われる場合に限り、
HS256 の使用が許容されることがあります。

## ヘッダ部分

ID トークンのヘッダ部分は、JWT（JWS 形式）のヘッダ部分と同様の構造を持ちます。

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-12345"
}
```

### 主なパラメータ

| パラメータ | 説明             | 必須/任意            |
| ---------- | ---------------- | -------------------- |
| `alg`      | 署名アルゴリズム | **必須**             |
| `typ`      | トークンの種類   | 任意（`"JWT"` 推奨） |
| `kid`      | 鍵識別子         | 任意                 |

#### `alg` パラメータ

署名アルゴリズムを指定します。前述の通り、**RS256 が推奨** されます。
`none` は原則禁止です。

#### `typ` パラメータ

トークンの種類を示します。ID トークンでは **`"JWT"`** を指定することが推奨されています。

#### `kid` パラメータ

署名検証に使用する鍵を識別するためのヒントです。
OpenID Provider が複数の鍵を持っている場合、`kid` を使って適切な鍵を選択できます。

鍵の管理については、応用編の JWK/JWK Set で詳しく解説します。

## ペイロード部分

ID トークンのペイロード部分には、
**JWT Claims Set** 形式でユーザー認証に関する情報が含まれます。

```json
{
  "iss": "https://op.example.com",
  "sub": "user-12345",
  "aud": "client-id-abc",
  "exp": 1735084800,
  "iat": 1735081200,
  "nonce": "n-0S6_WzA2Mj"
}
```

### OIDC ID トークン固有のパラメータ

#### 必須パラメータ

| パラメータ | 名称            | 説明                                    |
| ---------- | --------------- | --------------------------------------- |
| `iss`      | Issuer          | 発行者識別子（OP を一意に識別する URL） |
| `sub`      | Subject         | ユーザー識別子（OP 内で一意）           |
| `aud`      | Audience        | クライアント識別子（RP の client_id）   |
| `exp`      | Expiration Time | 有効期限（Unix タイムスタンプ）         |
| `iat`      | Issued At       | 発行時刻（Unix タイムスタンプ）         |

##### `iss`（Issuer）

ID トークンの発行者を識別する URL です。
OpenID Provider ごとに一意な識別子となります。

```json
"iss": "https://accounts.google.com"
```

##### `sub`（Subject）

認証されたユーザーを識別するための識別子です。
この値は **OP 内で一意** であり、同じユーザーに対しては常に同じ値が返されます。

```json
"sub": "110169484474386276334"
```

##### `aud`（Audience）

ID トークンの受信者（Audience）を示します。
ID トークンにおいては、**Relying Party の `client_id`** が指定されます。

```json
"aud": "s6BhdRkqt3"
```

複数の Audience がある場合は配列で指定されます。

##### `exp`（Expiration Time）

ID トークンの有効期限を示す Unix タイムスタンプです。
この時刻を過ぎた ID トークンは無効として扱われます。

```json
"exp": 1735084800
```

##### `iat`（Issued At）

ID トークンが発行された時刻を示す Unix タイムスタンプです。

```json
"iat": 1735081200
```

#### 条件付き必須パラメータ

| パラメータ | 名称  | 説明                                           |
| ---------- | ----- | ---------------------------------------------- |
| `nonce`    | Nonce | リプレイ攻撃対策（認可リクエストで要求時必須） |

##### `nonce`

`nonce` は、認可リクエスト時に RP が指定した場合、ID トークンに含める必要があります。
これは **リプレイ攻撃** への対策として機能します。

`nonce` の詳細については、応用編で解説します。

#### その他のパラメータ

純粋な認可コードフローにおいては、上記以外のパラメータは任意です。
応用編では、`auth_time`、`acr`、`amr`、`azp` などのパラメータについても解説します。

## 署名部分

署名部分は、JWT（JWS 形式）の署名部分と同様の構造です。
署名の計算方法は前章で説明した通りです。

RP は、OP が公開する **公開鍵** を用いて署名を検証します。

## まとめ

- **ID トークンは JWT（JWS 形式）で提供される**
  - JWT/JWS の知識が前提
- **ヘッダの要件**
  - `alg`: RS256 が推奨、`none` は原則禁止
  - `typ`: `"JWT"` が推奨
  - `kid`: 鍵識別のヒント（任意）
- **ペイロードの OIDC 固有パラメータ**
  - 必須: `iss`, `sub`, `aud`, `exp`, `iat`
  - 条件付き必須: `nonce`（認可リクエストで要求時）
- **署名部分は JWT（JWS 形式）と同様**
  - RS256 による非対称鍵署名が推奨

ここまで、OIDC のフローと ID トークンの仕様について解説しました。
次章では、OIDC の完全版フローについて学びます。

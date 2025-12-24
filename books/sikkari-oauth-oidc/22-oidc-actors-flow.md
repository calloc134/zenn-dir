---
title: "OIDCの登場人物とフロー"
---

## 概要

この章では、**OIDC に登場する主要なロール**について解説します。
また**OAuth 2.0 のロールとの対応関係**についても説明し、
OIDC の基本的な認可コードフローを見ていきます。

## OIDC の主要なロール

OIDC では、OAuth 2.0 のロールに対応する形で、以下のロールが定義されています。

### OAuth 2.0 と OIDC のロール対応

| OAuth 2.0        | OIDC                                 |
| ---------------- | ------------------------------------ |
| リソースオーナー | エンドユーザー                       |
| クライアント     | Relying Party（RP）                  |
| 認可サーバー     | OpenID Provider（OP）                |
| リソースサーバー | UserInfo Endpoint を提供するサーバー |

### エンドユーザー（End-User）

OAuth 2.0 の **リソースオーナー** に対応します。
OIDC では、認証の対象となるユーザーを指します。

### Relying Party（RP）

OAuth 2.0 の **クライアント** に対応します。
OIDC の文脈では ID トークンを受け取ってユーザー認証を行うアプリケーションを指します。

OAuth 2.0 のクライアントと同様に
**Confidential Client** と **Public Client** の区別があります。

### OpenID Provider（OP）

OAuth 2.0 の **認可サーバー** に対応します。
エンドユーザーを認証し、ID トークンを発行する役割を担います。

### UserInfo Endpoint

OAuth 2.0 の **リソースサーバー** に対応するのが
OIDC の **UserInfo Endpoint** を提供するサーバーです。

UserInfo Endpoint は、
アクセストークンを用いてユーザーのプロフィール情報を取得するためのエンドポイントです。

> The UserInfo Endpoint is an OAuth 2.0 Protected Resource that returns Claims about the authenticated End-User.
>
> — [OpenID Connect Core 1.0 Section 5.3](https://openid.net/specs/openid-connect-core-1_0.html#UserInfo)

UserInfo Endpoint は **認可の対象となるリソース** であることを意識しましょう。
OIDC においても OAuth 2.0 の認可の仕組みがそのまま活用されている部分であると言えます。

仕様上、UserInfo Endpoint は OpenID Provider と同一のサーバーでも構いません。
そのため、多くの実装では OpenID Provider が UserInfo Endpoint も提供しています。

また ID トークンに十分な情報が含まれている場合、
UserInfo Endpoint を利用しないケースもあります。

## OIDC 内の認証らしさと認可らしさ

OIDC は OAuth 2.0 を拡張した仕様ですが、
内部には **認証の特性** と **認可の特性** の両方が存在します。

| 要素              | 特性                                               |
| ----------------- | -------------------------------------------------- |
| ID トークン       | OIDC で追加された **認証** の特性が強い            |
| UserInfo Endpoint | OAuth 2.0 の機構を引き継いだ **認可** の特性が強い |

ID トークンは OIDC 固有の仕組みで、ユーザー認証のために使われます。
一方 UserInfo Endpoint へのアクセスは
OAuth 2.0 のアクセストークンによる認可の仕組みをそのまま利用している部分です。

## OIDC の認可コードフロー

OIDC の認可コードフローは、**OAuth 2.0 の認可コードフローとほぼ同じ** です。

主な違いは以下の 3 点です。

1. 認可リクエストのスコープに **`openid`** を含める
2. トークンレスポンスに **ID トークン** が含まれる
3. アクセストークンで **UserInfo Endpoint** にアクセスできる

### フローの流れ

```mermaid
sequenceDiagram
    participant EU as エンドユーザー
    participant RP as Relying Party
    participant OP as OpenID Provider

    EU->>RP: ログインしたい
    RP->>EU: まずは認可コードを取ってきてください
    EU->>OP: 認証してください（scope=openid）
    OP->>OP: エンドユーザーを認証
    OP->>OP: 認可コードを発行
    OP->>EU: 認証しました（認可コードを渡す）
    EU->>RP: 認可コードを渡す
    RP->>OP: 認可コードを持っているので<br>トークンをください
    OP->>OP: 認可コードを検証
    OP->>OP: ID トークン + アクセストークンを発行
    OP->>RP: ID トークン + アクセストークン
    RP->>RP: ID トークンを検証
    RP->>RP: ユーザーを認証、セッション開始
```

### ステップ 1：フロー開始

1. エンドユーザーが Relying Party（RP）に対し「ログインしたい」とリクエストする
2. RP がエンドユーザーを OpenID Provider（OP）にリダイレクトさせる

### ステップ 2：認可リクエスト

OAuth 2.0 との違いとして、スコープに `openid` を含める必要があります。

```http
GET /authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://rp.example.com/callback
  &scope=openid%20profile
  &state=xyz123
```

`scope=openid` があることで、これが OIDC のリクエストであることを OP に伝えます。

### ステップ 3：認可コード取得

3. エンドユーザーが OP で認証を行う
4. OP が認可コードを発行し、エンドユーザーを RP にリダイレクトさせる
5. エンドユーザーが RP に認可コードを渡す

```http
HTTP/1.1 302 Found
Location: https://rp.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=xyz123
```

### ステップ 4：トークンリクエスト

6. RP が認可コードを OP に送信し、トークンを要求する

```http
POST /token HTTP/1.1
Host: op.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://rp.example.com/callback
```

### ステップ 5：トークンレスポンス

OAuth 2.0 との違いとして、レスポンスに **ID トークン** が含まれます。

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "SlAV32hkKG",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### ステップ 6：ID トークンの検証とユーザー認証

7. RP が ID トークンを検証する
8. 検証に成功したら、ユーザーを認証してセッションを開始する

ID トークンの検証方法については、後の章で詳しく解説します。

## まとめ

- **OIDC の主要なロールは OAuth 2.0 とほぼ同じ**
  - リソースオーナー → エンドユーザー
  - クライアント → Relying Party（RP）
  - 認可サーバー → OpenID Provider（OP）
  - リソースサーバー → UserInfo Endpoint を提供するサーバー
- **認可コードフローも OAuth 2.0 とほぼ同じ**
  - 違いは `scope=openid` と ID トークンの追加
- **OIDC には認証らしさと認可らしさが混在**
  - ID トークン → 認証
  - UserInfo Endpoint → 認可

おおよその OIDC の流れと登場人物について、解説しました。
OAuth との差分は思ったより少ないことが分かります。

次章からは、OIDC の中核である **ID トークンの仕様** および
ID トークンの理解に必要な **JWT（JSON Web Token）** 仕様について解説していきます。

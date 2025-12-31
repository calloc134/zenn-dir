---
title: "OIDCの登場人物とフロー"
free: true
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
| リソースオーナー | エンドユーザ                         |
| クライアント     | Relying Party（RP）                  |
| 認可サーバー     | OpenID Provider（OP）                |
| リソースサーバー | UserInfo Endpoint を提供するサーバー |

![](/images/22-oidc-actors-flow/2025-12-27-22-52-25.png)

### エンドユーザ（End-User）

OAuth 2.0 の **リソースオーナー** に対応します。
OIDC では、認証や外部連携の対象となるユーザを指します。

![](/images/22-oidc-actors-flow/2025-12-27-22-57-02.png)

### OpenID Provider（OP）

OAuth 2.0 の **認可サーバー** に対応します。
エンドユーザを認証し、ID トークンを発行する役割を担います。
なお、認可サーバの役割も兼ねているため、アクセストークン発行の役割も担います。

![](/images/22-oidc-actors-flow/2025-12-27-23-01-00.png)

### Relying Party（RP）

OAuth 2.0 の **クライアント** に対応します。
OIDC の文脈では ID トークンを受け取って ID 連携を行うアプリケーションを指します。

OAuth 2.0 のクライアントと同様に
**Confidential Client** と **Public Client** の区別があります。

![](/images/22-oidc-actors-flow/2025-12-27-23-04-54.png)

### UserInfo Endpoint

OAuth 2.0 の **リソースサーバー** に対応するのが
OIDC の **UserInfo Endpoint** を提供するサーバーです。

UserInfo Endpoint は、
アクセストークンを用いてユーザのプロフィール情報を取得するためのエンドポイントです。[^oidc-userinfo]

[^oidc-userinfo]: OpenID Connect Core 1.0 Section 5.3 において、UserInfo Endpoint は「OAuth 2.0 で保護されたリソースであり、認証されたエンドユーザに関するクレームを返す」と定義されています。https://openid.net/specs/openid-connect-core-1_0.html#UserInfo

![](/images/22-oidc-actors-flow/2025-12-28-14-57-38.png)

UserInfo Endpoint は **認可の対象となるリソース** であることを意識しましょう。
OIDC においても OAuth 2.0 の認可の仕組みがそのまま活用されている部分であると言えます。

仕様上、UserInfo Endpoint は OpenID Provider と同一のサーバーでも構いません。
そのため、多くの実装では OpenID Provider が UserInfo Endpoint も提供しています。

また ID トークンに十分な情報が含まれている場合、
UserInfo Endpoint を利用しないケースもあります。

## OIDC 内の ID 連携らしさとリソース認可らしさ

OIDC は OAuth 2.0 を拡張した仕様ですが、
内部には **ID 連携らしさ** と **リソース認可らしさ** の両方が混在しています。

| 要素              | 特性                                                       |
| ----------------- | ---------------------------------------------------------- |
| ID トークン       | OIDC で追加された **ID 連携** の特性が強い                 |
| UserInfo Endpoint | OAuth 2.0 の機構を引き継いだ **リソース認可** の特性が強い |

![](/images/22-oidc-actors-flow/2025-12-28-15-03-37.png)

ID トークンは OIDC 固有の仕組みで、ID 連携を実現するためのものです。
一方 UserInfo Endpoint へのアクセスは
OAuth 2.0 のアクセストークンによるリソース認可の仕組みをそのまま利用している部分です。

## OIDC の認可コードフロー

OIDC の認可コードフローは、**OAuth 2.0 の認可コードフローとほぼ同じ** です。

主な違いは以下の 3 点です。

1. 認可リクエストのスコープに **`openid`** を含める
2. トークンレスポンスに **ID トークン** が含まれる
3. アクセストークンで **UserInfo Endpoint** にアクセスできる

ここでは簡単に OIDC の認可コードフローを見ていきます。
簡単のため Confidential Client を前提とし、**セキュリティ機構は省略** します。

### フローの流れ

```mermaid
sequenceDiagram
    participant EU as エンドユーザ
    participant RP as Relying Party
    participant OP as OpenID Provider

    EU->>RP: 外部ログインしたい
    RP->>EU: まずは認可コードを取ってきてください
    EU->>OP: 認証してください（scope=openid）
    OP->>OP: エンドユーザを認証<br>ログイン連携同意
    OP->>OP: 認可コードを発行
    OP->>EU: 認証しました（認可コードを渡す）
    EU->>RP: 認可コードを渡す
    RP->>OP: 認可コードを持っているので<br>トークン群をください
    OP->>OP: 認可コードを検証
    OP->>OP: ID トークン + アクセストークンを発行
    OP->>RP: ID トークン + アクセストークン
    RP->>RP: ID トークンを検証
    RP->>RP: ユーザを認証、セッション開始
```

### ステップ 1：フロー開始

1. エンドユーザが Relying Party（RP）に対し
   「外部ログインしたい」とリクエストする
2. RP がエンドユーザに対し
   「まずは認可コードを取ってきてください」と応答し、
   OpenID Provider（OP）にリダイレクトさせる

![](/images/22-oidc-actors-flow/2025-12-28-15-08-43.png)

### ステップ 2：認可コード取得

3. エンドユーザが OP にアクセスし、「認証してください」とリクエストする
4. OP がエンドユーザを認証し、ログイン連携同意を得て認可コードを発行する
5. OP がエンドユーザに認可コードを持たせ、RP にリダイレクトさせる
6. エンドユーザは RP に対して認可コードを渡す

![](/images/22-oidc-actors-flow/2025-12-28-15-17-44.png)

認可リクエストでは、スコープに `openid` を含める必要があります。
スコープに`openid` を含めることで、
OIDC のリクエストであり、ID トークンの発行を要求していることを OP に伝えます。

```http
GET /authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://rp.example.com/callback
  &scope=openid%20profile%20email%20offline_access
```

認可コードのレスポンスは OAuth 2.0 と同様です。

```http
HTTP/1.1 302 Found
Location: https://rp.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
```

### ステップ 3: ID トークン・アクセストークン取得

7. RP が認可コードを 持って OP にアクセスし、
   「ID トークン(+アクセストークン)をください」とリクエストする
8. OP が認可コードを検証し、成功すれば ID トークンとアクセストークンを発行する
9. OP が RP に対して ID トークンとアクセストークンを返す

![](/images/22-oidc-actors-flow/2025-12-28-15-22-16.png)

トークンリクエストは OAuth 2.0 とほぼ同じです。

```http
POST /token HTTP/1.1
Host: op.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://rp.example.com/callback
```

トークンレスポンスでは、OAuth 2.0 のアクセストークンに加えて、
レスポンスに **ID トークン** が含まれます。

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Pragma: no-cache

{
  "access_token": "SlAV32hkKG",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### ステップ 4：ID トークンの検証とログイン完了

7. RP が ID トークンを検証する
8. 検証に成功したら、外部ユーザの連携・ログインを完了し、セッションを開始する

ID トークンの検証方法については、後の章で詳しく解説します。

## まとめ

- **OIDC の主要なロールは OAuth 2.0 とほぼ同じ**
  - リソースオーナー → エンドユーザ
  - クライアント → Relying Party（RP）
  - 認可サーバー → OpenID Provider（OP）
  - リソースサーバー → UserInfo Endpoint を提供するサーバー
- **認可コードフローも OAuth 2.0 とほぼ同じ**
  - 違いは `scope=openid` と ID トークンの追加
- **OIDC には ID 連携らしさとリソース認可らしさが混在**
  - ID トークン → ID 連携
  - UserInfo Endpoint → リソース認可

おおよその OIDC の流れと登場人物について、解説しました。
OAuth との差分は思ったより少ないことが分かります。

次章からは、OIDC の中核である **ID トークンの仕様** および
ID トークンの理解に必要な **JWT（JSON Web Token）** 仕様について解説していきます。

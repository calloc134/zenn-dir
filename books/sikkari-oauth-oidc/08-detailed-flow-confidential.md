---
title: "ここまでの詳細フロー解説（Confidential Client）"
---

## 概要

ここまでの知識を踏まえて、詳細なコードフロー解説を行います。

この章では**防御機構（PKCE、state）抜き**のフローを解説します。
これらは次の章以降で追加していきます。

ここでは **Confidential Client** を前提とします。

## 詳細なフローの流れ

```mermaid
sequenceDiagram
    participant RO as リソースオーナー
    participant C as クライアント
    participant AS as 認可サーバ

    RO->>C: リソースにアクセスしてほしい
    C->>RO: 認可サーバにリダイレクト
    Note right of C: response_type=code<br>client_id=xxx<br>redirect_uri=xxx<br>scope=xxx
    RO->>AS: 認可リクエスト
    AS->>AS: リソースオーナーを認証
    AS->>AS: 同意画面を表示
    AS->>AS: 認可コードを発行
    AS->>RO: クライアントにリダイレクト
    Note left of AS: code=xxx
    RO->>C: 認可コードを渡す
    C->>AS: トークンリクエスト
    Note right of C: grant_type=authorization_code<br>code=xxx<br>redirect_uri=xxx<br>+ クライアント認証 (ヘッダ)
    AS->>AS: クライアント認証
    AS->>AS: 認可コードを検証
    AS->>AS: アクセストークンを発行
    AS->>C: アクセストークン
```

## ステップ 1：フロー開始

### 1-1. リソースオーナーがクライアントにリクエスト

リソースオーナーがクライアントに対し
「リソースにアクセスしてほしい」とリクエストします。

具体的には、クライアントアプリケーションの「Google と連携する」のようなボタンをクリックすることを想定してください。

### 1-2. クライアントがリソースオーナーをリダイレクト

クライアントがリソースオーナーを認可サーバにリダイレクトさせます。

```http
HTTP/1.1 302 Found
Location: https://authorization-server.example.com/oauth2/authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://client.example.com/callback
  &scope=read%20write
```

| パラメータ      | 説明                                       |
| --------------- | ------------------------------------------ |
| `response_type` | `code`（認可コードフローを示す）           |
| `client_id`     | クライアント識別子                         |
| `redirect_uri`  | 認可コードを受け取るリダイレクト先         |
| `scope`         | リソースへのアクセス範囲（スペース区切り） |

## ステップ 2：認可コード取得

### 2-1. リソースオーナーが認可サーバにアクセス

先ほどのリダイレクト指示により、
リソースオーナーのブラウザは認可サーバにアクセスします。
このリクエストを**認可リクエスト**と呼びます。

### 2-2. 認可サーバがリソースオーナーを認証

認可サーバは、リソースオーナーにログインを求めます（未ログインの場合）。

### 2-3. 同意画面の表示

認可サーバは、「このアプリケーションに以下の権限を許可しますか？」という同意画面を表示します。

### 2-4. 認可コードの発行

リソースオーナーが同意すると、認可サーバは認可コードを発行します。

### 2-5. クライアントへのリダイレクト

認可サーバは、リソースオーナーをクライアントの `redirect_uri` にリダイレクトさせます。
このレスポンスを**認可レスポンス**と呼びます。

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
```

| パラメータ | 説明       |
| ---------- | ---------- |
| `code`     | 認可コード |

## ステップ 3：アクセストークン取得

### 3-1. クライアントがトークンリクエスト

クライアントは、認可コードを使って認可サーバにアクセストークンをリクエストします。
このリクエストを**トークンリクエスト**と呼びます。

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback // オプション
```

| パラメータ     | 説明                                           |
| -------------- | ---------------------------------------------- |
| `grant_type`   | `authorization_code`（認可コードフローを示す） |
| `code`         | 認可コード                                     |
| `redirect_uri` | 認可リクエスト時と同じ値 （オプション）        |

また、`Authorization` ヘッダには `client_secret_basic` 方式でクライアント認証情報を含めます。

:::message

トークンリクエストにおける `redirect_uri` パラメータは、
OAuth 2.0 の仕様では必須となっていますが、より近年の仕様である OAuth 2.1 では削除されており、省略の対象となっています。

:::

### 3-2. 認可サーバがクライアント認証

認可サーバは、`Authorization` ヘッダの情報を使ってクライアント認証を行います。

### 3-3. 認可サーバが認可コードを検証

認可サーバは、認可コードが有効かどうかを検証します。

- 認可コードが存在するか
- 認可コードが期限切れでないか
- 認可コードが既に使用されていないか
- `redirect_uri` が認可リクエスト時と一致するか (指定されている場合)

### 3-4. アクセストークンの発行

検証が成功すると、認可サーバはアクセストークンを発行します。

### 3-5. トークンレスポンス

認可サーバは、クライアントにアクセストークンを返します。

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "2YotnFZFEjr1zCsicMWpAA",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "scope": "read write"
}
```

| パラメータ      | 説明                               |
| --------------- | ---------------------------------- |
| `access_token`  | アクセストークン                   |
| `token_type`    | トークンタイプ（通常は `Bearer`）  |
| `expires_in`    | アクセストークンの有効期限（秒）   |
| `refresh_token` | リフレッシュトークン（オプション） |
| `scope`         | 実際に付与されたスコープ           |

## まとめ

ここまでの内容を踏まえ、リクエストボディやレスポンスも含めた詳細なコードフローを理解できました。

次の章からは、このフローに対する攻撃とその防御について解説していきます。

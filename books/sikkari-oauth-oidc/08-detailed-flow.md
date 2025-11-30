---
title: "ここまでの詳細フロー解説"
---

# ここまでの詳細フロー解説（Confidential Client）

この章では、ここまでの知識をもとに、より詳細な認可コードフローを解説します。

**注意**：この章では防御機構（PKCE、state など）は**含めません**。セキュリティ対策については、後の章で解説します。

ここでは **Confidential Client** を前提とします。

## フローの全体像

```mermaid
sequenceDiagram
    participant RO as リソースオーナー
    participant Client as クライアント
    participant AS as 認可サーバ

    RO->>Client: ①リソースにアクセスしてほしい
    Client->>RO: ②認可サーバへリダイレクト
    RO->>AS: ③認可リクエスト
    AS->>AS: ユーザ認証・同意画面表示
    AS->>AS: 認可コード発行
    AS->>RO: ④認可レスポンス（クライアントへリダイレクト）
    RO->>Client: ⑤認可コードを渡す
    Client->>AS: ⑥トークンリクエスト（認可コード + クライアント認証）
    AS->>AS: クライアント認証
    AS->>AS: 認可コード検証
    AS->>AS: アクセストークン発行
    AS->>Client: ⑦トークンレスポンス
```

## ステップ 1：リソースオーナーがクライアントにリクエスト

クライアントアプリケーションにおいて、ユーザが「リソース連携」や「○○ でログイン」のようなボタンをクリックします。

## ステップ 2：クライアントがリソースオーナーをリダイレクト

クライアントは、リソースオーナーを認可サーバの認可エンドポイントにリダイレクトさせます。

**リダイレクトレスポンス例**：

```http
HTTP/1.1 302 Found
Location: https://authorization-server.example.com/oauth2/authorize
    ?response_type=code
    &client_id=CLIENT_ID
    &redirect_uri=https://client.example.com/callback
    &scope=photos.read
```

| パラメータ      | 説明                                     |
| --------------- | ---------------------------------------- |
| `response_type` | `code`（認可コードを取得することを示す） |
| `client_id`     | クライアント識別子                       |
| `redirect_uri`  | 認可コードを受け取る URL                 |
| `scope`         | リソースへのアクセス範囲                 |

## ステップ 3：認可リクエスト

リソースオーナーのブラウザが、認可サーバの認可エンドポイントにアクセスします。

```http
GET /oauth2/authorize
    ?response_type=code
    &client_id=CLIENT_ID
    &redirect_uri=https://client.example.com/callback
    &scope=photos.read
Host: authorization-server.example.com
```

認可サーバは以下を行います：

1. **ユーザ認証**：リソースオーナーがログインしていなければログイン画面を表示
2. **同意画面表示**：「このクライアントに ○○ へのアクセスを許可しますか？」という画面を表示
3. **認可コード発行**：リソースオーナーが許可すると、認可コードを発行

## ステップ 4：認可レスポンス

認可サーバは、リソースオーナーをクライアントの `redirect_uri` にリダイレクトさせます。このとき、認可コードをクエリパラメータとして渡します。

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback
    ?code=AUTHORIZATION_CODE
```

| パラメータ | 説明       |
| ---------- | ---------- |
| `code`     | 認可コード |

## ステップ 5：認可コードをクライアントに渡す

ステップ 4 のリダイレクトにより、リソースオーナーのブラウザがクライアントにアクセスします。このとき、認可コードがクエリパラメータとして渡されます。

クライアントは、この認可コードを受け取ります。

## ステップ 6：トークンリクエスト

クライアントは、認可サーバのトークンエンドポイントにアクセストークンをリクエストします。

**リクエスト例**：

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://client.example.com/callback
```

| パラメータ     | 説明                                                     |
| -------------- | -------------------------------------------------------- |
| `grant_type`   | `authorization_code`（認可コードフローを使うことを示す） |
| `code`         | 認可コード                                               |
| `redirect_uri` | 認可リクエスト時と同じ値                                 |

**クライアント認証**：

`Authorization` ヘッダに `Basic` スキームでクライアント認証情報を含めます（`client_secret_basic` 方式）。

```
Authorization: Basic {Base64(client_id:client_secret)}
```

認可サーバは以下を行います：

1. **クライアント認証**：`Authorization` ヘッダのクライアント認証情報を検証
2. **認可コード検証**：認可コードが有効か、期限切れでないか、既に使用されていないかを検証
3. **redirect_uri 検証**：認可リクエスト時の `redirect_uri` と一致するかを検証
4. **アクセストークン発行**：すべての検証に成功したら、アクセストークンを発行

## ステップ 7：トークンレスポンス

認可サーバは、アクセストークンをレスポンスとして返します。

**レスポンス例**：

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "access_token": "ACCESS_TOKEN",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "REFRESH_TOKEN",
    "scope": "photos.read"
}
```

| パラメータ      | 説明                               |
| --------------- | ---------------------------------- |
| `access_token`  | アクセストークン                   |
| `token_type`    | トークンの種類（通常は `Bearer`）  |
| `expires_in`    | アクセストークンの有効期限（秒）   |
| `refresh_token` | リフレッシュトークン（オプション） |
| `scope`         | 許可されたスコープ                 |

これで、クライアントはアクセストークンを取得できました！

## リソースへのアクセス

アクセストークンを取得したクライアントは、リソースサーバにアクセスしてリソースを取得できます。

```http
GET /api/photos HTTP/1.1
Host: resource-server.example.com
Authorization: Bearer ACCESS_TOKEN
```

リソースサーバは、アクセストークンを検証し、有効であればリソースを返します。

## まとめ

ここまでの内容を踏まえ、認可コードフローの詳細を理解できました。

**重要なポイント**：

1. **リソースオーナーは認可コードを経由してアクセストークンを取得する**

   - 認可コードは一時的なもので、アクセストークンそのものではない

2. **クライアント認証によって、正当なクライアントのみがアクセストークンを取得できる**

   - Confidential Client では `client_secret` を使って認証

3. **アクセストークンはクライアントとサーバ間でのみやり取りされる**
   - リソースオーナー（ブラウザ）にはアクセストークンが露出しない

**ただし**、このフローには防御機構が含まれていません。次の章からは、OAuth フローに対する攻撃とその防御策について解説していきます。

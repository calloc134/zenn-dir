---
title: "詳細なコードフロー解説（簡易版）"
---

# 詳細なコードフロー

ここまでの知識を元に、認可コードフローの詳細なリクエスト・レスポンスを見ていきましょう。

この章では、セキュリティ対策である **state** や **PKCE** を含まない、基本的なフローを解説します。
（セキュリティ対策については、後続の章で詳しく解説します）

```mermaid
sequenceDiagram
    participant リソースオーナー
    participant クライアント
    participant 認可サーバ

    リソースオーナー->>クライアント: リソースにアクセスしてほしい
    クライアント->>リソースオーナー: まずは認可コードを取ってきてくれ
    リソースオーナー->>認可サーバ: 認可してください
    認可サーバ->>認可サーバ: 認可コード発行
    認可サーバ->>リソースオーナー: 認可しました
    リソースオーナー->>クライアント: 認可コードどうぞ
    クライアント->>認可サーバ: アクセストークンをください
    認可サーバ->>認可サーバ: 認可コードを検証
    認可サーバ->>認可サーバ: アクセストークンを発行
    認可サーバ->>クライアント: アクセストークン
```

# 1. フロー開始

リソースオーナーがクライアントに対し、「リソースにアクセスしてほしい」とリクエストします。

ここについては、クライアントアプリケーションの仕様によります。
基本的には、リソース連携を行うボタンをクリックすることで、リソースオーナーがクライアントに対してリクエストを行い、次のステップに進みます。

# 2. 認可リクエストへのリダイレクト

クライアントがリソースオーナーに対し、「まずは認可コードを取ってきてくれ」と言ってリソースオーナーをリダイレクトさせます。

以下は、クライアントがリソースオーナーをリダイレクトさせる際のレスポンス例です。

```http
302 Found
Location: https://auth.example.com/oauth2/authorize
    ?response_type=code
    &client_id=s6BhdRkqt3
    &redirect_uri=https://client.example.com/callback
    &scope=read write
```

## パラメータの説明

| パラメータ名  | 説明                                                          |
| ------------- | ------------------------------------------------------------- |
| response_type | `code`（認可コードを取得するための指定）                      |
| client_id     | クライアント識別子                                            |
| redirect_uri  | リダイレクト先 URI。認可コードはこの URI に渡されることになる |
| scope         | リソースへのアクセス範囲                                      |

# 3. 認可リクエスト

リソースオーナーが認可サーバにアクセスし、認可サーバに対して「認可してください」とリクエストします。

先程のリダイレクト指示で、リソースオーナーは認可サーバにアクセスします。このリクエストのことを**認可リクエスト**と呼びます。

```http
GET /oauth2/authorize
    ?response_type=code
    &client_id=s6BhdRkqt3
    &redirect_uri=https://client.example.com/callback
    &scope=read write
Host: auth.example.com
```

その後、アクセス権を認めるかどうかを選択する画面が表示されます。この処理は認可サーバの仕様によって異なるため、ここでは省略します。

最終的にアクセスを許可すると、次のステップに進みます。

参考リンク
http://openid-foundation-japan.github.io/rfc6749.ja.html#code-authz-req

# 4. 認可レスポンス

認可サーバがリソースオーナーに対して「認可しました」と言って認可コードをもたせ、リソースオーナーをクライアントにリダイレクトさせます。

このレスポンスのことを**認可レスポンス**と呼びます。

```http
302 Found
Location: https://client.example.com/callback
    ?code=SplxlOBeZQQYbYS6WxSbIA
```

## パラメータの説明

| パラメータ名 | 説明       |
| ------------ | ---------- |
| code         | 認可コード |

リダイレクト先 URI は、クライアントが認可リクエストで指定した URI です。

参考リンク
http://openid-foundation-japan.github.io/rfc6749.ja.html#code-authz-resp

# 5. 認可コードの受け取り

リソースオーナーはクライアントに対して認可コードを渡します。

リダイレクトにより、自動的にクライアントに認可コードが渡されます。

# 6. トークンリクエスト

クライアントが認可コードを持って認可サーバにアクセスし、「認可コードを持っているのでアクセストークンをください」とリクエストを送ります。

以下は、クライアントが認可コードを持ってアクセストークンを取得する際のリクエスト例です。

```http
POST /oauth2/token HTTP/1.1
Host: auth.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback
```

## パラメータの説明

| パラメータ名 | 説明                                                     |
| ------------ | -------------------------------------------------------- |
| grant_type   | `authorization_code`（認可コードフローを使うことを示す） |
| code         | 認可コード                                               |
| redirect_uri | リダイレクト先 URI。認可コード取得時と同じ               |

## クライアント認証

Confidential Client の場合、クライアント認証が必要です。

上記の例では、`Authorization` ヘッダにクライアント ID とクライアントシークレットを Base64 エンコードしたものを設定しています（client_secret_basic 方式）。

```http
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
```

参考リンク
http://openid-foundation-japan.github.io/rfc6749.ja.html#token-req

# 7. トークンレスポンス

認可サーバが認可コードを検証し、成功すればアクセストークンを発行してクライアントに返します。

以下は、認可サーバがクライアントに対してアクセストークンを返す際のレスポンス例です。

```http
HTTP/1.1 200 OK
Content-Type: application/json;charset=UTF-8

{
    "access_token": "2YotnFZFEjr1zCsicMWpAA",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
    "scope": "read write"
}
```

## パラメータの説明

| パラメータ名  | 説明                             |
| ------------- | -------------------------------- |
| access_token  | アクセストークン                 |
| token_type    | `Bearer`                         |
| expires_in    | アクセストークンの有効期限（秒） |
| refresh_token | リフレッシュトークン             |
| scope         | リソースへのアクセス範囲         |

このようにして、クライアントはアクセストークンを取得できました。

リフレッシュトークンについては、後続の章で解説します。

参考リンク
http://openid-foundation-japan.github.io/rfc6749.ja.html#anchor25

# まとめ

この章では、認可コードフローの基本的なリクエスト・レスポンスについて解説しました。

| フェーズ           | 内容                                          |
| ------------------ | --------------------------------------------- |
| 認可リクエスト     | クライアント → 認可サーバ（リダイレクト経由） |
| 認可レスポンス     | 認可サーバ → クライアント（リダイレクト経由） |
| トークンリクエスト | クライアント → 認可サーバ（直接）             |
| トークンレスポンス | 認可サーバ → クライアント（直接）             |

次の章からは、このフローに対する攻撃手法と、それを防ぐためのセキュリティ対策について解説していきます。

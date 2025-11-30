---
title: "クライアント登録と認証"
---

# クライアント登録と認証

この章では、OAuth におけるクライアント登録とクライアント認証について解説します。

## 概要

これまでの簡易フローでは、一つ抜けている点がありました。

それは、**トークン引き換えリクエストの際に、リクエスト元が正当なクライアントであるかを認可サーバが確認する必要がある**という点です。

この確認を行うために、**クライアント登録**と**クライアント認証**が必要になります。

ここでは **Confidential Client** を前提として説明します。

## クライアント認証の手法の種類

クライアント認証には、大きく分けて 2 つの方法があります：

| 方式                     | 説明                                         |
| ------------------------ | -------------------------------------------- |
| **共有シークレット方式** | クライアントと認可サーバが秘密の文字列を共有 |
| **公開鍵暗号方式**       | 公開鍵と秘密鍵のペアを使用                   |

公開鍵暗号方式については応用編で解説します。ここでは、最も一般的な**共有シークレット方式**を説明します。

## クライアント登録の流れ

OAuth のベースとなる仕様（RFC 6749）では、クライアント登録の具体的な方法を規定していません。

一般的には、クライアントアプリケーションの開発者が、認可サーバのダッシュボード画面などから手動で登録を行います。

> クライアントを登録する場合, クライアント開発者は以下を満たすものとする (SHALL).
>
> - Section 2.1 で説明されているようなクライアントタイプを指定し,
> - Section 3.1.2 で説明されているようなリダイレクト URI を提供し,
> - 認可サーバーが要求するその他の情報 (例えばアプリケーション名, Web サイト, 説明, ロゴイメージ, 利用規則など) を提供する.
>
> — [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)

### 登録時に必要な情報

クライアント登録時には、以下のような情報を登録します：

- **クライアントタイプ**（Confidential / Public）
- **リダイレクト URI**（認可コードを受け取る URL）
- アプリケーション名
- アイコン画像
- など

### 登録後に発行されるもの

クライアント登録が完了すると、認可サーバから以下が発行されます：

| 項目              | 説明                                                               |
| ----------------- | ------------------------------------------------------------------ |
| **client_id**     | クライアントを一意に識別するための ID                              |
| **client_secret** | クライアント認証のための秘密情報（Confidential Client の場合のみ） |

> 認可サーバーは登録済みのクライアントにクライアント識別子 (クライアントが提供した登録情報を表すユニーク文字列) を発行する.
>
> — [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)

:::message
**動的クライアント登録**

手動での登録ではなく、API を通じてクライアント登録を行う仕様も存在します。

- [RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591)
- [RFC 7592 - Dynamic Client Registration Management](https://www.rfc-editor.org/rfc/rfc7592)
  :::

## クライアント認証の流れ

OAuth フローにおいて、クライアント認証は以下のタイミングで行われます：

1. **認可リクエスト時**：`client_id` をリクエストパラメータとして渡す
2. **トークン引き換えリクエスト時**：`client_id` と `client_secret` を使ってクライアント認証を行う

### クライアント認証の方式

共有シークレットを使ったクライアント認証には、主に 2 つの方式があります：

| 方式                    | 説明                     | 推奨度    |
| ----------------------- | ------------------------ | --------- |
| **client_secret_basic** | HTTP Basic 認証を使用    | ✅ 推奨   |
| **client_secret_post**  | リクエストボディに含める | ⚠️ 非推奨 |

### client_secret_basic（推奨）

`client_secret_basic` は、HTTP Basic 認証スキームを使用する方式です。

1. `client_id` と `client_secret` をコロン `:` で連結
2. 連結した文字列を Base64 エンコード
3. HTTP の `Authorization` ヘッダに `Basic {エンコードした文字列}` を設定

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=AUTH_CODE&redirect_uri=...
```

> 認可サーバーは, クライアントパスワードを発行されたクライアントの認証の為に HTTP Basic 認証スキームをサポートしなければならない (MUST).
>
> — [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)

### client_secret_post（非推奨）

`client_secret_post` は、リクエストボディに `client_id` と `client_secret` を含める方式です。

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=AUTH_CODE&redirect_uri=...
&client_id=CLIENT_ID&client_secret=CLIENT_SECRET
```

> 2 つのパラメーターを使ってクライアントクレデンシャルをリクエストボディーに含めることは推奨されていない (NOT RECOMMENDED). この方法は HTTP Basic 認証スキーム (もしくは他のパスワードベースの HTTP 認証スキーム) が直接利用できないクライアントに限定すべきある (SHOULD).
>
> — [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749)

## まとめ

- **クライアント登録**：クライアントを認可サーバに事前登録し、`client_id` と `client_secret` を取得
- **クライアント認証**：トークン引き換え時に、クライアントが正当であることを証明
- 認証方式は **`client_secret_basic`（HTTP Basic 認証）が推奨**

クライアント登録と認証を適切に実装することで、不正なクライアントによるアクセストークンの取得を防止できます。

## 余談：共有シークレット認証のリスク

共有シークレット方式には、**漏洩リスク**があります。

- `client_secret` が漏洩すると、攻撃者がそのクライアントになりすますことができる
- そのため、`client_secret` の管理は非常に重要

より安全な認証方式として、公開鍵暗号を用いたクライアント認証方式（`private_key_jwt` など）も存在します。これについては応用編で解説します。

## 余談：Public Client の場合

**Public Client** では、`client_secret` を安全に保管できないため、クライアント認証を行いません。

- リバースエンジニアリングでソースコードを解析されると、`client_secret` が取得されてしまう
- そのため、Public Client では `client_secret` を発行しない、または使用しない

Public Client の場合は、クライアント認証の代わりに **PKCE** という仕組みを使ってセキュリティを確保します。これについては後の章で詳しく解説します。

次の章では、ここまでの内容を踏まえた詳細なコードフローを解説していきます。

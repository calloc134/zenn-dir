---
title: "クライアント登録と認証"
---

## 概要

この章では、OAuth におけるクライアント登録とクライアント認証について解説します。

簡易フローの解説において、忘れてはいけない点があります。
それは、トークン引き換えリクエストにおいて、リクエストをしてきたクライアントがなりすましされていないか、認可サーバが確認する必要がある、という点です。

そのため、**トークン引き換えリクエストの際に、**
**リクエスト元が正当なクライアントであるかを認可サーバが確認する**処理を行います。
この処理を **クライアント認証** と呼びます。

![](/images/07-client-registration/2025-12-02-15-12-52.png)

OAuth には、クライアント認証、およびクライアント登録の仕組みが用意されています。その仕組みについて解説します。

この章の解説は、 **Confidential Client** を前提とします。

## クライアント認証の手法の種類

クライアント認証には、セキュリティレベルによって様々な手法があります。
ここでは一番シンプルで一般的な、
**共有シークレットを用いた `client_secret_basic`** 方式を解説します。

## クライアント登録の流れ

OAuth のベースとなる仕様では、クライアント登録の具体的な方法を規定していません。
一般的には、クライアントアプリケーションの開発者が認可サーバのダッシュボード画面などから登録を行います。

:::message
RFC 7591 / RFC 7592 では、OAuth 2.0 Dynamic Client Registration という仕様でクライアント登録の API が定義されていますが、必須ではありません。
:::

### 登録時に必要な情報

クライアント登録時には、以下の情報を登録します。

- **クライアントタイプ**: Confidential か Public か
- **リダイレクト URI**: 認可コードを受け取る URI
- **その他**: アプリ名、アプリのアイコン、説明など

### 発行される情報

クライアント登録が完了すると、認可サーバから以下の情報が発行されます
（Confidential Client の場合）。

| 項目              | 説明                                  |
| ----------------- | ------------------------------------- |
| **client_id**     | クライアントを一意に識別するための ID |
| **client_secret** | クライアント認証のための秘密情報      |

`client_id` は公開情報ですが、`client_secret` は秘密情報として厳重に管理する必要があります。

![](/images/07-client-registration/2025-12-02-15-23-57.png)

## クライアント認証の流れ

### 認可リクエスト時

リソースオーナーが認可リクエストを行う際、リクエストパラメータとして `client_id` を渡します。これにより、認可サーバはどのクライアントからのリクエストかを識別できます。

### トークン引き換えリクエスト時

クライアントがトークン引き換えリクエストを行う際、クライアント認証情報を認可サーバに渡します。

認証情報の渡し方には 2 種類あります。

| 方式                  | 説明                 | 推奨度   |
| --------------------- | -------------------- | -------- |
| `client_secret_basic` | HTTP Basic 認証方式  | **推奨** |
| `client_secret_post`  | リクエストボディ方式 | 非推奨   |

### client_secret_basic（推奨）

`client_secret_basic` は、HTTP Basic 認証を使った方式です。

1. `client_id` と `client_secret` をコロン `:` で連結する
2. 連結した文字列を Base64 エンコードする
3. HTTP の `Authorization` ヘッダに `Basic {Base64エンコードした文字列}` を設定する

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=xxxxx
```

![](/images/07-client-registration/2025-12-02-15-31-54.png)

OAuth 2.0 の仕様である RFC 6749 では、この方式のサポートが必須とされています。

> 認可サーバーは, クライアントパスワードを発行されたクライアントの認証の為に HTTP Basic 認証スキームをサポートしなければならない (MUST)
>
> — [RFC 6749 Section 2.3.1](https://www.rfc-editor.org/rfc/rfc6749#section-2.3.1)

このように、クライアント認証を行うことで、認可サーバはトークン引き換えリクエストを送信してきたクライアントが正当なものであることを確認できます。

### client_secret_post（非推奨）

非推奨とされていますが、解説をしておきます。

`client_secret_post` は、リクエストボディに `client_id` と `client_secret` を含める方式です。

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=xxxxx&client_id=xxxxx&client_secret=xxxxx
```

この方式は非推奨とされているため、利用を避けましょう。

> 2 つのパラメーターを使ってクライアントクレデンシャルをリクエストボディーに含めることは推奨されていない (NOT RECOMMENDED). この方法は HTTP Basic 認証スキームが直接利用できないクライアントに限定すべきである (SHOULD)
>
> — [RFC 6749 Section 2.3.1](https://www.rfc-editor.org/rfc/rfc6749#section-2.3.1)

## まとめ

クライアント登録とクライアント認証は、OAuth フローにおいて重要なステップです。
クライアント認証を適切に実装することで、不正なクライアントによるアクセストークンの取得を防止できます。
次の章では、ここまでの内容を踏まえた上で実際の OAuth フローを見ていきます。

## 余談：共有シークレットでの認証のリスク

共有シークレット（`client_secret`）は、
通信を傍受された場合に漏洩するリスクがあります。

そのため、

- HMAC を用いた対称鍵署名 JWT (`client_secret_jwt`)
- 公開鍵暗号を用いた署名 JWT (`private_key_jwt`)
- mTLS クライアント証明書を用いた認証 (`tls_client_auth`/`self_signed_tls_client_auth`)

など、他のクライアント認証方式も存在します。
これらのクライアント認証方式については、応用編で解説します。

## 余談：Public Client の場合

Public Client では、`client_secret` を安全に保管できないため、クライアント認証を行いません。

Public Client の場合のセキュリティ対策については、後の章で解説します。

![](/images/07-client-registration/2025-12-02-15-34-59.png)

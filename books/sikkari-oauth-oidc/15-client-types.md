---
title: "クライアントの種類の違い"
---

## 概要

この章では、OAuth クライアントの種類の違いについて解説します。
この章から、今まで解説を後回しとしていた **Public Client** についても解説していきます。

## Confidential Client と Public Client の違い

RFC 6749 では、クライアントを以下の 2 種類に分類しています。

| クライアントタイプ      | 説明                                                       |
| ----------------------- | ---------------------------------------------------------- |
| **Confidential Client** | クレデンシャルの機密性を維持することができるクライアント   |
| **Public Client**       | クレデンシャルの機密性を維持することができないクライアント |

### 本来の定義

- **Confidential Client**

  - クライアントシークレットを安全に保管できるクライアント
  - 信頼できるクライアント認証が可能

- **Public Client**
  - クライアントシークレットを安全に保管できないクライアント
  - 信頼できるクライアント認証が不可能

![](/images/15-client-types/2025-12-21-17-54-51.png)

### 技術的な判断基準

技術的には、
クライアントが認可コードを用いて
**アクセストークンをリクエストした時**に、**どこで動作しているか**で判断できます。

- **Confidential Client**: サーバサイドで動作

  - クライアントシークレットをサーバに安全に保管できる
  - ユーザがシークレットにアクセスできない

- **Public Client**: ユーザーデバイス上で動作
  - ソースコードの解析でシークレットを取り出せる可能性がある
  - ユーザがシークレットにアクセスできてしまう

![](/images/15-client-types/2025-12-21-18-12-30.png)

## どのようなアプリケーションが該当するか

では、どのようなアプリケーションが Confidential Client、Public Client に該当するのでしょうか。
普段みかけるアプリケーションを分類してみましょう。

### MPA (Multi-Page Application) の場合

ここで言う MPA とは、サーバサイドで HTML をレンダリングして配信する従来型のウェブアプリケーションを指します。

- サーバサイドで HTML をレンダリングし、ブラウザに配信する特徴を持つ
- 例: Ruby on Rails、Django、Laravel など

この場合、アクセストークンリクエストはサーバサイドで行われるため、**Confidential Client** に該当します。

![](/images/15-client-types/2025-12-21-18-18-51.png)

### サーバ API のない SPA(Single-Page Application) / ネイティブアプリの場合

SPA やモバイルアプリのように、アクセストークンリクエストがユーザーデバイス上で行われる場合、**Public Client** に該当します。

- サーバ API を持たず、アプリケーションが直接 リソースにアクセスする
- SPA
  - 例: React、Vue、Angular など
- ネイティブアプリ
  - 例: iOS、Android、デスクトップアプリなど

※ SPA/ネイティブアプリの場合でもサーバ API を持つ場合は、
次のセクションで解説するように Confidential Client になる場合があります。

### サーバ API のある SPA / ネイティブアプリの場合

SPA + バックエンド API サーバ のような構成の場合、少し複雑になります。
この場合、二種類のパターンが考えられます。

**判断基準は、アクセストークンリクエストをどこで行うか**です。

| パターン                                      | クライアントタイプ  |
| --------------------------------------------- | ------------------- |
| SPA 側でトークンリクエスト                    | Public Client       |
| バックエンド API サーバ側でトークンリクエスト | Confidential Client |

```mermaid
graph TB
    subgraph "Public Client パターン"
        SPA1[SPA] --> AS1[認可サーバ]
        SPA1 --> API1[API サーバ]
    end

    subgraph "Confidential Client パターン"
        SPA2[SPA] --> API2[API サーバ]
        API2 --> AS2[認可サーバ]
    end
```

![](/images/15-client-types/2025-12-22-12-20-15.png)

### 推奨：可能な限り Confidential Client

Confidential Client の場合、
アクセストークンはサーバ間通信（バックチャネル）でやり取りされ
ユーザーデバイス上（フロントチャネル）に露出しません。

つまり、**ブラウザやモバイルアプリのようなユーザデバイスは**
**アクセストークンに触れられない**ため、セキュリティリスクを大幅に低減できます。

SPA やモバイルアプリの開発を行う場合でも、サーバ API が利用可能なのであれば、
可能な限りアクセストークンリクエストをサーバサイドで行い、
アクセストークンをユーザデバイス上に露出しないように気をつけ、Confidential Client として実装することを推奨します。

なお、Pubic Client として実装した場合に検証に不備があると、
なりすまし脆弱性が発生します。
この脆弱性については、この記事で詳しく解説しています。
難易度が高めですが、興味があればぜひご覧ください。
https://zenn.dev/calloc134/articles/oauth-cross-api-vuln-attack

## Public Client の特徴

### クライアント認証ができない

Public Client では、クライアントシークレットを安全に保管できません。
例えば、Public Client の場合、以下のようにすることでアプリ内部のシークレットを抽出することができます。
そしてシークレットが手に入れば、攻撃者はクライアントになりすますことができます。

- アクセストークンリクエストの通信をプロキシなどで解析し、`client_secret` を取得
- アプリケーションのバイナリやソースコードを解析し、`client_secret` を取得

これにより、クライアント認証を行っても信頼性が担保されません。

しかし Public Client はクライアントの実装がユーザーデバイス上に存在するため、
仕組み上リバースエンジニアリングが容易であり、これは防ぎようのない問題です。

そのため、Public Client は最初からクライアント認証を諦め、行わないことが前提となっています。

![](/images/15-client-types/2025-12-22-12-39-20.png)

トークンリクエスト時に `client_id` のみを送信し、`client_secret` は送信しません。

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback
&client_id=s6BhdRkqt3
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

### PKCE が必須

Public Client ではクライアント認証ができないため、PKCE による保護がより重要になります。

近年の仕様である OAuth 2.1 では、Public Client に対して PKCE が必須とされています。

## まとめ

- OAuth クライアントには **Confidential Client** と **Public Client** の 2 種類がある
- 判断基準は、クライアントシークレットを安全に保管できるかどうか
- 技術的には、トークンリクエスト時にサーバサイドで動作するかどうかで判断できる
- 可能な限り Confidential Client として実装することを推奨
- Public Client ではクライアント認証ができないため、PKCE が必須

次の章からは、Public Client 特有の攻撃と防御について解説します。

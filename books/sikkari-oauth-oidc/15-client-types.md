---
title: "クライアントの種類の違い"
---

## 概要

この章では、OAuth クライアントの種類の違いについて解説します。ここから、**Public Client** についても解説していきます。

## Confidential Client と Public Client の違い

RFC 6749 では、クライアントを以下の 2 種類に分類しています。

| クライアントタイプ      | 説明                                                       |
| ----------------------- | ---------------------------------------------------------- |
| **Confidential Client** | クレデンシャルの機密性を維持することができるクライアント   |
| **Public Client**       | クレデンシャルの機密性を維持することができないクライアント |

### 本来の定義

- **Confidential Client**

  - クライアントシークレットを安全に保管できるクライアント
  - クライアント認証が可能

- **Public Client**
  - クライアントシークレットを安全に保管できないクライアント
  - クライアント認証が不可能

### 技術的な判断基準

技術的には、**アクセストークン引き換えリクエスト時にどこで動作しているか**で判断できます。

- **Confidential Client**: サーバサイドで動作

  - クライアントシークレットをサーバに安全に保管できる
  - ユーザがシークレットにアクセスできない

- **Public Client**: ユーザーデバイス上で動作
  - ソースコードの解析でシークレットを取り出せる可能性がある
  - ユーザがシークレットにアクセスできてしまう

## どのようなアプリケーションが該当するか

### Confidential Client の例

- サーバサイドで動作する Web アプリケーション（Rails、Django など）
- サーバサイドで動作する API サーバ
- BFF（Backend For Frontend）パターンのバックエンド

### Public Client の例

- サーバ API のないシングルページアプリケーション（SPA）
- サーバ API のないネイティブモバイルアプリケーション（iOS、Android）
- サーバ API のないデスクトップアプリケーション

### サーバ API のあるアプリケーションの場合

SPA + バックエンド API サーバ のような構成の場合、少し複雑になります。

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
        SPA2[SPA] --> BFF[BFF]
        BFF --> AS2[認可サーバ]
        BFF --> API2[API サーバ]
    end
```

### 推奨：可能な限り Confidential Client

Confidential Client の場合、アクセストークンはサーバ間通信（バックチャネル）でやり取りされ、ユーザーデバイス上（フロントチャネル）に露出しません。

SPA やモバイルアプリの開発を行う場合でも、可能な限りアクセストークンリクエストをサーバサイドで行い、Confidential Client として実装することを推奨します。

## Public Client の特徴

### クライアント認証ができない

Public Client では、クライアントシークレットを安全に保管できないため、クライアント認証を行いません。

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

クライアント認証ができないため、PKCE による保護がより重要になります。

OAuth 2.1 では、Public Client に対して PKCE が必須とされています。

## まとめ

- OAuth クライアントには **Confidential Client** と **Public Client** の 2 種類がある
- 判断基準は、クライアントシークレットを安全に保管できるかどうか
- 技術的には、トークンリクエスト時にサーバサイドで動作するかどうかで判断できる
- 可能な限り Confidential Client として実装することを推奨

次の章からは、Public Client 特有の攻撃と防御について解説します。

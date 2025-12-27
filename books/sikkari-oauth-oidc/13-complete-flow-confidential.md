---
title: "ここまでの完全版コードフロー解説（Confidential Client）"
---

## 概要

ここまでの知識を踏まえて、**防御機構込みの完全版コードフロー**を解説します。

ここでは **Confidential Client** を前提とします。

## セキュリティ機構一覧

| 機構                  | 防御対象               | 検証主体     |
| --------------------- | ---------------------- | ------------ |
| redirect_uri 完全一致 | 認可コード奪取攻撃     | 認可サーバ   |
| PKCE                  | 認可コードすり替え攻撃 | 認可サーバ   |
| state                 | CSRF 攻撃              | クライアント |

## 完全版フローの流れ

```mermaid
sequenceDiagram
    participant RO as リソースオーナー
    participant C as クライアント
    participant AS as 認可サーバ

    RO->>C: リソースにアクセスしてほしい
    C->>C: code_verifier を生成<br>セッションに保存
    C->>C: code_challenge = hash(code_verifier)
    C->>C: state を生成<br>セッションに保存
    C->>RO: 認可サーバにリダイレクト
    RO->>AS: 認可リクエスト
    AS->>AS: redirect_uri の完全一致を検証
    AS->>AS: リソースオーナーを認証<br>リソース認可同意
    AS->>AS: 認可コード発行<br>code_challenge と紐付け
    AS->>RO: クライアントにリダイレクト
    RO->>C: 認可コード + state
    C->>C: セッションから state を取得<br>一致を検証
    C->>C: セッションから code_verifier を取得
    C->>AS: トークンリクエスト
    AS->>AS: クライアント認証
    AS->>AS: code_verifier をハッシュ化<br>code_challenge と比較検証
    AS->>AS: 認可コードを検証
    AS->>AS: アクセストークンを発行
    AS->>C: アクセストークン
```

## 詳細なパラメータ

### ステップ 1：フロー開始

リソースオーナーがクライアントにリクエストすると、クライアントは以下を行います。

1. `code_verifier`（ランダム文字列）を生成し、セッションに保存
2. `code_verifier` をハッシュ化して `code_challenge` を生成
3. `state`（ランダム文字列）を生成し、セッションに保存
4. リソースオーナーを認可サーバにリダイレクト

### ステップ 2：認可リクエスト

クライアントがリソースオーナーをリダイレクトさせる際のレスポンス：

```http
HTTP/1.1 302 Found
Location: https://authorization-server.example.com/oauth2/authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://client.example.com/callback
  &scope=read%20write
  &state=xyz123
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

| パラメータ              | 説明                             |
| ----------------------- | -------------------------------- |
| `response_type`         | `code`（認可コードフローを示す） |
| `client_id`             | クライアント識別子               |
| `redirect_uri`          | リダイレクト先 URI               |
| `scope`                 | リソースへのアクセス範囲         |
| `state`                 | CSRF 対策のランダム文字列        |
| `code_challenge`        | PKCE 用のハッシュ値              |
| `code_challenge_method` | `S256`（SHA-256 を示す）         |

### ステップ 3：認可サーバでの処理

認可サーバは以下を行います。

1. `redirect_uri` がクライアント登録時のものと完全一致するか検証
2. リソースオーナーを認証（ログイン画面）
3. 同意画面を表示
4. 認可コードを発行し、`code_challenge` と紐付けて保存

### ステップ 4：認可レスポンス

認可サーバがリソースオーナーをクライアントにリダイレクトさせる：

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=xyz123
```

| パラメータ | 説明                     |
| ---------- | ------------------------ |
| `code`     | 認可コード               |
| `state`    | 認可リクエスト時と同じ値 |

### ステップ 5：state の検証

クライアントは認可コードを受け取った後、**トークンリクエストを行う前に** state を検証します。

1. セッションから `state` を取得
2. 認可サーバから返された `state` と比較
3. 一致しなければエラー、一致すれば次へ

### ステップ 6：トークンリクエスト

state の検証が成功したら、クライアントはトークンリクエストを送信します。

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

| パラメータ      | 説明                                  |
| --------------- | ------------------------------------- |
| `grant_type`    | `authorization_code`                  |
| `code`          | 認可コード                            |
| `redirect_uri`  | 認可リクエスト時と同じ値              |
| `code_verifier` | PKCE 用のランダム文字列（ハッシュ前） |

また、`Authorization` ヘッダにはクライアント認証情報を含めます。

### ステップ 7：認可サーバでの検証

認可サーバは以下を検証します。

1. クライアント認証
2. `code_verifier` をハッシュ化し、保存した `code_challenge` と比較
3. 認可コードの有効性

### ステップ 8：トークンレスポンス

検証が成功すると、認可サーバはアクセストークンを返します。

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

## まとめ

ここまでの内容を踏まえ、防御機構込みの完全版コードフローを理解できました。

| セキュリティ機構      | 実装場所                     | 検証場所                             |
| --------------------- | ---------------------------- | ------------------------------------ |
| redirect_uri 完全一致 | クライアント登録時           | 認可サーバ（認可リクエスト時）       |
| PKCE                  | クライアント（フロー開始時） | 認可サーバ（トークンリクエスト時）   |
| state                 | クライアント（フロー開始時） | クライアント（認可コード受け取り時） |
| クライアント認証      | クライアント登録時           | 認可サーバ（トークンリクエスト時）   |

次の章では、リフレッシュトークンについて解説します。

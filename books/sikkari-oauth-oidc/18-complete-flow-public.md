---
title: "ここまでの完全版コードフロー解説（Public Clientでの差分）"
---

## 概要

この章では、Public Client における完全版コードフローを解説します。

## Confidential Client との差分

Public Client と Confidential Client の完全版フローの差分は、
実は**クライアント認証の有無のみ**です。

| 項目                      | Confidential Client | Public Client |
| ------------------------- | ------------------- | ------------- |
| redirect_uri 完全一致検証 | ○                   | ○             |
| PKCE                      | ○（推奨）           | ○（**必須**） |
| state                     | ○                   | ○             |
| クライアント認証          | ○                   | ×             |

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
    AS->>AS: リソースオーナーを認証
    AS->>AS: 認可コード発行<br>code_challenge と紐付け
    AS->>RO: クライアントにリダイレクト
    RO->>C: 認可コード + state
    C->>C: セッションから state を取得<br>一致を検証
    C->>C: セッションから code_verifier を取得
    C->>AS: トークンリクエスト<br>(クライアント認証なし)
    AS->>AS: code_verifier をハッシュ化<br>code_challenge と比較検証
    AS->>AS: 認可コードを検証
    AS->>AS: アクセストークンを発行
    AS->>C: アクセストークン
```

## 詳細なパラメータ

### 認可リクエスト

Confidential Client と同じです。

```http
GET /oauth2/authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://client.example.com/callback
  &scope=read%20write
  &state=xyz123
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

### 認可レスポンス

Confidential Client と同じです。

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=xyz123
```

### トークンリクエスト（差分あり）

**Confidential Client の場合**

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback // オプション
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**Public Client の場合**

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback // オプション
&client_id=s6BhdRkqt3
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

#### 差分のポイント

| 項目                   | Confidential Client   | Public Client    |
| ---------------------- | --------------------- | ---------------- |
| `Authorization` ヘッダ | `Basic {credentials}` | **なし**         |
| `client_id` パラメータ | ヘッダに含まれる      | **ボディに必須** |

- **Confidential Client**: `Authorization` ヘッダで `client_id` と `client_secret` を送信
- **Public Client**: `Authorization` ヘッダなし、`client_id` をボディパラメータとして送信

### トークンレスポンス

Confidential Client と同じです。

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

Public Client の完全版コードフローを理解しました。

- Confidential Client との差分は**クライアント認証の有無のみ**
  - トークンリクエスト時の `Authorization` ヘッダの削除
  - トークンリクエスト時の `client_id` パラメータの追加

| セキュリティ機構      | Confidential Client | Public Client |
| --------------------- | ------------------- | ------------- |
| redirect_uri 完全一致 | ○                   | ○             |
| PKCE                  | 推奨                | **必須**      |
| state                 | ○                   | ○             |
| クライアント認証      | ○                   | ×             |

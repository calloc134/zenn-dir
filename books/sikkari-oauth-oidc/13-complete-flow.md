---
title: "完全版コードフロー解説"
---

# 完全版コードフロー解説（Confidential Client）

この章では、ここまでの知識を元に、**防御機構を含めた完全版**の認可コードフローを解説します。

ここでは **Confidential Client** を前提とします。

## セキュリティ機構一覧

この完全版フローに含まれるセキュリティ機構：

| 機構                      | 目的                       | 検証する主体 |
| ------------------------- | -------------------------- | ------------ |
| redirect_uri 完全一致検証 | 認可コードの不正取得を防止 | 認可サーバ   |
| PKCE                      | 認可コードのすり替えを防止 | 認可サーバ   |
| state                     | CSRF 攻撃を防止            | クライアント |
| クライアント認証          | 不正なクライアントを排除   | 認可サーバ   |

## 完全版フロー図

```mermaid
sequenceDiagram
    participant RO as リソースオーナー
    participant Client as クライアント
    participant AS as 認可サーバ

    RO->>Client: ①リソースにアクセスしてほしい
    Client->>Client: ②code_verifier を生成してセッションに保存
    Client->>Client: ③code_verifier を SHA-256 でハッシュ化して code_challenge を生成
    Client->>Client: ④state を生成してセッションに保存
    Client->>RO: ⑤認可サーバへリダイレクト
    RO->>AS: ⑥認可リクエスト
    AS->>AS: ⑦redirect_uri を完全一致検証
    AS->>AS: ユーザ認証・同意画面
    AS->>AS: ⑧認可コード発行、code_challenge を紐付けて保存
    AS->>RO: ⑨認可レスポンス
    RO->>Client: ⑩認可コードと state を渡す
    Client->>Client: ⑪セッションの state と受け取った state を検証
    Client->>Client: ⑫セッションから code_verifier を取り出す
    Client->>AS: ⑬トークンリクエスト（クライアント認証 + 認可コード + code_verifier）
    AS->>AS: ⑭クライアント認証
    AS->>AS: ⑮code_verifier をハッシュ化して code_challenge と比較
    AS->>AS: ⑯認可コード検証
    AS->>AS: アクセストークン発行
    AS->>Client: ⑰トークンレスポンス
```

## ステップごとの詳細解説

### ① リソースオーナーがクライアントにリクエスト

ユーザがクライアントアプリケーションで「リソース連携」や「○○ でログイン」ボタンをクリックします。

### ②〜④ クライアントがセキュリティパラメータを生成

```
// PKCE 用
code_verifier = 生成したランダム文字列（43〜128文字）
code_challenge = BASE64URL(SHA256(code_verifier))
code_challenge_method = "S256"

// CSRF 対策用
state = 生成したランダム文字列
```

これらをセッションに保存します。

### ⑤ 認可サーバへリダイレクト

クライアントは、リソースオーナーを認可サーバにリダイレクトさせます。

**リダイレクトレスポンス例**：

```http
HTTP/1.1 302 Found
Location: https://authorization-server.example.com/oauth2/authorize
    ?response_type=code
    &client_id=CLIENT_ID
    &redirect_uri=https://client.example.com/callback
    &scope=photos.read
    &state=xyz123
    &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    &code_challenge_method=S256
```

| パラメータ              | 説明                        |
| ----------------------- | --------------------------- |
| `response_type`         | `code`（認可コードを取得）  |
| `client_id`             | クライアント識別子          |
| `redirect_uri`          | リダイレクト先 URI          |
| `scope`                 | リソースへのアクセス範囲    |
| `state`                 | CSRF 対策用のランダム文字列 |
| `code_challenge`        | PKCE 用のハッシュ値         |
| `code_challenge_method` | `S256`（SHA-256 を使用）    |

### ⑥ 認可リクエスト

リソースオーナーのブラウザが認可サーバにアクセスします。

### ⑦ redirect_uri 完全一致検証

認可サーバは、`redirect_uri` がクライアント登録時に登録されたものと**完全一致**するか検証します。

不一致の場合はエラーを返します。

### ⑧ 認可コード発行

認可サーバは以下を行います：

1. 認可コードを発行
2. `code_challenge` を認可コードに紐付けて保存
3. `state` はそのまま認可レスポンスに含める

### ⑨ 認可レスポンス

```http
HTTP/1.1 302 Found
Location: https://client.example.com/callback
    ?code=AUTHORIZATION_CODE
    &state=xyz123
```

### ⑩ 認可コードと state をクライアントに渡す

リダイレクトにより、認可コードと `state` がクライアントに渡されます。

### ⑪ state 検証

クライアントは、セッションに保存した `state` と受け取った `state` を比較検証します。

- **一致**：フローを継続
- **不一致**：エラーを返してフローを中断

### ⑫ code_verifier を取り出す

クライアントは、セッションから `code_verifier` を取り出します。

### ⑬ トークンリクエスト

```http
POST /oauth2/token HTTP/1.1
Host: authorization-server.example.com
Authorization: Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://client.example.com/callback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

| パラメータ      | 説明                     |
| --------------- | ------------------------ |
| `grant_type`    | `authorization_code`     |
| `code`          | 認可コード               |
| `redirect_uri`  | 認可リクエスト時と同じ値 |
| `code_verifier` | PKCE 用の元の値          |

クライアント認証は `Authorization` ヘッダで行います（`client_secret_basic` 方式）。

### ⑭ クライアント認証

認可サーバは、`Authorization` ヘッダのクライアント認証情報を検証します。

### ⑮ PKCE 検証

認可サーバは以下を行います：

1. 受け取った `code_verifier` を SHA-256 でハッシュ化
2. 認可コードに紐付けて保存していた `code_challenge` と比較
3. 不一致の場合はエラーを返す

### ⑯ 認可コード検証

認可サーバは、認可コードが有効か、期限切れでないか、既に使用されていないかを検証します。

### ⑰ トークンレスポンス

すべての検証に成功したら、アクセストークンを発行します。

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

## まとめ

完全版の認可コードフローには、以下のセキュリティ機構が含まれています：

| ステップ | セキュリティ機構          | 防ぐ攻撃             |
| -------- | ------------------------- | -------------------- |
| ⑦        | redirect_uri 完全一致検証 | 認可コードの不正取得 |
| ⑪        | state 検証                | CSRF 攻撃            |
| ⑭        | クライアント認証          | 不正なクライアント   |
| ⑮        | PKCE 検証                 | 認可コードのすり替え |

これらの防御機構を適切に実装することで、安全な OAuth フローを実現できます。

次の章では、リフレッシュトークンについて解説します。

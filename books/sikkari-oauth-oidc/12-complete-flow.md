---
title: "完全版のコードフロー解説"
---

# 完全版のコードフロー

これまでの章で学んだセキュリティ対策をすべて含んだ、完全版の認可コードフローを解説します。

| 事象             | 詳細             |
| ---------------- | ---------------- |
| フレームワーク   | OAuth2.0         |
| グラントタイプ   | 認可コードフロー |
| セキュリティ機構 | PKCE, state      |

# フロー全体図

```mermaid
sequenceDiagram
    participant リソースオーナー
    participant クライアント
    participant 認可サーバ

    リソースオーナー->>クライアント: リソースにアクセスしてほしい
    クライアント->>クライアント: code_verifier を生成してセッションに保存
    クライアント->>クライアント: code_verifier をハッシュ化して code_challenge を生成
    クライアント->>クライアント: state を生成してセッションに保存
    クライアント->>リソースオーナー: まずは認可コードを取ってきてくれ<br>(code_challenge やstateも渡す)
    リソースオーナー->>認可サーバ: 認可してください
    認可サーバ->>認可サーバ: リダイレクトURIが登録されたものか<br>完全一致で検証
    認可サーバ->>認可サーバ: 認可コード発行<br>code_challenge を紐付けて保存
    認可サーバ->>リソースオーナー: 認可しました
    リソースオーナー->>クライアント: 認可コードどうぞ
    クライアント->>クライアント: state をセッションから取得
    クライアント->>クライアント: state の一致を検証
    クライアント->>クライアント: code_verifier を取り出す
    クライアント->>認可サーバ: アクセストークンをください
    認可サーバ->>認可サーバ: code_verifier をハッシュ化して<br>code_challenge と比較検証
    認可サーバ->>認可サーバ: 認可コードを検証
    認可サーバ->>認可サーバ: アクセストークンを発行
    認可サーバ->>クライアント: アクセストークン
```

# 詳細な解説

## 1. フロー開始

リソースオーナーがクライアントに対し、「リソースにアクセスしてほしい」とリクエストします。

基本的には、リソース連携を行うボタンをクリックすることで、リソースオーナーがクライアントに対してリクエストを行い、次のステップに進みます。

## 2. PKCE と state の準備

クライアントは以下の処理を行います。

1. **code_verifier** を生成してセッションに保存
2. code_verifier をハッシュ化して **code_challenge** を生成
3. **state** を生成してセッションに保存

## 3. 認可リクエストへのリダイレクト

クライアントがリソースオーナーに対し、認可サーバへリダイレクトさせます。

```http
302 Found
Location: https://auth.example.com/oauth2/authorize
    ?response_type=code
    &client_id=s6BhdRkqt3
    &redirect_uri=https://client.example.com/callback
    &scope=read write
    &state=xyz123
    &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    &code_challenge_method=S256
```

### パラメータの説明

| パラメータ名          | 説明                                        |
| --------------------- | ------------------------------------------- |
| response_type         | `code`（認可コードを取得するための指定）    |
| client_id             | クライアント識別子                          |
| redirect_uri          | リダイレクト先 URI                          |
| scope                 | リソースへのアクセス範囲                    |
| state                 | CSRF 対策のためのランダム文字列             |
| code_challenge        | PKCE 用のランダム文字列のハッシュ           |
| code_challenge_method | `S256`（PKCE 用のハッシュ化方法 = SHA-256） |

## 4. 認可リクエスト

リソースオーナーが認可サーバにアクセスし、認可サーバに対して認可をリクエストします。

認可サーバは以下を検証します。

- **redirect_uri** がクライアント登録時に登録されたものと完全一致するか

その後、アクセス権を認めるかどうかを選択する画面が表示されます。

## 5. 認可レスポンス

認可サーバがリソースオーナーに対して認可コードと state を返し、クライアントにリダイレクトさせます。

```http
302 Found
Location: https://client.example.com/callback
    ?code=SplxlOBeZQQYbYS6WxSbIA
    &state=xyz123
```

### パラメータの説明

| パラメータ名 | 説明                            |
| ------------ | ------------------------------- |
| code         | 認可コード                      |
| state        | CSRF 対策のためのランダム文字列 |

## 6. 認可コードの受け取りと state の検証

リソースオーナーからクライアントに認可コードと state が渡されます。

クライアントは以下の検証を行います。

1. セッションから **state** を取得
2. リソースオーナーから渡された state とセッションの state が一致するか検証
3. 一致しない場合はエラーを返す

## 7. トークンリクエスト

クライアントが認可サーバに対してアクセストークンを要求します。

```http
POST /oauth2/token HTTP/1.1
Host: auth.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example.com/callback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

### パラメータの説明

| パラメータ名  | 説明                                           |
| ------------- | ---------------------------------------------- |
| grant_type    | `authorization_code`（認可コードフローを示す） |
| code          | 認可コード                                     |
| redirect_uri  | リダイレクト先 URI（認可リクエスト時と同じ）   |
| code_verifier | PKCE 用のランダムな文字列（ハッシュ化前）      |

Confidential Client の場合、`Authorization` ヘッダでクライアント認証を行います。

## 8. トークンレスポンス

認可サーバは以下の検証を行います。

1. **code_verifier** をハッシュ化し、保存されている **code_challenge** と比較
2. 認可コードが有効かどうか検証
3. クライアント認証（Confidential Client の場合）

すべての検証に成功すると、アクセストークンを発行します。

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

### パラメータの説明

| パラメータ名  | 説明                             |
| ------------- | -------------------------------- |
| access_token  | アクセストークン                 |
| token_type    | `Bearer`                         |
| expires_in    | アクセストークンの有効期限（秒） |
| refresh_token | リフレッシュトークン             |
| scope         | リソースへのアクセス範囲         |

# セキュリティ対策のまとめ

このフローで実装されているセキュリティ対策をまとめます。

| 攻撃                       | 対策                  | 検証タイミング       |
| -------------------------- | --------------------- | -------------------- |
| CSRF（認可コード押し付け） | state                 | 認可コード受け取り時 |
| リダイレクト URI 悪用      | redirect_uri 完全一致 | 認可リクエスト時     |
| 認可コードインジェクション | PKCE                  | トークンリクエスト時 |
| クライアント偽装           | クライアント認証      | トークンリクエスト時 |

# おわりに

これで、OAuth の認可コードフローについて一通り解説しました。

このフローを理解することで、OAuth を利用したサービスの実装や、セキュリティ上の問題点を理解することができるようになります。

次のステップとしては、OIDC（OpenID Connect）について学ぶことをおすすめします。OIDC は OAuth をベースにした認証のための仕様であり、OAuth の知識があれば理解しやすいでしょう。

参考リンク
https://qiita.com/TakahikoKawasaki/items/200951e5b5929f840a1f
https://moneyforward-dev.jp/entry/2022/12/01/authorization-code-grant-flow/
https://booth.pm/ja/items/1877818

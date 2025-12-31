---
title: "OIDC完全版コードフロー解説"
free: true
---

## 概要

この章では、これまでの知識を踏まえて、**OIDC の完全版コードフロー**を解説します。
OAuth 2.0 の防御機構に加えて、OIDC 固有の要素がどのように組み込まれるかを見ていきましょう。

ここでは **Confidential Client** を前提とします。

## セキュリティ機構一覧

OIDC の認可コードフローでは、OAuth 2.0 と同様のセキュリティ機構に加え、ID トークンの検証が行われます。

| 機構                  | 防御対象               | 検証主体        |
| --------------------- | ---------------------- | --------------- |
| redirect_uri 完全一致 | 認可コード奪取攻撃     | OpenID Provider |
| PKCE                  | 認可コードすり替え攻撃 | OpenID Provider |
| state                 | CSRF 攻撃              | Relying Party   |

## 完全版フローの流れ

```mermaid
sequenceDiagram
    participant EU as エンドユーザ
    participant RP as Relying Party
    participant OP as OpenID Provider

    EU->>RP: ログインしたい
    RP->>RP: code_verifier を生成<br>セッションに保存
    RP->>RP: code_challenge = hash(code_verifier)
    RP->>RP: state を生成<br>セッションに保存
    RP->>EU: OP にリダイレクト
    EU->>OP: 認可リクエスト（scope=openid）
    OP->>OP: redirect_uri の完全一致を検証
    OP->>OP: エンドユーザを認証<br>ログイン連携同意
    OP->>OP: 認可コード発行<br>code_challenge と紐付け
    OP->>EU: RP にリダイレクト
    EU->>RP: 認可コード + state
    RP->>RP: セッションから state を取得<br>一致を検証
    RP->>RP: セッションから code_verifier を取得
    RP->>OP: トークンリクエスト
    OP->>OP: クライアント認証
    OP->>OP: code_verifier をハッシュ化<br>code_challenge と比較検証
    OP->>OP: 認可コードを検証
    OP->>OP: ID トークン + アクセストークンを発行
    OP->>RP: ID トークン + アクセストークン
    RP->>RP: ID トークンを検証<br>（署名, iss, aud, exp）
    RP->>RP: ユーザを認証、セッション開始
```

## 詳細なパラメータ

### ステップ 1：フロー開始

エンドユーザが Relying Party にリクエストすると、RP は以下を行います。

1. `code_verifier`（ランダム文字列）を生成し、セッションに保存
2. `code_verifier` をハッシュ化して `code_challenge` を生成
3. `state`（ランダム文字列）を生成し、セッションに保存
4. エンドユーザを OpenID Provider にリダイレクト

### ステップ 2：認可リクエスト

RP がエンドユーザをリダイレクトさせる際のレスポンス：

```http
HTTP/1.1 302 Found
Location: https://op.example.com/authorize
  ?response_type=code
  &client_id=s6BhdRkqt3
  &redirect_uri=https://rp.example.com/callback
  &scope=openid%20profile%20email%20offline_access
  &state=xyz123
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

| パラメータ              | 説明                                 |
| ----------------------- | ------------------------------------ |
| `response_type`         | `code`（認可コードフローを示す）     |
| `client_id`             | クライアント識別子                   |
| `redirect_uri`          | リダイレクト先 URI                   |
| `scope`                 | **`openid` を含める**（OIDC の要件） |
| `state`                 | CSRF 対策のランダム文字列            |
| `code_challenge`        | PKCE 用のハッシュ値                  |
| `code_challenge_method` | `S256`（SHA-256 を示す）             |

#### スコープについて

OIDC では、`scope` パラメータに **`openid`** を含める必要があります。
これにより OP はこのリクエストが OIDC のリクエストであることを認識し、
ID トークンを発行します。

```
scope=openid profile email
```

追加のスコープ（`profile`, `email` など）を指定することで、
UserInfo Endpoint から追加の情報を取得できます。

また、ここでは`offline_access` スコープを指定しています。
これにより、OP はリフレッシュトークンも発行するようになります。

### ステップ 3：OpenID Provider での処理

OpenID Provider は以下を行います。

1. `redirect_uri` がクライアント登録時のものと完全一致するか検証
2. エンドユーザを認証（ログイン画面）
3. 同意画面を表示
4. 認可コードを発行し、`code_challenge` と紐づけて保存

### ステップ 4：認可レスポンス

OpenID Provider がエンドユーザを RP にリダイレクトさせる：

```http
HTTP/1.1 302 Found
Location: https://rp.example.com/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=xyz123
```

| パラメータ | 説明                     |
| ---------- | ------------------------ |
| `code`     | 認可コード               |
| `state`    | 認可リクエスト時と同じ値 |

### ステップ 5：state の検証

RP は認可コードを受け取った後、**トークンリクエストを行う前に** state を検証します。

1. セッションから `state` を取得
2. OP から返された `state` と比較
3. 一致しなければエラー、一致すれば次へ

### ステップ 6：トークンリクエスト

state の検証が成功したら、RP はトークンリクエストを送信します。

```http
POST /token HTTP/1.1
Host: op.example.com
Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://rp.example.com/callback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

| パラメータ      | 説明                                  |
| --------------- | ------------------------------------- |
| `grant_type`    | `authorization_code`                  |
| `code`          | 認可コード                            |
| `redirect_uri`  | 認可リクエスト時と同じ値              |
| `code_verifier` | PKCE 用のランダム文字列（ハッシュ前） |

また、`Authorization` ヘッダにはクライアント認証情報を含めます。

### ステップ 7：OpenID Provider での検証

OpenID Provider は以下を検証します。

1. クライアント認証
2. `code_verifier` をハッシュ化し、保存した `code_challenge` と比較
3. 認可コードの有効性

### ステップ 8：トークンレスポンス

検証が成功すると、OP は **ID トークン** と **アクセストークン** を返します。

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Pragma: no-cache

{
  "access_token": "SlAV32hkKG",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29wnLmV4YW1wbGUuY29tIiwic3ViIjoidXNlci0xMjM0NSIsImF1ZCI6InM2QmhkUmtxdDMiLCJleHAiOjE3MzUwODQ4MDAsImlhdCI6MTczNTA4MTIwMCwibm9uY2UiOiJuLTBTNl9XekEyTWoifQ.signature..."
}
```

OAuth 2.0 との違いとして、レスポンスに **`id_token`** が含まれます。

### ステップ 9：ID トークンの検証

RP は受け取った ID トークンを検証します。

> The Client MUST validate the ID Token in the Token Response.
>
> — [OpenID Connect Core 1.0 Section 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)

#### 検証項目

| 検証項目   | 説明                                      |
| ---------- | ----------------------------------------- |
| 署名検証   | OP の公開鍵を用いて署名が正しいことを確認 |
| `iss` 検証 | 発行者が期待する OP と一致するか確認      |
| `aud` 検証 | 自分の `client_id` が含まれているか確認   |
| `exp` 検証 | 有効期限が切れていないか確認              |
| `iat` 検証 | 発行時刻が許容範囲内か確認                |

:::message

`aud`が複数存在している場合、`azp`（Authorized Party）クレームの検証も必要です。
この実装は応用編で解説するため、省略します。

:::

##### 署名検証

ID トークンの署名を、OP が公開する公開鍵を用いて検証します。
署名が正しくなければ、ID トークンは改ざんされている可能性があります。

##### `iss`（Issuer）検証

```json
"iss": "https://op.example.com"
```

ID トークンの発行者が、期待する OpenID Provider と一致することを確認します。

##### `aud`（Audience）検証

```json
"aud": "s6BhdRkqt3"
```

ID トークンの受信者に、自分の `client_id` が含まれていることを確認します。
これにより、他のクライアント向けに発行された ID トークンを誤って受け入れることを防ぎます。

##### `exp`（Expiration Time）検証

```json
"exp": 1735084800
```

現在時刻が有効期限を過ぎていないことを確認します。

### ステップ 10：ユーザ認証とセッション開始

ID トークンの検証がすべて成功したら、
RP はエンドユーザを認証し、セッションを開始します。

ID トークンの `sub` クレームを用いて、ユーザを一意に識別できます。

## Public Client との差分

Public Client の場合、OAuth 2.0 と同様に **クライアント認証がない** という点が異なります。
トークンリクエスト時に `Authorization` ヘッダの代わりに `client_id` をボディパラメータとして送信します。

```http
POST /token HTTP/1.1
Host: op.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://rp.example.com/callback
&client_id=s6BhdRkqt3
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

また、Public Client では **PKCE が必須** となります。

## まとめ

OIDC の完全版コードフローを解説しました。

| セキュリティ機構      | 実装場所           | 検証場所                           |
| --------------------- | ------------------ | ---------------------------------- |
| redirect_uri 完全一致 | クライアント登録時 | OP（認可リクエスト時）             |
| PKCE                  | RP（フロー開始時） | OP（トークンリクエスト時）         |
| state                 | RP（フロー開始時） | RP（認可コード受け取り時）         |
| クライアント認証      | クライアント登録時 | OP（トークンリクエスト時）         |
| ID トークン検証       | ID トークン受取時  | RP（トークンレスポンス受け取り時） |

- **OAuth 2.0 のセキュリティ機構に加え、OIDC 固有の要素が追加**
  - `scope=openid` の指定
  - ID トークンの発行と検証
- **ID トークンの検証は RP の責務**
  - 署名、iss、aud、exp を検証
- **検証に成功したら、ユーザを認証してセッションを開始**

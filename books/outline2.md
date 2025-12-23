# OpenID Connect/ 応用編構想

### OpenID Connect

- OIDC と 必要な概念

  - OIDC は OAuth の上に載るアイデンティティ層

- ID トークンの解説
  - ID トークンとは
    - ユーザのプロフィール情報を含む署名付きトークン
  - OIDC では、リソースのアクセスではなく
    - ID トークンを RP が"検証して"
    - 検証に成功 → ユーザを認証する
    - ユーザ認証が目的である点を強調
  - アクセストークンと ID トークンの意図の違い
    - アクセストークン
      - 目的 → リソースへのアクセス、認可
      - 現実の概念 → 鍵
      - 検証の主体 → リソースサーバ
      - 運用 → クライアントが保持し続ける
      - 必要に応じてリフレッシュ
    - ID トークン
      - 目的 → ユーザ認証
      - 現実の概念 → 証明書
      - 検証の主体 →Relying Party(RP)
      - 運用 → 検証してセッションを開始したら破棄してよい
      - セッションを開始するための検証材料
-

- JWT 関連仕様 の解説

  - JWT 自体の仕様
    - JWT = Json Web Token
    - データを JSON 形式で表現し、
    - 署名や暗号化で保護しコンパクトに表現する仕様
  - JWS/JWE について
    - JWS = Json Web Signature
      - データに対して改ざん検知の仕組みを提供する仕様
    - JWE = Json Web Encryption
      - データに対して暗号化を行い
      - 機密性を提供する仕様
    - JWS/JWE はそれぞれ
      - データを含める部分が存在する
        - JWS: ペイロード部分
        - JWE: プレインテキスト部分
    - JWS/JWE にはシリアライズ(表現方法)が複数ある
      - Compact Serialization
        - URL に載せやすいコンパクトな表現
      - JSON Serialization
        - JSON 形式で柔軟に表現できる
    - JWT は、データが内部に含まれた
    - Compact Serialization 形 の
    - JWS か JWE であると定義されている
  - JWS について
    - ペイロード部分に任意のデータを含められる
    - 今回はCompact Serialization 形 のみ解説する
    - 3つの部分から構成される
      - ヘッダ部分
        - 署名アルゴリズムなどのメタデータを含む
      - ペイロード部分
        - 任意のデータを含める部分
      - 署名部分
        - 生成した署名やMACを含む部分
      - 3つの部分はそれぞれ
        - Base64Url エンコードされ、
        - ピリオド(.)で連結される
        - `Base64Url(ヘッダ) . Base64Url(ペイロード) . Base64Url(署名)`
      - 
    - 改ざん検知の仕組みは以下の通り
      - MAC: 対称鍵暗号方式
        - JWS 作成者と検証者が同じ必要がある
      - デジタル署名: 非対称鍵暗号方式
        - JWS 作成者と検証者が異なってもよい
        - 基本的にこちらが推奨される
  - JWE について
    - 任意のデータ = プレインテキスト を
      - 暗号化して Ciphertext とし、
      - それを含めることが出来る
    - 暗号化の仕組みは以下の通り
      - 対称鍵暗号方式
    - 今回はあまり深入りしないことに
  -  JWK, JWK Set の概要 
    - JWK = Json Web Key
      - 公開鍵や共有シークレットを JSON 形式で表現する仕様
    - JWK Set
      - 複数の JWK をまとめて表現する仕様
  - JWKS URI の概要

- ID トークンについての掘り下げ

  - ID トークンの構造(JWT)
    - 何らかの対象についての情報を JSON として表現し
    - 署名・暗号化を付与して
    - コンパクトに表現したもの
    - 仕様も含めて解説
    - 暗号化しない場合 →JWS Compact
    - 暗号化する場合 →JWE Compact で JWS Compact を内包
  - ID トークンとアクセストークンの違い
    - アクセストークンはリソースサーバのために発行される
      - アクセストークンはクライアントが解釈するものではないことを強調
    - ID トークンは Relying Party(RP) のために発行される
    - ID トークンはクレデンシャルだとは考えない
      - フロントチャネルに露出しても
      - アクセストークンよりは危険度が少ない
      - (避けるべきだけど)

- OIDC 登場人物

  - OAuth のロールを OIDC にマッピング
    - リソースオーナー -> エンドユーザ
    - クライアント -> Relying Party(RP)
    - 認可サーバ -> OpenID Provider(OP)
    - リソースサーバ -> UserInfo Endpoint
      - UserInfo Endpoint は
      - OIDC 仕様の中ではあるが
      - リソースとして認可の対象であることを強調

- OIDC 簡易フロー
  (ここでは認可コードフロー)

  - プロフィール API との比較
    - プロフィール API の一部分を userinfo/ に切り出し、
    - 信頼できるユーザ情報については ID トークンで提供する

- OAuth + プロフィール API による疑似認証の問題点
  - 後で記述
- OIDC を活用するマインドセット

  - ID トークンは出来るだけ短命
    - セッションを開始する上での検証材料なだけ
    - セッションはサーバで確立・管理する
  - OIDC 内の認証らしさ・認可らしさ
    - ID トークン ⇒ 認証
    - /userinfo ⇒ 認可
    - ID トークンのみで十分なこともある

- OIDC 完全コードフロー解説

### 応用編

- OIDC と OAuth 2.0 の策定の歴史的経緯
- OAuth におけるアクセストークン規定の仕様
  - Bearer によるアクセストークン
  - JWT アクセストークン
- クライアント認証の種類
  - 大きく 3 つに区分
  - 共有シークレット方式
    - client_secret_basic (解説済み)
    - client_secret_jwt
  - 公開鍵証明書方式
    - private_key_jwt
  - クライアント証明書方式
    - tls_client_auth
    - self_signed_tls_client_auth
- OAuth/OIDC における Discovery の仕組み
- OAuth/OIDC における動的クライアント登録の仕組み
- sender-constrained token の仕組み
  - MTLS-bound token
  - DPoP-bound token
  - それぞれの特徴と使い分け
    - MTLS-bound token を利用すると
    - クライアント認証もこれ一つで済む
- OIDC における implicit flow/hybrid flow とその安全性評価
  - nonce パラメータ
- OIDC におけるログアウトの仕組み
  - Session Management 1.0
  - RP-Initiated Logout 1.0
  - Front-Channel Logout 1.0
  - Back-Channel Logout 1.0
- 認可リクエスト・レスポンスの保護
  - JAR RFC 9101
  - PAR RFC 9126
  - JARM RFC
- 高保証プロファイル FAPI
  - FAPI 2.0 Security Profile

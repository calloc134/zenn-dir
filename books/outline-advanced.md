# 応用編

## JWS の構成要素

- 概要
  - 前章で説明した JWS の概要を解説することを説明
- JWS について
  - ペイロード部分に任意のデータを含められる
  - 今回は Compact Serialization 形 のみ解説する
- 構成要素
  - ヘッダ部分、ペイロード部分、署名部分
    - それぞれの部分が Base64Url エンコードされ、
    - ピリオド(.)で連結される
    - `Base64Url(ヘッダ) . Base64Url(ペイロード) . Base64Url(署名)`
  - ヘッダ部分
    - JOSE Header と呼ばれる
    - 署名アルゴリズムなどのメタデータを含む
    - JSON 形式で表現される
    - 必須のパラメータ
      - `alg`: 署名アルゴリズム
    - その他は任意のパラメータ
      - ID トークンでよく使われるパラメータについては
      - また後ほど解説
    - JSON を Base64Url エンコードしたものが
      - ヘッダ部分として含まれる
  - ペイロード部分
    - 任意のデータを含める部分
    - 任意のバイト列であればよいが、
    - JWT の場合は JSON 形式で表現される
    - JWS 仕様上は必須のパラメータはない
    - JWT の場合、予約済み
      - = ある特定の意図を持って利用する必要のある
      - パラメータは存在する
    - ID トークンでよく使われるパラメータについては
      - また後ほど解説
    - こちらも JSON を Base64Url エンコードしたものが
      - ペイロード部分として含まれる
  - 署名部分
    - 生成した署名や MAC を含む部分
    - 署名の値の計算は以下の通り
      - 署名対象データ = `Base64Url(ヘッダ) . Base64Url(ペイロード)`
      - これに対する署名を Base64Url エンコードしたものが
      - 署名部分として含まれる
- 署名の詳しいアルゴリズムについて
  - 改ざん検知の仕組みは以下の通り
  - MAC: 対称鍵方式
    - JWS 作成者と検証者が同じ必要がある
  - デジタル署名: 非対称鍵方式
    - JWS 作成者と検証者が異なってもよい
  - 代表的なアルゴリズム
    - HMAC using SHA-256 (HS256)
      - 対称鍵方式
    - RSASSA-PKCS1-v1_5 using SHA-256 (RS256)
      - 非対称鍵方式
    - ECDSA using P-256 and SHA-256 (ES256)
      - 非対称鍵方式
- まとめ
  - JWS は改ざん検知の仕組みを提供する
  - ヘッダ、ペイロード、署名の 3 部分で構成される
  - 署名アルゴリズムには対称鍵暗号方式と非対称鍵暗号方式がある

## その他の JWT 関連仕様について

- 概要
  - JWS 以外の JWT 関連仕様について解説することを説明
  - OIDC にあまり関係ない部分もあるので深入りせず
- - JWE について
    - 任意のデータ = プレインテキスト を
      - 暗号化して Ciphertext とし、
      - それを含めることが出来る
    - 暗号化の仕組みは以下の通り
      - 対称鍵暗号方式
- JWK, JWK Set の概要

  - JWK = Json Web Key
    - 公開鍵や共有シークレットを
    - JSON 形式で表現する仕様
  - JWK Set
    - 複数の JWK をまとめて表現する仕様
  - JWKS URI の概要

## OAuth によるプロフィール API 疑似認証と問題点

- プロフィール API の一部分を userinfo/ に切り出し、
- 信頼できるユーザ情報については ID トークンで提供する

## OIDC と OAuth 2.0 の策定の歴史的経緯

## JWT の関連仕様

- Nested JWT

## OAuth におけるアクセストークン規定の仕様

- Bearer によるアクセストークン
- JWT アクセストークン

## クライアント認証の種類

- 大きく 3 つに区分
- 共有シークレット方式
  - client_secret_basic (解説済み)
  - client_secret_jwt
- 公開鍵証明書方式
  - private_key_jwt
- クライアント証明書方式
  - tls_client_auth
  - self_signed_tls_client_auth

## OAuth/OIDC における Discovery の仕組み

## OAuth/OIDC における動的クライアント登録の仕組み

## sender-constrained token の仕組み

- MTLS-bound token
- DPoP-bound token
- それぞれの特徴と使い分け
  - MTLS-bound token を利用すると
  - クライアント認証もこれ一つで済む

## OIDC における implicit flow/hybrid flow とその安全性評価

- nonce パラメータ

## OIDC におけるログアウトの仕組み

- Session Management 1.0
- RP-Initiated Logout 1.0
- Front-Channel Logout 1.0
- Back-Channel Logout 1.0

## 認可リクエスト・レスポンスの保護

- JAR RFC 9101
- PAR RFC 9126
- JARM RFC
-

## 高保証プロファイル FAPI

- FAPI 2.0 Security Profile

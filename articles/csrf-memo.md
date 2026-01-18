---
title: "SPA + API 環境におけるCSRF対策メモ"
emoji: "📌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: []
published: false
---

CSRF攻撃対策について、以下のメモを作成しています。
ファクトチェックしてください。

# 大前提

- データを変更するAPI (副作用あり) と データを取得するAPI (副作用なし) で メソッドを分離する
  - API 設計の段階で考慮する
  - データを変更するAPI (副作用あり)
    - POST, PUT, DELETE など
    - これらのメソッドは unsafe methods と呼ばれる
  - データを取得するAPI (副作用なし)
    - GET, HEAD, OPTIONS など
    - これらのメソッドは safe methods と呼ばれる

# 別ドメイン SPA + JSONAPI の場合のCSRF対策

- 原則
  - APIにはクッキーを含めて送信する必要がある
  - クッキー
    - SameSite=None
    - HttpOnly
    - Secure
  - 別ドメイン
    - 別オリジン
    - 別サイト
  - CORS
    - fetch API において クレデンシャルを含める設定を許容する
      - fetch API の `credentials` パラメータを `include` に設定するオプションを許可する
      - `Access-Control-Allow-Credentials` を `true` に設定
    - フロントエンド オリジンのみ許可
      - `Access-Control-Allow-Origin` を フロントエンドのオリジンに設定
- SPA と API が 別ドメインなので
  - クッキーの防御機構は利用できない
  - そもそもクッキーの防御機構は CSRF攻撃においては副次的な防御機構である
  - より本質的な対策が必要

## 別ドメインからの CSRF 攻撃

- unsafe methods(副作用あり) な JSON API に対する CSRF攻撃
  - Origin検証 (API側)
    - Origin ヘッダは 別ドメインの場合は 別オリジンなので 基本送信される
    - API は クライアントから送信された Origin ヘッダを検証し
    - 許可されたオリジンからのリクエストのみを受け入れる
  - CORSポリシーにオリジンが含まれるか (ブラウザ側)
    - CORSポリシーを適切に設定することで ブラウザがリクエストの送信をブロックしてくれる
    - unsafe method の場合、本リクエストを送信する前に プリフライトリクエストが送信される
      - 本リクエスト送信前に ブラウザが CORSポリシーを確認するために プリフライトリクエストを送信する
      - プリフライトリクエストは OPTIONS メソッドで送信される
      - プリフライトリクエストに対するレスポンスに CORSポリシーが含まれる
    - 処理の流れ
      - 1. ブラウザの JavaScriptが fetch APIを用いて unsafe method のリクエストを送信しようとする
      - 2. ブラウザがプリフライトリクエストを送信
        - OPTIONS メソッド
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
        - `Access-Control-Allow-Origin` ヘッダを確認
      - 5. オリジンが含まれない場合 送信をブロックし その時点で fetch API がエラーを返す
  - 余談: CORS ポリシーのオリジン設定 最低限制約
    - `Access-Control-Allow-Origin` ヘッダに ワイルドカード `*` を設定している場合
    - `Access-Control-Allow-Credentials` ヘッダが `true` に設定されていても
    - ブラウザはクレデンシャルを含めてリクエストを送信せず すべてエラーにする
    - 処理の流れ
      - 1. ブラウザの JavaScriptが fetch APIを用いて unsafe method のリクエストを送信しようとする
      - 2. ブラウザがプリフライトリクエストを送信
        - OPTIONS メソッド
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーが制約に違反しているかをチェック
        - オリジンが`*` かつ `Access-Control-Allow-Credentials` ヘッダが `true` であるかをチェック
      - 5. 両立する場合 送信をブロックし その時点で fetch API がエラーを返す
- safe methods(副作用なし) な JSON API に対する CSRF攻撃
  - Origin検証 (API側)
    - Origin ヘッダは 別ドメインの場合は 別オリジンなので 基本送信される
    - API は クライアントから送信された Origin ヘッダを検証し
    - 許可されたオリジンからのリクエストのみを受け入れる
    - JSONAPI によるCSRF 副作用ありの場合と同じ
  - CORSポリシーにオリジンが含まれるか (ブラウザ側)
    - そもそもの疎通をブロック
    - 処理の流れ
      - 1. JavaScriptが fetch APIを用いて safe method のリクエストを送信しようとする
      - 2. ブラウザがリクエストを送信
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
        - `Access-Control-Allow-Origin` ヘッダを確認
      - 5. オリジンが含まれない場合 レスポンスがJavaScriptに渡されず その時点で fetch API がエラーを返す
  - 余談: CORS ポリシーのオリジン設定 最低限制約
    - `Access-Control-Allow-Origin` ヘッダに ワイルドカード `*` を設定している場合
    - `Access-Control-Allow-Credentials` ヘッダが `true` に設定されていても
    - ブラウザはクレデンシャルを含めてリクエストを送信せず すべてエラーにする
    - 処理の流れ
      - 1. JavaScriptが fetch APIを用いて safe method のリクエストを送信しようとする
      - 2. ブラウザがリクエストを送信
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーが制約に違反しているかをチェック
        - オリジンが`*` かつ `Access-Control-Allow-Credentials` ヘッダが `true` であるかをチェック
      - 5. 両立する場合 レスポンスがJavaScriptに渡されず その時点で fetch API がエラーを返す
- フォーム送信によるCSRF攻撃
  - Origin検証 (API側)
    - Origin ヘッダは 別ドメインの場合は送信される
    - JSONAPIによるCSRF 副作用ありの場合と同じ
  - application/json 以外のContent-Type の拒否 (API側)
    - フォーム送信は 以下のContent-Type になる
      - `application/x-www-form-urlencoded`
      - `multipart/form-data`
      - `text/plain`
    - したがってAPIでは これらの Content-Type のリクエストを拒否する
    - API は `application/json` のみを許可する
  - 余談: CORSポリシーは関係ない
    - フォーム送信は ブラウザのネイティブ機能であり simple request に分類されるため
    - ブラウザは CORSポリシーを確認せず 直接リクエストを送信する
    - そのため CORSポリシーでは フォーム送信によるCSRF攻撃を防止できない
  - 余談: CORSにおける `Access-Control-Allow-Credentials` は関係ない
    - このパラメータは fetch API などの JavaScript によるリクエスト送信にのみ影響するため フォーム送信には影響しない
    - そのため `Access-Control-Allow-Credentials` では フォーム送信によるCSRF攻撃を防止できない

# 同一ドメイン SPA + JSONAPI の場合のCSRF対策

- 原則
  - APIにはクッキーを含めて送信する必要がある
  - クッキー
    - SameSite=Lax
    - HttpOnly
    - Secure
  - 同一ドメイン
    - 同一オリジン
    - 同一サイト
  - CORS
    - credentials include
    - フロントエンド オリジンのみ許可
- JSONAPI によるCSRF 副作用あり
  - CORS ポリシーがなく厳密に管理されており
  - また SameSite=Lax により クロスサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - ただし多重防御を考えるのであれば 以下を追加してもよい
    - Origin検証
      - Origin ヘッダは 同一ドメインの場合は同一オリジンだが
      - unsafe methods (POST, PUT, DELETE など) の場合は基本送信される
- JSONAPI によるCSRF 副作用なし
  - CORS ポリシーがなく厳密に管理されており
  - また SameSite=Lax により クロスサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - Origin ヘッダは 同一ドメインの場合は同一オリジンであり
    - さらに safe methodの場合 Origin ヘッダが送信されないことがある
    - そのため検証は不要
    - 副作用ありのAPIと合わせて「Originヘッダがあれば検証する」という運用にしてもよい
- フォームによるCSRF 副作用あり
  - SameSite=Lax により クロスサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - ただし多重防御を考えるのであれば 以下を追加してもよい
    - Origin検証 (API側)
      - Origin ヘッダは 同一ドメインの場合は基本送信される
    - application/json 以外のContent-Type の拒否 (API側)
      - フォーム送信は application/x-www-form-urlencoded または multipart/form-data になる
  -

# サブドメイン SPA + JSONAPI の場合のCSRF対策

- 基本的には 別ドメイン と同じ対策を行う
- 同一サイトとなったため クッキーに変更を加える
- クッキー
  - SameSite=Lax

- JSONAPIによるCSRF 副作用あり
  - Origin検証 (API側)
    - Origin ヘッダは サブドメインの場合は 別オリジンなので
    - 基本送信される
  - CORSポリシーにオリジンが含まれるか (ブラウザ側)
    - プリフライトリクエストで送信をブロック
    - 処理の流れ
      - 1. ブラウザがプリフライトリクエストを送信
      - 2. サーバーがCORSポリシーを含むレスポンスを返す
      - 3. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
      - 4. オリジンが含まれない場合 送信をブロック
  - CORSポリシーのオリジンが`*` の場合 credentials include でないか (ブラウザ側)
    - `*` と credentials include が両立する場合 送信をブロック
    - 処理の流れ
      - 1. ブラウザがプリフライトリクエストを送信
      - 2. サーバーがCORSポリシーを含むレスポンスを返す
      - 3. ブラウザがレスポンスを確認し オリジンが`*` かつ credentials include であるかをチェック
      - 4. 両立する場合 送信をブロック
- JSONAPI によるCSRF 副作用なし
  - Origin検証 (API側)
    - Origin ヘッダは サブドメインの 場合は 別オリジンなので
    - 基本送信される
    - JSONAPI によるCSRF 副作用ありの場合と同じ
  - CORSポリシーにオリジンが含まれるか (ブラウザ側)
    - そもそもの疎通をブロック
    - 処理の流れ
      - 1. ブラウザがリクエストを送信
      - 2. サーバーがCORSポリシーを含むレスポンスを返す
      - 3. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
      - 4. オリジンが含まれない場合 レスポンスがアプリケーションに渡されず 疎通をブロック
  - CORSポリシーのオリジンが`*` の場合 credentials include でないか (ブラウザ側)
    - `*` と credentials include が両立する場合 疎通をブロック
    - 処理の流れ
      - 1. ブラウザがリクエストを送信
      - 2. サーバーがCORSポリシーを含むレスポンスを返す
      - 3. ブラウザがレスポンスを確認し オリジンが`*` かつ credentials include であるかをチェック
      - 4. 両立する場合 レスポンスがアプリケーションに渡されず 疎通をブロック
- フォームによるCSRF 副作用あり
  - SameSite=Lax だが サブドメインは同一サイトとなるため対策が必要
  - 別ドメインの フォームによるCSRF 副作用あり と同じ対策を行う

(ここに内容を記述)

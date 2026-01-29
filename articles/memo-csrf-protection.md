---
title: "SPA + API 環境におけるCSRF対策メモ"
emoji: "📌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: []
published: false
---

CSRF・XS-Leak攻撃対策について、以下のメモを作成しています。
ファクトチェックしてください。
なお、今回はCSRFトークンは使用しない前提です。

# 大前提

- データを変更するAPI (副作用あり) と データを取得するAPI (副作用なし) で メソッドを分離する
  - API 設計の段階で考慮する
  - データを変更するAPI (副作用あり)
    - POST, PUT, DELETE など
    - これらのメソッドは unsafe methods と呼ばれる
  - データを取得するAPI (副作用なし)
    - GET, HEAD, OPTIONS など
    - これらのメソッドは safe methods と呼ばれる

# 全体メモ

SPA + API構成におけるCSRF攻撃について考察を行います。
API側では httponlyクッキーを利用し、クッキーが存在していないとAPI呼び出しが行えないものとします。
正規の用途では、fetch apiにおいて credentials: includeを設定した呼び出しを想定します。

CSRF攻撃の防御の一番根本的解決はOriginヘッダ検証です。
しかし今回は、Originヘッダ検証を怠った場合、つまりOriginヘッダ検証のない場合において、
CookieのSameSite属性や CORSポリシーによる CSRF攻撃の副次的防御の影響について考察します。

横軸→被害者に踏ませるための攻撃者のページ
縦軸→本来のSPAページ

また、
SameSite属性によるCSRF耐性 → A
CORSポリシーによるCSRF耐性 → B

余談: 完全同一ドメイン or サブドメインの場合はSameSite=Laxを明示的に設定するものとする。完全別ドメインの場合はSameSite=Noneを明示的に設定するものとする。

## α. 攻撃者ページからの fetch apiを用いた unsafe methodによるCSRF

こちらはsimple requestとは認識されない。

| ＼ | サブドメイン(ただし本家とは別のサブドメインとする) | 完全別ドメイン |
| 完全同一ドメイン SameSite=Lax | B | A,B |
| サブドメイン SameSite=Lax Access-Control-Allow-Credentials有 | B | A, B |
| 完全別ドメイン SameSite=none Access-Control-Allow-Credentials有 | B | B |

## β. text/plain等の simple requestと認識されるコンテンツタイプを用いた POSTでJSONデータを無理やり送信させるタイプの CSRF

ここでは、一番想定される例として コンテンツタイプ例にtext/plainを提示した。
ただし、API側が受理するのであれば、multipart/form-data または application/x-www-form-urlencoded もこちらの分類に含まれる。
simple requestと認識されるリクエストの送信は、攻撃者ページからのフォーム送信 もしくは fetch apiのどちらでもあり得る
余談: この攻撃方法は API側が application/json以外のコンテンツを受理するということが原因になるので、この点を防げばそもそも発生しない。

| ＼ | サブドメイン(ただし本家とは別のサブドメインとする) | 完全別ドメイン |
| 完全同一ドメイン SameSite=Lax | なし | A |
| サブドメイン SameSite=Lax Access-Control-Allow-Credentials有 | なし | A |
| 完全別ドメイン SameSite=none Access-Control-Allow-Credentials有 | なし | なし |

## γ. 攻撃者ページからのfetch apiを用いたsafe methodによるデータ漏えい

この場合はsafe methodなので、CORSの防衛ラインの軸足が
「APIを呼び出さない」から「API呼び出しは許容するがそのデータは閲覧できない」に 変化することに注意

| ＼ | サブドメイン(ただし本家とは別のサブドメインとする) | 完全別ドメイン |
| 完全同一ドメイン SameSite=Lax | B | A,B |
| サブドメイン SameSite=Lax Access-Control-Allow-Credentials有 | B | A, B |
| 完全別ドメイン SameSite=none Access-Control-Allow-Credentials有 | B | B |

(余談1: safe methodでも副作用が発生するような場合、CORSではサイトのデータ取得は防がれるものの、APIへのアクセスは防がれない。そのため、safe methodで副作用を行うAPIが存在している場合、CSRFが可能になる)
(余談2: CORSで `*` で指定するのは避ける。そもそも`*` で指定している場合だとallow credentialsが許可されないので正常な通信が上手くいかなくなるというフェイルセーフな仕組みが存在している。裏を返せば、CORSで`*` を設定し、かつ credentials includeなしで叩けるAPIが存在すれば、CSRF攻撃およびXS-Leakに脆弱ということになってしまう)
(余談3: Originヘッダは、同一オリジン = 完全同一ドメインでsafe methodの場合のみ付属しないという特徴がある。これは、完全同一ドメインかつsafe methodの場合 CSRF攻撃の危険性が極めて少なく、心配する必要がないと判断されるからである)

# 完全別ドメイン SPA + JSONAPI の場合のCSRF・XS-Leak 対策

- 原則
  - APIにはクッキーを含めて送信する必要がある
  - クッキー
    - SameSite=None
    - HttpOnly
    - Secure
  - SPA と API は 完全別ドメイン
    - サブドメインでもない
    - 別オリジン
    - 別サイト
  - CORS
    - fetch API において クレデンシャルを含める設定を許容する
      - fetch API の `credentials` パラメータを `include` に設定するオプションを許可する
      - `Access-Control-Allow-Credentials` を `true` に設定
    - フロントエンド オリジンのみ許可
      - `Access-Control-Allow-Origin` を フロントエンドのオリジンに設定
- SPA と API が 別ドメインなので
  - クッキーのSameSite属性を用いた 防御機構は利用できない
  - そもそもクッキーの防御機構は CSRF攻撃においては副次的な防御機構である
  - より本質的な対策が必要

## 完全別ドメインからの CSRF 攻撃

- 別ドメインからのCSRF攻撃とは
  - 別オリジン
  - 別サイト

- unsafe methods(副作用あり) な JSON API に対する CSRF攻撃
  - Origin検証 (API側での検証)
    - Origin ヘッダは 別ドメインの場合は 別オリジンなので 基本送信される
    - API は クライアントから送信された Origin ヘッダを検証し
    - 許可されたオリジンからのリクエストのみを受け入れるよう実装する
      - 開発者が実装を忘れないように注意する
  - CORSポリシーにオリジンが含まれるか (ブラウザ側での検証)
    - CORSポリシーの適切な設定により 送信をブロックし CSRF攻撃を防止できる
    - unsafe method かつ `application/json` を送信した場合、
      - 本リクエスト送信前に ブラウザが CORSポリシーを確認するために APIサーバのCORSポリシーを取得する
        - CORSポリシーを取得するためのリクエスト = プリフライトリクエスト
        - OPTIONS メソッド
      - 取得したCORSポリシーにオリジンが含まれない場合
        - ブラウザは 本リクエストの送信をブロックする
        - その時点で fetch API がエラーを返す
    - 処理の流れ
      - 1. ブラウザの JavaScriptが fetch APIを用いて unsafe method のリクエストを送信しようとする
      - 2. ブラウザがプリフライトリクエストを送信
        - OPTIONS メソッド
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
        - `Access-Control-Allow-Origin` ヘッダを確認
      - 5. オリジンが含まれない場合 送信をブロックし その時点で fetch API がエラーを返す
  - 余談: CORS ポリシーのオリジン設定 最低限制約 (ブラウザ側での検証)
    - CORSポリシーが適切に設定されなかった場合でも 送信をブロックし CSRF攻撃を防止できる
    - unsafe methods かつ `application/json` を送信した場合、
      - 本リクエスト送信前に ブラウザが CORSポリシーを確認するために APIサーバのCORSポリシーを取得する
      - 取得した CORSポリシーにおいて
      - `Access-Control-Allow-Origin` ヘッダに ワイルドカード `*` を設定しており、かつ
      - `Access-Control-Allow-Credentials` ヘッダが `true` に設定されている場合は
        - ブラウザは 本リクエストの送信をブロックする
        - その時点で fetch API がエラーを返す
    - これにより CORSポリシーのオリジンを`*` に設定したとしても CSRF攻撃を防止できる
      - ただし この対策に依存しすぎてはならず
      - 他の対策 (オリジン検証や CORSポリシーの適切な設定) と組み合わせて用いるべきである
    - 処理の流れ
      - 1. ブラウザの JavaScriptが fetch APIを用いて unsafe method のリクエストを送信しようとする
      - 2. ブラウザがプリフライトリクエストを送信
        - OPTIONS メソッド
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーが制約に違反しているかをチェック
        - オリジンが`*` かつ `Access-Control-Allow-Credentials` ヘッダが `true` であるかをチェック
      - 5. 両立する場合 送信をブロックし その時点で fetch API がエラーを返す
- safe methods(副作用なし) な JSON API に対する XS-Leak攻撃
  - Origin検証 (API側での検証)
    - Origin ヘッダは 別ドメインの場合は 別オリジンなので 基本送信される
    - API は クライアントから送信された Origin ヘッダを検証し
    - 許可されたオリジンからのリクエストのみを受け入れる
    - JSONAPI によるCSRF 副作用ありの場合と同じ
  - CORSポリシーにオリジンが含まれるか (ブラウザ側での検証)
    - CORSポリシーの適切な設定により 閲覧をブロックし XS-Leak攻撃を防止できる
    - 処理の流れ
      - 1. JavaScriptが fetch APIを用いて safe method のリクエストを送信しようとする
      - 2. ブラウザがリクエストを送信
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーにオリジンが含まれるかをチェック
        - `Access-Control-Allow-Origin` ヘッダを確認
      - 5. オリジンが含まれない場合 レスポンスがJavaScriptに渡されず その時点で fetch API がエラーを返す
  - 余談: CORS ポリシーのオリジン設定 最低限制約 (ブラウザ側での検証)
    - CORSポリシーが適切に設定されなかった場合でも 閲覧をブロックし XS-Leak攻撃を防止できる
    - これにより CORSポリシーのオリジンを `*` に設定したとしても 閲覧をブロックし XS-Leak攻撃を防止できる
      - ただし この対策に依存しすぎてはならず
      - 他の対策 (オリジン検証や CORSポリシーの適切な設定) と組み合わせて用いるべきである
    - 処理の流れ
      - 1. JavaScriptが fetch APIを用いて safe method のリクエストを送信しようとする
      - 2. ブラウザがリクエストを送信
      - 3. サーバーがCORSポリシーを含むレスポンスを返す
      - 4. ブラウザがレスポンスを確認し CORSポリシーが制約に違反しているかをチェック
        - オリジンが`*` かつ `Access-Control-Allow-Credentials` ヘッダが `true` であるかをチェック
      - 5. 両立する場合 レスポンスがJavaScriptに渡されず その時点で fetch API がエラーを返す
- フォーム送信によるCSRF攻撃
  - Origin検証 (API側での検証)
    - Origin ヘッダは 別ドメインの場合は送信される
    - JSONAPIによるCSRF 副作用ありの場合と同じ
  - application/json 以外のContent-Type の拒否 (API側での検証)
    - フォーム送信は 以下のContent-Type になる
      - `application/x-www-form-urlencoded`
      - `multipart/form-data`
      - `text/plain`
    - したがってAPIでは これらの Content-Type のリクエストを拒否する
    - API は `application/json` のみを許可する
    - APIフレームワークの実装によっては
      - JSON を受け取るAPIを定義した場合でも
      - Content-Type を検証せず リクエストボディにJSONが含まれていれば受け入れる場合がある
      - その場合は 明示的に Content-Type を検証して拒否する
  - 余談: CORSポリシーは関係ない
    - フォーム送信は ブラウザのネイティブ機能であるため
    - ブラウザは CORSポリシーを確認せず 直接リクエストを送信する
    - そのため CORSポリシーでは フォーム送信によるCSRF攻撃を防止できない
  - 余談: CORSにおける `Access-Control-Allow-Credentials` は関係ない
    - 前述の通り フォーム送信は ブラウザのネイティブ機能であるため
    - ブラウザは CORSポリシーを確認せず 直接リクエストを送信する
    - そのため `Access-Control-Allow-Credentials` では フォーム送信によるCSRF攻撃を防止できない

## サブドメインからの CSRF攻撃

- サブドメインからのCSRF攻撃とは
  - 別オリジン
  - 同一サイト
    - 例: api.example.com と app.example.com
- 今回は SameSite=None を使用しているため
  - サブドメイン特有の
    - 「同一サイトである」ことによる差分は発生しない
- したがって 完全別ドメインからのCSRF攻撃の場合と同じ対策を適用する

# 同一ドメイン SPA + JSONAPI の場合のCSRF対策

- 原則
  - APIにはクッキーを含めて送信する必要がある
  - クッキー
    - SameSite=Lax
    - HttpOnly
    - Secure
  - SPA と API は 完全同一ドメイン
    - 同一オリジン
    - 同一サイト
  - CORS
    - 別オリジンではないので CORS設定は不要
- SPA と API が 同一ドメインなので
  - クッキーの防御機構を利用できる
  - クッキーの防御機構は CSRF攻撃において有効な防御機構である

同一ドメインからのCSRF攻撃については考えづらいのでここでは割愛する

## 別ドメイン からの CSRF攻撃

- 別ドメインからのCSRF攻撃とは
  - 別オリジン
  - 別サイト

- unsafe methods(副作用あり) な JSON API に対する CSRF攻撃
  - CORS ポリシーがなく厳密に管理されており
  - また SameSite=Lax により 異なるサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - ただし多重防御を考えるのであれば 以下を追加してもよい
    - Origin検証
      - unsafe methodの場合 Origin ヘッダは送信される
      - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ
- safe methods(副作用なし) な JSON API に対する XS-Leak攻撃
  - CORS ポリシーがなく厳密に管理されており
  - また SameSite=Lax により 異なるサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - ただし多重防御を考えるのであれば 以下を追加してもよい
    - Origin検証
      - もし Origin ヘッダが存在すれば検証する
      - Origin ヘッダは 同一ドメインの場合は同一オリジンであり
      - さらに safe methodの場合 Origin ヘッダが送信されないことがある
      - そのため 「もし Origin ヘッダが存在すれば検証する」 という方針とする
- フォーム送信によるCSRF攻撃
  - SameSite=Lax により 異なるサイト間でのクッキー送信が防止されるため
  - 特に対策は不要
  - ただし多重防御を考えるのであれば 以下を追加してもよい
    - Origin検証 (API側)
      - Origin ヘッダは 同一ドメインの場合は基本送信される
      - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ
    - application/json 以外のContent-Type の拒否 (API側)
      - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ

## サブドメイン からの CSRF攻撃

- サブドメインからのCSRF攻撃とは
  - 別オリジン
  - 同一サイト
    - 例: api.example.com と app.example.com

- unsafe methods(副作用あり) な JSON API に対する CSRF攻撃
  - CORS ポリシーがなく厳密に管理されているが
  - SameSite=Lax により 同一サイト間でのクッキー送信が許可されるため
  - CSRF攻撃が成立する可能性がある
  - したがって 完全別ドメインからのCSRF攻撃の場合と同じ対策を適用する
  - Origin検証 (API側での検証)
    - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ
- safe methods(副作用なし) な JSON API に対する XS-Leak攻撃
  - CORS ポリシーがなく厳密に管理されているが
  - SameSite=Lax により 同一サイト間でのクッキー送信が許可されるため
  - XS-Leak攻撃が成立する可能性がある
- フォーム送信によるCSRF攻撃
  - SameSite=Lax により 同一サイト間でのクッキー送信が許可されるため
  - CSRF攻撃が成立する可能性がある
  - したがって 完全別ドメインからのCSRF攻撃の場合と同じ対策を適用する
  - Origin検証 (API側)
    - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ
  - application/json 以外のContent-Type の拒否 (API側での検証)
    - 検証の手順は 完全別ドメイン SPA + JSONAPI の場合と同じ

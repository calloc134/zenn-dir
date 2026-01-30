---
title: "SPA + API 環境におけるCSRF対策メモ"
emoji: "📌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: []
published: false
---

SPA + API 環境における CSRF・クロスサイトリーク攻撃対策について、以下のメモを作成しています。
ファクトチェックしてください。

# 前提知識

- CSRF攻撃・クロスサイトリーク攻撃 に関する前提知識は非常に多岐に渡る
  - 前提知識をここで整理する
- CSRF攻撃とは
  - クロスサイトリクエストフォージェリ (Cross-Site Request Forgery) の略
  - 攻撃者が偽サイトを用意し
  - 被害者がその偽サイトにアクセスした際に
  - 被害者のブラウザが正規サイトに対して意図しないリクエストを送信させる攻撃手法
  - 今回は、正規APIに対して意図しないリクエストを送信させるケースを想定する
  - 認証情報が自動で付与される場合に攻撃が成立する
    - 例: クッキーを用いたセッション管理が行われている場合 クッキーはブラウザによって自動で付与される認証情報なので
- クロスサイトリーク攻撃とは
  - 重要: クロスサイトリーク攻撃が発生する前提で記述しているが、実際は後述のCORSポリシーの仕組み上 多くの場合で防止される
  - 攻撃者が偽サイトを用意し
  - 被害者がその偽サイトにアクセスした際に
  - 被害者のブラウザが正規サイトに対してリクエストを送信し
  - そのレスポンス内容を攻撃者に漏洩させる攻撃手法
  - 今回は、正規APIに対してリクエストを送信し
  - そのレスポンス内容を攻撃者に漏洩させるケースを想定する
  - これも 認証情報が自動で付与される場合に攻撃が成立する
    - 例: クッキーを用いたセッション管理が行われている場合
- HTTP メソッドの使い分け
  - unsafe method
    - POST, PUT, DELETE など
    - このメソッドで呼び出されるAPIは
    - データベースの更新など 副作用が発生する操作を行うものと期待される
    - 予測される脅威: CSRF攻撃
  - safe method
    - GET, HEAD, OPTIONS など
    - このメソッドで呼び出されるAPIは
    - データの取得など 副作用が発生しない操作を行うものと期待される
    - 予測される脅威: クロスサイトリーク攻撃
  - APIで行う処理に応じて 適切なメソッドを選択することが重要
    - 詳細は後述
- オリジンとは
  - スキーム + ホスト + ポート の組み合わせ
  - 例: https://app.example.com:443
- サイトとは
  - eTLD+1 (effective Top Level Domain + 1)
    - つまり
  - 例: example.com
- SameSite 属性とは
  - クッキーの属性の一つであり
  - クロスサイトリクエストにおけるクッキーの送信挙動を制御する
  - 主な設定値
    - Strict
      - クロスサイトリクエストではクッキーを送信しない
    - Lax
      - 一部のクロスサイトリクエストでのみクッキーを送信する
        - safe method (GET, HEAD, OPTIONS) の場合はクッキーを送信する
        - unsafe method (POST, PUT, DELETE) の場合はクッキーを送信しない
      - SameSite 属性を設定しない場合のデフォルト値になるが、
        - 明示的に指定した場合と比べて挙動が異なる場合があるので注意
        - 今回は SameSite属性を設定しない場合を考えず
        - 明示的に Lax を設定した場合を想定する
    - None
      - クロスサイトリクエストでもクッキーを送信する
      - Noneを設定する場合 Secure 属性も設定する必要がある
- CORSポリシーとは
  - クロスオリジンリクエストにおける ブラウザの挙動を制御・制限する仕組み
    - unsafe methodの場合
      - リクエストの送信自体の可否 を制御・制限する
      - APIが呼び出された際に副作用が発生する可能性があるため
      - リクエストの送信自体を制御・制限し CSRF攻撃を防止する
    - safe methodの場合
      - レスポンスの閲覧可否 を制御・制限する
      - APIが呼び出された際に副作用が発生しないため、
      - リクエストの送信自体は許可するが
      - レスポンスの閲覧可否を制御・制限し クロスサイトリーク攻撃を防止する
  - 主なヘッダ
    - Access-Control-Allow-Origin
      - クロスオリジンのリクエスト送信・レスポンス閲覧を 許可するオリジンを指定する
      - ワイルドカード `*` も指定可能だが 後述の制約がある
    - Access-Control-Allow-Credentials
      - クロスオリジンのリクエストにおいて
      - クレデンシャル (Cookie, Authorization ヘッダなど) を含めるかを指定する
      - 含める場合は `true` を指定する
      - 含めない場合はヘッダ自体を省略する
      - Access-Control-Allow-Origin に ワイルドカード `*` を指定している場合は
      - このヘッダを `true` に設定できないという制約がある
      - これにより CORSポリシーの設定ミスによる CSRF攻撃・クロスサイトリーク攻撃を防止できる

想定する状況について、

- 完全同一ドメイン
  - app.example.com と app.example.com
  - 同一オリジン
  - 同一サイト
- サブドメイン
  - api.example.com と app.example.com
  - 別オリジン
  - 同一サイト
- 完全別ドメイン
  - api.example.org と app.example.com
  - 別オリジン
  - 別サイト
- の 3パターンについて考える

# 想定するケースの前提

- CSRF攻撃・クロスサイトリーク攻撃の防御機構を正常に作用させるため
- 開発者は前提として 以下の設計を守るものとする
- API のセッション管理は httponly クッキーを利用する
  - クッキーが存在していないとAPI呼び出しが行えないものとする
  - 正規の用途では、fetch apiにおいて credentials: includeを設定した呼び出しを想定する
- データを変更するAPI (副作用あり) と データを取得するAPI (副作用なし) で メソッドを分離する
  - API 設計の段階で考慮する
  - データを変更するAPI (副作用あり)
    - unsafe method を用いる
      - POST, PUT, DELETE など
  - データを取得するAPI (副作用なし)
    - safe method を用いる
      - GET, HEAD, OPTIONS など
- クッキーのSameSite属性について
  - 完全同一ドメイン・サブドメインの場合

# 全体メモ

CSRF攻撃の防御の一番根本的解決はOriginヘッダ検証です。
しかし今回は、Originヘッダ検証を怠った場合、つまりOriginヘッダ検証のない場合において、
CookieのSameSite属性や CORSポリシーによる CSRF攻撃の副次的防御の影響について考察します。

横軸→被害者に踏ませるための攻撃者のページ
縦軸→本来のSPAページ

また、
SameSite属性によるCSRF耐性 → A
CORSポリシーによるCSRF耐性 → B

余談: 完全同一ドメイン or サブドメインの場合はSameSite=Laxを明示的に設定するものとする。完全別ドメインの場合はSameSite=Noneを明示的に設定、かつSecure属性も設定するものとする。

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

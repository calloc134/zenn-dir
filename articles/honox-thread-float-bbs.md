---
title: "最新技術スタックで伝統掲示板を再構築: HonoXでスレッドフロート型掲示板を作った話"
emoji: "📋"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["hono", "honox", "Bun", "個人開発"]
published: false
---

みなさんこんにちは。calloc134 です。今回も面白いものを作ったので是非宣伝させてください。
日本のインターネット文化を形作った 2 ちゃんねるスタイルの掲示板を、令和最新の技術スタックで再構築してみました。

今回は、そんな掲示板「VakKarma」について解説していきます。

# はじめに

## スレッドフロート型掲示板とは

スレッドフロート型掲示板は、2 ちゃんねるや 5 ちゃんねるなどでおなじみの掲示板スタイルです。
新しい投稿（レス）が付いたスレッドが、自動的に掲示板の一覧の最上位に浮上（フロート）する仕組みを持つ電子掲示板です。

> スレッドフロート型掲示板（スレッドフロートがたけいじばん）とは、最新のコメント投稿がなされたスレッドがその掲示板のスレッド群の最上位に表示される機能を持つ電子掲示板を指す。フローティングスレッド型掲示板とも言う。
> (https://ja.wikipedia.org/wiki/%E3%82%B9%E3%83%AC%E3%83%83%E3%83%89%E3%83%95%E3%83%AD%E3%83%BC%E3%83%88%E5%9E%8B%E6%8E%B2%E7%A4%BA%E6%9D%BF)

この方式は 1998 年に日本で初めて「multi2」というスクリプトで実装され、その後「あめぞう」を経て「2 ちゃんねる」へと発展しました。現在では 5 ちゃんねる、4chan、8chan など世界中の多くの匿名掲示板で採用されている形式です。
活発な議論が行われているスレッドが常に上位に表示されるため、ユーザーは掲示板の「今」を瞬時に把握できるというメリットがあります。

## VakKarma とは

VakKarma は、「ゼロちゃんねるプラス」をベースにした 2 ちゃんねる風スレッドフロート型掲示板の現代的再実装です。

「ゼロちゃんねるプラス」は、2 ちゃんねる互換のスレッドフロート型掲示板スクリプトとして開発されたものの一つです。インターネット上の多くの 2 ちゃんねる系掲示板の運営に利用されてきました。

> 『ぜろちゃんねるプラス』は２ちゃんねる互換スレッドフロート型掲示板スクリプトの『ぜろちゃんねる』をより２ちゃんねるに近いものにするとともに、よりよい機能を追加していき、ぜろちゃんねるの上位版として提供していくプロジェクトです。
> https://ja.osdn.net/projects/zerochplus/releases/77053

Vakkarma は、このゼロちゃんねるプラスの UI を参考にしつつ、最新の Web 開発技術で再構築されています。伝統的な 2 ちゃんねる風の UI ながら、現代のブラウザやデバイスで快適に利用できるように設計されています。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot1.png)

# 使い方

Vakkarma は、Cloudflare Workers 上でも動作します。デモをすでにデプロイしているので、ぜひ試してみてください。

https://vakkarma-main.calloc134personal.workers.dev/

読み込みが遅い問題については、[Neon Database](https://neon.tech/)の無料枠を利用しており、日本リージョンがないことが理由であると考えています。ご了承ください。

## トップページ

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot3.png)

上位のスレッド 30 件が表示されます。スレッドのタイトルをクリックすると、スレッドの詳細ページに遷移します。また、上位 10 件のスレッドは、スレッドの最初のレス・最新のレスが表示されます。

表示されているスレッドに対しては、レスを行うことができます。また、「全部読む」リンクよりスレッドの詳細ページに遷移することができます。

ページの下部には、新規スレッド作成のためのフォームが存在します。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot4.png)

## スレッド詳細ページ

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot5.png)

スレッドの詳細ページでは、スレッドのタイトルとスレッドの全てのレスが表示されます。また、レスの投稿フォームも存在します。

## 管理画面

掲示板の管理画面では、掲示板の各種設定を操作することができます。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot6.png)

`/admin` にアクセスした後、ログインを求められます。パスワード認証に成功した後、管理画面に遷移します。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot7.png)

管理画面では、掲示板の各種設定を操作することができます。掲示板名やローカルルール、名無しの場合のデフォルト名、スレッドやレスの最大文字数などを設定できます。

パスワードの変更もここで行うことができます。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/screenshot8.png)

## 専用ブラウザ (ChMate) からの接続

ChMate などの専用ブラウザからの接続もサポートしています。

vakkarma の URL の末尾に`/senbura/`を追加することで、専用ブラウザからの接続が可能になります。例えば先程のデモサイトであれば、`https://vakkarma-main.calloc134personal.workers.dev/senbura/`となります。

この URL を ChMate に登録することで、専用ブラウザからの接続が可能になります。

![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/senbura1.png)
![vakkarma](https://raw.githubusercontent.com/calloc134/vakkarma-main/main/readme/senbura2.png)

閲覧だけでなく、レスの投稿やスレッドの作成も可能です。

## その他仕様

スレッド作成・レス作成時はどちらもコンテンツの入力が必須です。 ユーザ名は任意ですが、名無しの場合は管理者画面で設定した名前が表示されます。

ユーザ名に`#`を含めることで、`#`以降の文字列がトリップとして表示されます。
トリップ生成の仕組みは本家とは異なりますが、より安全に生成されるように設計されています。また、データベースには生成された後のトリップが保存されるため、万が一データベースが漏洩した場合でも、トリップの元データは漏洩しないように設計されています。

https://ja.wikipedia.org/wiki/%E3%83%88%E3%83%AA%E3%83%83%E3%83%97_(%E9%9B%BB%E5%AD%90%E6%8E%B2%E7%A4%BA%E6%9D%BF)

また、ID については IP アドレスと日時から一意に生成されるものを使用しています。

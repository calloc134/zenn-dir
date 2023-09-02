---
title: "timesを全部共有してくれるdiscordボットをサクッと作った"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["discord", "typescript", "fastify", "times", "cyclicsh"]
published: true
---

こんにちは、calloc134です。

皆さんは技術コミュニティに所属していますか？
その中で、timesという文化を持っているコミュニティは多いと思います。
timesとは、自分の独り言スペースとして使えるチャンネルです。

timesには、独り言として技術の雑談や、最近の近況や、自分の考えを書いたりすることができます。そして、それを読んでくれる人がいると、それに対してコメントを書いてくれたりします。
自分は現在3つほどの技術コミュニティに所属しており、それぞれのコミュニティでtimesを書いています。

さて、timesを書くたびに、3つのコミュニティに同じ内容を書くのは面倒です。そこで、timesを全部共有してくれるdiscordボットを作りました。

## 使い方

### ボットをサーバに追加

このボット君を、内容送信したいサーバに追加します。

![](/images/c6aeb3d7fec22c/2023-09-02-14-57-45.png)

### 必要な値のコピー

まず、コマンドを利用するユーザのIDをコピーします。

![](/images/c6aeb3d7fec22c/2023-09-02-15-02-19.png)

また、送信したいtimesのチャンネルのIDをコピーしてから、ボットにtimes送信先チャンネルを登録します。

なお、チャンネルIDをコピーするためには、discordの設定から「詳細」を選択し、「開発者モード」を有効にする必要があります。

![](/images/c6aeb3d7fec22c/2023-09-02-14-59-53.png)

これらのデータをメモ帳のようなものにコピーしておきます。

### チャンネルIDの登録

`/add_channel_id`コマンドを利用して、times送信先チャンネルを登録します。

![](/images/c6aeb3d7fec22c/2023-09-02-15-03-00.png)

無事に登録されると以下のような画面となります。

![](/images/c6aeb3d7fec22c/2023-09-02-15-03-24.png)

なお、削除は`/remove_channel_id`コマンドを利用して行うことができます。

![](/images/c6aeb3d7fec22c/2023-09-02-15-04-07.png)

また、登録されているチャンネルIDは`/show_channel_id`コマンドを利用して確認することができます。

![](/images/c6aeb3d7fec22c/2023-09-02-15-04-37.png)

### 投稿の作成

`/times`コマンドを利用して、投稿を作成します。

![](/images/c6aeb3d7fec22c/2023-09-02-15-05-07.png)

投稿がおこなわれると以下のようになります。

![](/images/c6aeb3d7fec22c/2023-09-02-15-05-34.png)

また、投稿がされているのがわかります。

![](/images/c6aeb3d7fec22c/2023-09-02-15-10-32.png)

需要があれば一般公開を考えています

## 技術構成

今回は、以下の技術を利用しています。

- TypeScript
- fastify
- discord-interactions
- @cyclic.sh/dynamodb

また、このdiscordボットをデプロイするのに[cyclic.sh](https://cyclic.sh/)というサービスを利用しています。

https://cyclic.sh

このサービスでは、GitHubのリポジトリと連携して、リポジトリにpushされた際に自動的にデプロイを行うことができます。

対応しているランタイムはNode.jsとPython、Goとなっています。

今回は、Node.jsを利用しています。

cyclicのランタイムではwebsocketは利用できないため、discord.jsが使えない状態でした。そのため、discordのインタラクション APIを利用することで、discordボットを実装しました。

https://discord.com/developers/docs/interactions/receiving-and-responding

また、cyclic.shがdynamodbをラップしたcyclic dbを利用できるため、これを用いてユーザのチャンネルIDを登録しています。

## コードの解説

以下のリポジトリからコードにアクセスできます。

https://github.com/calloc134/times_shower

詳しい解説は、需要があれば記述します。

## おわりに

自分にとっては初めてのdiscordボット開発でした。
サンプルコードが軒並み生JSばかりで結構苦戦しましたが、サクッと開発できて良かったです。
参考になれば幸いです。


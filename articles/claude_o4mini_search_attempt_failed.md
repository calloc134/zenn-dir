---
title: "Claude Codeの中身をo4-mini & 検索機能にしてみたかった (できなかった)"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AI", "Claude Code", "o4-mini", "ChatGPT"]
published: false
---

# はじめに

Claude Code ブーム時代、いかがお過ごしですか？
どうも、calloc134 です。

説明するまでもないですが、Claude Code とは、Anthropic 社が提供するエージェント型コーディングツールです。
ターミナルから自然言語でコマンドの入力・バグ修正などを行ってくれます。

今回はそんな Claude Code の中身を、o4-mini と検索機能にしてみ**ようとしたけどできなかったよ**という記録を書いていこうと思います。

# きっかけ

6/27 に、OpenAI がある API を発表しました。
https://x.com/OpenAIDevs/status/1938296690563555636

> Web search is now available with OpenAI o3, o3-pro, and o4-mini. The model can search the web within its chain-of-thought! 🧠🌐

なんと、今まで Web 版の ChatGPT or 一部のモデルでしか利用できなかった検索機能が、o3, o3-pro, o4-mini モデルで利用できるようになったようです。

今まで自分は$20 を支払って Web 版の ChatGPT を契約していました。その最大の理由は優秀な検索機能でした。さっそくこの API を試してみることにしました。

ChatGPT のフロントエンド (ここでは [https://lobechat.com](https://lobechat.com) を利用) で、o4-mini モデルを選択し、検索機能を有効にし、チャットを行ってみました。
すると、Web 版の ChatGPT と同じような精度の調査結果を返してくれました。

![](/images/claude_o4mini_search_attempt_failed/2025-07-08-15-09-29.png)

これは使える、と感じました。とりあえず $20 のサブスクの解約を検討しました。同時に、以前から気になっていた Claude Code を契約することを考えました。
しかし、3 日ほど前に継続購入をしてしまったこともあり、すぐには契約ができないな・・・ということを考えました。

ここで、Claude Code の中身のエンドポイントをプロキシし、OpenAI の o4-mini モデルを使うこと、加えて検索機能を有効にすることができれば、能力の高いエージェント型コーディングツールにできるのではないか？と考えました。
自分は Claude Code を使ったことがないのですが、検索機能が少し貧弱であるというウワサを聞いたことがあったため、その補完としても使えるのではないか？という発想です。

実際に検討を進めていきました。

# 検討
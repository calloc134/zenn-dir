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

これは使える、と感じました。
とりあえず $20 のサブスクの解約を検討しました。同時に、以前から気になっていた Claude Code を契約することを考えました。
しかし、3 日ほど前に継続購入をしてしまったこともあり、すぐには契約ができないな・・・ということを考えました。

ここで、Claude Code の中身のエンドポイントをプロキシし、OpenAI の o4-mini モデルを使うこと、加えて検索機能を有効にすることができれば、能力の高いエージェント型コーディングツールにできるのではないか？と考えました。
自分は Claude Code を使ったことがないのですが、検索機能が少し貧弱であるというウワサを聞いたことがあったため、その補完としても使えるのではないか？という発想です。

ということで、実際に検討を進めていきました。

# 検討

Claude Code には、環境変数 `ANTHROPIC_BASE_URL` と `ANTHROPIC_AUTH_TOKEN` を設定することで、通信先のエンドポイントを差し替えることができる機能が存在します。

例えば、以下のように設定することができます。

```bash
ANTHROPIC_BASE_URL="http://localhost:8082" ANTHROPIC_AUTH_TOKEN="some-api-key" claude
```

この機能を利用して o4-mini モデルのエンドポイントをプロキシすることができるのではないか？と考えました。

調査したところ、Claude Code の通信をプロキシして OpenAI のモデルを利用することのできるプロジェクトが既に存在していました。

https://github.com/fuergaosi233/claude-code-proxy
https://github.com/1rgs/claude-code-proxy

しかしこれらのコードを確認すると、内部で OpenAI Completion API を利用していることがわかりました。

OpenAI Completion API はテキスト生成の基本的な API であり、一般的にこちらが広く利用されています。一方 OpenAI Responses API とは、2025 年 3 月にリリースされた比較的新しい API であり、より高度な機能を提供します。Web 検索機能やファイル検索機能、MCP の呼び出しなどは Responses API でのみ利用可能です。

今回は Web 検索機能を利用したかったため、Responses API を利用する必要がありました。

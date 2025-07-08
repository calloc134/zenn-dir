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

Claude Code とは、Anthropic 社が提供するエージェント型コーディングツールです。
ターミナルから自然言語でコマンドの入力・バグ修正などを行ってくれます。

今回は、そんな Claude Code の中身を、o4-mini と検索機能にしてみようとしたのですが、残念ながらうまくいきませんでした。不完全ですが、実装の経緯や試行錯誤の内容を共有したいと思います。

# きっかけ

6/27 に、OpenAI がある API を発表しました。
https://x.com/OpenAIDevs/status/1938296690563555636

> Web search is now available with OpenAI o3, o3-pro, and o4-mini. The model can search the web within its chain-of-thought!

なんと、今まで Web 版の ChatGPT or 一部のモデルでしか利用できなかった検索機能が、o3, o3-pro, o4-mini モデルで利用できるようになったようです。

今まで自分は、$20 を支払って Web 版の ChatGPT Plus プランを契約していました。その最大の理由は、優秀な検索機能でした。さっそくこの API を試してみることにしました。

ChatGPT のフロントエンド (ここでは [https://lobechat.com](https://lobechat.com) を利用) で、o4-mini モデルを選択し、検索機能を有効にし、チャットを行ってみました。
すると、Web 版の ChatGPT と同じような精度の調査結果を返してくれました。

![](/images/claude_o4mini_search_attempt_failed/2025-07-08-15-09-29.png)

これは使える、と感じました。
とりあえず $20 のサブスクの解約と、代わりとして以前から気になっていた Claude Code を契約することを検討しました。しかし、つい先日 ChatGPT Plus 継続購入をしてしまったこともあり、すぐには契約ができないなぁ・・・という状況でした。

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
そのため、先程のプロジェクトは利用できないことがわかりました。TypeScript を利用し、自分で一から実装する必要があるようです。

# 実装

Claude Code の通信を中継するにあたって、Claude Code 側のストリーミング仕様と OpenAI Responses API のストリーミング仕様を調査しました。

Claude Code 側のストリーミングに関するドキュメントは以下のとおりです。
https://docs.anthropic.com/en/docs/build-with-claude/streaming

Open AI Responses API 側のストリーミングに関するドキュメントは以下のとおりです。
https://platform.openai.com/docs/api-reference/responses-streaming
https://platform.openai.com/docs/guides/streaming-responses?api-mode=responses

# 動作確認

リポジトリは以下のとおりです。

https://github.com/calloc134/claude-code-proxy-with-search

とりあえずプロトタイプなので一枚のファイルで実装しています。正常に動作したあとにリファクタリングを行う予定でした。
https://github.com/calloc134/claude-code-proxy-with-search/blob/main/index.ts

実際に動作を確認してみましょう。`.env`ファイルに OPENAI の API キーと呼び出し先のモデルを指定します。

```env
# OpenAI API Key (required)
OPENAI_API_KEY="sk-..."

# Server Configuration
PORT=8082

OPENAI_MODEL=gpt-4.1
```

プロキシサーバーを起動します。

```bash
bun run dev
```

Claude Code の環境変数を設定し、プロキシサーバーを起動します。

```bash
ANTHROPIC_BASE_URL="http://localhost:8082" ANTHROPIC_AUTH_TOKEN="some-api-key" claude
```

## ツール呼び出しの失敗

簡単なレスポンスは正常に終了します。しかし、ツールの呼び出しがうまくいきませんでした。

```
 ※ Tip: Run /install-github-app to tag @claude right from your Github issues and PRs

> こんにちはと表示して

● こんにちは
  ⎿  API Error: Cannot read properties of undefined (reading 'filter')

```

また、TODO を指定したタスク実行についても指示してみたところ、同じようなエラーが発生しました。

```
> あなたは、以下のタスクを渡されました。

typescript と vite, taiwind css、簡単な react を利用して、スタックとキューでそれぞれ DFS と BFS を行う様子を可視化させるようなプログラムを作成してください。
いきなり手を動かすのではなく、まずしっかりと検討を行ってください。
すべての情報を収集し終わった後、変更内容を決定する抽象レポートを作成し、それを元に細部のコーディングを含んだ具体レポートの作成について開始して
ください。それを元に、実装を開始してください。 タスクはすべてまとめて行ってください。実装段階ではしっかり type:
"tool_use"機能を利用して提供されているツール群を利用しファイル書き込みや関連コマンド実行まで行ってください。
私はすべてを承認するので、私の許可をとらず、最後まで実装を終えるようにしてください。
コーディングにおいてエラーが出た場合もまずできるだけ情報を集めるようにしてほしい。依存ライブラリのバージョン情報なども重要である。
コードを含んだ具体レポートが完成した場合、実際にコードを反映するようにしてください。
なお、実装が終わったあと、npm run
dev で開発サーバを実行しないようにしてください。ユーザが実行するので実行しないでください。代わりに、チャットを一旦終了させてください。

これに対する TODO が以下のとおりです。
この TODO リストを進めてください。

● Update Todos
⎿  ☐ Gather requirements and design abstract report
☐ Write abstract report summarizing architecture and changes
☐ Write detailed implementation plan report
☐ Initialize Vite+React+TypeScript project
☐ Install and configure Tailwind CSS
☐ Implement graph data structure and BFS/DFS logic
☐ Implement visualization components (stack, queue, graph nodes/edges)
☐ Implement control UI for algorithm execution
☐ Integrate components and test manually
☐ Run lint and typecheck

● Update Todos
⎿  ☐ Gather requirements and design abstract report
☐ Write abstract report summarizing architecture and changes
☐ Write detailed implementation plan report
☐ Initialize Vite+React+TypeScript project
☐ Install and configure Tailwind CSS
☐ Implement graph data structure and BFS/DFS logic
☐ Implement visualization components (stack, queue, graph nodes/edges)
☐ Implement control UI for algorithm execution
☐ Integrate components and test manually
☐ Run lint and typecheck
⎿  API Error: Cannot read properties of undefined (reading 'filter')

```

該当するログを確認してみると、以下のようなエラーが発生していました。

```

🔥 [Stream Error] 2 | import { castToError } from "../internal/errors.mjs";
3 | export class OpenAIError extends Error {
4 | }
5 | export class APIError extends OpenAIError {
6 | constructor(status, error, message, headers) {
7 | super(`${APIError.makeMessage(status, error, message)}`);
^
error: 400 No tool output found for function call call_jioUVasTKkS7yXP7oYJwJx04.
status: 400,
headers: Headers {
"date": "Tue, 08 Jul 2025 08:28:07 GMT",
"content-type": "application/json",
"content-length": "184",
"connection": "keep-alive",
"strict-transport-security": "max-age=31536000; includeSubDomains; preload",
"x-content-type-options": "nosniff",
"set-cookie": [ "__cf_bm=2Ki6iPDkL0q0amPnlSilVDXh8gh2lcOK2hfr7TMJ29k-1751963287-1.0.1.1-wJvsl3m_feOsMq5KdGfb9xiQqMQoVqxjdVU5xNne4WrDxqhjdC1snBPyOQ8kG8YhGTgNvAusTq9kJ7CNqeaoI9VCrIBQF2uMyDUWSxaRbLA; path=/; expires=Tue, 08-Jul-25 08:58:07 GMT; domain=.api.openai.com; HttpOnly; Secure; SameSite=None",
"_cfuvid=7LCsYQdRruP2cwLoIGDO4Ow1bBd8bWC8xG7IJvSDQJc-1751963287191-0.0.1.1-604800000; path=/; domain=.api.openai.com; HttpOnly; Secure; SameSite=None"
],
"openai-version": "2020-10-01",
"openai-organization": "mahipal-singh-2bobxm",
"x-request-id": "req_86360655b58ca750eba544b9c3df5188",
"openai-processing-ms": "105",
"cf-cache-status": "DYNAMIC",
"server": "cloudflare",
"cf-ray": "95be34cf1fb95eb4-NRT",
"alt-svc": "h3=\":443\"; ma=86400",
},
requestID: "req_86360655b58ca750eba544b9c3df5188",
error: {
message: "No tool output found for function call call_jioUVasTKkS7yXP7oYJwJx04.",
type: "invalid_request_error",
param: "input",
code: null,
},
code: null,
param: "input",
type: "invalid_request_error",

      at new OpenAIError (unknown:1:28)
      at new APIError ([省略]/cloud-code-proxy-with-search/node_modules/openai/core/error.mjs:7:9)
      at new BadRequestError (unknown:1:28)
      at generate ([省略]/cloud-code-proxy-with-search/node_modules/openai/core/error.mjs:53:24)
      at makeRequest ([省略]/cloud-code-proxy-with-search/node_modules/openai/client.mjs:427:29)
```

# その他気がついたこと

## o4-mini が思ったより言うことを聞いてくれない

o4-mini が意外と Claude Code 特有のプロンプトに素直に従ってくれないようです。具体的には、クライアントで実行すべきツールをまったく利用してくれず、タスクの実行がすすまないことが多いです (エージェントなのに「このコマンドを実行してください」とユーザに返答してくる等)。

o4-mini でクレジットを消費するのがもったいないので`gpt-4.1`モデルに切り替えたところ、ちゃんとコマンドを実行してくれるようになりました。しかしモデルの能力は o4-mini の方が高いのでなんとか o4-mini を使いたいところです。プロンプト次第で改善できるかもしれません。

# まとめ

今回は、Claude Code の中身を o4-mini とし、更に検索機能を有効にしてみるという試みを行いましたが、残念ながら成功しませんでした。

最終的に、素直に Claude Code を契約しようかな・・・と思いました。おそらく Claude Code を契約してから、以下の記事で紹介されている o3 MCP を使ったほうが幸せになれそうです。
https://zenn.dev/yoshiko/articles/claude-code-with-o3

Anthropic SSE や OpenAI に詳しい各位、もしよろしければ、この記事を読んでいただき、アドバイスをいただけると幸いです。

ここまで読んでいただきありがとうございました。

```

```

---
title: "結局なぜRCEが発生するのか？react2shell PoC研究レポート (途中)"
emoji: "📑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "react2shell", "javascript", "rsc", "nextjs"]
published: false
---

# はじめに

当記事は、[react2shell](https://react2shell.com/) の PoC 攻撃手法について、脆弱な React / Next.js の組み合わせをローカルに構築し、コードリーディングと安全側の動的解析を組み合わせて追い直した記録である。

初稿ではコードリーディング中心だったため、「たぶんこう動いているだろう」という仮説が多かった。その後、第一段階と第二段階の主要経路については脆弱版環境で裏が取れたので、この記事では前提知識を先に揃えたうえで、「結局どこで `then` が呼ばれ、なぜ RCE まで繋がるのか」をトップダウンに説明し直す。

# 最初に結論

react2shell PoC を理解するうえで、一番重要なのは次の三点である。

1. Next.js が `await` しているのは攻撃者が与えた plain object そのものではなく、`decodeReplyFromBusboy(...)` が返す root chunk、つまり chunk `0` である。
2. 第一段階で危険なのは `"$@0"` 自体ではない。`"$1:__proto__:then"` によって raw chunk から `Chunk.prototype.then` を回収し、それを plain object に移植した結果、通常の JavaScript の thenable assimilation が走って第二段階へ進める点が本質である。
3. 第二段階で危険なのも `"$B0"` 自体ではない。第一段階の revive 中に `_response._formData.get` が `Function` へ置き換わり、`"$B0"` は生成された関数を返すだけである。本当にコードが動くのは、その生成された関数が次の `then(resolve, reject)` として呼ばれる瞬間である。

この三点は、脆弱版環境に対する安全側の動的解析でも確認できた。危険な OS コマンドは実行していないが、第一段階では `["trace-stage1", "from-forged-thenable"]`、第二段階では `["trace-stage2", "from-generated-then"]` が実際に Server Action へ渡り、さらに trace 用 payload では生成された関数の本体から Node 側 `process` が見えていることも確認できた。

# 検証対象と注意事項

今回の追試で実際に使った組み合わせは以下のとおりである。

- `react/`: `6de32a5a07958d7fc2f8d0785f5873d2da73b9fa`
- `next.js/`: `c09c5f9e278e46b0923c96ef5cf8a6bd9edbaf80`

Next.js が実行時に解決していた `react-server-dom-webpack` は `19.2.0-canary-6de32a5a-20250822` だった。

動的解析はすべてローカル環境で行っており、本番環境への試行は行っていない。また、危険な RCE 文字列は使わず、攻撃経路の成立だけを確認できる harmless な payload に差し替えている。したがって、この記事は「PoC の成立条件を安全側に倒して検証したメモ」として読んでほしい。

それでもなお、私の解釈違いや見落としはありうる。もし明白な誤りが見つかったら、追記か非公開化で対応する。

# 事前知識

## RSC と Flight プロトコル

React Server Components (RSC) は、コンポーネントの一部をサーバ側で実行し、その結果だけを Flight という独自フォーマットでやり取りする仕組みである。Flight は JSON に似ているが、単なる JSON ではなく、チャンク ID や特殊な文字列構文を通して「他の値への参照」や「まだ未解決の thenable」を表現できる。

react2shell の PoC は、この Flight の「特殊文字列を revive しながらオブジェクトを組み立てる」という性質を悪用する。要は、文字列から plain object を復元するだけでなく、その復元途中で別チャンクや prototype chain を参照できてしまう点が重要になる。

## Server Actions と `decodeReplyFromBusboy`

React / Next.js の Server Actions では、クライアントからサーバへ `multipart/form-data` を送り、その中に Flight 形式の引数を埋めて渡す。Next.js 側の multipart fetch action 分岐では、最終的に次のようなコードで引数が復元される。

```js
boundActionArguments = await decodeReplyFromBusboy(busboy, serverModuleMap, {
  temporaryReferences,
});
```

ここで重要なのは、`decodeReplyFromBusboy(...)` が返すのは「完成済みの引数配列」ではなく、React runtime が管理する root chunk だという点である。したがって、PoC を理解するには「Busboy が field を受けたあと、chunk `0` がどう初期化されるか」を追う必要がある。

## チャンクとチャンクオブジェクト

Flight のデコードでは、各チャンクを内部の chunk object として保持する。これは Promise に似た thenable であり、まだ未初期化なら `PENDING`、文字列は受け取ったが revive 前なら `RESOLVED_MODEL`、復元完了後なら `INITIALIZED` といった状態を持つ。

概念的には、次のような形で考えてよい。

```js
type Chunk<T> = {
  status: Status,
  value: any,
  reason: any,
  _response: Response,
  then(resolve: (T) => void, reject?: (any) => void): void,
}
```

今回とくに重要なのは、chunk が thenable なので `await` 可能であること、そして `decodeReplyFromBusboy` が返す root chunk は chunk `0` であることの二点である。

## 今回の PoC で使う Flight の文字列構文

今回の PoC に関係する構文だけを抜き出すと、次の三つで十分である。

| 文字列 | 意味 | PoC での役割 |
| --- | --- | --- |
| `"$@<hex>"` | raw chunk への参照 | chunk そのものを取り出す |
| `"$B<hex>"` | `response._formData.get(prefix + id)` の参照 | 生成された関数を返させる足場 |
| `"$<id>:path:to:prop"` | outlined model 参照 | prototype chain を辿る |

ここで先回りして強調しておくと、`$@` も `$B` も「それ単体で危険な処理を発火させる構文」ではない。`$@` は raw chunk を返すだけであり、`$B` も `response._formData.get(...)` の戻り値を返すだけである。危険になるのは、その戻り値が後段の thenable assimilation に渡されるよう細工できてしまうからである。

## `initializeModelChunk` と `parseModelString`

Flight のデシリアライズで中心になるのは `initializeModelChunk` である。`resolved_model` になった chunk は、ここで `JSON.parse` されたあと `reviveModel(...)` に渡され、最終的には `parseModelString(...)` が `"$@..."` や `"$B..."`、`"$1:..."` のような特殊構文を解釈する。

```js
function initializeModelChunk(chunk) {
  const rawModel = JSON.parse(chunk.value);
  const value = reviveModel(
    chunk._response,
    { "": rawModel },
    "",
    rawModel,
    rootReference
  );
  // ...
}
```

つまり、今回の PoC は「攻撃者が送った JSON 文字列が `initializeModelChunk` に入ったあと、どの構文がどの順番で revive されるか」を突いている。

## プロトタイプチェーンと `constructor.constructor`

`getOutlinedModel` の脆弱性は、ID 参照のあとに続く `:path:to:prop` を own-property 制約なしでそのまま辿れてしまう点にある。これにより `__proto__` や `constructor` を経由したプロトタイプトラバーサルが成立する。

たとえば JavaScript では、配列に対して次のような辿り方ができる。

```js
const arr = [];
arr.constructor === Array;
arr.constructor.constructor === Function;
```

exploit でも同じ考え方を使う。ただし対象は普通の配列ではなく raw chunk である。第一段階では `"$1:__proto__:then"` で `Chunk.prototype.then` を回収し、第二段階では `"$1:constructor:constructor"` で `Function` を回収する。どちらも「参照先 chunk の値や prototype chain を構文だけで辿れてしまう」ことが前提になっている。

# 攻撃の全体像

PoC 全体は、二回のデシリアライズと二回のプロトタイプトラバーサルから成る。段階ごとに見ると次のようになる。

| 段階 | 何をするか | 何が得られるか |
| --- | --- | --- |
| 第一段階 | `"$@0"` で raw chunk を参照し、`"$1:__proto__:then"` で `Chunk.prototype.then` を plain object に移植する | plain object を thenable として振る舞わせる |
| 第二段階 | forged `_response` の中で `"_formData.get": "$1:constructor:constructor"` を `Function` にし、`"value": "{\"then\":\"$B0\"}"` を revive する | 生成された関数を次の `then` として呼ばせる |

もう少し因果関係を明確にすると、流れはこうである。

1. Next.js は `decodeReplyFromBusboy(...)` から返ってきた root chunk `0` を `await` する。
2. chunk `0` の初期化中に、PoC が送り込んだ plain object に `Chunk.prototype.then` が移植される。
3. root chunk の解決値が thenable 形状になるため、通常の JavaScript の thenable assimilation が走り、recovered `then` が呼ばれる。
4. recovered `then` は forged plain object をもう一度 `initializeModelChunk` に通す。
5. その二回目の revive で `"$B0"` が生成された関数を返し、その生成された関数が次の `then(resolve, reject)` として呼ばれる。
6. この生成された関数の本体に何を埋め込めるかが、RCE の本質である。

ここまでが先に掴んでおくべき全体像である。以下では、この流れを実装レベルで順に追っていく。

# 詳細解析

## 第一段階: デシリアライズ一回目とチャンク偽造

RSC サーバは、ユーザのデータを受け取り、デシリアライズ一回目を開始する。

Server Functions の受け取りは、Next.js 側コードで行われる。

https://github.com/vercel/next.js/blob/0e973f71f133f4a0b220bbf1e3f0ed8a7c75e00d/packages/next/src/server/app-render/action-handler.ts#L879C1-L883C16

```js
boundActionArguments = await decodeReplyFromBusboy(busboy, serverModuleMap, {
  temporaryReferences,
});
```

このように、
`decodeReplyFromBusboy`関数が await で呼び出される。
この関数は、Node.js の Busboy モジュールを用いて、
Server Functions (Actions)の引数等を Flight プロトコルで受け取り、デシリアライズを行う関数である。

### 攻撃の理論: チャンク偽造による攻撃範囲の拡大

攻撃者はまず最初に、Flight プロトコルのチャンクオブジェクトを偽造することを目指す。
意図としては、ユーザが読み込める不正な値の影響範囲を広げるためである。
単なるプロトタイプトラバーサルだけでは影響範囲が限定されるが、
チャンクオブジェクトを偽造することで、可能な操作を大幅に増やすことが出来る。

RSC の Flight プロトコルでは前述の通り、
`$@` 構文を用いて Raw Chunk を読み込ませることが出来る機能が存在する。

Raw Chunk 読み込みとは、他のチャンク (つまり、生のチャンク) を参照するものである。
正規の用途では、専ら参照先のチャンクの完成まで読み込みを遅延するために活用する。
主に Promise を Flight プロトコルでシリアライズしたとき等に利用される。

Raw Chunk 読み込みでなく `$1` 構文を用いた場合、
単なるプレーンオブジェクトが読み込まれ、
チャンクそのものを取得することが出来ないことに注意する。
しかし、Raw Chunk 読み込みを用いると、チャンクオブジェクトそのものを取得できる。

そして、今回 Raw Chunk 読み込みを悪用する理由は、
Chunk オブジェクトを取得し、そこから Chunk.prototype.then を取得し、
それを埋め込んでチャンクオブジェクトになりすますためである。

ユーザが渡した JSON データは、
チャンクとしては扱えない、プレーンオブジェクトとしてデコードされる。
しかし、ID を用いてプロトタイプトラバーサルを行い、チャンクオブジェクトそのものから
Chunk.prototype.then を引っこ抜いて自分の JSON に埋め込むことができる。

これにより、ユーザの JSON データをデシリアライズした段階で、
プレーンオブジェクトでありながらチャンクらしく振る舞う特性を付与し、
以後はチャンクとして振る舞わせることが出来る。

実質的に、ユーザがチャンクを外部から偽造して挿入できることと等価である。

では、具体的にどのようにチャンク偽造を行うか、次のセクションで説明する。

### チャンク偽造の具体的なコード例

では、具体的なコードを示しながら説明する。
まず、Flight のデシリアライズ関数に到達するまでの流れを説明する。

https://github.com/facebook/react/blob/dd048c3b2d8b5760dec718fb0926ca0b68660922/packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js#L548C1-L606C2

```js
function decodeReplyFromBusboy<T>(
  busboyStream: Busboy,
  webpackMap: ServerManifest,
  options?: { temporaryReferences?: TemporaryReferenceSet }
): Thenable<T> {
  const response = createResponse(
    webpackMap,
    "",
    options ? options.temporaryReferences : undefined
  );
  // 省略
  busboyStream.on("file", (name, value, { filename, encoding, mimeType }) => {
    if (encoding.toLowerCase() === "base64") {
      throw new Error(
        "React doesn't accept base64 encoded file uploads because we don't expect " +
          "form data passed from a browser to ever encode data that way. If that's " +
          "the wrong assumption, we can easily fix it."
      );
    }
    pendingFiles++;
    const file = resolveFileInfo(response, name, filename, mimeType);
    value.on("data", (chunk) => {
      resolveFileChunk(response, file, chunk);
    });
    value.on("end", () => {
      resolveFileComplete(response, name, file);
      pendingFiles--;
      if (pendingFiles === 0) {
        // Release any queued fields
        for (let i = 0; i < queuedFields.length; i += 2) {
          resolveField(response, queuedFields[i], queuedFields[i + 1]);
        }
        queuedFields.length = 0;
      }
    });
  });
  // 省略
  return getRoot(response);
}
```

`decodeReplyFromBusboy(...)`関数はまず、
`createResponse`関数で Response オブジェクトを生成する。

ここの処理はあまり関係がなさそうだが、一応説明する。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L1091C1-L1108C2

```js
export function createResponse(
  bundlerConfig: ServerManifest,
  formFieldPrefix: string,
  temporaryReferences: void | TemporaryReferenceSet,
  backingFormData?: FormData = new FormData()
): Response {
  const chunks: Map<number, SomeChunk<any>> = new Map();
  const response: Response = {
    _bundlerConfig: bundlerConfig,
    _prefix: formFieldPrefix,
    _formData: backingFormData,
    _chunks: chunks,
    _closed: false,
    _closedReason: null,
    _temporaryReferences: temporaryReferences,
  };
  return response;
}
```

Response と言っているが、レスポンスというより、これはただの内部状態を管理するオブジェクトである。
そして`Response`は、内部に`_chunks` マップを保持している。
これは、チャンク ID とチャンクオブジェクトの実体を保持する連想配列である。

続いて、`busboyStream.on(...)` でイベントリスナーを登録する。
イベントリスナーの処理は後ほど解説する。

最後に`getRoot(response)`関数が呼ばれ、
ルート、つまり ID が 0 の チャンクオブジェクトを取得する。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L177C1-L180C2

実際には、`getRoot`関数はほぼラッパーであり、
その内部の`getChunk(response, 0)`関数が実体である。

`getChunk`関数は以下のように実装されている。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L518C1-L540C2

```js
function getChunk(response: Response, id: number): SomeChunk<any> {
  const chunks = response._chunks;
  let chunk = chunks.get(id);
  if (!chunk) {
    const prefix = response._prefix;
    const key = prefix + id;
    // Check if we have this field in the backing store already.
    const backingEntry = response._formData.get(key);
    if (backingEntry != null) {
      // We assume that this is a string entry for now.
      chunk = createResolvedModelChunk(response, (backingEntry: any), id);
    } else if (response._closed) {
        // 省略
    } else {
        // 省略
    }
    chunks.set(id, chunk);
  }
  return chunk;
```

初回なので、チャンク ID 0 に対応するチャンクオブジェクトは存在しない。
ただし、Busboy 経由で `getRoot(response)` が呼ばれる時点では、
通常まだ backing FormData に field `0` が入っていない。
そのため、この経路ではまず `createPendingChunk` で pending な chunk 0 が作られ、
その後 field `0` が到着したときに `resolveModelChunk` で `resolved_model` に進む。
`createResolvedModelChunk` になるのは、既に backing store に値が存在している場合である。

そして、生成されたチャンクオブジェクトを `response._chunks` マップに保存する。

以上で、`getRoot`に関連する呼び出しは終了し、
`decodeReplyFromBusboy`関数も return 文で終了する。
この関数は チャンクオブジェクト、つまり thenable を返す。
thenable なので、await 可能である。

通信開始時の`decodeReplyFromBusboy`関数の呼び出しは、
`return getRoot(response);`で終了するが、
イベントリスナーに登録したコールバックの処理は、
ストリーム処理に合わせて非同期に進行していく。
今回の攻撃に直接関連してくるのは `field` である。
一方、`file` ハンドラは `pendingFiles` と `queuedFields` によって field の解決順を遅らせるため、
到着順を考える上で重要になる。

```js
busboyStream.on("file", (name, value, { filename, encoding, mimeType }) => {
  if (encoding.toLowerCase() === "base64") {
    // エラー処理
  }
  pendingFiles++;
  const file = resolveFileInfo(response, name, filename, mimeType);
  value.on("data", (chunk) => {
    resolveFileChunk(response, file, chunk);
  });
  value.on("end", () => {
    resolveFileComplete(response, name, file);
    pendingFiles--;
    if (pendingFiles === 0) {
      // Release any queued fields
      for (let i = 0; i < queuedFields.length; i += 2) {
        resolveField(response, queuedFields[i], queuedFields[i + 1]);
      }
      queuedFields.length = 0;
    }
  });
});
```

`value`に対してさらにイベントリスナーを登録している。
ただし、実際に chunk を解決する主役は `field` ハンドラ側の `resolveField` 関数である。

```js
busboyStream.on("field", (name, value) => {
  if (pendingFiles > 0) {
    queuedFields.push(name, value);
  } else {
    resolveField(response, name, value);
  }
});
```

この`resolveField` 関数内部で、何度か関数呼び出しを経由し、
最終的に`initializeModelChunk` 関数が呼ばれる。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L1110C1-L1127C2

```js
export function resolveField(
  response: Response,
  key: string,
  value: string
): void {
  // Add this field to the backing store.
  response._formData.append(key, value);
  const prefix = response._prefix;
  if (key.startsWith(prefix)) {
    const chunks = response._chunks;
    const id = +key.slice(prefix.length);
    const chunk = chunks.get(id);
    if (chunk) {
      // We were waiting on this key so now we can resolve it.
      resolveModelChunk(chunk, value, id);
    }
  }
}
```

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L268C1-L299C2

```js
function resolveModelChunk<T>(
  chunk: SomeChunk<T>,
  value: string,
  id: number
): void {
  if (chunk.status !== PENDING) {
    // 省略
    return;
  }
  const resolveListeners = chunk.value;
  const rejectListeners = chunk.reason;
  const resolvedChunk: ResolvedModelChunk<T> = (chunk: any);
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;
  resolvedChunk.reason = id;
  if (resolveListeners !== null) {
    // This is unfortunate that we're reading this eagerly if
    // we already have listeners attached since they might no
    // longer be rendered or might not be the highest pri.
    initializeModelChunk(resolvedChunk);
    // The status might have changed after initialization.
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}
```

前述のとおり、`initializeModelChunk`関数は、
Flight プロトコルのデシリアライズを行う関数である。
ここまで、デシリアライズを行う関数までの道のりを確認した。

では、具体的なチャンク偽造の手順について解説する。

:::message

追記:

この先の第一段階については、その後、脆弱版環境で安全側の動的解析を追加し、
`$@0` が raw chunk 参照 primitive であること、
そして field 順序が `0 -> 1`、`1 -> 0`、`0 -> file -> 1` のいずれでも第一段階が成立することを確認した。

:::

利用するのは、`$@`構文である。
これは、Raw Chunk 参照を行うための構文である。

具体的には、`"then": "$1:__proto__:then",`のように指定してやる。
これにより、Chunk オブジェクトのプロトタイプから then プロパティを引っこ抜き、
自身のオブジェクトの then プロパティに埋め込む。

```json
files = {
    "0": (None, '{"then": "$1:__proto__:then"}'),
    "1": (None, '"$@0"'),
}
```

files で与えられるシリアライズされたチャンクについて、
シリアライズチャンク 1 において 0 番目のチャンクを参照する。
これにより、チャンク 0 の Raw Chunk を参照することができ、
コード上で Chunk オブジェクトそのものを取得できる。

そして、チャンク 0 の Chunk オブジェクトを参照しながら、
チャンク 0 のデシリアライズを開始する。
then プロパティをデシリアライズする際に、プロトタイプトラバーサルを行い、
Chunk.prototype.then を取得し、プレーンオブジェクトの then プロパティに設定する。

このようにして、チャンク 0 のデシリアライズ結果であるプレーンオブジェクトが、
チャンクとして振る舞うようになる。

以上の結果、
ユーザの送信した JSON データをチャンクにみせかけ、
チャンクの偽造という効果を達成できる。

### チャンク偽造に必要なフィールドの設定

なお、以後の処理で、
チャンクとして振る舞うにあたり必要なフィールドを用意する必要がある。
そのため、フィールドを設定している。

これらのフィールドがあれば、サーバ側処理では型のチェックを行っていないため、
十分にチャンクとして振る舞うことが出来る。

これらのフィールドはそれぞれ攻撃に関連するものである。
必要に応じて解説する。

```json
{
    "then": // 省略
    "status": "resolved_model",
    "reason": -1,
    "value": '{"then": "$B0"}',
    "_response": {
        (省略))
        },
    },
}
```

なお、`_response`プロパティについては、
ここでもプロトタイプトラバーサルを用いて、以後の RCE 発火に必要な準備を行っている。
詳細は後述する。

### チャンク偽造オブジェクトの振る舞いと 第二段階への橋渡し

今回は、プレーンオブジェクトにチャンクの特性を付与してチャンクとして振る舞わせている。
ただし、ここで重要なのは、Next.js が最初からこの forged plain object を await しているわけではない、という点である。
`await decodeReplyFromBusboy(...)` が待っているのは、あくまで `getRoot(response)` が返す root chunk、つまり chunk 0 である。

その chunk 0 の初期化中に `"then": "$1:__proto__:then"` が評価され、
`Chunk.prototype.then` が plain object に移植される。
その結果、chunk 0 の解決値が thenable 形状になり、
通常の JavaScript の thenable assimilation によって recovered した `then` が呼び出される。

言い換えると、`$@0` 自体が critical な `then` 呼び出しを起こすわけではない。
`$@0` は chunk 0 そのものを返す参照 primitive に過ぎず、
実際の橋渡しは root chunk 解決後の thenable assimilation で起きる。

https://github.com/vercel/next.js/blob/0e973f71f133f4a0b220bbf1e3f0ed8a7c75e00d/packages/next/src/server/app-render/action-handler.ts#L879C1-L883C16

```js
boundActionArguments = await decodeReplyFromBusboy(busboy, serverModuleMap, {
  temporaryReferences,
});
```

then プロパティには 先程 Chunk.prototype.then を設定したため、
チャンク特有の初期化処理が実行される。

この部分は安全側の動的解析でも裏が取れている。
危険な RCE 文字列は使わず、
最終的に `["trace-stage1", "from-forged-thenable"]` という harmless な配列が Server Action の引数に復元される payload を送ると、
field 順序が `0 -> 1`、`1 -> 0`、`0 -> file -> 1` のいずれでも第一段階は成立した。

## 第二段階: チャンク初期化処理、デシリアライズ二回目と RCE ガジェットの発火

### `initializeModelChunk`関数の呼び出し

いよいよチャンクの初期化処理が開始される。

参考までに、Chunk.prototype.then のコードは以下の通り。
チャンク初期化処理において、this パラメータは偽造したチャンクオブジェクトである。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L124C1-L165C3

```js
Chunk.prototype.then = function <T>(
  this: SomeChunk<T>,
  resolve: (value: T) => mixed,
  reject: (reason: mixed) => mixed
) {
  const chunk: SomeChunk<T> = this;
  // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
  }
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      resolve(chunk.value);
      break;
    case PENDING:
    case BLOCKED:
    case CYCLIC:
      if (resolve) {
        if (chunk.value === null) {
          chunk.value = ([]: Array<(T) => mixed>);
        }
        chunk.value.push(resolve);
      }
      if (reject) {
        if (chunk.reason === null) {
          chunk.reason = ([]: Array<(mixed) => mixed>);
        }
        chunk.reason.push(reject);
      }
      break;
    default:
      reject(chunk.reason);
      break;
  }
};
```

ステータスが`RESOLVED_MODEL`である場合、
チャンクが解決されたと認識し、`initializeModelChunk`関数を呼び出す。

先ほど、偽造したチャンクには、
"status": "resolved_model",
が設定されていた。
この設定をしたのは、チャンク初期化処理を開始させる条件を満たすためである。

こうして、初期化処理として`initializeModelChunk`関数が呼び出される。
前述したが、該当する実装を再掲する。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L446C1-L502C1

```js
function initializeModelChunk(chunk) {
  const rootReference =
    chunk.reason === -1 ? undefined : chunk.reason.toString(16);
  const rawModel = JSON.parse(chunk.value);
  const value = reviveModel(
    chunk._response,
    { "": rawModel },
    "",
    rawModel,
    rootReference
  );
  // ...INITIALIZED/BLOCKED/ERRORED への状態遷移...
}
```

rootReference について説明する。
reason プロパティが -1 の場合、rootReference は undefined になる。
これは、以後の`reviveModel`関数内で 処理を正常に進行させるためである。

前述の通り、`initializeModelChunk` 関数は、
チャンクオブジェクトの value プロパティを JSON としてパースし、
デシリアライズを行う責務を持つ。

この関数の内部について解説する。
value プロパティには、シリアライズされた Flight プロトコルが入っている。
この文字列に対し、JSON.parse を行った後、reviveModel 関数で Flight プロトコルにおけるデシリアライズを行う。
この value プロパティに対するデシリアライズが、二回目のデシリアライズにあたる。

### 攻撃の理論: `parseModelString`関数内の RCE ガジェット

前述の通り、`initializeModelChunk`関数内で
`reviveModel` 関数からまた呼び出される`parseModelString`関数が
特定の構文`$B`を解釈したとき、RCE を発生させられる仕組みが存在する。

この RCE を発生させられる仕組みを、一般的にガジェットと呼称する。

該当コードを抽出すると、以下のとおりである。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L1059C1-L1068C8

```js
case 'B': {
    // Blob
    const id = parseInt(value.slice(2), 16);
    const prefix = response._prefix;
    const blobKey = prefix + id;
    // We should have this backingEntry in the store already because we emitted
    // it before referencing it. It should be a Blob.
    const backingEntry: Blob = (response._formData.get(blobKey): any);
    return backingEntry;
}
```

ここで、
`$B` 自体が直ちに任意コード実行を起こすわけではないことに注意する。
この分岐が行うのは、`response._formData.get(blobKey)` を呼び、その戻り値を返すことだけである。

しかし、攻撃者が一回目のデシリアライズ中に `_formData.get` を `Function` に置き換えておくと、
runtime 的には `Function(blobKey)` が評価され、生成された関数が返る。
そして、その生成された関数が次の plain object の `then` になり、
通常の thenable assimilation によって呼び出される。

したがって、任意コード実行ガジェットの最終到達点は `"$B0"` そのものではなく、
`"$B0"` が返した生成された関数の本体である。

### ガジェット到達のための工夫

このガジェットに到達するために、工夫を行う。

まず、
reviveModel 関数に与える value において、
以下のようにバイナリデータが読み込まれる構文、$B を利用し、
条件分岐に到達できるようにする。

```
    "value": '{"then": "$B0"}',
```

次に、Flight プロトコルのデシリアライズにおいて
プロトタイプトラバーサルを行う。

Flight プロトコルのシリアライズでは前述の通り、
ID の指定によるプロトタイプトラバーサルが可能である。
今回もこれを利用することができる。
これが二回目のプロトタイプトラバーサルである。

なお、ID の指定によるプロトタイプトラバーサルは、
`parseModelString`関数内で、`getOutlinedModel`関数が呼び出されることで
実現されることは、前述の通りである。

まず、`_formData.get` プロパティに
`$1:constructor:constructor`な値を指定することで、
`Function` コンストラクタを埋め込む。
また、`_prefix` プロパティに任意実行したいコマンドを埋め込む。
これにより、`"$B0"` を踏んだときに生成された関数を作る準備が整う。

この点も実際にコードを追い直すと重要で、
`_response._formData.get = "$1:constructor:constructor"` という二回目のプロトタイプトラバーサルは、
第二段階の `"$B0"` 評価中に行われるのではなく、
一回目の `initializeModelChunk(chunk0)` の中で `_response` を revive するときに解決される。
つまり、第二段階のための下準備は、第一段階のデシリアライズ中に完了する。

なお、blobKey に該当する値は
`response._prefix + id`で作成されるが、
このとき id の存在を無視できるようにする必要がある。
これについては、`_prefix` プロパティ、つまり任意コードの最後にセミコロンを入れることで、
`id` の値を無視できるようになる。
例えば、`process.mainModule.require(...);0`のようにする。
この技巧は、末尾に付いてくる `id` を独立した `0` 文として無害化するためのものである。

### `_formData` と `_prefix` の与え方

`_formData`と`_prefix`を含む`_response`プロパティの与え方を説明する。
`reviveModel`関数の呼び出し部分は以下のようになっている。

https://github.com/facebook/react/blob/06cfa99f3740c4b8c16c8d63d97b0f52d90eec43/packages/react-server/src/ReactFlightReplyServer.js#L468C1-L474C7

```js
function initializeModelChunk<T>(chunk: ResolvedModelChunk<T>): void {
  // 省略
  const value: T = reviveModel(
    chunk._response,
    { "": rawModel },
    "",
    rawModel,
    rootReference
  );
  // 省略
}
```

つまり、
チャンクに`_response`プロパティを与えることで、
レスポンスの値が`reviveModel`関数に渡される。
そのため、ガジェットの発火に十分なデータを与えることが出来る。

```json
    "_response": {
        "_prefix": f"(任意コードなので省略)",
        "_formData": {
            "get": "(省略)",
        },
```

ここまでの流れにより、任意コード実行が可能となる。
まず生成されるコードを再現すると、以下のとおりとなる。

```js
const generatedThen = Function("process.mainModule.require(...);0");
```

そして、本当に危険なのは、この `generatedThen` が第二段階の `then` として扱われ、
通常の thenable assimilation により次のように呼ばれる点である。

```js
generatedThen(resolve, reject);
```

この時点で、関数本体に埋め込んだ文が Node サーバ上で評価される。

この点も安全側の動的解析で裏を取ることができた。
実際には危険なコマンド文字列の代わりに、

```js
console.log("[stage2-generated-then]", JSON.stringify({
  arg0Type: typeof arguments[0],
  arg1Type: typeof arguments[1],
  processType: typeof process,
}));
arguments[0](["trace-stage2-log", "from-generated-then-log"]);
```

のような harmless な本体を埋め込んだところ、
サーバログには

```text
[stage2-generated-then] {"arg0Type":"function","arg1Type":"function","processType":"object"}
```

が出力された。
これは、生成された関数の本体が実際に `then(resolve, reject)` として呼ばれ、
しかも Node サーバの `process` を見られる文脈で実行されていることを意味する。

なお、第二段階についても危険な RCE 文字列は使わず、
`["trace-stage2", "from-generated-then"]` を resolve する safe payload で動的解析を行った。
その結果、field 順序が `0 -> 1`、`1 -> 0`、`0 -> file -> 1` のいずれでも第二段階まで成立した。

# 何が問題だったのか

ここまでの流れを踏まえると、react2shell PoC が成立した理由は、単一の「魔法の文字列」があったからではない。複数の前提が同時に揃っていたことが問題だった。

第一に、`getOutlinedModel` が `__proto__` や `constructor` を含む path を own-property 制約なしで辿れてしまった。これにより、本来は単なるデータであるはずの Flight 参照文字列から、prototype chain 上の `then` や `Function` に到達できた。

第二に、runtime は攻撃者が与えた plain object であっても、`status` / `value` / `reason` / `_response` / `then` といった形が揃っていれば、実質的に chunk と同じように扱ってしまう。つまり、ブランドチェックではなく構造的な扱いをしていたことが、第一段階から第二段階への橋渡しになっている。

第三に、`parseModelString` の `case 'B'` は `_formData.get(...)` の戻り値を実行時に Blob だと検証していない。そのため、第一段階で `_formData.get = Function` を仕込めてしまうと、`"$B0"` は `Function(_prefix + "0")` に等価になり、生成された関数を返せてしまう。

最後に、この生成された関数を本当に動かしているのは React 独自の特別な仕組みではなく、通常の JavaScript の thenable assimilation である。`$@` も `$B` も単体では終点ではなく、どちらも「次の then を呼ばせるための足場」として悪用されている。PoC の本質は、この足場作りが二段階にわたって噛み合ってしまう点にある。

# まとめ

今回の react2shell PoC の本質は、
Flight プロトコルにおける二回のデシリアライズと、
その間に二回のプロトタイプトラバーサルを差し込めてしまう点にある。

第一段階では、`$@0` が chunk 0 そのものを返すことを利用して、
`Chunk.prototype.then` を plain object に移植し、
復元値を thenable として振る舞わせる。
ただし、`$@0` 自体が `then` を呼ぶのではなく、
root chunk 解決後の通常の thenable assimilation が橋渡しをしている。

第二段階では、第一段階で forged した `_response` を通して
`_formData.get = Function` を仕込み、`"$B0"` の戻り値として生成された関数を作る。
そして本当に危険なのは、その生成された関数が次の `then` として呼ばれ、
その本体が Node サーバ上で評価される点である。

少なくとも、危険な RCE 文字列を使わない安全側の動的解析では、
この第一段階・第二段階の両方が脆弱版環境で end-to-end に成立することを確認できた。
したがって、PoC の説明としては、
「`$@` と `"$B"` がそれ自体で発火する」のではなく、
「それらを足場にして thenable assimilation まで繋げることで最終的に生成された関数の本体が実行される」
と書くのが、現時点では最も正確だと考えている。

# 参考文献

maple3142 氏による 発端の PoC コード
https://gist.github.com/maple3142/48bc9393f45e068cf8c90ab865c0f5f3

msanft 氏による PoC の解説リポジトリ
https://github.com/msanft/CVE-2025-55182/

Guillermo Rauch 氏による脆弱性報告ツイート
https://x.com/rauchg/article/1997362942929440937

Lachlan Davidson 氏による報告時の PoC リポジトリ
https://github.com/lachlan2k/React2Shell-CVE-2025-55182-original-poc

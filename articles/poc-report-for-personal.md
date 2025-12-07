---
title: "結局なぜRCEが発生するのか？react2shell PoC研究レポート"
emoji: "📑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "react2shell", "javascript", "rsc", "nextjs"]
published: true
---

# はじめに

当記事は、[react2shell](https://react2shell.com/) の PoC 攻撃手法についての調査です。

# 注意事項

当記事の内容は、あくまで PoC 攻撃手法の研究目的です。

また、当記事の内容には間違い・認識違いが含まれる可能性があります。
本番環境での動的な解析を実施しておらず、コードリーディングを中心とした調査であるためです。

また、コードによる裏取りは行っているものの、
生成 AI によるハルシネーションの可能性も否定できません。

最後に、当記事が万が一攻撃を助長する場合、
記事を非公開にいたします。

# 攻撃の概要

今回の PoC では、二回のプロトタイプトラバーサルが存在する。
どちらも、ID を用いてプロパティを辿らせ、
辿れるプロパティに`__proto__`や constructor が存在することにより、
オブジェクトのプロトタイプチェーンを操作する攻撃である。

最初のプロトタイプトラバーサルでは、チャンクの偽造に利用される。
二回目のプロトタイプトラバーサルでは、Function コンストラクタの用意に利用される。

# 事前知識

## React Server Components (RSC) と Flight プロトコル

RSC は、React アプリケーションにおいて、
一部のコンポーネントのみをサーバで実行し、その結果をクライアントにストリーミング、
その結果を元にクライアント側の react でレンダリングを行う仕組みである。

これを実現するために Flight プロトコルが用いられる。
Flight はストリーミング形式でデータを送受信するためのプロトコルであり、
JSON のような構造でありながら、各行に ID がついていたり、色々な拡張が存在する。

## Server Functions と Server References ID

React 18.2 以降では、Server Functions (Actions) と呼ばれる仕組みが導入されている。
これは、クライアント側からサーバ側の関数を呼び出す仕組みである。

この内部実装について説明する。

"use server" がついた関数は、
バンドラなどのプラグインによって、Server Reference として登録される。

クライアントがこの関数を呼び出すときには、
この Server Reference ID を Flight プロトコルでサーバに送信することで、
サーバ側で関数を呼び出すことが出来る。

## チャンクとチャンクオブジェクト

チャンクとは、サーバがデータを送信する単位。
生成されるチャンクには主に 3 種類あるが、一番重要なのは Model チャンクである。
Model チャンクはレンダリングされたツリーや値を表現するものである。

RSC において通常は
サーバ → クライアント の流れでチャンクが送信されるが、
今回のような Server Functions の活用であれば、
クライアント → サーバ の流れでチャンクが送信されることもある。
ただし、ストリームで送信するのではなく、FormData として送信する。
今回はこの処理をじっくり見ていく。

チャンクをやり取りするとき、
React クライアントや React サーバでは、
チャンクを表現するオブジェクト、チャンクオブジェクトを変数に格納して扱う。
これは、Flight プロトコルにおけるチャンクを、
デシリアライズしていく途中経過や、デシリアライズされた結果を格納するオブジェクトである。

ちなみに、チャンクは Promise と同じような性質を持つ。
より正確には、thenable として振る舞う。
こうすることで、チャンクを返す関数を await するようなコードが書ける。
俗に「`ReactPromise`」という表現もある。

簡易コードで表現すると、チャンクの型はこのような形。

```js
type Chunk<T> = {
  status: Status,
  value: any, // 状態によって意味が変わる
  reason: any, // エラー or 追加情報 or StreamController
  _response: Response,
  _children: Array<Chunk<any>> | ProfilingInfo,
  then(resolve: (T) => void, reject?: (any) => void): void,
};
```

ステータスとは、チャンクオブジェクトの状態を表すものである。
チャンクは徐々にデシリアライズするために作られており、
ステータスでどこまでデシリアライズしたか、

- デシリアライズの前にそもそも実行を待っているのか
- 実行は終わったのでデシリアライズ待ちか
- デシリアライズが完了したのか
- エラーが発生したのか

を表現している。

実際の定義は以下の通り。

```js
const PENDING = "pending";
const BLOCKED = "blocked";
const CYCLIC = "cyclic";
const RESOLVED_MODEL = "resolved_model";
const INITIALIZED = "fulfilled";
const ERRORED = "rejected";

// 省略
type ResolvedModelChunk<T> = {
  status: "resolved_model",
  value: string,
  reason: number,
  _response: Response,
  then(resolve: (T) => mixed, reject?: (mixed) => mixed): void,
};
// 省略
type SomeChunk<T> =
  | PendingChunk<T>
  | BlockedChunk<T>
  | CyclicChunk<T>
  | ResolvedModelChunk<T>
  | InitializedChunk<T>
  | ErroredChunk<T>;
```

## Flight プロトコルの文字列構文

今回の PoC に関連する Flight プロトコルの構文について、以下に提示する。

| 文字列      | 意味（戻り値の型イメージ）               |
| ----------- | ---------------------------------------- |
| `"$"`       | リテラルの `"$"` 文字                    |
| `"$@<hex>"` | **チャンク（Promise/thenable）への参照** |
| `"$B..."`   | **Blob への参照**（後述）                |

また、上記のどれにも当てはまらない `$`は、
汎用の参照 ID として扱われ、例えば
Server Functions を呼び出すための Server Reference ID の解決などに利用される。

特殊な構文について紹介する。

### `$@` 構文と Raw Chunk 参照

`$@<hex>` 構文は、Flight プロトコルにおいてチャンクオブジェクトそのものを参照するための構文である。
例えば、`$@1` のように指定することで、「チャンク 0 番への参照」というように利用できる。
意図としては、受け取った値が Promise / まだストリーミング中のデータである場合でも、
表現できるようにするための仕組みと考えられる。

### `$B` 構文と Blob 参照

`$B<hex>` 構文は、Flight プロトコルにおいて Blob への参照を表す。
Blob とは、バイナリデータを表現するためのオブジェクトである。
たとえば、バイナリでアップロードするファイルなどが該当する。
今回は、この Blob 参照が任意コード実行の発火に利用される。詳細は後述。

## チャンクの処理と initializeModelChunk 関数

`initializeModelChunk`関数は、実際にチャンクをデコードする主要な関数である。
処理の内容は複雑であるが、注目すべき点を極力絞って解説する。

```js
function initializeModelChunk<T>(chunk: ResolvedModelChunk<T>): void {
  // 省略

  try {
    const rawModel = JSON.parse(resolvedModel);

    const value: T = reviveModel(
      chunk._response,
      { "": rawModel },
      "",
      rawModel,
      rootReference
    );
    // 省略
  } catch (error) {
    // 省略
  } finally {
    // 省略
  }
}
```

この関数はまず、チャンクオブジェクトの value プロパティを JSON.parse し、
サーバから送信された Flight プロトコルの文字列を
プレーンなオブジェクトへと変換する。
この時点で JSON からオブジェクトへと変換できているが、
Flight プロトコルの特殊な構文はまだ解釈されていない。

次に、`reviveModel`関数を呼び出し、
Flight プロトコルの特殊な構文を解釈しながら、
デシリアライズを完了させる。

まだ解決できていないチャンクを呼び出した場合の処理も付随するが、
今回は省略する。

`reviveModel`関数は、Flight プロトコルのデシリアライズを行う関数である。

通常オブジェクトの場合は再帰的にプロパティを辿りながらデシリアライズを行うが、
今回は省略する。
また、配列やオブジェクトの処理も省略する。

```js
function reviveModel(
  response: Response,
  parentObj: any,
  parentKey: string,
  value: JSONValue,
  reference: void | string
): any {
  if (typeof value === "string") {
    // We can't use .bind here because we need the "this" value.
    return parseModelString(response, parentObj, parentKey, value, reference);
  }
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      // 省略
    }
  }
  return value;
}
```

ここで`parseModelString`関数が呼び出される。
この関数は、Flight プロトコルの文字列構文を解釈する、最重要な関数である。

今回は、脆弱性に関連のする 2 つと、
脆弱性には関連しないが PoC に登場する 1 つの構文の、
計 3 つを解説する。

```js
function parseModelString(
  response: Response,
  obj: Object,
  key: string,
  value: string,
  reference: void | string
): any {
  if (value[0] === "$") {
    // 省略
    switch (value[1]) {
      case "@": {
        // Promise
        const id = parseInt(value.slice(2), 16);
        const chunk = getChunk(response, id);
        return chunk;
      }
    }
    switch (value[1]) {
      case "B": {
        // Blob
        const id = parseInt(value.slice(2), 16);
        const prefix = response._prefix;
        const blobKey = prefix + id;
        // We should have this backingEntry in the store already because we emitted
        // it before referencing it. It should be a Blob.
        const backingEntry: Blob = (response._formData.get(blobKey): any);
        return backingEntry;
      }
    }
    // 省略
    // We assume that anything else is a reference ID.
    const ref = value.slice(1);
    return getOutlinedModel(response, ref, obj, key, createModel);
  }
  return value;
}
```

それぞれの分岐は、
前述の Flight プロトコルの文字列構文に対応している。

`case @` 部分は、Raw Chunk を参照するための構文である。
`$@0` に対応するものである。
後ほど Raw Chunk 参照に利用する。

`case "B"` 部分は、Blob を参照するための構文である。
`$B0` に対応するものである。
後ほど任意コード実行の発火に利用する。

そして、`$1`のような指定の場合、
`getOutlinedModel`関数が呼び出される。
こちらは プロトタイプをバリデーションしないため、
プロトタイプトラバーサルに利用される。

攻撃の流れには二段階が存在するが、
そのどちらでも利用する`$1`の プロトタイプトラバーサルについて、
なぜ脆弱であるかを解説する。
ここからは、`getOutlinedModel`関数の解説に入る。

## `getOutlinedModel`関数と プロトタイプトラバーサル

この関数は、Server Reference、
つまり Server Functions に参照する ID を解決し、
Server Functions の 実体となる関数オブジェクトを、
サーバ側の チャンクオブジェクトに埋め込むために利用される。

しかし、今回は正規の用途で Server Reference を解決するのではなく、
プロトタイプトラバーサルに利用される脆弱な実装を見ていく。

`getOutlinedModel`関数の実装は以下の通り。

```js
function getOutlinedModel<T>(
  response: Response,
  reference: string,
  parentObject: Object,
  key: string,
  map: (response: Response, model: any) => T
): T {
  const path = reference.split(":");
  const id = parseInt(path[0], 16);
  const chunk = getChunk(response, id);
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
  }
  // The status might have changed after initialization.
  switch (chunk.status) {
    case INITIALIZED:
      let value = chunk.value;
      for (let i = 1; i < path.length; i++) {
        value = value[path[i]];
      }
      return map(response, value);
    case PENDING:
    case BLOCKED:
    case CYCLIC:
    // 省略
    default:
      throw chunk.reason;
  }
}
```

脆弱な実装は、for ループでプロパティを辿っていく部分である。
例えば、Server Reference ID が
`1:__proto__:constructor` のように指定された場合、
`reference.split(':')` でまずコロン区切りに分解され、
`["1", "__proto__", "constructor"]` となる。
その後、チャンクの`value`プロパティを起点として、
以下のようにプロパティを辿っていく。

```js
value = value["__proto__"];
value = value["constructor"];
```

このように、チャンクの`value`プロパティから、
任意のプロパティを辿っていくことが出来る。

これがプロトタイプトラバーサルと関連するとどのように悪用できるか、
次のセクションで説明する。

## プロトタイプトラバーサルの手法

JavaScript のオブジェクトは、
プロトタイプチェーンと呼ばれる仕組みを持つ。

実は JavaScript はクラスベースの言語ではなく、
プロトタイプベースの言語である。
そして継承のような仕組みを実現するため、プロトタイプという仕組みを持つ。
ここでは詳しく解説せず、悪用のために必要な特性のみに絞って説明する。

すべてのオブジェクトは、
内部に`[[Prototype]]`=`__proto__`という特別なプロパティ、プロトタイプを持つ。
そしてあるオブジェクトのプロパティ `obj.prop` にアクセスしたとき、

1. まず `obj` 自身のプロパティ `obj.prop` を探す
2. 見つからなければ、`obj` のプロトタイプ `obj.__proto__` のプロパティ `prop` を探す
3. 見つからなければ、さらにそのプロトタイプのプロトタイプ `obj.__proto__.__proto__` のプロパティ `prop` を探す...
4. 以後繰り返し、プロトタイプが null になるまで探す

という仕組みで、プロパティを探す。

また、`constructor`プロパティについて解説する。

:::message

即興だとうまく解説できないので、とりあえず後回し。

:::

# 攻撃の流れ

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
Response と言っているが、レスポンスというより、これはただの内部状態を管理するオブジェクトである。
そして`Response`は、内部に`_chunks` マップを保持している。
これは、チャンク ID とチャンクオブジェクトの実体を保持する連想配列である。

続いて、`busboyStream.on(...)` でイベントリスナーを登録する。
イベントリスナーの処理は後ほど解説する。

最後に`getRoot(response)`関数が呼ばれ、
ルート、つまり ID が 0 の チャンクオブジェクトを取得する。
実際には、`getRoot`関数はほぼラッパーであり、
その内部の`getChunk(response, 0)`関数が実体である。

`getChunk`関数は以下のように実装されている。

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
したがって、チャンクオブジェクトを作成する。
`createResolvedModelChunk`関数でチャンクオブジェクトを作成する。
そして、チャンクオブジェクトを`response._chunks`マップに保存する。
ここで、`getRoot`に関連する呼び出しは終了し、
`decodeReplyFromBusboy`関数も return 文で終了する。
この関数は チャンクオブジェクト、つまり thenable を返す。
thenable なので、await 可能である。

通信開始時の`decodeReplyFromBusboy`関数の呼び出しは、
`return getRoot(response);`で終了するが、

イベントリスナーに登録したコールバックの処理は、
ストリーム処理に合わせて非同期に進行していく。
今回の攻撃に関連してくるのは、`file`である。

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
ここでは、`resolveField`関数が重要である。

この`resolveField` 関数内部で、何度か関数呼び出しを経由し、
最終的に`initializeModelChunk` 関数が呼ばれる。

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

ここから先、コードの裏付けを取れていない。

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
そのため、`await decodeReplyFromBusboy(...)`部分で、
チャンクの振る舞いが開始される。
より具体的には、`await` により then プロパティが呼び出される。

then プロパティには 先程 Chunk.prototype.then を設定したため、
チャンク特有の初期化処理が実行される。

## 第二段階: チャンク初期化処理、デシリアライズ二回目と RCE ガジェットの発火

### `initializeModelChunk`関数の呼び出し

いよいよチャンクの初期化処理が開始される。

参考までに、Chunk.prototype.then のコードは以下の通り。
チャンク初期化処理において、this パラメータは偽造したチャンクオブジェクトである。

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
`_formData.get` プロパティに `Function` コンストラクタを埋め込み、
`_prefix` プロパティに任意のコマンドを埋め込むことで、
`Function(blobKey)` が呼ばれ、
任意コードが実行できるというものである。

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
これにより、`Function(blobKey)`を呼ぶ準備が整う。

:::message

このプロトタイプトラバーサル、一回目のデシリアライズで行われると思います。
チャンク偽造の際のプロパティでトラバーサルが行われるような？
二回目ではなさそう

:::

なお、blobKey に該当する値は
`response._prefix + id`で作成されるが、
このとき id の存在を無視できるようにする必要がある。
これについては、`_prefix` プロパティ、つまり任意コードの最後にセミコロンを入れることで、
`id` の値を無視できるようになる。
例えば、`process.mainModule.require(...);0`のようにする。
この技巧はコメントアウトに近く、コマンドインジェクションの定番技法である。

### `_formData` と `_prefix` の与え方

`_formData`と`_prefix`を含む`_response`プロパティの与え方を説明する。
`reviveModel`関数の呼び出し部分は以下のようになっている。

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
実行されるコードを再現すると、以下のとおりとなる。

```js
Function("process.mainModule.require(...);0");
```

# まとめ

# 参考文献

maple3142 氏による 発端の PoC コード
https://gist.github.com/maple3142/48bc9393f45e068cf8c90ab865c0f5f3

msanft 氏による PoC の解説リポジトリ
https://github.com/msanft/CVE-2025-55182/

Guillermo Rauch 氏による脆弱性報告ツイート
https://x.com/rauchg/status/1997362942929440937

Lachlan Davidson 氏による報告時の PoC リポジトリ
https://github.com/lachlan2k/React2Shell-CVE-2025-55182-original-poc

---
title: "結局なぜRCEが発生するのか？react2shell PoC研究レポート (途中)"
emoji: "📑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "react2shell", "javascript", "rsc", "nextjs"]
published: false
---

# はじめに

当記事は、[react2shell](https://react2shell.com/) の PoC 攻撃手法について、脆弱な React / Next.js の組み合わせをローカルに構築し、コードリーディングと安全側の動的解析を組み合わせて追い直した記録である。

初稿ではコードリーディング中心だったため、「たぶんこう動いているだろう」という仮説が多かった。その後、主要経路については脆弱版環境で裏が取れたので、この記事では前提知識を先に揃えたうえで、「結局どこで `then` が呼ばれ、なぜ RCE まで繋がるのか」をトップダウンに説明し直す。

従来の「二回のデシリアライズと二回のプロトタイプトラバーサル」という整理は、データ処理の観点では今でも有効である。ただし、読者が混乱しやすいのは、その間に JavaScript の thenable assimilation が二回挟まる点である。そこで本稿では、呼び出しネストが追いやすいように、第0段階から第4段階までのモデルに組み替えて説明する。

# 最初に結論

react2shell PoC を理解するうえで重要なのは、`$@0` や `$B0` が単体で RCE を発火させるわけではない、という点である。

PoC の本質は、React Flight の revive と JavaScript の thenable assimilation が交互に噛み合うことで、攻撃者入力から作られた値が最終的に `then(resolve, reject)` として呼ばれる点にある。

呼び出しネストとしては、次の第0段階から第4段階で見ると分かりやすい。

1. 第0段階: `decodeReplyFromBusboy` が Busboy stream を React Flight の内部 Response に接続し、root chunk `0` を返す。
2. 第1段階: root chunk `0` の revive 中に、plain object に `Chunk.prototype.then` が移植される。
3. 第2段階: root chunk の解決値が thenable と判断され、borrowed `Chunk.prototype.then` が呼ばれる。
4. 第3段階: borrowed `then` によって forged object が chunk として再び revive され、`$B0` が generated function を返す。
5. 第4段階: generated function がさらに `then(resolve, reject)` として呼ばれ、この時点で初めて関数本体が実行される。

したがって、`$@0` は raw chunk 参照の足場であり、`$B0` は generated function を返す足場である。本当の発火点は、generated function が JavaScript の thenable assimilation によって呼ばれる瞬間である。

この点は、脆弱版環境に対する安全側の動的解析でも確認できた。危険な OS コマンドは実行していないが、第一段階では `["trace-stage1", "from-forged-thenable"]`、第4段階では `["trace-stage2", "from-generated-then"]` が実際に Server Action へ渡り、さらに trace 用 payload では生成された関数の本体から Node 側 `process` が見えていることも確認できた。

# 検証対象と注意事項

今回の追試で実際に使った組み合わせは以下のとおりである。

- `react/`: `6de32a5a07958d7fc2f8d0785f5873d2da73b9fa`
- `next.js/`: `c09c5f9e278e46b0923c96ef5cf8a6bd9edbaf80`

Next.js が実行時に解決していた `react-server-dom-webpack` は `19.2.0-canary-6de32a5a-20250822` だった。

動的解析はすべてローカル環境で行っており、本番環境への試行は行っていない。また、危険な RCE 文字列は使わず、攻撃経路の成立だけを確認できる harmless な payload に差し替えている。したがって、この記事は「PoC の成立条件を安全側に倒して検証したメモ」として読んでほしい。

それでもなお、私の解釈違いや見落としはありうる。もし明白な誤りが見つかったら、追記か非公開化で対応する。

# 事前知識

## 1. React Server Components / Server Functions / Server Actions

React Server Components は、コンポーネントの一部をサーバ側で実行し、その結果をクライアント側へ送る仕組みである。React 公式ドキュメントでも、Server Components はクライアントバンドルとは別のサーバ環境で先に実行されるコンポーネントとして説明されている。

一方、`"use server"` が付いた関数は React 公式の用語では Server Functions であり、フォームの `action` として使われる文脈では Server Actions とも呼ばれる。Next.js 側でも、サーバ上で動く async 関数をクライアントからネットワークリクエスト越しに呼ぶ仕組みとして説明されている。

react2shell では、この「Server Action の引数を HTTP request から復元する処理」が入口になる。

## 2. Server Actions と multipart/form-data

Server Action の呼び出しでは、引数や関連データが HTTP request body として送られる。React / Next.js のフォーム送信では `FormData` が使われるため、実際のリクエスト本体は `multipart/form-data` になる。

`multipart/form-data` は、ひとつの body の中に複数の part を入れる形式である。part は通常の text field であることもあれば、file stream であることもある。react2shell の経路では、この multipart body の field に Flight payload が含まれる。

ここで必要なのは RFC の細部ではなく、次の理解だけで十分である。

- multipart/form-data は field / file part に分かれる
- parser はそれをイベントとして通知する
- React はそのイベントを Flight の chunk 管理へ接続する

## 3. Busboy とは何か

Busboy は、Node.js で incoming な HTML form data を stream として解析する parser である。README でも、`multipart/form-data` を含む form data をパースし、`file` event と `field` event を通知するストリーミング parser として説明されている。

重要なのは、Busboy 自体は React Flight を理解しない点である。Busboy が理解するのは multipart の構造だけであり、通常 field が来れば `field` event、file part が来れば `file` event として通知する。

```text
HTTP request body
  ↓
Busboy
  ├─ field event: name, value
  ├─ file event: name, stream, metadata
  ├─ finish / close event
  └─ error event
```

react2shell の脆弱性は Busboy 自体にあるわけではない。重要なのは、React の `decodeReplyFromBusboy` が Busboy の event を受け取り、それを React Flight の chunk 管理状態へ接続する点である。

## 4. `decodeReplyFromBusboy` の責務

`decodeReplyFromBusboy` は、Server Action の multipart/form-data 入力を Busboy stream として受け取り、それを React Flight の内部 Response / chunk 管理状態へ接続する関数である。

この関数は、まず React Flight 用の内部 Response object を作る。ここでいう Response は HTTP response ではなく、Flight reply の復元状態を保持する内部オブジェクトである。その後、Busboy に `field` / `file` / `finish` / `error` などの handler を登録し、最後に `getRoot(response)`、つまり root chunk `0` を返す。

責務を箇条書きにすると次のとおりである。

1. `createResponse(...)` で内部 Response を作る
2. Busboy の `field` / `file` event handler を登録する
3. field を `resolveField(...)` に流す
4. file part と field part の順序を `pendingFiles` / `queuedFields` で管理する
5. `getRoot(response)` で root chunk `0` を返す

重要なのは、`decodeReplyFromBusboy(...)` が完成済みの Server Action 引数を即座に返すわけではない点である。返すのは root chunk `0` であり、これは thenable である。したがって、呼び出し側はこの root chunk を `await` / Promise 解決の対象として扱う。

## 5. React Flight プロトコルとは何か

Flight は、React Server Components / Server Functions の値をクライアントとサーバの間でやり取りするための内部シリアライズ形式である。見た目は JSON に近い部分もあるが、単なる JSON ではない。文字列中の特殊構文により、別 chunk への参照、未解決値、Blob 参照、outlined model 参照などを表現できる。

要するに、Flight payload は「データ」ではあるが、単なる静的な JSON データではない。参照解決や遅延解決を含む、実行時オブジェクト復元のための表現である。

## 6. Flight における chunk とは何か

Flight のデコードでは、各値が chunk として管理される。chunk は ID を持ち、React の内部 Response object の `_chunks` map に保存される。

chunk には状態があり、概念的には次のように遷移する。

- `PENDING`: まだ値が届いていない
- `RESOLVED_MODEL`: 文字列としての model は届いたが、まだ revive されていない
- `INITIALIZED`: revive が完了し、実際の値になった
- `ERRORED`: 復元中にエラーが発生した

概念モデルは次のように考えれば十分である。

```ts
type Chunk<T> = {
  status: Status;
  value: any;
  reason: any;
  _response: Response;
  then(resolve: (value: T) => void, reject?: (reason: any) => void): void;
};
```

chunk は `then` を持つため、JavaScript からは thenable として扱われる。そのため、`decodeReplyFromBusboy(...)` が root chunk `0` を返すと、呼び出し側の `await` / Promise 解決処理は `rootChunk0.then(...)` を呼ぶ。

## 7. 今回関係する Flight 文字列構文

今回の PoC で重要なのは、次の三つである。

| 構文 | 概念的な意味 | react2shell での役割 |
| --- | --- | --- |
| `"$@<id>"` | raw chunk 参照 | chunk object そのものへ到達する足場 |
| `"$B<id>"` | backing FormData 参照 | forged `_formData.get` を経由して generated function を返す足場 |
| `"$<id>:path"` | outlined model 参照 + property path | prototype traversal により `then` や `Function` へ到達する足場 |

ここで重要なのは、これらの構文が単体で RCE を起こすわけではない点である。

- `"$@0"` は raw chunk を返すだけである
- `"$B0"` は `response._formData.get(...)` の戻り値を返すだけである
- `"$<id>:path"` は property path を辿るだけである

危険なのは、それらの戻り値が後続の thenable assimilation に渡るように payload 全体を組み立てられる点である。

ここでもうひとつ重要なのは、通常の outlined model 参照と raw chunk 参照は同じではない点である。通常の `"$<id>"` 参照で辿れるのは revive 後の値であり、chunk object そのものではない。これに対して `"$@<id>"` は chunk object そのものへ到達する。そのため、`Chunk.prototype.then` のような chunk 固有の性質を回収する足場としては `"$@"` が必要になる。

## 8. JavaScript の prototype chain

JavaScript の object は、自分自身の property だけでなく、prototype chain 上の property も参照できる。

たとえば、ある object に `toString` が直接定義されていなくても、`Object.prototype.toString` が prototype chain 上に存在すれば、`obj.toString` として参照できる。

```text
obj
  ↓ [[Prototype]]
Object.prototype
  ↓ [[Prototype]]
null
```

`__proto__` は object の内部 `[[Prototype]]` へアクセスする歴史的な accessor である。そのため、property path が `__proto__` を辿れる場合、own property だけでなく prototype object 側へ抜けられる。

## 9. prototype traversal とは何か

prototype traversal とは、`obj["a"]["b"]` のような property path 解決が own property に限定されず、prototype chain 上の property まで辿ってしまう問題である。

通常のデータ参照のつもりで path を解決していても、`__proto__` や `constructor` が path に含まれると、object の prototype や constructor function に到達できる場合がある。

安全な最小例で書くと、次のようになる。

```js
const arr = [];
arr.constructor === Array;
arr.constructor.constructor === Function;
```

react2shell では、これと同じ発想が Flight の outlined model 参照と組み合わさり、通常の JSON-like な値から `Chunk.prototype.then` や `Function` へ到達する。

後続の段階との対応は次のとおりである。

```text
第1段階:
  prototype traversal で Chunk.prototype.then へ到達する

第3段階:
  prototype traversal で Function へ到達する
```

## 10. Function コンストラクタと動的関数生成

JavaScript の `Function` コンストラクタは、文字列から新しい関数 object を作る。たとえば、概念的には `Function("return 1 + 1")` のように、文字列を関数本体としてコンパイルできる。

```js
const fn = Function("return 1 + 1");
fn(); // 2
```

この仕組みは、信頼できる静的文字列に対して使うだけでも避けられがちであり、未信頼入力と組み合わさると重大なコード実行リスクになる。

react2shell で重要なのは、`Function(...)` が呼ばれた瞬間に RCE が完了するわけではない点である。`Function(...)` は generated function を作る。本当に関数本体が実行されるのは、その generated function が後続の thenable assimilation により `then(resolve, reject)` として呼ばれる瞬間である。

## 11. Promise / thenable / thenable assimilation

thenable とは、Promise そのものではなくても `then` メソッドを持つ object のことである。

JavaScript の Promise 解決処理は、値が thenable である場合、その `then` を `resolve` / `reject` callback とともに呼び出し、その結果を Promise の解決結果として取り込む。

概念図で書くとこうなる。

```text
resolve(value)
  ↓
value has callable then?
  ↓ yes
value.then(resolveNext, rejectNext)
```

安全な例は次のとおりである。

```js
const thenable = {
  then(resolve) {
    resolve("ok");
  },
};

await thenable; // "ok"
```

react2shell では、この thenable assimilation が二回悪用される。

1. 1回目は、root chunk の復元値である forged object の `then` が呼ばれる場面である。この `then` の実体は `Chunk.prototype.then` であり、forged object を chunk として再初期化する。
2. 2回目は、`"$B0"` が返した generated function が `then` として呼ばれる場面である。ここで generated function の本体が実行される。

## 12. なぜこれらが組み合わさると危険なのか

ここまでの知識をまとめると、react2shell の危険性は単一の機能にあるわけではない。

- Server Action は HTTP request から引数を復元する
- multipart/form-data は Busboy によって field / file に分解される
- `decodeReplyFromBusboy` は field を Flight chunk 管理へ接続する
- Flight は特殊文字列により参照や遅延値を表現できる
- chunk は thenable である
- prototype traversal により想定外の prototype property へ到達できる
- `Function` constructor は文字列から関数を作れる
- Promise は thenable を見つけると `then(resolve, reject)` を呼ぶ

react2shell は、これらが連鎖した結果、データとして送られたはずの値が最終的に実行可能な `then` へ昇格する脆弱性である。

対応表にすると、こう読める。

| 事前知識 | 後で使う段階 | 役割 |
| --- | --- | --- |
| Server Actions / Server Functions | 第0段階 | なぜ HTTP request から関数引数を復元するのか |
| multipart/form-data | 第0段階 | なぜ request body が field / file に分かれるのか |
| Busboy | 第0段階 | なぜ `field` event / `file` event が出てくるのか |
| `decodeReplyFromBusboy` | 第0段階 | root chunk `0` が返る理由 |
| Flight protocol | 第1・第3段階 | なぜ文字列が特殊解釈されるのか |
| chunk | 第0〜第3段階 | なぜ root chunk が thenable なのか |
| `$@`, `$B`, `$<id>:path` | 第1・第3段階 | raw chunk 参照、FormData 参照、prototype traversal |
| prototype chain | 第1・第3段階 | `__proto__` / `constructor` を辿れる理由 |
| Function constructor | 第3・第4段階 | generated function が作られる理由 |
| thenable assimilation | 第2・第4段階 | `then(resolve, reject)` が呼ばれる理由 |

# 攻撃の全体像

## 第0段階〜第4段階の概要

まず、段階ごとの役割を俯瞰する。

| 段階 | 処理主体 | 主な関数・機構 | 起きること | RCE発火 |
| --- | --- | --- | --- | --- |
| 第0段階 | Next.js / React / Busboy | `decodeReplyFromBusboy`, `createResponse`, `getRoot` | multipart stream を React Flight の chunk 管理へ接続し、root chunk `0` を返す | しない |
| 第1段階 | React Flight | `resolveField`, `resolveModelChunk`, `initializeModelChunk`, `reviveModel`, `parseModelString` | root chunk `0` を revive し、plain object に `Chunk.prototype.then` を移植する | しない |
| 第2段階 | JS Promise | thenable assimilation | forged object の `then` が呼ばれ、`Chunk.prototype.then.call(forgedObject, ...)` になる | しない |
| 第3段階 | React Flight | `Chunk.prototype.then`, `initializeModelChunk`, `reviveModel`, `parseModelString("$B0")` | forged chunk を revive し、generated function を `then` に持つ object を作る | まだしない |
| 第4段階 | JS Promise | thenable assimilation | generated function が `then(resolve, reject)` として呼ばれる | ここで発火 |

従来の「二回のデシリアライズと二回のプロトタイプトラバーサル」という整理は、この表では第1段階と第3段階の revive に対応する。違いは、その間に第2段階と第4段階として thenable assimilation を明示的に挟んでいる点である。

## then 呼び出しは合計3回

この経路では、`then` 呼び出しは合計3回発生する。

1回目は、`decodeReplyFromBusboy(...)` が返した root chunk `0` を待つ通常入口である。2回目は、root chunk の解決値である forged object の `then` が呼ばれる場面である。3回目は、generated function が `then` として呼ばれる場面であり、ここが発火点である。

| 回数 | 呼ばれるもの | 位置づけ |
| ---: | --- | --- |
| 1回目 | `rootChunk0.then(resolve0, reject0)` | root chunk を待つ通常入口 |
| 2回目 | `forgedObject.then(resolve1, reject1)` | 攻撃的 thenable assimilation 1回目。実体は `Chunk.prototype.then` |
| 3回目 | `generatedFunction(resolve2, reject2)` | 攻撃的 thenable assimilation 2回目。ここが発火点 |

短く要約すると次のとおりである。

```text
then 呼び出し総数:
  3回

攻撃上重要な thenable assimilation:
  2回

initializeModelChunk が走る回数:
  2回

RCE が発火する then 呼び出し:
  3回目
```

## React revive と JS thenable assimilation が交互に現れる

この PoC を読みやすくするコアは、次の交互構造で見ることである。

```text
第0段階: 入口準備

第1段階: React Flight revive
  ↓
第2段階: JavaScript thenable assimilation
  ↓
第3段階: React Flight revive
  ↓
第4段階: JavaScript thenable assimilation
```

`"$@0"` と `"$B0"` のどちらも、この交互構造の途中にある足場であって、単独の終点ではない。

## 関数呼び出しパスの全体図

```text
[第0段階: 入口準備]

Next.js action handler
└─ decodeReplyFromBusboy(busboy, serverModuleMap, options)
   ├─ createResponse(...)
   ├─ busboy.on("field", ...)
   ├─ busboy.on("file", ...)
   ├─ busboy.on("finish", ...)
   ├─ busboy.on("error", ...)
   └─ return getRoot(response)
      └─ getChunk(response, 0)
         └─ rootChunk0
```

```text
[then 呼び出し 1回目: root chunk を待つ通常入口]

await / Promise machinery
└─ rootChunk0.then(resolve0, reject0)
   └─ rootChunk0 が pending なら listener を登録
```

```text
[第1段階: root chunk 0 の revive]

Busboy field event
└─ resolveField(response, "0", payload0)
   └─ resolveModelChunk(rootChunk0, payload0, 0)
      └─ initializeModelChunk(rootChunk0)
         ├─ JSON.parse(rootChunk0.value)
         └─ reviveModel(realResponse, ...)
            └─ parseModelString / getOutlinedModel
               ├─ raw chunk 参照
               ├─ prototype traversal
               └─ Chunk.prototype.then を取得

結果:
  rootChunk0.value = forgedObject
```

```text
[第2段階: 1回目の攻撃的 thenable assimilation]

Promise resolution
└─ resolve0(forgedObject)
   └─ forgedObject が then を持つ
      └─ forgedObject.then(resolve1, reject1)
         └─ Chunk.prototype.then.call(forgedObject, resolve1, reject1)
```

```text
[第3段階: forged chunk の revive]

Chunk.prototype.then.call(forgedObject, ...)
└─ forgedObject.status === RESOLVED_MODEL
   └─ initializeModelChunk(forgedObject)
      ├─ JSON.parse(forgedObject.value)
      └─ reviveModel(forgedObject._response, ...)
         └─ parseModelString("$B0")
            └─ forgedResponse._formData.get(forgedResponse._prefix + "0")
               └─ generatedFunction を返す

結果:
  forgedObject.value = { then: generatedFunction }
```

```text
[第4段階: 2回目の攻撃的 thenable assimilation]

Chunk.prototype.then
└─ resolve1(forgedObject.value)
   └─ forgedObject.value が then を持つ
      └─ generatedFunction(resolve2, reject2)
         └─ generated function 本体が実行される
```

短縮図にするとこうなる。

```text
decodeReplyFromBusboy
  ↓
rootChunk0.then(...)                     // then 1回目
  ↓
initializeModelChunk(rootChunk0)         // revive 1回目
  ↓
forgedObject.then(...)                   // then 2回目
  ↓
initializeModelChunk(forgedObject)       // revive 2回目
  ↓
generatedFunction(...)                   // then 3回目、発火点
```

# 第0段階: `decodeReplyFromBusboy` による入口準備

第0段階は、まだ攻撃的な revive が起きる前の通常処理である。Next.js の action handler は multipart request body を Busboy に流し、React 側の `decodeReplyFromBusboy` は Busboy stream を Flight reply の内部状態に接続する。

Next.js 側の入口は、脆弱版コミットでは次の await である。

https://github.com/vercel/next.js/blob/c09c5f9e278e46b0923c96ef5cf8a6bd9edbaf80/packages/next/src/server/app-render/action-handler.ts#L879-L883

```js
boundActionArguments = await decodeReplyFromBusboy(busboy, serverModuleMap, {
  temporaryReferences,
});
```

ここで await されているのは攻撃者が与えた plain object ではなく、`decodeReplyFromBusboy(...)` が返す root chunk `0` である。

React 側の `decodeReplyFromBusboy` は、まず `createResponse(...)` で内部 Response を作り、Busboy の `field` / `file` handler を登録し、最後に `getRoot(response)` を返す。

https://github.com/facebook/react/blob/6de32a5a07958d7fc2f8d0785f5873d2da73b9fa/packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js#L548-L606

```js
function decodeReplyFromBusboy(busboyStream, webpackMap, options) {
  const response = createResponse(
    webpackMap,
    "",
    options ? options.temporaryReferences : undefined
  );
  // ...
  return getRoot(response);
}
```

`createResponse` が作るのは HTTP response ではなく、Flight の復元状態を持つ内部 object である。

```js
export function createResponse(
  bundlerConfig,
  formFieldPrefix,
  temporaryReferences,
  backingFormData = new FormData()
) {
  const chunks = new Map();
  const response = {
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

さらに `getRoot(response)` は実質的に `getChunk(response, 0)` であり、chunk `0` を取り出す。Busboy 経由の通常経路では、この時点では field `0` がまだ backing store に入っていないことが多いため、まず pending な root chunk `0` が作られ、後から `resolveField(...)` で `RESOLVED_MODEL` に進む。

file part が来る場合、React は `pendingFiles` と `queuedFields` によって field 解決順を調整する。これにより file の終了を待ってから field を解決する場合があるため、到着順を考えるうえでは `file` handler も重要になる。ただし、今回 chunk を実際に解決する主役は `field` handler の `resolveField(...)` である。

`getRoot(response)` の実体である `getChunk(response, 0)` を追うと、root chunk `0` が最初に pending として作られ、後から field 到着で解決されることが見える。

```js
function getChunk(response, id) {
  const chunks = response._chunks;
  let chunk = chunks.get(id);
  if (!chunk) {
    const key = response._prefix + id;
    const backingEntry = response._formData.get(key);
    if (backingEntry != null) {
      chunk = createResolvedModelChunk(response, backingEntry, id);
    } else {
      // 通常の multipart 経路ではまず pending chunk が作られる
      // 実際の実装では closed 状態などの分岐もある
    }
    chunks.set(id, chunk);
  }
  return chunk;
}
```

さらに、file と field の相互作用は次のようなコード断片で確認できる。

```js
busboyStream.on("file", (name, value, { encoding }) => {
  if (encoding.toLowerCase() === "base64") {
    throw new Error("base64 encoded file uploads are not accepted");
  }
  pendingFiles++;
  value.on("end", () => {
    pendingFiles--;
    if (pendingFiles === 0) {
      for (let i = 0; i < queuedFields.length; i += 2) {
        resolveField(response, queuedFields[i], queuedFields[i + 1]);
      }
      queuedFields.length = 0;
    }
  });
});

busboyStream.on("field", (name, value) => {
  if (pendingFiles > 0) {
    queuedFields.push(name, value);
  } else {
    resolveField(response, name, value);
  }
});
```

このため、PoC の成立条件を追うときは `field` の値そのものだけでなく、`file` の有無によって `field` の解決時刻がどうずれるかも見ておく必要がある。

第0段階の成果は次のとおりである。

```text
第0段階の成果:
  rootChunk0 が返る
  rootChunk0 は thenable
```

ここでまだ起きていないことも明確にしておく。

```text
第0段階で起きないこと:
  - RCE は起きない
  - forged chunk はまだできていない
  - "$B0" もまだ評価されていない
```

# 第1段階: root chunk 0 の revive と then 移植

第1段階では、field `0` の到着により root chunk `0` が `RESOLVED_MODEL` になり、`initializeModelChunk(rootChunk0)` が呼ばれる。

実際の流れは次のとおりである。

```text
resolveField(response, "0", payload0)
  ↓
resolveModelChunk(rootChunk0, payload0, 0)
  ↓
initializeModelChunk(rootChunk0)
  ↓
JSON.parse(rootChunk0.value)
  ↓
reviveModel(...)
  ↓
parseModelString / getOutlinedModel
```

第1段階で利用されるのが `"$@0"` と outlined model path である。`"$@0"` は raw chunk `0` を返す参照 primitive であり、それ自体が `then` を呼ぶわけではない。重要なのは、raw chunk から `Chunk.prototype.then` を回収し、それを plain object の `then` として移植できる点である。

なぜここで chunk 偽造が必要になるかを、攻撃者側の目的で言い換えるとこうなる。通常の prototype traversal だけでは「ある参照先から property を読む」ことしかできない。しかし chunk object らしく振る舞う plain object を作れると、React runtime 側に「これは chunk だ」と思わせて `initializeModelChunk` や `Chunk.prototype.then` のような chunk 専用の処理へ進ませられる。つまり、第1段階の目的は単なる property 読み出しではなく、plain object を chunk として扱わせるための橋を架けることにある。

概念的には、次のような payload 断片で考えると分かりやすい。

```json
{
  "then": "$1:__proto__:then"
}
```

ここで `"$1"` 側は `"$@0"` で得た raw chunk を参照し、`__proto__:then` の path traversal で `Chunk.prototype.then` に到達する。これにより、root chunk の revive 結果である plain object に `then` が移植される。

元の PoC を追ううえでは、「2個の field が相互参照する」という見方も役に立つ。ただし、ここでは悪用可能な完成形ではなく、役割だけを表す安全な骨格に留める。

```text
field 0:
  forged plain object 本体
  ├─ then: raw chunk 側から回収した then
  ├─ status / value / reason
  └─ _response: 二回目 revive 用の forged response

field 1:
  raw chunk 0 への参照
```

この骨格で重要なのは、field 1 が raw chunk 参照の足場になり、その参照結果を field 0 の revive 中に利用する、という依存関係である。

第1段階で組み上がる forged object は、概念的には次のような形である。

```text
第1段階の成果:
  forgedObject = {
    then: Chunk.prototype.then,
    status: RESOLVED_MODEL 相当,
    value: 二回目 revive 用 model,
    reason: rootReference 調整用値,
    _response: forgedResponse
  }
```

ここで `reason` は、二回目の `initializeModelChunk` で `rootReference` を扱わせるための調整値である。既存の PoC では `-1` を与えることで `rootReference` を `undefined` 扱いに寄せていた。

`rootReference` 周辺をもう少し素直に書くと、`initializeModelChunk` は `chunk.reason` を見て root reference を決める。PoC ではこの値も forged object 側で整えておく必要がある。

```js
function initializeModelChunk(chunk) {
  const rootReference =
    chunk.reason === -1 ? undefined : chunk.reason.toString(16);
  const rawModel = JSON.parse(chunk.value);
  // ...
}
```

また、二回目の revive に必要な下準備の一部は、実はこの第1段階の中で既に終わっている。具体的には、`_response._formData.get = "$1:constructor:constructor"` のような二回目の prototype traversal は、第3段階の `"$B0"` 評価時ではなく、第1段階で `_response` を revive するときに解決される。

この時点では、まだ RCE は起きていない。第1段階の目的は、root chunk の復元値である plain object を thenable 化することである。

# 第2段階: 1回目の攻撃的 thenable assimilation

第1段階で root chunk `0` が解決されると、その解決値である forged object が Promise の resolve に渡される。

しかし forged object は `then` を持つ。そのため JavaScript の Promise 解決処理は、通常どおり `forgedObject.then(resolve, reject)` を呼ぶ。MDN の説明どおり、Promise は thenable を受け取ると、その `then` を保存して後で `resolve` / `reject` callback とともに呼び出す。

この場面を具体化すると、実体は次になる。

```text
forgedObject.then(resolve1, reject1)
  ↓
Chunk.prototype.then.call(forgedObject, resolve1, reject1)
```

ここでの `this` は本物の chunk ではなく、第1段階で作られた forged plain object である。しかし `Chunk.prototype.then` は `this.status`, `this.value`, `this.reason`, `this._response` のような構造を前提に処理を進めるため、必要な形が揃っていると forged object を chunk のように扱ってしまう。

`Chunk.prototype.then` の relevant な骨格は、次のとおりである。

```js
Chunk.prototype.then = function (resolve, reject) {
  const chunk = this;
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
  }
  switch (chunk.status) {
    case INITIALIZED:
      resolve(chunk.value);
      break;
    // ...
  }
};
```

そのため、第2段階の成果は次の一文に尽きる。

```text
第2段階の成果:
  forgedObject.status が RESOLVED_MODEL 相当なので
  initializeModelChunk(forgedObject) に進む
```

ここでもまだ RCE は起きていない。起きているのは「root chunk の解決値が thenable 扱いされ、その borrowed `then` が forged object を chunk として再初期化しに行く」ことだけである。

# 第3段階: forged chunk の revive と generated function の生成

第3段階では、borrowed `Chunk.prototype.then` の内部から `initializeModelChunk(forgedObject)` が呼ばれる。

このとき重要なのは、`reviveModel` に渡る response が React runtime が最初に作った本物の response ではなく、forged object の `_response` である点である。

| revive | 対象 chunk | `reviveModel` に渡る response |
| --- | --- | --- |
| 1回目 | `rootChunk0` | React runtime が作った本物の response |
| 2回目 | `forgedObject` | 攻撃者入力から組み立てられた forged response |

二回目の `initializeModelChunk` は、概念的には次の形で進む。

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
  // ...
}
```

ここで chunk の `value` には、二回目 revive 用の model、たとえば `{"then":"$B0"}` のような文字列が入っている。そして `"$B0"` は、`response._formData.get(response._prefix + id)` の戻り値を返す構文である。

React の実装側では、この分岐はおおむね次のようになっている。

```js
case "B": {
  const id = parseInt(value.slice(2), 16);
  const blobKey = response._prefix + id;
  const backingEntry = response._formData.get(blobKey);
  return backingEntry;
}
```

通常ならここで Blob のような backing entry が返る想定だが、この段階の response は forged response であり、`_formData.get` が callable な値に置き換えられている。そのため `"$B0"` の戻り値として generated function が得られる。

重要なのは、`"$B0"` 自体が直ちに任意コード実行を起こすわけではない点である。この分岐がやっているのは `_formData.get(...)` の戻り値を返すことだけである。危険なのは、その戻り値を `Function` constructor に向けられるよう準備できてしまう点にある。

このとき二回目の prototype traversal は、`_formData.get = "$1:constructor:constructor"` のような形で `Function` へ到達する。さらに `_prefix` は `response._prefix + id` の形で末尾に id が付くため、PoC では payload 側で末尾に無害な文を置いて trailing `0` を吸収するよう工夫していた。ここでは危険な文字列は省略するが、概念的には「`statement;0` のように末尾を無害化する」ための調整である。

forged response 側の形は、危険な文字列を省くと概念的には次のようになる。

```json
{
  "_response": {
    "_prefix": "(省略: trace 用の harmless な本体)",
    "_formData": {
      "get": "(省略: Function へ到達する callable)"
    }
  }
}
```

ここでのポイントは、`reviveModel` が本物の response ではなく forged `_response` を受け取るため、`"$B0"` の解釈結果も forged response に支配されることにある。

第3段階の成果は次のとおりである。

```text
第3段階の成果:
  forgedObject.value = {
    then: generatedFunction
  }
```

ここでもまだ RCE は起きていない。第3段階で起きたのは、generated function が作られ、それが `then` プロパティとして配置された object が得られたことだけである。

# 第4段階: generated function の then 呼び出し

第3段階で forged object の revive が終わると、borrowed `Chunk.prototype.then` は `resolve1(forgedObject.value)` を呼ぶ。

しかし `forgedObject.value` は `then` を持つ object であり、その `then` は第3段階で生成された generated function である。したがって Promise 解決処理は、もう一度 thenable assimilation を行う。

```text
resolve1({ then: generatedFunction })
  ↓
Promise detects thenable
  ↓
generatedFunction(resolve2, reject2)
  ↓
generated function body is evaluated
```

RCE の直接発火点は `"$B0"` ではない。また、`Function(...)` によって generated function が作られた瞬間でもない。本当の発火点は、generated function が thenable assimilation により `then(resolve, reject)` として呼ばれる瞬間である。

第4段階だけを見ると、React 独自の魔法ではなく、JavaScript 標準の Promise 解決ルールが最終トリガになっていることが分かる。

# 何が問題だったのか

ここまでの流れを第0段階から第4段階に対応づけると、問題は次のように整理できる。

| 問題 | 対応段階 | 内容 |
| --- | --- | --- |
| 未信頼 input が Flight revive に到達する | 第0〜第1段階 | Server Action の引数復元経路が入口になる |
| raw chunk 参照が可能 | 第1段階 | `"$@"` により chunk object へ到達できる |
| prototype traversal が可能 | 第1・第3段階 | `__proto__` / `constructor` 経由で prototype 上の値へ到達できる |
| plain object を chunk として扱える | 第2〜第3段階 | brand check ではなく構造的に処理が進む |
| `_formData.get` の戻り値を信頼する | 第3段階 | `"$B"` 分岐が想定型を十分に検証しない |
| thenable assimilation が実行トリガになる | 第2・第4段階 | JS 標準挙動により `then(resolve, reject)` が呼ばれる |

文章としてまとめると、react2shell は単一のバグというより、複数の前提が連鎖した結果である。

第一に、Flight の outlined model 参照が prototype chain 上の property まで辿れてしまった。第二に、plain object であっても `status`, `value`, `reason`, `_response`, `then` が揃うと、chunk のように扱われてしまった。第三に、`"$B"` 分岐が `_formData.get(...)` の戻り値を十分に検証せず、generated function を返す余地があった。最後に、その generated function が JavaScript の thenable assimilation により `then(resolve, reject)` として呼ばれた。

つまり、`"$@0"` も `"$B0"` も、それ自体が最終爆発点ではない。どちらも「次の then を呼ばせるための足場」として悪用されている。

# 動的解析で確認したこと

既存の安全側の動的解析で確認した内容を、新しい第0段階から第4段階のモデルに沿って整理し直す。

前提として、動的解析では危険な OS コマンドは実行せず、trace 用の harmless payload に差し替えて検証した。本番環境への試行も行っていない。また、比較用に通常の `encodeReply(...)` で生成した baseline payload も送り、workbench 自体が正常に動いていることを先に確認した。

baseline では、Server Action `inspectGeneratedPayload(label, payload)` に対し、単に `baseline-label` と `baseline-payload` を渡す multipart fetch action を送った。ここでは HTTP `200` が返り、RSC 応答にも `baseline-label` / `baseline-payload` がそのまま含まれたため、以降の `trace-stage1` / `trace-stage2` 系 payload の観測結果を比較できる土台が取れた。

確認できたことは次のとおりである。

1. 第1段階では、root chunk の revive により plain object に `Chunk.prototype.then` が移植され、forged object が thenable として扱われること。
2. 第2段階では、root chunk の解決値に対して thenable assimilation が走り、borrowed `Chunk.prototype.then` が呼ばれること。
3. 第3段階では、forged object が chunk として再び `initializeModelChunk` に入り、`"$B0"` が generated function を返すこと。
4. 第4段階では、その generated function が `then(resolve, reject)` として呼ばれ、関数本体が Node.js 側で評価されること。

## 第1段階の検証内容

第1段階では、「root chunk の revive 中に `Chunk.prototype.then` を plain object に移植し、その解決値が thenable として扱われるか」を確認した。ここでは危険な処理は使わず、最終的に harmless な配列 `["trace-stage1", "from-forged-thenable"]` が Server Action の引数に復元されれば成立と見なした。

送った forged payload の要点は次のとおりである。

- field `0` に、`then: '$1:__proto__:then'` を持つ plain object を入れる
- 同じ object の `value` に、最終到達点として `["trace-stage1", "from-forged-thenable"]` を入れる
- field `1` に `"$@0"` を入れ、chunk `0` そのものを raw chunk として参照させる

ここで確認したかったのは、`"$@0"` 自体が何かを実行するかではない。`"$@0"` は raw chunk 参照の足場に過ぎず、その参照結果を使って `Chunk.prototype.then` が plain object 側へ移植され、その後の通常の JavaScript thenable assimilation で `then` が呼ばれるかどうかを見ている。

この payload について、field 順序を 3 パターンで試した。

- `0 -> 1`: helper chunk が後着でも成立するか
- `1 -> 0`: helper chunk が先着でも成立するか
- `0 -> file -> 1`: harmless な file part を挟み、`pendingFiles` / `queuedFields` の影響下でも成立するか

成立判定は次の 3 点で行った。

- HTTP 応答が `200` であること
- RSC 応答に `label = "trace-stage1"` と `head = "from-forged-thenable"` が含まれること
- サーバログに `[text-payload] {"label":"trace-stage1",...}` が出ること

結果として 3 パターンすべてで第1段階は成立した。したがって、`"$@0"` は raw chunk 参照 primitive として働くが、それ自体が critical な `then` 呼び出しを起こすのではなく、root chunk の revive 中に plain object へ `Chunk.prototype.then` を移植するための足場として使われている、と整理するのが正確である。

## 第2段階〜第4段階の検証内容

第2段階以降では、「forged `_response` と `"$B0"` により generated function を返させ、その generated function が後段の thenable assimilation で `then(resolve, reject)` として呼ばれるか」を確認した。ここでも危険なコードは使わず、generated function の本体は harmless な `resolve(...)` と `console.log(...)` のみに限定した。

送った forged payload の要点は次のとおりである。

- field `0` に、第一段階と同様に `then: '$1:__proto__:then'` を持つ plain object を入れる
- その `value` は `{"then":"$B0"}` とし、二回目の revive で `then` に generated function を入れさせる
- forged `_response._formData.get` には `'$1:constructor:constructor'` を入れ、`Function` へ到達させる
- forged `_response._prefix` には harmless な `arguments[0](["trace-stage2","from-generated-then"])//` などを入れ、generated function が実行されたときに安全な配列へ resolve するようにする

ここでも重要なのは、`"$B0"` が単体で即実行 primitive ではないことである。`"$B0"` は forged `response._formData.get(response._prefix + id)` の戻り値、つまりここでは generated function を返す足場に過ぎない。実際に本体が動くのは、その generated function が次段の thenable assimilation により `then(resolve, reject)` として呼ばれた瞬間である。

この payload についても、field 順序を 3 パターンで試した。

- `0 -> 1`: helper chunk が後着でも第二段階の generated function まで到達するか
- `1 -> 0`: helper chunk が先着でも同じく generated function まで到達するか
- `0 -> file -> 1`: file part が間に挟まっても第二段階が壊れないか

この 3 パターンでは、危険な RCE 文字列は使わず、`["trace-stage2", "from-generated-then"]` を resolve する safe payload を送った。成立判定は次の 2 点で行った。

- HTTP 応答が `200` であること
- RSC 応答に `label = "trace-stage2"` と `head = "from-generated-then"` が含まれること

その結果、field 順序が `0 -> 1`、`1 -> 0`、`0 -> file -> 1` のいずれでも第4段階まで成立した。これは、`"$B0"` が generated function を返し、その戻り値が後続の thenable assimilation に渡る構成が、安全側 payload でも実際に通ることを示している。

さらに第4段階の直接確認として、危険な RCE 文字列ではなく、生成された関数の本体に harmless な trace を埋め込んだ payload も送った。使った本体は次のとおりである。

```js
console.log("[stage2-generated-then]", JSON.stringify({
  arg0Type: typeof arguments[0],
  arg1Type: typeof arguments[1],
  processType: typeof process,
}));
arguments[0](["trace-stage2-log", "from-generated-then-log"]);
```

この trace payload の成立判定は次の 3 点で行った。

- HTTP 応答が `200` であること
- RSC 応答に `label = "trace-stage2-log"` と `head = "from-generated-then-log"` が含まれること
- generated function 本体由来のサーバログが出ること

この payload ではサーバログに次が出力された。

```text
[stage2-generated-then] {"arg0Type":"function","arg1Type":"function","processType":"object"}
```

これは、generated function の本体が実際に `then(resolve, reject)` として呼ばれ、しかも Node サーバの `process` を見られる文脈で実行されていることを意味する。特に `arg0Type: "function"` と `arg1Type: "function"` は generated function が `then(resolve, reject)` として呼ばれたことを示し、`processType: "object"` はその本体が Node サーバ文脈で評価されたことを示している。

要するに、安全側の動的解析で裏が取れたのは次の一点である。第1段階で plain object が thenable 化され、第2段階で borrowed `then` が動き、第3段階で generated function が作られ、第4段階でその generated function が本当に `then(resolve, reject)` として呼ばれる。

# まとめ

react2shell PoC は、`"$@0"` や `"$B0"` のような単一の特殊構文が直接 RCE を起こす脆弱性ではない。

第0段階で `decodeReplyFromBusboy` が root chunk `0` を返し、第1段階で root chunk の revive により plain object が thenable 化される。第2段階では、その plain object が JavaScript の thenable assimilation により borrowed `Chunk.prototype.then` として呼ばれる。第3段階では forged object が chunk として再び revive され、`"$B0"` を通じて generated function が `then` として得られる。第4段階では、その generated function が再び thenable assimilation により `then(resolve, reject)` として呼ばれ、ここで初めて関数本体が実行される。

したがって、この PoC の本質は、二回の Flight revive と二回の攻撃的 thenable assimilation が交互に噛み合うことで、データとして送られた値が最終的に実行可能な `then` へ昇格してしまう点にある。

従来の「二回のデシリアライズと二回のプロトタイプトラバーサル」という整理は、処理の一部を捉えている。ただし、読者が RCE 発火点を正確に追うには、それだけでは足りない。`decodeReplyFromBusboy` から root chunk が返り、root chunk revive、forged object の `then` 呼び出し、forged chunk revive、generated function の `then` 呼び出しまでを、第0段階から第4段階として順に追う方が、実装上の流れと一致している。

# 参考文献

- React 公式ドキュメント: Server Components  
  https://react.dev/reference/rsc/server-components
- React 公式ドキュメント: `'use server'` / Server Functions  
  https://react.dev/reference/rsc/use-server
- Next.js 公式ドキュメント: Mutating Data / Server Functions and Server Actions  
  https://nextjs.org/docs/app/getting-started/mutating-data
- Next.js 公式ドキュメント: Forms  
  https://nextjs.org/docs/app/guides/forms
- Busboy README  
  https://github.com/mscdex/busboy
- RFC 7578: `multipart/form-data`  
  https://www.rfc-editor.org/rfc/rfc7578
- MDN: `Function()` constructor  
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function
- MDN: Promise resolution and thenables  
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/Promise
- MDN: `Promise.prototype.then()`  
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then
- React source: `decodeReplyFromBusboy`  
  https://github.com/facebook/react/blob/6de32a5a07958d7fc2f8d0785f5873d2da73b9fa/packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js
- React source: `createResponse`, `getChunk`, `resolveField`, `resolveModelChunk`, `initializeModelChunk`, `parseModelString`  
  https://github.com/facebook/react/blob/6de32a5a07958d7fc2f8d0785f5873d2da73b9fa/packages/react-server/src/ReactFlightReplyServer.js
- Next.js source: action handler  
  https://github.com/vercel/next.js/blob/c09c5f9e278e46b0923c96ef5cf8a6bd9edbaf80/packages/next/src/server/app-render/action-handler.ts
- maple3142 氏による発端の PoC コード  
  https://gist.github.com/maple3142/48bc9393f45e068cf8c90ab865c0f5f3
- msanft 氏による PoC の解説リポジトリ  
  https://github.com/msanft/CVE-2025-55182/
- Guillermo Rauch 氏による脆弱性報告ポスト  
  https://x.com/rauchg/article/1997362942929440937
- Lachlan Davidson 氏による報告時の PoC リポジトリ  
  https://github.com/lachlan2k/React2Shell-CVE-2025-55182-original-poc

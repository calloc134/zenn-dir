---
title: "横断的に理解する PostgreSQL の 内部データ構造: MVCC・トランザクション分離・インデックス"
emoji: "🐘"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["postgresql", "mvcc", "index", "rdbms", "database"]
published: true
---

# はじめに

こんにちは。かろっく@calloc134 です。

巷では NewSQL が流行りを見せていますが、皆さんこう思ったことはありませんか？

**我々は、RDBMS ですら、十分に理解していないのではないか？**

PostgreSQL の内部実装については、
インデックスの実装、追記型アーキテクチャ、MVCC、トランザクション分離モデルなどが
断片的に語られることはありますが、横断的な解説はあまり見かけないように思います。

この記事では、PostgreSQL における

- MVCC を用いた読み取り整合性の実装
- トランザクション分離モデル
- インデックスの実装について、横断的に解説していきます。

この記事を通して、PostgreSQL の内部構造に対する解像度を上げましょう！

# 今回割愛したもの

ブログ執筆にあたり、以下の内容は割愛しました。

- トランザクションのステータス管理の実装
- `ctid` の詳細な解説
- `t_infomask` ビットの詳細な解説と効率化の実装
- 書き込みにおける並行制御の実装 (行レベルロックなど)
- 複数トランザクションにまたがる複雑な可視性チェックアルゴリズム
- インデックスの詳細な実装 (b-link tree の詳細な実装)
- HOT (Heap-only tuple) 最適化の解説

ご了承ください。

# PostgreSQL の全体的なアーキテクチャ

PostgreSQL とはリレーショナルデータベース管理システム(RDBMS)の一つであり、
オープンソースで開発されている高機能なデータベースシステムです。

PostgreSQL の特徴として、以下の点が挙げられます。

- 追記型アーキテクチャ (Append-only Architecture)
- マルチバージョン同時実行制御 (MVCC: Multi-Version Concurrency Control)
- インデックス構造
- トランザクション分離モデル

![](/images/postgres-internal-mvcc-index/2026-01-03-16-57-51.png)

一つずつ見ていきましょう。

## 追記型アーキテクチャとは

追記型アーキテクチャとは、
データの更新操作が行われた際に、**既存のデータを上書きするのではなく、
新しいバージョンの物理タプルを追記する形で保存する**方式です。

これにより、古いバージョンの物理タプルは**そのまま残され**ます。
そのため、論理的な行は同じであっても、物理的なタプルが複数存在することになります。

残った古いバージョンの物理タプルは領域を占有し続けるため、
不要になった時点で VACUUM という仕組みによって削除され、領域が再利用されます。
ちょうど、プログラミング言語におけるガベージコレクションのようなイメージです。

## MVCC (Multi-Version Concurrency Control) とは

MVCC (Multi-Version Concurrency Control) とは、
同じ論理レコードに対して複数の物理的なバージョンを保持する仕組みです。

複数の物理的なバージョンを保持することで、ロックなどの仕組みなしに
複数のトランザクションが同時にデータ読み取りを行うことが出来ます。

ロックなどの仕組みは整合性を保つために有効ですが、
一方で読み取りの待ちが発生し、パフォーマンスが低下する可能性があります。

MVCC によって、**読み取りが書き込みをブロックしない**高い並行性を実現しています。
仕組みのとおり、先程の追記型アーキテクチャと切っても切れない関係にあります。

なお、この MVCC を用いた読み取り整合性を実現するために、
**スナップショット**と呼ばれる仕組みが用いられます。
スナップショットとは、**ある瞬間のデータベースの状態を擬似的に固定する**仕組みです。

あるスナップショットに基づく読み取り操作は、
そのスナップショットが取得された瞬間のデータベースの状態が固定されているかのように振る舞います。

:::message
なお、読み取りが書き込みをブロックしないというだけで、書き込みが書き込みをブロックしないわけではない点に注意が必要です。その場合は行レベルロックなどの別種の仕組みが用いられます。書き込みについては少し複雑なので、今回の解説では割愛します。
:::

MVCC によって、PostgreSQL は高い並行性を実現しています。

## インデックス構造

インデックス構造とは、データベースのデータに高速にアクセスするためのデータ構造です。
PostgreSQL は B-tree、Hash、GIN、GiST など、様々なインデックス構造をサポートしています。
これにより、データの検索性能が向上します。

PostgreSQL のインデックスは**データと強く分離**されており、
インデックスエントリは**物理タプルへのポインタを持つ形**で保存されます。
この点において、MySQL (InnoDB) のとる「インデックス内部にデータを内包する」
クラスタ化インデックスとは方針の違いがあります。

この記事では解説を割愛しますが、クラスタ化インデックスについて詳しく知りたい方は、以下の記事を参照してください。
https://zenn.dev/calloc134/articles/4f96b0fe093489

:::message
余談ですが、クラスタ化インデックスとは歴史的には新しい概念であり、
PostgreSQL の設計は古典的な RDBMS の設計思想に近いです。
需要があればまた記事にまとめたいと思います。
:::

この記事では特に B-tree (b-link tree) に焦点を当てます。
PostgreSQL の採用している B-tree は
Lehman & Yao の高並行 B-tree アルゴリズムに基づいており、B-link tree と呼称される形で実装されています。

## トランザクション分離モデル

トランザクションとは、一連のデータベース操作を一つの単位として扱う仕組みです。
ある読み書きをしている最中に、他の読み書きが混入しないようにするため利用されます。
これを実現するための仕組みとして、前述のスナップショットが用いられます。

トランザクションには、ANSI SQL 標準という、データベースの動作を規定した国際標準規格があります。
しかし、PostgreSQL は **ANSI SQL 標準に準拠していない部分があります**。

今回は ANSI SQL 標準に基づいた解説ではなく、
PostgreSQL 独自のトランザクション分離モデルに基づいた解説を行います。

PostgreSQL で普段よく使われるトランザクション分離モデルとして、
「Read Committed」と「Repeatable Read」の 2 つが存在しています。
この 2 つに絞って解説を進めていきます。

以下、説明の便宜上、次のように定義します。

- 進行中の自分のトランザクション → A
- 他人の進行中・完了 トランザクション → X

### 「Read Committed」

Read Committed とは、
実行する各 SQL 文ごとにスナップショットを取得し、
データベース状態の瞬間を切り抜くトランザクション分離モデルです。

A トランザクションを用いて読み取り操作を行う場合を考えます。

X トランザクションが進行中 (未コミット) の場合、
その値変更は A トランザクションからは見えません。

しかし、X トランザクションが完了 (コミット) した場合、
その値変更は A トランザクションから見えるようになります。

そのため、A トランザクション内で同じデータを複数回取得した場合に、
X トランザクションがコミットされる前に取得した 1 回目と、
X トランザクションがコミットされた後に取得した 2 回目で、異なる結果が返ってくる可能性があります。

これにより、以下のような現象が発生します。

- Non-Repeatable Read:
  - A トランザクション内で、1 回目のクエリ実行時と 2 回目のクエリ実行時で、同じ行の値が異なる現象
- Phantom Read:
  - A トランザクション内で、1 回目のクエリ実行時には存在しなかった行が、2 回目のクエリ実行時には存在するようになる現象

### 「Repeatable Read」

Repeatable Read とは、
A トランザクションごと = トランザクションの最初の文が開始したタイミングでスナップショットを取り、データベース状態の瞬間を切り抜くトランザクション分離モデルです。

A トランザクション進行中において、
進行中(未コミット)の X トランザクションの値変更は反映されず、一貫性があります。

更に、A トランザクション進行中において、
**完了(コミット)の X トランザクションの値変更も反映されず**、一貫性があります。

これにより、先程の現象が発生しなくなります。

- Non-Repeatable Read の防止:
  - A トランザクション内で、1 回目のクエリ実行時と 2 回目のクエリ実行時で、
    同じ行の値が常に同じになることが保証される
- Phantom Read の防止:
  - A トランザクション内で、1 回目のクエリ実行時に存在しなかった行は、
    2 回目のクエリ実行時にも存在しないことが保証される

:::message

本来の Repeatable Read は、ANSI SQL 標準に基づくと
Phantom Read を防止できません。
今回の解説では PostgreSQL 準拠であるため、
Phantom Read も防止できる形で説明しています。

:::

### 2 つの違い

この 2 つの違いは、

**スナップショットを取るタイミングが「文ごと」か「トランザクションごと」か** にあります。

詳細は後ほど実装を踏まえて解説します。

# PostgreSQL におけるデータ構造の詳細

ここから、PostgreSQL の整合性の実装の詳細について解説します。

整合性の理解に必要なデータ構造として、以下のものがあります。

- トランザクション (transaction)
- 物理タプル (heap tuple)
- スナップショット (snapshot)

![](/images/postgres-internal-mvcc-index/2026-01-03-17-06-28.png)

また、二種類の ID が登場します。

- トランザクション ID (XID)
- コマンド ID (command ID)

それぞれについて解説します。

## トランザクションのデータ構造

前述の通り、
トランザクションとは、一連のデータベース操作を一つの単位として扱う仕組みです。

トランザクションには、一意な ID として
**トランザクション ID** (以後、XID として表現)という ID が割り当てられます。

XID は自然数で表現され、PostgreSQL インスタンス全体で一意です。
トランザクションの最初の書き込みを始めた瞬間に XID が割り当てられるため、
**XID でトランザクションの書き込み開始順序を判別できます**。

XID は連続するわけではなく、飛び飛びに割り当てられることもあります。XID は 32bit の符号なし整数で表現されます。

また、トランザクションはステータスを持ちます。

:::message
余談: トランザクションの構造体自体がステータスを保持しているわけではなく、ステータスは別の場所に保存されています。
今回は簡単のため、ここの解説は割愛します。
:::

## コマンド ID とは

PostgreSQL では、
自分のトランザクション内で実行した変更と、自分以外のトランザクション内で実行した変更を区別する必要があります。

自分以外のトランザクション内で実行した変更については、
そのトランザクションがコミットされていない限りは変更が見えないようにする必要があります。

逆に、自分のトランザクション内で実行した変更については
トランザクションがコミットされていない場合でも、自分のトランザクション内では変更が見えるようにする必要があります。

**自分のトランザクション内の変更を区別**するために、
**コマンド ID (command ID)** というものが用いられます。
このコマンド ID とは、
あるトランザクションの中で実行された各コマンドに対して割り当てられる自然数の ID であり、実行された順番に割り当てられます。

トランザクション ID と同様、コマンド ID も重要な役割を果たします。

## 物理タプルのデータ構造

物理タプルとは、PostgreSQL におけるデータベース内の実際のデータ行を表す構造体です。
物理タプルは、以下のパラメータを持ちます。

| パラメータ | 説明                                                            |
| ---------- | --------------------------------------------------------------- |
| `ctid`     | タプル ID。物理タプルの位置情報を示すポインタ                   |
| `t_xmin`   | このタプルを生成した XID                                        |
| `t_xmax`   | このタプルを削除 or 更新したトランザクションの XID              |
| `cmin`     | このタプルを生成した所属トランザクション内のコマンド ID         |
| `cmax`     | このタプルを削除 or 更新した所属トランザクション内のコマンド ID |

それぞれのパラメータについて、簡単に解説します。

- **`ctid`**
  - 物理タプルの位置情報を示すポインタ
  - タプル ID としても機能する
  - インデックスは `ctid` に対するポインタを持ち、
    `ctid` を指し示すことで物理タプルに辿り着く
- **`t_xmin`**
  - このタプルを生成したトランザクションの XID
  - この XID によって、このタプルがどのトランザクションによって挿入されたかがわかる
- **`t_xmax`**
  - このタプルを削除 or 更新したトランザクションの XID
  - この XID によって、このタプルがどのトランザクションによって削除 or 更新されたかがわかる
  - 削除 or 更新されていない場合は 0 が入る
  - `t_xmax` = 0 の場合、そのタプルは削除 or 更新されていない最新のタプルである可能性が高い
  - **`t_xmax` が行ロックを示している場合もある**
    - その場合は、削除 or 更新なのか、
      それとも行ロックなのかを `t_infomask` ビットで判別できる
    - 今回は解説の都合上割愛
- **`cmin`**
  - このタプルを生成した所属トランザクション内のコマンド ID
  - このコマンド ID によって、
    このタプルが所属トランザクション内でどのコマンドによって挿入されたかがわかる
- **`cmax`**
  - このタプルを削除 or 更新した所属トランザクション内のコマンド ID
  - このコマンド ID によって、
    このタプルが所属トランザクション内でどのコマンドによって削除 or 更新されたかがわかる

:::message
簡単のため省略しましたが、
`ctid` とはタプルヘッダとしてそのようなパラメータがあるのではなく、ブロック番号・オフセットからなる物理位置情報です。
今回は解説の都合上、`ctid` をタプル ID として説明しています。具体的な実装は割愛します。
:::

:::message
余談ですが、
効率化のために、一つ新しいバージョンの `ctid` を指す `t_ctid` も別途存在します(最新の場合は自己参照)。
古いタプルは新しいバージョンのタプルを連結リストで指し示す形となります。
今回は解説の都合上、割愛します。
:::

:::message
簡単のため省略しましたが、
`cmin`/`cmax` は別々のパラメータに分かれているのではなく、
`t_cid` という一つのパラメータにまとめられています。
今回は解説の都合上、分けて説明しています。具体的な実装は割愛します。
:::

:::details 物理タプルのデータ構造のソースコード実装

実際の PostgreSQL ソースコードでは、物理タプルのヘッダは以下のように定義されています。

```c
// HeapTupleFields 構造体: t_xmin, t_xmax, t_cid を保持
typedef struct HeapTupleFields
{
    TransactionId t_xmin;       /* inserting xact ID */
    TransactionId t_xmax;       /* deleting or locking xact ID */

    union
    {
        CommandId   t_cid;      /* inserting or deleting command ID, or both */
        TransactionId t_xvac;   /* old-style VACUUM FULL xact ID */
    }           t_field3;
} HeapTupleFields;

// HeapTupleHeaderData 構造体: タプルヘッダ全体
struct HeapTupleHeaderData
{
    union
    {
        HeapTupleFields t_heap;
        DatumTupleFields t_datum;
    }           t_choice;

    ItemPointerData t_ctid;     /* current TID of this or newer tuple */

    uint16      t_infomask2;    /* number of attributes + various flags */
    uint16      t_infomask;     /* various flag bits */
    uint8       t_hoff;         /* sizeof header incl. bitmap, padding */

    bits8       t_bits[FLEXIBLE_ARRAY_MEMBER];  /* bitmap of NULLs */
};
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/include/access/htup_details.h#L121-L180

:::

## スナップショットのパラメータ

スナップショットの重要なパラメータとして、以下のものがあります。

| パラメータ | 説明                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xmin`     | 実行中トランザクションのうち最小のもの                                                                                                                                        |
| `xmax`     | 完了したトランザクションのうち最大のもの +1                                                                                                                                   |
| `xip`      | `xmin` 以上かつ `xmax` 未満の範囲において<br>スナップショット取得時に「進行中 (未完了)」と判定された<br>XID のリスト (in-progress XID の略)                                   |
| `curcid`   | スナップショットを作成した自トランザクションにおいて<br>どこまでの文の変更を見えるようにするかを示すコマンド ID<br>現在までに実行している最新の文に対応するコマンド ID が入る |

:::message
余談: `xmax` は当初
次に割り当てられる予定のトランザクション ID、
つまり 一つ未来のトランザクション ID を `xmax` に利用していました。

しかし PostgreSQL 8.3 から、
完了したトランザクションのうち最大のもの +1 に変更されました。
:::

可視性チェックの詳しいアルゴリズムも含めたパラメータ解説は後述します。

:::details スナップショットのデータ構造のソースコード実装

実際の PostgreSQL ソースコードでは、スナップショットは以下のように定義されています。

```c
typedef struct SnapshotData
{
    SnapshotType snapshot_type; /* type of snapshot */

    /*
     * An MVCC snapshot can never see the effects of XIDs >= xmax.
     * It can see the effects of all older XIDs except those listed in the snapshot.
     * xmin is stored as an optimization to avoid needing to search the XID arrays.
     */
    TransactionId xmin;         /* all XID < xmin are visible to me */
    TransactionId xmax;         /* all XID >= xmax are invisible to me */

    /*
     * For normal MVCC snapshot this contains the all xact IDs that are in progress.
     * note: all ids in xip[] satisfy xmin <= xip[i] < xmax
     */
    TransactionId *xip;
    uint32      xcnt;           /* # of xact ids in xip[] */

    TransactionId *subxip;      /* subxact IDs that are in progress */
    int32       subxcnt;        /* # of xact ids in subxip[] */
    bool        suboverflowed;  /* has the subxip array overflowed? */

    CommandId   curcid;         /* in my xact, CID < curcid are visible */
    /* ... 以下省略 ... */
} SnapshotData;
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/include/utils/snapshot.h#L138-L211

:::

# 可視性チェックアルゴリズム

PostgreSQL における可視性チェックアルゴリズムは、

- スナップショットの可視性チェックアルゴリズム
- 物理タプルの可視性チェックアルゴリズム

の 2 段階で構成されています。
そして物理タプルの可視性チェックアルゴリズム内部で、
スナップショットの可視性チェックアルゴリズムを呼び出す形で動作します。

まず、スナップショットの可視性チェックアルゴリズムについて解説します。

## スナップショットの可視性チェックアルゴリズム

まず、スナップショットのパラメータ `xmin/xmax` について、詳しく解説します。

先程、`xip` について解説しました。
理論的には、すべてのトランザクションにおいて、

- 進行中 (未完了) の場合 → 不可視
- 完了 (コミット or アボート) の場合 → 可視 / 不可視

の判定を行うことで、スナップショットの可視性をチェックできます。
しかし、この方法だとすべてのトランザクションについて判定を行う必要があり、非効率です。

ここで、`xmin`/`xmax` のパラメータが登場します。
`xmin`/`xmax` とは、**わかりきっている範囲をあらかじめ除外するためのパラメータ**です。

これにより、**判定すべきトランザクション数を大幅に削減し、処理を高速化**しています。

`xmin`/`xmax` の意味は以下の通りです。

**`xmin` について:**

- 実行中トランザクションのうち最小のもの
- `xmin` 未満のトランザクションはすべて完了していると考えられる
- つまり、XID < 実行中トランザクションのうち最小のもの に当てはまるトランザクションはすべて完了していると考えられる
  - 完了 = COMMITTED or ABORTED
  - もし COMMITTED されていたなら、トランザクションを可視のものとして扱う
  - もし ABORTED されていたなら、トランザクションを不可視のものとして扱う

**`xmax` について:**

- 完了したトランザクションのうち最大のもの +1
- `xmax` 以降のトランザクションは、すべて未完了・不可視 (= 実行中 or まだ開始すらしていない) と考えられる
- つまり、将来のものとしてすべて不可視と扱うことができる
- 比較対象の XID >= `xmax` = 完了したトランザクションのうち最大のもの +1 に当てはまるトランザクションはすべて未完了と考えられる

:::message
余談: XID は自然数なので、式変形をすると
実質的には XID > 完了したトランザクションのうち最大のもの
と同義になります。
:::

これらを踏まえて、スナップショットの可視性チェックアルゴリズムは以下のように動作します。

1. 可視性をチェックしたいトランザクションの XID を `XID` とします
2. `XID < xmin` の場合
   - `XID` は完了していると考えられるため、
     - `XID` が COMMITTED されていたなら可視
     - `XID` が ABORTED されていたなら不可視
3. `XID >= xmax` の場合
   - `XID` は未完了と考えられるため、不可視
4. `xmin <= XID < xmax` の場合
   - `XID` が `xip` に含まれている場合、未完了と考えられるため、不可視
   - `XID` が `xip` に含まれていない場合、完了していると考えられるため、
     - `XID` が COMMITTED されていたなら可視
     - `XID` が ABORTED されていたなら不可視

このようにして、スナップショットの可視性チェックアルゴリズムは動作します。

![](/images/postgres-internal-mvcc-index/2026-01-03-16-38-40.png)

:::details XidInMVCCSnapshot 関数のソースコード実装

実際の PostgreSQL ソースコードでは、`XidInMVCCSnapshot` 関数が上記のアルゴリズムを実装しています。

```c
/*
 * XidInMVCCSnapshot
 *      Is the given XID still-in-progress according to the snapshot?
 */
bool
XidInMVCCSnapshot(TransactionId xid, Snapshot snapshot)
{
    /* Any xid < xmin is not in-progress */
    if (TransactionIdPrecedes(xid, snapshot->xmin))
        return false;
    /* Any xid >= xmax is in-progress */
    if (TransactionIdFollowsOrEquals(xid, snapshot->xmax))
        return true;

    /* xmin <= xid < xmax の範囲は xip 配列を検索 */
    if (pg_lfind32(xid, snapshot->xip, snapshot->xcnt))
        return true;

    return false;
}
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/backend/utils/time/snapmgr.c#L1868-L1958

:::

## 物理タプルの可視性チェックアルゴリズム

次に、物理タプルの可視性チェックアルゴリズムについて解説します。
この物理タプルの可視性チェックアルゴリズムの内部で、
先程解説したスナップショットの可視性チェックアルゴリズムが呼び出される形で動作します。

ざっくりと解説すると、物理タプルの可視性チェックアルゴリズムは以下の 2 点を確認します。

- **A.** 特定のスナップショットから見て、挿入された際のトランザクションは見れるか？
- **B.** 特定のスナップショットから見て、削除 or 更新された際のトランザクションは見れるか？

**挿入(A)が見えて 削除 or 更新(B)が見えなければ、そのタプルは可視である**、となります。
このようにして、単一論理行に対する複数の物理タプルのうち、どの物理タプルが可視であるかを判定します。

単一論理行に対する複数の物理タプルが存在した場合でも、可視性チェックアルゴリズムによって
最終的に単一論理行に対応するタプルが 0 or 1 個の物理タプルに絞り込まれます。

では、タプルの可視性チェックアルゴリズムの詳細を見ていきましょう。
ここでは簡単のため、複数トランザクションに関連する複雑なケースは割愛します。

### 前提

1. 可視性をチェックしたい物理タプルの `t_xmin` および `t_xmax` を取得
2. 現在の自分のトランザクションの ID `XID` を取得
3. スナップショットを取得 (スナップショットを作成するタイミングはトランザクション分離モデルによって異なるため後述)

### A. 挿入側のタプル可視性チェック (`t_xmin` について)

1. `t_xmin` のトランザクションが ABORTED されている場合、タプルは不可視 (挿入がなかったものとして扱うため)
2. `t_xmin` のトランザクションが自分のトランザクションなら
   1. 同一トランザクションの処理を開始
   2. タプルの `cmin` と現在のスナップショットの `curcid` を取得
   3. `cmin >= curcid` の場合、タプルは不可視 (自分のトランザクション内でも挿入前のため)
   4. `cmin < curcid` の場合、挿入は可視として、B へ進む (自分のトランザクション内で挿入済みのため)
3. `t_xmin` のトランザクションが自分のトランザクションでないなら
   1. スナップショットの可視性チェックアルゴリズムを用いて `t_xmin` の可視性をチェック
   2. 可視の場合、挿入が可視なので B へ進む (他人のトランザクションによって挿入されたが、そのスナップショットから見て変更がコミットされているため)
   3. 不可視の場合、タプルは不可視 (他人のトランザクションによって挿入されたが、そのスナップショットから見て変更がコミットされていないため)

### B. 削除 or 更新側のタプル可視性チェック (`t_xmax` について)

1. 以下の条件に該当する場合、タプルは可視 (削除 or 更新されていない最新のタプルであるため)
   - `t_xmax == 0`
   - `t_xmax` のトランザクションが ABORTED されている場合
   - `t_xmax` の数値が行ロックを示しているとわかる場合 (`t_infomask` ビットを見て判定)(削除 or 更新ではなく、行ロックのみが行われている場合)
2. `t_xmax` のトランザクションが自分のトランザクションなら
   1. 同一トランザクションの処理を開始
   2. タプルの `cmax` と現在のスナップショットの `curcid` を取得
   3. `cmax >= curcid` の場合、タプルは可視 (自分のトランザクション内でも削除 or 更新前のため)
   4. `cmax < curcid` の場合、タプルは不可視 (自分のトランザクション内で削除 or 更新済みのため)
3. `t_xmax` のトランザクションが自分のトランザクションでないなら
   1. スナップショットの可視性チェックアルゴリズムを用いて `t_xmax` の可視性をチェック
   2. 可視の場合、タプルは不可視 (他人のトランザクションによって削除 or 更新されたが、そのスナップショットから見て変更がコミットされているため)
   3. 不可視の場合、タプルは可視 (他人のトランザクションによって削除 or 更新されたが、そのスナップショットから見て変更がコミットされていないため)

このようにして、物理タプルの可視性チェックアルゴリズムは動作します。
A/B において、ステップ 2、ステップ 3 のアルゴリズムは、処理の内容が同じであることがわかります。

:::details HeapTupleSatisfiesMVCC 関数のソースコード実装

実際の PostgreSQL ソースコードでは、`HeapTupleSatisfiesMVCC` 関数が上記のアルゴリズムを実装しています。
以下はその核心部分です。

```c
static bool
HeapTupleSatisfiesMVCC(HeapTuple htup, Snapshot snapshot, Buffer buffer)
{
    HeapTupleHeader tuple = htup->t_data;

    /* A. t_xmin (挿入トランザクション) の可視性チェック */
    if (!HeapTupleHeaderXminCommitted(tuple))
    {
        if (HeapTupleHeaderXminInvalid(tuple))
            return false;   /* xmin が ABORTED なら不可視 */

        /* 自分のトランザクションによる挿入の場合 */
        if (TransactionIdIsCurrentTransactionId(HeapTupleHeaderGetRawXmin(tuple)))
        {
            if (HeapTupleHeaderGetCmin(tuple) >= snapshot->curcid)
                return false;   /* inserted after scan started */

            if (tuple->t_infomask & HEAP_XMAX_INVALID)
                return true;    /* xmax 無効なら可視 */

            if (HEAP_XMAX_IS_LOCKED_ONLY(tuple->t_infomask))
                return true;    /* ロックのみなら可視 */

            /* 自トランザクションで削除済みかチェック */
            if (HeapTupleHeaderGetCmax(tuple) >= snapshot->curcid)
                return true;    /* deleted after scan started */
            else
                return false;   /* deleted before scan started */
        }
        /* 他トランザクションによる挿入の場合 */
        else if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmin(tuple), snapshot))
            return false;       /* まだ進行中なので不可視 */
        else if (TransactionIdDidCommit(HeapTupleHeaderGetRawXmin(tuple)))
            /* コミット済みなので B へ進む */;
        else
            return false;       /* ABORTED なので不可視 */
    }

    /* B. t_xmax (削除/更新トランザクション) の可視性チェック */
    if (tuple->t_infomask & HEAP_XMAX_INVALID)
        return true;            /* xmax 無効なら可視 */

    if (HEAP_XMAX_IS_LOCKED_ONLY(tuple->t_infomask))
        return true;            /* ロックのみなら可視 */

    /* 自分のトランザクションによる削除の場合 */
    if (TransactionIdIsCurrentTransactionId(HeapTupleHeaderGetRawXmax(tuple)))
    {
        if (HeapTupleHeaderGetCmax(tuple) >= snapshot->curcid)
            return true;        /* deleted after scan started */
        else
            return false;       /* deleted before scan started */
    }

    /* 他トランザクションによる削除の場合 */
    if (XidInMVCCSnapshot(HeapTupleHeaderGetRawXmax(tuple), snapshot))
        return true;            /* まだ進行中なので可視 */

    if (!TransactionIdDidCommit(HeapTupleHeaderGetRawXmax(tuple)))
        return true;            /* ABORTED なので可視 */

    return false;               /* コミット済みなので不可視 */
}
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/backend/access/heap/heapam_visibility.c#L861-L1017

:::

# トランザクション分離モデルの実装差分

前述の通り、PostgreSQL には大きく

- 「Read Committed」
- 「Repeatable Read」

の 2 つのトランザクション分離モデルが存在します。

これら 2 つのトランザクション分離モデルの違いは、
**スナップショットを取得するタイミングの違い**です。

:::details トランザクション分離レベルの定義のソースコード実装

実際の PostgreSQL ソースコードでは、トランザクション分離レベルは以下のように定義されています。

```c
/* Xact isolation levels */
#define XACT_READ_UNCOMMITTED   0
#define XACT_READ_COMMITTED     1
#define XACT_REPEATABLE_READ    2
#define XACT_SERIALIZABLE       3

/*
 * We implement three isolation levels internally.
 * The weakest uses one snapshot per statement;
 * the two stronger levels use one snapshot per database transaction.
 */
#define IsolationUsesXactSnapshot() (XactIsoLevel >= XACT_REPEATABLE_READ)
#define IsolationIsSerializable() (XactIsoLevel == XACT_SERIALIZABLE)
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/include/access/xact.h#L36-L53

:::

## 「Read Committed」 の実装

「Read Committed」の場合、
スナップショットはトランザクション内の各文が開始したタイミングで取得されます。

そのため、各文の開始時点でスナップショットを取得し、
そのスナップショットを用いて可視性チェックアルゴリズムを実行することで「Read Committed」のトランザクション分離モデルを実装しています。

## 「Repeatable Read」 の実装

「Repeatable Read」の場合、
スナップショットはトランザクションの最初の文が開始したタイミングで取得されます。

そのため、トランザクションの最初の文が開始したタイミングでスナップショットを取得し、
そのスナップショットをトランザクションの終了まで保持し続けることで
「Repeatable Read」のトランザクション分離モデルを実装しています。

:::details GetTransactionSnapshot 関数のソースコード実装

実際の PostgreSQL ソースコードでは、`GetTransactionSnapshot` 関数がスナップショット取得のタイミングを制御しています。

```c
Snapshot
GetTransactionSnapshot(void)
{
    /* First call in transaction? */
    if (!FirstSnapshotSet)
    {
        /*
         * In transaction-snapshot mode (Repeatable Read / Serializable),
         * the first snapshot must live until end of xact.
         */
        if (IsolationUsesXactSnapshot())
        {
            /* First, create the snapshot in CurrentSnapshotData */
            if (IsolationIsSerializable())
                CurrentSnapshot = GetSerializableTransactionSnapshot(&CurrentSnapshotData);
            else
                CurrentSnapshot = GetSnapshotData(&CurrentSnapshotData);
            /* Make a saved copy */
            CurrentSnapshot = CopySnapshot(CurrentSnapshot);
            FirstXactSnapshot = CurrentSnapshot;
            /* ... スナップショットを登録 ... */
        }
        else
            /* Read Committed: 毎回新しいスナップショットを取得 */
            CurrentSnapshot = GetSnapshotData(&CurrentSnapshotData);

        FirstSnapshotSet = true;
        return CurrentSnapshot;
    }

    /* Repeatable Read/Serializable: 最初のスナップショットを再利用 */
    if (IsolationUsesXactSnapshot())
        return CurrentSnapshot;

    /* Read Committed: 毎クエリで新しいスナップショットを取得 */
    CurrentSnapshot = GetSnapshotData(&CurrentSnapshotData);

    return CurrentSnapshot;
}
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/backend/utils/time/snapmgr.c#L272-L344

:::

:::details GetSnapshotData 関数のソースコード実装

スナップショットの生成は `GetSnapshotData` 関数で行われます。ここで `xmin`/`xmax`/`xip` が設定されます。

```c
/*
 * GetSnapshotData -- returns information about running transactions.
 *
 * The returned snapshot includes xmin (lowest still-running xact ID),
 * xmax (highest completed xact ID + 1), and a list of running xact IDs
 * in the range xmin <= xid < xmax.  It is used as follows:
 *      All xact IDs < xmin are considered finished.
 *      All xact IDs >= xmax are considered still running.
 *      For an xact ID xmin <= xid < xmax, consult list to see whether
 *      it is considered running or not.
 */
Snapshot
GetSnapshotData(Snapshot snapshot)
{
    TransactionId xmin;
    TransactionId xmax;
    FullTransactionId latest_completed;

    /* ... 初期化処理 ... */

    latest_completed = TransamVariables->latestCompletedXid;

    /* xmax is always latestCompletedXid + 1 */
    xmax = XidFromFullTransactionId(latest_completed);
    TransactionIdAdvance(xmax);

    /* initialize xmin calculation with xmax */
    xmin = xmax;

    /* ... 進行中のトランザクションを xip 配列に収集 ... */

    snapshot->xmin = xmin;
    snapshot->xmax = xmax;
    /* ... */

    return snapshot;
}
```

https://github.com/postgres/postgres/blob/094b61ce3ebbb1258675cb9b4eca9198628e2177/src/backend/storage/ipc/procarray.c#L2091-L2220

:::

# インデックス (b-link tree)

PostgreSQL の場合、b-link tree の 葉ノード からタプル ID(`ctid`)へのポインタがあることを解説しました。
このとき実質的に、インデックスエントリは `(key, ctid)` のような形で保存されます。

PostgreSQL では、**インデックスとデータは完全に分離**されています。
インデックスは単にヒープデータに辿り着くための手段です。そのため、**b-link tree は、ヒープデータについての関心事を持ちません**。

つまり、**ユニークな同一論理行について、複数物理タプルが b-link tree に存在することは許容されます**。
また、b-link tree の leaf ページ境界とユニークな同一論理行の境界は一致しません。

そのため、
同じ leaf ページに異なる論理行の `(key, ctid)` データがあることもあります。
逆に異なる leaf ページに同じ論理行の `(key, ctid)` データが存在することもあります。

B-link tree については詳細な説明を割愛しますが、データ構造が気になる方は以下の記事を読むと良いでしょう。

https://zenn.dev/hmarui66/articles/b87d6be351d6e2

# まとめ

今回の記事では、PostgreSQL の整合性の実装について解説しました。
主なポイントは以下の通りです。

- **追記型アーキテクチャと MVCC**:
  追記型アーキテクチャと MVCC によって、高い並行性と読み取り整合性を実現
- **データ構造**:
  トランザクション、物理タプル、スナップショットのデータ構造と役割
- **可視性チェックアルゴリズム**:
  スナップショットを用いたトランザクションの可視性チェックアルゴリズムと物理タプルの可視性チェックアルゴリズム
- **トランザクション分離モデル**:
  「Read Committed」と「Repeatable Read」の違いとその実装
- **インデックス**:
  b-link tree によるインデックス構造とその役割

PostgreSQL の内部実装は非常に複雑であり、今回の記事では基本的な部分に焦点を当てました。
今回割愛した内容についても、興味があればぜひ調査してみてください。

この記事が、PostgreSQL の理解を深める一助となれば幸いです。

読んでいただき、ありがとうございました。

# 参考文献

## PostgreSQL ドキュメント

https://www.postgresql.org/docs/17/routine-vacuuming.html
https://www.postgresql.org/docs/current/transaction-iso.html
https://www.postgresql.org/docs/current/indexes-types.html
https://www.postgresql.org/docs/current/transaction-id.html

その他、PostgreSQL ソースコードは文中のリンクを参照してください。

また、PostgreSQL の内部構造について調べるきっかけとなった以下の動画にも感謝いたします。
https://www.youtube.com/watch?v=FIXzD_2GtDo

また、今回の記事を踏まえ更に詳しく知りたい方は、以下の記事も参考になるかと思います。
https://www.nminoru.jp/~nminoru/postgresql/pg-transaction-mvcc-snapshot.html

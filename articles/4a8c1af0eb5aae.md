---
title: "SQLに対するバックエンドのアプローチ比較、そしてSafeQLの紹介"
# 象
emoji: "🐘"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["SQL", "TypeScript", "SafeQL", "PostgreSQL", "ORM"]
published: false
---

## はじめに

こんにちは。calloc134 です。

バックエンド開発において、DB にデータを保存することはよくあることです。
DB と接続してデータのやり取りを行う必要がありますが、皆さんはどのようにしてデータを取得していますか？

ORM やクエリビルダを利用したり、逆に SQL を記述してコード生成を行ったりと、様々な方法があります。

今回はこれらのアプローチについて比較し、比較的斬新な方針を取っているものとして SafeQL を紹介します。

### 注意点

ここでは、TypeScript のバックエンド開発と、そこで利用されるライブラリを前提として話を進めます。
Go や Python など他の言語での利用方法については、別途調査が必要です。

## SQL に対するアプローチ

まず、SQL に対するアプローチには大きく分けて 2 つの方法があります。
それぞれのライブラリの使い方を、簡単に見ていきましょう。

なお、それぞれの例については簡易的なものとなっています。
参照したドキュメントについてリンクを掲載しているため、詳細はそちらを参照してください。

### SQL を覆い隠す方法

SQL を覆い隠すようなライブラリを利用する方法です。ORM やクエリビルダがこれに該当します。

:::message alert

当記事では、Data Mapper パターンを採用している ORM を、単に ORM と表記しています。
この記事では、Active Record パターンを採用しているものについては触れません。

https://www.prisma.io/docs/orm/overview/prisma-in-your-stack/is-prisma-an-orm
:::

有名どころのライブラリを提示します。

- ORM: Prisma, Drizzle ORM
- クエリビルダ: Kysely

これらのライブラリは、提供されるメソッドを呼び出すことで、SQL の記述をライブラリが担ってくれるため、SQL を直接記述する必要がありません。

使い方のフローとしては以下のとおりです。

- スキーマファイルを記述する
- メソッドを呼び出してクエリを実行する

では、それぞれのライブラリについて使い方を解説していきます。

#### Prisma

Prisma では、独自のスキーマファイルを記述します。

```schema.prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
}
...
```

https://www.prisma.io/docs/orm/prisma-schema/overview

なお、Prisma は DB にアクセスしてスキーマファイルを生成する introspect 機能も提供しています。
https://www.prisma.io/docs/orm/prisma-schema/introspection

スキーマファイルを記述したら、以下のようにクエリを実行します。

```typescript
const user = await prisma.user.findUnique({
  where: {
    email: "elsa@prisma.io",
  },
});
```

https://www.prisma.io/docs/orm/prisma-client/queries/crud#read

#### Drizzle ORM

Drizzle ORM では、TypeScript のオブジェクトとしてスキーマを記述します。

```typescript
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
```

なお、Drizzle ORM も introspect 機能を提供しています。

https://orm.drizzle.team/kit-docs/commands#introspect--pull

スキーマを記述したら、以下のようにクエリを実行します。

クエリの方法としては、Prisma 風にクエリを記述する方法と、SQL 風にクエリを記述する方法があります。

```typescript
const result = await db.query.users.findMany({
  with: {
    posts: true,
  },
});
```

https://orm.drizzle.team/docs/rqb

```typescript
const result = await db.select().from(users);
```

https://orm.drizzle.team/docs/select#basic-and-partial-select

#### Kysely

Kysely では、スキーマ生成について特に記述はありません。
kysely の場合は自分で型を記述する必要があります。こちらも、型を生成するアプローチがいくつか存在しています。

kysely-introspect というライブラリを利用することで、スキーマから型を生成することができます。
https://kysely.dev/docs/generating-types

:::message
https://github.com/valtyr/prisma-kysely
Prisma と Kysely を組み合わせ、スキーマ生成を Prisma に任せながら、Kysely でクエリを記述する方法もあります。
:::

スキーマを記述したら、以下のようにクエリを実行します。

```typescript
const persons = await db
  .selectFrom("person")
  .select("id")
  .where("first_name", "=", "Arnold")
  .execute();
```

https://kysely.dev/docs/getting-started#querying

### 記述した SQL に型を付ける方法

SQL ファイルとして別途クエリを記述し、これに対してコードジェネレータなどを利用して型を付ける方法です。

有名どころのライブラリを提示します。

- sqlc
- TypedSQL

これらのライブラリでは、記述された SQL ファイルを外部・DB のクエリパーサで解析し、TypeScript の型定義を生成します。

使い方のフローとしては以下のとおりです。

- SQL ファイルを記述する
- 設定ファイルを記述する
- コード生成を行い、型定義を生成する
- 生成された型定義を利用してクエリを実行する

では、それぞれのライブラリについて使い方を解説していきます。

#### sqlc

まず、以下のような SQL ファイルを記述します。

schema.sql というファイルに、スキーマ定義を記述します。

```sql
CREATE TABLE authors (
  id   BIGSERIAL PRIMARY KEY,
  name text      NOT NULL,
  bio  text
);
```

また、query.sql というファイルに、アプリケーション内で呼び出すクエリを記述します。

```sql
-- name: GetAuthor :one
SELECT * FROM authors
WHERE id = $1 LIMIT 1;
```

https://github.com/sqlc-dev/sqlc-gen-typescript/tree/main/examples/authors/postgresql

次に、以下のような sqlc.yaml ファイルに設定を記述します。

```yaml
version: "2"
plugins:
  - name: ts
    wasm:
      url: (sqlcのwasmのURL)
      sha256: (対応するハッシュ値)
sql:
  - engine: "postgresql"
    queries: "query.sql"
    schema: "schema.sql"
    database:
      managed: true
    codegen:
      - out: db
        plugin: ts
        options:
          runtime: node
          driver: pg
```

https://github.com/sqlc-dev/sqlc-gen-typescript/tree/main#configuration

設定ファイルを記述したら、以下のコマンドを実行してコード生成を行います。

```bash
sqlc generate
```

https://github.com/sqlc-dev/sqlc-gen-typescript/tree/main#generating-code

生成されたクエリは、以下のように利用します。

```typescript
import postgres from "postgres";

import {
  getAuthor,
} from "./db/query_sql";

...

// Get that author
const seal = await getAuthor(sql, { id: author.id });
if (seal === null) {
  throw new Error("seal not found");
}
console.log(seal);
```

https://github.com/sqlc-dev/sqlc-gen-typescript/tree/main#using-generated-code

#### TypedSQL

TypedSQL は、Prisma と連携して提供されるライブラリです。
スキーマは Prisma のスキーマを利用するため、クエリのみを記述します。

```sql
SELECT u.id, u.name, COUNT(p.id) as "postCount"
FROM "User" u
LEFT JOIN "Post" p ON u.id = p."authorId"
GROUP BY u.id, u.name
```

この SQL ファイルは`prisma/sql/`ディレクトリに配置します。

次に、設定ファイルを記述します。
TypedSQL の場合、ORM で紹介した Prisma と連携して提供されるため、Prisma に設定を記述します。

```schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["typedSql"]
}
```

https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql

設定ファイルを記述したら、以下のコマンドを実行してコード生成を行います。

```bash
prisma generate --sql
```

生成されたクエリは、以下のように利用します。

```typescript
import { PrismaClient } from "@prisma/client";
import { getUsersWithPosts } from "@prisma/client/sql";

const prisma = new PrismaClient();

const usersWithPostCounts = await prisma.$queryRawTyped(getUsersWithPosts());
console.log(usersWithPostCounts);
```

## アプローチの比較

前者のアプローチは、SQL を覆い隠すことで便利に扱うというものです。
これに対し後者のアプローチは、SQL をそのまま記述し、そこから便利な機能を後付けするというものです。

https://x.com/dmikurube/status/1789160173757677742

> いかにして SQL を隠蔽するか
> その最右翼が今出てきてる自然言語からのクエリ生成

> 隠蔽は隠蔽でかゆいところに手が届かない
> 生成される SQL をグッと睨みながら ORM なりのご機嫌をうかがわないとならなかったりするので、生成するのが最右翼なら、逆サイドの左翼に「手で書いた SQL を解析してコードの方に合わさせる (sqlc とか)」のが来つつある

それぞれのアプローチには、メリットとデメリットがあります。

### SQL を覆い隠す方法

#### 特徴

- 提供されるメソッドで SQL を記述する
- コード内部にクエリしたい内容が表現される

#### メリット

- SQL を直接記述する必要がない
- メソッドで隠蔽されているため、型安全性やエラーチェックが行いやすい
- 厚いラッパーが提供され、便利な機能も多く提供されることがある

#### デメリット

- SQL の記述をそのまま行えないため、複雑なクエリを記述する際に不便
- ORM・クエリビルダの使い方自体を覚える必要がある
- したがって別言語・別環境への移行コストが高く、コードを使い回すことが難しい

### 記述した SQL に機能を後付けする方法

#### 特徴

- SQL ファイルを記述してコード生成する
- コード外部の SQL ファイルにクエリが記述される

#### メリット

- SQL をそのまま記述できるため、複雑なクエリも記述しやすい
- SQL ファイルを利用するため、既存の SQL をそのまま利用できる
- コード生成により、型安全性が担保される

#### デメリット

- コード生成の手間がかかる
- sql 記述時にはエラーが発生しないため、別の手段でエラーチェックを行う必要がある
- sql ファイルが分離されるため、命名が面倒

:::message
3 つ目のデメリットについては賛否両論が存在します。

SQL のクエリを分離することで、SQL の再利用性が高まることは確かです。
一方で、クエリを分離することで関心事が分散し、コードの可読性が下がるという意見もあります。

クエリというものは性質上アプリケーションと密結合であり、どちらが好ましいかは人により様々な意見があると思われます。
:::

## SafeQL とは

では、ここで SafeQL の紹介を行います。

SafeQL は、コード内部で SQL を記述し、これに対して型を付けることができるライブラリです。
分類的には後者のアプローチ(記述した SQL に機能を後付ける方法)に該当します。
しかし、書き心地としては前者のアプローチのように型を付けられ、構成ファイルを記述する必要がなく、使い勝手が良いと考えられます。

### 使ってみる

### 色々なクエリを試してみる

## まとめ

```;

```

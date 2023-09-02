---
title: "NestJS+@fastify/secure-sessionでステートレスクッキー認証に対応"
emoji: "🍪"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["fastify", "typescript", "NestJS", "セキュリティ"]
published: false
---

## はじめに

こんにちは、calloc134です。
今回は、NestJSでfastifyを内部に利用し、さらに@fastify/secure-sessionを利用してクッキー認証を実装する方法を紹介します。

## 注意点

今回はpassport等を利用しておらず、NestJSのGuardを利用しています。
ここでは、Guard以外のNestJSの使い方については説明しません。


## 概念の解説

### クッキー認証とクッキーの方式の種類

クッキー認証とは、クライアント側にクッキーと呼ばれるデータを保存し、そのデータを利用して認証を行う方式です。
この認証方式には大きく分けて二つの種類があります。
名称は様々なものがありますが、今回は以下のように呼ぶことにします。

- ステートフルな方式
- ステートレスな方式

#### ステートフルな方式
ステートフルな方式とは、サーバサイドにセッションデータを保存する方式です。
サーバは保存したいデータを、Redisのような外部のデータベースに保存します。
そして、データに基づくセッションIDをクライアントに送信します。
クライアントはそのセッションIDをサーバに対して付与しながら送信を行います。

サーバサイドにセッションデータを保存するため、サーバサイドの負荷が高くなります。
しかし、クッキーのサイズが小さくなるため、クッキーのサイズの肥大化を防ぐことができます。
また、セッションデータをサーバサイドに保存するため、セッションデータの期限をサーバが自由に管理したり、無効化したりすることができます。

#### ステートレスな方式
ステートレスな方式とは、サーバサイドにセッションデータを保存しない方式です。
サーバは保存したいデータを署名し、クライアントに送信します。
クライアントはそのデータをサーバに対して付与しながら送信を行います。
サーバはそれに対する署名を検証して、データの正当性を確認します。

クッキーのサイズが大きくなるため、クッキーのサイズの肥大化を防ぐことができません。
また、セッションデータをサーバサイドに保存しないため、セッションデータの期限をサーバが自由に管理したり、無効化したりすることができません。
しかし、サーバサイドにセッションデータを保存しないため、サーバサイドの負荷が軽減されます。
今回は、この方式を採用します。


### Guardとは

NestJSのGuardは、リクエストを受け取った際に、そのリクエストが処理される前に実行される処理です。
名前の通り、認証処理を実装するための概念です。

カスタムのGuardは、以下のようにして実装します。

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // ここに任意の判定ロジックを実装する
    if (????) {
      return true;
    } else {
      // 任意のエラーを返却させられる
      throw new UnauthorizedException();
    }
  }
}
```

NestJSの提供するCanActivateインターフェースを実装し、内部のcanActivateメソッドを実装することで、Guardを実装することができます。

### Guardの使い方

Guardは、基本的にコントローラに対してデコレータの形で指定します。
Guardを利用するには、以下のようにします。

```ts
@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(AuthGuard)
  async findMe(@Request() request: RequestWithUser): Promise<UserResponse> {
    const id = request.session.user.id;
    const user = await this.userService.findMe(id);
    return user;
  }
}
```

`@UseGuards`デコレータを利用してカスタムガードを指定することで、Guardを利用することができます。

また、コントローラ全体に対してGuardを指定することもできます。

```ts
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  @Get('me')
  async findMe(@Request() request: RequestWithUser): Promise<UserResponse> {
    const id = request.session.user.id;
    const user = await this.userService.findMe(id);
    return user;
  }
}
```

## 今回使用するクッキーの方式
今回利用する@fastify/secure-sessionは、ステートレスな方式のクッキー認証を実装するためのライブラリです。

## セットアップ

まず、main.tsに以下のようにfastify対応のNestJSをセットアップします。

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // クッキーの設定
  app.register(fastifySecureSession, {
    // 環境変数からキーを取得
    key: Buffer.from(process.env.SESSION_KEY, 'hex'),
    // クッキーの名前はSESSIONID
    cookieName: 'SESSIONID',
    // クッキーの設定
    cookie: {
      path: '/',
      // 1日間
      maxAge: 1 * 24 * 60 * 60 * 1000,
      // secure属性, httpOnly属性, SameSite属性などは適宜設定
    }
  });

  await app.listen(3000);
}

bootstrap();
```
ここで、キーは盗難されると任意のクッキーのデータを作成できてしまうため、環境変数から取得するようにしています。

次に、Guardを作成します。
今回は、`@nestjs/passport`を利用せず、Guardを直接実装します。

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.session.user) {
      return true;
    } else {
      // 任意のエラーを返却させられる
      throw new UnauthorizedException();
    }
  }
}
```

これで、Guardを利用して、認証を実装することができます。

ログインしているユーザにアクセスするためには、以下のようにします。
今回はデータベースへのアクセスにPrismaを利用しています。

```ts
import { Injecable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.module';

@Injecable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(id: number): Promise<User> {
    const id = request.session.user.id;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
    });
    return new UserResponse(user);
  }
}
```

```ts
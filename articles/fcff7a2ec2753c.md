---
title: "NestJS+@fastify/secure-sessionでステートレスクッキー認証に対応させる"
emoji: "🍪"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["fastify", "typescript", "NestJS", "セキュリティ"]
published: true
---

## はじめに

こんにちは、calloc134 です。
今回は、NestJS で fastify を内部に利用し、さらに@fastify/secure-session を利用してクッキー認証を実装する方法を紹介します。

## 注意点

今回は passport 等を利用しておらず、NestJS の Guard を利用しています。
ここでは、Guard 以外の NestJS の使い方については説明しません。

## 概念の解説

### クッキー認証とクッキーの方式の種類

クッキー認証とは、クライアント側にクッキーと呼ばれるデータを保存し、そのデータを利用して認証を行う方式です。
この認証方式には大きく分けて二つの種類があります。
名称は様々なものがありますが、今回は以下のように呼ぶことにします。

- ステートフルな方式
- ステートレスな方式

#### ステートフルな方式

ステートフルな方式とは、サーバサイドにセッションデータを保存する方式です。
サーバは保存したいデータを、Redis のような外部のデータベースに保存します。
そして、データに基づくセッション ID をクライアントに送信します。
クライアントはそのセッション ID をサーバに対して付与しながら送信を行います。

サーバサイドにセッションデータを保存するため、サーバサイドの負荷が高くなります。
しかし、クッキーのサイズが小さくなるため、クッキーのサイズの肥大化を防ぐことができます。
また、セッションデータをサーバサイドに保存するため、セッションデータの期限をサーバが自由に管理したり、無効化したりすることができます。

#### ステートレスな方式

ステートレスな方式とは、サーバサイドにセッションデータを保存せず、クッキーにセッションデータをすべて格納する方式です。
サーバは保存したいデータを署名し、クライアントに送信します。
クライアントはそのデータをサーバに対して付与しながら送信を行います。
サーバはそれに対する署名を検証して、データの正当性を確認します。

クッキーのサイズが大きくなるため、クッキーのサイズの肥大化を防ぐことができません。
また、セッションデータをサーバサイドに保存しないため、セッションデータの期限をサーバが自由に管理したり、無効化したりすることができません。
しかし、サーバサイドの負荷が軽減されるメリットがあります。また、サーバサイドの特定のマシンに依存しないため、スケールアウトが容易です。
今回は、この方式を採用します。

### Guard とは

NestJS の Guard は、リクエストを受け取った際に、そのリクエストが処理される前に実行される処理です。
名前の通り、認証処理を実装するための概念です。

カスタムの Guard は、以下のようにして実装します。

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

ここで、request オブジェクトを用いると、内部で利用されているフレームワークのリクエストオブジェクトを取得することができます。
NestJS の提供する CanActivate インターフェースを実装し、内部の canActivate メソッドを実装することで、Guard を実装することができます。

### Guard の使い方

Guard は、基本的にコントローラに対してデコレータの形で指定します。
Guard を利用するには、以下のようにします。

```ts
@Controller("users")
export class UsersController {
  @Get("me")
  @UseGuards(AuthGuard)
  async findMe(@Request() request: RequestWithUser): Promise<UserResponse> {
    const id = request.session.user.id;
    const user = await this.userService.findMe(id);
    return user;
  }
}
```

`@UseGuards`デコレータを利用してカスタムガードを指定することで、Guard を利用することができます。

また、コントローラ全体に対して Guard を指定することもできます。

```ts
@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  @Get("me")
  async findMe(@Request() request: RequestWithUser): Promise<UserResponse> {
    const id = request.session.user.id;
    const user = await this.userService.findMe(id);
    return user;
  }
}
```

## 実装

今回利用する@fastify/secure-session は、ステートレスな方式のクッキー認証を実装するためのライブラリです。

### 今回のアプリケーションのスキーマ

今回のサンプルアプリケーションとして、ユーザの作成とログインを実装します。
ここで利用する orm として、Prisma を採用しました。
参考として、Prisma スキーマは以下の通りです。

```graphql
model User {
  id        Int      @id @default(autoincrement())
  name      String
  password  String
}
```

### セットアップ

まず、main.ts に以下のように fastify 対応の NestJS をセットアップします。
また、@fastify/secure-session を利用するために、設定を行います。

```ts
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  // クッキーの設定
  app.register(fastifySecureSession, {
    // 環境変数からキーを取得
    key: Buffer.from(process.env.SESSION_KEY, "hex"),
    // クッキーの名前はSESSIONID
    cookieName: "SESSIONID",
    // クッキーの設定
    cookie: {
      path: "/",
      // 1日間
      maxAge: 1 * 24 * 60 * 60 * 1000,
      // secure属性, httpOnly属性, SameSite属性などは適宜設定
    },
  });

  await app.listen(3000);
}

bootstrap();
```

このようにして、NestJS でステートレスなクッキーに搭載されたセッションデータを利用することができます。
ここで、キーは盗難されると任意の有効なセッションデータを作成できてしまうため、環境変数から取得するようにしています。

### ユーザ作成処理の実装

また、ユーザの作成処理は以下のようなサービスとなります。
ここでは、パスワードを argon2 でハッシュ化しています。

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.module";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(name: string, password: string): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        name,
        password: await argon2.hash(password),
      },
    });
    return new UserResponse(user);
  }
}
```

このコードによって、ユーザを作成することができます。
必要に応じて、このサービスをコントローラと接続することで、ユーザを作成するエンドポイントを作成することができます。
接続するためのコードを簡単に示すと以下のようになります。

```ts
@Controller("auth")
export class AuthController {
  constructor(private readonly userService: UserService) {}

  @Post("signup")
  async signup(@Body() signupDto: SignupDto): Promise<UserResponse> {
    const user = await this.userService.createUser(
      signupDto.name,
      signupDto.password
    );
    return user;
  }
}
```

コントローラからサービスを呼び出して、ユーザを作成することができます。

### ログイン処理の実装

次に、ログイン処理を実装します。

まずは下準備として、ユーザのログインが成功しているかを判断するためのサービスを作成します。

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.module";
import { verify } from "argon2";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async login(name: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { name },
    });
    if (await verify(user.password, password)) {
      return new UserResponse(user);
    } else {
      throw new UnauthorizedException();
    }
  }
}
```

次に、コントローラを実装します。ここで、NestJS のコントローラでセッションを受け取る方法を解説します。
以下のように、リクエストを受け取る際に、引数に対して`@Session()`デコレータを付与します。このようにすることで、リクエストに対してリクエストに付与されたセッションを受け取ることができます。

ここでは、クッキーにユーザの情報全体を保存するようにしています。実際の運用においては、ユーザの id のみを保存するようにするかを選択するようにして実装してください。

```ts
import { Session as SecureSession } from '@fastify/secure-session';
@Controller('auth')
export class AuthController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Session() session: SecureSession): Promise<UserResponse> {
    const user = await this.userService.login(loginDto.name, loginDto.password);
    if (user) {
      session.set('user', user);
      return user;
    } else {
      throw new UnauthorizedException();
    }
  }
```

ここで、ログイン情報が正しいことをサービスで確認した後、成功した場合はセッションにユーザの情報を保存しています。
このようにして、セッションにユーザの情報を保存することができます。

### Guard の実装

次に、Guard を作成します。

```ts
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

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

この Guard では、有効なセッションが存在するかを判定しています。
このようにして、Guard を利用して、認証を実装することができます。

これをコントローラで利用するときは、UseGuards デコレータを利用します。

```ts
@Controller("users")
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get("hoge")
  @UseGuards(AuthGuard)
  async hoge(@Request() request: RequestWithUser): Promise<UserResponse> {
    // ...
  }
}
```

最後に、ログインしているユーザにアクセスするためのサービスを簡単に実装します。
今回は、以下のようなコードを実装します。

```ts
import { Injecable } from "@nestjs/common";
import { PrismaService } from "src/prisma.module";

@Injecable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(id: number): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
    });
    return new UserResponse(user);
  }
}
```

引数で渡されたユーザの id を元に、ユーザを取得することができます。

これに相当するコントローラを実装します。
コントローラにおいても、`@Session()`デコレータを利用することで、セッションを受け取ることができます。

```ts
import { Session as SecureSession } from '@fastify/secure-session';
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async findMe(@Request() request: RequestWithUser, @Session() session: SecureSession): Promise<UserResponse> {
    const id = request.session.user.id;
    const user = await this.userService.findMe(id);
    return user;
  }
```

このコードでは、ログインしているユーザの id を取得して、その id を元にユーザを取得しています。

## まとめ

今回は、NestJS で fastify を内部に利用したときに@fastify/secure-session を利用してクッキー認証を実装する方法を紹介しました。

何らかの方法で IDaaS に依存できないような場合や、小さいアプリケーションを作成する場合には、このような方法で認証を実装することができます。

参考になれば幸いです。

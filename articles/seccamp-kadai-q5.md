---
title: "【セキュキャン課題晒し】パスキーの導入について考える"
emoji: "🔑"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["セキュリティ", "パスキー", "seccamp", "OIDC", "WebAuthn"]
published: false
---

# はじめに

こんにちは、calloc134 です。
つい先日、セキュリティキャンプにエントリーし、課題を提出しました。
https://x.com/calloc134/status/1930929321876852833

事前課題の中で、パスキーに関する標準や実装の調査に関するものがありました。
OAuth/OIDC のような認証認可技術と関連し、パスキーというものを聞いたことはありましたが、実際にどのようなものかを調べる機会はありませんでした。ちょうど良い機会なのでパスキーについて一通り調査し、従来のパスワード認証と比較してどのようなメリット・デメリットがあるのかを考察しました。
せっかく良いレポートが書けたため、課題晒しも兼ねて公開することに決めました。パスキーの導入を考える方の参考になれば幸いです。
なお、以下の内容はレポートの文体に合わせるため少し堅い表現になっていますが、ご了承ください。

:::details 課題内容

こちらより引用しております。
https://www.ipa.go.jp/jinzai/security-camp/2025/camp/zenkoku/sbn8o1000000c4oy-att/kadai_b.txt

> ■ Q.5（パスキーに関連する標準や実装の調査）
> (1) 任意のパスキーが使用されているサービスを実際に利用して使用感を調査したうえで、技術的・運用的・UX の観点から、あなたが課題だと思う点を述べてください。また、その解決策についても考えてください。なお、実際に利用できる環境にない場合はドキュメントの調査のみとして、使用感が分かる範囲で想像できる課題を考察してください。
> (2) 認可と認証の違いについて、例を挙げて説明したうえで、OAuth 2.0 や OpenID Connect（OIDC）とパスキーの仕様（WebAuthn）の関係について説明してください。
> (3) 従来の認証方式（パスワード、OTP、SMS 認証など）と比較した場合、パスキーのメリットとデメリットを述べてください。
> (4) 従来の認証方式（パスワード、OTP、SMS 認証など）で提供された Web アプリケーションにパスキーを実装するとき、サーバー側でどのような変更が必要ですか？
> (5) あなたが企業のエンジニアだった場合、経営陣にパスキーの導入を提案するとしたら、どのようなポイントを説明しますか？

:::

# 前提

OAuth2.0、OIDC については、以前筆者がまとめた技術ブログが存在しています。パスキーに関連してくるため、以下の内容を参照しておくと理解が深まるでしょう。
https://zenn.dev/calloc134/articles/5e8da6c491e720

# 認証認可の違いと OAuth 2.0、OpenID Connect、WebAuthn の関係

認可(Authorization)とは、ユーザが特定のリソースにアクセスしてもよいかどうかを検証するプロセスである。
認可の具体例として、ある特定のユーザに対してインターネット上で公開されているリソース(画像など)へのアクセスを許可するかどうか判断することが該当する。別の呼称では、アクセス制御とも呼ばれる。

対して認証(Authentication)とは、ユーザがどのような人であるかを検証するプロセスである。
認証の具体例として、ユーザが自分のアカウントにログインする際に、アカウント本人しか知り得ない情報(パスワードなど)を入力して、ユーザ自身がアカウントの所有者であることを確認することが該当する。別の呼称では、当人認証とも呼ばれる。

OAuth 2.0 と OpenID Connect（OIDC）は、それぞれ認可、認証のためのプロトコルである。
OAuth 2.0 は IETF によって 主に RFC6749 で定義されており、主にリソースへのアクセスを許可するためのフレームワークを提供する。
https://datatracker.ietf.org/doc/html/rfc6749
https://openid-foundation-japan.github.io/rfc6749.ja.html

> OAuth 2.0 は, サードパーティーアプリケーションによる HTTP サービスへの限定的なアクセスを可能にする認可フレームワークである.

OpenID Connect（OIDC）は、OAuth 2.0 の上に構築された認証プロトコルであり、ユーザのアイデンティティを確認するための情報を提供する。
OIDC は RFC では定義されていないが、OpenID Foundation により策定されており、OpenID Connect Core 1.0 incorporating errata set 2 として公開されている。
https://openid.net/specs/openid-connect-core-1_0.html
https://openid-foundation-japan.github.io/openid-connect-core-1_0.ja.html

> OpenID Connect 1.0 は, OAuth 2.0 プロトコルの上にシンプルなアイデンティティレイヤーを付与したものである.

_参考_
https://zenn.dev/calloc134/articles/5e8da6c491e720#%E3%81%96%E3%81%A3%E3%81%8F%E3%82%8A%E3%81%A8%E3%81%97%E3%81%9F-oauth-%E3%81%A8-oidc-%E3%81%AE%E9%81%95%E3%81%84

また、パスキーの仕様の一部である WebAuthn は、W3C が公開した Web 標準規格であり、従来のようなパスワード認証に代わるより安全な認証方法を提供する。
公開鍵署名方式を応用した認証方式であり、パスワードなどの秘密情報をサーバに送信して保存することなく、ユーザが持つ認証器（Authenticator）に保管された秘密鍵とサーバに登録された公開鍵のペアを用いて認証を行う。パスワードを利用しないためパスワードレス認証と呼ばれる。
https://www.w3.org/TR/webauthn-3/

WebAuthn と合わせて、クライアントから認証器を制御して鍵生成・署名を行うためのプロトコルである CTAP2（Client To Authenticator Protocol）が存在しており、この 2 つの規格から FIDO2（Fast IDentity Online）と呼ばれる認証フレームワークが形成されている。

:::message
なお、FIDO2 で策定されている仕様では認証器のセキュア領域にのみ秘密鍵が行われ、これをエクスポートすることは不可能である。これに対し、秘密鍵を暗号化した状態でクラウドに同期・バックアップすることを可能にする仕組みであるパスキーが存在する。

この仕様については「White Paper: Multi-Device FIDO Credentials」で提案されているが、規格として策定されている訳ではないため、ベンダーによって実装にばらつきがある。近年では、WebAuthn Level 3 での residentKey や credentialProtectionPolicy の拡張などにより、策定が進んでいる。
https://fidoalliance.org/white-paper-multi-device-fido-credentials

:::

OIDC は本人認証を行うためのプロトコルであるが、**具体的な認証手段については特定せずに仕様を定めて**いる。したがって、OIDC を利用するサービスは、パスワード認証や WebAuthn を利用したパスワードレス認証など、様々な認証手段を選択することができる。
ここで、OIDC におけるロールを以下に明示する。

- **Relying Party (RP)**: OIDC を利用してユーザの認証を行うサービス。OIDC の仕様に従って認証を要求し、認証の結果を受け取る。
- **Identity Provider (IdP)**: OIDC を実装した認証サービス。RP からの認証要求を受け取ってユーザの認証を行い、認証結果を返却する。
- **End-User**: OIDC を利用して認証されるユーザ

ここで IdP が WebAuthn 認証に対応している場合、RP はこの IdP を利用するだけで、WebAuthn を利用したパスワードレス認証を実現することができる。
なお調査したところ、OIDC と WebAuthn を統合するための RFC や W3C 仕様は存在しないが、OIDC の拡張仕様である「OpenID Connect Extended Authentication Profile (EAP) ACR Values 1.0」では AMR クレームを利用してフィッシング耐性のあるハードウェア鍵認証を要求するといった仕様が定義されている。
https://openid.net/specs/openid-connect-eap-acr-values-1_0.html

# 従来の認証方式と比較したパスキーのメリットとデメリット

パスキーのメリットとデメリットについて、従来の認証方式（パスワード、OTP、SMS 認証など）と比較して説明する。

メリットは以下の通りである。

- パスワードレスな認証が可能になり、ユーザがパスワードを覚える必要がなくなる
- パスワードが存在しないため、クレデンシャルを盗むフィッシングサイトによる攻撃の意義がなくなる
- パスワードをサーバに保存する必要がなくなるため、パスワード漏洩のリスクならびにパスワードのハッシュ化、
  ソルト化などの実装の複雑さを軽減できる

デメリットは以下の通りである。

- サーバ側に WebAuthn に対応した実装が必要
- 特別なデバイスの導入が必要
- デバイス紛失時のリカバリー対応
- プラットフォームにおける同期の制限

それぞれ解説を行う。

## メリット

パスワードレスな認証が可能になるため、ユーザがパスワードを覚える必要がなくなる。

> With passkeys, users no longer need to enter usernames and passwords or additional factors. Instead, a user approves a sign-in with the same process they use to unlock their device (for example, biometrics, PIN, pattern).

これにより、パスワードのような情報を忘れ、ログイン不能になるといった問題が解決される。この点より、ユーザ体験の向上につなげることも可能である。
更に、パスワード等のクレデンシャルを盗むようなフィッシングサイトによる攻撃の脅威を根本から排除できる。

> Unlike passwords, passkeys are resistant to phishing, are always strong, and are designed so that there are no shared secrets.

ただし、クレデンシャルではなくセッションを盗むタイプ、所謂 MitM 型のフィッシングサイトについてはセッションを攻撃者に取得されるリスクが存在する。これに対してもパスキーはオリジンを検証する仕組みを持っているため、偽サイトに誤ってパスキーでログインすることがなくなるよう設計されていることに留意する。

加えて、パスワードをサーバに保存する必要がなくなるため、パスワード漏洩のリスクならびにパスワードのハッシュ化、ソルト化などの実装の複雑さを軽減できる。
ただし、パスキーを実装するためには、WebAuthn に対応したサーバ側の実装が必要となる。

## デメリット

パスキー認証を実装するには先程述べたように WebAuthn 標準に準拠している必要があり、登録時やログイン時のサーバ実装が必要となる。また、ユーザに対してパスキーに慣れてもらうコストも発生する。

> WebAuthn の導入は、開発者にとっての実装の複雑さと、ユーザーが従来のパスワードから適応する必要があることから、依然として進んでいません。WebAuthn を既存のシステムに統合するには、多大な開発リソースが必要になる可能性があり、パスワードレス方式に慣れていないユーザーが多いため、ユーザー教育も障壁となっています。
> The adoption of WebAuthn remains slow due to the complexity of implementation for developers and the need for users to adjust from traditional passwords. Integrating WebAuthn into existing systems can require significant development resources, and user education is also a barrier as many are unfamiliar with passwordless methods. (原文)

また、パスキーを利用するための特殊なデバイスの導入も必要となる。WebAuthn をサポートするブラウザや OS、FIDO2 に対応した認証器を利用する必要があり、すべてのユーザ環境で即時に利用できるわけではない。
パスキー端末を紛失した場合のリカバリー対応も検討する必要がある。クラウド同期が行われている場合、対応するデバイスを紛失した場合でも、他のデバイスからパスキーを利用してログインすることが可能である。しかし、クラウド同期を行っていない場合、ユーザが再度パスキーを登録する必要があることが指摘されている。また、クラウド同期が行われている場合、同期先のアカウントが侵害されることでパスキー自体が侵害されるリスクも存在する。

なお、このセクションの内容は主に以下の記事から引用を行った。
https://fidoalliance.org/passkeys/
https://www.passkeys.com/what-is-webauthn

# 従来の認証方式からパスキー認証に乗り換える場合の、サーバ側の実装変更

まず前提として、従来の認証方式で提供された Web アプリケーションとは何かという点を明確にしたい。
従来の認証方式から乗り換える場合の想定ケースとして、大きく分けると 2 つ存在すると考えられる。

- 認証を外部の認証サービス（Auth0、Firebase Authentication など）に委託しているケース
- 認証を独自で実装しており、パスキーに乗り換えるケース

このうち前者のケースでは、認証方式を変更するにあたって認証サービスのオプションを変更するだけで済む場合が多い。したがって、移行のコストをそれほど考えなくて良いと想定される。後者のケースでは、認証方式を変更するにあたって、サーバー側での実装変更が必要となる。

今回は後者のケースを想定して、サーバー側での実装変更について解説する。

サーバ側コードで WebAuthn の仕様を扱うには、各言語向け・フレームワーク向けのライブラリを利用することが好ましい。
例えば、Node.js であれば `@simplewebauthn/server` ライブラリを利用することができる。このライブラリに存在する利用例を通して、webauthn のサーバ実装について理解を深められるような解説を行う。

SimpleWebAuthn のドキュメントではサーバ側実装を行うためのドキュメントが存在する。このドキュメントに沿って、WebAuthn のサーバ実装について理解を深められるよう解説を行う。
https://simplewebauthn.dev/docs/packages/server

その前段階として、WebAuthn がどのような通信を行うのかを理解するために、WebAuthn の通信の流れを確認する。

## WebAuthn の通信の流れ

WebAuthn の通信の流れは、主に以下の 2 つのフェーズに分かれる。

### パスキー登録フェーズ - Attestation

認証器が、公開鍵の生成と FIDO2 に準拠する正しいデバイスであることの証明を行うフェーズである。
認証器は何らかの方法でデバイスが正当なものであることを証明する署名を作成する必要がある。
アテステーションに成功すると、公開鍵とそれに関連する情報が認証サーバに登録され、ユーザとの関連付けが行われる。

### パスキー認証フェーズ - Assertion

認証器が、登録済みの公開鍵に対応する秘密鍵を使って認証サーバからのチャレンジに署名し、ユーザの認証および認証器の正当性を確認するフェーズである。
検証に成功した場合、認証が成功となる。

では、これらのフェーズを実装するために、サーバ側でどのような変更が必要かを確認していく。

## データベースの構造変更

認証を独自で実装しているアプリケーションをパスキー認証に対応させるため、まずデータベースの構造を変更する必要がある。公式ドキュメントでデータベースの構造の例が示されているため、これを解説する。ドキュメントでは TypeScript の型定義を用いてデータベースの構造を定義している。

### UserModel 型

```ts
type UserModel = {
  id: any;
  username: string;
};
```

この型は、ユーザを表すモデルである。`id` はユーザの一意な識別子であり、`username` はユーザ名を表す。この型はアプリケーションの実際の実装によって左右される。

### Passkey 型

```ts
type Passkey = {
  // SQL: Store as `TEXT`. Index this column
  id: Base64URLString;
  // SQL: Store raw bytes as `BYTEA`/`BLOB`/etc...
  //      Caution: Node ORM's may map this to a Buffer on retrieval,
  //      convert to Uint8Array as necessary
  publicKey: Uint8Array;
  // SQL: Foreign Key to an instance of your internal user model
  user: UserModel;
  // SQL: Store as `TEXT`. Index this column. A UNIQUE constraint on
  //      (webAuthnUserID + user) also achieves maximum user privacy
  webauthnUserID: Base64URLString;
  // SQL: Consider `BIGINT` since some authenticators return atomic timestamps as counters
  counter: number;
  // SQL: `VARCHAR(32)` or similar, longest possible value is currently 12 characters
  // Ex: 'singleDevice' | 'multiDevice'
  deviceType: CredentialDeviceType;
  // SQL: `BOOL` or whatever similar type is supported
  backedUp: boolean;
  // SQL: `VARCHAR(255)` and store string array as a CSV string
  // Ex: ['ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb']
  transports?: AuthenticatorTransportFuture[];
};
```

各プロパティについて解説する。

- `id`: パスキーの一意な識別子であり、Base64URL 形式
- `publicKey`: パスキーの公開鍵
- `user`: パスキーに紐づくユーザ情報を表す
- `webauthnUserID`: WebAuthn におけるユーザ ID。Base64URL 形式
- `counter`: パスキーのカウンタ値。認証器が生成する署名の数を表す
- `deviceType`: パスキーのデバイスタイプ。`singleDevice` または `multiDevice` のいずれか
- `backedUp`: パスキーがバックアップされているかどうかを示すフラグ
- `transports`: パスキーのトランスポート方式を表す配列。`ble`、`cable`、`hybrid`、`internal`、`nfc`、`smart-card`、`usb` などが含まれる

これらのデータベースをダイアグラムで表現した URL が提供されているため、以下に提示する。
https://dbdiagram.io/d/SimpleWebAuthn-Example-DB-Schema-661a046303593b6b61e34628

では、実際にデータベーススキーマを確認していく。ドキュメントには見当たらなかったが、以下のように落とし込んだ。一例として参考にしてほしい。

```sql
CREATE TYPE device_type_enum AS ENUM ('singleDevice', 'multiDevice');
CREATE TABLE passkeys (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  webauthn_user_id TEXT NOT NULL,
  public_key   BYTEA NOT NULL,
  counter      BIGINT NOT NULL DEFAULT 0,
  device_type  device_type_enum NOT NULL DEFAULT 'singleDevice',
  backed_up    BOOLEAN NOT NULL DEFAULT FALSE,
  transports   TEXT[] DEFAULT '{}', -- 正規化するかは実装次第か
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_webauthn_userid_per_user UNIQUE (webauthn_user_id, user_id)
);
```

これに沿って、ユーザ側のテーブルにパスキーで認証したかどうかを示すカラムを追加すると自然である。例えば、`users` テーブルに `has_passkey` カラムを追加し、パスキーで認証したかどうかを示すことができる。

```sql
ALTER TABLE users
ADD COLUMN has_passkeys BOOLEAN NOT NULL DEFAULT FALSE;
```

以上のような方針でデータベースの構造を変更することで、パスキー認証に対応させる土台を整えることができる。

## エンドポイント実装

次に、エンドポイント実装について解説する。サーバで実装する必要があり、サンプル実装にも含まれているエンドポイントは以下のとおりである。

- `/attestation/options`: パスキー登録のためのオプションを取得するエンドポイント (アテステーション)
- `/attestation/result`: パスキー登録のための結果を受け取るエンドポイント (アテステーション)
- `/assertion/options`: パスキー認証のためのオプションを取得するエンドポイント (アサーション)
- `/assertion/result`: パスキー認証のための結果を受け取るエンドポイント (アサーション)

前者の 2 つはアテステーションのためのエンドポイントであり、後者の 2 つはアサーションのためのエンドポイントである。
なお、W3C の提供する WebAuthn の規格自体には具体的な HTTP エンドポイントパスの定義は存在しないが、一般的に上記のようなエンドポイントが利用される。
では、それぞれの実装について具体的に確認していく。

### パスキー登録のためのオプションを取得するエンドポイント

`/attestation/options` エンドポイントは、パスキー登録のためのオプションを取得するエンドポイントとなっている。
まずユーザを新規作成してデータベースに保存し、続いてユーザに返却するためのオプションを生成する。`@simplewebauthn/server` ライブラリの `generateRegistrationOptions` メソッドを利用してオプションを生成している。その後 チャレンジを保管した後、ユーザにオプションを返却している。実際の実装ではセッションストアなどにチャレンジやその他の情報を保存することが想定される。

```ts
// (Pseudocode) ユーザー情報を DB から取得
const user: UserModel = getUserFromDB(loggedInUserId);
// (Pseudocode) そのユーザーが既に登録済みの認証器情報一覧を取得
const userPasskeys: Passkey[] = getUserPasskeys(user);

const options: PublicKeyCredentialCreationOptionsJSON =
  await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    attestationType: "none",
    excludeCredentials: userPasskeys.map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

// (Pseudocode) ユーザーごとに生成オプションを保存（後で検証フェーズで参照）
setCurrentRegistrationOptions(user, options);

return options;
```

### パスキー登録のための結果を受け取るエンドポイント

`/attestation/result` エンドポイントは、パスキー登録のための結果を受け取るエンドポイントとなっている。

まずリクエストからユーザ情報を取得し、該当するユーザの情報をデータベースから、先程のエンドポイントで保管したチャレンジの内容を取得する。実際の環境ではセッションなどから取り出すことになると考えられる。
次に`@simplewebauthn/server` ライブラリの `verifyRegistrationResponse` メソッドを利用して結果を検証する。

```ts
const { body } = req;

// (Pseudocode) ログインユーザーを DB から取得
const user: UserModel = getUserFromDB(loggedInUserId);
// (Pseudocode) Step 2-2 で保存した registrationOptions を取得
const currentOptions: PublicKeyCredentialCreationOptionsJSON =
  getCurrentRegistrationOptions(user);

let verification;
try {
  verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: currentOptions.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
} catch (error) {
  console.error(error);
  return res.status(400).send({ error: error.message });
}

const { verified } = verification;
return { verified };
```

検証に成功した場合、検証結果からクレデンシャルを取得し、データベースに保存する。

```ts
const { registrationInfo } = verification;
const { credential, credentialDeviceType, credentialBackedUp } =
  registrationInfo;

const newPasskey: Passkey = {
  user,
  webAuthnUserID: currentOptions.user.id,
  id: credential.id,
  publicKey: credential.publicKey,
  counter: credential.counter,
  transports: credential.transports,
  deviceType: credentialDeviceType,
  backedUp: credentialBackedUp,
};

// (Pseudocode) 新しいパスキー情報を DB に保存
saveNewPasskeyInDB(newPasskey);
```

### パスキー認証のためのオプションを取得するエンドポイント

`/assertion/options` エンドポイントは、パスキー認証のためのオプションを取得するエンドポイントとなっている。

まずリクエストからユーザ情報を取得し、対応するクレデンシャルを取得した後、
`@simplewebauthn/server` ライブラリの `generateAuthenticationOptions` メソッドを利用して認証オプションを生成している。登録時のチャレンジと同様に、セッションにチャレンジを保管し、ユーザにオプションを返却する。

```ts
// (Pseudocode) ログインユーザーを DB から取得
const user: UserModel = getUserFromDB(loggedInUserId);
// (Pseudocode) そのユーザーが登録済みの認証器一覧を取得
const userPasskeys: Passkey[] = getUserPasskeys(user);

const options: PublicKeyCredentialRequestOptionsJSON =
  await generateAuthenticationOptions({
    rpID,
    allowCredentials: userPasskeys.map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports,
    })),
  });

// (Pseudocode) このチャレンジを保存（後で検証時に使用）
setCurrentAuthenticationOptions(user, options);

return options;
```

### パスキー認証のための結果を受け取るエンドポイント

`/assertion/result` エンドポイントは、パスキー認証のための結果を受け取るエンドポイントとなっている。

まずリクエストからユーザ情報とそれに関連するクレデンシャル、セッションからチャレンジを取得する。

```ts
const { body } = req;

// (Pseudocode) ログインユーザーを DB から取得
const user: UserModel = getUserFromDB(loggedInUserId);
// (Pseudocode) Step 3-2 で保存した認証オプションを取得
const currentOptions: PublicKeyCredentialRequestOptionsJSON =
  getCurrentAuthenticationOptions(user);
// (Pseudocode) 認証レスポンスに含まれる `id` に対応するパスキー情報を DB から取得
const passkey: Passkey = getUserPasskey(user, body.id);

if (!passkey) {
  throw new Error(`Could not find passkey ${body.id} for user ${user.id}`);
}
```

その後、`@simplewebauthn/server` ライブラリの `verifyAuthenticationResponse` メソッドを利用して認証結果を検証する。

```ts
let verification;
try {
  verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: currentOptions.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.id,
      publicKey: passkey.publicKey,
      counter: passkey.counter,
      transports: passkey.transports,
    },
  });
} catch (error) {
  console.error(error);
  return res.status(400).send({ error: error.message });
}

const { verified } = verification;
return { verified };
```

以上のように、データベーススキーマの拡張とエンドポイント実装を行うことで、従来の認証方式からパスキー認証に対応させることが可能となる。
従来のデータベースに対して該当ユーザがパスキー認証で登録したかどうかを示すカラムを追加することで、過渡期においてはパスキー認証と従来の認証方式を併用することも可能となる。実装については柔軟に対応することが望ましい。

# パスキーの導入を経営陣に提案する際のポイント

パスキーの導入を提案する場合、以下のようなメリットと懸念点を説明する。

## メリット・導入するべき理由

### セキュリティの向上

パスキーは従来のパスワードに比べてフィッシング攻撃やリプレイ攻撃に対して強固である。ユーザーは秘密鍵をデバイスに保持し、サーバーには公開鍵のみが保存されるため、攻撃者がパスワードを盗む脅威を根絶することができる。フィッシングの脅威が大幅に減ることをユーザに説明することができれば、プロダクトの信頼性を底上げし、イメージアップにつなげることが出来る。
不正ログインやアカウント乗っ取りに対しても十分に耐性があり、全般的な不正アクセス防止に寄与する。

### ユーザ体験の向上

パスワードレス認証であることに加え、`autofill`機能を利用することでクレデンシャルの入力が不要となり、かんたんにログインできるようになる。UI/UX をうまく設計することができれば大幅にユーザ体験を向上させることができる。

### サーバ側でパスワードを保管する必要性からの解放

自前でパスワード認証を実装している場合、サーバのデータベースにパスワードのハッシュやソルトを保存する必要があった。この場合、ハッシュやソルトの漏洩はセキュリティインシデントになるという問題が存在した。
しかしパスキー認証の場合はサーバに保存するものは公開鍵であり、秘密鍵は保存されない。そのためパスワードハッシュに比べ機密性が低く、漏洩リスクは比較的低いといえる。

## 懸念点

### ユーザ端末における互換性

ユーザ端末においてバージョンが古く、パスキー認証に対応していない場合、ユーザがパスキー認証を利用できない可能性がある。
パスキー認証の導入について検討を行う場合、該当するアプリケーションのユーザがどのような端末を利用しているかを調査し、パスキー認証を導入しても問題がないかどうかを調査しておく必要がある。

### ユーザ教育の必要性

パスワード認証に慣れているユーザについては、パスキー認証を導入するメリットの理解が得られず、パスキー認証を導入するモチベーションが低い場合がある。パスキー認証の対応について理解を促す何らかの方法が必要である。ユーザを引き付けるためにパスキー認証のデモ動画を作成したり、UI/UX が直感的でありスムーズにログインできることをアピールするべきである。

### デバイス紛失時のリカバリー対応

パスキーの問題点として、デバイス紛失時や移行時のリカバリー対応が挙げられる。パスキーはデバイスに紐づいているため、同期をしていない場合ではアカウントにログインできなくなる可能性がある。これらのケースに備え、パスキーのクラウド同期は必須にすることが望ましい。

以上のようなポイントを説明することで、パスキーの導入を経営陣に提案することができると考える。

# まとめ

以上、パスキー認証の概要、従来の認証方式との比較、サーバ側の実装変更、導入提案のポイントについて解説しました。
自分も新しく勉強した内容であり、まだまだ理解が浅い部分もあります。アテステーションやアサーションの詳しい内部の仕組みについてはキャッチアップができませんでしたが、ざっくりとした流れ・実装方法については理解を深めることができました。
パスキー認証は、セキュリティの向上やユーザ体験の改善に寄与する可能性が高い技術です。今後もこの分野の技術動向を追いかけ、より安全で使いやすい認証方法を提供できるよう努めていきたいと思います。

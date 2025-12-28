---
title: "はじめに"
free: true
---

## このブックについて

本書は、OAuth 2.0 / OAuth 2.1 と OpenID Connect (OIDC) の基礎について、
しっかりと学ぶことを目的としています。

「OAuth って聞いたことはあるけど、いまいちよくわからない」
「OIDC を使っているけど、仕組みを説明しろと言われると困る」
・・・という方に向けて、OAuth/OIDC の基本概念、フロー、セキュリティ対策などを丁寧に解説していきます。

OAuth/OIDC をなんとなく理解している状態から、**完全に理解した**状態へステップアップすることを目指しましょう。

![](/images/01-intro/2025-12-01-19-41-53.png)

## このブックで学べること

本書を読み終えると、以下の内容を理解できるようになります。

- OAuth 2.0 / 2.1 と OIDC の基本概念と目的の違い
- OAuth フローに必要となる主要な概念と登場人物（ロール）
- OAuth 認可コードフローの詳細な仕組み
- OAuth フローに対する代表的な攻撃手法とその防御方法
- OIDC の基本的な仕組みと特徴
- OIDC フローに対する代表的な攻撃手法とその防御方法
- その他、OAuth/OIDC に関する重要な知識

## 対象読者

本書は以下のような方を対象としています。

- OAuth/OIDC の基礎をしっかり学びたいエンジニア、セキュリティ担当者
- OAuth/OIDC を利用して ID 基盤を構築する予定の開発者
- OAuth/OIDC のセキュリティ対策に関心のある方
- IDaaS を使っているが、内部の仕組みを理解したい方

## このブックの進め方

OAuth/OIDC の世界には、非常に多くの概念と前提知識が登場します。最初からすべてを理解することは不可能です。

そこで本書では、**簡単な例をしっかり踏み固めてから、理解を広げていく**
というアプローチを採用しています。

具体的には、以下のように段階を踏んで解説を進めます。

1. **最初は認可コードフロー + Confidential Client を前提に解説**
   - 最もシンプルで理解しやすい構成から開始
2. **その後、Public Client や PKCE などの防御機構を追加**
   - 徐々に複雑なケースへ拡張
3. **他のフローに関しても、十分な準備が整ってから解説**
   - インプリシットフローなどは、認可コードフローを理解してから解説を行う
4. **OAuth が万全になってから OIDC に進む**
   - OIDC は OAuth の上に構築されているため、OAuth の理解が不可欠

千里の道も一歩から。
複雑なものは、じっくりと時間をかけて理解していくことが重要です。
焦らず、一歩ずつ進んでいきましょう！

![](/images/01-intro/2025-12-01-19-42-29.png)

## 参考にする仕様

本書では、以下の仕様書・参考資料を基に解説を行います。

### OAuth 2.0 関連

- [RFC 6749 – The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 6750 – Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750)
- [RFC 9700 – Best Current Practice for OAuth 2.0 Security (BCP 240)](https://www.rfc-editor.org/rfc/rfc9700)
- [RFC 7636 – PKCE (Proof Key for Code Exchange)](https://www.rfc-editor.org/rfc/rfc7636)

### JWT 関連

- [RFC 7519 – JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 7515 – JSON Web Signature (JWS)](https://www.rfc-editor.org/rfc/rfc7515)

### OpenID Connect 関連

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)

必要に応じて、これらの仕様を参照しながら読み進めてください。

:::message
実在するプロバイダ（Auth0、Firebase Authentication など）の実装は、詳細を見るとベンダーによって独自性が強いことがあります。
その独自性が学習の妨げとなる場合もあるため、本書を読む際は、既存の プロバイダ の仕様を一旦忘れることをおすすめします。
:::

## 執筆の参考とした書籍

今回の執筆にあたり、Auth 屋 さんの書籍を参考にさせていただきました。

- [雰囲気で使わずきちんと理解する！整理して OAuth2.0 を使うためのチュートリアルガイド](https://amzn.asia/d/7rTlNtb)
- [雰囲気で OAuth を使っているエンジニアが、最新のベストプラクティス OAuth 2.1 を整理して学べる本](https://authya.booth.pm/items/1296585)
- [OAuth、OAuth 認証、OpenID Connect の違いを整理して理解できる本 [2024 年改訂版]](https://authya.booth.pm/items/1550861)
- [OAuth・OIDC への攻撃と対策を整理して理解できる本（リダイレクトへの攻撃編 [2023 年改訂版]](https://booth.pm/ja/items/1877818)

素晴らしい書籍を執筆してくださった Auth 屋 さんに、心より感謝申し上げます。

また、以下の記事を参考にさせていただきました。
この他にも、ritou さん、川崎貴彦さんのブログに非常にお世話になりました。
心より感謝申し上げます。

https://ritou.hatenablog.com/entry/2020/12/01/000000
https://zenn.dev/ritou/articles/d26c7861047a2d
https://qiita.com/TakahikoKawasaki/items/63ed4a9d8d6e5109e401

## 学習を支えてくれるキャラクターたち

本書の学習を支えてくれるキャラクターたちを紹介します。

https://x.com/kura_lab/status/382462488060497920

OAuth たん (左) と OpenID コネクたん (右) です。
それぞれ、OAuth 2.0 と OpenID Connect の擬人化キャラクターです。

Twitter 上では、2013 年 5/24 開催の idcon で初めて報告されて以来、多くの人に親しまれています。
いまいち知名度がないのが悩みですが、本書を通じて彼女たちの魅力も伝われば幸いです。

二次創作で盛り上げよう！

![](/images/01-intro/2025-12-01-19-43-42.png)

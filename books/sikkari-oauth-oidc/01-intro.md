---
title: "はじめに"
---

# このブックについて

このブックでは、OAuth 2.0 と OpenID Connect (OIDC) について、基礎から丁寧に解説していきます。

OAuth と OIDC は現代の Web サービスやアプリケーションにおいて欠かせない技術です。「Google でログイン」「X（Twitter）でログイン」といったソーシャルログイン機能や、サードパーティアプリとのデータ連携など、私たちの日常で広く使われています。

しかし、これらの技術を「なんとなく」使っている開発者も多いのではないでしょうか。このブックでは、「なんとなく」を卒業し、OAuth/OIDC の仕組みを最初からしっかり理解することを目指します。

## 対象読者

- OAuth/OIDC を使ったことはあるが、仕組みをきちんと理解したい方
- 認証・認可の基本概念を学びたい方
- セキュリティを意識した実装を行いたい方
- これから OAuth/OIDC を利用したサービスを開発する予定の方

## このブックで学べること

1. **OAuth と OIDC の違い** - それぞれの目的と役割を理解する
2. **OAuth の基本概念** - アクセストークン、スコープ、登場人物（ロール）
3. **認可コードフロー** - 最も推奨されるフローの詳細
4. **セキュリティ** - 攻撃手法と防御策（PKCE、state パラメータ）
5. **クライアントの種類** - Confidential Client と Public Client の違い

## このブックの進め方

このブックでは、まず **Confidential Client**（サーバサイドで動作するクライアント）を前提として解説を進めます。これは、OAuth のフローを最もシンプルに理解するためです。

Public Client（ブラウザやモバイルアプリで動作するクライアント）については、後半の章で詳しく解説します。

## 参考にしている仕様書

このブックでは、以下の仕様書を参考にしています。正確な情報については、これらの原典を参照してください。

- [RFC 6749 - The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 7636 - PKCE (Proof Key for Code Exchange)](https://www.rfc-editor.org/rfc/rfc7636)
- [RFC 9700 - OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)

それでは、OAuth と OIDC の世界へ足を踏み入れましょう。

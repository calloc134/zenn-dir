---
title: "JWTとJWS/JWEの概要"
---

## 概要

この章では、ID トークンの構造を理解するために
まず **JWT（JSON Web Token）** について解説します。

また、JWT に関連する仕様である **JWS（JSON Web Signature）** と
**JWE（JSON Web Encryption）** についても概要を説明します。

## JWT 自体の仕様

**JWT（JSON Web Token）** は、
データを JSON 形式で表現し、署名や暗号化で保護してコンパクトに表現するための仕様です。

> JSON Web Token (JWT) is a compact, URL-safe means of representing claims to be transferred between two parties.
>
> — [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519)

## 一般的に「JWT」と言われて思い浮かべる形

「JWT」と聞いて、多くの人が思い浮かべるのは以下のような形式でしょう。

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.Qdz...
```

これは **3 つの部分がピリオド（.）で連結された形** です。

```
xxxxx.yyyyy.zzzzz
```

それぞれの部分は **Base64Url エンコード** されています。

この形式は、正確には **JWS Compact Serialization 形式の JWT** と呼ばれます。
JWT の厳密な定義を理解するために、まずは JWS と JWE について見ていきましょう。

## JWT に関連する仕様、JWS/JWE とは

### JWS（JSON Web Signature）

**JWS** は、データに対して **整合性保護（Integrity Protection）** の仕組みを提供する仕様です。

> JSON Web Signature (JWS) represents content secured with digital signatures or Message Authentication Codes (MACs) using JSON-based data structures.
>
> — [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515)

一般的に「JWT」と言われて目にするのは、ほとんどがこの JWS 形式です。

### JWE（JSON Web Encryption）

**JWE** は、データに対して **暗号化** を行い
**機密性（Confidentiality）** と **整合性保護** を提供する仕様です。

> JSON Web Encryption (JWE) represents encrypted content using JSON-based data structures.
>
> — [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516)

JWE は、トークンの中身を第三者から見られないようにする必要がある場合に使用されます。

### JWS/JWE のデータ格納部分

JWS と JWE は、それぞれデータを格納する部分を持っています。

| 仕様 | データ格納部分   | 説明                                       |
| ---- | ---------------- | ------------------------------------------ |
| JWS  | ペイロード       | 任意のデータをそのまま格納                 |
| JWE  | プレインテキスト | 暗号化され、暗号文（Ciphertext）として格納 |

JWE の場合、データは生成時に暗号化され、暗号文として JWT 内に含まれます。

### シリアライズ形式（表現方法）

JWS/JWE には、それぞれ複数の **シリアライズ形式**（表現方法）があります。

| 形式                  | 説明                             |
| --------------------- | -------------------------------- |
| Compact Serialization | URL に載せやすいコンパクトな表現 |
| JSON Serialization    | JSON 形式で柔軟に表現できる      |

JWT で一般的に使われるのは **Compact Serialization** です。
これが、先ほど見た「ピリオドで区切られた 3 つの部分」の正体です。

## JWT の厳密な定義

JWT の厳密な定義は **Compact Serialization 形式の JWS または JWE** となっています。

> A JWT is represented as a sequence of URL-safe parts separated by period ('.') characters. Each part contains a base64url-encoded value. The number of parts in the JWT is dependent upon the representation of the resulting JWS using the JWS Compact Serialization or JWE using the JWE Compact Serialization.
>
> — [RFC 7519 Section 3](https://www.rfc-editor.org/rfc/rfc7519#section-3)

なお、一般的に「JWT」と呼ばれて目にするのは
**JWS Compact Serialization 形式** であることがほとんどです。

## 今回の解説の範囲

OIDC の ID トークンを理解するために必要な JWT の仕様は、
主に **JWS 形式** に関するものです。

JWE やその他の詳細な仕様については、応用編で改めて解説します。
この章では、ID トークンの理解に必要な範囲に絞って説明を進めます。

## まとめ

- **JWT は JWS か JWE の Compact Serialization 形式**
- **JWS は整合性保護の仕組みを提供**
  - デジタル署名または MAC でデータを保護
- **JWE は暗号化の仕組みを提供**
  - 機密性と整合性を保護
- **一般的に見る「JWT」は JWS Compact Serialization 形式**
  - 3 つの部分がピリオドで連結された形
- **包含関係が複雑なので注意**
  - JWT ⊂ JWS/JWE ではなく、JWT = JWS/JWE の Compact 形式

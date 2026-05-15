---
title: "一人暮らしこそOpenWrtをやれ！ (v6プラス理論編)"
emoji: "🏠"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["network", "openwrt", "ipv6", "フレッツ光", "ipoe"]
published: true
---

# はじめに

こんにちは！かろっく@calloc134 です。
先日、晴れて社会人となりました！
お仕事では主にフロントエンドやったり、
たまにバックエンドやったりデータ基盤やったりすると思います。
たまに認証周りも触るかもしれない？わからん・・・

さて、社会人になるということで、
念願の一人暮らしを始めたのですが、当然ネット環境も必要になります。

せっかく自分でネット環境を構築するのなら、
**ルータも自分でカスタマイズしてみたい！** というモチベが高まり、
自前でルータを用意、更にOpenWrtを導入してみることにしました。

ただでさえ初めてのネットの契約、
ルータの選定、導入と接続確立まで・・・
思ったより大変でした。

同じように一人暮らしでOpenWrtを導入したい人の参考になればと思い、
今回の記事を書いてみました。

# まず OpenWrt とは

OpenWrtとは、ルータ機器のためのLinuxベースのオペレーティングシステムです。
https://ja.wikipedia.org/wiki/OpenWrt

ルータ機器にインストールすることで、通常のルータ機能に加え、
**有志によって開発された様々な機能**を利用することができます。

また、サポート終了してしまった古い機器にもインストールすることができるため、
**スペックが古いがリソースが余っている機器**を安価に再活用することができます。

# なぜOpenWrtを導入したかったか

ロマンがあるからです！！！

・・・というのはざっくばらんとしすぎましたが、
とにかくネットワーク機器を自分でカスタマイズしてみたかったというのが一番の理由です。

OpenWrtを導入することで、以下のようなことができるようになります。

## Wifi ログイン機能の追加

喫茶店のフリーWifiにログインしたとき、
Wifiのログイン画面が表示された人も多いのではないでしょうか。

このログイン画面はCaptive Portalと呼ばれるもので、
OpenWrtを導入することで自宅のWifiにもこの機能を追加することができます。

ゲストがWifiに接続したときにログイン画面が表示されるとテンションがあがりますよね？

## ネットワークのオブザーバビリティ向上

ネットワークの統計情報を収集し、外部に送信することができます。

純正ルータではOpenTelemetryなどのプロトコルをサポートしていないことが多いですが、
OpenWrtを導入することでこれらのプロトコルを利用することができます。

これにより、Webアプリの監視を行うのと同じ感覚で、
ネットワークの状態を可視化することができます。

## VPNルータ

WireGuardなどのVPNプロトコルをサポートしているため、
通信をVPNルータ経由で行うことができます。

通信をすべてVPN経由にできるのは面白いのではないかと思います。

## Cloudflaredを用いたサービス公開の簡略化

Cloudflared とは、 Cloudflareが提供するツールです。
このCloudflaredを動作させているサーバで、
そのサーバ上で動いているサービスをCloudflare経由で公開することができます。

ルータでCloudflaredを動作させられるようになると
**ルータからアクセスできるサービスであれば公開できる**ことになるため、
**通常であればCloudflaredを原理的に導入できないような機器**のサービスも
Cloudflared経由で公開できるようになります。

このように、OpenWrtを導入することで、
様々な面でネットワーク環境をカスタマイズすることができます。

そしてなにより、**ネットワークに詳しくなれる！**

# 前提: 契約したネットワーク回線

一人暮らしをするにあたってネットワーク回線を契約する必要があります。
自分は契約した内容は以下のとおりです。

- 回線: enひかり マンションタイプ
- オプション: v6プラス

リンクを以下に掲載しておきます。

https://enhikari.jp/v6plus.html

この回線を当初選んだ理由は、
enひかりが一番安そうだったからというのと、
v6プラスを有識者に勧められたから・・・というとりとめのない理由です。

OpenWrtを導入するにあたり、まずは
自分の利用するネットワーク回線がどのようなものなのかを理解する必要があると考えたため、
契約したネットワーク回線について、どのようなものなのかをしっかり調査してみました。

## enひかりとは

enひかりは、NTT東日本・西日本のフレッツ光回線を利用したサービスと紹介されています。
**月額料金が比較的安価**なことが特徴です。

https://xn--gmq856i.jp/enhikari.html

おそらく最安値水準っぽい。
自分の場合、不動産屋から勧められた回線が高かったため、
費用を抑えるためにenひかりを選びました。

## enひかりのオプション

更にenひかりでは、オプションを付け加えることで機能拡張を行うことが出来ます。
ここでは、IPv6に対応したオプションである**v6プラス**について解説します。

https://enhikari.jp/v6plus.html

v6に対応したオプションを追加することで、
IPv6の通信が可能になるだけでなく、**IPv4の通信も品質向上が期待できる**ようになります。
この仕組みについて解説していきます。

### IPv4 PPPoEとその弱点

まずオプションを追加しない場合、IP4/IPv6それぞれについて、以下のような通信の仕組みを利用します。

- IPv4: IPv4 PPPoE
- IPv6: 基本的に利用できない？ (不明)

ここで、 IPv4 PPPoEについて解説します。
PPPoEを理解するためには、まずPPPを理解する必要があります。

Point to Point Protocol (PPP) とは、電話回線などのPoint to Pointな通信を行うためのプロトコルです。
https://ja.wikipedia.org/wiki/Point-to-Point_Protocol

このPPPをイーサネット上で利用できるようにしたのが、RFC 2516で定義されているPPPoEです。
https://ja.wikipedia.org/wiki/PPPoE

つまりPPPoEを利用することで、
**物理的には離れていても論理的にはあたかも電話回線で直接接続しているかのような**
通信を行うことができます。

フレッツ系でこのPPPoEが利用されてきた理由は、
ダイアルアップをベースに発展してきたインターネットのプロバイダが、
**ダイアルアップ時代からの資産**である
加入者ごとの認証管理・課金体系やサービス管理の仕組みを
継続して利用するための手段としてPPPoEを採用してきたからだと考えられます。

しかしPPPoEを利用するためには、
終端装置を設置し、その装置を経由して通信を行う必要があります。
そのため終端装置が混雑点となり、通信の品質が低下するという問題があります。

実際のところ、enひかりのIPv4 PPPoEは
**夜間の速度が10Mbps以下が連日続く**など、あまり品質が良いとは言えない状況のようでした。

https://setting.jp/ipv6-v6plus/#index_id8

### v6対応オプションとIPoE・MAP-E、そして通信品質の向上

v6に対応したオプションを追加することで、
以下のような通信の仕組みを利用することができます。

- IPv6: IPoE (IP on Ethernet、つまり単にイーサネット上でIPを利用する方式)
- IPv4: MAP-E (IPv4 over IPv6の仕組み)

これを利用することで、**IPv4の通信速度も向上**します。
この仕組みがどのようなものであるか、先ほどのPPPoEの解説も踏まえて説明します。

前述の通りPPPoEは終端装置を経由する必要があるため、終端装置にアクセスが集中します。
終端装置にアクセスが集中すること自体は問題がないのですが、
PPPoEはステートフルで状態を保つ設計なため、冗長化・負荷分散ができず、
結果として通信が混雑点となり、通信品質の低下に繋がってしまうという問題があります。

そこでv6に対応したオプションを追加すると、
まずIPv6の通信はIPoEを利用することができるようになります。

IPoEは、単にイーサネット上でIPを利用する方式です。
IPoEと表現されていますが、IP over Ethernetなので、
単なる**TCP/IPの仕組みをそのまま活用**したものです。

ではIPv4の通信はどうなるのでしょうか？
IPv4の通信は、**MAP-E**という仕組みを利用することになります。

MAP-EはIPv4 over IPv6の仕組みで、
**IPv4の通信をIPv6の通信の中にカプセル化して送る**方式です。

https://y2tech.net/blog/inet/understanding-how-map-e-works-10955/

つまり、**IPv4の通信も、**
**IPoEで高速なIPv6を利用して送ることができる**ようになるということです。

MAP-Eも同じく終端装置がありますが、
こちらはユーザのセッション情報がなくステートレスな設計になっており、
冗長化・負荷分散が可能な構造になっています。

そのため、PPPoEと比べて、終端装置が混雑点となっても
通信品質が大きく低下することはありません。

結果的にIPv4の通信もPPPoEを利用する必要がなくなり、
終端装置を経由する必要がなくなります。

:::message 

PPPoEと比べてIPoEおよびMAP-Eの速度が低下しない理由は、
今回解説するステートフル vs ステートレスという要因の他にも、
人によって様々な解釈があるようです。

ひとまず自分の解釈を提示しておきますが、
興味のある方はよりしっかり調査してください。
詳しい方がいればぜひ教えてください。

:::


実際、オプションなしからv6プラスに乗り換えたことで、
昼間: 27Mbps → **260Mbps**
夜間: 7.4Mbps → **240Mbps**

のように、**通信品質が大幅に向上した**という報告がなされています。

https://setting.jp/ipv6-v6plus/#index_id9

この話について、更に詳しく解説しているブログ記事を掲載しておきます。
参考になると思いますので、興味のある方はぜひ読んでみてください。
https://note.com/noblehero0521/n/n8b08dcf67d25

### 似たようなオプションの違い

余談ですが、
enひかりが提供するv6に対応したオプションについて以下の2種類が存在しています。
違いが分かりづらく、また価格も同じなのでややこしいです。

- with v6プラス
- IPv6オプション

この2つについて違いを解説します。

with v6プラスは
株式会社JPIXの提供する「v6プラス」というサービスを利用し、事業者はJPIXとなります。
https://enhikari.jp/v6plus.html
https://www.jpix.ad.jp/service/?p=3444

一方IPv6オプションはBIGLOBE社の提供するインフラを利用するため、
事業者はBIGLOBEとなります。
https://enhikari.jp/ipv6option.html

今回v6プラスを選択した理由は、
BIGLOBE社のインフラは情報が限られており、あえてこちらを選ぶ理由が見当たらなかったからです。

JPIXの提供するv6プラスは情報が豊富に公開されており、
**OpenWrtでの利用例も多く見られたため**、こちらを選択しました。

### 一旦立ち止まって考える 事業者の責務

ここまで、様々な事業者の名前が登場しました。

enひかりの with v6プラスオプションを利用する場合、事業者は**JPIX**となります。
そして、enひかりとはNTT東日本・西日本のフレッツ光回線を利用したサービスであるため、
**物理的な回線はNTT東日本・西日本が提供するもの**になります。

それぞれの事業者について、それぞれがどこまでの責務を負っているのか、
考えてみましょう。

今回の場合、

- NTT東西: フレッツ網
- JPIX: VNE

という役割に相当すると考えることができます。

#### フレッツ網: NTT東西の責務

https://ja.wikipedia.org/wiki/%E3%83%95%E3%83%AC%E3%83%83%E3%83%84

フレッツ網の責務は、**「自宅からVNEまでの通信を提供すること」** と考えることができます。

まず、始点についてみてみましょう。

光回線を契約すると、**ONU** というデバイスが自宅に設置されます。
このONUは、光信号を電気信号に変換する装置です。
ここからひかりの通信が始まると考えることができます。

https://flets-w.com/chienetta/pc_mobile/cb_other56.html

このONUから、NTT東西の提供しているネットワーク基盤に接続されます。

今回の例ではIPoEを利用しているため
**NGN(Next Generation Network)** というネットワーク基盤に接続されるものと
考えることができます。

https://www.janog.gr.jp/meeting/janog42/application/files/1515/3238/7347/janog42-IPoE-ntteast_yamaguchi.pdf

そしてこの NGN では、
VNEであるJPIXの提供するv6プラスのネットワーク基盤に取次を行います。
ここから先の通信はVNEであるJPIXの責務となります。

#### VNEであるJPIXの責務

VNEであるJPIXの責務は、
**「フレッツ網から取次を受けた通信を、インターネットに接続すること」** と
考えることができます。

https://www.janog.gr.jp/meeting/janog42/application/files/8015/3238/7118/janog42-IPoE-vne_toyama.pdf

前述のとおり、NTTの提供するフレッツ網は
インターネットへの接続を直接提供するものではなく、
**VNEに取次を行うこと**が役割となっています。

VNEのネットワークを経由し、そこからインターネットに出ることで
晴れてインターネットに接続できるようになります。

#### enひかりの責務

では、enひかりの責務はどうなっているのでしょうか？

enひかりは、
**光コラボレーション事業者**と呼ばれる、
フレッツ網を利用したサービスを提供する事業者の一つです。

https://flets.com/assets/html/collabo_service.html

要するに、利用者に対して
**「フレッツ網を利用したインターネット接続サービス」** を提供することが責務となります。

多くの場合、光コラボ事業者は**回線 + VNE**のセットのプランとしてサービスを提供します。
今回の場合は、enひかりが

- 回線 = フレッツ網
- VNE = JPIX (の提供するv6プラス)

をセットにしてサービスを提供していると考えることができます。

enひかりでオプションとしてv6プラスを契約するということは、
実質的に**JPIXの提供するv6プラスを利用することに**なります。

そのため、ここからはenひかりに限定した解説ではなく、
JPIXの提供するv6プラスを利用する場合として解説を行うことにします。

### v6プラスのIPv6取り扱い

enひかりでv6プラスを契約するにあたり、
IPv6のアドレスの割り振り方について少し注意が必要です。

具体的には、**ひかり電話の有無で**IPv6のアドレスの割り振り方が異なります。

- ひかり電話あり: DHCPv6-PD (Prefix Delegation) で /56 のIPv6アドレスが割り振られる
- ひかり電話なし: RA (Router Advertisement) で /64 のIPv6アドレスが割り振られる

この違いについてはIPv6の知識が必要なため、後ほどIPv6の事前知識のところで解説します。

## ネットワーク回線のまとめ

今回契約したネットワーク回線をまとめます。

- 回線: enひかり マンションタイプ
- オプション: v6プラス
- IPv6のアドレスの割り振り方: RA で /64 のIPv6アドレスが割り振られる

# 前提2: 必要となるネットワーク知識

ここまでで、契約したネットワーク回線について解説してきました。

加えて今回のOpenWrtの導入を行う場合、TCP/IPのネットワーク知識が必要となります。
純正のルータであればよしなにやってくれる部分も、
OpenWrtを導入する場合は**自分で設定する必要がある**ためです。

今回のネットワーク構成において、特に必要となる部分について事前に解説しておきます。
なお、IPv4についてはすでに十分な知識があることを前提としています。

## IPv6の事前知識

### IPv6の思想

IPv6とは、IPv4の次世代のインターネットプロトコルです。
IPv4は、グローバルIPアドレスの枯渇問題に対し、
NATやプライベートIPアドレスといった
**「アドレスをローカルに収容する」** というアプローチで対処してきました。

一方IPv6はNAT技術を利用するのではなく、
最初から**それぞれの端末がグローバルIPアドレスを持つことを想定された設計**になっており、
NATに依存しないエンドツーエンドの通信を取り戻すという思想を帯びています。
結果として、IPv6はIPv4と比べてアドレス空間が大幅に拡大されています。

一方でIPv4に慣れているユーザにとっては、
端末にグローバルIPアドレスが割り振られることに対して抵抗を感じることもあるかもしれません。

IPv6のアドレスは128ビットです。
また、一つのインターフェース(NIC)が複数のIPv6アドレスを持つことができます。

IPv4では通常一つのインターフェースに一つのIPv4アドレスが割り当てられます。
またIPv4では、一つのインターフェースに複数のIPv4アドレスが割り当てられることはあまり一般的ではありません。

IPv6では同じインターフェースに

- **リンクローカルアドレス**
- **グローバルユニキャストアドレス**
- ユニークローカルアドレス

など複数のIPv6アドレスが割り当てられることが一般的です。

### IPv6 アドレスの種類

IPv6のアドレスには、いくつかの種類があります。
それぞれの種類について簡単に説明します。

#### リンクローカルアドレス

リンクローカルアドレスとは、**同一リンク内の通信にのみ有効なIPv6アドレス**のことです。
すべてのインターフェースが最低一つのリンクローカルアドレスを持ちます。

ここで、リンクとはどういうことでしょうか？
リンクとは、**L3ルータを経由せず、直接通信が可能な範囲のこと**を指します。
具体的には、同一のL2セグメント、
つまり同じイーサネット範囲やVLAN内の範囲のことであると考えてください。

#### グローバルユニキャストアドレス

グローバルユニキャストアドレスとは、
**インターネット上で一意に識別されるIPv6アドレス**のことです。
IPv4のグローバルIPアドレスに相当するものです。
インターネット上で通信を行うためには、
少なくとも一つのグローバルユニキャストアドレスが必要になります。

#### ユニークローカルアドレス

ユニークローカルアドレスとは組織内でのみ有効なIPv6アドレスのことです。
IPv4のプライベートIPアドレスに相当するものですが、IPv6では思想的にあまり重視されない傾向にあるようです。
今回の解説でも基本的に登場しません。

今回の解説では、リンクローカルアドレス・グローバルユニキャストアドレスの2種類のIPv6アドレスについて、
どのように割り振られるのか、どのように利用されるのかについて説明していきます。

#### 教科書的な IPv6 接続確立の流れ

IPv6において、一般的に接続を確立するまでの流れを見ていきましょう。

IPv4では、基本的にルータからDHCPでIPv4アドレスが割り振られることが一般的でした。
一方IPv6では、
利用してよいIPv6プレフィックス、つまり**利用してよいIPv6アドレスの範囲をルータが通知**し、
クライアントはその通知を受けて、
**利用してよいIPv6アドレスの範囲の中からIPv6アドレスを自分で生成して利用する**
という流れが一般的です。

クライアントのインターフェースが有効になった後の流れを見ていきましょう。

1. インターフェースが立ち上がった後、リンクローカルアドレスを生成する
2. リンクローカルアドレスが重複していないか確認する 
(DAD: Duplicate Address Detection 1回目)
3. クライアントは、**利用して良いIPv6プレフィックスを通知**する
**RA (Router Advertisement)** をルータから受信する
4. 利用してよいIPv6プレフィックスの中から
グローバルユニキャストアドレスを生成する
5. グローバルユニキャストアドレスが重複していないか確認する 
(DAD: Duplicate Address Detection 2回目)
6. IPv6の接続確立

細かいプロトコルの動作は省略していますが、IPv6の接続確立の流れはこのようになっています。

なお、3の手前に、クライアントがRS (Router Solicitation) をルータに送信し、
ルータのRA送信を促すという流れが入ることもあります。

### 今回のネットワークでIPv6が割り振られるまで

では、今回のNTT東西のフレッツ網 + JPIXのv6プラスを利用する場合、
どのようにIPv6のアドレスが割り振られるのかを考えていきます。

NTT東西のフレッツ網 + JPIXのv6プラスを利用する場合、
IPv6アドレスの割り振りは NTT東西のフレッツ網のルータが行います。

JPIX側のインフラではなく、
NTT東西のフレッツ網のルータがIPv6アドレスの割り当てを行うのが厄介なポイントの一つです。

:::message 

ここは推測ですが、JPIXのインフラからNTT東西のフレッツ網のルータに対して、
利用できるIPv6プレフィックスの範囲を通知するような何らかの仕組みがあるのではないかと考えられます。

:::

そして、NTT東西のフレッツ網のルータのIPv6アドレスの割り振り方は、
音声利用 IP 通信網サービス等を利用するかどうか、つまり**ひかり電話の有無**で異なります。


- ひかり電話あり: DHCPv6-PD (Prefix Delegation) 方式
- ひかり電話なし: RA (Router Advertisement) 方式


これは、NTT東西が公開している資料を見ても明示されています。
NTT東西が公開している資料を以下に提示します。
https://www.ntt-east.co.jp/info-st/katsuyou/h24/temp24-1.pdf


enひかりの公式資料について、v6プラスにおいてIPv6の割り当てがひかり電話の有無で異なることが明示されている資料は見つけられませんでしたが、
BIGLOBE社の提供するIPv6オプションを利用する場合の資料には、ひかり電話の有無でIPv6の割り当て方が異なることが明示されていました。
合わせて掲載しておきます。
https://enhikari.jp/document/ipv6optionjyusetu.pdf


それぞれの特徴について表にまとめると以下のようになります。

| 方式                               | IPv6の思想からして自然か | ルータの動作として設計がしやすいか |
| ---------------------------------- | ------------------------ | ---------------------------------- |
| DHCPv6-PD (Prefix Delegation) 方式 | 不自然                   | 設計がしやすい                     |
| RA (Router Advertisement) 方式     | 自然                     | 設計がしづらい                     |

今回はひかり電話なしのプランを選択したため、後者についてのみ解説を行います。
興味のある方は前者についても調べてみてください。

RA方式で接続を行う場合、
先程説明した IPv6 接続確立の流れ と近い流れでIPv6のアドレスが割り振られることになります。
ただし注意しておくべきこととして、登場人物が3者になることが挙げられます。

- 1. 宅内のルータ 
(ONUに接続されているルータ。今回の場合はOpenWrtを導入する予定のルータ)
- 2. 宅内のクライアント (ユーザのPCやスマホなど)
- 3. NTT側のルータ (フレッツ網のルータ)

この構成でネットワークを組むと、
コミュニティ内で「NDプロキシ構成」と呼ばれる構成となります。
https://y2tech.net/blog/inet/applied-ipv6-ipoe-network-configuration-vol-1-7382/

このブログを読んでから今後更に調査を深めたい場合、
NDプロキシ構成というキーワードで調べてみると良いと思います。

この構成についてしっかり解説していきます。

NDプロキシ構成の一番の特徴は、
宅内ルータが NTT側のルータとクライアントの**IPv6プレフィックス情報を中継する**構成になり、
NTT側のルータとクライアントの通信にとって
**宅内ルータがほぼ透明**な構成になることです。

この構成の特徴を理解するために、IPv6の接続確立の流れを見てみましょう。

まず宅内ルータの WAN側インターフェースがONUに接続され、
NTT側のルータと宅内ルータが接続されます。

このときの流れは以下のようになります。

1. 宅内ルータの WAN側インターフェースが立ち上がる
2. 宅内ルータの WAN側インターフェースが立ち上がった後、
リンクローカルアドレスを生成する
3. リンクローカルアドレスが重複していないか確認する (DAD)
4. NTT側のルータから、利用して良いIPv6プレフィックスを通知する RA を受信する
5. 宅内ルータが、
利用してよいIPv6プレフィックスの中からグローバルユニキャストアドレスを生成する
6. グローバルユニキャストアドレスが重複していないか確認する (DAD)
7. IPv6の接続確立

この部分は、先程説明したIPv6の接続確立の流れとほぼ同じですね。
次に、クライアントが宅内ルータのLAN側インターフェースに接続され、
クライアントとNTT側のルータが接続されます。

このときの流れは以下のようになります。

1. クライアントのインターフェースが立ち上がる
2. クライアントのインターフェースが立ち上がった後、
リンクローカルアドレスを生成する
3. リンクローカルアドレスが重複していないか確認する (DAD)
4. NTT側のルータから **宅内ルータ** に
利用して良いIPv6プレフィックスを通知する RA が送信される
5. **宅内ルータ** がクライアントに、先程のRAをリレーする (RA Relay)
6. クライアントが、
利用してよいIPv6プレフィックスの中からグローバルユニキャストアドレスを生成する
7. グローバルユニキャストアドレスが重複していないか確認する (DAD)
8. IPv6の接続確立

利用してい良いIPv6プレフィックスの通知がNTT側のルータから宅内ルータに送信され、
それを **宅内ルータがクライアントにリレーする** という点が、
先程説明したIPv6の接続確立の流れと異なります。

:::message

なお、この解説では具体的な部分をいくつか省略しています。

- クライアントがRS (Router Solicitation) をルータに送信し RA送信を促す部分
- クライアントのアドレス重複確認と NDP をプロキシする部分
- クライアントがRAを受信した後、DHCPv6による追加情報の取得を行う部分

今回のネットワーク構成の理解にあたって、
これらの部分は重要ではないと判断し省略しています。

興味のある方は、NDプロキシ構成についてさらに調査してみてください。

:::

このようにNDプロキシ構成では、
クライアントとNTT側のルータの通信にとって宅内ルータがほぼ透明な構成になっています。

クライアントはグローバルのIPv6アドレスが直接割り当てられ、IPv6の思想からしても自然な構成になっています。
一方で宅内ルータが仲介することで、
クライアントが直接インターネットに露出することを防ぐことができ、
セキュリティの観点からも比較的安全な構成となっています。

## MAP-Eの事前知識

### MAP-Eとは

では、次にMAP-Eについて解説していきます。

MAP-Eは、IPv4 over IPv6の仕組みと言えます。
IPv4の通信をIPv6の通信の中にカプセル化して送る方式です。


フレッツ網のネットワーク基盤であるNGNは、IPv6 IPoEを前提としています。
そのため、IPv4の通信を行うにはIPv4 over IPv6の仕組みを利用する必要があります。

MAP-Eの技術詳細については深堀すると今回の記事の範囲を超えてしまうため、
ここではざっくりとした説明にとどめておきます。

詳しい解説は以下の記事を参考にしてください。
https://y2tech.net/blog/inet/understanding-how-map-e-works-10955/

IPv4 over IPv6の仕組みであるため、
VPNのような**トンネリングの仕組みと似たような構造**になっています。
MAP-Eに関連するルータとして、**MAP CE**と **MAP BR**というものがあります。

MAP CEとは**Customer Edge**の略で、ユーザ側のルータのことを指します。
今回はOpenWrtを導入する予定のルータがMAP CEに相当します。

MAP BRとは**Border Relay**の略で、VNE側のルータのことを指します。
今回はVNEにJPIXを利用しているので、JPIXの提供するMAP BRが該当します。

入口側のMAP CEでIPv4の通信を**IPv6の通信の中にカプセル化**してMAP BRに送信し、
出口側のMAP BRでIPv6の通信からIPv4の通信を取り出して
IPv4インターネットに送信するという流れになります。

MAP-Eの大きな特徴として、
ログインしてセッションを確立する必要がなく、
ステートレスで効率的に通信を行うことができるという点が挙げられます。

IPv4 PPPoEの場合、IPv4の通信を行うためには、
発信元が本当にそのIPv4アドレスを利用できるのかを確認するために、
**ログイン情報をセッションに保管**し、
そのセッション情報を**毎度の通信で参照**する必要がありました。

対してIPv6 IPoEでMAP-Eを利用する場合、
MAP CEのIPv6アドレスに対して特定のルール変換を行うことで
利用できる共有IPv4アドレス・利用できるポート番号を導出できる仕組みとなっています。

:::message

この仕組みについては後ほどMAP-Eルールのところで解説します。

:::

そのため、MAP BRがMAP CEからの通信を受け取ったときに、
通信の発信元が本当にこのIPv4アドレス・ポート番号を利用できるのかという検証を
**外部のセッション情報を参照することなく、ステートレスに行うことが**できます。

ステートレスになっているということは**データベースに依存しない**、
つまり**通信がスケールする構造になっている**ということです。

そのためIPv6 IPoE & MAP-Eは、
IPv4 PPPoEのように終端装置が混雑点となることがなく、
通信品質の低下が起こりにくい構造になっています。


### MAP-Eルールとは

MAP-Eには、MAP-Eルールというものが存在します。

宅内ルータがMAP-Eを利用開始する際に、JPIXのようなVNEは 
**MAP-Eルール**および **MAP-Eで接続開始するにあたって必要な情報**を
MAP CEに提供します。

MAP-Eルールとは、
ユーザ自身のIPv6アドレスプレッフィックスと、
ユーザが利用できる共有IPv4アドレスを紐づけるルールのことです。

また実際の接続確立には、MAP-Eルールに加えて

- 共有IPv4における利用可能なポート番号
- MAP BRのIPv6アドレス

が必要となります。

今回は MAP-Eルールの詳細な解説は割愛します。
そのため、これらの情報を **MAP-E関連情報** としてまとめて扱うことにします。

なお余談ですが、JPIXのv6プラスの利用にあたって注意しておくべきことが存在します。

JPIXの提供するv6プラスでは、
MAP-EのRFCであるRFC7597に記載されている方法ではなく、

RFC化するための**ドラフト(下書き)**段階である
draft-ietf-softwire-map-03 をベースとした方法で動作しています。
そのため、MAP-EでJPIXのv6プラスを利用する場合
OpenWrt ルータ側で draft-ietf-softwire-map-03 準拠オプションを有効にする必要があります。

OpenWrtでは レガシーモードとして
draft-ietf-softwire-map-03 準拠にするオプションが存在するため、
この点は特に問題ないと思いますが、念のため意識しておくと良いと思います。

https://www.jaipa.or.jp/guideline/pdf/v6hgw_Guideline_3.0.pdf

https://www.jpix.ad.jp/files/v6plus-ebook.pdf


### OpenWrt における MAP-E関連情報の取得

今回のネットワーク構成でMAP-Eを利用するためには、MAP-E関連情報を取得する必要があります。

今回は VNEにJPIXを利用するため、
JPIXの提供するMAP-E関連情報の取得方法、特に
v6プラスを利用する場合のMAP-E関連情報の取得方法について解説します。

MAP-E関連情報の取得は、一般的には DHCPv6を利用して行われます。
しかし、NTT東西のフレッツ網 + JPIXのv6プラスを利用する場合、
**仕組み上これが利用出来ません。**

DHCPv6サーバはNTT東西のフレッツ網側にされている一方で
MAP-E関連情報はVNEであるJPIX側で管理されているため、
DHCPv6を利用してMAP-E関連情報を配布することができないというのが理由です。

そのため、JPIXの提供するv6プラスを利用する場合、
ルータは**JPIXの内部APIにアクセスし、MAP-E関連情報を取得する**挙動となります。

純正のBuffaloルータを利用する場合は、
ルータに最初からJPIXの内部APIを叩いてMAP-E関連情報を取得する機能が実装されているため、
ユーザがMAP-E関連情報の取得方法を意識する必要はありません。

一方で OpenWrtを利用する場合は、
**ユーザがMAP-E関連情報の取得を自力で行う必要が**あります。

OpenWrtでMAP-E接続を行うとき、必要となるパラメータは以下のようになります。

- `peeraddr`: MAP BRのIPv6アドレス
- `ipaddr`: 実際に利用できるIPv4アドレスのプレフィックスの先頭アドレス
- `ip4prefixlen`: IPv4プレフィックス長
- `ip6prefix`: ユーザのIPv6アドレスプレフィックスの先頭アドレス
- `ip6prefixlen`: IPv6プレフィックス長
- `ealen`: EAビット長
- `psidlen`: PSID長
- `offset`: PSIDオフセット値

これらの値をどのように取得するかが、
OpenWrtでMAP-Eを利用する際の大きな課題となります。

OpenWrt利用時のMAP-E関連情報の取得方法としては、以下の2つの選択肢が考えられます。


1. **非公式の MAP-E関連情報計算サイトを利用する (推奨)**
2. JPIXの内部APIを叩いてMAP-E関連情報を取得する


では、それぞれの選択肢について解説していきます。


#### 非公式の MAP-E関連情報計算サイトを利用する

この方法は比較的難易度が低く、推奨される方法です。

JPIXのv6プラスで、かつ内部APIにアクセスできない場合でも、
およそのMAP-E関連情報を生成することのできる
非公式の MAP-E関連情報計算サイトが存在しています。

https://ipv4.web.fc2.com/map-e.html

このサイトは、**契約している回線に割り当てられたIPv6アドレスを入力すること**で
MAP-Eの接続に必要な関連情報を計算してくれるサイトです。

まず、契約している回線で https://ifconfig.co のようなサイトにアクセスし、
自身に割り当てられたIPv6アドレスを確認します。

その後、非公式の MAP-E関連情報計算サイトにアクセスし、
確認したIPv6アドレスを入力することで MAP-E関連情報を計算することができます。

このサイトではOpenWrtで必要なパラメータが直接表示されるため、
別途計算の必要は特にありません。

OpenWrtへの登録方法は実践編で解説します。

#### JPIXの内部APIを叩いてMAP-E関連情報を取得する

こちらは難易度が高く、推奨されない方法です。
基本的には非公式の MAP-E関連情報計算サイトを利用する方法で十分です。


ただしMAP-E関連情報計算サイトのデータベースが古くなっており、
MAP-E関連情報が正確に取得できない可能性があるため、
どうしても正確なMAP-E関連情報を取得したい場合は、
JPIXの内部APIを叩いてMAP-E関連情報を取得する方法を検討することになります。


解説した通り、Buffaloなどの正規のルータは、
内部で JPIXの内部APIを叩いてMAP-E関連情報を取得しています。

つまり、このAPIを自分で叩いてMAP-E関連情報を取得することができれば、
OpenWrtを利用していてもMAP-E関連情報の取得が可能になります。

ただしこのJPIXの内部APIは一般には公開されていないため、アクセスのためには
**既存のBuffaloルータのファームウェアをリバースエンジニアリングし、
APIのエンドポイントやリクエストの構成を解析**する必要があります。
そのため難易度が高く、おすすめしません。

エンドポイントの構成自体をここに記載することはできないため、
ここではヒントのみ提示します。

契約している回線でIPv6が利用できることを確認し、
その回線からエンドポイントにアクセスすることでMAP-E関連情報を取得することができます。

内部APIのエンドポイントは以下のような構成になっています。

`https://(JPIXの内部APIドメイン)/(APIキー代わりに利用されるルータ固有のデバイスID)/get_rules?callback=v6plus`

注意点として、ルータ固有のデバイスIDは有効なものでないと動作しないようです。
そのため、既存のBuffaloルータが必要になります。

成功した場合、以下の形式でレスポンスが返ってきます。

```js
v6plus({
  "dmr": "(DMRのIPv6アドレス)",
  "id": "(ルールセットまたはレスポンスの識別ID)",
  "ipv6_fixlen": "(IPv6固定プレフィックス長)",
  "fmr": [
    {
      "ipv6": "(MAP-EルールのIPv6プレフィックス)",
      "ipv4": "(MAP-EルールのIPv4プレフィックス)",
      "psid_offset": "(PSIDオフセット値)",
      "ea_length": "(EAビット長)"
    },
    ...
  ]
})
```

これらの値を元に、OpenWrt用のMAP-Eルールを生成することができます。

この方法だと、OpenWrtにそのままMAP-E関連情報を登録することができません。
そこで、OpenWrt に設定するためのパラメータへ変換できるスクリプトを作成しています。
ご自由にお使いください。

:::details MAP-E関連情報変換スクリプト

ChatGPTに作成してもらいました。
オプションで指定した `v6plus.jsonp` を読み込んで解析します。

```python
#!/usr/bin/env python3
"""Generate OpenWrt MAP-E settings from a v6plus-style JSONP response.

The v6plus JSONP contains MAP-E rule parameters.  For OpenWrt, the key output is
one MAP rule expressed as /etc/config/network or UCI commands.  The script can:

  * emit all candidate rules from the JSONP;
  * select one rule by index or rule IPv6 prefix;
  * select automatically from a CE/WAN6 IPv6 prefix/address;
  * select automatically on OpenWrt by reading `ubus call network.interface.wan6 status`.

Examples:
  python3 v6plus_openwrt_mape.py v6plus.jsonp --emit all
  python3 v6plus_openwrt_mape.py v6plus.jsonp --rule-index 1 --output uci
  python3 v6plus_openwrt_mape.py v6plus.jsonp --ce-prefix 240b:10:abcd:ef00::/56 --output network
  python3 v6plus_openwrt_mape.py v6plus.jsonp --auto-from-openwrt --output uci
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from ipaddress import IPv4Network, IPv6Address, IPv6Interface, IPv6Network, ip_network
from pathlib import Path
from typing import Any


class V6PlusError(ValueError):
    pass


@dataclass(frozen=True)
class Rule:
    ipv6: IPv6Network
    ipv4: IPv4Network
    psid_offset: int
    ea_length: int

    @property
    def ipv4_suffix_length(self) -> int:
        return 32 - self.ipv4.prefixlen

    @property
    def psid_length(self) -> int:
        return self.ea_length - self.ipv4_suffix_length

    @property
    def required_ce_prefixlen(self) -> int:
        return self.ipv6.prefixlen + self.ea_length


@dataclass(frozen=True)
class Ruleset:
    dmr: IPv6Address
    opaque_id: str
    ipv6_fixlen: int
    rules: list[Rule]


def strip_jsonp(text: str) -> str:
    s = text.strip()
    if s.startswith("{"):
        return s
    m = re.fullmatch(r"[A-Za-z_$][0-9A-Za-z_$]*\s*\((.*)\)\s*;?", s, flags=re.DOTALL)
    if not m:
        raise V6PlusError("input is neither JSON nor a simple JSONP callback such as v6plus({...})")
    return m.group(1).strip()


def as_int(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise V6PlusError(f"{name} must be an integer, not boolean")
    try:
        return int(value)
    except Exception as exc:
        raise V6PlusError(f"{name} must be an integer") from exc


def load_ruleset(path: str | Path) -> Ruleset:
    raw = Path(path).read_text(encoding="utf-8")
    try:
        data = json.loads(strip_jsonp(raw))
    except json.JSONDecodeError as exc:
        raise V6PlusError(f"invalid JSON payload: {exc}") from exc
    if not isinstance(data, dict):
        raise V6PlusError("top-level payload must be an object")

    for key in ("dmr", "id", "ipv6_fixlen", "fmr"):
        if key not in data:
            raise V6PlusError(f"missing required key: {key}")

    try:
        dmr = IPv6Address(str(data["dmr"]))
    except Exception as exc:
        raise V6PlusError(f"dmr is not a valid IPv6 address: {data.get('dmr')!r}") from exc

    opaque_id = str(data["id"])
    if not re.fullmatch(r"[0-9A-Fa-f]{32}", opaque_id):
        raise V6PlusError("id must be 32 hexadecimal characters")

    ipv6_fixlen = as_int(data["ipv6_fixlen"], "ipv6_fixlen")
    if not 0 <= ipv6_fixlen <= 128:
        raise V6PlusError("ipv6_fixlen must be between 0 and 128")

    fmr = data["fmr"]
    if not isinstance(fmr, list) or not fmr:
        raise V6PlusError("fmr must be a non-empty array")

    rules = [parse_rule(item, i) for i, item in enumerate(fmr, start=1)]
    return Ruleset(dmr=dmr, opaque_id=opaque_id, ipv6_fixlen=ipv6_fixlen, rules=rules)


def parse_rule(item: Any, idx: int) -> Rule:
    if not isinstance(item, dict):
        raise V6PlusError(f"fmr[{idx}] must be an object")
    for key in ("ipv6", "ipv4", "psid_offset", "ea_length"):
        if key not in item:
            raise V6PlusError(f"fmr[{idx}] missing required key: {key}")

    try:
        ipv6 = ip_network(str(item["ipv6"]), strict=False)
    except Exception as exc:
        raise V6PlusError(f"fmr[{idx}].ipv6 is invalid: {item.get('ipv6')!r}") from exc
    if not isinstance(ipv6, IPv6Network):
        raise V6PlusError(f"fmr[{idx}].ipv6 must be an IPv6 CIDR prefix")

    try:
        ipv4 = ip_network(str(item["ipv4"]), strict=False)
    except Exception as exc:
        raise V6PlusError(f"fmr[{idx}].ipv4 is invalid: {item.get('ipv4')!r}") from exc
    if not isinstance(ipv4, IPv4Network):
        raise V6PlusError(f"fmr[{idx}].ipv4 must be an IPv4 CIDR prefix")

    psid_offset = as_int(item["psid_offset"], f"fmr[{idx}].psid_offset")
    ea_length = as_int(item["ea_length"], f"fmr[{idx}].ea_length")
    if not 0 <= psid_offset <= 16:
        raise V6PlusError(f"fmr[{idx}].psid_offset must be between 0 and 16")
    if not 0 <= ea_length <= 48:
        raise V6PlusError(f"fmr[{idx}].ea_length must be between 0 and 48")

    rule = Rule(ipv6=ipv6, ipv4=ipv4, psid_offset=psid_offset, ea_length=ea_length)
    if rule.psid_length < 0:
        raise V6PlusError(
            f"fmr[{idx}] ea_length={ea_length} is shorter than IPv4 suffix length={rule.ipv4_suffix_length}"
        )
    if psid_offset + rule.psid_length > 16:
        raise V6PlusError(
            f"fmr[{idx}] psid_offset + psidlen exceeds 16 bits: {psid_offset} + {rule.psid_length}"
        )
    if rule.required_ce_prefixlen > 128:
        raise V6PlusError(f"fmr[{idx}] ipv6 prefix length + ea_length exceeds 128")
    return rule


def parse_ipv6_value(value: str) -> IPv6Address:
    try:
        if "/" in value:
            return IPv6Interface(value).ip
        return IPv6Address(value)
    except Exception as exc:
        raise V6PlusError(f"not an IPv6 address or prefix: {value!r}") from exc


def select_by_ce_value(rules: list[Rule], ce_value: str) -> Rule:
    addr = parse_ipv6_value(ce_value)
    matches = [r for r in rules if addr in r.ipv6]
    if not matches:
        raise V6PlusError(f"no rule IPv6 prefix matches {ce_value!r}")
    return sorted(matches, key=lambda r: r.ipv6.prefixlen, reverse=True)[0]


def select_by_rule_prefix(rules: list[Rule], prefix: str) -> Rule:
    try:
        net = ip_network(prefix, strict=False)
    except Exception as exc:
        raise V6PlusError(f"invalid --rule-prefix: {prefix!r}") from exc
    for rule in rules:
        if rule.ipv6 == net:
            return rule
    raise V6PlusError(f"no FMR has ipv6 prefix {prefix!r}")


def openwrt_wan6_values(tunlink: str) -> list[str]:
    """Return IPv6 prefixes/addresses from `ubus call network.interface.<tunlink> status`.

    This is best-effort and only works when the script is executed on OpenWrt.
    """
    cmd = ["ubus", "call", f"network.interface.{tunlink}", "status"]
    try:
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError as exc:
        raise V6PlusError("ubus was not found; --auto-from-openwrt must be run on OpenWrt") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or "no stderr"
        raise V6PlusError(f"ubus failed for interface {tunlink!r}: {stderr}") from exc

    try:
        status = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise V6PlusError("ubus returned non-JSON output") from exc

    values: list[str] = []
    for key in ("ipv6-prefix", "ipv6-address"):
        entries = status.get(key, [])
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict) or "address" not in entry:
                continue
            address = str(entry["address"])
            mask = entry.get("mask", entry.get("prefix-length"))
            if mask is not None:
                values.append(f"{address}/{mask}")
            else:
                values.append(address)
    if not values:
        raise V6PlusError(f"no IPv6 prefix/address found in network.interface.{tunlink} status")
    return values


def select_from_openwrt(rules: list[Rule], tunlink: str) -> tuple[Rule, str]:
    tried = openwrt_wan6_values(tunlink)
    for value in tried:
        try:
            return select_by_ce_value(rules, value), value
        except V6PlusError:
            continue
    raise V6PlusError(f"none of the OpenWrt {tunlink} IPv6 values matched the JSONP rules: {', '.join(tried)}")


def network_snippet(
    ruleset: Ruleset,
    rule: Rule,
    ifname: str,
    tunlink: str,
    legacymap: bool,
    mtu: int | None,
    encaplimit: str | None,
) -> str:
    lines = [
        f"config interface '{ifname}'",
        "\toption proto 'map'",
        "\toption maptype 'map-e'",
        f"\toption peeraddr '{ruleset.dmr}'",
        f"\toption ipaddr '{rule.ipv4.network_address}'",
        f"\toption ip4prefixlen '{rule.ipv4.prefixlen}'",
        f"\toption ip6prefix '{rule.ipv6.network_address}'",
        f"\toption ip6prefixlen '{rule.ipv6.prefixlen}'",
        f"\toption ealen '{rule.ea_length}'",
        f"\toption psidlen '{rule.psid_length}'",
        f"\toption offset '{rule.psid_offset}'",
        f"\toption tunlink '{tunlink}'",
    ]
    if legacymap:
        lines.append("\toption legacymap '1'")
    if mtu is not None:
        lines.append(f"\toption mtu '{mtu}'")
    if encaplimit is not None:
        lines.append(f"\toption encaplimit '{encaplimit}'")
    return "\n".join(lines)


def uci_commands(
    ruleset: Ruleset,
    rule: Rule,
    ifname: str,
    tunlink: str,
    legacymap: bool,
    mtu: int | None,
    encaplimit: str | None,
    commit: bool,
) -> str:
    def q(s: object) -> str:
        return str(s).replace("'", "'\\''")

    kv = [
        (None, f"uci set network.{ifname}=interface"),
        ("proto", "map"),
        ("maptype", "map-e"),
        ("peeraddr", str(ruleset.dmr)),
        ("ipaddr", str(rule.ipv4.network_address)),
        ("ip4prefixlen", str(rule.ipv4.prefixlen)),
        ("ip6prefix", str(rule.ipv6.network_address)),
        ("ip6prefixlen", str(rule.ipv6.prefixlen)),
        ("ealen", str(rule.ea_length)),
        ("psidlen", str(rule.psid_length)),
        ("offset", str(rule.psid_offset)),
        ("tunlink", tunlink),
    ]
    if legacymap:
        kv.append(("legacymap", "1"))
    if mtu is not None:
        kv.append(("mtu", str(mtu)))
    if encaplimit is not None:
        kv.append(("encaplimit", encaplimit))

    lines: list[str] = []
    for key, value in kv:
        if key is None:
            lines.append(str(value))
        else:
            lines.append(f"uci set network.{ifname}.{key}='{q(value)}'")
    if commit:
        lines.extend(["uci commit network", f"ifdown {ifname} 2>/dev/null; ifup {ifname}"])
    return "\n".join(lines)


def rule_summary(index: int, rule: Rule) -> str:
    return (
        f"{index:02d}: rule-ipv6={rule.ipv6} rule-ipv4={rule.ipv4} "
        f"ealen={rule.ea_length} psidlen={rule.psid_length} offset={rule.psid_offset} "
        f"required-ce-prefixlen=/{rule.required_ce_prefixlen}"
    )


def choose_rules(args: argparse.Namespace, ruleset: Ruleset) -> tuple[list[tuple[int, Rule]], str | None]:
    selectors = [args.ce_prefix is not None, args.rule_index is not None, args.rule_prefix is not None, args.auto_from_openwrt]
    if sum(bool(x) for x in selectors) > 1:
        raise V6PlusError("use only one selector: --ce-prefix, --rule-index, --rule-prefix, or --auto-from-openwrt")

    note = None
    if args.ce_prefix:
        rule = select_by_ce_value(ruleset.rules, args.ce_prefix)
        idx = ruleset.rules.index(rule) + 1
        note = f"selected by --ce-prefix {args.ce_prefix}"
        return [(idx, rule)], note
    if args.rule_index is not None:
        if not 1 <= args.rule_index <= len(ruleset.rules):
            raise V6PlusError(f"--rule-index must be between 1 and {len(ruleset.rules)}")
        return [(args.rule_index, ruleset.rules[args.rule_index - 1])], f"selected by --rule-index {args.rule_index}"
    if args.rule_prefix:
        rule = select_by_rule_prefix(ruleset.rules, args.rule_prefix)
        idx = ruleset.rules.index(rule) + 1
        return [(idx, rule)], f"selected by --rule-prefix {args.rule_prefix}"
    if args.auto_from_openwrt:
        rule, value = select_from_openwrt(ruleset.rules, args.tunlink)
        idx = ruleset.rules.index(rule) + 1
        return [(idx, rule)], f"selected from OpenWrt {args.tunlink}: {value}"
    if args.emit == "all":
        return list(enumerate(ruleset.rules, start=1)), "emitting all candidates; enable/copy only the rule that matches WAN6 prefix"
    return [], "no rule selected; use --emit all, --rule-index, --rule-prefix, --ce-prefix, or --auto-from-openwrt"


def build_output(args: argparse.Namespace) -> str:
    ruleset = load_ruleset(args.file)
    selected, note = choose_rules(args, ruleset)

    lines = [
        f"# source id: {ruleset.opaque_id}",
        f"# dmr/BR: {ruleset.dmr}",
        f"# ipv6_fixlen: {ruleset.ipv6_fixlen}",
        "# candidates:",
    ]
    lines += ["# " + rule_summary(i, r) for i, r in enumerate(ruleset.rules, start=1)]
    if note:
        lines.append(f"# {note}")
    lines.append("")

    header_text = "\n".join(lines).rstrip()
    if not selected:
        return header_text + "\n"

    blocks: list[str] = []
    for i, rule in selected:
        ifname = args.interface if len(selected) == 1 else f"{args.interface}{i}"
        header = f"# selected candidate {i}: {rule.ipv6} -> {rule.ipv4}"
        if args.output == "uci":
            body = uci_commands(ruleset, rule, ifname, args.tunlink, args.legacymap, args.mtu, args.encaplimit, args.commit)
        else:
            body = network_snippet(ruleset, rule, ifname, args.tunlink, args.legacymap, args.mtu, args.encaplimit)
        blocks.append(header + "\n" + body)
    return header_text + "\n\n" + "\n\n".join(blocks) + "\n"


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Generate OpenWrt MAP-E settings from v6plus JSONP")
    p.add_argument("file", help="path to v6plus.jsonp")
    p.add_argument("--output", choices=("network", "uci"), default="network", help="output format; default: network")
    p.add_argument("--emit", choices=("selected", "all"), default="all", help="without a selector, emit all candidate rules; default: all")
    p.add_argument("--ce-prefix", help="CE/WAN6 IPv6 address or prefix used only to select the matching rule")
    p.add_argument("--rule-index", type=int, help="select 1-based FMR index from the JSONP")
    p.add_argument("--rule-prefix", help="select FMR by rule IPv6 prefix, e.g. 240b:10::/32")
    p.add_argument("--auto-from-openwrt", action="store_true", help="run ubus on OpenWrt and select by tunlink IPv6 prefix/address")
    p.add_argument("--interface", default="wanmap", help="OpenWrt MAP interface name; default: wanmap")
    p.add_argument("--tunlink", default="wan6", help="OpenWrt IPv6 underlay interface; default: wan6")
    p.add_argument("--mtu", type=int, default=1280, help="MAP tunnel MTU to emit; default: 1280. Use --mtu 0 to omit")
    p.add_argument("--encaplimit", default="ignore", help="encaplimit value to emit; default: ignore. Use empty string to omit")
    p.add_argument("--no-legacymap", action="store_false", dest="legacymap", help="omit option legacymap '1'")
    p.add_argument("--commit", action="store_true", help="with --output uci, append uci commit and ifup commands")
    p.set_defaults(legacymap=True)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    if args.mtu == 0:
        args.mtu = None
    if args.encaplimit == "":
        args.encaplimit = None
    try:
        print(build_output(args), end="")
        return 0
    except V6PlusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
```

:::


こちらも、OpenWrtへの登録方法は実践編で解説します。

以上の２つの方法で、MAP-Eの関連情報の取得を行うことができます。

## ここまでのまとめ

ここまで、

- enひかり v6プラスオプション
- NTT東西のフレッツ網
- JPIXのv6プラス

というネットワーク構成の場合のIPv6の接続確立の流れ、
およびIPv4 over IPv6の仕組みであるMAP-Eの概要を解説してきました。
お疲れ様でした。

ここからは、実際にOpenWrtを導入する際の手順について解説していきます。
・・・と思ったのですが、実践の記述も長くなりそうです・・・

そのため、このブログを理論編とし、
実践編は別の記事で解説することにします。

次回の記事もお楽しみに〜
ここまで読んでいただきありがとうございました！



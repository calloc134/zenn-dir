---
title: "Manjaro Linuxでしあわせ環境を構築する"
emoji: "🐧"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["manjaro", "wezterm", "zsh", "neovim", "starship"]
published: true
---

# はじめに

こんにちは。calloc134 です。

自分は以前から Linux パソコンを欲していたのですが、ついに先日、ThinkPad を購入し、Manjaro Linux をインストールしました。
ここでは、セットアップ手順についてまとめていきます。

# 完成形

以下のようなデスクトップが完成しました。

![](https://storage.googleapis.com/zenn-user-upload/9e6e5f55055d-20240408.png)

![](https://storage.googleapis.com/zenn-user-upload/a49142ce8ce4-20240408.png)

# 利用したもの

- Manjaro Linux Cinnamon Edition
- White Sur GTK Theme
- White Sur Icon Theme
- Noto Sans CJK JP
- WezTerm
- Zsh
- Sheldon
- Starship
- Neovim
- fcitx5-im

# 事前準備

Linux を導入するための ThinkPad を購入します。
自分は以下のスペックで購入しています。

- ThinkPad X13 Gen 4 AMD
- Ryzen 7 PRO 7840U
- 32GB RAM
- 256GB SSD

https://www.lenovo.com/jp/ja/p/laptops/thinkpad/thinkpad-x-series/thinkpad-x13-gen-4-13-inch-amd/len101t0081

16 万円程度で購入できました！

さて、SSD が 256GB なのですが、これは交換することを見越しての購入です。交換する予定の SSD は、Crucial の P5 Plus 1TB です。
https://www.amazon.co.jp/dp/B08QZFXY1X/

SSD の交換方法は、以下の記事を参考にしました。
https://support.lenovo.com/jp/ja/solutions/ht515296-removal-and-replacement-videos-thinkpad-x13-gen-4-21ex-21ey-and-thinkpad-x13-yoga-gen-4-21f2-21f3

空っぽの SSD なので、Windows も何も入っていない状態になりました。Linux を導入するため、逆に好都合です。

# 基本的なインストール

## Manjaro Linux Cinnamon Edition のインストール

https://manjaro.org/download/

Manjaro Linux Cinnamon Edition は、コミュニティ主導のエディションです。Cinnamon は、GNOME 2 のような伝統的なデスクトップ環境を提供します。
https://ja.wikipedia.org/wiki/Cinnamon

もとは Linux Mint のデスクトップ環境として開発されていましたが、現在は他のディストリビューションでも利用できるようになっています。

ここでは、Minimal Version の ISO をダウンロードし、USB へ書き込みます。

![](https://storage.googleapis.com/zenn-user-upload/2a81adfd05f7-20240409.png)

Windows 環境が存在したため、Balena Etcher を利用して書き込みました。

### 問題点

Cinnamon Edition では、デフォルトで日本語の表示が文字化けしています。これは、フォントの日本語表示が不足しているためです。

ライブ環境で日本語表示をするために、noto-fonts-cjk をインストールします。

```bash
sudo pacman -Syu
sudo pacman -S noto-fonts-cjk
```

メニューから「フォントの選択」を開き、Noto Sans CJK JP を選択します。

![](https://storage.googleapis.com/zenn-user-upload/eeb16280a820-20240407.png)
※ 画像はイメージです

インストーラの日本語が正確に表示されるようになります。

では、インストールしていきます。ここの手順は特に問題ないと思います。
インストールが完了したら、再起動を行います。

## 英語ディレクトリ名への修正

インストール後、ディレクトリ名が日本語になっているため、英語に修正します。

```bash
LANG=C xdg-user-dirs-gtk-update
```

## pacman の最適化とミラー選択・アップデート

まず、pacman のミラーを選択します。
これを行うことで、パッケージのダウンロード速度が向上します。

```bash
sudo pacman-mirrors --fasttrack
```

また、pacman の並列ダウンロード数を増やします。
設定ファイルのコメントアウトを外します。

```bash
sudo vim /etc/pacman.conf
```

```diff /etc/pacman.conf
-#ParallelDownloads = 5
+ParallelDownloads = 10
```

では、アップデートを行います。

```bash
sudo pacman -Syu
```

## yay のインストール

ArchLinux 系列のディストリビューションには、AUR (Arch User Repository) というパッケージ管理システムがあります。
この AUR には、ユーザーコミュニティが作成したパッケージが登録されており、これによって公式にサポートされていないパッケージをインストールすることができます。

AUR パッケージをインストールするため、yay をインストールします。
Manjaro 環境では、yay を pacman から導入できます。

```bash
sudo pacman -S yay
```

## テーマの適用

やっぱり見た目が大事です。
WhiteSur は、macOS Big Sur のようなデザインを提供してくれるテーマです。

AUR からインストールします。

```bash
yay -S whitesur-gtk-theme whitesur-icon-theme
```

設定からテーマを選択します。

![](https://storage.googleapis.com/zenn-user-upload/62cc5e7adb68-20240409.png)

パネルの位置を変更したりすると、良い感じになります。

![](https://storage.googleapis.com/zenn-user-upload/9e6e5f55055d-20240408.png)

見た目がよくなりました。

## 日本語入力の設定

fcitx5 のツール群を導入し、日本語入力を設定します。

```bash
sudo pacman -S fcitx5-im
```

このコマンドによって、以下のパッケージが導入されます。

- fcitx5: 日本語入力を行うためのフレームワーク
- fcitx5-mozc: 日本語入力を行うためのエンジン
- fcitx5-gtk: GTK アプリケーションでの日本語入力を行うためのプラグイン
- fcitx5-qt: Qt アプリケーションでの日本語入力を行うためのプラグイン
- fcitx5-configtool: fcitx5 の設定を行うための GUI ツール

次に、環境変数の設定を行います。

```bash
echo "export GTK_IM_MODULE=fcitx" >> ~/.xprofile
echo "export QT_IM_MODULE=fcitx" >> ~/.xprofile
echo "export XMODIFIERS=@im=fcitx" >> ~/.xprofile
```

また、自動開始させるアプリとして、fcitx5 を追加します。

![](https://storage.googleapis.com/zenn-user-upload/967488789176-20240407.png)

再起動を行うと、日本語入力が可能になります。
なお、一回ではうまく行かない場合は何度か試してみてください。

## シェルとターミナルの設定

ここでは、以下のツールを導入します。

- neovim
- Zsh
- Sheldon
- Starship
- WezTerm

順に解説していきます。

### Neovim

Neovim は、Vim のフォークであり、Vim と互換性があります。
https://wiki.archlinux.jp/index.php/Neovim

```bash
sudo pacman -S neovim
```

### Zsh

Zsh は、Bash に代わるシェルです。Bash と比べて機能が豊富で、カスタマイズ性が高いことが特徴です。
https://ja.wikipedia.org/wiki/Z_Shell

```bash
sudo pacman -S zsh
```

シェルを変更します。

```bash
chsh -s $(which zsh)
```

この Zsh のプラグインの管理ツールとして、Sheldon が有効です。

### Sheldon

Sheldon は、Zsh のプラグイン管理ツールです。
https://github.com/rossmacarthur/sheldon

```bash
sudo pacman -S sheldon
```

.zshrc に設定を追加します。

```bash
echo export ZSH="$HOME/.local/share/sheldon/repos/github.com/ohmyzsh/ohmyzsh" >> ~/.zshrc
echo 'eval "$(sheldon source)"' >> ~/.zshrc
```

Sheldon のインストールが完了した後、Sheldon の構成ファイルを作成します。

```bash
sheldon init
```

その後、作成されたファイルを編集します。

```bash
nvim ~/.config/sheldon/plugins.toml
```

以下の内容を追加します。

```toml
# `sheldon` configuration file
# ----------------------------
#
# You can modify this file directly or you can use one of the following
# `sheldon` commands which are provided to assist in editing the config file:
#
# - `sheldon add` to add a new plugin to the config file
# - `sheldon edit` to open up the config file in the default editor
# - `sheldon remove` to remove a plugin from the config file
#
# See the documentation for more https://github.com/rossmacarthur/sheldon#readme

shell = "zsh"

[plugins]

[plugins.oh-my-zsh]
github = "ohmyzsh/ohmyzsh"

[plugins.zsh-completions]
github = "zsh-users/zsh-completions"

[plugins.zsh-autosuggestions]
github = "zsh-users/zsh-autosuggestions"
use = ["{{ name }}.zsh"]

[plugins.dracula-zsh-syntax-highlighting]
github = "dracula/zsh-syntax-highlighting"

[plugins.zsh-syntax-highlighting]
github = "zsh-users/zsh-syntax-highlighting"

[plugins.blackbox]
github = "StackExchange/blackbox"

[plugins.enhancd]
github = "b4b4r07/enhancd"

[plugins.zsh-vi-mode]
github = "jeffreytse/zsh-vi-mode"

# For example:
#
# [plugins.base16]
# github = "chriskempson/base16-shell"
```

ここでインストールされるプラグインは、以下の通りです。

- oh-my-zsh: Zsh の設定を管理するフレームワーク
- zsh-completions: Zsh の補完機能を強化するプラグイン
- zsh-autosuggestions: Zsh の入力補完を強化するプラグイン
- dracula-zsh-syntax-highlighting: Zsh の構文ハイライトを行うプラグイン
- zsh-syntax-highlighting: Zsh の構文ハイライトを行うプラグイン
- blackbox: パスワードを暗号化して保存するプラグイン
- enhancd: cd コマンドを強化するプラグイン
- zsh-vi-mode: Zsh を vi 風に操作するプラグイン

これで、Zsh を起動した際に、プラグインが読み込まれます。

### Starship

Starship は、シェルプロンプトのプロンプトをカスタマイズするためのツールです。
https://starship.rs/ja-JP/

```bash
sudo pacman -S starship
```

.zshrc に設定を追加します。

```bash
echo 'eval "$(starship init zsh)"' >> ~/.zshrc
```

プリセットからテーマを設定します。

```bash
starship preset gruvbox-rainbow -o ~/.config/starship.toml
```

これで、Zsh を起動した際に、Starship が読み込まれます。
また、プロンプトの表示がカスタマイズされます。

### WezTerm

WezTerm は、高機能なターミナルエミュレータです。
https://wezfurlong.org/wezterm/index.html

```bash
sudo pacman -S wezterm
```

設定ファイルを作成します。

```bash
sudo mkdir .config/wezterm
nvim .config/wezterm/wezterm.lua
```

以下の内容を追加します。

```lua .config/wezterm/wezterm.lua
local wezterm = require 'wezterm';
wezterm.on('gui-startup', function(cmd)
    local tab, pane, window = wezterm.mux.spawn_window(cmd or {})
    window:gui_window():maximize()
end)

return {

    keys = {
        -- 垂直分割 (SwayのデフォルトではMod+v, ここではMod+Enterを使用)
        {
            key = "Enter",
            mods = "SUPER",
            action = wezterm.action {
                SplitVertical = {domain = "CurrentPaneDomain"}
            }
        },
        -- 水平分割 (SwayのデフォルトではMod+h, ここではMod+Shift+Enterを使用)
        {
            key = "Enter",
            mods = "SUPER|SHIFT",
            action = wezterm.action {
                SplitHorizontal = {domain = "CurrentPaneDomain"}
            }
        }, -- ペイン間の移動
        {
            key = "h",
            mods = "SUPER",
            action = wezterm.action {ActivatePaneDirection = "Left"}
        }, {
            key = "l",
            mods = "SUPER",
            action = wezterm.action {ActivatePaneDirection = "Right"}
        }, {
            key = "k",
            mods = "SUPER",
            action = wezterm.action {ActivatePaneDirection = "Up"}
        }, {
            key = "j",
            mods = "SUPER",
            action = wezterm.action {ActivatePaneDirection = "Down"}
        },
        {
            key = "u",
            mods = "SUPER",
            -- 上にスクロール
            action = wezterm.action {ScrollByPage = -0.25}
        }, {
            key = "d",
            mods = "SUPER",
            -- 下にスクロール
            action = wezterm.action {ScrollByPage = 0.25}

        }
    },

    -- カラースキーム
    color_scheme = 'nord',

    -- 透明度
    window_background_opacity = 0.85,

    -- ウィンドウの境界線と影
    window_frame = {
        border_left_width = 1,
        border_right_width = 1,
        border_top_height = 1,
        border_bottom_height = 1,
        border_left_color = "#555555",
        border_right_color = "#555555",
        border_top_color = "#555555",
        border_bottom_color = "#555555"
    },
    window_background_image_hsb = {
        brightness = 0.8,
        saturation = 1.0,
        hue = 1.0
    },

    -- フォントとフォントサイズ
    font_size = 12.0,

    -- パディング
    window_padding = {left = 5, right = 5, top = 5, bottom = 5},

}
```

この構成は、以下のようになります。

- キーバインドの設定
  - 垂直分割: SUPER + Enter
    - 水平分割: SUPER + Shift + Enter
    - ペイン間の移動
      - 左: SUPER + h
      - 右: SUPER + l
      - 上: SUPER + k
      - 下: SUPER + j
    - スクロール
      - 上: SUPER + u
      - 下: SUPER + d
- カラースキームの設定
  - nord
- 透明度の設定
  - 0.85
- ウィンドウの境界線と影の設定
  - 色: #555555
- ウィンドウの背景画像の設定
  - 明るさ: 0.8
  - 彩度: 1.0
  - 色相: 1.0
- フォントとフォントサイズの設定
  - 12.0
- パディングの設定
  - 左: 5
  - 右: 5
  - 上: 5
  - 下: 5
- 全画面表示

これで、WezTerm の設定が完了しました。
余談ですが、このキーバインドは一部 Sway のキーバインドに準拠しています。

イメージとしては、以下のようになります。

![](https://storage.googleapis.com/zenn-user-upload/a49142ce8ce4-20240408.png)

## ブート画面を工夫

ブート画面を工夫します。

システムが GRUB を利用しているため、GRUB の設定を変更します。

今回は、以下のテーマを利用します。

https://github.com/vinceliuice/grub2-themes

```bash
git clone https://github.com/vinceliuice/grub2-themes --depth 1
cd grub2-themes
sudo bash install.sh -t tela -b
```

これで、ブート時にテーマが適用されます。

## VSCode のインストール

開発環境として、VSCode をインストールします。

気をつける点が一点。

pacman からインストールする vscode は、Code - OSS というオープンソース版のエディタです。
このエディタでは、Microsoft の Marketplace から拡張機能をインストールすることができません。
したがって、拡張機能を十分に活用したい場合は AUR からインストールすることをお勧めします。

```bash
yay -S visual-studio-code-bin
```

インストールが完了したら、VSCode を起動し、拡張機能をインストールします。

ここから、自分好みの設定をすすめていきます。

### VSCode Vim

Vim のキーバインドを VSCode で利用するための拡張機能です。

マーケットプレイスからインストールし、設定を行います。

#### VSCode 側ショートカットの保持

VSCode のショートカットが Vim のショートカットと競合する場合、VSCode のショートカットを優先するように設定します。
特に Ctrl 系列のショートカットが競合するため、これを無効化しています。

```json
{
  "vim.useCtrlKeys": false
}
```

#### 標準モード時に英語入力への切り替えを有効化

標準モード時に日本語入力が有効になっていると Vim の操作が困難になるため、標準モード時に英語入力に切り替えるように設定します。

Mac や Windows の場合はユーティリティとして im-select を導入する必要がありますが、Linux 環境で fcitx5 を利用している場合はユーティリティの導入が必要なく、以下の設定を行うことで実現できます。

```json
{
  "vim.autoSwitchInputMethod.enable": true,
  "vim.autoSwitchInputMethod.defaultIM": "1",
  "vim.autoSwitchInputMethod.obtainIMCmd": "/usr/bin/fcitx5-remote",
  "vim.autoSwitchInputMethod.switchIMCmd": "/usr/bin/fcitx5-remote -t {im}"
}
```

その他、必要な拡張機能をインストールします。

## その他ユーティリティのインストール

その他のユーティリティとして導入したものは以下のとおりです。

- spectacle: スクリーンショットを撮影するためのツール
- obs-studio: スクリーンキャストや録画を行うためのツール
- redshift: 画面の色温度を調整するためのツール
- ark: アーカイブファイルを操作するためのツール
  - unarchiver と併用
- gwenview: 画像ビューア
- vlc: メディアプレーヤー
- okular: PDF ビューア
- libreoffice: Office ツール
- zoom: ビデオ会議ツール
- slack-desktop: チャットツール
- REAPER: 音楽制作ツール
- Davinci Resolve Studio: 動画編集ツール

以下にスクラップとしてまとめているため、よければこちらも参考にしてください。
https://zenn.dev/calloc134/scraps/0cc0fd5630a7c1

# おわりに

以上で、開発用の Manjaro Linux 環境が一通りセットアップできました。
非常に使いやすい環境になり、自分としてもモチベが爆上がりです。

みなさんもこの記事を参考に、自分だけの Linux 環境を構築してみてください！

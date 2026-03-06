---
title: "VSCodeでもキーボードだけで操作したい！ショートカットを魔改造してみた"
emoji: "🦁"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["VSCode", "keyboard", "vscode拡張機能"]
published: true
---

# はじめに

こんにちは、かろっく(@calloc134) です。
今回の記事は息抜きに近い書き散らしです。

# 今回の目的

VSCode でも NeoVim のように できるだけキーボード操作を行いたい！という需要です。

自分は以前、キー操作のみで移動や編集を全部済ませる NeoVim 使いに憧れ、VSCode から NeoVim へ移行しようとしたことがあります。

NeoVim は非常に強力で、キーボード操作だけで様々な編集が可能です。
個人的には LazyVim という拡張が良さそうだと感じました。
https://github.com/LazyVim/LazyVim

しかし、VSCode での開発に慣れていたこと、VSCode の拡張機能などの資産への依存があったこと、
そして何よりも NeoVim へ移行するための学習コストが高いことから、結局は移行を断念してしまいました。

そこで逆転の発想として、逆にVSCode を NeoVim のようなキーボード操作ができるよう、
カスタマイズしてみることにしました。

# VSCode のキーボード操作のカスタマイズ

VSCode では、 `keybindings.json` というファイルを編集することでキーボードショートカットをカスタマイズできます。
このファイルは、VSCode のコマンドとそれに対応するキーボードショートカットを定義する JSON 形式のファイルです。

https://code.visualstudio.com/docs/configure/keybindings

今回はこれをカスタマイズしました。

# 方針

自分は普段 VSCodeVim という拡張機能を利用しています。
今回ショートカットを考えるにあたって、VSCode と VSCodeVim の両方のショートカットを考慮し、
競合しない かつ これら2つのイメージに近いショートカットを設定することを目指しました。

# 結果

このような設定にしてみました。
試行錯誤しながら設定したものなので改善の余地はありですが、個人的には気に入っています。

https://gist.github.com/calloc134/624cbf73d16f597d85c7143b30da6380

設定について解説していきます。

## ペインの移動

```json
{
  "key": "ctrl+k h",
  "command": "workbench.action.focusLeftGroup",
  "when": "(editorTextFocus || editorFocus) && !terminalFocus",
},
{
  "key": "ctrl+k l",
  "command": "workbench.action.focusRightGroup",
  "when": "(editorTextFocus || editorFocus) && !terminalFocus",
}
```

`ctrl+k` をプレフィックスキーとして、 `h` と `l` でペインの移動を行うようにしました。
これにより、ペインの移動がキーボードだけで行えるようになりました。

## 左サイドバーのトグル

```json
{
  "key": "ctrl+shift+e",
  "command": "workbench.action.toggleSidebarVisibility",
  "when": "sideBarVisible && activeViewlet == 'workbench.view.explorer'",
},
{
  "key": "ctrl+shift+e",
  "command": "workbench.view.explorer",
  "when": "!sideBarVisible || activeViewlet != 'workbench.view.explorer'",
},
(...同様に検索とGitソース管理も...)
```

`ctrl+shift+e` でエクスプローラー、 `ctrl+shift+f` で検索、 `ctrl+shift+g` でGitソース管理のサイドバーを開きます。
また、もう一度同じショートカットを押すとサイドバーが閉じるようにしました。
これにより、サイドバーのトグルがキーボードだけで行えるようになりました。

## Ctrl + Tab の再定義

```json
{
  "key": "ctrl+tab",
  "command": "workbench.action.nextEditor",
  "when": "!inEditorsPicker",
},
{
  "key": "ctrl+shift+tab",
  "command": "workbench.action.previousEditor",
  "when": "!inEditorsPicker",
}
```

VSCode のデフォルトの Ctrl + Tab の挙動を、単純なタブ送りとなるように変更しました。
これにより、タブの切り替えの挙動が自分の好みに近くなりました。

## エクスプローラのVim式ショートカット

```json
{
  "key": "j",
  "command": "list.focusDown",
  "when": "explorerViewletVisible && filesExplorerFocus && !inputFocus",
},
{
  "key": "k",
  "command": "list.focusUp",
  "when": "explorerViewletVisible && filesExplorerFocus && !inputFocus",
},
{
  "key": "g g",
  "command": "list.focusFirst",
  "when": "explorerViewletVisible && filesExplorerFocus && !inputFocus",
},
{
  "key": "shift+g",
  "command": "list.focusLast",
  "when": "explorerViewletVisible && filesExplorerFocus && !inputFocus",
}
```

エクスプローラーのサイドバーにおいて、 `j` と `k` で上下に移動、 `gg` で先頭、 `Shift+g` で末尾に移動するようにしました。
これにより、エクスプローラーのファイル選択もVimライクなキーボード操作で行えるようになりました。

また、ファイルを閲覧しつつ フォーカスを残すためのショートカットとして `space` を割り当てました。

```json
{
  "key": "space",
  "command": "list.selectAndPreserveFocus",
  "when": "explorerViewletVisible && filesExplorerFocus && !inputFocus"
}
```

こうすることで、エクスプローラーでファイルを選択して閲覧しつつ、フォーカスはエクスプローラー側に残すことができるようになりました。

その他、以下のようなショートカットを設定しました。

```md
"r" -> renameFile
"d" -> moveFileToTrash
"shift+d" -> deleteFile
"a" -> explorer.newFile
"shift+a" -> explorer.newFolder
```

ファイルのリネーム、削除、新規作成などの操作もキーボードだけで行えるようになりました。
新規作成を `a` と `Shift+a` に割り当てたことで、誤ったディレクトリでファイルやフォルダを作成してしまうことも減るのではないかと期待しています。

## Gitソース管理のVim式ショートカット

```json
{
  "key": "j",
  "command": "list.focusDown",
  "when": "sideBarFocus && activeViewlet == 'workbench.view.scm' && !inputFocus",
},
{
  "key": "k",
  "command": "list.focusUp",
  "when": "sideBarFocus && activeViewlet == 'workbench.view.scm' && !inputFocus",
}
```

Gitソース管理のサイドバーにおいても、 `j` と `k` で上下に移動するようにしました。
エクスプローラと条件が少し違い、SCM ビューの中で入力欄以外にフォーカスがあるなら、ボタンやリスト上にいても j/k が効くようにしました。

また、他のショートカットは以下のとおりです。

```md
"s" -> git.stage
"u" -> git.unstage
"c" -> workbench.scm.action.focusNextInput
"shift+p" -> git.push
"esc" -> workbench.scm.action.focusNextResourceGroup
```

`s` でステージング、 `u` でアンステージング、 `c` でコミットメッセージ入力欄にフォーカス、 `Shift+p` でプッシュができるようになりました。
また、`esc` で入力欄から抜け、リスト上にフォーカスが移るようにしました。
Gitソース管理の操作もキーボードだけで行えるようになりました。

## 検索のVim式ショートカット

```json
{
  "key": "s",
  "command": "workbench.action.findInFiles",
  "when": "searchViewletVisible && searchViewletFocus && !inputFocus",
},
{
  "key": "r",
  "command": "workbench.action.replaceInFiles",
  "when": "searchViewletVisible && searchViewletFocus && !inputFocus",
}
```

検索のサイドバーにおいて、 `s` で検索、 `r` で置換の入力欄にフォーカスするようにしました。
またその他、`j` と `k` で検索結果のリストを上下に移動、`esc` で入力欄から抜けてリストにフォーカスするようにしている部分は同様です。

## VSCode Vim で ビジュアル選択した部分のみ ステージング

```json
{
  "key": "ctrl+shift+s",
  "command": "git.stageSelectedRanges",
  "when": "editorTextFocus && editorHasSelection && vim.active && (vim.mode == 'Visual' || vim.mode == 'VisualLine' || vim.mode == 'VisualBlock')"
}
```

VSCodeVim を利用している場合、ビジュアルモードで選択した部分のみをステージングするショートカットも設定しました。
これにより、VSCodeVim でコードを選択してから、キーボードだけでステージングすることができるようになりました。

# 感想

一通り設定してみて、VSCode でもキーボードだけで様々な操作ができるようになったと感じています。
特にペインの移動やサイドバーのトグル、エクスプローラーやGitソース管理の操作がキーボードだけで行えるようになったことは大きいです。
また、VSCodeVim とも競合しないようにしつつ、所々でVSCodeVim の操作感に近づけるようなショートカットを設定できたのも良かったと思います。
これでマウスがなくても快適になったぞ〜〜〜〜

# おわりに

ひとまずはこのような設定で運用してみます！
ショートカットの設定も試行錯誤しながら改善していきたいと思います。

では、皆さんよいVSCodeライフを〜

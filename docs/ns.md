# devuloper 名前空間

このフォーク (oto-lab/devuloper-posts) が ActivityPub で独自に使う語彙です。JSON-LD の `@context` では次のように定義しています。

```json
{
  "devuloper": "https://github.com/oto-lab/devuloper-posts/blob/oto-lab/docs/ns.md#",
  "isGal": "devuloper:isGal"
}
```

<a id="isGal"></a>

## isGal

- 対象: アクター (`Person` など)
- 型: 真偽値

アカウントがギャル文字で話す設定になっているかを表します。`true` のとき、受け取ったサーバーはそのアカウントのノートやチャットの本文を [galjp](https://github.com/otnc/galjp) でギャル文字に変換して表示します。保存されている本文は変換しません。

Misskey の `misskey:isCat` と同じ扱いです。値がない場合や `true` 以外の場合は `false` とみなします。

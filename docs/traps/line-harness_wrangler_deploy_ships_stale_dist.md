# LINE基盤: 素の `wrangler deploy` は古いビルド成果物を配る (2026-09-07)

## 何をしたか
`apps/worker/src/routes/forms.ts` を直して `npx wrangler deploy` を打った。2 回打っても
本番の挙動が変わらなかった。

## 何が起きていたか
このプロジェクトは `@cloudflare/vite-plugin` を使っており、**配信されるのは
`dist/line_harness/assets/worker-entry-*.js`（ビルド済みの成果物）**である。
`wrangler.toml` に `main = "src/index.ts"` と書いてあるが、実際に配られる index.js は
216 バイトで、その成果物を import しているだけ。

つまり **`vite build` を挟まずに deploy すると、`src/` の変更が一切入らない。**

## 正解は何か
```bash
cd apps/worker && npm run deploy      # = vite build && wrangler deploy
```
`package.json` の `scripts.deploy` が正典。**素の `wrangler deploy` を単体で打たない。**
（jgrants の「後から混ぜるビルドは、混ぜる前の工程が単体で走ると壊れる」と同じ形。
`main` に書いてあるパスは、配信物の出所を意味しない。）

## 切り分けの手順（この順で付いた）
1. 本番の配信物を API で落として文字列を検索
   → `GET /accounts/<acc>/workers/scripts/line-harness`（multipart で返る）。
   追加した分岐が**入っていない**ことを確認。
2. `npx wrangler deploy --dry-run --outdir <dir>` でローカルのビルド結果を見る
   → **こちらにも入っていない**＝デプロイの問題ではなく、ビルドを走らせていない問題。
3. `dist/.../worker-entry-*.js` の日付と、本番配信物との**バイト一致**を確認
   → 一致したので「本番を古い版に後退させた」を否定できた。

**配信物を落として突合するまでは、後退の有無を断定しない。**

## 併せて訂正したこと
HV 向けの実装（型カード・トーク内の相性マッチング・ペアコードの受け取り・相談モードの安全修正）を
「9 月に書いたのに未デプロイ」と報告したが**誤り**。コミットは **2026-08-02 付**で、
同日 14:53 の本番デプロイに含まれていた。
`git branch --format='%(committerdate)'` は**ブランチ先端**の日付を返すので、
それを機能の日付として読んだのが原因。個々の日付は
`git log --date=short --format='%h %ad %s' main..HEAD` で見る。

## push が 403 になったとき
`origin` は `nullponull/line-harness-hv`。`gh` に 2 アカウント
（`hasegawa556` / `nullponull`）が登録されており、**アクティブが hasegawa556 だと 403**。
```bash
snap run gh auth switch --user nullponull && git push origin HEAD
snap run gh auth switch --user hasegawa556      # 元に戻す
```
トークンを自分で扱わずに済むので、この手順を使う。

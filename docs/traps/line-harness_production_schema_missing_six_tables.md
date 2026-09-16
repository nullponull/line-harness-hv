# LINE基盤: 本番のスキーマがコードより6表少なく、5系統が「使えば500」だった (2026-09-07)

## 何をしたか
受け口の棚卸しで「フォームの開封記録が、表が無いのに success:true を返す」を見つけたので、
**migrations の定義と本番の実体を機械的に突合**した。

## 何が起きていたか
`packages/db/migrations` が定義する **64 表のうち、本番の D1 `line-harness` は 58 表**しか持っていなかった。
コードは全機能をルートに登録しているので、**使った瞬間に 500 になる**状態。

欠けていたもの: 流入経路(`entry_routes` `ref_tracking` `friends.ref_code`)、
計測リンク(`tracked_links` `link_clicks` `friends.first_tracked_link_id`)、
フォーム(`forms` `form_submissions` `form_opens`)、流入プール(`traffic_pools`)、
イベント予約(`events` `event_slots` `event_bookings` 他2表)、更新履歴(`update_history`)。

## なぜ気づけなかったか（ここが本質）
1. **`d1_migrations` 表が無い。** 適用を wrangler の仕組みで管理しておらず手で当てていたため、
   **「どこまで当たっているか」を機械が答えられない**。人の記憶が唯一の記録になっていた。
2. **友だちが2件（どちらも社内）で実利用ゼロ。** 誰も踏まないので静かだった。
   実利用が始まった初日に5系統が同時に壊れる形で待っていた。
3. **失敗を握り潰して success を返していた**（開封記録）。壊れているのに 200。

## 正解は何か
- **差は両方向で見る。** 「定義はあるが本番に無い」＝使うと500。
  「本番にあるが定義に無い」＝手で作った表で、再構築すると消える（この基盤では中核9表がこれ）。
- **適用状況は機械に答えさせる。** `d1_migrations` を使う運用に寄せる。
  手で当てるなら、当てた記録を必ずリポジトリに残す。
- **「実利用がゼロだから安全」ではない。** 実利用ゼロは*まだ露出していない*だけで、
  露出した初日に全部出てくる。**利用が始まる前に突合する。**

## 検査（コピーして使う）
```bash
grep -hoiE 'CREATE TABLE (IF NOT EXISTS )?[a-z_]+' packages/db/migrations/*.sql \
  | awk '{print tolower($NF)}' | sort -u > /tmp/defined.txt
npx wrangler d1 execute line-harness --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```
**注意**: 表名をコードから正規表現で拾うと、コメントの英単語（`the` `this` `and` 等）を
表名として拾って 141 件の偽の欠落が出る。**定義側（CREATE TABLE）から拾うこと。**

## 落とし穴（この基盤固有）
- **`hv-hardening` ブランチが未デプロイ。** 本番の Worker は 2026-08-02 版で、
  9月の HIDDEN VALUE 向け実装（型カード・トーク内の相性マッチング・ペアコード受け取り）は動いていない。
  一方その **migration(050/051) は本番に当たっている**＝コードと DB が別の版。
- `chats` には `admin_notes` が無く、記録は `notes` 列に入る。
- **メニューのタップも incoming として記録される。** 「未読」＝「返事を待っている人」ではない。

正典: `line-harness-oss/docs/SCHEMA_DRIFT_2026-09-07.md`

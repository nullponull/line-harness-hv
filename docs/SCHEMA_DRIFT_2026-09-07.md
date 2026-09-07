# 本番のスキーマがコードより6表少なかった（2026-09-07 実測）

## 何が起きていたか

`migrations/` が定義する **64 表のうち、本番の D1 `line-harness` には 58 表しか無かった**。
コード側（`apps/worker/src/routes/*`）はすべての機能をルートとして公開しているため、
**該当の機能を使った瞬間に 500 になる**状態だった。

| 使えなかった機能 | 欠けていた表 | 定義元 |
|---|---|---|
| 流入経路の記録（ref コード） | `entry_routes`, `ref_tracking`, `friends.ref_code` | 003 |
| 計測リンク | `tracked_links`, `link_clicks`, `friends.first_tracked_link_id` | 006 / 022 |
| フォーム（作成・回答収集・開封記録） | `forms`, `form_submissions`, `form_opens` | 007 / 024 |
| 流入プール | `traffic_pools` | 016 |
| イベント予約 | `events`, `event_slots`, `event_bookings`, ほか2表 | 037 |
| 更新履歴 | `update_history` | 041 |

**気づけなかった理由**が3つある。

1. **`d1_migrations` 表が無い。** migration の適用を wrangler の仕組みで管理しておらず、
   手で当てた分だけが入っていた。**「どこまで当たっているか」を機械が答えられない。**
2. **友だちが 2 件（どちらも社内）しかいなかった。** 実利用がゼロなので誰も踏まなかった。
   実利用が始まった初日に、上の5系統が同時に壊れて出てくる形になっていた。
3. **失敗を握り潰して success を返す実装があった。** フォームの開封記録は
   表が無いのに `200` と `success:true` を返していた（`hv-hardening` ブランチで修正済み）。

## 直したこと（2026-09-07）

追加のみの migration 8本を本番に適用した（`CREATE TABLE` / `CREATE INDEX` /
`ALTER TABLE ADD COLUMN` のみ。既存データを書き換える文は含まれていないことを事前に確認した）。

```
cd apps/worker
npx wrangler d1 execute line-harness --remote --file=../../packages/db/migrations/<name>.sql -y
# 003_entry_routes / 006_tracked_links / 007_forms / 016_traffic_pools /
# 022_friend_first_tracked_link / 024_form_opens / 037_event_booking / 041_update_history
```

適用後は **72 表**。定義と本番の差は `friend_scenarios_new` と `broadcasts_new` の2つだけで、
これは 027 / 029 の途中生成用（rename で消える）なので**無いのが正しい**。

## 表を作っただけでは足りなかった（列の追加分）

表を作った直後に**列の検査**（`python3 ~/ops-weekly/schema_drift.py line-harness --columns`）を
かけたところ、コードが INSERT する列がまだ足りなかった。

- `events`: `target_type` `account_ids` `dedup_priority` `confirmation_message_extra`
  `reminder_message_extra` `og_title` `og_description` `og_image_url`
- `event_bookings`: `identity_key`

037 で表を作ったあと、**040 / 041 / 043 が列を足していた**ため。
既存の表にも触るファイルが混ざるので、**文ごとに実行し「duplicate column name」だけ
読み飛ばす**形で当てた（038 / 040 / 041 / 042 / 043 / 044 / 046 / 047 / 049）。

**表の有無だけを見た検査は途中までしか見ていない。** 列まで見て初めて
「読めるが書けない」が見つかる。

## 検査のしかた（今後も同じ手で確かめる）

```bash
# 定義されている表 vs 本番にある表
grep -hoiE 'CREATE TABLE (IF NOT EXISTS )?[a-z_]+' packages/db/migrations/*.sql | awk '{print tolower($NF)}' | sort -u
npx wrangler d1 execute line-harness --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

**差は両方向で見る。** 「定義はあるが本番に無い」＝使うと 500。
「本番にあるが定義に無い」＝手で作った表で、再構築すると消える。
この基盤では後者が 9 表あった（`friends` `tags` `scenarios` など中核の表）。

## デプロイの手順を間違えた（2026-09-07・記録として残す）

**`npx wrangler deploy` を単体で打ってはいけない。正しくは `npm run deploy`
（= `vite build && wrangler deploy`）。**

このプロジェクトは `@cloudflare/vite-plugin` を使っており、`wrangler deploy` が配るのは
`dist/line_harness/` の**ビルド済み成果物**である（`main = "src/index.ts"` と書いてあるが、
実際に配信されるのは 216 バイトの index.js が読み込む `assets/worker-entry-*.js`）。
`vite build` を挟まずに deploy すると、**`src/` の変更が一切入らない古い成果物が配られる**。

実際に 2 回 deploy して「反映されない」と混乱した。切り分けは次の順で付いた。

1. 本番の配信物を API で取得して文字列を検索 → 追加した分岐が**入っていない**
2. `wrangler deploy --dry-run --outdir` でビルド結果を見る → **ローカルのビルドにも入っていない**
   （＝デプロイの問題ではなく、ビルドを走らせていない問題）
3. `dist/.../worker-entry-*.js` の日付が **8/2** で、本番の配信物と**バイト単位で一致**

3 のおかげで「本番を古い版に後退させたのではないか」が否定できた。
**配信物を落として突合するまでは、後退の有無を断定しない。**

## 直っていたのに「動いていない」と報告した件（訂正）

HIDDEN VALUE 向けの実装（型カード・トーク内の相性マッチング・ペアコードの受け取り・
相談モードの安全修正）を「9月に書いたのに未デプロイ」と報告したが、**誤り**。
これらのコミットは **2026-08-02 付**で、本番のデプロイ（同日 14:53）に含まれている。
`git branch --format='%(committerdate)'` はブランチ先端（＝今日足したドキュメントのコミット）の
日付を返すので、**それを機能の日付として読んだのが誤りの原因**。
個々のコミットの日付は `git log --date=short --format='%h %ad %s' main..HEAD` で見る。

関連: `docs/INBOUND.md`、横断の方針は `~/.claude/knowledge/patterns/inbound_surfaces.md`。

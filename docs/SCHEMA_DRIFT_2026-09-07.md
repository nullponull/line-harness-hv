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

## まだ判断が要ること

**`hv-hardening` ブランチが未デプロイ。** 本番の Worker は **2026-08-02 版**で、
9月に書いた HIDDEN VALUE 向けの実装（型カード・トーク内の相性マッチング・ペアコードの受け取り・
相談モードの安全修正）は**動いていない**。一方でその DB migration（050 / 051）は本番に当たっている。
**コードと DB が別々の版になっている**状態なので、デプロイするか、当面使わないと決めるかを選ぶ必要がある。

関連: `docs/INBOUND.md`、横断の方針は `~/.claude/knowledge/patterns/inbound_surfaces.md`。

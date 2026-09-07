# 受け口（LINE から届くもの）— line-harness

外部から人が接触してくる経路を「受け口」と呼ぶ。**受け口は必ず、保存し・通知し・対応を記録する。**

## 一覧

| 受け口 | 保存先（D1 `line-harness`） | 通知 | 状態列 |
|---|---|---|---|
| 未読のトーク | `chats`（`status='unread'`） | 仕組みはあるが通知先の登録が0件 | `status` / `notes` |
| フォームの回答 | `form_submissions` | × | — |
| フォームの開封 | `form_opens` | × | — |
| イベント予約 | `event_bookings` | × | `status` |

滞留は横断の日次チェック（`~/ops-weekly/receipts_daily.py`、毎朝 09:10 JST）が数える。
`chats` は通知の仕組みが無い扱いで、**日数のしきい値に関係なく毎回報告**する。

## 対応の記録

```
python3 ~/ops-weekly/receipts_mark.py mark line_chat <id> --note "何をしたか"
```

`chats` には `admin_notes` が無いので、記録は `notes` 列に入る（道具側が列を見て合わせる）。

## 注意

- **2026-09-07 まで、フォーム・イベント予約・計測リンク・流入経路の表が本番に存在しなかった。**
  経緯と検査方法は `docs/SCHEMA_DRIFT_2026-09-07.md`。
- 未読の判定は `chats.status` で行う。**メニューのタップも incoming メッセージとして記録される**ので、
  「未読」がそのまま「返事を待っている人」を意味しない。実際、最初の1件は社内のタップだった。

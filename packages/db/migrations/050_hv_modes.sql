-- [HIDDEN VALUE] LINEユーザーごとの会話モード(既定=キャリアコーチング / counsel=悩み相談)。
-- friend単位で1行。型カードの「悩みを相談する」ボタン、または「仕事の相談にもどる」で切り替わる。
CREATE TABLE IF NOT EXISTS hv_modes (
  friend_id  TEXT PRIMARY KEY,
  mode       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- [HIDDEN VALUE] 「気になる子と相性を見る」の相手コード待ち受け状態。friend単位で1行。
-- hv_modes(相談モード用)とは別テーブル。型カードのボタンで開始し、次に届いたHV1コードを
-- 相手のコードとして扱う(本人のコードは上書きしない)。30分で失効(アプリ側でsinceの新しさを判定)。
CREATE TABLE IF NOT EXISTS hv_pair_wait (
  friend_id  TEXT PRIMARY KEY,
  since      INTEGER NOT NULL
);

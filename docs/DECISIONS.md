# 決定と制約の記録

出所: `~/.claude` の記憶から移設。記憶側は入口とポインタだけを持つ。

<!-- 2026-09-16: memory/infra-ops/project_inbound_surfaces_2026_09.md から移設 -->

## project_inbound_surfaces_2026_09（2026-09-16 移設）

## 決定と失効条件
- 健美家は当面「手入力前提」とし取得経路を増やさない(`knownBlocked` で毎日鳴らさない) — 効かなくなる条件: 解析を再稼働して利用者が健美家 URL を実際に投げ始めたら
- Browser Rendering を 403 の対策にしない(実測で健美家は3通りとも403・楽待は素 fetch の方が通る) — 効かなくなる条件: 相手側の遮断方式が変わったら
- Pages に D1 バインドを足さず共有の `/api/contact` に中継して保存する — 効かなくなる条件: wrangler.toml のバインドと dashboard secret が無害と検証できたら
- line-harness は `npm run deploy`(vite build 込み)が正典・push は `gh auth switch --user nullponull` — 効かなくなる条件: ビルド構成か権限を変えたら

## 検証で追加(圧縮時に落ちた決定・制約・罠)
- **[決定]** 受け口の基本規則そのもの「保存し・通知し・対応を記録する。対応はシステム、ただし外に出す前に人が一度確認する」が card_markdown に無い（JSON の decisions[4] にはあるのに本文へ落ちていない）
- **[罠]** VIVID の案内先は「受信不可」ではない（先方自身の公開アドレスで通常の受信可能構成・当方が作ったものではない・escalations は0件＝提案段階で直す対象なし）。しかも正典 inbound_surfaces.md L54 の壊れ方7 は訂正前のまま「通知先が MX の無いドメイン宛で誰にも届かない（VIVID の案内先）」と書いている
- **[罠]** convai の relationship_interactions は本番に無いのが正常（デモ環境 convai-demo-db 専用で本番は RELATIONSHIP_MEMORY 自体が無く機能オフ）。migration を本番DBに紐づけていた計器側の誤りで、危うく本番に使わない表を作るところだった
- **[現在地]** 正典の場所に convai-platform/docs/INBOUND.md が抜けている（実在を確認。通知欠落の扱い・閲覧APIの仕様・369件の内訳表・role='pair' の意味まで書かれている）
- **[現在地]** カードの正典説明が inbound_surfaces.md の3節を落としている:「記録は最初から識別情報を分けて書く（2026-09-08）」「行が0件を壊れていると読む前に試行数を見る」「送信元・受信の確認（MXが無いのは障害ではない）」
- **[決定]** lawyer_id 29423 の削除案件に残っている期限つきの約束「返信があれば30日以内に物理削除」。09-08 に本人請求で opt_out_requests の行そのものを削除し audit_logs も匿名化したため、期限を思い出させる行がDBに残っていない（公表している方針は archive/legaltrack-system-existing/docs/DELETION_POLICY.md の「削除要求から30日以内に完全削除」）
- **[決定]** 「AdSense を弁護士みつかるに入れるのは非推奨」と回答しユーザーが了承した決定（根拠: 流入は個人名検索99%・削除請求4件・月数百円規模・ai-media.co.jp 自体が要審査）
- **[現在地]** 日次チェック（receipts-daily 09:10）は手元 WSL の user systemd timer に載っており、それが死ぬと84タイマーごと無音で止まる。気づけたのは CF Worker の health-check-cron が外から見ていたからで、root cron の見張り＋NOPASSWD sudoers を恒久化した
- **[現在地]** legaltrack.jp の MX 未設定は障害ではない（送信にMXは不要・Brevoドメイン認証済み・公開ページ6本に @legaltrack.jp の記載は0件）。残る exposure は「09-05以前のメールに返信すると宛先不明で返る」だけで、閉じるなら CF Email Routing の catch-all
- **[要確認]** 原文/repo と食い違う可能性: 未移管の4項目のうち3項目は既に repo へ移管済み（カードの「正典に無い」が誤り）: ① 403実測・Browser Rendering 無効・knownBlocked・健美家23%(38/159)・実利用ゼロ・再稼働判断は /home/sol/real-estate-dd/docs/INBOUND.md L97-151 にある ② 覇権レーダーの配信未実装(Brevo IP制限)と subscribers.last_sent_at の NULL 計数は /home/sol/hakenradar/docs/INBOUND.md L10-26 にある ③ convai の通知欠落と FAQ 一次情報の扱いは /home/sol/convai-platform/docs/INBOUND.md にある。未移管として本当に残るのは Puku/persona-api の削除請求経路だけ（persona-api/docs/architecture-cloudflare-migration.md には deletion_requests の CREATE TABLE と「30日以内」の設計方針があるが、未接続であることは書かれていない）
- **[要確認]** 原文/repo と食い違う可能性: unique_facts_not_in_repo の同じ6項目（健美家403実測・BR実測・実利用ゼロ・覇権レーダー配信未実装/last_sent_at・real-estate-dd の CI 赤・GA4 カスタムディメンション）も「repo に無い」は誤り。GA4 の form カスタムディメンション未登録は正典 inbound_surfaces.md L145 節にも書かれている
- **[要確認]** 原文/repo と食い違う可能性: 現在地1行目「受け口は保存・通知・記録が通り」は過大。正典の受け口一覧（inbound_surfaces.md L21-44）では HIDDEN VALUE の診断フィードバック・資料請求リード、VIVID escalations が通知×、LINE chats は「仕組みはあるが登録0件」のまま
- **[要確認]** 原文/repo と食い違う可能性: 現在地2行目「通知が無いまま残るのは convai と覇権レーダー」は過少。上記のとおり HIDDEN VALUE×2・VIVID・LINE も通知が無い（だから RECEIPTS_WITHOUT_NOTIFY に列挙され毎回報告される）。この2つだけと読むと、次セッションは他の受け口の毎日の報告を「ノイズ」と誤認して黙らせかねない
- **[要確認]** 原文/repo と食い違う可能性: stale_or_wrong に入れた「convai の relationship_interactions はデモ環境専用」は stale ではなく現役の訂正事実（原文で計器の誤りとして確定済み・他のどこにも記録が無い）。捨てる分類が誤り
- **[要確認]** 原文/repo と食い違う可能性: 罠・教訓欄に挙げた4件の教訓（手動返信はDBに残らない／Brevoイベントは数分遅れる／Pages設定のAPI書き戻しで secret が空になる／robots の Disallow）は正典 inbound_surfaces.md L177-182・壊れ方11 に既にある。カードに再掲は不要だが、カードの正典説明にその節名が無いため到達できない（missing_items 5 と同じ問題）

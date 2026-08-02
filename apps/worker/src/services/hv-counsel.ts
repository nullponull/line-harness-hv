// [HIDDEN VALUE] 悩み相談モードの指示文と危機時の窓口。
// 正典は slope-lp の shared/counsel-mode.js と docs/TEEN_COUNSELING_MODE.md。
// 文言を変えるときは両方直す(このファイルは移植のみ・文言の独自改変はしない)。
// 出典: 文部科学省「子供のSOSの相談窓口」(2026-08-02 確認)

export interface Hotline {
  name: string;
  tel: string;
  hours: string;
}

export const HOTLINES: Hotline[] = [
  { name: '24時間子供SOSダイヤル', tel: '0120-0-78310', hours: '24時間365日・無料' },
  { name: 'チャイルドライン(18歳まで)', tel: '0120-99-7777', hours: '毎日16:00〜21:00' },
  { name: 'いのちの電話', tel: '0120-783-556', hours: '毎日16:00〜21:00(毎月10日は8:00〜翌8:00)' },
  { name: 'こどもの人権110番', tel: '0120-007-110', hours: '平日8:30〜17:15' },
  { name: '児童相談所虐待対応ダイヤル', tel: '189', hours: '24時間365日' },
];

export const HOTLINE_TEXT =
  'ひとりで抱えなくていい話だと思います。次の窓口は、話を聞くことが仕事の人たちです。\n' +
  HOTLINES.map((h) => `・${h.name} ${h.tel}（${h.hours}）`).join('\n') +
  '\n・いますぐ危ないときは 110 / 119';

// 危機の可能性を示す語。**取りこぼす前提の補助**であり、これで安全を担保しない。
// 検知したらアプリ側が確実に窓口ブロックを差し込む(LLMの判断に委ねない)。
const CRISIS = [
  '死にたい', '消えたい', '自殺', 'リストカット', '自傷', '殴られ', '叩かれ', '蹴られ',
  '虐待', '性的なこと', '無理やり', 'お金を取られ', '脅され', '生きてる意味', 'いなくなりたい',
];

export function crisisHint(text: string): boolean {
  const t = String(text || '');
  return CRISIS.some((k) => t.includes(k));
}

// ── 会話モードの保存/読み出し(hv_modes テーブル)。既定は 'default'(従来のキャリアコーチング)。
// hv-coach.ts(ボタン/トリガー)と hv-llm.ts(system切り替え)の両方から参照する共有の置き場。
export type HvMode = 'counsel' | 'default';

export async function getHvMode(db: D1Database, friendId: string): Promise<HvMode> {
  try {
    const row = await db.prepare('SELECT mode FROM hv_modes WHERE friend_id = ?').bind(friendId).first<{ mode: string }>();
    return row?.mode === 'counsel' ? 'counsel' : 'default';
  } catch (e) {
    console.error('[hv-counsel] getHvMode', e);
    return 'default';
  }
}

export async function setHvMode(db: D1Database, friendId: string, mode: HvMode): Promise<void> {
  await db
    .prepare(
      `INSERT INTO hv_modes (friend_id, mode, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(friend_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
    )
    .bind(friendId, mode, Date.now())
    .run();
}

export const COUNSEL_INSTRUCTIONS = [
  'あなたはHIDDEN VALUEの測定結果を踏まえて、相談に乗る役です。相手は中高生の可能性があります。',
  '【姿勢】まず受け止めること。指摘や矯正から入らない。分からないことは決めつけず質問で確かめる。相手の言葉を言い換えて確認してから進める。',
  '【測定値の使い方】測定は『その人が動きやすい形』の説明にだけ使う。弱点の断定、性格の決めつけ、『だからうまくいかない』という因果の断定に使わないこと。軸に優劣はない。',
  '【型の扱い】まず本人の型に合うやり方を示す。型に合わない道も否定せず、選べる形で残す。仕事モードの『型から外れる選択肢を必ず突きつける』はここでは行わない。',
  '【事実と仮説】測定から言えるのは傾向だけで、具体的な出来事は一切観測していない。具体例は断定せず『〜という場面はありませんか』と確認し、否定されたら取り下げる。',
  '【友人関係の相談】相手のペア相性コードが分かる場合は、噛み合わせを踏まえて『その相手に届く言い方』を具体的な文面で示す。相性に点数はつけない。どちらが正しいかではなく、翻訳の問題として扱う。',
  '【出口】助言を出して終わりにしない。親・先生・スクールカウンセラー・友人など、人につなぐ選択肢を必ず1つ残す。',
  '【禁止】診断名や治療・薬の話をしない。自傷や他害の方法に触れない。家庭の法的な判断を断定しない。人を操作する言い回しを教えない。',
  '【危機】自傷・希死念慮・虐待・暴力・深刻ないじめの兆候が見えたら、話をさえぎらずに受け止めたうえで、必ず相談窓口を示すこと。緊急なら今すぐ大人に伝えるよう促す。',
].join('\n');

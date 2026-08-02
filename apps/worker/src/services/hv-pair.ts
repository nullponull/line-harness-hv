// [HIDDEN VALUE] ふたりの相性(トーク内完結)。ペアコード2つから確定文言で「付き合い方」を出す(LLM不使用)。
// 正典は slope-lp の shared/pair-advice.js。文言を変えるときは両方直す。
// 相性に点数・順位・優劣はつけない。差は「翻訳が必要な場所」、同じは「噛み合う場所」として扱う。
import type { Dims } from './hv-coach.js';

// 軸ごとの一言。
//   diff: [自分が低い側で相手が高い側のときの助言, 自分が高い側で相手が低い側のときの助言]
//   same: 極が同じときの一言(高低どちらでも共通の見立て)
export const PAIR_ADVICE: Record<keyof Dims, { label: string; diff: [string, string]; same: string }> = {
  COM: {
    label: '伝え方',
    diff: [
      'あなたは順を追って話すタイプ。相手は要点から受け取るタイプです。まず結論だけ言ってから、理由を足すと届きます。',
      'あなたは相手に合わせて話すタイプ。相手は順番を大事にします。話を一つずつ区切ると伝わります。',
    ],
    same: '伝え方が似ているので、言葉の行き違いは起きにくい二人です。',
  },
  DEC: {
    label: '決め方',
    diff: [
      'あなたはじっくり選びたい。相手は早く決めたいタイプです。迷っている理由を一言そえると、待ってもらえます。',
      'あなたは早く決めたい。相手は考える時間がほしいタイプです。その場で答えを迫らないほうが、結果的に早く進みます。',
    ],
    same: '決めるまでの速さが揃っているので、予定や約束でぶつかりにくい二人です。',
  },
  EMO: {
    label: '感じ方',
    diff: [
      'あなたは内側で深く感じるタイプ。相手は思ったことをそのまま出します。強い言い方でも、悪意ではないことが多いです。',
      'あなたは気持ちをそのまま出すタイプ。相手は内側で深く感じます。返事が薄くても、届いていないわけではありません。',
    ],
    same: '感じ方の温度が近いので、気持ちの話が通じやすい二人です。',
  },
  SOC: {
    label: '関わり方',
    diff: [
      'あなたは距離を大事にする。相手は輪を広げたいタイプです。誘いを断るときは理由をそえると、角が立ちません。',
      'あなたは輪を広げたい。相手は距離を大事にするタイプです。大勢よりも、一対一の時間を作ると近づけます。',
    ],
    same: '人との距離の取り方が似ているので、付き合い方で揉めにくい二人です。',
  },
  THK: {
    label: '考え方',
    diff: [
      'あなたは深く掘りたい。相手は全体をつかむのが早いタイプです。細かい話は、要点を先に言うと聞いてもらえます。',
      'あなたは全体をつかむのが早い。相手は深く掘りたいタイプです。ざっくり話すと物足りなく感じるので、理由まで話すと噛み合います。',
    ],
    same: '考えの向きが同じなので、説明が少なくても話が早い二人です。',
  },
  VAL: {
    label: '大事にするもの',
    diff: [
      'あなたは納得してから動きたい。相手はまず動きたいタイプです。理想を語る前に、次の一歩を一緒に決めると進みます。',
      'あなたはまず動きたい。相手は納得を大事にするタイプです。やることだけ言うより、なぜかを話すと動きやすくなります。',
    ],
    same: '大事にしているものが近いので、判断が揃いやすい二人です。',
  },
  GRW: {
    label: '伸び方',
    diff: [
      'あなたは一つを深めたい。相手は次々と新しいことへ行くタイプです。全部に付き合わなくていいので、自分のペースは持っておくと続きます。',
      'あなたは広く挑戦したい。相手は一つを深めたいタイプです。誘いすぎず、その世界の話を聞くと信頼されます。',
    ],
    same: '伸ばし方が似ているので、同じ熱量で並走できる二人です。',
  },
  STR: {
    label: '困ったとき',
    diff: [
      'あなたはまず落ち着いて見る。相手は前に出て動くタイプです。見守っている姿勢は、言葉にしないと冷たく見えることがあります。',
      'あなたは前に出て動く。相手はまず状況を見るタイプです。急かさないほうが、結果的に早く動いてくれます。',
    ],
    same: '困ったときの動き方が似ているので、非常時に足並みが揃う二人です。',
  },
};

const DIMS8: (keyof Dims)[] = ['COM', 'DEC', 'EMO', 'SOC', 'THK', 'VAL', 'GRW', 'STR'];

export interface PairAdviceRow {
  dim: keyof Dims;
  label: string;
  gap: number;
  crossed: boolean;
  text: string;
}

export interface PairAdviceResult {
  translate: PairAdviceRow[];
  resonate: PairAdviceRow[];
  note: string;
}

// 2人の8軸から、翻訳が必要な軸(差が大きい順)と噛み合う軸(差が小さい順)を返す。
// a/b は {COM:1..4, ...}。閾値は中庸2.5。
export function pairAdvice(a: Dims, b: Dims, opts: { diff?: number; same?: number } = {}): PairAdviceResult {
  const nDiff = opts.diff || 3;
  const nSame = opts.same || 2;
  const rows: PairAdviceRow[] = DIMS8.filter((d) => a[d] != null && b[d] != null).map((d) => {
    const aHi = a[d] >= 2.5;
    const bHi = b[d] >= 2.5;
    return {
      dim: d,
      label: PAIR_ADVICE[d].label,
      gap: Math.abs(a[d] - b[d]),
      crossed: aHi !== bHi,
      text: aHi !== bHi ? PAIR_ADVICE[d].diff[aHi ? 1 : 0] : PAIR_ADVICE[d].same,
    };
  });
  const translate = rows.filter((r) => r.crossed).sort((x, y) => y.gap - x.gap).slice(0, nDiff);
  const resonate = rows.filter((r) => !r.crossed).sort((x, y) => x.gap - y.gap).slice(0, nSame);
  return {
    translate,
    resonate,
    // 点数はつけない。「どこが噛み合い、どこは翻訳が要るか」だけを返す。
    note:
      translate.length === 0
        ? '違いが目立つ軸はありません。似ているぶん、同じところでつまずきやすい二人です。'
        : '違いは相性の良し悪しではありません。ここを翻訳できれば、続く関係になります。',
  };
}

const SHINDAN = 'https://shindan.ai-media.co.jp';

// 「気になる子と相性を見る」ボタンを押した直後に出す案内文。
export const PAIR_WAIT_PROMPT =
  '相手から届いたメッセージやリンクを、そのままこのトークに送ってください。コードだけでも大丈夫です。\nまだ測っていない子には、下のメッセージを転送してください。';

// 転送用の招待メッセージ(本人のコード入り)。
export function inviteMessageText(code: string): string {
  return `わたしの相性コードは ${code}。あなたのも測って、ふたりの付き合い方を見てみて → ${SHINDAN}/pair?a=${code}`;
}

// 相性カード(Flex)。相性に点数・順位・優劣は絶対に出さない。
//   見出し「ふたりの付き合い方」/ 相手の型名(任意) / 翻訳が必要な軸(最大3) / 噛み合う軸(最大2) / note
export function pairCardFlex(
  selfCode: string,
  selfDims: Dims,
  partnerCode: string,
  partnerDims: Dims,
  partnerTypeLabel?: string,
): unknown {
  const advice = pairAdvice(selfDims, partnerDims);

  const translateRows = advice.translate.map((r) => ({
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    contents: [
      { type: 'text', text: r.label, size: 'sm', weight: 'bold', color: '#2563eb' },
      { type: 'text', text: r.text, size: 'sm', color: '#13233c', wrap: true, margin: 'xs' },
    ],
  }));
  const resonateRows = advice.resonate.map((r) => ({
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    margin: 'sm',
    contents: [
      { type: 'text', text: r.label, size: 'sm', color: '#8896a8', flex: 3 },
      { type: 'text', text: r.text, size: 'sm', color: '#4e6076', flex: 7, wrap: true },
    ],
  }));

  const sections: unknown[] = [];
  if (partnerTypeLabel) {
    sections.push({ type: 'text', text: '相手の型', size: 'sm', color: '#8896a8' });
    sections.push({ type: 'text', text: partnerTypeLabel, size: 'lg', weight: 'bold', color: '#b45309', wrap: true, margin: 'xs' });
    sections.push({ type: 'separator', margin: 'lg' });
  }
  if (translateRows.length > 0) {
    sections.push({ type: 'text', text: '翻訳が必要な場所', size: 'md', color: '#8896a8', margin: 'lg' });
    sections.push(...translateRows);
  }
  if (resonateRows.length > 0) {
    sections.push({ type: 'separator', margin: 'lg' });
    sections.push({ type: 'text', text: '噛み合う場所', size: 'md', color: '#8896a8', margin: 'lg' });
    sections.push(...resonateRows);
  }
  sections.push({ type: 'separator', margin: 'lg' });
  sections.push({ type: 'text', text: advice.note, size: 'sm', color: '#8896a8', wrap: true, margin: 'md' });

  return {
    type: 'flex',
    altText: 'ふたりの付き合い方',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        backgroundColor: '#2563eb',
        contents: [
          { type: 'text', text: 'HIDDEN VALUE', size: 'sm', color: '#bcd3ff', weight: 'bold' },
          { type: 'text', text: 'ふたりの付き合い方', size: 'xl', color: '#ffffff', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: sections,
      },
    },
  };
}

// ── 相手コード待ち受け状態(hv_pair_wait)。30分で失効。相談モード用の hv_modes とは別テーブル。

const PAIR_WAIT_TTL_MS = 30 * 60 * 1000;

export async function startPairWait(db: D1Database, friendId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO hv_pair_wait (friend_id, since) VALUES (?, ?)
       ON CONFLICT(friend_id) DO UPDATE SET since = excluded.since`,
    )
    .bind(friendId, Date.now())
    .run();
}

// 待ち受け中(30分以内)なら true。期限切れなら行を削除して false を返す(通常のコード受信動作に戻す)。
export async function isPairWaitActive(db: D1Database, friendId: string): Promise<boolean> {
  const row = await db.prepare('SELECT since FROM hv_pair_wait WHERE friend_id = ?').bind(friendId).first<{ since: number }>();
  if (!row) return false;
  if (Date.now() - row.since < PAIR_WAIT_TTL_MS) return true;
  await clearPairWait(db, friendId);
  return false;
}

export async function clearPairWait(db: D1Database, friendId: string): Promise<void> {
  await db.prepare('DELETE FROM hv_pair_wait WHERE friend_id = ?').bind(friendId).run();
}

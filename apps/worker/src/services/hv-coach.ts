// [HIDDEN VALUE] LINEコーチング — ペア相性コード(HV1+8)を鍵に、確定配信で型カード/メニューを返す。
// 制御=タップ/コード=LLM不使用(ハイブリッド会話の「制御」側)。自由入力の柔軟対応は hv-llm.ts が担う。
import type { LineClient } from '@line-crm/line-sdk';
import { setHvMode } from './hv-counsel.js';
import { pairCardFlex, PAIR_WAIT_PROMPT, inviteMessageText, startPairWait, isPairWaitActive, clearPairWait } from './hv-pair.js';

const DIMS8 = ['COM', 'DEC', 'EMO', 'SOC', 'THK', 'VAL', 'GRW', 'STR'] as const;
type Dim = (typeof DIMS8)[number];
const DIMLABEL: Record<Dim, string> = { COM: '伝え方', DEC: '決め方', EMO: '感じ方', SOC: '関わり方', THK: '考え方', VAL: '価値観', GRW: '伸び方', STR: '逆境' };
const POLES: Record<Dim, [string, string]> = {
  COM: ['順序立てて正確に', '柔軟に合わせて'], DEC: ['じっくり熟考', '直感で素早く'], EMO: ['静かに深く感じる', '率直に表現する'],
  SOC: ['誠実な距離感', '開かれた関わり'], THK: ['本質を掘り下げる', '全体を感じ取る'], VAL: ['信念を貫く', '現実を動かす'],
  GRW: ['深く究める', '広く挑戦する'], STR: ['冷静に対処', '前向きに突破'],
};
const HOW: Record<Dim, [string, string]> = {
  COM: ['順序立てる型は、レビューや議事で"構造の指摘"から入ると自然に効きます', '合わせる型は、相手の文脈に翻訳して伝える役でチーム横断に重宝されます'],
  DEC: ['熟考型は、比較表や判断基準を先に作る役回りで価値が見えます', '即断型は、小さく試す初動(PoC・検証)を取ると速さがそのまま実績になります'],
  EMO: ['静かに感じる型は、荒れた議論の"安定した一次受け"で信頼が積み上がります', '率直な型は、場の空気を言語化する役(ふりかえり進行など)が向いています'],
  SOC: ['深く狭くの型は、難しい相手の継続担当で独自の信頼資産ができます', '開く型は、新メンバー受け入れや外部との窓口で接点を生む側に回ると効きます'],
  THK: ['掘り下げ型は、原因究明や設計レビューの"なぜ"担当で評判が立ちます', '俯瞰型は、キックオフの一言目・方向づけの場で先に出ると効きます'],
  VAL: ['筋を通す型は、品質基準やレビュー観点の起草役で、こだわりが組織の標準になります', '現実駆動型は、数字を1つ持つ小さなミッションで結果が見える化されます'],
  GRW: ['深耕型は、社内勉強会の講師など"教える場"を持つと専門性が代替不能になります', '探索型は、立ち上げ初期や隣接領域の兼務に入ると越境が職能になります'],
  STR: ['冷静型は、障害ふりかえりのまとめ役で、組織の学習装置として機能します', '突破型は、誰も手を挙げない案件の推進役で"最初の相談先"の地位を得ます'],
};

export type Dims = Record<Dim, number>;

export function decodeHvCode(s: string): Dims | null {
  const t = (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^HV1[0-9ABC]{8}$/.test(t)) return null;
  const o = {} as Dims;
  DIMS8.forEach((d, i) => (o[d] = 1 + parseInt(t[3 + i], 13) / 4));
  return o;
}

export function findHvCode(text: string): string | null {
  // 全角・小文字・記号・URL混じりを吸収し、手入力の定番の間違い(O→0 / I,L→1)も直す。
  const flat = (text || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = flat.match(/HV1[0-9ABCOIL]{8}/);
  if (!m) return null;
  const fixed = 'HV1' + m[0].slice(3).replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^HV1[0-9ABC]{8}$/.test(fixed) ? fixed : null;
}

function org3(e: Dims) {
  const F: { label: string; dims: Dim[]; lo: string; hi: string; mid: string }[] = [
    { label: 'つながり方', dims: ['COM', 'EMO', 'SOC'], lo: '信頼蓄積型', hi: '場を動かす型', mid: '両利きの調整型' },
    { label: '前への進め方', dims: ['DEC', 'VAL', 'STR'], lo: '軸で進める型', hi: '推進型', mid: '状況適応型' },
    { label: '視野の取り方', dims: ['THK', 'GRW'], lo: '深耕型', hi: '探索型', mid: 'ズーム可変型' },
  ];
  return F.map((f) => {
    const m = f.dims.reduce((a, d) => a + (e[d] ?? 2.5), 0) / f.dims.length;
    return { frame: f.label, type: Math.abs(m - 2.5) < 0.35 ? f.mid : m >= 2.5 ? f.hi : f.lo };
  });
}

function topStrength(e: Dims): { dim: Dim; label: string; how: string } {
  let best: Dim = 'COM', lean = -1;
  DIMS8.forEach((d) => { const L = Math.abs((e[d] ?? 2.5) - 2.5); if (L > lean) { lean = L; best = d; } });
  const hi = (e[best] ?? 2.5) >= 2.5;
  return { dim: best, label: POLES[best][hi ? 1 : 0], how: HOW[best][hi ? 1 : 0] };
}

const SHINDAN = 'https://shindan.ai-media.co.jp';

// 型カード (Flex bubble)。8軸コードから確定生成。絵文字なし・HVデザイン(白×青×金)。
export function typeCardFlex(code: string, e: Dims) {
  const frames = org3(e);
  const strong = topStrength(e);
  return {
    type: 'flex', altText: `あなたの型カード（${strong.label}）`,
    contents: {
      type: 'bubble', size: 'giga',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#2563eb',
        contents: [
          { type: 'text', text: 'HIDDEN VALUE', size: 'sm', color: '#bcd3ff', weight: 'bold' },
          { type: 'text', text: 'あなたの効き方の型', size: 'xl', color: '#ffffff', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'text', text: `一番はっきり出た強み`, size: 'md', color: '#8896a8' },
          { type: 'text', text: `${DIMLABEL[strong.dim]}：${strong.label}`, size: 'xxl', weight: 'bold', color: '#b45309', wrap: true },
          { type: 'text', text: strong.how, size: 'lg', color: '#4e6076', wrap: true },
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '組織の中での効き方', size: 'md', color: '#8896a8', margin: 'lg' },
          ...frames.map((f) => ({
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: f.frame, size: 'lg', color: '#8896a8', flex: 4 },
              { type: 'text', text: f.type, size: 'lg', weight: 'bold', color: '#13233c', flex: 5, wrap: true },
            ],
          })),
          { type: 'separator', margin: 'lg' },
          { type: 'box', layout: 'baseline', margin: 'lg', contents: [
            { type: 'text', text: 'PAIR CODE', size: 'sm', color: '#8896a8', flex: 3 },
            { type: 'text', text: code, size: 'lg', weight: 'bold', color: '#2563eb', flex: 5 },
          ] },
          { type: 'text', text: '90日後に「もう一度測ると傾きが見える」リマインドを1通お送りします。', size: 'sm', color: '#8896a8', wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', height: 'md', color: '#2563eb', action: { type: 'uri', label: 'わたしの取扱説明書', uri: `${SHINDAN}/manual?code=${code}` } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'uri', label: 'ふたりの相性を重ねる', uri: `${SHINDAN}/pair?a=${code}` } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '気になる子と相性を見る', text: '気になる子と相性を見る' } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '友だちを誘う', text: '友だちを誘う' } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '次の一歩を見る', text: '次の一歩' } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '悩みを相談する', text: '悩みを相談する' } },
        ],
      },
    },
  };
}

function nextStepFlex(e: Dims) {
  const s = topStrength(e);
  return {
    type: 'flex', altText: '次の一歩',
    contents: {
      type: 'bubble', size: 'giga',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'text', text: '次の一歩', size: 'xl', weight: 'bold', color: '#13233c' },
          { type: 'text', text: `あなたの「${s.label}」を、キャリアの武器に育てる`, size: 'md', color: '#4e6076', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: s.how, size: 'lg', color: '#13233c', wrap: true, margin: 'md' },
          { type: 'text', text: '戻せる範囲で、まず1つ。90日後の再測定で、この軸が動いたか答え合わせします。', size: 'sm', color: '#8896a8', wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [{ type: 'button', style: 'secondary', height: 'md', action: { type: 'uri', label: 'もっと詳しく(定番の一冊)', uri: SHINDAN } }],
      },
    },
  };
}

// 未連携ユーザーへのガイド (診断ボタン付きFlex)。診断してない人を促す。
function guideFlex(reason: '今の私' | '次の一歩'): unknown {
  const head = reason === '今の私' ? 'まず、あなたを測りましょう' : '強みが分かると、次の一歩が出ます';
  return {
    type: 'flex', altText: '診断のご案内',
    contents: {
      type: 'bubble', size: 'giga',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md',
        contents: [
          { type: 'text', text: head, size: 'xl', weight: 'bold', color: '#13233c', wrap: true },
          { type: 'text', text: '30秒で市場の中の位置、約5分であなたの「型」まで分かります。肩書きではなく、任されているもので測る無料診断です。', size: 'lg', color: '#4e6076', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'もう測った方は、結果画面の「ペア相性コード」(HV1で始まる8桁)をこのトークに送ってください。型カードをお作りします。', size: 'sm', color: '#8896a8', wrap: true, margin: 'md' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', height: 'md', color: '#06C755', action: { type: 'message', label: 'LINEでサクッと診断(8問)', text: '診断' } },
          { type: 'button', style: 'secondary', height: 'md', action: { type: 'uri', label: 'じっくり測る(web・約5分)', uri: `${SHINDAN}/diagnose` } },
        ],
      },
    },
  };
}

// friend.metadata に保存した dims を読む
function loadDims(metadata: string | null): { code: string; dims: Dims } | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    if (m.hv_code && m.hv_dims) return { code: m.hv_code, dims: m.hv_dims };
  } catch (_) {}
  return null;
}

interface FriendRow { id: string; metadata: string | null }

// コード受信時、「相手として扱うか／自分のコードを更新するか」を選ばせる必要があるかどうかの純粋判定。
// 待ち受け中でなく、本人のコードが保存済みで、届いたコードがそれと違うときだけ true。
export function shouldAskWhichCode(params: { pairWaitActive: boolean; savedCode: string | null; incomingCode: string }): boolean {
  return !params.pairWaitActive && !!params.savedCode && params.savedCode !== params.incomingCode;
}

// 「どちらにしますか」の選択メッセージ。押されたときにどのコードだったか復元できるよう、
// postback data (hvpc=<pair|self>:<CODE>) にコードを載せる。
function askWhichCodeMessage(incomingCode: string): unknown {
  return {
    type: 'text',
    text: 'コードを受け取りました。どちらにしますか。',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: 'この人と相性を見る', data: `hvpc=pair:${incomingCode}`, displayText: 'この人と相性を見る' } },
        { type: 'action', action: { type: 'postback', label: '自分のコードを更新する', data: `hvpc=self:${incomingCode}`, displayText: '自分のコードを更新する' } },
      ],
    },
  };
}

/**
 * HIDDEN VALUE 固有のテキスト処理。処理したら true を返す(webhook側は以降をスキップ)。
 * - HV1コード → 型カード + dims保存 + 90日シナリオ登録
 * - 「今の私」→ 保存済み型カード再送
 * - 「次の一歩」→ 次の一歩カード
 * それ以外(自由入力)は false を返し、後続(hv-llm/auto-reply)に委ねる。
 */
export async function handleHiddenValueText(
  db: D1Database, line: LineClient, replyToken: string, friend: FriendRow, text: string,
): Promise<boolean> {
  const code = findHvCode(text);
  if (code) {
    const dims = decodeHvCode(code);
    if (!dims) return false;
    const saved = loadDims(friend.metadata);
    // 「気になる子と相性を見る」で待ち受け中なら、届いたコードは相手のコードとして扱う(本人のコードは上書きしない)。
    // 待ち受けが30分を過ぎていれば isPairWaitActive が false を返し、以降の通常フロー(自分のコード)に落ちる。
    const pairWaitActive = await isPairWaitActive(db, friend.id);
    if (pairWaitActive) {
      await clearPairWait(db, friend.id);
      if (saved) {
        const partnerType = topStrength(dims);
        await line.replyMessage(replyToken, [pairCardFlex(saved.code, saved.dims, code, dims, partnerType.label) as never]);
        return true;
      }
    }
    // 待ち受け中でなく、本人のコードが保存済みで、届いたコードが違う場合は、勝手に判断せずその場で選ばせる。
    // (友だちのコードをそのまま転送してくる中高生の手数を減らすための分岐)
    if (shouldAskWhichCode({ pairWaitActive, savedCode: saved?.code ?? null, incomingCode: code })) {
      await line.replyMessage(replyToken, [askWhichCodeMessage(code) as never]);
      return true;
    }
    const meta = { ...(safeParse(friend.metadata)), hv_code: code, hv_dims: dims, hv_linked_at: new Date().toISOString() };
    await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(meta), new Date(Date.now() + 9 * 3600_000).toISOString(), friend.id).run();
    await line.replyMessage(replyToken, [typeCardFlex(code, dims) as never]);
    return true;
  }
  const trimmed = (text || '').trim();
  if (trimmed === '今の私') {
    const saved = loadDims(friend.metadata);
    if (saved) { await line.replyMessage(replyToken, [typeCardFlex(saved.code, saved.dims) as never]); return true; }
    await line.replyMessage(replyToken, [guideFlex('今の私') as never]);
    return true;
  }
  if (trimmed === '次の一歩') {
    const saved = loadDims(friend.metadata);
    if (saved) { await line.replyMessage(replyToken, [nextStepFlex(saved.dims) as never]); return true; }
    await line.replyMessage(replyToken, [guideFlex('次の一歩') as never]);
    return true;
  }
  if (trimmed === '取説' || trimmed === '取扱説明書' || trimmed === 'トリセツ') {
    const saved = loadDims(friend.metadata);
    if (saved) {
      await line.replyMessage(replyToken, [{
        type: 'flex', altText: 'わたしの取扱説明書',
        contents: { type: 'bubble', size: 'giga',
          body: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'md', contents: [
            { type: 'text', text: 'わたしの取扱説明書', size: 'xl', weight: 'bold', color: '#13233c' },
            { type: 'text', text: '上司・同僚・部下・友人——渡す相手で「こう関わると力が出る」が変わります。渡す名刺のように使えます。', size: 'md', color: '#4e6076', wrap: true },
          ] },
          footer: { type: 'box', layout: 'vertical', paddingAll: '14px', contents: [
            { type: 'button', style: 'primary', height: 'md', color: '#2563eb', action: { type: 'uri', label: '取扱説明書を開く', uri: `${SHINDAN}/manual?code=${saved.code}` } },
          ] } },
      } as never]);
      return true;
    }
    await line.replyMessage(replyToken, [guideFlex('今の私') as never]);
    return true;
  }
  // 気になる子と相性を見る(型カードのボタン)。相手のコード待ち受けを開始し、招待メッセージも送る。
  if (trimmed === '気になる子と相性を見る') {
    const saved = loadDims(friend.metadata);
    if (!saved) {
      await line.replyMessage(replyToken, [{ type: 'text', text: 'まず自分のコードを送ってください' } as never]);
      return true;
    }
    await startPairWait(db, friend.id);
    await line.replyMessage(replyToken, [
      { type: 'text', text: PAIR_WAIT_PROMPT } as never,
      { type: 'text', text: inviteMessageText(saved.code) } as never,
    ]);
    return true;
  }
  // 友だちを誘う(型カードのボタン)。招待メッセージだけを返す(待ち受けは開始しない)。
  if (trimmed === '友だちを誘う') {
    const saved = loadDims(friend.metadata);
    if (!saved) {
      await line.replyMessage(replyToken, [{ type: 'text', text: 'まず自分のコードを送ってください' } as never]);
      return true;
    }
    await line.replyMessage(replyToken, [{ type: 'text', text: inviteMessageText(saved.code) } as never]);
    return true;
  }
  // 相談モードへの切替(型カードのボタン、または直接入力)。以降の自由入力は hv-llm が
  // COUNSEL_INSTRUCTIONS で応答する(モードは hv_modes テーブルに保存・粘着)。
  if (trimmed === '悩みを相談する') {
    await setHvMode(db, friend.id, 'counsel');
    await line.replyMessage(replyToken, [{ type: 'text', text: 'どんなことでも聞きます。学校のこと、友だちのこと、家のこと、なんでも大丈夫です。' } as never]);
    return true;
  }
  if (trimmed === '仕事の相談にもどる') {
    await setHvMode(db, friend.id, 'default');
    await line.replyMessage(replyToken, [{ type: 'text', text: 'キャリア相談にもどりました。いつでも下のメニューから「悩みを相談する」に切り替えられます。' } as never]);
    return true;
  }
  return false;
}

// askWhichCodeMessage のクイックリプライ(hvpc=pair:CODE / hvpc=self:CODE)を処理。処理したら true。
export async function handlePairChoicePostback(
  db: D1Database, line: LineClient, replyToken: string, friend: FriendRow, data: string,
): Promise<boolean> {
  const m = data.match(/^hvpc=(pair|self):(.+)$/);
  if (!m) return false;
  const choice = m[1] as 'pair' | 'self';
  const code = m[2];
  const dims = decodeHvCode(code);
  if (!dims) return false;

  if (choice === 'pair') {
    const saved = loadDims(friend.metadata);
    if (!saved) {
      await line.replyMessage(replyToken, [{ type: 'text', text: 'まず自分のコードを送ってください' } as never]);
      return true;
    }
    const partnerType = topStrength(dims);
    await line.replyMessage(replyToken, [pairCardFlex(saved.code, saved.dims, code, dims, partnerType.label) as never]);
    return true;
  }

  // choice === 'self': 従来どおり本人のコードとして保存し、型カードを返す。
  const meta = { ...(safeParse(friend.metadata)), hv_code: code, hv_dims: dims, hv_linked_at: new Date().toISOString() };
  await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(meta), new Date(Date.now() + 9 * 3600_000).toISOString(), friend.id).run();
  await line.replyMessage(replyToken, [typeCardFlex(code, dims) as never]);
  return true;
}

function safeParse(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, unknown>; } catch (_) { return {}; }
}

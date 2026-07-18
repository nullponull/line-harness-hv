// [HIDDEN VALUE] ハイブリッド会話の「柔軟」側 — 自由入力だけ Gemini Flash に委ねる。
// 制御(タップ/コード/メニュー)は hv-coach.ts が確定処理し、ここには来ない。
// 設計原則(hybrid playbook): 掴めない入力は捏造せず正直に/測定の枠内で答える/優劣をつけない/
// 選抜への単独使用を勧めない。プロファイル(本人の8軸)を注入して個別化する。
import type { LineClient } from '@line-crm/line-sdk';
import { decodeHvCode } from './hv-coach.js';

const DIMLABEL: Record<string, string> = { COM: '伝え方', DEC: '決め方', EMO: '感じ方', SOC: '関わり方', THK: '考え方', VAL: '価値観', GRW: '伸び方', STR: '逆境' };
const POLES: Record<string, [string, string]> = {
  COM: ['順序立てて正確に', '柔軟に合わせて'], DEC: ['じっくり熟考', '直感で素早く'], EMO: ['静かに深く感じる', '率直に表現する'],
  SOC: ['誠実な距離感', '開かれた関わり'], THK: ['本質を掘り下げる', '全体を感じ取る'], VAL: ['信念を貫く', '現実を動かす'],
  GRW: ['深く究める', '広く挑戦する'], STR: ['冷静に対処', '前向きに突破'],
};

const GEMINI_MODEL = 'gemini-2.0-flash';
const SHINDAN = 'https://shindan.ai-media.co.jp';

function profileText(code: string): string | null {
  const e = decodeHvCode(code);
  if (!e) return null;
  const lines = Object.keys(POLES).map((d) => {
    const v = e[d as keyof typeof e] as number;
    const side = v >= 2.5 ? POLES[d][1] : POLES[d][0];
    const strength = Math.abs(v - 2.5) >= 0.8 ? '(強く出ている)' : Math.abs(v - 2.5) < 0.3 ? '(中庸)' : '';
    return `- ${DIMLABEL[d]}: ${side}寄り${strength}`;
  });
  return lines.join('\n');
}

const SYSTEM = (profile: string) => `あなたは「HIDDEN VALUE」の伴走コーチです。相談者の内面診断の結果(8軸・各軸は両極でどちらも強み・優劣なし)を踏まえて、キャリア・働き方の相談に短く具体的に答えます。

相談者の測定プロファイル:
${profile}

守ること:
- 8軸に優劣はない。「その型だからこう活きる」という方向で話し、優劣や欠点として語らない。
- 測定は集団の較正・機会配分の補助であり、個人の選抜(採用可否など)への単独使用は不適。断定診断はしない。
- 分からないことは推測で埋めず、正直に「そこは測っていない」と言う。
- 3〜5文で短く。LINEのトークなので絵文字は使わず、落ち着いた丁寧語で。
- 具体の一歩を1つ添える(戻せる範囲の行動)。90日後の再測定で答え合わせできることを時々思い出させる。
- 医療・法務・投資など専門判断が要る相談は、専門家への相談を促す。`;

interface FriendRow { id: string; metadata: string | null }

function savedCode(metadata: string | null): string | null {
  if (!metadata) return null;
  try { const m = JSON.parse(metadata); return m.hv_code || null; } catch (_) { return null; }
}

// Gemini Flash 呼び出し。キー未設定なら null(=呼び出し側が確定文言にフォールバック)。
async function askGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { console.error('[hv-llm] gemini', r.status, await r.text().catch(() => '')); return null; }
    const d = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const t = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    return t || null;
  } catch (e) { console.error('[hv-llm] fetch', e); return null; }
}

/**
 * 自由入力コーチング。hv-coach が処理しなかったテキストのみここに来る。
 * - プロファイル未連携 → 確定文言でコード送信を促す(LLM不使用)
 * - キー未設定 → 確定文言でメニュー誘導(LLM不使用)
 * - それ以外 → プロファイル注入して Gemini Flash
 */
export async function handleHiddenValueLlm(
  env: { GEMINI_API_KEY?: string }, line: LineClient, replyToken: string, friend: FriendRow, text: string,
): Promise<void> {
  const code = savedCode(friend.metadata);
  if (!code) {
    await line.replyMessage(replyToken, [{ type: 'text', text: 'ご相談ありがとうございます。まず診断結果の「ペア相性コード」(HV1で始まる8桁)を送っていただくと、あなたの型に合わせてお答えできます。\nまだの方はこちら → ' + SHINDAN + '/diagnose' } as never]);
    return;
  }
  const profile = profileText(code);
  const key = env.GEMINI_API_KEY;
  if (!profile || !key) {
    await line.replyMessage(replyToken, [{ type: 'text', text: '下のメニューから「今の私」「次の一歩」を選べます。より詳しい相談機能は準備中です。' } as never]);
    return;
  }
  const answer = await askGemini(key, SYSTEM(profile), text.slice(0, 500));
  await line.replyMessage(replyToken, [{ type: 'text', text: answer || '少し混み合っているようです。時間をおいて、もう一度お願いします。メニューの「次の一歩」は今すぐ見られます。' } as never]);
}

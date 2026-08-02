// [HIDDEN VALUE] ハイブリッド会話の「柔軟」側 — 自由入力だけ Gemini Flash に委ねる。
// 制御(タップ/コード/メニュー)は hv-coach.ts が確定処理し、ここには来ない。
// 設計原則(hybrid playbook): 掴めない入力は捏造せず正直に/測定の枠内で答える/優劣をつけない/
// 選抜への単独使用を勧めない。プロファイル(本人の8軸)を注入して個別化する。
import type { LineClient } from '@line-crm/line-sdk';
import { decodeHvCode } from './hv-coach.js';
import { crisisHint, HOTLINE_TEXT, COUNSEL_INSTRUCTIONS, getHvMode } from './hv-counsel.js';

const DIMLABEL: Record<string, string> = { COM: '伝え方', DEC: '決め方', EMO: '感じ方', SOC: '関わり方', THK: '考え方', VAL: '価値観', GRW: '伸び方', STR: '逆境' };
const POLES: Record<string, [string, string]> = {
  COM: ['順序立てて正確に', '柔軟に合わせて'], DEC: ['じっくり熟考', '直感で素早く'], EMO: ['静かに深く感じる', '率直に表現する'],
  SOC: ['誠実な距離感', '開かれた関わり'], THK: ['本質を掘り下げる', '全体を感じ取る'], VAL: ['信念を貫く', '現実を動かす'],
  GRW: ['深く究める', '広く挑戦する'], STR: ['冷静に対処', '前向きに突破'],
};

const VERTEX_MODEL = 'gemini-2.5-flash';
const VERTEX_REGION = 'us-central1';
const SHINDAN = 'https://shindan.ai-media.co.jp';

// ── Vertex AI OAuth (SA秘密鍵でJWT署名→トークン交換)。isolate内でトークンをキャッシュ ──
interface SA { client_email: string; private_key: string; token_uri: string; project_id: string }
let _tokCache: { token: string; exp: number } | null = null;

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function mintToken(sa: SA): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (_tokCache && _tokCache.exp - 60 > now) return _tokCache.token;
  try {
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claims = b64url(new TextEncoder().encode(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: sa.token_uri, iat: now, exp: now + 3600,
    })));
    const signingInput = `${header}.${claims}`;
    const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${b64url(sig)}`;
    const r = await fetch(sa.token_uri, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    if (!r.ok) { console.error('[hv-llm] token', r.status, await r.text().catch(() => '')); return null; }
    const d = await r.json() as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    _tokCache = { token: d.access_token, exp: now + (d.expires_in || 3600) };
    return d.access_token;
  } catch (e) { console.error('[hv-llm] mintToken', e); return null; }
}

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

// 相談モード用の8軸注入。既存 profileText() は「(強く出ている)」等キャリア向けの断定寄りの
// 言い回しのため流用せず、悩み相談では「〜しやすい」という動きやすさの説明に言い換えた版を使う
// (COUNSEL_INSTRUCTIONSの『測定値の使い方』『事実と仮説』の縛りに合わせる。弱点として書かない)。
const POLES_LEAN: Record<string, [string, string]> = {
  COM: ['順序立てて正確に伝えやすい', '柔軟に合わせて伝えやすい'],
  DEC: ['じっくり考えてから決めやすい', '直感で素早く決めやすい'],
  EMO: ['静かに深く感じやすい', '素直に気持ちを表しやすい'],
  SOC: ['誠実な距離感で関わりやすい', '開かれた関わり方をしやすい'],
  THK: ['本質を掘り下げて考えやすい', '全体を感じ取って考えやすい'],
  VAL: ['自分の信念を大事にしやすい', '目の前の現実を動かすことを大事にしやすい'],
  GRW: ['一つのことを深く究めやすい', '広くいろんなことに挑戦しやすい'],
  STR: ['落ち着いて対処しやすい', '前向きに乗り越えやすい'],
};

function counselProfileText(code: string): string | null {
  const e = decodeHvCode(code);
  if (!e) return null;
  const lines = Object.keys(POLES_LEAN).map((d) => {
    const v = e[d as keyof typeof e] as number;
    const side = v >= 2.5 ? POLES_LEAN[d][1] : POLES_LEAN[d][0];
    return `- ${DIMLABEL[d]}: ${side}`;
  });
  return lines.join('\n');
}

const SYSTEM_COUNSEL = (profile: string) => `${COUNSEL_INSTRUCTIONS}

相談者の測定プロファイル(本人が動きやすい形の参考。断定に使わない):
${profile}

LINEのトークなので絵文字は使わず、落ち着いた言葉で3〜6文程度に収めてください。`;

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

// Vertex AI Gemini 呼び出し。SA未設定/失敗なら null(=呼び出し側が確定文言にフォールバック)。
async function askGemini(saJson: string, system: string, user: string): Promise<string | null> {
  let sa: SA;
  try { sa = JSON.parse(saJson); } catch (_) { return null; }
  const token = await mintToken(sa);
  if (!token) return null;
  const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${VERTEX_REGION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    // thinkingBudget:0 必須 — gemini-2.5系はthinkingが出力予算を食い本文が途切れる(2026-07-23 slope-lp側feelcheckで検出した同型バグの予防)
    generationConfig: { temperature: 0.7, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  try {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { console.error('[hv-llm] vertex', r.status, await r.text().catch(() => '')); return null; }
    const d = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const t = d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    return t || null;
  } catch (e) { console.error('[hv-llm] fetch', e); return null; }
}

// 危機時の受け止め文。創作しない(docs/TEEN_COUNSELING_MODE.md 準拠)。HOTLINE_TEXT側に
// 窓口一覧と「いますぐ危ないときは110/119」が含まれる。
// 窓口文(HOTLINE_TEXT)が『ひとりで抱えなくていい話だと思います』で始まるため、受け止め文では繰り返さない。
const CRISIS_ACK = 'つらいことを書いてくれてありがとうございます。';

/**
 * 自由入力コーチング。hv-coach が処理しなかったテキストのみここに来る。
 * - 危機ワード検知 → Geminiを呼ばずアプリ側の確定文言(受け止め+窓口)を返す(最優先・LLMに委ねない)
 * - プロファイル未連携 → 確定文言でコード送信を促す(LLM不使用)
 * - キー未設定 → 確定文言でメニュー誘導(LLM不使用)
 * - それ以外 → プロファイル注入して Gemini Flash(mode='counsel' なら COUNSEL_INSTRUCTIONS を使用)
 */
export async function handleHiddenValueLlm(
  env: { VERTEX_SA_JSON?: string }, db: D1Database, line: LineClient, replyToken: string, friend: FriendRow, text: string,
): Promise<void> {
  // 危機時ルーティングは最優先。ブロックや会話終了はしない(以降も通常どおり応答を続けられる)。
  if (crisisHint(text)) {
    await line.replyMessage(replyToken, [{ type: 'text', text: `${CRISIS_ACK}\n${HOTLINE_TEXT}` } as never]);
    return;
  }
  const code = savedCode(friend.metadata);
  if (!code) {
    await line.replyMessage(replyToken, [{ type: 'text', text: 'ご相談ありがとうございます。まず診断結果の「ペア相性コード」(HV1で始まる8桁)を送っていただくと、あなたの型に合わせてお答えできます。\nまだの方はこちら → ' + SHINDAN + '/diagnose' } as never]);
    return;
  }
  const sa = env.VERTEX_SA_JSON;
  const mode = await getHvMode(db, friend.id);
  const profile = mode === 'counsel' ? counselProfileText(code) : profileText(code);
  if (!profile || !sa) {
    await line.replyMessage(replyToken, [{ type: 'text', text: '下のメニューから「今の私」「次の一歩」を選べます。より詳しい相談機能は準備中です。' } as never]);
    return;
  }
  const system = mode === 'counsel' ? SYSTEM_COUNSEL(profile) : SYSTEM(profile);
  const answer = await askGemini(sa, system, text.slice(0, 500));
  await line.replyMessage(replyToken, [{ type: 'text', text: answer || '少し混み合っているようです。時間をおいて、もう一度お願いします。メニューの「次の一歩」は今すぐ見られます。' } as never]);
}


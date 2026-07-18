// [HIDDEN VALUE] LINE内会話診断(簡易版・各軸1問=8問)。web往復なしでその場で8軸コード発行。
// 制御=クイックリプライ(postback)なので LLM 不使用。フル30問はweb(精度が必要な人向け)。
import type { LineClient } from '@line-crm/line-sdk';
import { typeCardFlex, decodeHvCode } from './hv-coach.js';

const AXES = ['COM', 'DEC', 'EMO', 'SOC', 'THK', 'VAL', 'GRW', 'STR'] as const;
type Axis = (typeof AXES)[number];

// compass.js の各軸代表1問(dist/compass.js から抽出・2026-07-19)。選択肢 v:1-4 がそのまま軸値。
const Q: Record<Axis, { q: string; c: { v: number; t: string }[] }> = {
  COM: { q: '仕事で「説明がうまい」と言われるとしたら、その理由は？', c: [
    { v: 1, t: '順序立てて、漏れなく話すから' }, { v: 2, t: '要点を相手に合わせて絞るから' },
    { v: 3, t: '会話の流れで自然に伝えるから' }, { v: 4, t: 'たとえ話や感覚で腹落ちさせるから' }] },
  DEC: { q: 'ランチの店選びからキャリアの決断まで——あなたの「決め方」に共通するのは？', c: [
    { v: 1, t: '選択肢を並べてじっくり比較する' }, { v: 2, t: '詳しい人・信頼できる情報を当たる' },
    { v: 3, t: 'まず決めて、動きながら直す' }, { v: 4, t: '直感で「これ」と決める' }] },
  EMO: { q: '強い感情が動いたとき、あなたは？', c: [
    { v: 1, t: '内側で静かに深く受け止める' }, { v: 2, t: '少し時間をおいて整理する' },
    { v: 3, t: '親しい人には素直に出す' }, { v: 4, t: 'その場で率直に表現する' }] },
  SOC: { q: '人との関わり方で、あなたに近いのは？', c: [
    { v: 1, t: '少数と深く、誠実な距離で' }, { v: 2, t: '信頼できる範囲を大事にする' },
    { v: 3, t: '状況で広げたり狭めたり' }, { v: 4, t: '広く開かれた関わりを好む' }] },
  THK: { q: '難しい問題に向き合うとき、まず？', c: [
    { v: 1, t: '本質を一点まで掘り下げる' }, { v: 2, t: '原因を順に切り分ける' },
    { v: 3, t: '全体像を掴んでから動く' }, { v: 4, t: '全体の空気・流れを感じ取る' }] },
  VAL: { q: '仕事で大事にしたいのは、どちらかと言えば？', c: [
    { v: 1, t: '信念や筋を通すこと' }, { v: 2, t: '一貫性を保つこと' },
    { v: 3, t: '現実的に前へ進めること' }, { v: 4, t: '結果を出して動かすこと' }] },
  GRW: { q: '成長したいと思うとき、惹かれるのは？', c: [
    { v: 1, t: '一つの専門を深く究める' }, { v: 2, t: '得意分野を強くする' },
    { v: 3, t: '隣の領域にも広げる' }, { v: 4, t: '新しいことに広く挑戦する' }] },
  STR: { q: '困難やトラブルに直面したとき、あなたは？', c: [
    { v: 1, t: '冷静に状況を立て直す' }, { v: 2, t: '落ち着いて手順を踏む' },
    { v: 3, t: '前を向いて動き出す' }, { v: 4, t: '勢いで突破する' }] },
};

interface QuizState { i: number; ans: Partial<Record<Axis, number>> }
interface FriendRow { id: string; metadata: string | null }

function meta(m: string | null): Record<string, unknown> { if (!m) return {}; try { return JSON.parse(m) as Record<string, unknown>; } catch (_) { return {}; } }

function questionMessage(i: number) {
  const ax = AXES[i];
  const q = Q[ax];
  return {
    type: 'text',
    text: `【${i + 1}/8】${q.q}`,
    quickReply: {
      items: q.c.map((c) => ({
        type: 'action',
        action: { type: 'postback', label: c.t.length > 20 ? c.t.slice(0, 19) + '…' : c.t, data: `hvq=${ax}:${c.v}`, displayText: c.t },
      })),
    },
  };
}

// 診断開始 (「診断」「LINEで診断」などで呼ばれる)
export async function startQuiz(db: D1Database, line: LineClient, replyToken: string, friend: FriendRow): Promise<void> {
  const m = meta(friend.metadata);
  m.hv_quiz = { i: 0, ans: {} } as QuizState;
  await db.prepare('UPDATE friends SET metadata = ? WHERE id = ?').bind(JSON.stringify(m), friend.id).run();
  await line.replyMessage(replyToken, [
    { type: 'text', text: 'LINEでサクッと診断します（8問・約1分）。直感で選んでください。\n※簡易版です。じっくり測るなら約5分のweb版(メニュー右下「もう一度測る」)へ。' } as never,
    questionMessage(0) as never,
  ]);
}

// postback(hvq=...) を処理。処理したら true。
export async function handleQuizPostback(db: D1Database, line: LineClient, replyToken: string, friend: FriendRow, data: string): Promise<boolean> {
  const mm = data.match(/^hvq=([A-Z]+):(\d)$/);
  if (!mm) return false;
  const ax = mm[1] as Axis;
  const val = parseInt(mm[2], 10);
  const m = meta(friend.metadata);
  const st = (m.hv_quiz as QuizState) || { i: 0, ans: {} };
  st.ans[ax] = val;
  st.i = Math.min(st.i + 1, 8);
  m.hv_quiz = st;

  if (st.i < 8 && !AXES.slice(0, st.i).every((a) => st.ans[a] != null)) {
    // まだ未回答の軸がある場合は順番に(通常はi順で埋まる)
  }
  if (st.i >= 8 || AXES.every((a) => st.ans[a] != null)) {
    // 完成 → 8軸コード生成
    const code = 'HV1' + AXES.map((a) => {
      const v = st.ans[a] ?? 2.5; // 未回答は中庸
      return Math.max(0, Math.min(12, Math.round((v - 1) * 4))).toString(13);
    }).join('').toUpperCase();
    const dims = decodeHvCode(code);
    delete m.hv_quiz;
    m.hv_code = code; m.hv_dims = dims; m.hv_linked_at = new Date().toISOString(); m.hv_source = 'line_quiz';
    await db.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(m), new Date(Date.now() + 9 * 3600_000).toISOString(), friend.id).run();
    await line.replyMessage(replyToken, [
      { type: 'text', text: '診断が完了しました。あなたの型カードです。' } as never,
      typeCardFlex(code, dims!) as never,
    ]);
    return true;
  }
  await db.prepare('UPDATE friends SET metadata = ? WHERE id = ?').bind(JSON.stringify(m), friend.id).run();
  await line.replyMessage(replyToken, [questionMessage(st.i) as never]);
  return true;
}

export function isQuizTrigger(text: string): boolean {
  const t = (text || '').trim();
  return t === '診断' || t === 'LINEで診断' || t === '診断する' || t === 'LINEで診断する';
}

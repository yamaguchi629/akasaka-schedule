const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const lineApi = axios.create({
  baseURL: 'https://api.line.me',
  headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}` },
});

function verifySignature(body, signature) {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

async function getProfile(userId) {
  const res = await lineApi.get(`/v2/bot/profile/${userId}`);
  return res.data;
}

async function reply(replyToken, text) {
  await lineApi.post('/v2/bot/message/reply', {
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

function parseDateTime(text) {
  const pattern =
    /(\d{1,2})[\/月](\d{1,2})[日]?\s*(\d{1,2})[:時](\d{0,2})\s*(?:〜|~|から|-|ー)\s*(\d{1,2})[:時](\d{0,2})/;
  const m = text.match(pattern);
  if (!m) return null;

  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJST = new Date(Date.now() + jstOffset);

  let year = nowJST.getUTCFullYear();
  const month = parseInt(m[1]) - 1;
  const day = parseInt(m[2]);
  const startHour = parseInt(m[3]);
  const startMin = parseInt(m[4] || '0') || 0;
  const endHour = parseInt(m[5]);
  const endMin = parseInt(m[6] || '0') || 0;

  const testMs = Date.UTC(year, month, day);
  const yesterdayMs = Date.now() - 24 * 60 * 60 * 1000;
  if (testMs < yesterdayMs) year += 1;

  const startTime = new Date(Date.UTC(year, month, day, startHour - 9, startMin));
  const endTime = new Date(Date.UTC(year, month, day, endHour - 9, endMin));

  // 時刻パターンの後ろにある文字をメモとして取得
  const memo = text.slice(m.index + m[0].length).trim();

  return { startTime, endTime, month: month + 1, day, startHour, startMin, endHour, endMin, memo };
}

function fmt(h, m) {
  return `${h}:${String(m).padStart(2, '0')}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers['x-line-signature'];
  if (!verifySignature(event.body, signature)) {
    console.error('Signature verification failed');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let parsed_body;
  try {
    parsed_body = JSON.parse(event.body);
  } catch (e) {
    console.error('JSON parse error:', e);
    return { statusCode: 400, body: 'Bad Request' };
  }

  const { events } = parsed_body;

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message.type !== 'text') continue;

    const text = ev.message.text.trim();
    const userId = ev.source.userId;
    const replyToken = ev.replyToken;

    let userName = '不明';
    try {
      const profile = await getProfile(userId);
      userName = profile.displayName || '不明';
    } catch (e) {
      console.error('Profile fetch error:', e.message);
    }

    try {
      // ヘルプ
      if (text === 'ヘルプ' || text === '?') {
        await reply(replyToken,
          '【赤坂スペース予約】\n\n' +
          '▶ 予約\n6/2 15:00-17:00\n6月2日 15時〜17時\n\n' +
          '▶ 一覧確認\n「確認」または「一覧」\n\n' +
          '▶ キャンセル\nキャンセル 6/2 15:00-17:00'
        );
        continue;
      }

      // 一覧確認
      if (text.includes('確認') || text.includes('一覧')) {
        const now = new Date();
        const { data } = await supabase
          .from('reservations')
          .select('*')
          .gte('end_time', now.toISOString())
          .order('start_time', { ascending: true })
          .limit(10);

        if (!data || data.length === 0) {
          await reply(replyToken, '現在の予約はありません。');
          continue;
        }

        const list = data.map((r) => {
          const s = new Date(new Date(r.start_time).getTime() + 9 * 60 * 60 * 1000);
          const e = new Date(new Date(r.end_time).getTime() + 9 * 60 * 60 * 1000);
          return `${s.getUTCMonth() + 1}/${s.getUTCDate()} ${fmt(s.getUTCHours(), s.getUTCMinutes())}〜${fmt(e.getUTCHours(), e.getUTCMinutes())} ${r.user_name}`;
        });
        await reply(replyToken, '【予約一覧】\n' + list.join('\n'));
        continue;
      }

      // キャンセル
      if (text.includes('キャンセル') || text.includes('削除')) {
        const p = parseDateTime(text);
        if (!p) {
          await reply(replyToken, '日時が読み取れませんでした。\n例: キャンセル 6/2 15:00-17:00');
          continue;
        }
        const { error, count } = await supabase
          .from('reservations')
          .delete({ count: 'exact' })
          .eq('line_user_id', userId)
          .eq('start_time', p.startTime.toISOString());

        if (!error && count > 0) {
          await reply(replyToken, `${p.month}/${p.day} ${fmt(p.startHour, p.startMin)}〜${fmt(p.endHour, p.endMin)} の予約をキャンセルしました。`);
        } else {
          await reply(replyToken, '該当する予約が見つかりませんでした。');
        }
        continue;
      }

      // 新規予約
      const p = parseDateTime(text);
      if (!p) {
        await reply(replyToken,
          '形式が読み取れませんでした。\n例: 6/2 15:00-17:00\n「ヘルプ」で使い方を確認できます。'
        );
        continue;
      }

      // 重複チェック
      const { data: conflicts } = await supabase
        .from('reservations')
        .select('*')
        .lt('start_time', p.endTime.toISOString())
        .gt('end_time', p.startTime.toISOString());

      if (conflicts && conflicts.length > 0) {
        const c = conflicts[0];
        const s = new Date(new Date(c.start_time).getTime() + 9 * 60 * 60 * 1000);
        const e = new Date(new Date(c.end_time).getTime() + 9 * 60 * 60 * 1000);
        await reply(replyToken,
          `その時間帯はすでに ${c.user_name} さんが予約しています。\n` +
          `（${s.getUTCMonth() + 1}/${s.getUTCDate()} ${fmt(s.getUTCHours(), s.getUTCMinutes())}〜${fmt(e.getUTCHours(), e.getUTCMinutes())}）`
        );
        continue;
      }

      const { error } = await supabase.from('reservations').insert({
        user_name: userName,
        line_user_id: userId,
        start_time: p.startTime.toISOString(),
        end_time: p.endTime.toISOString(),
        memo: p.memo || '',
      });

      if (!error) {
        const memoText = p.memo ? `\nメモ: ${p.memo}` : '';
        await reply(replyToken,
          `✅ 予約完了！\n${p.month}/${p.day} ${fmt(p.startHour, p.startMin)}〜${fmt(p.endHour, p.endMin)}\n${userName} さん${memoText}`
        );
      } else {
        console.error('Supabase insert error:', error);
        await reply(replyToken, '保存に失敗しました。もう一度お試しください。');
      }

    } catch (e) {
      console.error('Handler error:', e.message);
      try {
        await reply(replyToken, 'エラーが発生しました。もう一度お試しください。');
      } catch (_) {}
    }
  }

  return { statusCode: 200, body: 'OK' };
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { id, start_time, end_time, memo } = JSON.parse(event.body || '{}');
  if (!id || !start_time || !end_time) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id, start_time, end_time are required' }) };
  }

  // 重複チェック（自分以外）
  const { data: conflicts } = await supabase
    .from('reservations')
    .select('*')
    .neq('id', id)
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  if (conflicts && conflicts.length > 0) {
    const c = conflicts[0];
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `${c.user_name}さんの予約と重複しています` }),
    };
  }

  const { error } = await supabase
    .from('reservations')
    .update({ start_time, end_time, memo: memo || '' })
    .eq('id', id);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true }),
  };
};

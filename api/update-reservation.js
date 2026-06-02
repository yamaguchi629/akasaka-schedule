const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { id, start_time, end_time, memo } = req.body || {};
  if (!id || !start_time || !end_time) {
    return res.status(400).json({ error: 'id, start_time, end_time are required' });
  }

  const { data: conflicts } = await supabase
    .from('reservations')
    .select('*')
    .neq('id', id)
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  if (conflicts && conflicts.length > 0) {
    const c = conflicts[0];
    return res.status(409).json({ error: `${c.user_name}さんの予約と重複しています` });
  }

  const { error } = await supabase
    .from('reservations')
    .update({ start_time, end_time, memo: memo || '' })
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  const { start, end } = req.query || {};

  let query = supabase
    .from('reservations')
    .select('id, user_name, start_time, end_time, memo')
    .order('start_time', { ascending: true });

  if (start) query = query.gte('start_time', start);
  if (end) query = query.lte('start_time', end);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(data);
};

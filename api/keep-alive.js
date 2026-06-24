const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  const { error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('Keep-alive query failed:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, checkedAt: new Date().toISOString() });
};

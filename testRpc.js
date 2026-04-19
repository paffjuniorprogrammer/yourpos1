require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await client.rpc('process_stock_count', {
    p_location_id: '00000000-0000-0000-0000-000000000000',
    p_created_by: '00000000-0000-0000-0000-000000000000', 
    p_notes: 'check',
    p_items: []
  });
  console.log("RPC Error:", error);
}

check();

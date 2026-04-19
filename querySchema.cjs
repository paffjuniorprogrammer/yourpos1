require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('sale_items')
    .select('*')
    .limit(1);
    
  console.log("Sale Items Data:", data);
  console.log("Sale Items Error:", error);

  const { data: pData, error: pError } = await supabase
    .from('purchase_items')
    .select('*')
    .limit(1);
    
  console.log("Purchase Items Data:", pData);
  console.log("Purchase Items Error:", pError);
}

check();

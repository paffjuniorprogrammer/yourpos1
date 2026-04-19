import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log("Checking sale_items...");
  const { data, error } = await supabase
    .from('sale_items')
    .select('quantity, unit_price, line_total, sale_id')
    .order('created_at', { ascending: false })
    .limit(1);
    
  console.log("Sale Items Data:", data);
  if (error) console.log("Sale Items Error:", error);

  console.log("\nChecking purchase_items...");
  const { data: pData, error: pError } = await supabase
    .from('purchase_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
    
  console.log("Purchase Items Data:", pData);
  if (pError) console.log("Purchase Items Error:", pError);
}

check();

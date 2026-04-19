import { createClient } from "@supabase/supabase-js";

const AUTH_USER_ID = "949088d2-f708-425e-9366-44e0cb060b2b"; // User's auth_user_id

async function main() {
  const supabaseUrl = "https://nahjiipswajudvhscbpm.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set");
    console.log("\nTo get your service role key:");
    console.log("1. Go to https://supabase.com/dashboard");
    console.log("2. Select your project (nahjiipswajudvhscbpm)");
    console.log("3. Go to Settings > API");
    console.log("4. Find 'Service Role Key' and copy it");
    console.log("\nThen run: SUPABASE_SERVICE_ROLE_KEY=<your_key> npx tsx make-super-admin.mjs");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Making user a super admin...");

  // 1. Add to platform_admins
  const { error: platformError } = await supabase.rpc("platform_admins_insert", {
    p_auth_user_id: AUTH_USER_ID,
  });

  if (platformError) {
    // Try direct insert
    const { error: insertError } = await supabase.from("platform_admins").insert({
      auth_user_id: AUTH_USER_ID,
      is_active: true,
    });

    if (insertError && !insertError.message.includes("duplicate")) {
      console.error("Error adding to platform_admins:", insertError);
    } else {
      console.log("✓ Added to platform_admins");
    }
  } else {
    console.log("✓ Added to platform_admins");
  }

  // 2. Update user role
  const { error: updateError } = await supabase
    .from("users")
    .update({ role: "admin" })
    .eq("auth_user_id", AUTH_USER_ID);

  if (updateError) {
    console.error("Error updating role:", updateError);
  } else {
    console.log("✓ Updated user role to admin");
  }

  console.log("\nDone!");
  console.log("User is now a super admin/owner of the system.");
}

main();
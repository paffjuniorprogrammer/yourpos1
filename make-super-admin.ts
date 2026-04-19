import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://nahjiipswajudvhscbpm.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function makeSuperAdmin() {
  const authUserId = "949088d2-f708-425e-9366-44e0cb060b2b";
  const email = "paffpro01@gmail.com";

  if (!supabaseServiceKey) {
    console.error("Please provide SUPABASE_SERVICE_ROLE_KEY env variable");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Making user a super admin...");

  // 1. Add to platform_admins
  const { error: platformError } = await supabase.from("platform_admins").insert({
    auth_user_id: authUserId,
    is_active: true,
  });

  if (platformError && !platformError.message.includes("duplicate")) {
    console.error("Error adding to platform_admins:", platformError);
  } else {
    console.log("✓ Added to platform_admins");
  }

  // 2. Find and update user record
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("id, auth_user_id, email, role, business_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (userError) {
    console.error("Error finding user:", userError);
    return;
  }

  if (userData) {
    console.log("Found user record:", userData);
    
    // Update role to admin
    const { error: updateError } = await supabase
      .from("users")
      .update({ role: "admin" as any })
      .eq("id", userData.id);

    if (updateError) {
      console.error("Error updating role:", updateError);
    } else {
      console.log("✓ Updated user role to admin");
    }
  } else {
    console.log("User record not found - will be created on next login");
    console.log("Note: The user will get admin role automatically upon login");
  }

  console.log("\nDone! The user should now have super admin privileges.");
}

makeSuperAdmin();
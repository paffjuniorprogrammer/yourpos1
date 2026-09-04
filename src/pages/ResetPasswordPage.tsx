import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (password.length < 6) return setMessage("Password must be at least 6 characters.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMessage(error.message);
    setMessage("Password updated. You can now log in.");
    setTimeout(() => navigate("/login"), 1200);
  };
  return <main className="mx-auto mt-20 max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-black">Set new password</h1><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="mt-6 w-full rounded-xl border p-3" /><button onClick={() => void submit()} className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-bold text-white">Update password</button>{message && <p className="mt-4 text-sm">{message}</p>}</main>;
}

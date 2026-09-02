import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft, LockKeyhole, Eye, EyeOff,
  CheckCircle2, Sparkles, MessageCircle, Phone, Rocket
} from "lucide-react";
import { SEO } from "../components/seo/SEO";

const WHATSAPP_NUMBER = "250793063512";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authConfigured, signIn, startDemoMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  function formatLoginError(err: unknown): string {
    if (!err) return "Ntibyakunze kwinjira. Ongera ugerageze.";
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (lower.includes("invalid login credentials") || lower.includes("invalid_grant") || lower.includes("invalid password")) {
      return "⚠️ Email cyangwa ijambobanga (password) si byo. Ongera ugerageze.";
    }
    if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("networkerror") || lower.includes("timeout")) {
      return "⚠️ Nta murongo wa interineti ufite. Reba interineti yawe wongere ugerageze.";
    }
    if (lower.includes("email not confirmed")) {
      return "⚠️ Email yawe ntiyemejwe. Banza uyemeze mbere yo kwinjira.";
    }
    if (lower.includes("too many requests") || lower.includes("rate limit")) {
      return "⚠️ Wagerageje kenshi. Tegereza umunota umwe wongere.";
    }
    if (lower.includes("user not found") || lower.includes("no profile")) {
      return "⚠️ Nta konti ibonetse kuri iyi email. Vugisha umuyobozi wawe.";
    }
    return msg;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const userProfile = await signIn(email, password);
      
      if (!userProfile) {
        throw new Error("Ntibyakunze kwinjira. Reba imyirondoro yawe.");
      }

      if (userProfile.role === 'super_admin') {
        navigate("/super-admin", { replace: true });
      } else {
        navigate(redirectTo ?? "/dashboard", { replace: true });
      }
    } catch (err) {
      setError(formatLoginError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const whatsappHelpMsg = `Murakaza! Nshaka ubufasha kuri UMUCURUZI POS.`;
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappHelpMsg)}`;

  return (
    <div className="min-h-screen bg-slate-100/70 px-4 py-6 sm:py-10 flex flex-col justify-center">
      <SEO title="Kwinjira | UMUCURUZI POS" description="Injira muri UMUCURUZI POS ucunge ubucuruzi bwawe." canonical="/login" noIndex />
      
      {/* Top Header */}
      <div className="mx-auto mb-6 flex w-full max-w-5xl items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left group">
          <img src="/pos-logo.jpg" alt="UMUCURUZI POS" className="h-11 w-11 rounded-2xl object-cover shadow-md transition group-hover:scale-105" />
          <div>
            <p className="text-base font-black text-ink tracking-tight">UMUCURUZI POS</p>
            <p className="text-xs font-semibold text-slate-400">P &amp; D Digital Solution</p>
          </div>
        </button>
        <button 
          onClick={() => navigate("/")} 
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 shadow-sm border border-slate-200 transition hover:bg-slate-50 hover:text-brand-600"
        >
          <ArrowLeft size={14} /> Ahabanza
        </button>
      </div>

      {/* Main Grid Card */}
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 lg:grid-cols-[1.1fr_0.9fr]">
        
        {/* Left Side: Attractive Kinyarwanda Subscription Banner */}
        <section className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-8 sm:p-12 text-white flex flex-col justify-between overflow-hidden">
          {/* Subtle Background Glows */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl" />

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/20 border border-brand-400/30 px-3.5 py-1.5 text-xs font-black uppercase tracking-widest text-brand-300">
              <Sparkles size={14} className="text-amber-400" />
              Sisitemu Yizewe y'Ubucuruzi
            </div>

            <div>
              <h1 className="text-3xl font-black leading-tight sm:text-4xl">
                Cunga Ubucuruzi Bwawe <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-sky-300 to-emerald-400">
                  Mu Buryo Bworoshye
                </span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 font-medium">
                Genzura ibicuruzwa, kora inyemezabwishyu vuba, kurikirana inyungu n'amadeni yose ahantu hamwe.
              </p>
            </div>

            {/* Attractive Features Showcase */}
            <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/80 p-5 shadow-xl backdrop-blur-sm space-y-3">
              <p className="text-sm font-bold leading-relaxed text-slate-100">
                Manage your entire business in one powerful platform. Track sales, inventory, customers, and profits with ease. Increase productivity and grow your business faster.
              </p>

              {/* Power Features */}
              <ul className="space-y-2.5 pt-2">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-200">Complete Sales & POS Management with real-time receipts</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-200">Smart Stock Management & Inventory Tracking</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-200">Bar & Guesthouse Module for rooms & tables</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-200">Detailed Reports: Sales, VAT, Debts & Customer History</span>
                </li>
              </ul>

              {/* Call-to-Action */}
              <div className="pt-2">
                <p className="text-[11px] font-bold text-slate-400 mb-2.5">
                  Get started today. Try the demo or contact us for more.
                </p>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98]"
                >
                  <MessageCircle size={14} /> Contact us on WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Quick Help Footer */}
          <div className="relative z-10 mt-6 pt-5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>Ukeneye ubufasha?</span>
            <a href="tel:+250793063512" className="flex items-center gap-1.5 font-bold text-white hover:text-brand-300">
              <Phone size={13} /> 0793063512
            </a>
          </div>
        </section>

        {/* Right Side: Clean Login Form */}
        <section className="p-8 sm:p-12 flex flex-col justify-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-700">
              <LockKeyhole size={13} /> Kwinjira
            </div>
            <h2 className="mt-3 text-2xl font-black text-ink sm:text-3xl">Murakaza Neza!</h2>
            <p className="mt-1 text-sm text-slate-500">
              Injiza imyirondoro yawe kugira ngo utangire akazi.
            </p>
          </div>

          {!authConfigured ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
              Shyiramo `VITE_SUPABASE_URL` na `VITE_SUPABASE_ANON_KEY` kugira ngo ukoreshe sisitemu.
            </div>
          ) : null}

          {/* Sign In Form */}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border-none bg-transparent text-sm font-bold outline-none text-ink"
                placeholder="urugero@gmail.com"
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-400">
                Ijambobanga (Password)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border-none bg-transparent text-sm font-bold outline-none text-ink"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="shrink-0 text-slate-400 hover:text-slate-600 transition p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hisha ijambobanga" : "Erekana ijambobanga"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-700 animate-shake">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!authConfigured || submitting}
              className="w-full rounded-2xl bg-slate-950 hover:bg-black px-4 py-4 text-sm font-black text-white shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Kwinjira biracyakora..." : "Injira muri Sisitemu"}
            </button>
          </form>

          {/* Interactive Demo Sandbox Button */}
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 text-center">
              Ushaka kubanza kureba uko ikora?
            </p>
            <button
              type="button"
              onClick={() => {
                startDemoMode();
                navigate("/dashboard");
              }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-brand-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 px-4 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-purple-200 transition-all active:scale-[0.98]"
            >
              <Rocket size={16} />
              Gerageza Demo ku Buntu (Live Demo)
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}


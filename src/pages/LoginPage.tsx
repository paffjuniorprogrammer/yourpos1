import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { authConfigured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  function formatLoginError(err: unknown): string {
    if (!err) return t('login.error_unable', { defaultValue: 'Unable to sign in. Please try again.' });
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (lower.includes("invalid login credentials") || lower.includes("invalid_grant") || lower.includes("invalid password")) {
      return "⚠️ Incorrect email or password. Please check your credentials and try again.";
    }
    if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("networkerror") || lower.includes("timeout")) {
      return "⚠️ Unable to connect to the server. Please check your internet connection and try again.";
    }
    if (lower.includes("email not confirmed")) {
      return "⚠️ Your email has not been confirmed yet. Please verify your email before signing in.";
    }
    if (lower.includes("too many requests") || lower.includes("rate limit")) {
      return "⚠️ Too many sign-in attempts. Please wait 1 minute and try again.";
    }
    if (lower.includes("user not found") || lower.includes("no profile")) {
      return "⚠️ No cashier or user account found for this email. Please contact your manager.";
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
        throw new Error(t('login.error_failed', { defaultValue: 'Login failed. Please check your credentials.' }));
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto mb-6 flex max-w-5xl items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
          <img src="/pos-logo.jpg" alt="UMUCURUZI POS" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          <div><p className="font-black text-ink">UMUCURUZI POS</p><p className="text-xs font-semibold text-slate-400">P &amp; D Digital Solution</p></div>
        </button>
        <button onClick={() => navigate("/")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-brand-600"><ArrowLeft size={16} /> Back to home</button>
      </div>
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative bg-slate-950 px-8 py-10 flex flex-col justify-center text-white sm:px-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-400">
            {t('login.brand')}
          </p>
          <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            The faster way to <br />run your shop.
          </h1>
          <div className="mt-12 h-1 w-20 bg-brand-500 rounded-full"></div>
          <p className="mt-8 max-w-sm text-lg font-medium text-slate-400 leading-relaxed">
            {t('login.subtitle')}
          </p>
        </section>

        <section className="px-8 py-10 sm:px-12">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-brand-700">
            <LockKeyhole size={13} /> {t('login.secure_login')}
          </p>
          <h2 className="mt-5 text-3xl font-black text-ink">{t('login.welcome')}</h2>
          <p className="mt-3 text-sm text-slate-500">
            {t('login.welcome_desc')}
          </p>
          <p className="mt-4 cursor-pointer text-sm font-semibold text-brand-600 hover:underline" onClick={() => navigate('/home')}>
            Learn more about our subscription and how this POS helps your business.
          </p>

          {!authConfigured ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your local env file to enable sign-in.
            </div>
          ) : null}

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-brand-300 transition-colors">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t('login.email')}
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border-none bg-transparent text-sm font-semibold outline-none text-ink"
                placeholder="admin@pos.com"
              />
            </label>
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-brand-300 transition-colors">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t('login.password')}
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border-none bg-transparent text-sm font-semibold outline-none text-ink"
                placeholder="••••••••"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 animate-shake">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!authConfigured || submitting}
              className="w-full rounded-xl bg-slate-950 px-4 py-4 text-sm font-black text-white shadow-xl transition hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 active:scale-[0.98]"
            >
              {submitting ? t('login.entering') : t('login.sign_in')}
            </button>
          </form>

          <footer className="mt-12 pt-8 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center">
              {t('login.assistance')}
            </p>
            <p className="mt-3 text-center text-sm font-bold text-ink">
              {t('login.assistance_desc')} <a href="tel:+250793063512" className="text-brand-600 hover:underline">+250 793 063 512</a>
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}

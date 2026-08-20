import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../components/seo/SEO";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  Monitor,
  PackagePlus,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Zap,
  TrendingUp,
  Wallet,
  Clock3,
  Star,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
} from "lucide-react";

const WHATSAPP_NUMBER = "250793063512";

// ─── Feature screens data ─────────────────────────────────────────────────────
const screens = [
  {
    id: "dashboard",
    label: "Dashboard",
    badge: "Business Overview",
    icon: BarChart3,
    color: "brand",
    title: "See your whole business at a glance",
    description:
      "Every morning, open the dashboard and instantly know: today's sales, total revenue, what customers owe you, what you owe suppliers, and stock alerts. No digging through papers.",
    highlights: [
      "Daily & monthly revenue totals",
      "VAT summary (Output, Input, Payable)",
      "Weekly sales trend chart",
      "Recent transactions list",
      "Stock alert notifications",
    ],
    image: "/screenshots/dashboard.png",
  },
  {
    id: "pos",
    label: "POS Checkout",
    badge: "Point of Sale",
    icon: ShoppingCart,
    color: "slate",
    title: "Sell faster with a cashier-first checkout",
    description:
      "Your staff scan or click products, see the cart update in real time, apply discounts, collect payment by Cash, MoMo, Card, or Credit — then print a receipt in seconds.",
    highlights: [
      "Product search + barcode scanning",
      "Instant cart with quantity controls",
      "Per-item & order discounts",
      "Tax (18% VAT) auto-calculated",
      "One-click Checkout button",
    ],
    image: "/screenshots/pos.png",
  },
  {
    id: "products",
    label: "Products",
    badge: "Inventory Management",
    icon: Boxes,
    color: "emerald",
    title: "Manage every product, price, and stock level",
    description:
      "Add products with cost price, auto-calculated selling price, barcode, category, and stock level. See which items are low or out-of-stock before they become a problem.",
    highlights: [
      "Cost & selling price with profit margin",
      "Category filtering",
      "Stock level with color alerts (red = out)",
      "Export, Template & Import tools",
      "Multi-branch stock view",
    ],
    image: "/screenshots/products.png",
  },
  {
    id: "sales",
    label: "Sales",
    badge: "Sales Management",
    icon: Receipt,
    color: "purple",
    title: "Track every sale, return, and payment status",
    description:
      "Full history of every sale made by every cashier. Filter by customer, cashier, or date. See who paid, who owes, and print or reprint receipts anytime.",
    highlights: [
      "Paid, Partial & Unpaid status badges",
      "Filter by customer, cashier & date",
      "Receipt reprint from any sale",
      "Sales returns support",
      "28+ sales tracked per page",
    ],
    image: "/screenshots/sales.png",
  },
  {
    id: "purchases",
    label: "Purchases",
    badge: "Supplier Orders",
    icon: Truck,
    color: "amber",
    title: "Track what you buy and what you owe suppliers",
    description:
      "Record every purchase order with supplier, amount, payment status, and delivery status. Know exactly how much is Due, Partially Paid, or fully Paid — and when stock arrived.",
    highlights: [
      "Purchase orders with PO numbers",
      "Payment tracking (Due / Partially Paid / Paid)",
      "Delivery status (Received / Pending)",
      "Supplier management",
      "Multi-branch location tracking",
    ],
    image: "/screenshots/purchases.png",
  },
];

const stats = [
  { value: "64,900", unit: "RWF", label: "Sales in one day", icon: TrendingUp, color: "text-emerald-600" },
  { value: "125,700", unit: "RWF", label: "Revenue this month", icon: Wallet, color: "text-brand-600" },
  { value: "28+", unit: "", label: "Sales tracked", icon: Receipt, color: "text-purple-600" },
  { value: "3", unit: "Languages", label: "EN · RW · FR", icon: Globe2, color: "text-amber-600" },
];

const featuresList = [
  { icon: Store, title: "POS Checkout", text: "Fast cashier screen with product search, barcode scan, discounts, and multi-payment types." },
  { icon: Boxes, title: "Inventory Control", text: "Products, stock counts, stock alerts, transfers, and multi-branch visibility." },
  { icon: Truck, title: "Purchases & Suppliers", text: "Purchase orders, supplier payments, delivery tracking, and supplier credit." },
  { icon: Users, title: "Customer Credit", text: "Customer accounts with credit limits, discount settings, and unpaid balance tracking." },
  { icon: BarChart3, title: "Reports & VAT", text: "Sales reports, profit reports, VAT summary, and Z-Reports for shift closures." },
  { icon: ShieldCheck, title: "Subscription Guard", text: "Subscription control ensures only active paying businesses can access the system." },
  { icon: ScanLine, title: "Barcode Scanning", text: "Built-in barcode scanner support for fast product lookup at the counter." },
  { icon: PackagePlus, title: "Requisitions", text: "Staff can request stock internally and admins approve or reject each request." },
];

const colorMap: Record<string, { badge: string; ring: string; dot: string }> = {
  brand:   { badge: "bg-brand-50 text-brand-700 border-brand-100",   ring: "ring-brand-200",   dot: "bg-brand-500" },
  slate:   { badge: "bg-slate-800 text-blue-200 border-slate-700",   ring: "ring-slate-700",   dot: "bg-blue-400" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 border-emerald-100", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  purple:  { badge: "bg-purple-50 text-purple-700 border-purple-100", ring: "ring-purple-200",  dot: "bg-purple-500" },
  amber:   { badge: "bg-amber-50 text-amber-700 border-amber-100",   ring: "ring-amber-200",   dot: "bg-amber-500" },
};

export function HomePage() {
  const navigate = useNavigate();
  const [activeScreen, setActiveScreen] = useState(0);
  const [requestSent, setRequestSent] = useState(false);
  const active = screens[activeScreen];
  const colors = colorMap[active.color];

  useEffect(() => {
    const timer = window.setInterval(() => setActiveScreen((current) => (current + 1) % screens.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  function showRequestForm() {
    document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = [
      "Hello P & D Digital Solution, I would like to use UMUCURUZI POS.", "",
      `Name: ${form.get("name")}`,
      `Contact: ${form.get("contact")}`,
      `Business name: ${form.get("businessName")}`,
      `Location: ${form.get("location")}`,
      `Email: ${form.get("email")}`,
    ].join("\n");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setRequestSent(true);
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-ink">
      {/* ── SEO ──────────────────────────────────────────────────────────────── */}
      <SEO
        title="Smart Point of Sale for Rwanda"
        description="UMUCURUZI POS is a modern Point of Sale system for businesses in Rwanda. Manage sales, inventory, purchases, VAT reports, customers, and suppliers — all in one place."
        canonical="/"
      >
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "UMUCURUZI POS",
          "url": "https://umucuruzipos.vercel.app/",
          "logo": "https://umucuruzipos.vercel.app/pos-logo.jpg",
          "description": "Modern Point of Sale system for businesses in Rwanda. Manage sales, inventory, purchases, VAT reports, customers, and multi-store transfers.",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web Browser",
          "browserRequirements": "Requires JavaScript",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "RWF",
            "description": "Contact for subscription pricing"
          },
          "featureList": [
            "Point of Sale (POS) checkout",
            "Inventory & stock management",
            "Sales & purchase tracking",
            "VAT report generation (18%)",
            "Customer & supplier management",
            "Multi-store transfers",
            "Barcode scanning support",
            "MoMo, Cash & Card payment modes"
          ],
          "areaServed": {
            "@type": "Country",
            "name": "Rwanda"
          },
          "provider": {
            "@type": "Organization",
            "name": "P & D Digital Solution",
            "url": "https://umucuruzipos.vercel.app/"
          }
        })}</script>
      </SEO>

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
            <img src="/pos-logo.jpg" alt="POS logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ink">UMUCURUZI POS</p>
              <p className="text-[11px] font-semibold text-slate-400">Sales · Stock · Reports</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={showRequestForm}
              className="hidden text-sm font-bold text-slate-600 transition hover:text-brand-600 sm:inline-flex"
            >
              Request access
            </button>
            <button
              onClick={() => navigate("/subscription")}
              className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 sm:inline-flex"
            >
              Pricing
            </button>
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Login <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>

      <main>

        {/* ── HERO ─────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brand-700 shadow-sm">
              <Sparkles size={13} /> Complete POS System for Rwandan Shops
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-black tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Sell smarter. Track everything.{" "}
              <span className="bg-gradient-to-r from-brand-600 to-sky-500 bg-clip-text text-transparent">
                Grow your shop.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-500">
              One system for your cashier, your warehouse, your accountant, and your manager.
              Works in Kinyarwanda, English, and French.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={showRequestForm}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-7 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-700"
              >
                Request the system <ArrowRight size={17} />
              </button>
              <button
                onClick={() => navigate("/subscription")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                View subscription plans <CreditCard size={17} />
              </button>
            </div>
            {/* trust row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-slate-500">
              {[
                { icon: Zap, text: "Fast checkout" },
                { icon: Globe2, text: "3 Languages" },
                { icon: Clock3, text: "Shift reports" },
                { icon: Headphones, text: "Locally supported" },
                { icon: Monitor, text: "Works on any screen" },
              ].map((t) => (
                <span key={t.text} className="flex items-center gap-1.5">
                  <t.icon size={13} className="text-brand-500" /> {t.text}
                </span>
              ))}
            </div>
          </div>

          {/* hero screenshot — dashboard */}
          <div className="relative mx-auto mt-14 max-w-5xl">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-100 via-sky-100 to-slate-100 blur-2xl opacity-60" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 shadow-[0_32px_100px_rgba(15,23,42,0.15)]">
              <img
                src="/screenshots/dashboard.png"
                alt="UMUCURUZI POS Dashboard"
                className="w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 left-8 flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-lg border border-slate-100">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-slate-700">Live dashboard — all branches synced</span>
            </div>
          </div>
        </section>

        {/* ── STATS BAR ────────────────────────────────────────────────────────── */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-100 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <s.icon size={18} className={s.color} />
                <p className={`mt-1 text-2xl font-black ${s.color}`}>
                  {s.value}<span className="ml-1 text-base">{s.unit}</span>
                </p>
                <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── SCREENSHOT SHOWCASE ──────────────────────────────────────────────── */}
        <section id="request-access" className="border-y border-slate-200 bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-5xl gap-10 rounded-[2rem] bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:p-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-700">
                <MessageCircle size={14} /> WhatsApp request
              </span>
              <h2 className="mt-5 text-3xl font-black text-ink">Ready to run your business with UMUCURUZI POS?</h2>
              <p className="mt-4 leading-7 text-slate-500">Tell us a little about your business. Your request opens in WhatsApp so the P &amp; D Digital Solution team can respond quickly.</p>
              <div className="mt-8 rounded-2xl bg-slate-950 p-5 text-sm text-slate-300">
                <p className="font-bold text-white">What happens next?</p>
                <p className="mt-2 leading-6">We receive your details on WhatsApp, discuss your shop needs, then help you get set up.</p>
              </div>
            </div>
            <form onSubmit={handleRequest} className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">Your name</span><input name="name" required autoComplete="name" placeholder="Full name" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" /></label>
              <label><span className="mb-1.5 block text-sm font-bold text-slate-700">Contact number</span><input name="contact" required autoComplete="tel" inputMode="tel" placeholder="e.g. +250 ..." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" /></label>
              <label><span className="mb-1.5 block text-sm font-bold text-slate-700">Business name</span><input name="businessName" required autoComplete="organization" placeholder="Your business" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" /></label>
              <label><span className="mb-1.5 block text-sm font-bold text-slate-700">Location</span><input name="location" required autoComplete="address-level2" placeholder="Town / district" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" /></label>
              <label><span className="mb-1.5 block text-sm font-bold text-slate-700">Email address</span><input name="email" required type="email" autoComplete="email" placeholder="you@business.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" /></label>
              <div className="sm:col-span-2">
                <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-[#20bd5a]">Send request on WhatsApp <MessageCircle size={18} /></button>
                {requestSent ? <p className="mt-3 text-center text-sm font-semibold text-emerald-700">WhatsApp has opened with your request ready to send.</p> : null}
              </div>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-600">See it in action</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black text-ink sm:text-4xl">
              Real screenshots from the real system
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
              Every screen you see here is what your team will use every day. No mockups — this is the actual software.
            </p>
          </div>

          {/* Auto-advancing screenshot carousel controls */}
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Show previous screen"
              onClick={() => setActiveScreen((current) => (current - 1 + screens.length) % screens.length)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-600"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-wrap justify-center gap-2">
            {screens.map((s, i) => {
              const c = colorMap[s.color];
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveScreen(i)}
                  className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                    activeScreen === i
                      ? `border ${c.badge} shadow-sm`
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <s.icon size={15} />
                  {s.label}
                </button>
              );
            })}
            </div>
            <button
              type="button"
              aria-label="Show next screen"
              onClick={() => setActiveScreen((current) => (current + 1) % screens.length)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-600"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="mt-5 flex justify-center gap-2" aria-label="Screenshot carousel position">
            {screens.map((screen, index) => (
              <button
                key={screen.id}
                type="button"
                aria-label={`Show ${screen.label}`}
                onClick={() => setActiveScreen(index)}
                className={`h-2 rounded-full transition-all ${activeScreen === index ? "w-8 bg-brand-600" : "w-2 bg-slate-200 hover:bg-slate-300"}`}
              />
            ))}
          </div>

          {/* content */}
          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.7fr] lg:items-center">
            {/* left: description */}
            <div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${colors.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                {active.badge}
              </span>
              <h3 className="mt-4 text-2xl font-black text-ink sm:text-3xl">{active.title}</h3>
              <p className="mt-4 text-base leading-7 text-slate-500">{active.description}</p>
              <ul className="mt-6 space-y-3">
                {active.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                    {h}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/login")}
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Try it now <ChevronRight size={15} />
              </button>
            </div>

            {/* right: screenshot */}
            <div className={`overflow-hidden rounded-2xl border ring-4 ${colors.ring} shadow-[0_20px_60px_rgba(15,23,42,0.12)]`}>
              <img
                key={active.id}
                src={active.image}
                alt={active.label}
                className="w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* ── FEATURES GRID ────────────────────────────────────────────────────── */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-600">Everything included</p>
              <h2 className="mt-3 text-3xl font-black text-ink sm:text-4xl">
                One system. All the tools your shop needs.
              </h2>
              <p className="mt-4 text-base text-slate-500">
                No separate apps. No missing features. Everything your team needs — from the cashier to the manager — is already built in.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuresList.map((f) => (
                <div key={f.title} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-md">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                    <f.icon size={22} />
                  </div>
                  <h3 className="mt-4 text-base font-black text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-600">How it works</p>
            <h2 className="mt-3 text-3xl font-black text-ink sm:text-4xl">Up and running in minutes</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: PackagePlus,
                title: "Add your products",
                text: "Enter your products with cost price. The system automatically calculates the selling price based on your target profit margin.",
                color: "bg-brand-50 text-brand-600",
              },
              {
                step: "02",
                icon: ShoppingCart,
                title: "Sell and print receipts",
                text: "Your cashier clicks or scans products, selects payment method (Cash, MoMo, Card, Credit), and prints a clean 80mm receipt.",
                color: "bg-emerald-50 text-emerald-600",
              },
              {
                step: "03",
                icon: BarChart3,
                title: "Review your reports",
                text: "The owner or manager monitors daily sales, VAT summary, profit, stock alerts, and customer debts from the dashboard.",
                color: "bg-purple-50 text-purple-600",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-black text-slate-100">{item.step}</span>
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${item.color}`}>
                    <item.icon size={24} />
                  </div>
                </div>
                <h3 className="mt-5 text-xl font-black text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── SUBSCRIPTION / DARK SECTION ──────────────────────────────────────── */}
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-200">
                  <Star size={12} /> Subscription protected
                </span>
                <h2 className="mt-6 text-3xl font-black sm:text-4xl">
                  Your subscription keeps everything running safely.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-300">
                  Every business on this system works on a subscription model. When the plan is active, your team has full access. If it expires, the system blocks access automatically — protecting your data and keeping accounts clean.
                </p>
                <button
                  onClick={() => navigate("/subscription")}
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black text-slate-900 transition hover:bg-slate-100"
                >
                  View plans <ArrowRight size={16} />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: ShieldCheck, title: "Active access", text: "Paid and approved businesses run without interruption." },
                  { icon: CreditCard, title: "Easy renewal", text: "Admins renew subscriptions from the billing page in seconds." },
                  { icon: Users, title: "Role-based access", text: "Admins, managers, and cashiers each see only what they need." },
                  { icon: Zap, title: "Multi-branch", text: "Run one subscription across multiple shop locations." },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <item.icon className="text-blue-300" size={22} />
                    <h3 className="mt-4 font-black">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-sky-500 p-10 text-white shadow-xl shadow-brand-500/20 md:p-16">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-white/70">Ready for your shop?</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  Start managing your business the right way.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/80">
                  Join shops already using UMUCURUZI POS to track sales, manage stock, handle supplier payments, and generate reports — all in one place.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={showRequestForm}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-black text-brand-700 shadow-lg transition hover:bg-slate-50"
                >
                  Request access <MessageCircle size={18} />
                </button>
                <button
                  onClick={() => navigate("/subscription")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-sm font-black text-white transition hover:bg-white/20"
                >
                  See subscription plans <CreditCard size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">
        <span className="inline-flex items-center gap-2">
          <FileText size={15} /> UMUCURUZI POS — Sales · Inventory · Reports · Subscriptions
        </span>
        <p className="mt-2 font-black text-slate-600">System powered by P &amp; D Digital Solution</p>
      </footer>
    </div>
  );
}

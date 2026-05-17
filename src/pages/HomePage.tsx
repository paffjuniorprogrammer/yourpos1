import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Clock3,
  CheckCircle2,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  LockKeyhole,
  PackagePlus,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

const metrics = [
  { label: "Daily sales", value: "1.24M RWF", color: "text-emerald-600" },
  { label: "Stock alerts", value: "18", color: "text-amber-600" },
  { label: "Active users", value: "42", color: "text-brand-600" },
];

const productRows = [
  ["BlueBand Milk 1L", "Dairy", "2,500", "3,250"],
  ["Golden Rice 5kg", "Groceries", "11,000", "14,300"],
  ["Spark Soap", "Home Care", "800", "1,040"],
];

const flows = [
  {
    icon: Store,
    title: "Run the counter",
    text: "Fast POS checkout with product search, barcode scanning, customer selection, payments, receipts, and returns.",
  },
  {
    icon: Boxes,
    title: "Control inventory",
    text: "Track product stock, low-stock alerts, stock counts, transfers, purchases, suppliers, and requisitions.",
  },
  {
    icon: BarChart3,
    title: "Know the numbers",
    text: "See sales, purchases, profit, customer activity, and product movement from one dashboard.",
  },
  {
    icon: CreditCard,
    title: "Protect access",
    text: "Subscription status keeps each business active only when the plan is paid and approved.",
  },
];

const walkthrough = [
  {
    label: "01",
    title: "Add products with admin profit",
    text: "The admin sets the default profit percentage in Settings. Product selling prices are suggested from that exact setting.",
  },
  {
    label: "02",
    title: "Sell and print receipts",
    text: "Staff scan products, take payment, and print clean receipts without leaving the checkout screen.",
  },
  {
    label: "03",
    title: "Review reports",
    text: "Owners watch stock, sales, purchases, profit, suppliers, and customers from the same system.",
  },
];

const trustPills = [
  { icon: Clock3, label: "Fast checkout" },
  { icon: Globe2, label: "Works for many shops" },
  { icon: Headphones, label: "Built for support" },
];

const impactStats = [
  { value: "80mm", label: "Readable receipts", color: "text-emerald-600" },
  { value: "A4", label: "Signed invoices", color: "text-brand-600" },
  { value: "24/7", label: "Subscription control", color: "text-amber-600" },
];

function DashboardSnapshot() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">Dashboard</p>
          <h3 className="mt-1 text-lg font-black text-ink">Business overview</h3>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Active</div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
            <p className={`mt-3 text-xl font-black ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="h-44 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50 to-brand-50 p-4">
          <div className="flex h-full items-end gap-2">
            {[32, 58, 44, 72, 63, 88, 70, 96].map((height, index) => (
              <div key={index} className="flex-1 rounded-t-xl bg-gradient-to-t from-brand-700 to-sky-400" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {["POS sales synced", "Supplier invoice added", "Low stock checked"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span className="text-sm font-bold text-slate-700">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductSnapshot() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-600">Products</p>
          <h3 className="mt-1 text-lg font-black text-ink">Admin profit pricing</h3>
        </div>
        <PackagePlus className="text-brand-600" size={22} />
      </div>
      <div className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Cost price</p>
            <p className="mt-2 text-lg font-black text-ink">10,000 RWF</p>
          </div>
          <div className="rounded-2xl bg-brand-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Admin profit</p>
            <p className="mt-2 text-lg font-black text-brand-700">30%</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Suggested selling</p>
            <p className="mt-2 text-lg font-black text-emerald-700">13,000 RWF</p>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
          {productRows.map(([name, category, cost, selling]) => (
            <div key={name} className="grid grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-b-0">
              <span className="font-bold text-ink">{name}</span>
              <span className="text-slate-500">{category}</span>
              <span className="text-right text-slate-500">{cost}</span>
              <span className="text-right font-black text-brand-700">{selling}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PosSnapshot() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">POS checkout</p>
          <h3 className="mt-1 text-lg font-black">Scan, sell, print</h3>
        </div>
        <ScanLine className="text-blue-200" size={22} />
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_0.75fr]">
        <div className="grid grid-cols-2 gap-3">
          {["Milk", "Rice", "Soap", "Juice"].map((name, index) => (
            <div key={name} className="rounded-2xl bg-white/10 p-4">
              <div className="mb-4 h-16 rounded-xl bg-white/10" />
              <p className="font-black">{name}</p>
              <p className="mt-1 text-xs text-blue-100">{(index + 1) * 1200} RWF</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-white p-4 text-ink">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart size={18} className="text-brand-600" />
            <p className="font-black">Current cart</p>
          </div>
          {["BlueBand Milk x2", "Golden Rice x1", "Spark Soap x3"].map((item) => (
            <div key={item} className="flex justify-between border-b border-slate-100 py-3 text-sm">
              <span className="font-semibold text-slate-600">{item}</span>
              <span className="font-black">RWF</span>
            </div>
          ))}
          <div className="mt-5 rounded-2xl bg-brand-600 px-4 py-3 text-center text-sm font-black text-white">
            Pay and print receipt
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-transparent text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
          <img src="/pos-logo.jpg" alt="POS logo" className="h-11 w-11 rounded-2xl object-cover shadow-soft" />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ink">POS System</p>
            <p className="text-xs font-semibold text-slate-500">Sales, stock, reports</p>
          </div>
        </button>
        <button
          onClick={() => navigate("/login")}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Login <ArrowRight size={16} />
        </button>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-12 pt-8 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:pb-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brand-700 shadow-sm">
              <Sparkles size={14} /> Point of Sale + Inventory + Subscription
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-ink sm:text-5xl lg:text-6xl">
              A complete shop system for selling, stock, staff, and renewals.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Manage products, purchases, suppliers, customers, sales, stock counts, reports, and subscription access in one clean business dashboard.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-sm font-black text-white shadow-soft transition hover:bg-brand-700"
              >
                Start using the system <ArrowRight size={18} />
              </button>
              <button
                onClick={() => navigate("/subscription")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                View subscription <CreditCard size={18} />
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              {trustPills.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm">
                  <item.icon size={14} className="text-brand-600" /> {item.label}
                </span>
              ))}
            </div>
          </div>

          <DashboardSnapshot />
        </section>

        <section className="border-y border-slate-200 bg-white/80">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
            {flows.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <item.icon size={23} />
                </div>
                <h2 className="mt-4 text-base font-black text-ink">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-3">
            {impactStats.map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-5">
                <p className={`text-3xl font-black ${item.color}`}>{item.value}</p>
                <p className="mt-1 text-sm font-bold text-slate-600">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-brand-600">System screenshots</p>
            <h2 className="mt-3 text-3xl font-black text-ink sm:text-4xl">Show customers how the system works, step by step.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              The homepage now previews the same screens users will work with: product pricing, POS checkout, inventory, reports, and subscription protection.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <ProductSnapshot />
            <PosSnapshot />
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-200">Subscription business model</p>
              <h2 className="mt-4 text-3xl font-black sm:text-4xl">Built for businesses that pay monthly and need controlled access.</h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Admins can manage plans and business status. When a subscription expires, access is protected until the account is renewed.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: ShieldCheck, title: "Active plans", text: "Keep paid businesses running without blocking staff." },
                { icon: LockKeyhole, title: "Expired guard", text: "Expired subscriptions are sent to the renewal screen." },
                { icon: Users, title: "Team roles", text: "Give staff access only to the modules they need." },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/10">
                  <item.icon className="text-blue-200" size={24} />
                  <h3 className="mt-4 font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {walkthrough.map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-sm font-black text-brand-600">{item.label}</p>
                <h3 className="mt-4 text-xl font-black text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-4 rounded-3xl border border-brand-100 bg-brand-50 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-brand-700">Ready for your shops</p>
              <h2 className="mt-2 text-2xl font-black text-ink">Use one system for checkout, products, stock, reports, and subscription billing.</h2>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-sm font-black text-white transition hover:bg-brand-700"
            >
              Login now <Receipt size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/70 px-4 py-8 text-center text-sm font-semibold text-slate-500">
        <span className="inline-flex items-center gap-2">
          <FileText size={16} /> POS System for sales, inventory, reports, and subscriptions.
        </span>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Coffee, Minus, Plus, Search, ShoppingCart, UtensilsCrossed, X } from "lucide-react";
import { formatCurrency } from "../lib/format";
import { guestOrderService, type GuestMenu } from "../services/guestOrderService";

export function GuestOrderPage() {
  const { kind, token } = useParams<{ kind: "table" | "room"; token: string }>();
  const [menu, setMenu] = useState<GuestMenu | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !token || (kind !== "table" && kind !== "room")) return;
    guestOrderService.getMenu(kind, token).then(setMenu).catch((error) => setMessage(error.message || "This QR code is unavailable.")).finally(() => setLoading(false));
  }, [kind, token]);

  const categories = useMemo(() => ["All", ...Array.from(new Set((menu?.products || []).map((product) => product.category)))], [menu]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (menu?.products || []).filter((product) => (category === "All" || product.category === category) && (!search || product.name.toLowerCase().includes(search)));
  }, [menu, category, query]);
  const cartItems = (menu?.products || []).filter((product) => cart[product.id] > 0);
  const totalQty = cartItems.reduce((sum, product) => sum + cart[product.id], 0);
  const totalAmount = cartItems.reduce((sum, product) => sum + cart[product.id] * product.price, 0);
  const addItem = (id: string) => setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  const removeItem = (id: string) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) - 1) }));

  const sendOrder = async () => {
    if (!kind || !token || !guestName.trim()) { setMessage("Enter your name before sending the order."); return; }
    setSubmitting(true); setMessage(null);
    try {
      await guestOrderService.submit(kind, token, guestName.trim(), phone.trim(), cartItems.map((product) => ({ product_id: product.id, quantity: cart[product.id] })));
      setCart({}); setCartOpen(false); setMessage("Order sent to the bar. Please wait for their confirmation.");
    } catch (error: any) {
      setMessage(error.message || "The bar is closed. Your order was not sent.");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#EEF2FB] p-8 text-center text-sm font-semibold text-[#4B5878]">Loading menu...</div>;
  if (!menu) return <div className="min-h-screen bg-[#EEF2FB] p-8 text-center text-sm font-semibold text-[#4B5878]">{message || "Menu unavailable"}</div>;

  return <div className="min-h-screen w-full bg-[#EEF2FB]">
    <div className="relative mx-auto min-h-screen w-full max-w-md bg-[#EEF2FB]">
      <div className="sticky top-0 z-20 px-5 pb-5 pt-6" style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2E5AAC 100%)" }}>
        <div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-medium tracking-wide text-blue-200">{menu.business_name}</p><h1 className="text-xl font-bold leading-tight text-white">Order for {menu.target.label}</h1></div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white"><UtensilsCrossed size={19} /></div></div>
        <div className="flex items-center gap-2 rounded-xl bg-white/92 px-3 py-2.5"><Search size={17} color="#5B6B8C" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" className="flex-1 bg-transparent text-sm text-[#1B2A4A] outline-none placeholder:text-slate-400" /></div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2 pt-4">{categories.map((item) => { const Icon = item === "All" ? UtensilsCrossed : Coffee; const active = category === item; return <button key={item} onClick={() => setCategory(item)} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors" style={active ? { background: "#1B2A4A", color: "#fff" } : { background: "#fff", color: "#4B5878", border: "1px solid #DCE3F0" }}><Icon size={14} />{item}</button>; })}</div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-32 pt-3">{filtered.map((product) => {
        const quantity = cart[product.id] || 0;
        return <article key={product.id} className="flex flex-col justify-between rounded-2xl bg-white p-3.5" style={{ boxShadow: "0 1px 2px rgba(20,30,60,0.06)", border: quantity > 0 ? "1.5px solid #2E5AAC" : "1px solid #E7ECF6" }}>
          <button type="button" onClick={() => addItem(product.id)} className="w-full text-left"><p className="text-[13.5px] font-semibold leading-snug text-[#1B2A4A]">{product.name}</p><p className="mt-1 text-[13px] font-bold text-[#2E5AAC]">{formatCurrency(product.price)}</p></button>
          <div className="mt-3">{quantity === 0 ? <button onClick={() => addItem(product.id)} className="flex w-full items-center justify-center gap-1 rounded-xl bg-[#2E5AAC] py-2 text-[13px] font-semibold text-white transition-transform active:scale-95"><Plus size={14} /> Add</button> : <div className="flex items-center justify-between overflow-hidden rounded-xl bg-[#EEF2FB]"><button onClick={() => removeItem(product.id)} className="p-2.5 text-[#2E5AAC]"><Minus size={15} /></button><span className="text-[13px] font-bold text-[#1B2A4A]">{quantity}</span><button onClick={() => addItem(product.id)} className="p-2.5 text-[#2E5AAC]"><Plus size={15} /></button></div>}</div>
        </article>;
      })}{!filtered.length && <div className="col-span-2 py-16 text-center text-sm text-[#8792AA]">No products match “{query}”</div>}</div>

      {message && <div className={`mx-5 mb-5 rounded-xl px-4 py-3 text-sm font-medium ${message.startsWith("Order sent") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</div>}

      {totalQty > 0 && !cartOpen && <button onClick={() => setCartOpen(true)} className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-md items-center justify-between px-5 py-4 active:opacity-90" style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2E5AAC 100%)", boxShadow: "0 -4px 20px rgba(20,30,60,0.25)" }}><div className="flex items-center gap-3"><div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><ShoppingCart size={16} color="#fff" /><span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#F5A623] text-[10px] font-bold text-[#1B2A4A]">{totalQty}</span></div><div className="text-left"><p className="mb-0.5 text-[11px] leading-none text-blue-200">View order</p><p className="text-[15px] font-bold leading-none text-white">{formatCurrency(totalAmount)}</p></div></div><span className="text-[13px] font-semibold text-white">Open →</span></button>}

      {cartOpen && <div className="fixed inset-0 z-40 flex justify-center"><div className="absolute inset-0 bg-slate-950/45" onClick={() => setCartOpen(false)} /><div className="relative mt-auto flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white"><div className="flex items-center justify-between border-b border-[#EEF1F8] px-5 pb-3 pt-5"><div><h2 className="text-[17px] font-bold text-[#1B2A4A]">Current order</h2><p className="text-[12px] text-[#8792AA]">{menu.target.label} · {totalQty} item{totalQty !== 1 ? "s" : ""}</p></div><button onClick={() => setCartOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F4FA]"><X size={16} color="#4B5878" /></button></div>
        <div className="flex-1 overflow-y-auto px-5 py-3">{cartItems.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#F3F5FA] py-3"><div className="flex-1 pr-3"><p className="text-[13.5px] font-semibold text-[#1B2A4A]">{item.name}</p><p className="text-[12px] text-[#8792AA]">{formatCurrency(item.price)} each</p></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 rounded-xl bg-[#EEF2FB] px-1"><button onClick={() => removeItem(item.id)} className="p-1.5 text-[#2E5AAC]"><Minus size={13} /></button><span className="w-4 text-center text-[13px] font-bold text-[#1B2A4A]">{cart[item.id]}</span><button onClick={() => addItem(item.id)} className="p-1.5 text-[#2E5AAC]"><Plus size={13} /></button></div><p className="w-16 text-right text-[13px] font-bold text-[#1B2A4A]">{formatCurrency(cart[item.id] * item.price)}</p></div></div>)}</div>
        <div className="border-t border-[#EEF1F8] px-5 pb-6 pt-3">{message && <div className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-medium ${message.startsWith("Order sent") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</div>}<div className="grid gap-2"><input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Your name *" className="rounded-xl border border-[#DCE3F0] px-3 py-2.5 text-[13px] outline-none focus:border-[#2E5AAC]" /><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number (optional)" className="rounded-xl border border-[#DCE3F0] px-3 py-2.5 text-[13px] outline-none focus:border-[#2E5AAC]" /></div><div className="mb-4 mt-4 flex items-center justify-between"><span className="text-[15px] font-bold text-[#1B2A4A]">Total to pay</span><span className="text-[19px] font-extrabold text-[#2E5AAC]">{formatCurrency(totalAmount)}</span></div><div className="flex gap-2.5"><button onClick={() => setCart({})} className="rounded-xl bg-[#F1F4FA] px-4 py-3.5 text-[13px] font-semibold text-[#4B5878]">Clear</button><button disabled={submitting} onClick={() => void sendOrder()} className="flex-1 rounded-xl py-3.5 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2E5AAC 100%)", boxShadow: "0 4px 14px rgba(46,90,172,0.35)" }}>{submitting ? "Sending..." : `Send ${formatCurrency(totalAmount)}`}</button></div></div>
      </div></div>}
    </div>
    <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
  </div>;
}

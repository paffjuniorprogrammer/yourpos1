import { useEffect, useState } from "react";
import { Download, X, Smartphone, Monitor } from "lucide-react";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsVisible(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  if (!isVisible || isInstalled) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 z-[100] md:left-auto md:right-8 md:w-96 animate-in slide-in-from-bottom-10 duration-500">
      <div className="overflow-hidden rounded-[2.5rem] bg-slate-900 p-6 text-white shadow-2xl ring-4 ring-white/10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <Smartphone className="text-white" size={24} />
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        <h3 className="text-xl font-bold">Install POS Desktop</h3>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Install our app on your device for a faster, reliable experience and offline access.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleInstall}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-black text-slate-900 transition hover:bg-slate-100 active:scale-95"
          >
            <Download size={18} />
            Install App Now
          </button>
          
          <div className="flex items-center justify-center gap-4 py-2 opacity-50">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
              <Monitor size={12} /> Desktop
            </div>
            <div className="h-1 w-1 rounded-full bg-white/30" />
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
              <Smartphone size={12} /> Mobile
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

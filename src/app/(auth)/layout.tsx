import { Zap } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
            <Zap className="h-5 w-5 text-brand-ink" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">NojAds</span>
        </div>
        {children}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
          Configure uma vez. O NojAds trabalha continuamente.
        </p>
      </div>
    </div>
  );
}

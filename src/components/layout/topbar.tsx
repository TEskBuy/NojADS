'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/utils';
import type { Profile } from '@/types/models';

const ROLE_LABEL = { ADMIN: 'Administrador', MANAGER: 'Gestor', CLIENT: 'Cliente' } as const;

export function Topbar({ profile, unread }: { profile: Profile; unread: number }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('nojads-theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur">
      <button
        type="button"
        onClick={toggleTheme}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink"
        aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      >
        {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      </button>

      <Link
        href="/notificacoes"
        className="relative rounded-lg p-2 text-muted transition-colors hover:bg-raised hover:text-ink"
        aria-label={`Notificacoes${unread > 0 ? ` (${unread} por ler)` : ''}`}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-hidden />
        ) : null}
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-raised"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">
            {initials(profile.full_name ?? profile.email)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-medium leading-tight text-ink">
              {profile.full_name ?? profile.email}
            </span>
            <span className="block text-[10px] leading-tight text-faint">
              {ROLE_LABEL[profile.role]}
            </span>
          </span>
        </button>

        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div
              className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
              role="menu"
            >
              <div className="border-b border-line px-3 py-2">
                <p className="truncate text-xs font-medium text-ink">{profile.email}</p>
                <p className="text-[10px] text-faint">{profile.timezone}</p>
              </div>
              <Link
                href="/definicoes"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
                role="menuitem"
              >
                <UserIcon className="h-3.5 w-3.5" aria-hidden />
                Perfil e definicoes
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
                role="menuitem"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Terminar sessao
              </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}

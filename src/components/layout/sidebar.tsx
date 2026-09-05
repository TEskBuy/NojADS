'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, Zap } from 'lucide-react';
import { NAV_GROUPS, navForRole } from './nav';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/models';

export function Sidebar({ role, unread }: { role: UserRole; unread: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navForRole(role);

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {group}
            </p>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-brand/10 text-brand'
                          : 'text-muted hover:bg-raised hover:text-ink',
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.href === '/notificacoes' && unread > 0 ? (
                        <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-lg border border-line bg-surface p-2 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-transform',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Link href="/painel" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
              <Zap className="h-4 w-4 text-brand-ink" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight">NojAds</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-raised lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {nav}
        <div className="border-t border-line px-4 py-3">
          <p className="text-[10px] leading-relaxed text-faint">
            NojAds · configure uma vez, o sistema trabalha continuamente.
          </p>
        </div>
      </aside>
    </>
  );
}

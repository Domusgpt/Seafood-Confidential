'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

const ITEMS: { href: Route; label: string; match: (path: string) => boolean }[] = [
  { href: '/', label: 'Today', match: (p) => p === '/' },
  { href: '/stories', label: 'Stories', match: (p) => p.startsWith('/stories') },
  { href: '/publishing', label: 'Publishing', match: (p) => p.startsWith('/publishing') },
  { href: '/contributors', label: 'Contributors', match: (p) => p.startsWith('/contributors') },
  { href: '/distribution', label: 'Distribution', match: (p) => p.startsWith('/distribution') },
  { href: '/settings', label: 'Settings', match: (p) => p.startsWith('/settings') },
];

export function DeskNav({ counts }: { counts: Partial<Record<string, number>> }) {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="nav" aria-label="Desk">
      <ul className="nav__list">
        {ITEMS.map((item) => {
          const count = counts[item.label];
          return (
            <li key={item.href}>
              <Link
                className="nav__link"
                href={item.href}
                aria-current={item.match(pathname) ? 'page' : undefined}
              >
                {item.label}
                {count ? (
                  <span className="nav__count">
                    {count}
                    <span className="visually-hidden"> waiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

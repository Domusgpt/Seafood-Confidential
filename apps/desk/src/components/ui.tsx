import type { ReactNode } from 'react';
import type { Tone } from '@/lib/vocab';

// Server-renderable presentational components. Status is always an icon plus a label (never color
// alone); icons are decorative SVGs colored by the tone token.

function ToneIcon({ tone, className }: { tone: Tone; className: string }) {
  const common = {
    className,
    viewBox: '0 0 16 16',
    'aria-hidden': true as const,
    focusable: 'false' as const,
  };
  switch (tone) {
    case 'good':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.5 8.2l2.2 2.2 4.6-4.8"
            fill="none"
            className="ico-stroke"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M8 1.2l7 13H1z" fill="currentColor" />
          <path d="M8 6v3.6" className="ico-stroke" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="1" className="ico-fill" />
        </svg>
      );
    case 'serious':
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="currentColor" />
          <path d="M8 4.4v4.4" className="ico-stroke" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="1.05" className="ico-fill" />
        </svg>
      );
    case 'critical':
      return (
        <svg {...common}>
          <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
          <path
            d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
            className="ico-stroke"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M8 7.2v4.2" className="ico-stroke" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="4.8" r="1.05" className="ico-fill" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`badge tone-${tone}`}>
      <ToneIcon tone={tone} className="badge__icon" />
      {label}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  note,
  actions,
  children,
  id,
  headingLevel = 2,
}: {
  title?: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section className="card" id={id} aria-labelledby={headingId}>
      {title ? (
        <div className="card__header">
          <Heading id={headingId}>{title}</Heading>
          {actions}
        </div>
      ) : null}
      {note ? <p className="card__note">{note}</p> : null}
      {children}
    </section>
  );
}

export function Callout({
  tone,
  title,
  children,
  meta,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className={`callout tone-${tone}`}>
      <ToneIcon tone={tone} className="callout__icon" />
      <p className="callout__title">{title}</p>
      {children ? <div>{children}</div> : null}
      {meta ? <div className="callout__meta">{meta}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/**
 * Calendar dates (Postgres DATE columns arrive as Date objects at UTC midnight; strings are
 * YYYY-MM-DD). Formatted in UTC so a due date never shifts by the viewer's or newsroom's offset.
 */
export function formatDate(value: string | Date | null | undefined): string {
  const day = isoDay(value);
  if (!day) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(d);
}

/** Postgres DATE values arrive as Date objects at UTC midnight; render them as plain dates. */
export function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

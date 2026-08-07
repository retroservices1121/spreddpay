"use client";

import * as React from "react";
import { cn } from "./cn";

export interface NavItem {
  href: string;
  label: string;
  /** Rendered as a small count beside the label, e.g. items needing attention. */
  badge?: number | null;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Responsive portal chrome shared by the trader, partner and admin apps.
 * Sidebar on desktop, a slide-over on small screens.
 */
export function AppShell({
  productName,
  logoUrl,
  sections,
  currentPath,
  user,
  footer,
  children,
  LinkComponent,
}: {
  productName: string;
  logoUrl?: string | null;
  sections: NavSection[];
  currentPath: string;
  user?: { name: string; sublabel?: string } | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Next's <Link>, injected so this package stays framework-agnostic. */
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
    onClick?: () => void;
  }>;
}) {
  const [open, setOpen] = React.useState(false);
  const Link = LinkComponent ?? DefaultLink;

  const nav = (
    <nav className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              {section.title}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                currentPath === item.href ||
                (item.href !== "/" && currentPath.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition",
                      active
                        ? "bg-brand-primary/10 font-medium text-brand-primary"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="tabular rounded-full bg-caution/15 px-1.5 py-0.5 text-[11px] font-medium text-caution">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-edge bg-surface px-4 lg:hidden">
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-edge px-2.5 py-1.5 text-ink-muted"
        >
          <span aria-hidden>☰</span>
        </button>
        <Brand productName={productName} logoUrl={logoUrl} />
      </header>

      <div className="lg:flex">
        {/* sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-edge bg-surface p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-6 hidden lg:block">
            <Brand productName={productName} logoUrl={logoUrl} />
          </div>
          {nav}
          <div className="mt-8 border-t border-edge pt-4">
            {user ? (
              <div className="px-3">
                <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                {user.sublabel ? (
                  <p className="truncate text-xs text-ink-subtle">{user.sublabel}</p>
                ) : null}
              </div>
            ) : null}
            {footer ? <div className="mt-3 px-3">{footer}</div> : null}
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Brand({ productName, logoUrl }: { productName: string; logoUrl?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {logoUrl ? (
        // A plain <img>: this package is framework-agnostic, and partner logos
        // are arbitrary remote URLs that next/image would need configuring for.
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-md object-contain" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-primary text-xs font-bold text-white">
          {productName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate text-sm font-semibold text-ink">{productName}</span>
    </div>
  );
}

function DefaultLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

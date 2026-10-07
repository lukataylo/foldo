import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page frame: sidebar on desktop, top tabs on mobile.
 * nav = [{ id, label, icon: LucideIcon }]; page switching is plain React state (no router needed).
 */
export function AppShell({ brand, tagline, nav, active, onNavigate, actions, children }) {
  return (
    <div className="min-h-screen bg-muted/30 md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-background md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{brand}</div>
            {tagline && <div className="text-xs text-muted-foreground">{tagline}</div>}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={active === id ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {Icon && <Icon className="size-4" />}
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <nav className="flex gap-1 overflow-x-auto md:hidden" aria-label="Main">
            {nav.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap', active === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="hidden text-sm font-medium md:block">{nav.find((n) => n.id === active)?.label}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

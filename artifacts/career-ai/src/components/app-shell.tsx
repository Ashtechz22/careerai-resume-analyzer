import { useUser } from '@clerk/clerk-react';
import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity, ArrowUpRight, BarChart3, BriefcaseBusiness, ChevronLeft, FileText,
  History, LayoutDashboard, Menu, MessageSquareText, Settings, Sparkles, UserRound, X,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/resumes', label: 'My resumes', icon: FileText },
  { href: '/matcher', label: 'Job matcher', icon: BriefcaseBusiness },
  { href: '/history', label: 'History', icon: History },
  { href: '/assistant', label: 'Bullet assistant', icon: MessageSquareText },
  { href: '/recommendations', label: 'Role signals', icon: BarChart3 },
];

export function BrandMark({ compact = false, inSidebar = false }: { compact?: boolean; inSidebar?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 no-underline" data-testid="link-brand">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-sm">
        <span className="absolute bottom-[8px] left-[8px] h-[4px] w-[4px] rounded-full bg-accent" />
        <span className="absolute left-[15px] top-[8px] h-[16px] w-[4px] rotate-[34deg] rounded-full bg-primary-foreground" />
        <span className="absolute right-[8px] top-[8px] h-[4px] w-[10px] rounded-full bg-primary-foreground" />
      </span>
      {!compact && <span className={`font-display text-[17px] font-bold tracking-[-.03em] ${inSidebar ? "text-sidebar-foreground" : "text-foreground"}`}>career<span className="text-primary">ai</span></span>}
    </Link>
  );
}

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: typeof LayoutDashboard; onClick?: () => void }) {
  const [location] = useLocation();
  const active = location === href || (href !== '/dashboard' && location.startsWith(href));
  return (
    <Link href={href} onClick={onClick} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
      <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2.5 : 1.8} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground/60" />}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const pageName = navItems.find((item) => location.startsWith(item.href))?.label ?? 'Workspace';
  
  const { user } = useUser();
  const name = user?.fullName || user?.firstName || user?.username || "User";
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-sidebar px-4 py-5 transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-9 flex items-center justify-between px-2">
          <BrandMark inSidebar />
          <button className="rounded-lg p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent md:hidden" onClick={() => setOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-3 px-3 font-mono text-[9px] font-medium uppercase tracking-[.18em] text-sidebar-foreground/35">Workspace</div>
        <nav className="space-y-1">
          {navItems.map((item) => <NavLink key={item.href} {...item} onClick={() => setOpen(false)} />)}
        </nav>
        <div className="mt-auto space-y-1">
          <div className="mb-4 rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-sidebar-foreground/80"><Sparkles className="h-3.5 w-3.5 text-sidebar-primary" /> Resume momentum</div>
            <p className="mb-3 text-[11px] leading-relaxed text-sidebar-foreground/45">Your profile gets sharper with each review.</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-foreground/10"><div className="h-full w-[68%] rounded-full bg-sidebar-primary" /></div>
            <div className="mt-2 flex justify-between font-mono text-[9px] text-sidebar-foreground/40"><span>3 of 5 steps</span><span>68%</span></div>
          </div>
          <NavLink href="/profile" label="Profile" icon={UserRound} onClick={() => setOpen(false)} />
          <NavLink href="/settings" label="Settings" icon={Settings} onClick={() => setOpen(false)} />
          <div className="mt-3 flex items-center gap-2.5 border-t border-sidebar-border px-3 pt-4">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-accent-foreground">{initials}</div>
            <div className="min-w-0"><div className="truncate text-[12px] font-bold text-sidebar-foreground">{name}</div><div className="truncate text-[10px] text-sidebar-foreground/45">Candidate workspace</div></div>
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-sidebar-foreground/30" />
          </div>
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} aria-label="Close navigation" data-testid="button-overlay" />}
      <main className="min-h-[100dvh] md:pl-[244px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-9">
          <button className="mr-3 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open menu" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
          <div className="font-display text-[15px] font-bold tracking-[-.02em] md:hidden">{pageName}</div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/analyze" className="hidden items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 sm:flex" data-testid="link-header-analyze"><Activity className="h-3.5 w-3.5" /> New analysis</Link>
            <div className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-[10px] font-extrabold text-primary" data-testid="avatar-user">{initials}</div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">{children}</div>
      </main>
    </div>
  );
}

export function PublicHeader() {
  return <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 md:px-8"><BrandMark compact={false} /><nav className="hidden items-center gap-7 text-[12px] font-semibold text-foreground/65 md:flex"><a href="#how-it-works" data-testid="link-how-it-works">How it works</a><a href="#signals" data-testid="link-signals">What we look at</a><Link href="/sign-in" className="rounded-lg px-3 py-2 text-foreground hover:bg-muted" data-testid="link-sign-in-header">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-primary px-4 py-2.5 text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="link-sign-up-header">Create workspace <ChevronLeft className="ml-1 inline h-3 w-3 rotate-180" /></Link></nav><div className="flex gap-2 md:hidden"><Link href="/sign-in" className="rounded-lg px-3 py-2 text-xs font-bold" data-testid="link-sign-in-mobile">Sign in</Link><Link href="/sign-up" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid="link-sign-up-mobile">Start free</Link></div></header>;
}
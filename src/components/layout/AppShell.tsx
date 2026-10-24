import { FileText, LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, Users, Upload } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';

const link = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm', isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white');

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main" onClick={() => setOpen(false)}>
      <NavLink to="/" end className={link}><LayoutDashboard className="h-4 w-4" />Dashboard</NavLink>
      <NavLink to="/documents" end className={link}><FileText className="h-4 w-4" />Documents</NavLink>
      {profile?.role !== 'viewer' && <NavLink to="/documents/new" className={link}><Upload className="h-4 w-4" />Upload</NavLink>}
      {profile?.role === 'admin' && (<>
        <p className="mt-4 px-3 text-xs text-white/50">Administration</p>
        <NavLink to="/admin/audit" className={link}><ScrollText className="h-4 w-4" />Audit log</NavLink>
        <NavLink to="/admin/users" className={link}><Users className="h-4 w-4" />Users &amp; roles</NavLink>
      </>)}
    </nav>
  );
  const side = (
    <div className="flex h-full flex-col gap-6 bg-rail p-4">
      <div className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5" /><span className="font-semibold">TrustVault</span></div>
      {nav}
      <div className="border-t border-white/10 pt-3 text-sm text-white/80">
        <p className="truncate font-medium">{profile?.display_name}</p>
        <p className="truncate text-xs text-white/50">{profile?.email} · {profile?.role}</p>
        <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 text-white/70 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden lg:block">{side}</aside>
      <header className="flex items-center justify-between bg-rail px-4 py-3 text-white lg:hidden">
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" />TrustVault</span>
        <button aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}><Menu className="h-5 w-5" /></button>
      </header>
      {open && <div className="lg:hidden">{side}</div>}
      <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8"><Outlet /></main>
    </div>
  );
}

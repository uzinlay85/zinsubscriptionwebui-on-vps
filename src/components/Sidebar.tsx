"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Server, Users, Settings, LogOut } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Servers", href: "/servers", icon: Server },
    { name: "Clients", href: "/clients", icon: Users },
  ];

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  // Do not render sidebar on login page
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 glass border-r border-white/5 flex-col h-screen fixed left-0 top-0 z-40">
        <div className="p-6">
          <div className="flex items-center gap-3 text-primary-foreground">
            <div className="bg-primary p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
              <Server size={24} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">Universal Panel</h1>
          </div>
        </div>

        <div className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? "bg-white/10 text-white shadow-sm border border-white/10" 
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon 
                  size={20} 
                  className={`transition-colors ${isActive ? "text-blue-400" : "group-hover:text-zinc-300"}`} 
                />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5 space-y-1">
          <Link href="/settings" className={`flex w-full items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname === '/settings' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
            <Settings size={20} className={pathname === '/settings' ? 'text-blue-400' : 'group-hover:text-zinc-300'} />
            <span className="font-medium">Settings</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 group"
          >
            <LogOut size={20} className="group-hover:text-red-400" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-50 glass rounded-2xl border border-white/10 flex items-center justify-around p-2 shadow-2xl pb-safe">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${isActive ? "bg-white/10 text-blue-400" : "text-zinc-400 hover:text-white"}`}
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium leading-none">{item.name}</span>
            </Link>
          );
        })}
        <Link 
          href="/settings" 
          className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${pathname === '/settings' ? "bg-white/10 text-blue-400" : "text-zinc-400 hover:text-white"}`}
        >
          <Settings size={22} />
          <span className="text-[10px] font-medium leading-none">Settings</span>
        </Link>
        <button 
          onClick={handleLogout} 
          className="p-3 rounded-xl transition-all flex flex-col items-center gap-1 text-red-400/80 hover:text-red-400"
        >
          <LogOut size={22} />
          <span className="text-[10px] font-medium leading-none">Logout</span>
        </button>
      </div>
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <div className="flex h-screen overflow-hidden">
      {!isLoginPage && <Sidebar />}
      <main className={`flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 ${!isLoginPage ? "md:ml-64" : ""}`}>
        <div className="max-w-6xl mx-auto w-full animate-in">
          {children}
        </div>
      </main>
    </div>
  );
}

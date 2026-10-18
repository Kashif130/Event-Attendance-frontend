import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { WalletPanel } from "./WalletPanel";
import { NetworkPanel } from "./NetworkPanel";
import { NetworkGuard } from "./NetworkGuard";
import { activeNetworkLabel, isContractConfigured } from "../lib/networks";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/events", label: "Events" },
  { to: "/claim", label: "Claim" },
  { to: "/badges", label: "My badges" },
  { to: "/verify", label: "Verify" },
  { to: "/organizer", label: "Organizer" },
  { to: "/series", label: "Series" },
  { to: "/admin", label: "Admin" },
  { to: "/check", label: "Connection check" },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#A98BFF" />
      <rect x="8" y="9" width="16" height="15" rx="2" fill="none" stroke="#0D0E14" strokeWidth="2" />
      <path d="M8 14h16M12 7v4M20 7v4" stroke="#0D0E14" strokeWidth="2" strokeLinecap="round" />
      <path d="M12.5 19.5l2.5 2.5 4.5-4.5" fill="none" stroke="#0D0E14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
      isActive ? "bg-deep-800 text-beacon-300" : "text-mist-400 hover:text-mist-100"
    }`;

  return (
    <div className="min-h-screen bg-deep-950 bg-grain text-mist-100 [background-size:22px_22px]">
      {!isContractConfigured && (
        <div className="border-b border-ember-500/40 bg-ember-500/10 px-4 py-2 text-center text-[12px] text-ember-400">
          No contract is configured for {activeNetworkLabel}. Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu.
        </div>
      )}
      <header className="border-b border-deep-700 bg-deep-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
          <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <Logo />
            <span className="font-display text-[19px] font-semibold leading-none text-mist-100">Event Attendance</span>
          </NavLink>

          <nav className="hidden items-center gap-1 2xl:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 2xl:flex">
            <NetworkPanel />
            <WalletPanel />
          </div>

          <button
            className="rounded-md border border-deep-600 p-2 text-mist-200 2xl:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-deep-700 px-5 pb-5 pt-3 2xl:hidden">
            <nav className="flex flex-col gap-1" onClick={() => setMenuOpen(false)}>
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <NetworkPanel />
              <WalletPanel />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <Outlet />
      </main>

      <NetworkGuard />

      <footer className="mt-16 border-t border-deep-700">
        <div className="mx-auto max-w-6xl px-5 py-8 text-[12px] text-mist-500">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Attendance is checked by GenLayer validators reading the organizer's confirmation page. The contract decides the outcome.</p>
            <p className="font-mono text-mist-600">{activeNetworkLabel}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

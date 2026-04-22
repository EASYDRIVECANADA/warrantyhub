import { useLocation, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { BRAND } from "../../lib/brand";
import { cn } from "../../lib/utils";

export default function BrochureHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { label: "All Plans", to: "/brochure" },
    { label: "Compare Plans", to: "/brochure/compare" },
    { label: "Tire & Rim", to: "/brochure/tire-rim" },
  ];

  const isActive = (to: string) =>
    to === "/brochure"
      ? location.pathname === "/brochure"
      : location.pathname.startsWith(to);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[70px] bg-white/80 backdrop-blur-xl border-b border-slate-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-8">

        {/* Logo — clicks to landing page */}
        <Link to="/find-insurance" className="shrink-0 flex items-center gap-2 group transition-opacity hover:opacity-80">
          <img
            src="/images/Bridge Warranty_Transparent.png"
            alt="Bridge Warranty"
            className="h-14 w-auto object-contain"
          />
          <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">Coverage Brochure</p>
        </Link>

        {/* Desktop nav — centered */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                isActive(link.to)
                  ? "text-primary bg-primary/8"
                  : "text-muted-foreground hover:text-foreground hover:bg-slate-100"
              )}
            >
              {link.label}
              {isActive(link.to) && (
                <span className="absolute -bottom-[1px] left-3 right-3 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate("/sign-in")}
            className="hidden md:inline-flex items-center px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            Dealer Login
          </button>
          {/* Mobile hamburger */}
          <button
            className="md:hidden text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-1 shadow-lg">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(link.to)
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-200 mt-2">
            <button
              onClick={() => { navigate("/sign-in"); setMenuOpen(false); }}
              className="w-full text-center px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors"
            >
              Dealer Login
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

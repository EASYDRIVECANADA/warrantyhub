import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Building2,
  Car,
  ChartPie,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  Users,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { BRAND } from "../lib/brand";

type ProviderDirectoryEntry = {
  name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
};

const directory: ProviderDirectoryEntry[] = [
  {
    name: "A-Protect Warranty Corporation",
    phone: "1-866-660-6444 or 416-661-7444 (GTA area)",
    email: "info@a-protectwarranty.com",
    address: "8800 Dufferin St., Suite 302B, Concord, ON L4K 0C5",
    website: "",
  },
  {
    name: "Global Warranty",
    phone: "1-800-265-1519",
    email: "sales@globalwarranty.com or csc@globalwarranty.com",
    address: "471 Waterloo St., London, ON N6B 2P4",
    website: "",
  },
  {
    name: "Peoples Choice Warranty (PCW)",
    phone: "1-888-284-2356",
    email: "info@peopleschoicewarranty.com",
    address: "107 Broadway, Tillsonburg, ON N4G 5P9",
    website: "",
  },
  {
    name: "Ensurall",
    phone: "1-800-358-8164",
    email: "",
    address: "407 - 220 Duncan Mill Rd., Toronto, ON M3B 3J5",
    website: "",
  },
  {
    name: "First Canadian Protection Plans",
    phone: "1-800-381-2580",
    email: "",
    address: "",
    website: "",
  },
  {
    name: "Lubrico Warranty",
    phone: "1-800-668-3331",
    email: "",
    address: "",
    website: "",
  },
  {
    name: "NationWide Auto Warranty",
    phone: "1-888-674-8549",
    email: "",
    address: "Based out of Waterloo, Ontario, serving dealers across Canada.",
    website: "",
  },
  {
    name: "Auto Shield Canada",
    phone: "1-888-406-4545",
    email: "",
    address: "",
    website: "goautoshield.com",
  },
];

const stats = [
  { icon: Users, value: "50K+", label: "Happy Customers" },
  { icon: Car, value: "99.9%", label: "Claims Approved" },
  { icon: ChartPie, value: "$2M+", label: "Saved by Users" },
  { icon: Clock, value: "24/7", label: "Support" },
];

export function HomePage() {
  const softLaunchAt = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const candidate = new Date(year, 1, 28, 0, 0, 0, 0);
    if (candidate.getTime() > now.getTime()) return candidate;
    return new Date(year + 1, 1, 28, 0, 0, 0, 0);
  }, []);

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, softLaunchAt.getTime() - now.getTime());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <section className="relative min-h-[70vh] hero-gradient overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="container mx-auto px-4 pt-32 pb-20 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="text-sm font-medium text-primary-foreground">
                <span className="text-yellow-300 font-semibold">Ontario</span> warranty providers directory
              </span>
            </div>

            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6">
              Warranty Companies in <span className="text-yellow-300">Ontario</span>
            </h1>

            <p className="text-lg md:text-xl text-primary-foreground/80 mb-12 max-w-2xl mx-auto">
              Here are several car dealership warranty companies operating in Ontario that you can reach out to, along with their contact details.
            </p>

            <div className="max-w-3xl mx-auto mb-12 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/25 px-6 py-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-left">
                  <div className="text-sm font-semibold text-primary-foreground">Soft launch in</div>
                  <div className="text-xs text-primary-foreground/80 mt-1">February 28</div>
                  <div className="mt-4 grid grid-cols-4 gap-3">
                    <div className="rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-center">
                      <div className="text-xl font-bold text-primary-foreground">{days}</div>
                      <div className="text-[11px] text-primary-foreground/80">Days</div>
                    </div>
                    <div className="rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-center">
                      <div className="text-xl font-bold text-primary-foreground">{String(hours).padStart(2, "0")}</div>
                      <div className="text-[11px] text-primary-foreground/80">Hours</div>
                    </div>
                    <div className="rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-center">
                      <div className="text-xl font-bold text-primary-foreground">{String(minutes).padStart(2, "0")}</div>
                      <div className="text-[11px] text-primary-foreground/80">Minutes</div>
                    </div>
                    <div className="rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-2 text-center">
                      <div className="text-xl font-bold text-primary-foreground">{String(seconds).padStart(2, "0")}</div>
                      <div className="text-[11px] text-primary-foreground/80">Seconds</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center md:items-end gap-3">
                  <div className="text-sm text-primary-foreground/80 text-center md:text-right max-w-xs">
                    Dealerships: register now to get early access.
                  </div>
                  <Button asChild className="bg-yellow-300 text-slate-900 hover:bg-yellow-200">
                    <Link to="/get-started">Register your dealership</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center p-5 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm border border-primary-foreground/25"
                >
                  <s.icon className="w-9 h-9 text-yellow-300 mb-3" />
                  <span className="text-3xl md:text-4xl font-bold text-primary-foreground tracking-tight">{s.value}</span>
                  <span className="text-sm md:text-base font-medium text-primary-foreground/80 mt-1">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path
              d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
              fill="hsl(var(--background))"
            />
          </svg>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Choose <span className="gradient-text">{BRAND.name}</span>?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We partner with the nation's top warranty providers to bring you the best rates and coverage options.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {directory.map((p) => (
              <div
                key={p.name}
                className="group relative bg-gradient-to-br from-card to-card/80 rounded-2xl border border-border/50 p-6 hover:shadow-lg hover:border-primary/20 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 group-hover:from-primary/20 group-hover:to-primary/10 transition-all duration-300">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>

                <div className="text-base font-bold text-foreground mb-4 leading-tight group-hover:text-primary transition-colors duration-300">
                  {p.name}
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-muted-foreground leading-relaxed">{p.phone}</div>
                  </div>
                  {p.email ? (
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-muted-foreground leading-relaxed break-all">{p.email}</div>
                    </div>
                  ) : null}
                  {p.address ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-muted-foreground leading-relaxed">{p.address}</div>
                    </div>
                  ) : null}
                  {p.website ? (
                    <div className="flex items-start gap-2">
                      <Globe className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <a
                        href={`https://${p.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:text-primary/80 leading-relaxed underline"
                      >
                        {p.website}
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 rounded-b-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-primary text-white py-12 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center">
              <img src={BRAND.logoUrl} alt={BRAND.name} className="h-12 w-auto object-contain" />
            </div>

            <div className="text-center max-w-4xl">
              <p className="text-white/90 text-sm md:text-base leading-relaxed mb-4">
                When reaching out, dealers should verify the specific products and current terms offered, ensuring they satisfy themselves as to the insured status of any company whose products they offer their customers. You can find additional information and a list of recognized insured companies on the{' '}
                <a
                  href="https://ucda.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-300 hover:text-yellow-200 underline underline-offset-4"
                >
                  UCDA website
                </a>{' '}
                and the{' '}
                <a
                  href="https://omvic.on.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-300 hover:text-yellow-200 underline underline-offset-4"
                >
                  OMVIC website
                </a>.
              </p>
            </div>

            <p className="text-white/80 text-sm">© {BRAND.copyrightYear} {BRAND.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

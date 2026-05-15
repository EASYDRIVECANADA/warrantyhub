import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Car,
  CheckCircle2,
  Clock,
  FileCheck,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { Button } from "../components/ui/button";

const launchDate = new Date("2026-07-01T00:00:00");

const timeParts = (targetDate: Date) => {
  const distance = Math.max(0, targetDate.getTime() - Date.now());

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000),
  };
};

function CountdownTimer({ targetDate }: { targetDate: Date }) {
  const [time, setTime] = useState(() => timeParts(targetDate));

  useEffect(() => {
    const interval = window.setInterval(() => setTime(timeParts(targetDate)), 1000);
    return () => window.clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex gap-3 sm:gap-4">
      {Object.entries(time).map(([label, value]) => (
        <div key={label} className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md sm:h-20 sm:w-20">
            <span className="font-display text-2xl font-bold text-white sm:text-3xl">
              {String(value).padStart(2, "0")}
            </span>
          </div>
          <span className="mt-1.5 text-xs font-medium capitalize tracking-wide text-white/60">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative flex min-h-[100vh] items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(225,80%,20%)] via-[hsl(225,80%,35%)] to-[hsl(225,80%,56%)]" />
      <div className="absolute right-0 top-0 h-full w-[60%] opacity-[0.07]">
        <div className="absolute right-[10%] top-[10%] h-96 w-96 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-[20%] right-[30%] h-64 w-64 rounded-full bg-[hsl(45,93%,58%)] blur-3xl" />
      </div>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container relative z-10 mx-auto px-4 py-32 md:py-0">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              <Clock className="h-4 w-4 text-accent" />
              Launching July 2026
            </span>

            <h1 className="mt-6 mb-6 font-display text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
              Canada&apos;s Dealer-Only{" "}
              <span className="text-accent">Warranty Marketplace</span>
            </h1>

            <p className="mb-8 max-w-lg text-lg leading-relaxed text-white/70">
              Connect with top-rated warranty providers, compare products side-by-side, and grow your F&amp;I revenue &mdash; all in one modern platform.
            </p>

            <div className="mb-10 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="gap-2 bg-accent px-8 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 hover:bg-accent/90"
              >
                <Link to="/register-dealership">
                  Register Your Dealership <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/sign-in">Sign In</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-white/50">
              {["Free to register", "Ontario dealers", "8+ providers"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center lg:items-end">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-lg md:p-10">
              <h3 className="mb-2 text-center font-display text-xl font-bold text-white">
                Platform Launch Countdown
              </h3>
              <p className="mb-6 text-center text-sm text-white/50">
                Be among the first dealerships on the platform
              </p>
              <div className="mb-8 flex justify-center">
                <CountdownTimer targetDate={launchDate} />
              </div>
              <div className="space-y-3">
                {[
                  "Early access to all providers",
                  "Priority onboarding support",
                  "Exclusive launch pricing",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-accent" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-8 lg:mx-0 md:grid-cols-4">
          {[
            { value: "50,000+", label: "Active Users" },
            { value: "500+", label: "Dealerships" },
            { value: "99.9%", label: "Uptime" },
            { value: "24/7", label: "Support" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-4xl font-extrabold text-white md:text-5xl">
                {stat.value}
              </div>
              <div className="mt-1 text-sm font-medium text-white/60">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { icon: FileCheck, title: "Register", desc: "Sign up your dealership in under 3 minutes with our streamlined wizard." },
    { icon: Globe, title: "Browse Providers", desc: "Access Ontario's top warranty providers and compare products side-by-side." },
    { icon: Car, title: "Draft Contracts", desc: "Create and submit warranty contracts digitally &mdash; no faxes or phone calls." },
    { icon: TrendingUp, title: "Grow Revenue", desc: "Track performance, manage remittances, and scale your F&I business." },
  ];

  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            How It Works
          </span>
          <h2 className="mt-3 mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
            Four Simple Steps
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            From registration to revenue &mdash; get set up and selling in minutes.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="group relative text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <step.icon className="h-7 w-7 text-primary" />
              </div>
              {i < steps.length - 1 ? (
                <div className="absolute left-[calc(50%+40px)] top-8 hidden h-px w-[calc(100%-80px)] bg-border md:block" />
              ) : null}
              <span className="text-xs font-bold uppercase tracking-widest text-primary/50">
                Step {i + 1}
              </span>
              <h3 className="mt-1 mb-2 font-display text-lg font-bold text-foreground">
                {step.title}
              </h3>
              <p
                className="text-sm leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: step.desc }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Shield,
      title: "What is Bridge Warranty?",
      description:
        "A wholesale marketplace exclusively for Canadian dealerships to discover, compare, and purchase warranty and protection products from top-rated providers.",
    },
    {
      icon: Users,
      title: "Built for Dealerships",
      description:
        "Manage your entire F&I portfolio &mdash; from extended warranties to Gap insurance, Tire & Rim, PPF, ceramic coating, and more &mdash; all from one dashboard.",
    },
    {
      icon: Zap,
      title: "Streamlined Contracts",
      description:
        "Draft, submit, and track contracts with providers in real time. No more fax machines, phone calls, or scattered spreadsheets.",
    },
    {
      icon: Lock,
      title: "Secure & Compliant",
      description:
        "Enterprise-grade security with OMVIC compliance verification, role-based access control, and full audit trails.",
    },
    {
      icon: BarChart3,
      title: "Real-Time Analytics",
      description:
        "Track your sales performance, monitor remittances, and gain insights into your protection product portfolio.",
    },
    {
      icon: Globe,
      title: "Multi-Provider Access",
      description:
        "Compare products across 8+ Ontario warranty providers without leaving the platform. Best rates, best coverage.",
    },
  ];

  return (
    <section className="bg-secondary/40 py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Platform Features
          </span>
          <h2 className="mt-3 mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
            Everything Your Dealership Needs
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            One platform to connect with providers, compare products, and grow your protection revenue.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6 text-primary transition-colors group-hover:text-primary-foreground" />
              </div>
              <h3 className="mb-2 font-display text-lg font-bold text-foreground">
                {feature.title}
              </h3>
              <p
                className="text-sm leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: feature.description }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductsSection() {
  const products = [
    { name: "Extended Warranty", icon: Car },
    { name: "Gap Insurance", icon: Shield },
    { name: "Tire & Rim Protection", icon: CheckCircle2 },
    { name: "Paint Protection Film (PPF)", icon: Shield },
    { name: "Ceramic Coating", icon: Zap },
    { name: "Undercoating & Rust Protection", icon: Lock },
    { name: "Key Replacement", icon: CheckCircle2 },
    { name: "Dent Repair Coverage", icon: Car },
  ];

  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Product Catalog
          </span>
          <h2 className="mt-3 mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
            Products You Can Sell
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Access a full catalog of warranty and protection products from multiple providers.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((product) => (
            <div
              key={product.name}
              className="group rounded-xl border border-border bg-card p-5 text-center transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <product.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">{product.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProvidersSection() {
  const providers = [
    { name: "A-Protect Warranty Corporation", phone: "(905) 752-1778", email: "info@a-protect.com", address: "Markham, ON" },
    { name: "Global Warranty", phone: "(800) 265-3282", email: "info@globalwarranty.com", address: "London, ON" },
    { name: "Peoples Choice Warranty (PCW)", phone: "(905) 492-7295", email: "info@pcwcanada.com", address: "Whitby, ON" },
    { name: "Ensurall", phone: "(855) 367-8725", email: "info@ensurall.ca", address: "Toronto, ON" },
    { name: "First Canadian Protection Plans", phone: "(800) 668-4213", email: "info@fcpp.com", address: "Oakville, ON" },
    { name: "Lubrico Warranty", phone: "(800) 463-1028", email: "info@lubrico.com", address: "Hamilton, ON" },
    { name: "NationWide Auto Warranty", phone: "(866) 829-7782", email: "info@nwaw.ca", address: "Toronto, ON" },
    { name: "Auto Shield Canada", phone: "(888) 328-8818", email: "info@autoshield.ca", address: "Mississauga, ON" },
  ];

  return (
    <section className="bg-secondary/40 py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Provider Network
          </span>
          <h2 className="mt-3 mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
            Ontario Provider Directory
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Trusted warranty and protection providers available at launch.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-4">
          {providers.map((provider) => (
            <div
              key={provider.name}
              className="rounded-xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-3 font-display text-sm font-bold leading-tight text-foreground">
                {provider.name}
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span>{provider.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{provider.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span>{provider.address}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FooterCTA() {
  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-[hsl(225,80%,30%)] to-[hsl(225,80%,50%)] p-12 text-center md:p-16">
          <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative z-10">
            <h2 className="mb-4 font-display text-3xl font-bold text-white md:text-4xl">
              Ready to Be Part of the Launch?
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-lg text-white/70">
              Join dealerships getting early access to Canada&apos;s first dealer-only warranty marketplace.
            </p>
            <Button
              asChild
              size="lg"
              className="gap-2 bg-accent px-8 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 hover:bg-accent/90"
            >
              <Link to="/register-dealership">
                Register Your Dealership <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card py-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="font-display text-sm font-bold text-primary-foreground">BW</span>
            </div>
            <div>
              <span className="font-display font-bold text-foreground">Bridge Warranty</span>
              <p className="text-xs text-muted-foreground">&copy; 2026 All rights reserved.</p>
            </div>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <a href="#" className="transition-colors hover:text-foreground">
              Privacy Policy
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Terms of Service
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <ProductsSection />
      <ProvidersSection />
      <FooterCTA />
      <Footer />
    </div>
  );
}

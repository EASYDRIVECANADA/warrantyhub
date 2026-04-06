export const APP_CONFIG = {
  softLaunchDate: import.meta.env.VITE_SOFT_LAUNCH_DATE || "2026-04-12T00:00:00",

  homepageStats: {
    dealerships: import.meta.env.VITE_HOMEPAGE_DEALERSHIPS || "500+",
    providers: import.meta.env.VITE_HOMEPAGE_PROVIDERS || "10+",
    contracts: import.meta.env.VITE_HOMEPAGE_CONTRACTS || "10K+",
    activeUsers: import.meta.env.VITE_HOMEPAGE_ACTIVE_USERS || "50K+",
  },

  pricing: {
    standardMonthly: Number(import.meta.env.VITE_PRICING_STANDARD_MONTHLY || "0"),
    standardAnnual: Number(import.meta.env.VITE_PRICING_STANDARD_ANNUAL || "0"),
    earlyAdopterMonthly: Number(import.meta.env.VITE_PRICING_EARLY_ADOPTER_MONTHLY || "0"),
    earlyAdopterAnnual: Number(import.meta.env.VITE_PRICING_EARLY_ADOPTER_ANNUAL || "0"),
  },
};

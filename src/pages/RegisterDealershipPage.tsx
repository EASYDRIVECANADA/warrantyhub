import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

const SIGNUP_INTENT_KEY = "warrantyhub.signup_intent";
const SIGNUP_DEALERSHIP_NAME_KEY = "warrantyhub.signup_dealership_name";
const SIGNUP_DEALERSHIP_PHONE_KEY = "warrantyhub.signup_dealership_phone";
const SIGNUP_DEALERSHIP_PROVINCE_KEY = "warrantyhub.signup_dealership_province";
const SIGNUP_DEALERSHIP_BUSINESS_LICENSE_KEY = "warrantyhub.signup_dealership_business_license";
const SIGNUP_DEALERSHIP_OMVIC_CERTIFICATE_KEY = "warrantyhub.signup_dealership_omvic_certificate";
const SIGNUP_DEALERSHIP_HST_NUMBER_KEY = "warrantyhub.signup_dealership_hst_number";

function roleToDashboardPath(role: Role) {
  if (role === "UNASSIGNED") return "/request-access";
  if (role === "SUPER_ADMIN") return "/platform";
  if (role === "ADMIN") return "/company-dashboard";
  if (role === "PROVIDER") return "/provider-dashboard";
  if (role === "DEALER_ADMIN") return "/dealer-admin";
  if (role === "DEALER_EMPLOYEE") return "/dealer-dashboard";
  return "/dealer-dashboard";
}

export function RegisterDealershipPage() {
  const { signUp, isLoading, user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dealershipName, setDealershipName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [businessLicense, setBusinessLicense] = useState("");
  const [omvicCertificate, setOmvicCertificate] = useState("");
  const [hstNumber, setHstNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEmailConfirmationNotice = Boolean(error && error.toLowerCase().includes("confirm your email"));

  const validateStep = (target: 1 | 2 | 3) => {
    const bn = dealershipName.trim();
    const ph = phone.trim();
    const pr = province.trim();
    const bl = businessLicense.trim();
    const oc = omvicCertificate.trim();
    const hst = hstNumber.trim();
    const em = email.trim();
    const pw = password.trim();

    if (target >= 1) {
      if (!bn) return "Dealership name is required";
      if (!ph) return "Phone number is required";
      if (!pr) return "Province is required";
    }

    if (target >= 2) {
      if (!bl) return "Ontario Business License is required";
      if (!oc) return "OMVIC Dealer Certificate is required";
      if (!hst) return "Tax Number (HST) is required";
    }

    if (target >= 3) {
      if (!em) return "Email is required";
      if (!pw) return "Password is required";
    }

    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const stepErr = validateStep(3);
      if (stepErr) return setError(stepErr);

      const bn = dealershipName.trim();
      const ph = phone.trim();
      const pr = province.trim();
      const bl = businessLicense.trim();
      const oc = omvicCertificate.trim();
      const hst = hstNumber.trim();

      try {
        localStorage.setItem(SIGNUP_INTENT_KEY, "DEALERSHIP");
        localStorage.setItem(SIGNUP_DEALERSHIP_NAME_KEY, bn);
        localStorage.setItem(SIGNUP_DEALERSHIP_PHONE_KEY, ph);
        localStorage.setItem(SIGNUP_DEALERSHIP_PROVINCE_KEY, pr);
        localStorage.setItem(SIGNUP_DEALERSHIP_BUSINESS_LICENSE_KEY, bl);
        localStorage.setItem(SIGNUP_DEALERSHIP_OMVIC_CERTIFICATE_KEY, oc);
        localStorage.setItem(SIGNUP_DEALERSHIP_HST_NUMBER_KEY, hst);
      } catch {
      }
      await signUp(email, password);
      navigate("/request-access", { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      if (typeof err === "string") {
        setError(err);
        return;
      }
      try {
        setError(JSON.stringify(err));
      } catch {
        setError("Sign up failed");
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    navigate(roleToDashboardPath(user.role), { replace: true });
  }, [navigate, user]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border bg-card text-card-foreground shadow-card overflow-hidden">
            <div className="flex flex-col space-y-1.5 p-6">
              <h1 className="text-2xl font-semibold leading-none tracking-tight font-display">Register Your Dealership</h1>
              <p className="text-sm text-muted-foreground">Create an account to secure early access and onboard your team.</p>
            </div>

            <div className="p-6 pt-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="rounded-xl border bg-background p-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { k: 1 as const, label: "Dealership" },
                      { k: 2 as const, label: "Compliance" },
                      { k: 3 as const, label: "Account" },
                    ].map((s) => (
                      <div key={s.k} className="flex items-center justify-center gap-2 min-w-0">
                        <div
                          className={
                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border shrink-0 " +
                            (step === s.k
                              ? "bg-yellow-300 text-slate-900 border-yellow-300"
                              : step > s.k
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-background text-muted-foreground border-border")
                          }
                        >
                          {s.k}
                        </div>
                        <div
                          className={
                            "text-xs sm:text-sm font-medium truncate " +
                            (step === s.k ? "text-foreground" : "text-muted-foreground")
                          }
                        >
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-sm text-muted-foreground">
                    {step === 1 ? "Basic dealership information." : step === 2 ? "Regulatory details used for verification." : "Create your login."}
                  </div>
                </div>

                {step === 1 ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="dealershipName">
                        Dealership name
                      </label>
                      <Input
                        id="dealershipName"
                        value={dealershipName}
                        onChange={(e) => setDealershipName(e.target.value)}
                        placeholder="ABC Motors"
                        autoComplete="organization"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="phone">
                          Phone number
                        </label>
                        <Input
                          id="phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(555) 555-5555"
                          autoComplete="tel"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="province">
                          Province
                        </label>
                        <select
                          id="province"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={province}
                          onChange={(e) => setProvince(e.target.value)}
                          required
                        >
                          <option value="">Select province</option>
                          <option value="ON">Ontario</option>
                          <option value="QC">Quebec</option>
                          <option value="BC">British Columbia</option>
                          <option value="AB">Alberta</option>
                          <option value="MB">Manitoba</option>
                          <option value="SK">Saskatchewan</option>
                          <option value="NS">Nova Scotia</option>
                          <option value="NB">New Brunswick</option>
                          <option value="NL">Newfoundland and Labrador</option>
                          <option value="PE">Prince Edward Island</option>
                          <option value="NT">Northwest Territories</option>
                          <option value="YT">Yukon</option>
                          <option value="NU">Nunavut</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="businessLicense">
                        Ontario Business License
                      </label>
                      <Input
                        id="businessLicense"
                        value={businessLicense}
                        onChange={(e) => setBusinessLicense(e.target.value)}
                        placeholder="Business license #"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="omvicCertificate">
                        OMVIC Dealer Certificate
                      </label>
                      <Input
                        id="omvicCertificate"
                        value={omvicCertificate}
                        onChange={(e) => setOmvicCertificate(e.target.value)}
                        placeholder="OMVIC certificate #"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="hstNumber">
                        Tax Number (HST)
                      </label>
                      <Input
                        id="hstNumber"
                        value={hstNumber}
                        onChange={(e) => setHstNumber(e.target.value)}
                        placeholder="HST #"
                        required
                      />
                    </div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="email">
                        Email
                      </label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@dealership.com"
                        autoComplete="email"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="password">
                        Password
                      </label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                ) : null}

                {error ? (
                  isEmailConfirmationNotice ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      {error}
                    </div>
                  ) : (
                    <div className="text-sm text-destructive">{error}</div>
                  )
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={step === 1 || isLoading}
                    onClick={() => {
                      setError(null);
                      setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3)));
                    }}
                  >
                    Back
                  </Button>

                  {step < 3 ? (
                    <Button
                      type="button"
                      className="bg-yellow-300 text-slate-900 hover:bg-yellow-200"
                      disabled={isLoading}
                      onClick={() => {
                        const stepErr = validateStep(step);
                        if (stepErr) {
                          setError(stepErr);
                          return;
                        }
                        setError(null);
                        setStep((prev) => (prev === 3 ? 3 : ((prev + 1) as 1 | 2 | 3)));
                      }}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="bg-yellow-300 text-slate-900 hover:bg-yellow-200"
                      disabled={isLoading}
                    >
                      Create Account
                    </Button>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/sign-in" className="text-primary underline underline-offset-4">
                    Sign In
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

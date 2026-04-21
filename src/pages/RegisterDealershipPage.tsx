import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Shield } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAuthApi } from "../lib/auth/auth";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

const SIGNUP_INTENT_KEY = "warrantyhub.signup_intent";
const SIGNUP_DEALERSHIP_NAME_KEY = "warrantyhub.signup_dealership_name";
const SIGNUP_DEALERSHIP_PHONE_KEY = "warrantyhub.signup_dealership_phone";
const SIGNUP_DEALERSHIP_PROVINCE_KEY = "warrantyhub.signup_dealership_province";
const SIGNUP_DEALERSHIP_OMVIC_CERTIFICATE_KEY = "warrantyhub.signup_dealership_omvic_certificate";
const SIGNUP_DEALERSHIP_HST_NUMBER_KEY = "warrantyhub.signup_dealership_hst_number";

const whiteLogoUrl = new URL("../../images/warrantyhubwhite.png", import.meta.url).href;

function roleToDashboardPath(role: Role) {
  if (role === "UNASSIGNED") return "/request-access";
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "/admin/overview";
  if (role === "PROVIDER") return "/provider/overview";
  if (role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE") return "/dealership/overview";
  return "/dealership/overview";
}

export function RegisterDealershipPage() {
  const { signUp, isLoading, user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dealershipName, setDealershipName] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [omvicCertificate, setOmvicCertificate] = useState("");
  const [hstNumber, setHstNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedDealerTerms, setAcceptedDealerTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const isEmailConfirmationNotice = Boolean(error && error.toLowerCase().includes("confirm your email"));
  const isExistingEmailNotice = Boolean(
    error &&
      (error.toLowerCase().includes("email already exists") ||
        error.toLowerCase().includes("already registered") ||
        error.toLowerCase().includes("already in use")),
  );

  const validateStep = (target: 1 | 2 | 3) => {
    const bn = dealershipName.trim();
    const ph = phone.trim();
    const pr = province.trim();
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
    setResetSent(false);
    try {
      const stepErr = validateStep(3);
      if (stepErr) return setError(stepErr);

      if (!acceptedDealerTerms) {
        return setError("You must agree to the Bridge Warranty Dealership Platform Terms & Conditions");
      }

      const bn = dealershipName.trim();
      const ph = phone.trim();
      const pr = province.trim();
      const oc = omvicCertificate.trim();
      const hst = hstNumber.trim();

      try {
        localStorage.setItem(SIGNUP_INTENT_KEY, "DEALERSHIP");
        localStorage.setItem(SIGNUP_DEALERSHIP_NAME_KEY, bn);
        localStorage.setItem(SIGNUP_DEALERSHIP_PHONE_KEY, ph);
        localStorage.setItem(SIGNUP_DEALERSHIP_PROVINCE_KEY, pr);
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

  const sendResetEmail = async () => {
    setError(null);
    setResetSent(false);

    const e = email.trim();
    if (!e) {
      setError("Email is required");
      return;
    }

    setIsResetting(true);
    try {
      const api = getAuthApi();
      await api.requestPasswordReset(e, `${window.location.origin}/reset-password`);
      setResetSent(true);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Failed to send reset email");
      }
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    navigate(roleToDashboardPath(user.role), { replace: true });
  }, [navigate, user]);

  return (
    <div className="min-h-screen bg-background">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden lg:flex bg-primary text-white">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/15" />

          <div className="relative z-10 w-full p-12 flex flex-col">
            <div className="flex items-center gap-3">
              <Link to="/find-insurance" className="inline-flex">
                <img src={whiteLogoUrl} alt="Bridge Warranty" className="h-16 w-auto object-contain" />
              </Link>
            </div>

            <div className="mt-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">
                <Shield className="w-4 h-4 text-yellow-300" />
                Ready to Be Part of the Launch?
              </span>
            </div>

            <h1 className="mt-8 font-display text-4xl font-bold leading-tight">
              Join Dealerships Getting
              <span className="block text-yellow-300">Early Access</span>
            </h1>

            <p className="mt-4 text-white/85 max-w-md text-sm">
              Register now to secure early access. Invite your team and get set up before launch.
            </p>

            <div className="mt-8 space-y-3 text-sm">
              {["Dealer-only marketplace access", "Invite staff with role-based permissions", "Explore providers and pricing in one place"].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-yellow-300/20 border border-yellow-300/30 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-yellow-300" />
                  </div>
                  <div className="text-white/90">{t}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto text-xs text-white/70 pt-10">Free to register · No credit card required</div>
          </div>
        </div>

        <div
          className="relative flex items-center justify-center px-6 py-12 lg:py-0"
          style={{
            backgroundImage: "url('/images/Background.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0 bg-white/45" />
          <div className="relative w-full max-w-lg">
            <div className="rounded-2xl border bg-white/82 backdrop-blur-md shadow-card p-6">
              <div className="flex flex-col space-y-1.5">
                <h1 className="text-3xl font-semibold leading-none tracking-tight font-display">Register Your Dealership</h1>
                <p className="text-sm text-muted-foreground">Apply for dealership access before launch.</p>
              </div>

              <div className="mt-8">
                <form className="space-y-4" onSubmit={onSubmit}>
                  <div className="rounded-xl border bg-white p-4">
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

                    <div className="rounded-xl border bg-white p-4">
                      <div className="text-sm font-semibold">Bridge Warranty Dealership Platform Terms & Conditions</div>
                      <div
                        className="mt-3 max-h-[260px] overflow-y-auto rounded-lg border bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-800"
                        style={{ fontFamily: "Arial, sans-serif" }}
                      >
                        <div className="font-semibold">Bridge Warranty Dealership Platform Terms & Conditions</div>
                        <div className="mt-3">
                          These Dealer Platform Terms & Conditions ("Agreement") govern access to and use of the Bridge Warranty platform by dealerships and their authorized representatives.
                        </div>
                        <div className="mt-3">By creating an account on the Bridge Warranty platform, you agree to be bound by the terms of this Agreement.</div>

                        <div className="mt-4 font-semibold">1. Platform Overview</div>
                        <div className="mt-1">Bridge Warranty Inc. operates a technology platform that connects dealerships with independent providers offering vehicle protection products, including but not limited to:</div>
                        <div className="mt-2 pl-4">
                          <div>Vehicle Service Contracts (Warranty Products)</div>
                          <div>Guaranteed Asset Protection (GAP) Products</div>
                          <div>Other vehicle protection services offered by participating providers.</div>
                        </div>
                        <div className="mt-2">
                          Bridge Warranty is a technology marketplace and is not the obligor, insurer, administrator, or underwriter of any protection product sold through the platform.
                        </div>
                        <div className="mt-2">All coverage obligations remain the responsibility of the individual product provider.</div>

                        <div className="mt-4 font-semibold">2. Dealer Eligibility</div>
                        <div className="mt-1">To create and maintain an account on the platform, the dealership must:</div>
                        <div className="mt-2 pl-4">
                          <div>Be a legally registered business.</div>
                          <div>Provide accurate dealership and contact information.</div>
                          <div>Comply with all applicable federal, provincial, and local regulations governing the sale of vehicle protection products.</div>
                          <div>Maintain any licenses required by law for selling finance or protection products.</div>
                        </div>
                        <div className="mt-2">Bridge Warranty reserves the right to verify dealership information prior to activating or maintaining an account.</div>

                        <div className="mt-4 font-semibold">3. Dealer Responsibilities</div>
                        <div className="mt-1">Dealerships using the Bridge Warranty platform agree to:</div>
                        <div className="mt-2 pl-4">
                          <div>Provide accurate customer and vehicle information when submitting applications.</div>
                          <div>Present protection products truthfully and without misleading statements.</div>
                          <div>Ensure customers understand the product being purchased.</div>
                          <div>Not alter, modify, or misrepresent provider contracts.</div>
                          <div>Follow all product eligibility rules defined by the provider.</div>
                        </div>
                        <div className="mt-2">Dealerships are responsible for ensuring all employees using the platform are properly trained and authorized.</div>

                        <div className="mt-4 font-semibold">4. Product Sales and Representations</div>
                        <div className="mt-1">Dealerships may only offer products that are available through the Bridge Warranty platform and approved by the product provider.</div>
                        <div className="mt-2">Dealerships must not:</div>
                        <div className="mt-2 pl-4">
                          <div>Promise coverage outside the provider’s contract.</div>
                          <div>Guarantee claim approvals.</div>
                          <div>Modify product terms or pricing without authorization.</div>
                        </div>
                        <div className="mt-2">All product terms are governed by the provider’s official contract documentation.</div>

                        <div className="mt-4 font-semibold">5. Customer Data and Privacy</div>
                        <div className="mt-1">Dealerships agree to:</div>
                        <div className="mt-2 pl-4">
                          <div>Provide accurate customer data required to generate protection contracts.</div>
                          <div>Obtain appropriate consent from customers before submitting personal information through the platform.</div>
                          <div>Comply with applicable privacy laws, including Canadian privacy regulations.</div>
                        </div>
                        <div className="mt-2">Bridge Warranty will handle platform data in accordance with its Privacy Policy.</div>

                        <div className="mt-4 font-semibold">6. Platform Access and Security</div>
                        <div className="mt-1">Dealership accounts are responsible for maintaining the confidentiality of their login credentials.</div>
                        <div className="mt-2">Dealerships must not:</div>
                        <div className="mt-2 pl-4">
                          <div>Share login credentials with unauthorized individuals.</div>
                          <div>Use the platform for fraudulent activities.</div>
                          <div>Attempt to access restricted areas of the platform.</div>
                        </div>
                        <div className="mt-2">Bridge Warranty reserves the right to suspend accounts suspected of misuse.</div>

                        <div className="mt-4 font-semibold">7. Fees and Payments</div>
                        <div className="mt-1">Certain services or product transactions may involve platform fees, provider fees, or commissions.</div>
                        <div className="mt-2">Dealerships agree to comply with any applicable payment terms associated with the sale of protection products offered through the platform.</div>
                        <div className="mt-2">Bridge Warranty does not control provider pricing or coverage terms.</div>

                        <div className="mt-4 font-semibold">8. Provider Responsibility</div>
                        <div className="mt-1">All product coverage obligations, claims decisions, and benefit payments are the sole responsibility of the product provider.</div>
                        <div className="mt-2">Bridge Warranty does not:</div>
                        <div className="mt-2 pl-4">
                          <div>Approve or deny claims</div>
                          <div>Guarantee coverage outcomes</div>
                          <div>Act as an insurance provider or administrator</div>
                        </div>
                        <div className="mt-2">Dealerships acknowledge that customers enter into contracts directly with the provider.</div>

                        <div className="mt-4 font-semibold">9. Limitation of Liability</div>
                        <div className="mt-1">To the fullest extent permitted by law, Bridge Warranty shall not be liable for:</div>
                        <div className="mt-2 pl-4">
                          <div>Claim denials by providers</div>
                          <div>Coverage disputes between customers and providers</div>
                          <div>Losses arising from provider insolvency or service failure</div>
                          <div>Indirect or consequential damages resulting from platform use.</div>
                        </div>

                        <div className="mt-4 font-semibold">10. Suspension or Termination</div>
                        <div className="mt-1">Bridge Warranty reserves the right to suspend or terminate dealership access to the platform if:</div>
                        <div className="mt-2 pl-4">
                          <div>The dealership violates this Agreement</div>
                          <div>Fraudulent activity is detected</div>
                          <div>Misrepresentation of products occurs</div>
                          <div>Regulatory compliance issues arise</div>
                        </div>
                        <div className="mt-2">Termination may occur without prior notice where necessary to protect customers or providers.</div>

                        <div className="mt-4 font-semibold">11. Modifications to the Platform</div>
                        <div className="mt-1">Bridge Warranty may modify platform features, products, or services at any time.</div>
                        <div className="mt-2">Continued use of the platform after updates constitutes acceptance of any revised terms.</div>

                        <div className="mt-4 font-semibold">12. Governing Law</div>
                        <div className="mt-1">This Agreement shall be governed by and interpreted in accordance with the laws of the Province of Ontario, Canada.</div>

                        <div className="mt-4 font-semibold">13. Entire Agreement</div>
                        <div className="mt-1">This Agreement constitutes the entire understanding between the dealership and Bridge Warranty regarding the use of the platform.</div>
                        <div className="mt-2">No dealership employee or representative may modify this Agreement without written authorization from Bridge Warranty.</div>

                        <div className="mt-4 font-semibold">Dealer Acknowledgement</div>
                        <div className="mt-1">By creating an account on the Bridge Warranty platform, the dealership acknowledges that it has read, understood, and agrees to comply with these Terms & Conditions.</div>
                      </div>

                      <label className="mt-4 flex items-start gap-3 text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={acceptedDealerTerms}
                          onChange={(e) => setAcceptedDealerTerms(e.target.checked)}
                          disabled={isLoading}
                        />
                        <span>
                          I agree to the <span className="font-semibold">Bridge Warranty Dealership Platform Terms & Conditions</span>
                        </span>
                      </label>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  isEmailConfirmationNotice || isExistingEmailNotice ? (
                    <div
                      className={
                        "rounded-xl border px-4 py-3 text-sm " +
                        (isExistingEmailNotice
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-blue-200 bg-blue-50 text-blue-800")
                      }
                    >
                      <div>{error}</div>
                      {isExistingEmailNotice ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-fit border border-red-200 hover:bg-red-500/10 hover:text-red-600"
                            disabled={isLoading || isResetting}
                            onClick={sendResetEmail}
                          >
                            Send password reset email
                          </Button>
                          {resetSent ? (
                            <div className="text-xs text-red-600">
                              If an account exists for <span className="font-medium">{email.trim()}</span>, we sent a reset link.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
                      disabled={isLoading || !acceptedDealerTerms}
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
    </div>
  );
}

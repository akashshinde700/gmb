"use client";
// WebSetu — Onboarding Wizard
// 3 steps: Business → Contact → Create. Nothing is chosen up front: design,
// colours, services, photos and copy are generated for the business type and
// edited later from the dashboard.
// Draft persists to localStorage (DRAFT_KEY); cleared after success.
import { useEffect, useState } from "react";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useRouter } from "next/navigation";
import { TRIAL_LABEL } from "@/lib/trial";
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, Check, Globe, Loader2, LogOut, MapPin, Phone,
  Rocket, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AiSiteContent } from "@/lib/sections";
import { isValidUpiId } from "@/lib/site-utils";
import { fallbackServices, industryByKey, industryFor, isPresetCategory } from "@/lib/industries";
import { useApp } from "@/store/app-store";
import type { BusinessWithMeta } from "@/store/app-store";

// ---------------------------------------------------------------- constants

// v2: the wizard shrank from 7 steps to 3, so older drafts are not restored.
const DRAFT_KEY = "websetu_onboarding_draft_v2";
const TOTAL_STEPS = 3;
const STEP_LABELS = ["Business", "Contact", "Create"];

const CATEGORIES = [
  "Manufacturer", "Distributor", "Wholesaler", "Retailer", "Trading",
  "Importer", "Exporter", "Packaging", "Printing Press", "Textile",
  "Garment Manufacturer", "Plastic Products", "Chemical Supplier", "Engineering Works", "Fabrication",
  "Foundry", "Machine Tools", "Hardware", "Cement Dealer", "Steel & TMT Dealer",
  "Tiles & Sanitaryware", "Paint Dealer", "Plywood & Timber", "Glass & Aluminium", "Sand & Aggregates",
  "Contractor", "Construction", "Civil Contractor", "Architect", "Structural Engineer",
  "Borewell Services", "Waterproofing", "Scaffolding", "Earthmoving & JCB", "Electrical",
  "Plumbing", "Carpenter", "Painter", "AC Repair", "Appliance Repair",
  "Pest Control", "Cleaning Services", "Packers & Movers", "Solar Installer", "CCTV & Security",
  "RO & Water Purifier", "Interior Designer", "Modular Kitchen", "Furniture", "Curtains & Blinds",
  "Welding Services", "Borewell & Pump Repair", "Restaurant", "Cafe", "Bakery",
  "Sweet Shop", "Catering", "Cloud Kitchen", "Tiffin Service", "Ice Cream Parlour",
  "Juice Centre", "Dairy & Milk", "Food Products", "Namkeen & Snacks", "Spices & Masala",
  "Grocery Store", "Supermarket", "Fruits & Vegetables", "Meat & Poultry", "Mineral Water",
  "Water Supplier", "Beverages", "Soft Drinks", "Clinic", "Hospital",
  "Doctor", "Dentist", "Physiotherapist", "Ayurvedic Clinic", "Homeopathy Clinic",
  "Eye Clinic", "Child Specialist", "Gynecologist", "Orthopedic", "Skin Clinic",
  "Veterinary Clinic", "Pathology Lab", "Diagnostic Centre", "Pharmacy", "Medical Store",
  "Optical Store", "Hearing Care", "Nursing Home", "Salon", "Beauty Parlour",
  "Unisex Salon", "Spa", "Makeup Artist", "Mehndi Artist", "Nail Studio",
  "Tattoo Studio", "Gym", "Fitness Center", "Yoga Studio", "Dance Classes",
  "Martial Arts", "Sports Academy", "Swimming Pool", "Consultant", "Lawyer",
  "CA", "Company Secretary", "Tax Consultant", "GST Consultant", "Insurance Agent",
  "Financial Advisor", "Loan Agent", "Accountant", "Audit Firm", "HR & Recruitment",
  "Placement Agency", "Immigration Consultant", "Visa Services", "Notary Services", "Property Lawyer",
  "Labour Contractor", "Education", "Coaching", "School", "College",
  "Play School", "Day Care", "Computer Training", "Spoken English", "Music Classes",
  "Art Classes", "Driving School", "Competitive Exam Coaching", "Tuition Classes", "Library",
  "Skill Training", "IT Company", "Software Company", "Web Development", "Mobile App Development",
  "Digital Marketing", "SEO Agency", "Graphic Designer", "Video Editing", "Animation Studio",
  "Freelancer", "Computer Repair", "Mobile Repair", "Mobile Shop", "Electronics Store",
  "Cyber Cafe", "Printing & Xerox", "Call Center", "BPO", "Automobile",
  "Garage", "Car Dealer", "Bike Dealer", "Car Wash", "Tyre Shop",
  "Auto Parts", "Battery Shop", "Car Rental", "Driving Services", "Towing Services",
  "Vehicle Insurance", "Transport", "Logistics", "Courier Service", "Tempo Service",
  "Taxi Service", "Bus Service", "Warehouse", "Cold Storage", "Freight Forwarder",
  "Photographer", "Videographer", "Event Management", "Wedding Planner", "Decorator",
  "DJ & Sound", "Tent House", "Banquet Hall", "Marriage Hall", "Catering Services",
  "Real Estate", "Property Dealer", "Builder & Developer", "Rental Services", "Hotel",
  "Lodge", "Resort", "Guest House", "Homestay", "PG & Hostel",
  "Travel Agency", "Tour Operator", "Ticket Booking", "Pilgrimage Tours", "Agriculture",
  "Seeds & Fertilizer", "Nursery & Plants", "Dairy Farm", "Poultry Farm", "Farm Equipment",
  "Organic Products", "Agri Consultant", "Clothing Store", "Footwear Store", "Jewellery Store",
  "Gift Shop", "Toy Store", "Book Store", "Stationery Shop", "Sports Shop",
  "Pet Shop", "Flower Shop", "Kirana Store", "General Store", "Hardware Store",
  "Watch Shop", "Bag Store", "Cosmetics Store", "Mobile Accessories", "Furniture Store",
  "Laundry & Dry Cleaning", "Tailor", "Boutique", "Xerox & Lamination", "Security Services",
  "Manpower Supply", "Housekeeping", "Astrologer", "Priest Services", "Funeral Services",
  "NGO", "Trust & Foundation", "Service Provider", "Local Shop", "Other",
];

// ---------------------------------------------------------------- state

interface ServiceDraft { id: string; name: string; description: string; }

interface OnboardingForm {
  // Step 1 — business
  category: string;
  customCategory: string;
  name: string;
  tagline: string;
  description: string;
  establishedYear: string;
  // Generated for the business type (editable later in the dashboard)
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  services: ServiceDraft[];
  // Step 2 — contact
  phone: string;
  whatsappSame: boolean;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  upiId: string;
  gmbUrl: string;
  mapsUrl: string;
  tone: string;
  ai: AiSiteContent | null;
  /** Which business type the generated fields above belong to. */
  industryKey: string;
}

const DEFAULT_FORM: OnboardingForm = {
  category: "",
  customCategory: "",
  name: "",
  tagline: "",
  description: "",
  establishedYear: "",
  brandPrimary: "#059669",
  brandSecondary: "#0f766e",
  brandAccent: "#f59e0b",
  services: [],
  phone: "",
  whatsappSame: true,
  whatsapp: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  upiId: "",
  gmbUrl: "",
  mapsUrl: "",
  tone: "professional",
  ai: null,
  industryKey: "",
};

const WIZARD_STYLES = `
@keyframes ws-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes ws-pop { 0% { transform: scale(0.3); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
.ws-shake { animation: ws-shake 0.45s ease-in-out; }
.ws-pop { animation: ws-pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.35) both; }
`;

// ---------------------------------------------------------------- component

export default function OnboardingView() {
  const router = useRouter();
  const { toast } = useToast();
  const user = useApp((s) => s.user);
  const setBusiness = useApp((s) => s.setBusiness);
  const openSite = useApp((s) => s.openSite);
  const logout = useApp((s) => s.logout);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [draftReady, setDraftReady] = useState(false);

  // The wizard persists a draft to localStorage, so a reload recovers — but
  // only up to the last change that was written. Warning on the way out is what
  // stops someone losing the step they are mid-way through typing.
  useUnsavedChanges(draftReady && step > 1);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [industryLoading, setIndustryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<BusinessWithMeta | null>(null);

  const finalCategory = form.category === "Other" ? form.customCategory.trim() : form.category;
  const pct = Math.round((step / TOTAL_STEPS) * 100);

  // ---- draft: restore on mount, persist on change, clear after success
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { step?: number; form?: Partial<OnboardingForm> };
        // Restoring the saved draft from localStorage — an external store that
        // cannot be read during render without breaking hydration, so the read
        // and the state it produces both belong in this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.form) setForm((f) => ({ ...f, ...parsed.form }));
        if (parsed.step && parsed.step >= 1 && parsed.step <= TOTAL_STEPS) setStep(parsed.step);
      }
    } catch {
      // corrupted draft — start fresh
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, form }));
    } catch {
      // quota exceeded (large images) — draft partially saved is fine
    }
  }, [step, form, draftReady]);

  // ---- helpers ----------------------------------------------------------

  function fail(msg: string) {
    setError(msg);
    setShaking(true);
    toast({ title: "Almost there", description: msg, variant: "destructive" });
  }

  function validateStep(n: number): string {
    if (n === 1) {
      if (form.name.trim().length < 2) return "Please enter your business name.";
      if (!finalCategory) return "Please choose a business category.";
    }
    if (n === 2) {
      if (!form.phone.trim()) return "Phone number is required.";
      if (!form.city.trim()) return "City is required.";
      if (form.address.trim().length < 5)
        return "Full business address is required — it appears on your website and Google.";
      if (form.upiId.trim() && !isValidUpiId(form.upiId.trim()))
        return "Please enter a valid UPI ID (like name@okicici) — or leave it empty.";
    }
    return "";
  }

  function goToStep(n: number) {
    setError("");
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    const msg = validateStep(step);
    if (msg) {
      fail(msg);
      return;
    }
    if (step === 1) void applyIndustry(finalCategory);
    goToStep(Math.min(TOTAL_STEPS, step + 1));
  }

  /**
   * Generate services and colours for the chosen business type. A trade the
   * presets do not know is written by the AI instead.
   */
  async function applyIndustry(cat: string) {
    const preset = industryFor(cat);
    const listed = isPresetCategory(cat);
    const key = listed ? preset.key : `custom:${cat.toLowerCase()}`;
    if (form.industryKey === key) return;
    const vars = { name: form.name.trim(), city: form.city.trim(), category: cat };

    let services = fallbackServices(cat, vars);
    let look = preset;
    let ai: AiSiteContent | null = form.ai;
    if (!listed) {
      setIndustryLoading(true);
      try {
        const res = await api.post<{ content: AiSiteContent }>("/api/ai/generate", {
          name: vars.name, category: cat, city: vars.city, services: [],
          description: form.description.trim(), tone: form.tone,
        });
        ai = res.content;
        if (ai.services?.length) services = ai.services.map((x) => ({ name: x.name, description: x.description, icon: x.icon || "sparkles" }));
        look = industryByKey(ai.industry) ?? preset;
      } catch {
        // Generic services are still a usable start; the customer can edit them.
      } finally {
        setIndustryLoading(false);
      }
    }

    setForm((f) => ({
      ...f,
      industryKey: key,
      ai,
      services: services.map((x, i) => ({ id: `auto_${look.key}_${i}`, name: x.name, description: x.description })),
      brandPrimary: look.palette[0],
      brandSecondary: look.palette[1],
      brandAccent: look.palette[2],
    }));
    toast({
      title: listed ? `Set up for ${preset.label}` : `Website content created for ${cat}`,
      description: "Services, colours, photos and content are tailored to your business — change anything you like.",
    });
  }

  function back() {
    goToStep(Math.max(1, step - 1));
  }

  function setField<K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ---- final submit -------------------------------------------------------

  async function submitOnboarding() {
    if (submitting) return;
    const msg = validateStep(1) || validateStep(2);
    if (msg) {
      fail(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    const whatsapp = form.whatsappSame ? form.phone.trim() : form.whatsapp.trim();
    // Content is written for them, not chosen: generate it now if the
    // business-type step did not already. A failure just means template copy.
    let ai = form.ai;
    if (!ai) {
      try {
        ai = (await api.post<{ content: AiSiteContent }>("/api/ai/generate", {
          name: form.name.trim(),
          category: finalCategory,
          city: form.city.trim(),
          services: form.services.map((s) => s.name),
          description: form.description.trim(),
          tone: form.tone,
        })).content;
      } catch {
        ai = null;
      }
    }
    try {
      const res = await api.post<{ business: BusinessWithMeta }>("/api/onboarding", {
        name: form.name.trim(),
        category: finalCategory,
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        establishedYear: form.establishedYear.trim(),
        ownerName: user?.name || "",
        phone: form.phone.trim(),
        whatsapp,
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        gstin: form.gstin.trim(),
        upiId: form.upiId.trim(),
        brandPrimary: form.brandPrimary,
        brandSecondary: form.brandSecondary,
        brandAccent: form.brandAccent,
        gmbUrl: form.gmbUrl.trim(),
        mapsUrl: form.mapsUrl.trim(),
        ai,
        services: form.services.map((s) => ({ name: s.name, description: s.description })),
      });
      const biz = res.business;
      setBusiness(biz);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      toast({
        title: "🎉 Your website is ready!",
        description: `${biz.name} was created — ${TRIAL_LABEL} started.`,
      });
      setSuccess(biz);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const msg2 = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setError(msg2);
      toast({ title: "Could not create your website", description: msg2, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // =============================================================== SUCCESS

  if (success) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <style>{WIZARD_STYLES}</style>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <Card className="w-full max-w-md rounded-2xl border-border text-center shadow-sm">
            <CardContent className="p-8">
              <div className="ws-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/30">
                <Check className="h-10 w-10 text-white" strokeWidth={3} aria-hidden="true" />
              </div>
              <h1 className="mt-6 text-2xl font-bold text-foreground">Your website is ready! 🎉</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{success.name}</span> is live on your
                {TRIAL_LABEL} at{" "}
                <span className="font-mono text-xs text-emerald-700">websetu.in/{success.slug}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  {TRIAL_LABEL}
                </Badge>
                <Badge variant="outline" className="rounded-full border-input text-muted-foreground">
                  {success.category}
                </Badge>
                {success.templateId && (
                  <Badge variant="outline" className="rounded-full border-input text-muted-foreground">
                    Template applied
                  </Badge>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Button
                  className="h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    router.push("/dashboard");
                    useApp.getState().setView("dashboard");
                  }}
                >
                  Open Dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => openSite(success.slug, "dashboard")}
                >
                  <Globe className="h-4 w-4" aria-hidden="true" /> Preview Website
                </Button>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">
                Tip: add photos, products & testimonials from the dashboard to boost your health score.
              </p>
            </CardContent>
          </Card>
        </main>
        <footer className="mt-auto border-t border-border bg-card py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
          © WebSetu — Setup wizard
        </footer>
      </div>
    );
  }

  // ================================================================ WIZARD

  const filteredCats = CATEGORIES.filter((c) =>
    c.toLowerCase().includes(catSearch.trim().toLowerCase()),
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <style>{WIZARD_STYLES}</style>

      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
                W
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground">WebSetu</p>
                <p className="text-[11px] font-medium text-muted-foreground">Website Setup</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-semibold text-foreground sm:text-sm">
                  Website Setup {pct}% Complete
                </p>
                <p className="text-[11px] text-muted-foreground sm:hidden">Step {step} of {TOTAL_STEPS}</p>
              </div>
              {/* Someone who registers and stops here used to be stuck: no way
                  to sign out and no way to reach another account. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-9 shrink-0 rounded-lg px-2 text-muted-foreground hover:bg-red-50 hover:text-red-700 sm:px-3"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </div>
          </div>

          <Progress
            value={pct}
            className="mt-3 h-2 bg-emerald-100 [&>div]:bg-emerald-600"
            aria-label={`Website Setup ${pct}% complete`}
          />

          <ol className="mt-3 hidden items-center justify-between gap-1 sm:flex">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                      done
                        ? "bg-emerald-600 text-white"
                        : current
                          ? "border-2 border-emerald-600 bg-card text-emerald-700"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      current ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {/* ---------------- main ---------------- */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-5 sm:px-6">
        {error && (
          <Alert
            variant="destructive"
            role="alert"
            className="mb-4 rounded-2xl border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-600"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Hold on</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{error}</span>
            </AlertDescription>
          </Alert>
        )}

        <div
          className={`overflow-visible rounded-2xl border border-border bg-card shadow-sm ${
            shaking ? "ws-shake" : ""
          }`}
          onAnimationEnd={() => setShaking(false)}
        >
          <div className="p-4 sm:p-8">
            {/* ============================ STEP 1 — BUSINESS */}
            {step === 1 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Building2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Tell us about your business"
                  sub="This shapes your website content, design and SEO."
                />

                <div className="space-y-2">
                  <Label htmlFor="cat-search">Business category *</Label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="cat-search"
                      placeholder="Search 45+ business categories…"
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      className="rounded-xl pl-9"
                      autoComplete="off"
                    />
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Business category"
                    className="max-h-56 overflow-y-auto rounded-xl border border-border bg-muted/60 p-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
                  >
                    <div className="flex flex-wrap gap-2">
                      {filteredCats.map((c) => {
                        const active = form.category === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setField("category", c)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                              active
                                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                                : "border-border bg-card text-foreground hover:border-emerald-300 hover:bg-emerald-50"
                            }`}
                          >
                            {c}
                            {active && <Check className="h-3 w-3" aria-hidden="true" />}
                          </button>
                        );
                      })}
                      {filteredCats.length === 0 && (
                        <p className="px-1 py-2 text-sm text-muted-foreground">
                          No match — scroll down and pick &quot;Other&quot; to type your own.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {form.category === "Other" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-cat">
                      Your business type <span className="text-emerald-600">*</span>
                    </Label>
                    <Input
                      id="custom-cat"
                      placeholder="e.g. Batteries & Inverters"
                      value={form.customCategory}
                      onChange={(e) => setField("customCategory", e.target.value)}
                      className="rounded-xl"
                      autoComplete="off"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="biz-name">
                      Business name <span className="text-emerald-600">*</span>
                    </Label>
                    <Input
                      id="biz-name"
                      required
                      placeholder="e.g. Sharma Electricals"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      aria-invalid={error.includes("business name")}
                      className="rounded-xl"
                      autoComplete="organization"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="biz-tagline">
                      One line about your business <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="biz-tagline"
                      placeholder="e.g. Fresh cakes baked every morning"
                      value={form.tagline}
                      onChange={(e) => setField("tagline", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown under your name and on Google. Not a year — there is a year box below.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="biz-desc">Short description</Label>
                  <Textarea
                    id="biz-desc"
                    rows={3}
                    placeholder="What do you do? What makes you special?"
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional — leave it blank and we will write it for you.
                  </p>
                </div>

                <div className="space-y-2 sm:max-w-[220px]">
                  <Label htmlFor="biz-year">
                    Established year <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="biz-year"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 2015"
                    value={form.establishedYear}
                    onChange={(e) => setField("establishedYear", e.target.value.replace(/\D/g, ""))}
                    className="rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* ============================ STEP 2 — CONTACT */}
            {step === 2 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Phone className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Contact details"
                  sub="Customers will use these to reach you. Phone & city are required."
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ct-phone">
                      Phone <span className="text-emerald-600">*</span>
                    </Label>
                    <Input
                      id="ct-phone" inputMode="tel" autoComplete="tel"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-h-[20px] items-center gap-2">
                      <Checkbox
                        id="wa-same"
                        checked={form.whatsappSame}
                        onCheckedChange={(c) => setField("whatsappSame", c === true)}
                      />
                      <Label htmlFor="wa-same" className="text-xs font-normal text-muted-foreground">
                        WhatsApp is the same number
                      </Label>
                    </div>
                    {form.whatsappSame ? (
                      <p className="text-xs text-muted-foreground">
                        A WhatsApp button will open chats on {form.phone || "your phone number"}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="ct-wa">WhatsApp number</Label>
                        <Input
                          id="ct-wa"
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={form.whatsapp}
                          onChange={(e) => setField("whatsapp", e.target.value)}
                          className="rounded-xl"
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct-email">Email</Label>
                    <Input
                      id="ct-email"
                      type="email"
                      placeholder="you@business.com"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      className="rounded-xl"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct-city">
                      City <span className="text-emerald-600">*</span>
                    </Label>
                    <Input
                      id="ct-city"
                      required
                      placeholder="e.g. Pune"
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className="rounded-xl"
                      autoComplete="address-level2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct-state">State</Label>
                    <Input
                      id="ct-state"
                      placeholder="e.g. Maharashtra"
                      value={form.state}
                      onChange={(e) => setField("state", e.target.value)}
                      className="rounded-xl"
                      autoComplete="address-level1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct-pin">Pincode</Label>
                    <Input
                      id="ct-pin"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="e.g. 411001"
                      value={form.pincode}
                      onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, ""))}
                      className="rounded-xl"
                      autoComplete="postal-code"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ct-address">
                      Full address <span className="text-emerald-600">*</span>
                    </Label>
                    <Textarea
                      id="ct-address"
                      required
                      aria-required="true"
                      rows={2}
                      placeholder="Shop no, street, landmark, area…"
                      value={form.address}
                      onChange={(e) => setField("address", e.target.value)}
                      className="rounded-xl"
                      autoComplete="street-address"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ct-gstin">
                      GSTIN <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="ct-gstin" autoCapitalize="characters" autoComplete="off"
                      placeholder="e.g. 27ABCDE1234F1Z5"
                      value={form.gstin}
                      onChange={(e) => setField("gstin", e.target.value.toUpperCase())}
                      className="rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ct-upi">
                      UPI ID (for payments) <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="ct-upi" inputMode="email" autoCapitalize="none" autoComplete="off"
                      placeholder="name@okicici"
                      value={form.upiId}
                      onChange={(e) => setField("upiId", e.target.value.trim())}
                      className={cn(
                        "rounded-xl font-mono text-sm",
                        form.upiId.trim() && !isValidUpiId(form.upiId.trim()) &&
                          "border-red-300 focus-visible:ring-red-200",
                      )}
                    />
                    {form.upiId.trim() && !isValidUpiId(form.upiId.trim()) ? (
                      <p className="text-xs font-medium text-red-600">
                        That doesn&apos;t look like a valid UPI ID — format should be like
                        name@okicici or shop@paytm.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Visitors get a Scan &amp; Pay QR on your website automatically. Example:
                        name@okicici
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    Google presence
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="ct-gmb">Google Business Profile URL</Label>
                    <Input
                      id="ct-gmb"
                      type="url"
                      placeholder="https://business.google.com/…"
                      value={form.gmbUrl}
                      onChange={(e) => setField("gmbUrl", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste your Google Business Profile or Maps link — helps customers find you.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ct-maps">Google Maps link</Label>
                    <Input
                      id="ct-maps"
                      type="url"
                      placeholder="https://maps.google.com/…"
                      value={form.mapsUrl}
                      onChange={(e) => setField("mapsUrl", e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ============================ STEP 3 — CREATE */}
            {step === 3 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Rocket className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Ready to create your website"
                  sub="We design everything for your business — you can change any of it later from your dashboard."
                />

                <div className="overflow-hidden rounded-2xl border border-border">
                  <div
                    className="px-5 py-6 text-white"
                    style={{ background: `linear-gradient(135deg, ${form.brandSecondary}, ${form.brandPrimary})` }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
                      {industryFor(finalCategory).label} design
                    </p>
                    <p className="mt-1 text-2xl font-bold">{form.name || "Your business"}</p>
                    <p className="mt-1 text-sm text-white/80">
                      {finalCategory}
                      {form.city ? ` · ${form.city}` : ""}
                    </p>
                  </div>
                  <ul className="grid gap-3 p-5 sm:grid-cols-2">
                    {[
                      `Design, colours & animation made for ${finalCategory || "your business"}`,
                      "Services written for your trade",
                      "Cover photo & gallery added for you",
                      "About, Why-us & FAQs written for you",
                      "SEO, Google Maps & WhatsApp button set up",
                      "Live on your own link right away",
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  {form.services.length > 0 && (
                    <div className="border-t border-border px-5 py-4">
                      <p className="text-xs font-semibold text-muted-foreground">Services on your website</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {form.services.map((s) => (
                          <span key={s.id} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {industryLoading && (
                    <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground" role="status">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Writing services for {finalCategory}…
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-center">
                  <Button
                    type="button"
                    size="lg"
                    onClick={submitOnboarding}
                    disabled={submitting || industryLoading}
                    className="h-12 w-full rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Rocket className="h-5 w-5" aria-hidden="true" />
                    )}
                    {submitting ? "Creating your website…" : "Create My Website"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {TRIAL_LABEL} starts today — no payment now. Colours, photos, services and text can all be
                    changed anytime.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ---------------- sticky bottom nav ---------------- */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-2xl border-t border-border bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={step === 1 || submitting}
              className={`rounded-xl text-muted-foreground hover:bg-muted ${step === 1 ? "invisible" : ""}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Step {step} of {TOTAL_STEPS}
              </span>
              {step < TOTAL_STEPS ? (
                <Button
                  type="button"
                  onClick={next}
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={submitOnboarding}
                  disabled={submitting}
                  className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Rocket className="h-4 w-4" aria-hidden="true" />
                  )}
                  Create My Website 🚀
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-card py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        © WebSetu — Setup wizard
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- small parts

function StepHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground sm:text-xl">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

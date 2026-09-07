"use client";
// WebSetu — Onboarding Wizard (Task 6-b)
// 7 steps: Business → Branding → Services → Contact → Template → Preview → Publish
// Draft persists to localStorage("websetu_onboarding_draft"); cleared after success.
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, Briefcase, Building2, Check, Globe, ImagePlus,
  LayoutTemplate, Loader2, Lock, MapPin, Palette, Phone, Plus, Rocket, Search,
  Sparkles, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { SECTION_LIBRARY } from "@/lib/sections";
import type { AiSiteContent } from "@/lib/sections";
import { isValidUpiId } from "@/lib/site-utils";
import { BRAND_PALETTES } from "@/lib/palettes";
import type { Plan, TemplateDef } from "@/lib/types";
import { useApp } from "@/store/app-store";
import type { BusinessWithMeta } from "@/store/app-store";

// ---------------------------------------------------------------- constants

const DRAFT_KEY = "websetu_onboarding_draft";
const TOTAL_STEPS = 7;
const STEP_LABELS = ["Business", "Branding", "Services", "Contact", "Template", "Preview", "Publish"];

const CATEGORIES = [
  "Manufacturer", "Distributor", "Wholesaler", "Retailer", "Restaurant", "Hotel",
  "Clinic", "Hospital", "Doctor", "Dentist", "Salon", "Beauty Parlour", "Gym",
  "Fitness Center", "Consultant", "Lawyer", "CA", "Architect", "Contractor",
  "Real Estate", "Construction", "Automobile", "Garage", "Education", "Coaching",
  "School", "College", "Travel Agency", "Logistics", "Transport", "IT Company",
  "Software Company", "Digital Marketing", "Freelancer", "Photographer",
  "Event Management", "Interior Designer", "Electrical", "Plumbing", "Hardware",
  "Agriculture", "Trading", "Service Provider", "Local Shop", "Other",
];

const SERVICE_SUGGESTIONS: Record<string, string[]> = {
  Electrical: ["House Wiring", "Emergency Repairs", "Panel Upgrade", "Solar Setup"],
  Plumbing: ["Leak Repair", "Bathroom Fitting", "Drain Cleaning", "Water Tank Setup"],
  Restaurant: ["Dine-in", "Takeaway", "Catering", "Home Delivery"],
  Hotel: ["AC Rooms", "Banquet Hall", "Restaurant", "Airport Pickup"],
  Salon: ["Haircut & Styling", "Bridal Makeup", "Facial & Cleanup", "Hair Spa"],
  "Beauty Parlour": ["Bridal Makeup", "Facials", "Mehndi", "Waxing"],
  Gym: ["Personal Training", "Weight Training", "Yoga Classes", "Diet Plans"],
  "Fitness Center": ["Personal Training", "Cardio Zone", "Strength Training", "Diet Plans"],
  Lawyer: ["Legal Consultation", "Property Cases", "Corporate Law", "Family Law"],
  CA: ["GST Filing", "Income Tax Return", "Company Registration", "Audit & Assurance"],
  Doctor: ["General Consultation", "Health Checkup", "Vaccination", "Follow-up Care"],
  Clinic: ["General Consultation", "Lab Tests", "Health Checkup", "Vaccination"],
  Dentist: ["Root Canal", "Teeth Cleaning", "Braces & Aligners", "Teeth Whitening"],
  "Real Estate": ["Property Buying", "Property Selling", "Rental Assistance", "Site Visits"],
  "Travel Agency": ["Domestic Tours", "International Packages", "Flight Booking", "Hotel Booking"],
  "IT Company": ["Web Development", "Mobile Apps", "Cloud Solutions", "IT Support"],
  "Software Company": ["Custom Software", "Web Development", "Mobile Apps", "Maintenance"],
  "Digital Marketing": ["SEO Services", "Social Media Marketing", "Google Ads", "Content Marketing"],
  Photographer: ["Wedding Photography", "Pre-wedding Shoots", "Product Photography", "Event Coverage"],
  "Event Management": ["Wedding Planning", "Corporate Events", "Birthday Parties", "Decorations"],
  "Interior Designer": ["Full Home Interiors", "Modular Kitchen", "Office Design", "Space Planning"],
  Coaching: ["Foundation Courses", "Crash Courses", "Doubt Sessions", "Test Series"],
  Automobile: ["Car Servicing", "Denting & Painting", "AC Repair", "Insurance Renewal"],
  Garage: ["Car Servicing", "Denting & Painting", "AC Repair", "Engine Diagnostics"],
  Hardware: ["Cement & Bricks", "Paints & Tools", "Sanitaryware", "Electrical Supplies"],
  Contractor: ["New Construction", "Renovation", "Estimation", "Labour Supply"],
  Construction: ["New Construction", "Renovation", "Estimation", "Labour Supply"],
  School: ["Admissions", "Smart Classrooms", "Sports & Arts", "Transport"],
  College: ["Admissions", "Placement Cell", "Scholarships", "Hostel"],
  Hospital: ["Emergency Care", "OPD", "Diagnostics", "Pharmacy"],
};
const GENERIC_SUGGESTIONS = ["Consultation", "Installation", "Maintenance", "Support"];

const COVER_PRESETS = [
  { id: "gradient-emerald", label: "Emerald Flow", css: "linear-gradient(135deg, #059669, #0f766e)" },
  { id: "gradient-amber", label: "Amber Glow", css: "linear-gradient(135deg, #f59e0b, #ea580c)" },
  { id: "gradient-rose", label: "Sunset Rose", css: "linear-gradient(135deg, #f43f5e, #f97316)" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly & Warm" },
  { value: "premium", label: "Premium & Bold" },
];

// Tailwind gradient classes come from the API (not in source), so we render them
// with an equivalent inline linear-gradient — robust for any template.
const TW_HEX: Record<string, string> = {
  emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9",
  amber: "#f59e0b", yellow: "#eab308", orange: "#f97316", red: "#ef4444",
  rose: "#f43f5e", pink: "#ec4899", fuchsia: "#d946ef", purple: "#a855f7",
  violet: "#8b5cf6", indigo: "#6366f1", blue: "#3b82f6", lime: "#84cc16",
  green: "#22c55e", stone: "#78716c", zinc: "#71717a", slate: "#64748b",
  gray: "#6b7280", neutral: "#737373",
};

function twShade(hexColor: string, shade: number): string {
  const delta = shade - 500; // 500 is the base shade
  if (delta === 0) return hexColor;
  const pct = Math.min(70, Math.round(Math.abs(delta) / 5));
  const mixWith = delta < 0 ? "white" : "black";
  return `color-mix(in srgb, ${hexColor} ${100 - pct}%, ${mixWith} ${pct}%)`;
}

function gradientCss(gradient: string): string {
  const from = /from-([a-z]+)-(\d{2,3})/.exec(gradient || "");
  const to = /to-([a-z]+)-(\d{2,3})/.exec(gradient || "");
  const pick = (m: RegExpExecArray | null) =>
    m ? twShade(TW_HEX[m[1]] || "#71717a", Number(m[2])) : "#10b981";
  return `linear-gradient(135deg, ${pick(from)}, ${pick(to)})`;
}

/** Max bytes accepted by POST /api/upload (server enforces the same limit). */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Files at or under this size are uploaded as-is; bigger ones are downscaled first. */
const UPLOAD_DIRECT_LIMIT = 400 * 1024;

/** Downscale an image file via canvas and return a JPEG File (never dataURLs). */
async function downscaleToJpegFile(file: File, maxWidth: number): Promise<File> {
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Could not read that image. Please try another one."));
      im.src = objUrl;
    });
    const scale = Math.min(1, maxWidth / (img.width || maxWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.width || maxWidth) * scale));
    canvas.height = Math.max(1, Math.round((img.height || maxWidth) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image — try a different one.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("Could not process this image — try a different one.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

// ---------------------------------------------------------------- state

interface ServiceDraft { id: string; name: string; description: string; }

interface OnboardingForm {
  // Step 1
  category: string;
  customCategory: string;
  name: string;
  tagline: string;
  description: string;
  establishedYear: string;
  // Step 2
  logoUrl: string;
  coverUrl: string;
  coverPreset: string;
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  // Step 3
  services: ServiceDraft[];
  // Step 4
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
  // Step 5
  templateId: string;
  // Step 6
  tone: string;
  ai: AiSiteContent | null;
  // Step 7
  selectedPlanId: string;
}

const DEFAULT_FORM: OnboardingForm = {
  category: "",
  customCategory: "",
  name: "",
  tagline: "",
  description: "",
  establishedYear: "",
  logoUrl: "",
  coverUrl: "",
  coverPreset: "",
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
  templateId: "",
  tone: "professional",
  ai: null,
  selectedPlanId: "",
};

const WIZARD_STYLES = `
@keyframes ws-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes ws-pop { 0% { transform: scale(0.3); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
.ws-shake { animation: ws-shake 0.45s ease-in-out; }
.ws-pop { animation: ws-pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.35) both; }
`;

// ---------------------------------------------------------------- component

export default function OnboardingView() {
  const { toast } = useToast();
  const user = useApp((s) => s.user);
  const storePlans = useApp((s) => s.plans);
  const setBusiness = useApp((s) => s.setBusiness);
  const openSite = useApp((s) => s.openSite);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [svcName, setSvcName] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [success, setSuccess] = useState<BusinessWithMeta | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const catalogFetched = useRef(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const finalCategory = form.category === "Other" ? form.customCategory.trim() : form.category;
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const slugGuess = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "your-business";

  // ---- draft: restore on mount, persist on change, clear after success
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { step?: number; form?: Partial<OnboardingForm> };
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

  // ---- fetch templates + plans when reaching step 5
  useEffect(() => {
    if (step < 5 || catalogFetched.current) return;
    catalogFetched.current = true;
    setCatalogLoading(true);
    api.get<{ plans: Plan[]; templates: TemplateDef[] }>("/api/plans")
      .then((d) => {
        setPlans(d.plans);
        setTemplates(d.templates);
        setForm((f) => ({
          ...f,
          templateId: f.templateId || d.templates[0]?.id || "",
          selectedPlanId:
            f.selectedPlanId || d.plans.find((p) => p.popular)?.id || d.plans[0]?.id || "",
        }));
      })
      .catch(() => {
        catalogFetched.current = false;
        const fallback = useApp.getState().plans;
        if (fallback.length) setPlans(fallback);
        setError("Could not load templates & plans. Tap Retry — you can still review earlier steps.");
      })
      .finally(() => setCatalogLoading(false));
  }, [step, catalogRetry]);

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
    if (n === 3 && form.services.length === 0)
      return "Add at least one service — it powers your website content.";
    if (n === 4) {
      if (!form.phone.trim()) return "Phone number is required.";
      if (!form.city.trim()) return "City is required.";
      if (form.upiId.trim() && !isValidUpiId(form.upiId.trim()))
        return "Please enter a valid UPI ID (like name@okicici) — or leave it empty.";
    }
    if (n === 5 && !form.templateId) return "Please pick a website template to continue.";
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
    goToStep(Math.min(TOTAL_STEPS, step + 1));
  }

  function back() {
    goToStep(Math.max(1, step - 1));
  }

  function setField<K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setAiField<K extends keyof AiSiteContent>(key: K, value: AiSiteContent[K]) {
    setForm((f) => ({ ...f, ai: { ...(f.ai || {}), [key]: value } }));
  }

  // ---- image upload (logo / cover) --------------------------------------

  function applyImage(kind: "logo" | "cover", url: string) {
    setForm((f) =>
      kind === "logo"
        ? { ...f, logoUrl: url }
        : { ...f, coverUrl: url, coverPreset: "" },
    );
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>, kind: "logo" | "cover") {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      toast({
        title: "Image too large",
        description: "Keep it under 4 MB — larger photos are optimised automatically.",
        variant: "destructive",
      });
      return;
    }
    setUploading(kind);
    try {
      // Small files upload untouched; bigger ones are downscaled via canvas first.
      const toUpload =
        file.size > UPLOAD_DIRECT_LIMIT
          ? await downscaleToJpegFile(file, kind === "logo" ? 480 : 1400)
          : file;
      const res = await api.upload<{ url: string }>("/api/upload", toUpload);
      applyImage(kind, res.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed — please try again.";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  // ---- services ----------------------------------------------------------

  function addService(name: string, description = "") {
    const n = name.trim();
    if (!n) {
      toast({ title: "Enter a service name first", variant: "destructive" });
      return;
    }
    if (form.services.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
      toast({ title: "Already added", description: `"${n}" is in your services list.` });
      return;
    }
    const item: ServiceDraft = {
      id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: n,
      description: description.trim(),
    };
    setForm((f) => ({ ...f, services: [...f.services, item] }));
  }

  function addSvcFromForm() {
    addService(svcName, svcDesc);
    setSvcName("");
    setSvcDesc("");
  }

  function removeService(id: string) {
    setForm((f) => ({ ...f, services: f.services.filter((s) => s.id !== id) }));
  }

  const suggestions = SERVICE_SUGGESTIONS[finalCategory] || GENERIC_SUGGESTIONS;
  const suggestionList = suggestions.filter(
    (s) => !form.services.some((x) => x.name.toLowerCase() === s.toLowerCase()),
  );

  // ---- AI generation ------------------------------------------------------

  async function generateAi() {
    if (aiLoading) return;
    setAiLoading(true);
    setError("");
    try {
      const res = await api.post<{ content: AiSiteContent }>("/api/ai/generate", {
        name: form.name.trim(),
        category: finalCategory,
        city: form.city.trim(),
        services: form.services.map((s) => s.name),
        description: form.description.trim(),
        tone: form.tone,
      });
      setForm((f) => ({ ...f, ai: res.content }));
      toast({ title: "✨ Content ready!", description: "Review and edit it below — regenerate anytime." });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "AI service is unavailable right now.";
      setError(`${msg} — no problem, you can still continue. Standard content will be used.`);
      toast({
        title: "AI generation failed",
        description: "You can still continue — smart fallback content will be used.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  }

  // ---- final submit -------------------------------------------------------

  async function submitOnboarding() {
    if (submitting) return;
    const msg = validateStep(1) || validateStep(3) || validateStep(4) || validateStep(5);
    if (msg) {
      fail(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    const whatsapp = form.whatsappSame ? form.phone.trim() : form.whatsapp.trim();
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
        logoUrl: form.logoUrl,
        coverUrl: form.coverUrl,
        coverPreset: form.coverPreset,
        brandPrimary: form.brandPrimary,
        brandSecondary: form.brandSecondary,
        brandAccent: form.brandAccent,
        templateId: form.templateId,
        gmbUrl: form.gmbUrl.trim(),
        mapsUrl: form.mapsUrl.trim(),
        ai: form.ai,
        selectedPlanId: form.selectedPlanId,
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
        description: `${biz.name} was created — 14-day free trial started.`,
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
      <div className="flex min-h-screen flex-col bg-[#fafaf9]">
        <style>{WIZARD_STYLES}</style>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <Card className="w-full max-w-md rounded-2xl border-zinc-200 text-center shadow-sm">
            <CardContent className="p-8">
              <div className="ws-pop mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/30">
                <Check className="h-10 w-10 text-white" strokeWidth={3} aria-hidden="true" />
              </div>
              <h1 className="mt-6 text-2xl font-bold text-zinc-900">Your website is ready! 🎉</h1>
              <p className="mt-2 text-sm text-zinc-500">
                <span className="font-semibold text-zinc-800">{success.name}</span> is live on your
                14-day free trial at{" "}
                <span className="font-mono text-xs text-emerald-700">websetu.in/{success.slug}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  14-day free trial
                </Badge>
                <Badge variant="outline" className="rounded-full border-zinc-300 text-zinc-600">
                  {success.category}
                </Badge>
                {success.templateId && (
                  <Badge variant="outline" className="rounded-full border-zinc-300 text-zinc-600">
                    Template applied
                  </Badge>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Button
                  className="h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    window.location.hash = "#/dashboard";
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
              <p className="mt-5 text-xs text-zinc-400">
                Tip: add photos, products & testimonials from the dashboard to boost your health score.
              </p>
            </CardContent>
          </Card>
        </main>
        <footer className="mt-auto border-t border-zinc-200 bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-zinc-500">
          © WebSetu — Setup wizard
        </footer>
      </div>
    );
  }

  // ================================================================ WIZARD

  const filteredCats = CATEGORIES.filter((c) =>
    c.toLowerCase().includes(catSearch.trim().toLowerCase()),
  );
  const selectedTemplate = templates.find((t) => t.id === form.templateId) || null;

  const coverPreviewStyle: CSSProperties = form.coverPreset
    ? { backgroundImage: COVER_PRESETS.find((p) => p.id === form.coverPreset)?.css }
    : {};

  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf9]">
      <style>{WIZARD_STYLES}</style>

      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
                W
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-zinc-900">WebSetu</p>
                <p className="text-[11px] font-medium text-zinc-500">Website Setup</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-zinc-700 sm:text-sm">
                Website Setup {pct}% Complete
              </p>
              <p className="text-[11px] text-zinc-500 sm:hidden">Step {step} of {TOTAL_STEPS}</p>
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
                          ? "border-2 border-emerald-600 bg-white text-emerald-700"
                          : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      current ? "text-zinc-900" : done ? "text-zinc-600" : "text-zinc-400"
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
              {step >= 5 && !templates.length && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg border-red-300 bg-white text-red-700 hover:bg-red-50"
                  onClick={() => setCatalogRetry((r) => r + 1)}
                >
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div
          className={`overflow-visible rounded-2xl border border-zinc-200 bg-white shadow-sm ${
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
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
                    className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
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
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
                            }`}
                          >
                            {c}
                            {active && <Check className="h-3 w-3" aria-hidden="true" />}
                          </button>
                        );
                      })}
                      {filteredCats.length === 0 && (
                        <p className="px-1 py-2 text-sm text-zinc-500">
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
                    <Label htmlFor="biz-tagline">Tagline</Label>
                    <Input
                      id="biz-tagline"
                      placeholder="e.g. Wiring trust since 1995"
                      value={form.tagline}
                      onChange={(e) => setField("tagline", e.target.value)}
                      className="rounded-xl"
                    />
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
                  <p className="text-xs text-zinc-500">
                    Optional — the AI in Step 6 can write this better for you.
                  </p>
                </div>

                <div className="space-y-2 sm:max-w-[220px]">
                  <Label htmlFor="biz-year">
                    Established year <span className="text-zinc-400">(optional)</span>
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

            {/* ============================ STEP 2 — BRANDING */}
            {step === 2 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Palette className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Branding — make it yours"
                  sub="Logo, cover and colors. You can change these anytime in the dashboard."
                />

                {/* Logo */}
                <div className="space-y-4 rounded-2xl border border-zinc-200 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-zinc-800">
                    Logo <span className="font-normal text-zinc-500">for {form.name || "your business"}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-600/25 bg-emerald-50 text-xl font-bold text-emerald-700">
                      {form.logoUrl ? (
                        <img
                          src={form.logoUrl}
                          alt="Business logo preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (form.name.trim()[0] || "B").toUpperCase()
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <input
                        ref={logoInputRef}
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        aria-label="Upload logo image"
                        onChange={(e) => onPickImage(e, "logo")}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          disabled={uploading !== null}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {uploading === "logo" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Upload className="h-4 w-4" aria-hidden="true" />
                          )}
                          {uploading === "logo" ? "Uploading…" : "Upload logo"}
                        </Button>
                        {form.logoUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={uploading !== null}
                            onClick={() => setField("logoUrl", "")}
                          >
                            <X className="h-4 w-4" aria-hidden="true" /> Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">
                        PNG/JPG up to 4 MB — big images are optimised automatically. No logo?
                        We&apos;ll use your initial automatically.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cover */}
                <div className="space-y-4 rounded-2xl border border-zinc-200 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-zinc-800">Cover image</p>
                  <div
                    className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
                    style={coverPreviewStyle}
                  >
                    {form.coverUrl ? (
                      <img
                        src={form.coverUrl}
                        alt="Cover image preview"
                        className="h-full w-full object-cover"
                      />
                    ) : form.coverPreset ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImagePlus className="h-8 w-8 text-white/80" aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,#f4f4f5_0px,#f4f4f5_12px,#fafafa_12px,#fafafa_24px)]">
                        <p className="px-4 text-center text-xs text-zinc-400">
                          No cover yet — upload one or pick a gradient below
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    id="cover-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Upload cover image"
                    onChange={(e) => onPickImage(e, "cover")}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      disabled={uploading !== null}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {uploading === "cover" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden="true" />
                      )}
                      {uploading === "cover" ? "Uploading…" : "Upload cover"}
                    </Button>
                    {(form.coverUrl || form.coverPreset) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={uploading !== null}
                        onClick={() => setForm((f) => ({ ...f, coverUrl: "", coverPreset: "" }))}
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> Clear
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-600">
                      …or pick a ready-made gradient:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {COVER_PRESETS.map((p) => {
                        const active = form.coverPreset === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={active}
                            disabled={uploading !== null}
                            onClick={() =>
                              setForm((f) => ({ ...f, coverUrl: "", coverPreset: p.id }))
                            }
                            className={`relative h-14 overflow-hidden rounded-xl text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                              active ? "ring-2 ring-emerald-600 ring-offset-2" : "hover:opacity-90"
                            }`}
                            style={{ backgroundImage: p.css }}
                          >
                            <span className="absolute inset-x-0 bottom-0 bg-black/25 py-0.5 text-[10px] font-semibold">
                              {p.label}
                            </span>
                            {active && (
                              <Check
                                className="absolute left-1/2 top-1.5 h-4 w-4 -translate-x-1/2"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Brand colors */}
                <div className="space-y-4 rounded-2xl border border-zinc-200 p-4 sm:p-5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
                    <Palette className="h-4 w-4 text-amber-500" aria-hidden="true" /> Color palette
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BRAND_PALETTES.map((p) => {
                      const active =
                        p.colors[0].toLowerCase() === form.brandPrimary.toLowerCase() &&
                        p.colors[1].toLowerCase() === form.brandSecondary.toLowerCase() &&
                        p.colors[2].toLowerCase() === form.brandAccent.toLowerCase();
                      return (
                        <button
                          key={p.name}
                          type="button"
                          aria-pressed={active}
                          aria-label={`Use ${p.name} palette`}
                          onClick={() => {
                            setField("brandPrimary", p.colors[0]);
                            setField("brandSecondary", p.colors[1]);
                            setField("brandAccent", p.colors[2]);
                          }}
                          className={`flex items-center gap-2 rounded-xl border bg-white p-2 text-left transition hover:border-emerald-400 hover:shadow-sm ${
                            active ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200"
                          }`}
                        >
                          <span className="flex h-7 w-9 shrink-0 overflow-hidden rounded-md border border-zinc-100">
                            <span className="h-full flex-1" style={{ background: p.colors[0] }} />
                            <span className="h-full flex-1" style={{ background: p.colors[1] }} />
                            <span className="h-full flex-1" style={{ background: p.colors[2] }} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold text-zinc-800">{p.name}</span>
                            <span className="block truncate text-[10px] text-zinc-400">{p.mood}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-zinc-400">Pick a ready palette — or fine-tune each color below.</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <ColorField
                      id="brand-primary"
                      label="Primary"
                      value={form.brandPrimary}
                      onChange={(v) => setField("brandPrimary", v)}
                    />
                    <ColorField
                      id="brand-secondary"
                      label="Secondary"
                      value={form.brandSecondary}
                      onChange={(v) => setField("brandSecondary", v)}
                    />
                    <ColorField
                      id="brand-accent"
                      label="Accent"
                      value={form.brandAccent}
                      onChange={(v) => setField("brandAccent", v)}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-zinc-600">Live preview</p>
                    <div className="flex overflow-hidden rounded-xl border border-zinc-200">
                      <div className="h-10 flex-[3]" style={{ background: form.brandPrimary }} />
                      <div className="h-10 flex-[2]" style={{ background: form.brandSecondary }} />
                      <div className="h-10 flex-1" style={{ background: form.brandAccent }} />
                      <div
                        className="flex h-10 flex-[3] items-center justify-center gap-2 text-xs font-semibold text-white"
                        style={{
                          background: `linear-gradient(135deg, ${form.brandPrimary}, ${form.brandSecondary})`,
                        }}
                      >
                        <span className="rounded-md bg-white/95 px-2 py-1" style={{ color: form.brandPrimary }}>
                          Get a Quote
                        </span>
                        <span className="rounded-md px-2 py-1" style={{ background: form.brandAccent }}>
                          Call
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================ STEP 3 — SERVICES */}
            {step === 3 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Briefcase className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Your services"
                  sub="What do you offer? Add at least one — the AI uses these to write your copy."
                />

                <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 sm:p-5">
                  <div className="space-y-2">
                    <Label htmlFor="svc-name">Add a service</Label>
                    <Input
                      id="svc-name"
                      placeholder="e.g. House Wiring"
                      value={svcName}
                      onChange={(e) => setSvcName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSvcFromForm();
                        }
                      }}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="svc-desc">
                      Short description <span className="text-zinc-400">(optional)</span>
                    </Label>
                    <Textarea
                      id="svc-desc"
                      rows={2}
                      placeholder="One line about this service…"
                      value={svcDesc}
                      onChange={(e) => setSvcDesc(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={addSvcFromForm}
                    className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add service
                  </Button>
                </div>

                {suggestionList.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                      Quick add for {finalCategory || "your business"}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestionList.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => addService(s)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.services.length > 0 ? (
                  <ul className="space-y-2">
                    {form.services.map((s, i) => (
                      <li
                        key={s.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3.5"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">{s.name}</p>
                            {s.description && (
                              <p className="mt-0.5 text-xs text-zinc-500">{s.description}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove service ${s.name}`}
                          className="h-8 w-8 shrink-0 rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => removeService(s.id)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                    No services yet — add your first above or tap a quick-add chip.
                  </p>
                )}
              </div>
            )}

            {/* ============================ STEP 4 — CONTACT */}
            {step === 4 && (
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
                      id="ct-phone"
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className="rounded-xl"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex min-h-[20px] items-center gap-2">
                      <Checkbox
                        id="wa-same"
                        checked={form.whatsappSame}
                        onCheckedChange={(c) => setField("whatsappSame", c === true)}
                      />
                      <Label htmlFor="wa-same" className="text-xs font-normal text-zinc-600">
                        WhatsApp is the same number
                      </Label>
                    </div>
                    {form.whatsappSame ? (
                      <p className="text-xs text-zinc-400">
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
                    <Label htmlFor="ct-address">Full address</Label>
                    <Textarea
                      id="ct-address"
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
                      GSTIN <span className="text-zinc-400">(optional)</span>
                    </Label>
                    <Input
                      id="ct-gstin"
                      placeholder="e.g. 27ABCDE1234F1Z5"
                      value={form.gstin}
                      onChange={(e) => setField("gstin", e.target.value.toUpperCase())}
                      className="rounded-xl font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="ct-upi">
                      UPI ID (for payments) <span className="text-zinc-400">(optional)</span>
                    </Label>
                    <Input
                      id="ct-upi"
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
                      <p className="text-xs text-zinc-500">
                        Visitors get a Scan &amp; Pay QR on your website automatically. Example:
                        name@okicici
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-zinc-200 p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
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
                    <p className="text-xs text-zinc-500">
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

            {/* ============================ STEP 5 — TEMPLATE */}
            {step === 5 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<LayoutTemplate className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Pick your template"
                  sub="Every template is mobile-ready and SEO-friendly. You can switch later."
                />

                {catalogLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-24 w-full rounded-2xl" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Website template"
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {templates.map((t) => {
                      const active = form.templateId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setField("templateId", t.id)}
                          className={`group overflow-hidden rounded-2xl border bg-white text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                            active
                              ? "border-emerald-600 ring-2 ring-emerald-600"
                              : "border-zinc-200 hover:border-emerald-300 hover:shadow-md"
                          }`}
                        >
                          <div
                            className="relative h-24"
                            style={{ backgroundImage: gradientCss(t.gradient) }}
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3">
                              <div className="h-2 w-16 rounded-full bg-white/85" />
                              <div className="h-1.5 w-24 rounded-full bg-white/50" />
                              <div className="mt-1.5 flex gap-1">
                                <div className="h-4 w-10 rounded bg-white/90" />
                                <div className="h-4 w-10 rounded bg-white/40" />
                              </div>
                            </div>
                            {t.premium && (
                              <Badge className="absolute right-2 top-2 rounded-full bg-amber-500 text-white hover:bg-amber-500">
                                Premium
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1.5 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                              {active && (
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                                  <Check className="h-3 w-3 text-white" aria-hidden="true" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">
                              <span className="font-medium text-zinc-600">{t.category}</span>
                              {" · "}
                              {t.description}
                            </p>
                            {active && (
                              <div className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                                <span
                                  className="h-5 w-5 shrink-0 rounded-full border border-white shadow"
                                  style={{ background: form.brandPrimary }}
                                  aria-hidden="true"
                                />
                                <span
                                  className="h-5 w-5 shrink-0 rounded-full border border-white shadow"
                                  style={{ background: form.brandSecondary }}
                                  aria-hidden="true"
                                />
                                <span
                                  className="h-5 w-5 shrink-0 rounded-full border border-white shadow"
                                  style={{ background: form.brandAccent }}
                                  aria-hidden="true"
                                />
                                <span
                                  className="h-5 flex-1 rounded"
                                  style={{
                                    background: `linear-gradient(90deg, ${form.brandPrimary}, ${form.brandSecondary})`,
                                  }}
                                  aria-hidden="true"
                                />
                                <span className="text-[10px] font-medium text-zinc-500">
                                  Your colors
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {!templates.length && (
                      <p className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                        Templates could not be loaded. Use the Retry button above.
                      </p>
                    )}
                  </div>
                )}

                {selectedTemplate && (
                  <p className="text-xs text-zinc-500">
                    Selected: <span className="font-semibold text-zinc-800">{selectedTemplate.name}</span>
                    {selectedTemplate.premium && " — included free during early access."}
                  </p>
                )}
              </div>
            )}

            {/* ============================ STEP 6 — AI + PREVIEW */}
            {step === 6 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Sparkles className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="AI content + live preview"
                  sub="Let AI write your headline, about and FAQs — then tweak anything you like."
                />

                {/* AI generator */}
                <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        ✨ Generate my website content with AI
                      </p>
                      <p className="text-xs text-zinc-500">
                        Uses your business info from the previous steps.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={form.tone} onValueChange={(v) => setField("tone", v)}>
                        <SelectTrigger
                          className="w-[160px] rounded-xl border-zinc-300 bg-white"
                          aria-label="Content tone"
                        >
                          <SelectValue placeholder="Tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TONES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={generateAi}
                        disabled={aiLoading}
                        className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {aiLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                        )}
                        {form.ai ? "Regenerate" : "Generate content"}
                      </Button>
                    </div>
                  </div>

                  {aiLoading && (
                    <div
                      className="space-y-3 rounded-xl border border-emerald-200 bg-white p-4"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-zinc-800">Writing your content…</p>
                          <p className="text-xs text-zinc-500">
                            Headline, about, FAQs & SEO — usually 10–20 seconds.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    </div>
                  )}

                  {form.ai && !aiLoading && (
                    <div className="space-y-4">
                      {/* generated hero preview */}
                      <div
                        className="overflow-hidden rounded-xl text-white"
                        style={{
                          background: `linear-gradient(135deg, ${form.brandPrimary}, ${form.brandSecondary})`,
                        }}
                      >
                        <div className="p-5 sm:p-6">
                          {form.ai.heroBadge && (
                            <span className="inline-block rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-semibold">
                              {form.ai.heroBadge}
                            </span>
                          )}
                          <p className="mt-2 text-xl font-bold leading-snug sm:text-2xl">
                            {form.ai.heroHeading}
                          </p>
                          <p className="mt-1.5 text-sm text-white/85">{form.ai.heroSubheading}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span
                              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold"
                              style={{ color: form.brandPrimary }}
                            >
                              {form.ai.ctaPrimary || "Get a Free Quote"}
                            </span>
                            <span className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white">
                              {form.ai.ctaSecondary || "Call Now"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* editable content */}
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-heading">Headline</Label>
                          <Input
                            id="ai-heading"
                            value={form.ai.heroHeading || ""}
                            onChange={(e) => setAiField("heroHeading", e.target.value)}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-subheading">Subheading</Label>
                          <Textarea
                            id="ai-subheading"
                            rows={2}
                            value={form.ai.heroSubheading || ""}
                            onChange={(e) => setAiField("heroSubheading", e.target.value)}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-about">About your business</Label>
                          <Textarea
                            id="ai-about"
                            rows={4}
                            value={form.ai.about || ""}
                            onChange={(e) => setAiField("about", e.target.value)}
                            className="rounded-xl"
                          />
                        </div>
                      </div>

                      {/* stats */}
                      {form.ai.stats && form.ai.stats.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {form.ai.stats.slice(0, 4).map((s, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-zinc-200 bg-white p-3 text-center"
                            >
                              <p className="text-lg font-bold text-emerald-700">{s.value}</p>
                              <p className="text-[11px] text-zinc-500">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* FAQs collapsed */}
                      {form.ai.faqs && form.ai.faqs.length > 0 && (
                        <Accordion
                          type="single"
                          collapsible
                          className="rounded-xl border border-zinc-200 bg-white px-4"
                        >
                          {form.ai.faqs.map((f, i) => (
                            <AccordionItem key={i} value={`faq-${i}`}>
                              <AccordionTrigger className="text-left text-sm font-medium text-zinc-800">
                                {f.question}
                              </AccordionTrigger>
                              <AccordionContent className="text-sm text-zinc-600">
                                {f.answer}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      )}

                      {(form.ai.seoTitle || form.ai.seoDescription) && (
                        <p className="text-xs text-zinc-500">
                          <span className="font-semibold text-zinc-700">SEO:</span>{" "}
                          {form.ai.seoTitle}
                          {form.ai.seoDescription ? ` — ${form.ai.seoDescription}` : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {!form.ai && !aiLoading && (
                    <p className="rounded-xl border border-dashed border-emerald-300 bg-white p-4 text-center text-sm text-zinc-500">
                      No content yet — hit <span className="font-semibold text-emerald-700">Generate content</span>{" "}
                      above, or continue and our smart fallback will fill it in.
                    </p>
                  )}
                </div>

                {/* Full mock preview in browser chrome */}
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden="true" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="mx-auto flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] text-zinc-500">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      websetu.in/{slugGuess}
                    </span>
                    <span className="w-10" aria-hidden="true" />
                  </div>

                  <div className="max-h-[520px] overflow-y-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar]:w-1.5">
                    {/* mini hero */}
                    <div
                      className="p-6 text-white sm:p-8"
                      style={{
                        background: `linear-gradient(135deg, ${form.brandPrimary}, ${form.brandSecondary})`,
                      }}
                    >
                      <span className="inline-block rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-semibold">
                        {form.ai?.heroBadge || `★ Trusted in ${form.city || "India"}`}
                      </span>
                      <h3 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">
                        {form.ai?.heroHeading || form.name || "Your Business Name"}
                      </h3>
                      <p className="mt-1.5 max-w-lg text-sm text-white/85">
                        {form.ai?.heroSubheading ||
                          form.tagline ||
                          `Trusted ${finalCategory || "business"} in ${form.city || "your city"}`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold"
                          style={{ color: form.brandPrimary }}
                        >
                          {form.ai?.ctaPrimary || "Get a Free Quote"}
                        </span>
                        <span className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold">
                          {form.ai?.ctaSecondary || "Call Now"}
                        </span>
                      </div>
                    </div>

                    {/* stats strip */}
                    {form.ai?.stats && form.ai.stats.length > 0 && (
                      <div className="grid grid-cols-2 gap-px bg-zinc-200 sm:grid-cols-4">
                        {form.ai.stats.slice(0, 4).map((s, i) => (
                          <div key={i} className="bg-white p-3 text-center">
                            <p className="text-base font-bold" style={{ color: form.brandPrimary }}>
                              {s.value}
                            </p>
                            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* about wireframe */}
                    {(form.ai?.about || form.description) && (
                      <div className="border-t border-zinc-100 p-5 sm:p-6">
                        <p className="text-sm font-bold text-zinc-900">
                          About {form.name || "Us"}
                        </p>
                        <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-zinc-600">
                          {form.ai?.about || form.description}
                        </p>
                      </div>
                    )}

                    {/* services wireframe */}
                    {form.services.length > 0 && (
                      <div className="border-t border-zinc-100 p-5 sm:p-6">
                        <p className="text-sm font-bold text-zinc-900">Our Services</p>
                        <p className="text-xs text-zinc-500">
                          What we offer in {form.city || "your area"}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {form.services.slice(0, 6).map((s) => (
                            <div
                              key={s.id}
                              className="rounded-xl border border-zinc-200 p-3"
                              style={{ borderTopColor: form.brandAccent, borderTopWidth: 2 }}
                            >
                              <p className="text-xs font-semibold text-zinc-900">{s.name}</p>
                              {s.description && (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                                  {s.description}
                                </p>
                              )}
                              <p
                                className="mt-1.5 text-[10px] font-semibold"
                                style={{ color: form.brandPrimary }}
                              >
                                Enquire →
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* contact strip */}
                    <div className="p-5 text-white sm:p-6" style={{ background: "#18181b" }}>
                      <p className="text-sm font-bold">Ready to work with {form.name || "us"}?</p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Call, WhatsApp or send an enquiry — we respond fast.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-lg px-3 py-1.5 font-semibold" style={{ background: form.brandAccent }}>
                          📞 {form.phone || "Your Phone"}
                        </span>
                        <span className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold">
                          WhatsApp Us
                        </span>
                        {form.email && <span className="text-zinc-400">✉ {form.email}</span>}
                      </div>
                    </div>

                    {/* mini footer */}
                    <div className="bg-zinc-100 p-3 text-center text-[10px] text-zinc-500">
                      © {form.name || "Your Business"} · {form.city || "India"} — Powered by WebSetu
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-500">Your site will include:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTION_LIBRARY.map((s) => (
                      <Badge
                        key={s.type}
                        variant="outline"
                        className="rounded-full border-zinc-200 text-[11px] font-normal text-zinc-600"
                      >
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ============================ STEP 7 — PUBLISH */}
            {step === 7 && (
              <div className="space-y-6">
                <StepHeader
                  icon={<Rocket className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
                  title="Choose your plan"
                  sub="Start free — pick a plan anytime during or after your trial."
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Plan">
                  {plans.map((p) => {
                    const active = form.selectedPlanId === p.id;
                    return (
                      <Card
                        key={p.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setField("selectedPlanId", p.id)}
                        className={`relative flex cursor-pointer flex-col rounded-2xl transition-all ${
                          active
                            ? "border-emerald-600 ring-2 ring-emerald-600"
                            : "border-zinc-200 hover:border-emerald-300"
                        } ${p.popular ? "shadow-md" : ""}`}
                      >
                        {p.popular && (
                          <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 text-white hover:bg-amber-500">
                            Most Popular
                          </Badge>
                        )}
                        <CardContent className="flex flex-1 flex-col p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-zinc-900">{p.name}</p>
                            {active && (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600">
                                <Check className="h-3 w-3 text-white" aria-hidden="true" />
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500">{p.tagline}</p>
                          <p className="mt-3">
                            <span className="text-2xl font-extrabold text-zinc-900">₹{p.priceMonthly}</span>
                            <span className="text-xs text-zinc-500">/mo</span>
                          </p>
                          <ul className="mt-3 flex-1 space-y-1.5">
                            {p.features.map((f) => (
                              <li key={f} className="flex items-start gap-1.5 text-xs text-zinc-600">
                                <Check
                                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                                  aria-hidden="true"
                                />
                                {f}
                              </li>
                            ))}
                          </ul>
                          <Button
                            type="button"
                            variant={active ? "default" : "outline"}
                            className={`mt-4 w-full rounded-xl ${
                              active ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setField("selectedPlanId", p.id);
                            }}
                          >
                            {active && <Check className="h-4 w-4" aria-hidden="true" />}
                            Choose {p.name} — ₹{p.priceMonthly}/mo
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {!plans.length && !catalogLoading && (
                    <p className="col-span-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                      Plans could not be loaded — don&apos;t worry, your free trial starts regardless.
                    </p>
                  )}
                  {catalogLoading && (
                    <p className="col-span-full text-center text-sm text-zinc-500">Loading plans…</p>
                  )}
                </div>

                <div className="space-y-2 text-center">
                  <Button
                    type="button"
                    size="lg"
                    onClick={submitOnboarding}
                    disabled={submitting}
                    className="h-12 w-full rounded-xl bg-emerald-600 px-6 text-base font-semibold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Rocket className="h-5 w-5" aria-hidden="true" />
                    )}
                    Start 14-day free trial
                  </Button>
                  <p className="text-xs text-zinc-500">
                    You can pick a plan anytime — your trial starts today, no payment now.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ---------------- sticky bottom nav ---------------- */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-2xl border-t border-zinc-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-8">
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={step === 1 || submitting}
              className={`rounded-xl text-zinc-600 hover:bg-zinc-100 ${step === 1 ? "invisible" : ""}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-zinc-400 sm:inline">
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

      <footer className="mt-auto border-t border-zinc-200 bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-zinc-500">
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
        <h2 className="text-lg font-bold text-zinc-900 sm:text-xl">{title}</h2>
        <p className="mt-0.5 text-sm text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}

function ColorField({
  id, label, value, onChange,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        type="color"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
        aria-label={`${label} brand color`}
      />
      <p className="font-mono text-[11px] text-zinc-400">{value}</p>
    </div>
  );
}

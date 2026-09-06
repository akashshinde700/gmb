// WebSetu seed — plans, templates, coupons, demo customers with full published sites
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hash(password: string): string {
  // mirrors src/lib/auth.ts (scrypt) — keep in sync
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  console.log("🌱 Seeding WebSetu…");

  // ---------- wipe (idempotent seed) ----------
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.analyticsEvent.deleteMany();
  await db.payment.deleteMany();
  await db.subscription.deleteMany();
  await db.lead.deleteMany();
  await db.blogPost.deleteMany();
  await db.faq.deleteMany();
  await db.testimonial.deleteMany();
  await db.galleryItem.deleteMany();
  await db.product.deleteMany();
  await db.service.deleteMany();
  await db.website.deleteMany();
  await db.business.deleteMany();
  await db.platformLead.deleteMany();
  await db.coupon.deleteMany();
  await db.plan.deleteMany();
  await db.template.deleteMany();
  await db.user.deleteMany();

  // ---------- users ----------
  const admin = await db.user.create({
    data: { name: "Platform Admin", email: "admin@websetu.in", passwordHash: hash("admin1234"), role: "ADMIN" },
  });
  const demo = await db.user.create({
    data: { name: "Rajesh Sharma", email: "demo@websetu.in", passwordHash: hash("demo1234"), role: "CUSTOMER" },
  });
  const demo2 = await db.user.create({
    data: { name: "Priya Verma", email: "cafe@websetu.in", passwordHash: hash("cafe1234"), role: "CUSTOMER" },
  });

  // ---------- plans ----------
  const starter = await db.plan.create({
    data: {
      name: "Starter", slug: "starter", tagline: "Get your business online quickly",
      priceMonthly: 499, priceYearly: 4990, maxPages: 5, aiCredits: 5, sortOrder: 1,
      featuresJson: JSON.stringify([
        "1 website on yourname.websetu.in", "5 pages", "Professional template",
        "Basic SEO setup", "Contact form + lead inbox", "WhatsApp button", "Mobile responsive",
      ]),
    },
  });
  const businessPlan = await db.plan.create({
    data: {
      name: "Business", slug: "business", tagline: "Everything a growing business needs",
      priceMonthly: 999, priceYearly: 9990, maxPages: -1, aiCredits: 50, popular: true, sortOrder: 2,
      featuresJson: JSON.stringify([
        "Everything in Starter", "Unlimited pages", "Premium templates",
        "Advanced SEO + Local SEO", "Blog / CMS", "Google Maps integration",
        "Analytics dashboard", "Lead management (CRM)", "Priority support",
      ]),
    },
  });
  const professional = await db.plan.create({
    data: {
      name: "Professional", slug: "professional", tagline: "AI-powered growth & custom domain",
      priceMonthly: 1999, priceYearly: 19990, maxPages: -1, aiCredits: 500, sortOrder: 3,
      featuresJson: JSON.stringify([
        "Everything in Business", "AI content generation", "AEO (Answer Engine Optimization)",
        "Advanced GEO / multi-location pages", "Custom domain connection",
        "Advanced analytics", "Product catalogue", "Dedicated manager",
      ]),
    },
  });
  await db.plan.create({
    data: {
      name: "Enterprise", slug: "enterprise", tagline: "Custom solutions for large businesses",
      priceMonthly: 0, priceYearly: 0, maxPages: -1, aiCredits: 10000, sortOrder: 4,
      featuresJson: JSON.stringify([
        "Custom pricing & features", "Multi-brand agency mode", "Custom design & sections",
        "API access", "SLA & premium support", "White-label options",
      ]),
    },
  });

  // ---------- templates ----------
  const t1 = await db.template.create({
    data: {
      name: "Modern Pro", slug: "modern-pro", category: "Local Business",
      description: "Clean, trust-building layout perfect for service businesses",
      gradient: "from-emerald-500 to-teal-600", sortOrder: 1,
      themeJson: JSON.stringify({ primary: "#059669", secondary: "#0f766e", accent: "#f59e0b", font: "modern", radius: "rounded", heroStyle: "gradient", cardStyle: "shadow" }),
    },
  });
  const t2 = await db.template.create({
    data: {
      name: "Industrial Edge", slug: "industrial-edge", category: "Manufacturing",
      description: "Bold, heavy-duty design for manufacturers & contractors",
      premium: true, gradient: "from-amber-600 to-stone-700", sortOrder: 2,
      themeJson: JSON.stringify({ primary: "#b45309", secondary: "#44403c", accent: "#f59e0b", font: "classic", radius: "sharp", heroStyle: "image", cardStyle: "outline" }),
    },
  });
  const t3 = await db.template.create({
    data: {
      name: "Fresh Bites", slug: "fresh-bites", category: "Restaurant",
      description: "Warm, appetizing layout for restaurants & cafés",
      gradient: "from-orange-500 to-red-600", sortOrder: 3,
      themeJson: JSON.stringify({ primary: "#ea580c", secondary: "#9a3412", accent: "#fbbf24", font: "modern", radius: "pill", heroStyle: "image", cardStyle: "shadow" }),
    },
  });
  const t4 = await db.template.create({
    data: {
      name: "Care Plus", slug: "care-plus", category: "Clinic / Medical",
      description: "Calm, professional design for clinics, doctors & dentists",
      gradient: "from-teal-500 to-cyan-600", sortOrder: 4,
      themeJson: JSON.stringify({ primary: "#0d9488", secondary: "#0f766e", accent: "#14b8a6", font: "modern", radius: "rounded", heroStyle: "split", cardStyle: "flat" }),
    },
  });
  const t5 = await db.template.create({
    data: {
      name: "Luxe Lounge", slug: "luxe-lounge", category: "Salon / Hotel",
      description: "Elegant, premium feel for salons, hotels & luxury brands",
      premium: true, gradient: "from-rose-500 to-stone-800", sortOrder: 5,
      themeJson: JSON.stringify({ primary: "#be123c", secondary: "#1c1917", accent: "#e879f9", font: "elegant", radius: "pill", heroStyle: "image", cardStyle: "shadow" }),
    },
  });
  const t6 = await db.template.create({
    data: {
      name: "Corporate Slate", slug: "corporate-slate", category: "Professional Services",
      description: "Authoritative design for consultants, CAs & agencies",
      premium: true, gradient: "from-zinc-600 to-zinc-800", sortOrder: 6,
      themeJson: JSON.stringify({ primary: "#3f3f46", secondary: "#27272a", accent: "#f59e0b", font: "classic", radius: "sharp", heroStyle: "gradient", cardStyle: "outline" }),
    },
  });

  // ---------- coupons ----------
  await db.coupon.create({
    data: { code: "LAUNCH50", type: "PERCENT", value: 50, description: "50% off first payment — launch offer", maxUses: 500 },
  });
  await db.coupon.create({
    data: { code: "ANNUAL10", type: "PERCENT", value: 10, description: "Extra 10% off on annual plans", maxUses: 500 },
  });

  // ---------- demo business 1: Sharma Electricals (published, full data) ----------
  const b1 = await db.business.create({
    data: {
      userId: demo.id, name: "Sharma Electricals", slug: "sharma-electricals", category: "Electrical",
      tagline: "Trusted electrical contractor in Pune since 2008",
      description: "Sharma Electricals is a licensed electrical contractor serving homes and businesses across Pune for over 15 years. From wiring and panel upgrades to industrial installations and 24/7 emergency repairs, our certified electricians deliver safe, reliable work at honest prices.",
      ownerName: "Rajesh Sharma", phone: "+91 98220 11223", whatsapp: "+91 98220 11223",
      email: "care@sharmaelectricals.in", address: "Shop 12, Laxmi Market, Karve Road",
      city: "Pune", state: "Maharashtra", pincode: "411004", establishedYear: "2008",
      gstin: "27ABCDE1234F1Z5", brandPrimary: "#b45309", brandSecondary: "#44403c", brandAccent: "#f59e0b",
      templateId: t2.id,
      mapsUrl: "https://maps.google.com/?q=Karve+Road+Pune",
      gmbUrl: "https://business.google.com/site/sharmaelectricals",
      status: "PUBLISHED",
      hoursJson: JSON.stringify({ Monday: "9:00 AM – 8:00 PM", Tuesday: "9:00 AM – 8:00 PM", Wednesday: "9:00 AM – 8:00 PM", Thursday: "9:00 AM – 8:00 PM", Friday: "9:00 AM – 8:00 PM", Saturday: "9:00 AM – 8:00 PM", Sunday: "Emergency Only" }),
      socialsJson: JSON.stringify({ facebook: "https://facebook.com/sharmaelectricals", instagram: "https://instagram.com/sharmaelectricals" }),
    },
  });

  await db.website.create({
    data: {
      businessId: b1.id,
      seoTitle: "Sharma Electricals — Licensed Electrical Contractor in Pune",
      seoDescription: "Licensed electrical contractor in Pune since 2008. Wiring, panel upgrades, industrial installation & 24/7 emergency repairs. Call +91 98220 11223 for a free quote.",
      keywords: "electrician pune, electrical contractor pune, wiring pune, sharma electricals, emergency electrician pune",
      themeJson: JSON.stringify({ font: "classic", radius: "sharp", heroStyle: "image", cardStyle: "outline", containerWidth: "normal" }),
      sectionsJson: JSON.stringify(buildDemoSections(b1)),
      publishedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  });

  await db.service.createMany({ data: [
    { businessId: b1.id, name: "House Wiring & Rewiring", description: "Complete wiring for new homes and safe rewiring of older buildings using ISI-certified materials.", icon: "zap", featured: true, sortOrder: 1 },
    { businessId: b1.id, name: "Industrial Installation", description: "Machinery connections, panel boards, and three-phase installations for factories and workshops.", icon: "factory", featured: true, sortOrder: 2 },
    { businessId: b1.id, name: "24/7 Emergency Repairs", description: "Power failures, short circuits and fault-finding — our team reaches you within 60 minutes.", icon: "wrench", featured: true, sortOrder: 3 },
    { businessId: b1.id, name: "Solar Panel Setup", description: "Rooftop solar design, installation and subsidy documentation for homes and SMEs.", icon: "sun", sortOrder: 4 },
  ]});

  await db.product.createMany({ data: [
    { businessId: b1.id, name: "Modular Switchboards", category: "Fittings", shortDesc: "Premium modular switches & boards (Anchor, Legrand)", price: 1499, salePrice: 1299, hidePrice: false, featured: true, sortOrder: 1 },
    { businessId: b1.id, name: "LED Panel Lights", category: "Lighting", shortDesc: "Energy-saving 18W slim panels, 2-year warranty", price: 450, hidePrice: false, sortOrder: 2 },
    { businessId: b1.id, name: "Copper Cables (per 90m coil)", category: "Materials", shortDesc: "ISI-marked 1.5–4 sq mm fire-retardant copper wire", price: 1899, hidePrice: false, sortOrder: 3 },
    { businessId: b1.id, name: "Industrial MCB Distribution Boards", category: "Industrial", shortDesc: "8–16 way DPB boxes with tested MCBs", hidePrice: true, featured: true, sortOrder: 4 },
  ]});

  await db.testimonial.createMany({ data: [
    { businessId: b1.id, name: "Anita Deshpande", role: "Homeowner, Kothrud", content: "Sharma ji's team rewired our entire 20-year-old flat in two days. Neat work, fair bill, and they cleaned up everything after. Highly recommended!", rating: 5, sortOrder: 1 },
    { businessId: b1.id, name: "Mahesh Patil", role: "Factory Owner, Chakan", content: "They installed our full factory panel and machine wiring. Very professional and their emergency service actually answers at midnight.", rating: 5, sortOrder: 2 },
    { businessId: b1.id, name: "Farhan Sheikh", role: "Café Owner, FC Road", content: "Got solar panels + new lighting done. Project finished on time and my electricity bill dropped 40%. Excellent service.", rating: 4, sortOrder: 3 },
  ]});

  await db.faq.createMany({ data: [
    { businessId: b1.id, question: "Are your electricians licensed?", answer: "Yes. All our electricians hold valid licenses and we are a registered electrical contractor with the Maharashtra Electrical Board.", sortOrder: 1 },
    { businessId: b1.id, question: "How fast is your emergency service?", answer: "For emergencies in Pune city, our team typically reaches within 60 minutes, 24 hours a day, 7 days a week.", sortOrder: 2 },
    { businessId: b1.id, question: "Do you give free quotes?", answer: "Yes! Call or WhatsApp us your requirement and we provide a free, written quote before any work begins — no hidden charges.", sortOrder: 3 },
    { businessId: b1.id, question: "Which areas of Pune do you serve?", answer: "We cover all of Pune and PCMC — Karve Road, Kothrud, Warje, Shivajinagar, Baner, Chakan and surrounding areas.", sortOrder: 4 },
    { businessId: b1.id, question: "Do you provide a workmanship warranty?", answer: "Yes, all our installation work comes with a 1-year workmanship warranty, and materials carry manufacturer warranty.", sortOrder: 5 },
  ]});

  await db.galleryItem.createMany({ data: [
    { businessId: b1.id, url: "/images/industry-electrical.jpg", caption: "Industrial panel installation, Chakan", alt: "Industrial electrical panel installation", sortOrder: 1 },
    { businessId: b1.id, url: "/images/hero-business.jpg", caption: "Complete house wiring project", alt: "House wiring project", sortOrder: 2 },
  ]});

  const leads = [
    { name: "Suresh Kulkarni", phone: "+91 98765 43210", email: "suresh.k@gmail.com", message: "Need quote for complete wiring of new 2BHK flat in Warje.", serviceName: "House Wiring & Rewiring", status: "NEW", daysAgo: 0 },
    { name: "Meena Joshi", phone: "+91 91234 56789", email: "", message: "Inverter not working, need urgent repair today.", serviceName: "24/7 Emergency Repairs", status: "CONTACTED", daysAgo: 1 },
    { name: "Vikram Shetty", phone: "+91 99887 76655", email: "vikram@shettyind.com", message: "Factory in Chakan needs 3-phase panel upgrade. Please visit for inspection.", serviceName: "Industrial Installation", status: "FOLLOW_UP", notes: "Site visit scheduled Sat 11am", daysAgo: 2 },
    { name: "Pooja Rane", phone: "+91 90000 12345", email: "pooja.rane@outlook.com", message: "Interested in rooftop solar for our bungalow.", serviceName: "Solar Panel Setup", status: "QUALIFIED", daysAgo: 4 },
    { name: "Amit Bhosale", phone: "+91 98111 22334", email: "", message: "LED lights for my shop, around 20 panels.", serviceName: "", status: "CONVERTED", notes: "Invoice #WS-2025-4451 paid", daysAgo: 6 },
    { name: "Rahul Kumar", phone: "+91 87654 32109", email: "", message: "MRP of switch boards?", serviceName: "", status: "SPAM", daysAgo: 8 },
  ];
  for (const { daysAgo, ...l } of leads) {
    await db.lead.create({ data: { ...l, businessId: b1.id, createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 5 + 1) * 3600 * 1000) } });
  }

  await db.subscription.create({
    data: {
      businessId: b1.id, planId: businessPlan.id, cycle: "MONTHLY", status: "ACTIVE",
      amount: 999, startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      renewsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
  });
  await db.payment.create({
    data: {
      businessId: b1.id, amount: 999, method: "UPI", status: "SUCCESS",
      invoiceNo: "WS-2025-100241", description: "Business plan — Monthly subscription",
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  });

  // 30 days of analytics events
  for (let d = 29; d >= 0; d--) {
    const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const base = 8 + Math.floor(Math.random() * 14) + (d < 10 ? 6 : 0);
    for (let v = 0; v < base; v++) {
      await db.analyticsEvent.create({ data: { businessId: b1.id, type: "VISIT", path: "/", createdAt: new Date(day.getTime() + v * 40 * 60 * 1000) } });
    }
    if (Math.random() > 0.4) await db.analyticsEvent.create({ data: { businessId: b1.id, type: "CTA_WHATSAPP", path: "/", createdAt: day } });
    if (Math.random() > 0.5) await db.analyticsEvent.create({ data: { businessId: b1.id, type: "CTA_CALL", path: "/", createdAt: day } });
    if (Math.random() > 0.55) await db.analyticsEvent.create({ data: { businessId: b1.id, type: "FORM_SUBMIT", path: "/contact", createdAt: day } });
  }

  // ---------- demo business 2: Cafe Aroma (published) ----------
  const b2 = await db.business.create({
    data: {
      userId: demo2.id, name: "Cafe Aroma", slug: "cafe-aroma", category: "Restaurant",
      tagline: "Artisan coffee & fresh bites in the heart of Koregaon Park",
      description: "Cafe Aroma is a cozy neighborhood café in Koregaon Park serving single-origin coffee, all-day breakfast and wood-fired pizzas. Perfect for work sessions, family brunches and late-evening desserts.",
      ownerName: "Priya Verma", phone: "+91 99700 45678", whatsapp: "+91 99700 45678",
      email: "hello@cafearoma.in", address: "Lane 6, North Main Road, Koregaon Park",
      city: "Pune", state: "Maharashtra", pincode: "411001", establishedYear: "2019",
      brandPrimary: "#ea580c", brandSecondary: "#9a3412", brandAccent: "#fbbf24",
      templateId: t3.id,
      mapsUrl: "https://maps.google.com/?q=Koregaon+Park+Pune",
      status: "PUBLISHED",
      hoursJson: JSON.stringify({ Monday: "8:00 AM – 11:00 PM", Tuesday: "8:00 AM – 11:00 PM", Wednesday: "8:00 AM – 11:00 PM", Thursday: "8:00 AM – 11:00 PM", Friday: "8:00 AM – 12:00 AM", Saturday: "8:00 AM – 12:00 AM", Sunday: "8:00 AM – 11:00 PM" }),
      socialsJson: JSON.stringify({ instagram: "https://instagram.com/cafearoma.pune" }),
    },
  });

  await db.website.create({
    data: {
      businessId: b2.id,
      seoTitle: "Cafe Aroma — Best Coffee & Wood-fired Pizza in Koregaon Park, Pune",
      seoDescription: "Cozy café in Koregaon Park serving single-origin coffee, all-day breakfast & wood-fired pizzas. Visit us on North Main Road or order on WhatsApp.",
      keywords: "cafe koregaon park, coffee pune, wood fired pizza pune, breakfast pune, cafe aroma",
      themeJson: JSON.stringify({ font: "modern", radius: "pill", heroStyle: "image", cardStyle: "shadow", containerWidth: "normal" }),
      sectionsJson: JSON.stringify([
        { id: "h1", type: "hero", visible: true, content: { badge: "★ Rated 4.7 by 900+ coffee lovers", heading: "Cafe Aroma", subheading: "Artisan coffee & fresh bites in the heart of Koregaon Park. Single-origin brews, wood-fired pizzas, all-day breakfast.", ctaPrimary: "View Menu", ctaSecondary: "Book a Table", image: "/images/industry-food.jpg" } },
        { id: "h2", type: "stats", visible: true, content: { items: [{ value: "2019", label: "Established" }, { value: "900+", label: "Google Reviews" }, { value: "25+", label: "Coffee Varieties" }, { value: "8 AM", label: "Open Daily" }] } },
        { id: "h3", type: "services", visible: true, content: { title: "What We Serve", subtitle: "Fresh, locally sourced, made with love" } },
        { id: "h4", type: "testimonials", visible: true, content: { title: "Loved by Regulars", subtitle: "What our guests say" } },
        { id: "h5", type: "hours", visible: true, content: { title: "Opening Hours" } },
        { id: "h6", type: "contact", visible: true, content: { title: "Visit Us", subtitle: "Walk in or reserve your table on WhatsApp.", mapUrl: "https://maps.google.com/?q=Koregaon+Park+Pune" } },
      ]),
      publishedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
  });

  await db.service.createMany({ data: [
    { businessId: b2.id, name: "Single-Origin Coffee", description: "Chikmagalur, Coorg & imported beans, brewed pour-over, cold brew or classic espresso.", icon: "coffee", featured: true, sortOrder: 1 },
    { businessId: b2.id, name: "Wood-fired Pizzas", description: "Hand-stretched sourdough bases fired at 400°C in our stone oven.", icon: "pizza", featured: true, sortOrder: 2 },
    { businessId: b2.id, name: "All-day Breakfast", description: "Eggs any style, fluffy pancakes, shakshuka and granola bowls till 4 PM.", icon: "egg-fried", featured: true, sortOrder: 3 },
    { businessId: b2.id, name: "Event Bookings", description: "Birthdays, kitty parties and open-mic nights — book the whole back lawn.", icon: "party-popper", sortOrder: 4 },
  ]});

  await db.testimonial.createMany({ data: [
    { businessId: b2.id, name: "Rohan Kher", role: "Regular since 2020", content: "Best cold brew in Pune, hands down. The staff remembers my order and the WiFi actually works!", rating: 5, sortOrder: 1 },
    { businessId: b2.id, name: "Sneha & Arjun", role: "Weekend brunch regulars", content: "We do our Saturday brunch here every week. Shakshuka + filter coffee is a killer combo.", rating: 5, sortOrder: 2 },
  ]});

  await db.faq.createMany({ data: [
    { businessId: b2.id, question: "Do you take table reservations?", answer: "Yes! WhatsApp us at +91 99700 45678 or call — we hold tables for 20 minutes past your booking time.", sortOrder: 1 },
    { businessId: b2.id, question: "Is Cafe Aroma pet friendly?", answer: "Absolutely. Our outdoor lawn is pet friendly — water bowls and treats on the house.", sortOrder: 2 },
    { businessId: b2.id, question: "Do you offer free WiFi?", answer: "Yes, high-speed free WiFi with plenty of charging points. Work-friendly till 6 PM on weekdays.", sortOrder: 3 },
  ]});

  await db.subscription.create({
    data: {
      businessId: b2.id, planId: starter.id, cycle: "YEARLY", status: "ACTIVE",
      amount: 4990, startedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      renewsAt: new Date(Date.now() + 320 * 24 * 60 * 60 * 1000),
    },
  });
  await db.payment.create({
    data: {
      businessId: b2.id, amount: 4491, method: "CARD", status: "SUCCESS",
      invoiceNo: "WS-2025-100118", description: "Starter plan — Annual subscription (LAUNCH50 applied)",
      couponCode: "LAUNCH50", createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
  });

  for (let d = 20; d >= 0; d--) {
    const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const base = 5 + Math.floor(Math.random() * 8);
    for (let v = 0; v < base; v++) {
      await db.analyticsEvent.create({ data: { businessId: b2.id, type: "VISIT", path: "/", createdAt: new Date(day.getTime() + v * 60 * 60 * 1000) } });
    }
  }

  // ---------- platform leads ----------
  await db.platformLead.createMany({ data: [
    { name: "Deepak Mehta", email: "deepak@metalfab.in", phone: "+91 98989 12121", businessType: "Manufacturer", message: "Need website for my fabrication unit in Bhosari.", source: "CONTACT" },
    { name: "Dr. Kavita Nair", email: "kavita@smiledental.in", phone: "+91 90909 34343", businessType: "Dentist", message: "Want demo of clinic website with appointment booking.", source: "DEMO" },
  ]});

  await db.notification.createMany({ data: [
    { userId: admin.id, title: "Welcome to WebSetu Admin", body: "Platform overview, customers, plans, templates & leads management is ready." },
  ]});

  console.log("✅ Seed complete");
  console.log("   Admin:  admin@websetu.in / admin1234");
  console.log("   Demo:   demo@websetu.in / demo1234  (Sharma Electricals — published)");
  console.log("   Demo 2: cafe@websetu.in / cafe1234  (Cafe Aroma — published)");
}

function buildDemoSections(b: { name: string; slug: string; mapsUrl: string; coverUrl: string }) {
  return [
    { id: "s1", type: "hero", visible: true, content: { badge: "★ Licensed & Insured • Since 2008", heading: "Sharma Electricals", subheading: "Pune's trusted electrical contractor for homes, offices and factories. Safe installations, honest pricing and a 1-year workmanship warranty on every job.", ctaPrimary: "Get Free Quote", ctaSecondary: "Call Now", image: "/images/hero-business.jpg" } },
    { id: "s2", type: "stats", visible: true, content: { items: [{ value: "15+", label: "Years Experience" }, { value: "2500+", label: "Jobs Completed" }, { value: "60 min", label: "Emergency Response" }, { value: "4.8★", label: "Customer Rating" }] } },
    { id: "s3", type: "services", visible: true, content: { title: "Our Services", subtitle: "Complete electrical solutions across Pune & PCMC" } },
    { id: "s4", type: "whyUs", visible: true, content: { title: "Why Pune Trusts Us", items: [ { title: "Licensed Electricians", description: "Every technician is licensed, background-checked and factory trained." }, { title: "1-Year Warranty", description: "All installation work is covered by a full workmanship warranty." }, { title: "60-Minute Emergency", description: "Midnight power failure? Our van reaches you within the hour." }, { title: "Honest Fixed Pricing", description: "Written quotes before work starts. The price we quote is the price you pay." } ] } },
    { id: "s5", type: "gallery", visible: true, content: { title: "Recent Work", subtitle: "A few of our recent projects" } },
    { id: "s6", type: "testimonials", visible: true, content: { title: "What Customers Say", subtitle: "Real reviews from Pune homes & businesses" } },
    { id: "s7", type: "faq", visible: true, content: { title: "Frequently Asked Questions", items: [ { question: "Are your electricians licensed?", answer: "Yes. All our electricians hold valid licenses and we are a registered electrical contractor with the Maharashtra Electrical Board." }, { question: "How fast is your emergency service?", answer: "For emergencies in Pune city, our team typically reaches within 60 minutes, 24 hours a day, 7 days a week." }, { question: "Do you give free quotes?", answer: "Yes! Call or WhatsApp us your requirement and we provide a free, written quote before any work begins." }, { question: "Which areas do you serve?", answer: "All of Pune and PCMC — Karve Road, Kothrud, Warje, Shivajinagar, Baner, Chakan and surrounding areas." }, { question: "Do you provide warranty?", answer: "All installation work comes with a 1-year workmanship warranty; materials carry manufacturer warranty." } ] } },
    { id: "s8", type: "cta", visible: true, content: { title: "Need an electrician today?", subtitle: "Call now — our team answers in under 30 seconds, 24/7.", primary: "Call +91 98220 11223", secondary: "WhatsApp Us" } },
    { id: "s9", type: "hours", visible: true, content: { title: "Business Hours" } },
    { id: "s10", type: "contact", visible: true, content: { title: "Contact Us", subtitle: "Send an enquiry — we respond within 24 hours.", mapUrl: b.mapsUrl } },
  ];
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

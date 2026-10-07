// WebSetu — industry presets.
//
// One table that decides how a new website looks and reads for each kind of
// business: services, palette, layout, hero copy, why-us, FAQs and the animated
// hero motif. Everything here is a starting point the owner can edit — none of
// it is locked. Pure data + string templating, so it is safe on server and client.
//
// Placeholders in copy: {name} {city} {category}

import type { SiteTheme } from "@/lib/types";

/** Which animated hero illustration a trade gets (components/site/hero-scene). */
export type SceneKind = "drive" | "build" | "water" | "care" | "tech" | "craft";

export interface IndustryMotif {
  /** Keys into the site icon registry (components/site/industry-icons). */
  icons: string[];
  scene: SceneKind;
}

export interface IndustryService {
  name: string;
  description: string;
  icon: string;
}

export interface IndustryPreset {
  key: string;
  label: string;
  /** Stock-photo search for the cover and gallery. */
  imageQuery: string;
  /** Exact wizard categories that map here. */
  categories: string[];
  /** Lower-case fragments matched against free-text categories ("Packers and Movers"). */
  keywords: string[];
  palette: [string, string, string];
  theme: Pick<SiteTheme, "font" | "radius" | "heroStyle" | "cardStyle">;
  motif: IndustryMotif;
  services: IndustryService[];
  hero: { badge: string; heading: string; subheading: string; ctaPrimary: string; ctaSecondary: string };
  about: string;
  servicesTitle: string;
  servicesSubtitle: string;
  stats: { value: string; label: string }[];
  whyUs: { title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  ctaTitle: string;
  /** Brief for the copywriting model: what buyers in this trade care about. */
  aiBrief: string;
}

const PRESETS: IndustryPreset[] = [
  {
    key: "transport",
    label: "Transport & Logistics",
    imageQuery: "truck highway",
    categories: ["Transport", "Logistics"],
    keywords: ["transport", "logistic", "cargo", "courier", "truck", "packers", "movers", "freight", "tempo", "fleet", "shipping", "parcel", "roadways", "carrier", "cold storage", "godown", "warehouse", "towing", "bus service"],
    palette: ["#1d4ed8", "#0f172a", "#f59e0b"],
    theme: { font: "modern", radius: "rounded", heroStyle: "gradient", cardStyle: "shadow" },
    motif: { icons: ["truck", "package", "route", "map-pin", "container", "warehouse"], scene: "drive" },
    services: [
      { name: "Full Truck Load (FTL)", description: "Dedicated trucks for bulk consignments, door to door, with a fixed pickup slot.", icon: "truck" },
      { name: "Part Load (PTL)", description: "Share space and pay only for what you ship — ideal for smaller regular loads.", icon: "boxes" },
      { name: "Packers & Movers", description: "Packing, loading, transport and unloading for homes and offices, handled by one team.", icon: "package" },
      { name: "Warehousing", description: "Secure storage with stock handling, so goods are ready to dispatch when you need them.", icon: "warehouse" },
      { name: "Express Parcel Delivery", description: "Time-bound parcel delivery for documents and small shipments across cities.", icon: "zap" },
      { name: "Vehicle Tracking", description: "Know where your consignment is — live updates from pickup to delivery.", icon: "map-pin" },
    ],
    hero: {
      badge: "🚚 Reliable transport from {city}",
      heading: "{name} — Safe, On-Time Delivery Every Load",
      subheading: "Full and part truck loads, packers & movers and express delivery from {city}. Clear rates, tracked vehicles and a team that picks up the phone.",
      ctaPrimary: "Get a Freight Quote",
      ctaSecondary: "Call for Booking",
    },
    about: "{name} is a {city}-based transport and logistics company moving goods for traders, manufacturers and families. We run well-maintained vehicles with experienced drivers, share clear rates before loading, and keep you updated until your consignment is delivered. Whether it is a single parcel or a full truck load, we treat every shipment as if it were our own.",
    servicesTitle: "Transport & Logistics Services",
    servicesSubtitle: "Pickup to delivery — handled by one accountable team",
    stats: [
      { value: "24/7", label: "Booking Support" },
      { value: "Pan-India", label: "Delivery Network" },
      { value: "GPS", label: "Tracked Vehicles" },
      { value: "On-Time", label: "Dispatch Focus" },
    ],
    whyUs: [
      { title: "On-Time Pickup", description: "We give a pickup slot and keep it — delays are communicated before they happen." },
      { title: "Safe Handling", description: "Proper packing, loading and securing so goods arrive the way they left." },
      { title: "Clear Freight Rates", description: "Rates are agreed before loading. No surprise charges at delivery." },
      { title: "Live Updates", description: "Track your consignment and get a call or message at every key step." },
    ],
    faqs: [
      { question: "Which routes does {name} serve?", answer: "We operate from {city} to major cities across India. Share your pickup and drop locations and we will confirm the route and transit time." },
      { question: "How is the freight charge calculated?", answer: "Rates depend on distance, load weight or volume, and vehicle type. We share a written quote before loading — no hidden charges." },
      { question: "Is my consignment insured?", answer: "Transit insurance can be arranged on request. Ask us while booking and we will include it in your quote." },
      { question: "Can I track my shipment?", answer: "Yes. We share vehicle and driver details and keep you updated until delivery." },
      { question: "How do I book a truck?", answer: "Call or WhatsApp us with pickup location, drop location, material and approximate weight. We will confirm the vehicle and pickup time." },
    ],
    ctaTitle: "Need a truck today? Talk to {name}",
    aiBrief: "Transport/logistics buyers care about on-time pickup, safe handling, transparent freight rates, route coverage, vehicle types, tracking and insurance. Leading competitors show routes served, fleet types, booking process and response time.",
  },
  {
    key: "travel",
    label: "Travel & Tours",
    imageQuery: "travel",
    categories: ["Travel Agency"],
    keywords: ["travel", "tour", "taxi", "cab", "holiday", "trip", "yatra", "tempo traveller", "ticket booking", "visa", "passport", "pilgrimage"],
    palette: ["#0284c7", "#0c4a6e", "#f97316"],
    theme: { font: "modern", radius: "pill", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["plane", "compass", "map", "luggage", "mountain", "sun"], scene: "drive" },
    services: [
      { name: "Domestic Tour Packages", description: "Hand-planned trips across India with stays, transfers and sightseeing included.", icon: "map" },
      { name: "International Holidays", description: "Visa guidance, flights, hotels and itineraries for stress-free trips abroad.", icon: "plane" },
      { name: "Flight & Train Booking", description: "Best available fares with quick confirmation and support if plans change.", icon: "ticket" },
      { name: "Hotel Bookings", description: "Verified stays for every budget, from business hotels to family resorts.", icon: "bed-double" },
      { name: "Cab & Tempo Traveller", description: "Outstation cabs and group vehicles with experienced local drivers.", icon: "car" },
      { name: "Pilgrimage Tours", description: "Comfortable, well-planned yatras with darshan and stay arrangements.", icon: "landmark" },
    ],
    hero: {
      badge: "✈️ Trips planned in {city}",
      heading: "{name} — Holidays Planned Right, End to End",
      subheading: "Tour packages, bookings and cabs from {city}. One team plans it, books it and stays reachable while you travel.",
      ctaPrimary: "Plan My Trip",
      ctaSecondary: "Call an Expert",
    },
    about: "{name} is a travel company in {city} that plans holidays, pilgrimages and business trips. We handle the details — transport, stays, sightseeing and bookings — and stay reachable while you are travelling, so you can enjoy the trip instead of managing it.",
    servicesTitle: "Travel Services",
    servicesSubtitle: "Everything for your trip, booked by one team",
    stats: [
      { value: "24/7", label: "On-Trip Support" },
      { value: "Custom", label: "Itineraries" },
      { value: "India + Abroad", label: "Destinations" },
      { value: "Verified", label: "Hotels & Drivers" },
    ],
    whyUs: [
      { title: "Tailor-Made Plans", description: "Itineraries built around your dates, budget and travel style." },
      { title: "Transparent Pricing", description: "Package inclusions listed clearly — no surprises on the trip." },
      { title: "Support While Travelling", description: "A real person to call if anything changes on the way." },
      { title: "Trusted Partners", description: "Hotels and drivers we have worked with and checked ourselves." },
    ],
    faqs: [
      { question: "Can {name} customise a tour package?", answer: "Yes. Tell us your dates, budget and the places you want to see — we will build an itinerary around you." },
      { question: "What is included in your packages?", answer: "Typically stays, transfers and sightseeing. Every quote lists exactly what is included and what is not." },
      { question: "Do you help with visas?", answer: "We guide you on documents and the visa process for the countries we plan trips to." },
      { question: "What is your cancellation policy?", answer: "It depends on the airline, hotel and package. We explain the terms before you pay." },
      { question: "How do I book?", answer: "Call or WhatsApp us with your travel plans and we will share options and a quote." },
    ],
    ctaTitle: "Where to next? Let {name} plan it",
    aiBrief: "Travel buyers care about customisation, clear package inclusions, price transparency, on-trip support, verified hotels and cancellation terms. Top agencies lead with destinations, sample itineraries and quick quotes.",
  },
  {
    key: "building-materials",
    label: "Building Materials & Hardware",
    imageQuery: "construction",
    categories: ["Hardware"],
    keywords: ["cement", "steel", "tmt", "tile", "building material", "hardware", "sanitary", "paint", "plywood", "marble", "granite", "bricks", "sand", "aggregate", "material mart"],
    palette: ["#b45309", "#292524", "#facc15"],
    theme: { font: "modern", radius: "sharp", heroStyle: "split", cardStyle: "outline" },
    motif: { icons: ["brick-wall", "hard-hat", "hammer", "truck", "building-2", "ruler"], scene: "build" },
    services: [
      { name: "Cement", description: "OPC and PPC cement from leading brands, in stock for small and bulk orders.", icon: "boxes" },
      { name: "TMT Steel Bars", description: "ISI-marked TMT bars in all common diameters, cut and supplied to site.", icon: "factory" },
      { name: "Tiles & Flooring", description: "Floor, wall and vitrified tiles across finishes and price ranges.", icon: "layout-grid" },
      { name: "Paints & Finishes", description: "Interior and exterior paints, primers and waterproofing products.", icon: "paintbrush" },
      { name: "Plumbing & Sanitary", description: "Pipes, fittings and sanitaryware for homes and commercial projects.", icon: "droplet" },
      { name: "Site Delivery", description: "Material delivered to your site on time, so work never waits.", icon: "truck" },
    ],
    hero: {
      badge: "🏗️ Building materials in {city}",
      heading: "{name} — Everything You Need to Build, Under One Roof",
      subheading: "Cement, TMT steel, tiles, paints and plumbing from trusted brands — with competitive rates and on-time site delivery across {city}.",
      ctaPrimary: "Get Today's Rates",
      ctaSecondary: "Call for Bulk Order",
    },
    about: "{name} supplies building materials to homeowners, contractors and builders across {city}. We stock genuine products from trusted brands, quote current market rates honestly, and deliver to site on time — so your construction keeps moving and you deal with one reliable supplier for everything.",
    servicesTitle: "Products We Supply",
    servicesSubtitle: "Genuine brands, fair rates, delivered to your site",
    stats: [
      { value: "Genuine", label: "Branded Products" },
      { value: "Bulk", label: "& Retail Orders" },
      { value: "Site", label: "Delivery Available" },
      { value: "Daily", label: "Updated Rates" },
    ],
    whyUs: [
      { title: "Genuine Brands", description: "Only original, ISI-marked products from authorised channels." },
      { title: "Competitive Rates", description: "Fair, current market pricing with better rates on bulk orders." },
      { title: "One-Stop Supply", description: "Cement to sanitaryware — one supplier for the whole project." },
      { title: "On-Time Delivery", description: "Material reaches your site when promised, so labour never waits." },
    ],
    faqs: [
      { question: "Which brands does {name} stock?", answer: "We stock leading brands of cement, steel, tiles and paints. Call us for current availability and rates." },
      { question: "Do you deliver to site?", answer: "Yes, we deliver across {city} and nearby areas. Delivery charges depend on quantity and distance." },
      { question: "How can I get today's rate?", answer: "Material prices change often. Call or WhatsApp us with your requirement for today's rate." },
      { question: "Do you give discounts on bulk orders?", answer: "Yes. Contractors and builders get better rates on bulk and repeat orders." },
      { question: "Can I get a GST invoice?", answer: "Yes, we provide proper GST invoices for all purchases." },
    ],
    ctaTitle: "Building something? Get rates from {name}",
    aiBrief: "Building-material buyers (contractors, homeowners) care about genuine brands, daily rates, bulk discounts, stock availability, GST invoice and site delivery. Leading dealers show product categories, brands stocked and quick rate enquiry.",
  },
  {
    key: "construction",
    label: "Construction & Contracting",
    imageQuery: "construction",
    categories: ["Contractor", "Construction", "Architect"],
    keywords: ["construction", "contractor", "builder", "civil", "architect", "renovation", "infra", "structural", "scaffolding", "earthmoving", "jcb", "excavat"],
    palette: ["#ea580c", "#1c1917", "#facc15"],
    theme: { font: "modern", radius: "sharp", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["hard-hat", "building-2", "ruler", "hammer", "brick-wall", "house"], scene: "build" },
    services: [
      { name: "Residential Construction", description: "Homes and bungalows built from foundation to finishing.", icon: "house" },
      { name: "Commercial Projects", description: "Shops, offices and warehouses delivered on schedule.", icon: "building-2" },
      { name: "Renovation & Remodelling", description: "Upgrade kitchens, bathrooms and full homes with minimal disruption.", icon: "hammer" },
      { name: "Architecture & Planning", description: "Plans, elevations and approvals handled by experienced professionals.", icon: "ruler" },
      { name: "Estimation & BOQ", description: "Detailed cost estimates so you know the budget before work starts.", icon: "calculator" },
      { name: "Turnkey Execution", description: "One contract, one team, from design to handover.", icon: "key" },
    ],
    hero: {
      badge: "🏠 Building in {city}",
      heading: "{name} — Quality Construction, Delivered On Time",
      subheading: "Residential and commercial construction, renovation and turnkey projects in {city} — with clear estimates and regular site updates.",
      ctaPrimary: "Get a Free Estimate",
      ctaSecondary: "Call Site Engineer",
    },
    about: "{name} is a construction company in {city} delivering homes, commercial spaces and renovations. We plan carefully, estimate honestly and keep clients updated at every stage, so projects finish on time and on budget with workmanship that lasts.",
    servicesTitle: "Construction Services",
    servicesSubtitle: "From plan to handover",
    stats: [
      { value: "Turnkey", label: "Project Delivery" },
      { value: "Clear", label: "Written Estimates" },
      { value: "Quality", label: "Checked Materials" },
      { value: "Weekly", label: "Site Updates" },
    ],
    whyUs: [
      { title: "Transparent Estimates", description: "Itemised BOQ before work starts — no budget surprises." },
      { title: "Quality Materials", description: "Branded, checked materials and proper curing on every job." },
      { title: "On-Schedule Delivery", description: "Planned timelines with regular progress updates." },
      { title: "Experienced Team", description: "Engineers and skilled workers who have built many projects." },
    ],
    faqs: [
      { question: "What projects does {name} take up?", answer: "Residential homes, commercial buildings, renovations and turnkey projects in and around {city}." },
      { question: "How is the construction cost estimated?", answer: "We prepare an itemised estimate based on your plan, materials and finishes before any work starts." },
      { question: "Do you help with approvals?", answer: "Yes, we can guide you through plan approvals and the documents required." },
      { question: "How long does a house take to build?", answer: "It depends on size and design. We share a timeline with milestones before starting." },
      { question: "Do you offer a warranty?", answer: "Yes — warranty terms on workmanship are included in our contract. Ask us for details." },
    ],
    ctaTitle: "Planning to build? Talk to {name}",
    aiBrief: "Construction clients care about transparent estimates, quality materials, timelines, past projects, approvals help and warranty. Leading contractors lead with completed projects and a clear process.",
  },
  {
    key: "real-estate",
    label: "Real Estate",
    imageQuery: "house",
    categories: ["Real Estate"],
    keywords: ["real estate", "property", "realty", "estate agent", "broker", "developers", "plots", "rental services", "leasing"],
    palette: ["#27272a", "#09090b", "#d4af37"],
    theme: { font: "elegant", radius: "rounded", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["building", "key", "house", "map-pin", "landmark", "star"], scene: "build" },
    services: [
      { name: "Buy Property", description: "Verified flats, villas and plots matched to your budget and location.", icon: "house" },
      { name: "Sell Property", description: "Right pricing, genuine buyers and smooth paperwork.", icon: "tag" },
      { name: "Rentals & Leasing", description: "Residential and commercial rentals with verified tenants and owners.", icon: "key" },
      { name: "Commercial Spaces", description: "Shops, offices and warehouses in prime locations.", icon: "building" },
      { name: "Legal & Documentation", description: "Title checks, agreements and registration support.", icon: "file-text" },
      { name: "Home Loan Assistance", description: "Help with loan eligibility and approvals from leading banks.", icon: "landmark" },
    ],
    hero: {
      badge: "🔑 Trusted property advisors in {city}",
      heading: "{name} — Find the Right Property in {city}",
      subheading: "Verified homes, plots and commercial spaces with honest advice and complete paperwork support.",
      ctaPrimary: "Book a Site Visit",
      ctaSecondary: "Call an Advisor",
    },
    about: "{name} helps families and investors buy, sell and rent property in {city}. We only show verified listings, give honest advice on price and location, and support you through documentation and registration until the keys are in your hand.",
    servicesTitle: "Property Services",
    servicesSubtitle: "Buy, sell or rent — with verified listings",
    stats: [
      { value: "Verified", label: "Listings" },
      { value: "Free", label: "Site Visits" },
      { value: "Legal", label: "Paperwork Support" },
      { value: "Loan", label: "Assistance" },
    ],
    whyUs: [
      { title: "Verified Listings", description: "Every property is checked for title and approvals." },
      { title: "Local Market Knowledge", description: "Honest advice on pricing and the best areas to invest." },
      { title: "End-to-End Support", description: "From site visit to registration, we handle the paperwork." },
      { title: "No Pressure", description: "We show options and let you decide in your own time." },
    ],
    faqs: [
      { question: "Are the properties listed by {name} verified?", answer: "Yes. We check ownership documents and approvals before listing a property." },
      { question: "Do you charge brokerage?", answer: "Brokerage depends on the deal type. We share it upfront before any site visit." },
      { question: "Can you help with a home loan?", answer: "Yes, we help you check eligibility and connect you with leading banks." },
      { question: "Which areas do you cover?", answer: "We cover {city} and nearby areas. Tell us your preferred location and budget." },
      { question: "How do I book a site visit?", answer: "Call or WhatsApp us — we will schedule a visit at a time that suits you." },
    ],
    ctaTitle: "Looking for property? Talk to {name}",
    aiBrief: "Property buyers care about verified titles, location, price transparency, brokerage clarity, loan help and paperwork. Top agents lead with featured listings and site-visit booking.",
  },
  {
    key: "manufacturing",
    label: "Manufacturing & Trading",
    imageQuery: "factory",
    categories: ["Manufacturer", "Distributor", "Wholesaler", "Trading"],
    keywords: ["manufactur", "industries", "industrial", "distributor", "wholesale", "trader", "trading", "exporter", "fabrication", "engineering works", "importer", "packaging", "printing press", "plastic", "chemical", "foundry", "machine tools", "glass", "aluminium", "rubber", "paper mill", "textile", "spinning", "weaving"],
    palette: ["#0369a1", "#082f49", "#eab308"],
    theme: { font: "modern", radius: "sharp", heroStyle: "split", cardStyle: "outline" },
    motif: { icons: ["factory", "cog", "boxes", "truck", "package", "badge-check"], scene: "build" },
    services: [
      { name: "Product Manufacturing", description: "Consistent, quality-checked production at the volumes you need.", icon: "factory" },
      { name: "Custom & OEM Orders", description: "Products built to your specifications, drawings or samples.", icon: "cog" },
      { name: "Bulk & Wholesale Supply", description: "Reliable supply for dealers, retailers and institutions.", icon: "boxes" },
      { name: "Quality Testing", description: "Every batch checked before dispatch against agreed standards.", icon: "badge-check" },
      { name: "Packaging & Dispatch", description: "Secure packaging and timely dispatch across India.", icon: "package" },
      { name: "Dealer Partnerships", description: "Distribution opportunities for dealers in new regions.", icon: "users" },
    ],
    hero: {
      badge: "🏭 Manufacturer & supplier in {city}",
      heading: "{name} — Quality Products, Reliable Bulk Supply",
      subheading: "Manufacturing, custom orders and wholesale supply from {city}, with consistent quality and on-time dispatch across India.",
      ctaPrimary: "Request a Quote",
      ctaSecondary: "Talk to Sales",
    },
    about: "{name} is a {category} based in {city}. We produce and supply consistent, quality-checked products to dealers, businesses and institutions, with transparent pricing, dependable lead times and dispatch across India.",
    servicesTitle: "What We Offer",
    servicesSubtitle: "Manufacturing and supply you can plan around",
    stats: [
      { value: "QC", label: "Every Batch" },
      { value: "Bulk", label: "Order Capacity" },
      { value: "Pan-India", label: "Dispatch" },
      { value: "OEM", label: "Custom Orders" },
    ],
    whyUs: [
      { title: "Consistent Quality", description: "Standard processes and batch checks before every dispatch." },
      { title: "Capacity to Scale", description: "From trial orders to large recurring volumes." },
      { title: "Competitive Pricing", description: "Direct-from-source pricing for dealers and bulk buyers." },
      { title: "Dependable Lead Times", description: "Realistic timelines that we commit to and meet." },
    ],
    faqs: [
      { question: "What is the minimum order quantity at {name}?", answer: "MOQ depends on the product. Share your requirement and we will confirm quantities and pricing." },
      { question: "Do you take custom or OEM orders?", answer: "Yes. Send your specifications, drawings or samples and we will confirm feasibility and lead time." },
      { question: "Do you supply outside {city}?", answer: "Yes, we dispatch across India through trusted transport partners." },
      { question: "How do you ensure quality?", answer: "Every batch is inspected against agreed standards before it is packed and dispatched." },
      { question: "How can I become a dealer?", answer: "Contact our sales team with your location and business details — we will share the dealership terms." },
    ],
    ctaTitle: "Need reliable supply? Contact {name}",
    aiBrief: "B2B buyers care about consistent quality, certifications, MOQ, capacity, lead times, pricing for bulk and dispatch coverage. Leading manufacturers lead with product range, quality process and quote request.",
  },
  {
    key: "beverage",
    label: "Water, Dairy & Beverages",
    imageQuery: "water bottle",
    categories: [],
    keywords: ["water", "mineral", "aqua", "beverage", "dairy", "milk", "juice", "soda", "drinks", "ice"],
    palette: ["#0891b2", "#083344", "#22d3ee"],
    theme: { font: "elegant", radius: "pill", heroStyle: "gradient", cardStyle: "flat" },
    motif: { icons: ["droplet", "droplets", "waves", "mountain", "leaf", "recycle"], scene: "water" },
    services: [
      { name: "Packaged Drinking Water", description: "Purified, sealed bottles in multiple sizes for homes and offices.", icon: "droplet" },
      { name: "20L Jar Supply", description: "Regular jar delivery on a schedule that suits you.", icon: "droplets" },
      { name: "Office & Institution Supply", description: "Reliable bulk supply for offices, schools and hospitals.", icon: "building" },
      { name: "Event & Bulk Orders", description: "Large quantities for weddings, events and functions, delivered on time.", icon: "party-popper" },
      { name: "Private Label Bottles", description: "Branded bottles for hotels, restaurants and corporates.", icon: "tag" },
      { name: "Home Delivery", description: "Doorstep delivery across {city} with easy reordering.", icon: "truck" },
    ],
    hero: {
      badge: "💧 Pure. Safe. Delivered in {city}",
      heading: "{name} — Purity You Can Taste",
      subheading: "Quality-tested drinking water and beverages with dependable doorstep and bulk delivery across {city}.",
      ctaPrimary: "Order Now",
      ctaSecondary: "Call for Bulk Supply",
    },
    about: "{name} produces and supplies quality-tested packaged water and beverages in {city}. Every batch goes through careful purification and hygiene checks, and our delivery team makes sure homes, offices and events never run out.",
    servicesTitle: "Our Products & Supply",
    servicesSubtitle: "For homes, offices and events",
    stats: [
      { value: "Tested", label: "Every Batch" },
      { value: "Hygienic", label: "Sealed Packing" },
      { value: "Doorstep", label: "Delivery" },
      { value: "Bulk", label: "Supply Ready" },
    ],
    whyUs: [
      { title: "Quality Tested", description: "Multi-stage purification and regular quality testing." },
      { title: "Hygienic Packing", description: "Sealed, tamper-proof packaging you can trust." },
      { title: "Reliable Delivery", description: "Scheduled deliveries that arrive when promised." },
      { title: "Responsible Packaging", description: "Recyclable materials and reduced plastic where possible." },
    ],
    faqs: [
      { question: "Is {name} water quality tested?", answer: "Yes. Our water goes through multi-stage purification and regular quality testing before packing." },
      { question: "Which bottle sizes are available?", answer: "We offer common bottle sizes and 20L jars. Call us for the full range and pricing." },
      { question: "Do you deliver to offices and homes?", answer: "Yes, we deliver across {city} — one-time orders or regular scheduled supply." },
      { question: "Can I order for an event?", answer: "Yes. Share the date and quantity and we will deliver on time." },
      { question: "Do you offer private-label bottles?", answer: "Yes, for hotels, restaurants and corporates. Contact us for minimum quantities." },
    ],
    ctaTitle: "Stay refreshed — order from {name}",
    aiBrief: "Water/beverage buyers care about purity and testing, hygiene, certifications (e.g. BIS/FSSAI if the owner has them — never claim), bottle sizes, delivery reliability, bulk/event supply and sustainability. Top brands lead with purity story and easy ordering.",
  },
  {
    key: "food",
    label: "Restaurant & Food",
    imageQuery: "restaurant food",
    categories: ["Restaurant"],
    keywords: ["restaurant", "cafe", "café", "bakery", "sweet", "dhaba", "kitchen", "food", "catering", "biryani", "pizza", "tiffin", "cloud kitchen", "mithai", "namkeen", "snacks", "vegetable", "meat", "poultry", "fruit", "chaat", "spice", "masala", "flour", "oil mill"],
    palette: ["#ea580c", "#7c2d12", "#fbbf24"],
    theme: { font: "classic", radius: "rounded", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["utensils-crossed", "chef-hat", "coffee", "pizza", "flame", "star"], scene: "craft" },
    services: [
      { name: "Dine-In", description: "A comfortable space to enjoy freshly prepared food with family and friends.", icon: "utensils-crossed" },
      { name: "Takeaway", description: "Order ahead and pick up hot, freshly packed food.", icon: "package" },
      { name: "Home Delivery", description: "Fast delivery across nearby areas, packed to arrive fresh.", icon: "truck" },
      { name: "Catering", description: "Menus for weddings, parties and office events, served on time.", icon: "chef-hat" },
      { name: "Party Orders", description: "Bulk orders and platters for celebrations at home.", icon: "party-popper" },
      { name: "Chef's Specials", description: "Signature dishes our regulars come back for.", icon: "star" },
    ],
    hero: {
      badge: "🍽️ Loved in {city}",
      heading: "{name} — Fresh Food, Made With Care",
      subheading: "Dine-in, takeaway, delivery and catering in {city}. Fresh ingredients, honest portions and flavours you will come back for.",
      ctaPrimary: "Order Now",
      ctaSecondary: "Reserve a Table",
    },
    about: "{name} is a {category} in {city} serving fresh, flavourful food made from quality ingredients. Whether you dine with us, order in, or need catering for an event, we cook every order with the same care and hygiene.",
    servicesTitle: "Dine, Order or Celebrate",
    servicesSubtitle: "However you want to enjoy our food",
    stats: [
      { value: "Fresh", label: "Daily Ingredients" },
      { value: "Hygienic", label: "Kitchen" },
      { value: "Fast", label: "Delivery" },
      { value: "Party", label: "Orders Welcome" },
    ],
    whyUs: [
      { title: "Fresh Ingredients", description: "Cooked fresh every day — never reheated leftovers." },
      { title: "Hygienic Kitchen", description: "Clean kitchen practices you can trust." },
      { title: "Generous Portions", description: "Honest portions at fair prices." },
      { title: "Quick Service", description: "Hot food, served or delivered without the long wait." },
    ],
    faqs: [
      { question: "Does {name} offer home delivery?", answer: "Yes, we deliver to nearby areas in {city}. Call or WhatsApp to place your order." },
      { question: "Do you take catering orders?", answer: "Yes — for weddings, parties and office events. Share the date and guest count for a quote." },
      { question: "Is there vegetarian food?", answer: "Yes, we have vegetarian options on the menu. Ask us about today's specials." },
      { question: "Can I reserve a table?", answer: "Yes, call us to reserve a table, especially on weekends." },
      { question: "What are your timings?", answer: "Our opening hours are listed on this page." },
    ],
    ctaTitle: "Hungry? Order from {name} now",
    aiBrief: "Diners care about taste, freshness, hygiene, menu highlights, pricing, delivery speed and ambience. Leading restaurants lead with signature dishes, ordering options and reviews.",
  },
  {
    key: "hotel",
    label: "Hotel & Stay",
    imageQuery: "hotel room",
    categories: ["Hotel"],
    keywords: ["hotel", "resort", "lodge", "guest house", "homestay", "inn", "stay", "banquet", "hostel", "dormitory", "paying guest"],
    palette: ["#7c3aed", "#2e1065", "#f59e0b"],
    theme: { font: "elegant", radius: "rounded", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["bed-double", "hotel", "concierge-bell", "star", "coffee", "key"], scene: "craft" },
    services: [
      { name: "Deluxe Rooms", description: "Clean, comfortable AC rooms with modern amenities.", icon: "bed-double" },
      { name: "Banquet Hall", description: "Elegant space for weddings, receptions and corporate events.", icon: "party-popper" },
      { name: "In-House Restaurant", description: "Freshly cooked meals served all day.", icon: "utensils-crossed" },
      { name: "Airport & Station Pickup", description: "Hassle-free transfers on request.", icon: "car" },
      { name: "Free Wi-Fi & Parking", description: "Stay connected, park safely.", icon: "wifi" },
      { name: "24/7 Front Desk", description: "Help whenever you need it, day or night.", icon: "concierge-bell" },
    ],
    hero: {
      badge: "🏨 Comfortable stays in {city}",
      heading: "{name} — Your Comfortable Stay in {city}",
      subheading: "Clean rooms, warm hospitality and great value — ideal for families, business travellers and events.",
      ctaPrimary: "Book Your Stay",
      ctaSecondary: "Call Reception",
    },
    about: "{name} is a hotel in {city} offering clean, comfortable rooms and warm hospitality. Whether you are here for business, family or a celebration, our team makes sure your stay is easy, relaxed and great value.",
    servicesTitle: "Rooms & Amenities",
    servicesSubtitle: "Everything for a relaxed stay",
    stats: [
      { value: "24/7", label: "Front Desk" },
      { value: "Clean", label: "Sanitised Rooms" },
      { value: "Free", label: "Wi-Fi" },
      { value: "Events", label: "Banquet Ready" },
    ],
    whyUs: [
      { title: "Prime Location", description: "Easy access to the main parts of {city}." },
      { title: "Spotless Rooms", description: "Housekeeping that takes cleanliness seriously." },
      { title: "Warm Hospitality", description: "Staff who go out of their way to help." },
      { title: "Great Value", description: "Comfort and amenities at fair room rates." },
    ],
    faqs: [
      { question: "What are the check-in and check-out times at {name}?", answer: "Please call reception for current check-in and check-out timings — early check-in is subject to availability." },
      { question: "Do you have parking?", answer: "Yes, parking is available for guests." },
      { question: "Can I book the banquet hall?", answer: "Yes — share your date and guest count and we will send a quote." },
      { question: "Do you offer airport pickup?", answer: "Yes, on request. Let us know your arrival details while booking." },
      { question: "How do I book a room?", answer: "Call or WhatsApp us with your dates and number of guests." },
    ],
    ctaTitle: "Planning a visit? Stay with {name}",
    aiBrief: "Hotel guests care about cleanliness, location, room types, amenities, price, check-in policy and event spaces. Top hotels lead with room photos, amenities and direct booking.",
  },
  {
    key: "healthcare",
    label: "Clinic & Hospital",
    imageQuery: "doctor",
    categories: ["Clinic", "Hospital", "Doctor"],
    keywords: ["clinic", "hospital", "doctor", "dr.", "medical", "health", "diagnostic", "pathology", "lab", "physio", "ayurved", "homeopath", "pharmacy", "nursing", "child specialist", "gynec", "orthoped", "paediatric", "pediatric", "cardio", "neuro", "surgeon", "maternity", "hearing", "audiolog"],
    palette: ["#0d9488", "#134e4a", "#38bdf8"],
    theme: { font: "modern", radius: "rounded", heroStyle: "split", cardStyle: "outline" },
    motif: { icons: ["stethoscope", "heart-pulse", "pill", "shield-check", "plus", "users"], scene: "care" },
    services: [
      { name: "General Consultation", description: "Careful diagnosis and treatment for everyday health concerns.", icon: "stethoscope" },
      { name: "Health Check-Ups", description: "Preventive packages to catch problems early.", icon: "heart-pulse" },
      { name: "Lab Tests", description: "Accurate tests with quick, reliable reports.", icon: "flask-conical" },
      { name: "Vaccination", description: "Vaccines for children and adults, as per schedule.", icon: "shield-check" },
      { name: "Chronic Care", description: "Ongoing care for diabetes, BP and thyroid.", icon: "activity" },
      { name: "Follow-Up Care", description: "Regular reviews to keep your recovery on track.", icon: "calendar-check" },
    ],
    hero: {
      badge: "🩺 Caring for {city}",
      heading: "{name} — Expert Care, Close to Home",
      subheading: "Consultations, check-ups and diagnostics in {city} with a caring team and minimal waiting.",
      ctaPrimary: "Book Appointment",
      ctaSecondary: "Call Clinic",
    },
    about: "{name} provides trusted medical care in {city}. Our team takes time to listen, explains treatment clearly, and follows up so that every patient feels cared for — from routine consultations to ongoing treatment.",
    servicesTitle: "Our Medical Services",
    servicesSubtitle: "Care for every stage of life",
    stats: [
      { value: "Qualified", label: "Doctors" },
      { value: "Quick", label: "Appointments" },
      { value: "Clean", label: "Hygienic Clinic" },
      { value: "Clear", label: "Treatment Advice" },
    ],
    whyUs: [
      { title: "Experienced Doctors", description: "Qualified professionals who take time to listen." },
      { title: "Minimal Waiting", description: "Appointments that respect your time." },
      { title: "Hygienic Facility", description: "Strict cleanliness and sterilisation protocols." },
      { title: "Clear Guidance", description: "Treatment explained simply, with honest advice." },
    ],
    faqs: [
      { question: "How do I book an appointment at {name}?", answer: "Call or WhatsApp us to book a slot. Walk-ins are welcome subject to availability." },
      { question: "What are the consultation timings?", answer: "Our timings are listed on this page. Call ahead on holidays." },
      { question: "Do you offer health check-up packages?", answer: "Yes, we offer preventive health check-ups. Call us for packages and pricing." },
      { question: "Are lab tests available?", answer: "Yes, common lab tests are available with quick reports." },
      { question: "Where is the clinic located?", answer: "We are located in {city} — see the map on this page for directions." },
    ],
    ctaTitle: "Need a consultation? Book with {name}",
    aiBrief: "Patients care about doctor qualifications, specialities, timings, waiting time, hygiene, fees and appointment booking. Never invent qualifications, success rates or medical claims.",
  },
  {
    key: "dental",
    label: "Dental Clinic",
    imageQuery: "dentist",
    categories: ["Dentist"],
    keywords: ["dental", "dentist", "teeth", "orthodont", "smile"],
    palette: ["#0ea5e9", "#0c4a6e", "#fbbf24"],
    theme: { font: "modern", radius: "pill", heroStyle: "split", cardStyle: "flat" },
    motif: { icons: ["smile", "sparkles", "shield-check", "star", "heart", "plus"], scene: "care" },
    services: [
      { name: "Dental Check-Up & Cleaning", description: "Thorough check-ups and scaling to keep teeth healthy.", icon: "sparkles" },
      { name: "Root Canal Treatment", description: "Pain-managed RCT to save natural teeth.", icon: "shield-check" },
      { name: "Braces & Aligners", description: "Straighter teeth with metal, ceramic or clear aligners.", icon: "smile" },
      { name: "Teeth Whitening", description: "Safe, professional whitening for a brighter smile.", icon: "star" },
      { name: "Dental Implants", description: "Permanent, natural-looking tooth replacement.", icon: "plus" },
      { name: "Kids Dentistry", description: "Gentle care that makes children comfortable.", icon: "baby" },
    ],
    hero: {
      badge: "😁 Gentle dental care in {city}",
      heading: "{name} — Healthy Smiles, Gentle Care",
      subheading: "Modern dental treatments in {city} with clear pricing, careful sterilisation and a team that puts you at ease.",
      ctaPrimary: "Book a Check-Up",
      ctaSecondary: "Call Clinic",
    },
    about: "{name} is a dental clinic in {city} offering complete care for the whole family. We use modern equipment, follow strict sterilisation, and explain every treatment and its cost before we begin.",
    servicesTitle: "Dental Treatments",
    servicesSubtitle: "Complete care for the whole family",
    stats: [
      { value: "Modern", label: "Equipment" },
      { value: "Sterile", label: "Instruments" },
      { value: "Painless", label: "Approach" },
      { value: "Family", label: "Dentistry" },
    ],
    whyUs: [
      { title: "Gentle Treatment", description: "Pain management and a calm, unhurried approach." },
      { title: "Strict Sterilisation", description: "Instruments sterilised for every patient." },
      { title: "Transparent Pricing", description: "Treatment cost explained before we start." },
      { title: "Modern Technology", description: "Up-to-date equipment for precise results." },
    ],
    faqs: [
      { question: "Is root canal treatment painful at {name}?", answer: "We use local anaesthesia and a gentle approach, so most patients feel little discomfort." },
      { question: "How often should I get a dental check-up?", answer: "Every six months is recommended for most people." },
      { question: "Do you treat children?", answer: "Yes, we offer gentle dental care for kids." },
      { question: "How much do braces cost?", answer: "It depends on the type and treatment length. We share a clear estimate after examination." },
      { question: "How do I book an appointment?", answer: "Call or WhatsApp us to book a convenient slot." },
    ],
    ctaTitle: "Ready for a healthier smile? Visit {name}",
    aiBrief: "Dental patients care about pain-free treatment, hygiene/sterilisation, cost transparency, technology and the dentist's experience. Never invent qualifications or success rates.",
  },
  {
    key: "beauty",
    label: "Salon & Beauty",
    imageQuery: "beauty salon",
    categories: ["Salon", "Beauty Parlour"],
    keywords: ["salon", "beauty", "parlour", "parlor", "spa", "makeup", "bridal", "nail", "unisex", "hair", "mehndi", "mehendi", "grooming", "wellness"],
    palette: ["#e11d48", "#4c0519", "#f59e0b"],
    theme: { font: "elegant", radius: "pill", heroStyle: "image", cardStyle: "flat" },
    motif: { icons: ["scissors", "sparkles", "flower-2", "gem", "heart", "star"], scene: "care" },
    services: [
      { name: "Haircut & Styling", description: "Cuts and styles that suit your face and lifestyle.", icon: "scissors" },
      { name: "Bridal Makeup", description: "Complete bridal looks with trials and on-time service.", icon: "gem" },
      { name: "Facials & Skin Care", description: "Treatments for glowing, healthy skin.", icon: "sparkles" },
      { name: "Hair Spa & Treatments", description: "Nourishing care for smooth, strong hair.", icon: "flower-2" },
      { name: "Hair Colour", description: "Global colour, highlights and balayage with quality products.", icon: "paintbrush" },
      { name: "Manicure & Pedicure", description: "Relaxing care for hands and feet.", icon: "heart" },
    ],
    hero: {
      badge: "✨ Look your best in {city}",
      heading: "{name} — Where Beauty Meets Care",
      subheading: "Hair, skin and bridal services in {city} by skilled stylists using quality products, in a clean and relaxing space.",
      ctaPrimary: "Book Appointment",
      ctaSecondary: "Call Salon",
    },
    about: "{name} is a {category} in {city} offering hair, skin and bridal services. Our trained stylists use quality products and hygienic practices, and take time to understand the look you want.",
    servicesTitle: "Our Services",
    servicesSubtitle: "Hair, skin, bridal and more",
    stats: [
      { value: "Skilled", label: "Stylists" },
      { value: "Quality", label: "Branded Products" },
      { value: "Hygienic", label: "Tools & Space" },
      { value: "Bridal", label: "Packages" },
    ],
    whyUs: [
      { title: "Trained Stylists", description: "Up-to-date techniques and trends." },
      { title: "Quality Products", description: "Only trusted, branded products on your hair and skin." },
      { title: "Hygiene First", description: "Sanitised tools and fresh linen for every client." },
      { title: "Relaxing Experience", description: "A calm space where you can unwind." },
    ],
    faqs: [
      { question: "Do I need an appointment at {name}?", answer: "Appointments are recommended, especially on weekends. Walk-ins are welcome when slots are free." },
      { question: "Do you offer bridal packages?", answer: "Yes, including trials. Contact us with your wedding date for packages." },
      { question: "Which products do you use?", answer: "We use quality, branded products suited to your hair and skin type." },
      { question: "Is the salon unisex?", answer: "Please call us to confirm the services available for you." },
      { question: "How do I book?", answer: "Call or WhatsApp us to book your preferred slot." },
    ],
    ctaTitle: "Treat yourself — book at {name}",
    aiBrief: "Salon clients care about stylist skill, hygiene, product quality, pricing, bridal packages and booking ease. Top salons lead with a portfolio of looks and easy booking.",
  },
  {
    key: "fitness",
    label: "Gym & Fitness",
    imageQuery: "gym",
    categories: ["Gym", "Fitness Center"],
    keywords: ["gym", "fitness", "yoga", "crossfit", "zumba", "workout", "martial", "sports academy", "swimming", "aerobic", "pilates"],
    palette: ["#dc2626", "#0a0a0a", "#facc15"],
    theme: { font: "modern", radius: "sharp", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["dumbbell", "heart-pulse", "timer", "flame", "trophy", "activity"], scene: "care" },
    services: [
      { name: "Personal Training", description: "One-on-one coaching built around your goals.", icon: "dumbbell" },
      { name: "Weight Training", description: "Well-equipped strength floor with expert guidance.", icon: "trophy" },
      { name: "Cardio Zone", description: "Treadmills, cycles and cross-trainers for endurance.", icon: "heart-pulse" },
      { name: "Group Classes", description: "Zumba, HIIT and functional training sessions.", icon: "users" },
      { name: "Yoga", description: "Classes for flexibility, strength and calm.", icon: "flower-2" },
      { name: "Diet Plans", description: "Nutrition guidance that fits your routine.", icon: "apple" },
    ],
    hero: {
      badge: "🔥 Train hard in {city}",
      heading: "{name} — Stronger Every Day",
      subheading: "Modern equipment, certified trainers and plans that fit your goal — from weight loss to strength, in {city}.",
      ctaPrimary: "Book a Free Trial",
      ctaSecondary: "Call Now",
    },
    about: "{name} is a {category} in {city} built for real results. Our trainers create plans for your goal, guide your form, and keep you motivated — whether you are starting out or training seriously.",
    servicesTitle: "Training Programs",
    servicesSubtitle: "Plans for every goal and level",
    stats: [
      { value: "Certified", label: "Trainers" },
      { value: "Modern", label: "Equipment" },
      { value: "Custom", label: "Workout Plans" },
      { value: "Free", label: "Trial Session" },
    ],
    whyUs: [
      { title: "Certified Trainers", description: "Coaches who correct your form and keep you safe." },
      { title: "Modern Equipment", description: "Well-maintained machines and free weights." },
      { title: "Goal-Based Plans", description: "Workouts and diet built around your target." },
      { title: "Motivating Community", description: "Train alongside people who push you forward." },
    ],
    faqs: [
      { question: "Does {name} offer a free trial?", answer: "Yes, contact us to book a trial session and tour the gym." },
      { question: "What are the membership plans?", answer: "We offer monthly, quarterly and yearly plans. Call us for current pricing." },
      { question: "Do you have personal trainers?", answer: "Yes, certified personal trainers are available." },
      { question: "Are there separate timings for women?", answer: "Please call us for current batch timings." },
      { question: "Do you provide diet plans?", answer: "Yes, nutrition guidance is available with our programs." },
    ],
    ctaTitle: "Start your fitness journey at {name}",
    aiBrief: "Gym members care about trainer certification, equipment, hygiene, timings, membership pricing, trial sessions and results. Never invent transformation claims.",
  },
  {
    key: "professional",
    label: "Legal, Tax & Consulting",
    imageQuery: "office",
    categories: ["Lawyer", "CA", "Consultant"],
    keywords: ["lawyer", "advocate", "legal", "law firm", "ca ", "chartered", "accountant", "tax", "gst", "consult", "audit", "advisory", "insurance", "finance", "company secretary", "financial", "loan", "recruit", "placement", "manpower", "payroll", "compliance", "valuation", "notary", "astrolog", "ngo", "foundation", "trust"],
    palette: ["#4f46e5", "#1e1b4b", "#f59e0b"],
    theme: { font: "classic", radius: "rounded", heroStyle: "split", cardStyle: "outline" },
    motif: { icons: ["scale", "file-text", "landmark", "briefcase", "calculator", "shield-check"], scene: "tech" },
    services: [
      { name: "Consultation", description: "Clear advice on your matter from an experienced professional.", icon: "briefcase" },
      { name: "GST & Tax Filing", description: "Accurate, on-time returns for individuals and businesses.", icon: "calculator" },
      { name: "Company Registration", description: "Incorporation, LLP and compliance set-up done right.", icon: "landmark" },
      { name: "Legal Documentation", description: "Agreements, notices and drafting you can rely on.", icon: "file-text" },
      { name: "Audit & Compliance", description: "Keep your business compliant and penalty-free.", icon: "shield-check" },
      { name: "Dispute Resolution", description: "Representation and resolution with your interests first.", icon: "scale" },
    ],
    hero: {
      badge: "⚖️ Trusted advisors in {city}",
      heading: "{name} — Clear Advice. Complete Compliance.",
      subheading: "Professional {category} services in {city} — explained simply, delivered on time and handled confidentially.",
      ctaPrimary: "Book a Consultation",
      ctaSecondary: "Call Office",
    },
    about: "{name} offers professional {category} services in {city} to individuals and businesses. We explain options in plain language, keep you informed at every step and treat your information with complete confidentiality.",
    servicesTitle: "Our Services",
    servicesSubtitle: "Professional help, explained simply",
    stats: [
      { value: "Qualified", label: "Professionals" },
      { value: "On-Time", label: "Filings" },
      { value: "100%", label: "Confidential" },
      { value: "Clear", label: "Fee Structure" },
    ],
    whyUs: [
      { title: "Experienced Professionals", description: "Qualified expertise across individual and business matters." },
      { title: "Plain-Language Advice", description: "We explain your options without jargon." },
      { title: "Deadline-Driven", description: "Filings and documents handled before due dates." },
      { title: "Confidential", description: "Your information stays private, always." },
    ],
    faqs: [
      { question: "How do I book a consultation with {name}?", answer: "Call or WhatsApp us to schedule an in-person or phone consultation." },
      { question: "What are your fees?", answer: "Fees depend on the work involved. We share them clearly before starting." },
      { question: "Do you work with businesses outside {city}?", answer: "Yes, many services can be handled remotely." },
      { question: "Which documents should I bring?", answer: "It depends on your matter — we will share a checklist when you book." },
      { question: "Is my information confidential?", answer: "Absolutely. All client information is kept strictly confidential." },
    ],
    ctaTitle: "Get expert advice from {name}",
    aiBrief: "Clients of lawyers/CAs/consultants care about expertise, confidentiality, fee clarity, deadlines and responsiveness. Never invent case wins or credentials; respect Bar Council advertising norms (factual, no solicitation claims).",
  },
  {
    key: "education",
    label: "Education & Coaching",
    imageQuery: "classroom",
    categories: ["Education", "Coaching", "School", "College"],
    keywords: ["school", "college", "coaching", "academy", "classes", "tuition", "institute", "education", "training centre", "preschool", "play school", "computer training", "spoken english", "library", "skill training", "vocational", "learning"],
    palette: ["#2563eb", "#1e3a8a", "#f59e0b"],
    theme: { font: "modern", radius: "rounded", heroStyle: "split", cardStyle: "shadow" },
    motif: { icons: ["graduation-cap", "book-open", "pen-tool", "lightbulb", "trophy", "users"], scene: "tech" },
    services: [
      { name: "Admissions Open", description: "Simple admission process with counselling for parents and students.", icon: "graduation-cap" },
      { name: "Expert Faculty", description: "Experienced teachers who make concepts clear.", icon: "users" },
      { name: "Regular Tests", description: "Weekly tests and progress reports to track improvement.", icon: "pen-tool" },
      { name: "Doubt-Solving Sessions", description: "Personal attention for every question.", icon: "lightbulb" },
      { name: "Study Material", description: "Well-structured notes and practice sets.", icon: "book-open" },
      { name: "Parent Updates", description: "Regular communication on attendance and performance.", icon: "message-circle" },
    ],
    hero: {
      badge: "🎓 Learning that works, in {city}",
      heading: "{name} — Build a Strong Foundation for Success",
      subheading: "Experienced faculty, small batches and regular assessments in {city} — so every student gets the attention they need.",
      ctaPrimary: "Enquire for Admission",
      ctaSecondary: "Call Counsellor",
    },
    about: "{name} is a {category} in {city} focused on real understanding, not rote learning. Our teachers give personal attention, track progress with regular tests, and keep parents informed at every step.",
    servicesTitle: "Programs & Facilities",
    servicesSubtitle: "Everything a student needs to grow",
    stats: [
      { value: "Small", label: "Batch Sizes" },
      { value: "Weekly", label: "Assessments" },
      { value: "Expert", label: "Faculty" },
      { value: "Regular", label: "Parent Updates" },
    ],
    whyUs: [
      { title: "Experienced Teachers", description: "Faculty who make difficult topics simple." },
      { title: "Personal Attention", description: "Small batches so no student is left behind." },
      { title: "Progress Tracking", description: "Regular tests and clear reports." },
      { title: "Safe Environment", description: "A disciplined, supportive place to learn." },
    ],
    faqs: [
      { question: "How do I take admission at {name}?", answer: "Call or visit us — our counsellor will explain courses, batches and the admission process." },
      { question: "What is the batch size?", answer: "We keep batches small so each student gets personal attention." },
      { question: "Do you conduct tests?", answer: "Yes, regular tests with performance reports shared with parents." },
      { question: "What are the fees?", answer: "Fees depend on the course. Contact us for the current fee structure." },
      { question: "Is a demo class available?", answer: "Yes, contact us to book a demo class." },
    ],
    ctaTitle: "Admissions open — talk to {name}",
    aiBrief: "Parents/students care about faculty, results, batch size, fees, safety, facilities and demo classes. Never invent toppers, ranks or pass percentages.",
  },
  {
    key: "tech",
    label: "IT & Digital Services",
    imageQuery: "laptop office",
    categories: ["IT Company", "Software Company", "Digital Marketing", "Freelancer"],
    keywords: ["software", "it ", "tech", "digital", "web", "app", "solutions", "marketing agency", "seo", "developer", "infotech", "systems", "graphic", "video editing", "animation", "call center", "call centre", "bpo", "data entry", "ui ux", "cloud"],
    palette: ["#6366f1", "#0f172a", "#22d3ee"],
    theme: { font: "modern", radius: "rounded", heroStyle: "gradient", cardStyle: "outline" },
    motif: { icons: ["code", "cpu", "cloud", "smartphone", "zap", "shield-check"], scene: "tech" },
    services: [
      { name: "Custom Software Development", description: "Software built around your exact business process.", icon: "code" },
      { name: "Website Development", description: "Fast, secure, mobile-first websites that convert.", icon: "globe" },
      { name: "Mobile App Development", description: "Android and iOS apps your users will love.", icon: "smartphone" },
      { name: "Cloud & DevOps", description: "Scalable, reliable infrastructure and deployments.", icon: "cloud" },
      { name: "Digital Marketing & SEO", description: "Get found, get leads, grow measurably.", icon: "megaphone" },
      { name: "Support & Maintenance", description: "Ongoing updates, monitoring and quick fixes.", icon: "headphones" },
    ],
    hero: {
      badge: "⚡ Technology partner from {city}",
      heading: "{name} — Software That Moves Your Business Forward",
      subheading: "Custom software, websites, apps and digital growth — built by a team that understands business, not just code.",
      ctaPrimary: "Discuss Your Project",
      ctaSecondary: "Book a Call",
    },
    about: "{name} is a {category} in {city} building custom software, websites and apps for growing businesses. We start by understanding your process, deliver in clear milestones, and support the product long after launch.",
    servicesTitle: "What We Build",
    servicesSubtitle: "From idea to launch — and beyond",
    stats: [
      { value: "Agile", label: "Delivery" },
      { value: "Secure", label: "By Design" },
      { value: "Clear", label: "Milestones" },
      { value: "Ongoing", label: "Support" },
    ],
    whyUs: [
      { title: "Business-First Approach", description: "We solve the business problem, not just the ticket." },
      { title: "Transparent Process", description: "Milestones, demos and clear communication." },
      { title: "Modern Technology", description: "Proven, maintainable stacks that scale." },
      { title: "Long-Term Support", description: "We stay with you after go-live." },
    ],
    faqs: [
      { question: "How much does a project with {name} cost?", answer: "It depends on scope. After a short discussion we share a clear proposal with timeline and cost." },
      { question: "How long does development take?", answer: "Timelines depend on features. We break work into milestones so you see progress early." },
      { question: "Do you provide support after launch?", answer: "Yes, we offer ongoing maintenance and support plans." },
      { question: "Will I own the source code?", answer: "Ownership terms are agreed in the contract before the project starts." },
      { question: "Do you work with clients outside {city}?", answer: "Yes, we work with clients across India and abroad." },
    ],
    ctaTitle: "Have a project in mind? Talk to {name}",
    aiBrief: "Tech buyers care about expertise, process, portfolio, timelines, pricing clarity, code ownership, security and support. Top agencies lead with case studies and a discovery call CTA. Never invent client names.",
  },
  {
    key: "automotive",
    label: "Automobile & Garage",
    imageQuery: "car repair",
    categories: ["Automobile", "Garage"],
    keywords: ["garage", "auto", "car", "bike", "motor", "service center", "tyre", "workshop", "vehicle", "showroom", "driving school", "driving services"],
    palette: ["#0369a1", "#020617", "#ef4444"],
    theme: { font: "modern", radius: "sharp", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["car", "wrench", "gauge", "fuel", "cog", "shield-check"], scene: "drive" },
    services: [
      { name: "Periodic Car Service", description: "Scheduled servicing with genuine oil and filters.", icon: "wrench" },
      { name: "Denting & Painting", description: "Factory-finish body repair and paint.", icon: "paintbrush" },
      { name: "AC Repair & Service", description: "Cool, clean air with gas top-up and leak checks.", icon: "snowflake" },
      { name: "Engine Diagnostics", description: "Computerised scanning to find faults fast.", icon: "gauge" },
      { name: "Tyres & Alignment", description: "Wheel alignment, balancing and tyre replacement.", icon: "cog" },
      { name: "Insurance Claims", description: "Hassle-free cashless claim assistance.", icon: "shield-check" },
    ],
    hero: {
      badge: "🔧 Trusted car care in {city}",
      heading: "{name} — Expert Service. Honest Pricing.",
      subheading: "Car servicing, repairs and body work in {city} — with genuine parts, clear estimates and on-time delivery.",
      ctaPrimary: "Book a Service",
      ctaSecondary: "Call Workshop",
    },
    about: "{name} is a {category} in {city} trusted for honest, quality vehicle care. Our trained mechanics use genuine parts, share an estimate before starting any work, and deliver your vehicle back when promised.",
    servicesTitle: "Workshop Services",
    servicesSubtitle: "Everything your vehicle needs",
    stats: [
      { value: "Genuine", label: "Spare Parts" },
      { value: "Upfront", label: "Estimates" },
      { value: "Trained", label: "Mechanics" },
      { value: "Pickup", label: "& Drop" },
    ],
    whyUs: [
      { title: "Genuine Parts", description: "Original or OEM-grade parts only." },
      { title: "Estimate First", description: "No work starts without your approval on cost." },
      { title: "Skilled Mechanics", description: "Trained technicians and proper tools." },
      { title: "On-Time Delivery", description: "Your vehicle back when we promised." },
    ],
    faqs: [
      { question: "Do you offer pickup and drop at {name}?", answer: "Yes, pickup and drop can be arranged in {city}. Ask while booking." },
      { question: "Do you use genuine parts?", answer: "Yes, we use genuine or OEM-grade parts and show you the old parts on request." },
      { question: "How long does a service take?", answer: "A regular service is usually same-day. We confirm timing when you book." },
      { question: "Do you handle insurance claims?", answer: "Yes, we assist with cashless and reimbursement claims." },
      { question: "How do I book a service?", answer: "Call or WhatsApp us with your vehicle model and the service you need." },
    ],
    ctaTitle: "Vehicle needs attention? Book with {name}",
    aiBrief: "Vehicle owners care about genuine parts, upfront estimates, mechanic skill, turnaround time, pickup/drop and insurance help. Top workshops lead with service menu and booking.",
  },
  {
    key: "events",
    label: "Photography & Events",
    imageQuery: "wedding",
    categories: ["Photographer", "Event Management"],
    keywords: ["photo", "studio", "wedding", "event", "decor", "planner", "dj", "caterer", "tent", "mandap", "films", "videograph", "marriage hall", "banquet", "catering services"],
    palette: ["#a21caf", "#1e0a2e", "#fbbf24"],
    theme: { font: "elegant", radius: "rounded", heroStyle: "image", cardStyle: "flat" },
    motif: { icons: ["camera", "party-popper", "heart", "sparkles", "music", "star"], scene: "craft" },
    services: [
      { name: "Wedding Photography", description: "Candid and traditional coverage of your big day.", icon: "camera" },
      { name: "Pre-Wedding Shoots", description: "Beautiful, story-driven shoots at stunning locations.", icon: "heart" },
      { name: "Event Planning", description: "Complete planning so you can enjoy your event.", icon: "calendar-check" },
      { name: "Decoration & Themes", description: "Decor that turns any venue into an experience.", icon: "sparkles" },
      { name: "Corporate Events", description: "Conferences, launches and team events handled end to end.", icon: "briefcase" },
      { name: "Videography & Films", description: "Cinematic films and highlight reels.", icon: "video" },
    ],
    hero: {
      badge: "📸 Moments that last, from {city}",
      heading: "{name} — Your Moments, Beautifully Captured",
      subheading: "Photography, films and event planning in {city} — creative work, punctual delivery and a team that cares about your day.",
      ctaPrimary: "Check Availability",
      ctaSecondary: "Call Us",
    },
    about: "{name} is a {category} in {city} creating memorable events and timeless photographs. We plan carefully, show up on time, and deliver work you will be proud to share for years.",
    servicesTitle: "What We Do",
    servicesSubtitle: "From planning to the final album",
    stats: [
      { value: "Creative", label: "Team" },
      { value: "On-Time", label: "Delivery" },
      { value: "Candid", label: "+ Traditional" },
      { value: "Custom", label: "Packages" },
    ],
    whyUs: [
      { title: "Creative Eye", description: "Every frame and detail planned with care." },
      { title: "Punctual & Professional", description: "On time, every time — your day runs smoothly." },
      { title: "Custom Packages", description: "Pay only for what you need." },
      { title: "Timely Delivery", description: "Photos and films delivered when promised." },
    ],
    faqs: [
      { question: "How early should I book {name}?", answer: "Wedding season dates fill quickly — book as early as possible to secure your date." },
      { question: "What do your packages include?", answer: "Packages are customised. We share inclusions clearly in the quote." },
      { question: "When will I receive my photos?", answer: "Delivery timelines are shared at booking and depend on the package." },
      { question: "Do you travel for events?", answer: "Yes, we cover events outside {city}; travel costs may apply." },
      { question: "How do I check availability?", answer: "Call or WhatsApp us with your event date and location." },
    ],
    ctaTitle: "Planning something special? Talk to {name}",
    aiBrief: "Clients care about portfolio style, punctuality, package inclusions, delivery timelines, pricing and availability. Lead with portfolio and date-availability CTA.",
  },
  {
    key: "interior",
    label: "Interior Design",
    imageQuery: "living room",
    categories: ["Interior Designer"],
    keywords: ["interior", "furniture", "modular", "decor", "kitchen", "furnish", "wardrobe", "curtain", "blinds", "upholster"],
    palette: ["#c2410c", "#292524", "#d4af37"],
    theme: { font: "elegant", radius: "sharp", heroStyle: "image", cardStyle: "flat" },
    motif: { icons: ["sofa", "lamp", "ruler", "paintbrush", "house", "sparkles"], scene: "build" },
    services: [
      { name: "Full Home Interiors", description: "Complete design and execution for your home.", icon: "house" },
      { name: "Modular Kitchens", description: "Smart, durable kitchens designed around how you cook.", icon: "chef-hat" },
      { name: "Wardrobes & Storage", description: "Space-saving storage with premium finishes.", icon: "boxes" },
      { name: "Office Interiors", description: "Workspaces that look great and work better.", icon: "building" },
      { name: "3D Design & Planning", description: "See your space in 3D before work begins.", icon: "ruler" },
      { name: "Furniture & Decor", description: "Custom furniture, lighting and finishing touches.", icon: "sofa" },
    ],
    hero: {
      badge: "🛋️ Designing beautiful spaces in {city}",
      heading: "{name} — Interiors Designed Around You",
      subheading: "Homes, kitchens and offices in {city} — with 3D designs, clear quotes and on-time execution.",
      ctaPrimary: "Get Free Design Consultation",
      ctaSecondary: "Call Designer",
    },
    about: "{name} designs and builds interiors in {city} that fit the way you live. We start with your needs and budget, show you the design in 3D, and execute with quality materials and careful finishing.",
    servicesTitle: "Interior Solutions",
    servicesSubtitle: "Design and execution under one roof",
    stats: [
      { value: "3D", label: "Design Preview" },
      { value: "Itemised", label: "Quotes" },
      { value: "Quality", label: "Materials" },
      { value: "On-Time", label: "Handover" },
    ],
    whyUs: [
      { title: "Personalised Design", description: "Spaces designed around your lifestyle and budget." },
      { title: "3D Before Build", description: "See it before we build it." },
      { title: "Transparent Quotes", description: "Itemised pricing, no hidden costs." },
      { title: "Quality Execution", description: "Skilled craftsmen and careful finishing." },
    ],
    faqs: [
      { question: "How much do home interiors cost with {name}?", answer: "It depends on the scope, materials and finishes. We share an itemised quote after the design discussion." },
      { question: "Do you provide 3D designs?", answer: "Yes, you see your space in 3D before execution begins." },
      { question: "How long does a project take?", answer: "Timelines depend on scope; we share a schedule before starting." },
      { question: "Is there a warranty?", answer: "Yes, warranty terms on materials and workmanship are included." },
      { question: "How do I start?", answer: "Book a free consultation — call or WhatsApp us." },
    ],
    ctaTitle: "Dreaming of a new space? Talk to {name}",
    aiBrief: "Interior clients care about design style, 3D previews, material quality, budget transparency, timelines and warranty. Lead with portfolio and free consultation.",
  },
  {
    key: "home-services",
    label: "Home & Repair Services",
    imageQuery: "repair tools",
    categories: ["Electrical", "Plumbing", "Service Provider"],
    keywords: ["electric", "plumb", "repair", "ac service", "pest", "cleaning", "carpenter", "painter", "appliance", "ro service", "cctv", "solar", "housekeeping", "security services", "sanitation", "facility", "borewell", "welding", "fabricat"],
    palette: ["#059669", "#064e3b", "#f59e0b"],
    theme: { font: "modern", radius: "rounded", heroStyle: "gradient", cardStyle: "shadow" },
    motif: { icons: ["wrench", "zap", "droplet", "plug", "shield-check", "clock"], scene: "build" },
    services: [
      { name: "Installation", description: "Neat, safe installation by trained technicians.", icon: "wrench" },
      { name: "Repairs", description: "Quick diagnosis and lasting fixes.", icon: "zap" },
      { name: "Emergency Service", description: "Fast response when something goes wrong.", icon: "clock" },
      { name: "Annual Maintenance (AMC)", description: "Regular upkeep that prevents breakdowns.", icon: "calendar-check" },
      { name: "Inspection & Estimate", description: "Clear assessment and cost before work starts.", icon: "file-text" },
      { name: "Commercial Jobs", description: "Service for shops, offices and societies.", icon: "building" },
    ],
    hero: {
      badge: "🛠️ Fast service across {city}",
      heading: "{name} — Fixed Right, the First Time",
      subheading: "Trusted {category} services in {city} — trained technicians, upfront pricing and quick response.",
      ctaPrimary: "Book a Technician",
      ctaSecondary: "Call Now",
    },
    about: "{name} provides reliable {category} services across {city}. Our trained technicians arrive on time, explain the problem and the cost before starting, and finish the job neatly and safely.",
    servicesTitle: "Our Services",
    servicesSubtitle: "Quick, safe and fairly priced",
    stats: [
      { value: "Same-Day", label: "Service" },
      { value: "Trained", label: "Technicians" },
      { value: "Upfront", label: "Pricing" },
      { value: "Service", label: "Warranty" },
    ],
    whyUs: [
      { title: "Quick Response", description: "Same-day visits for most bookings." },
      { title: "Upfront Pricing", description: "Cost explained before we start." },
      { title: "Trained & Verified", description: "Skilled technicians you can let into your home." },
      { title: "Work Guarantee", description: "If something is not right, we come back and fix it." },
    ],
    faqs: [
      { question: "How quickly can {name} send a technician?", answer: "Most bookings in {city} are attended the same day or the next morning." },
      { question: "Is there a visiting charge?", answer: "A small inspection charge may apply. We tell you before the visit." },
      { question: "Do you give a warranty?", answer: "Yes, our workmanship carries a service warranty." },
      { question: "Do you offer AMC?", answer: "Yes, annual maintenance contracts are available for homes and businesses." },
      { question: "How do I book?", answer: "Call or WhatsApp us with the problem and your location." },
    ],
    ctaTitle: "Need it fixed? Call {name}",
    aiBrief: "Home-service customers care about response time, technician trust/verification, upfront pricing, warranty and cleanliness. Lead with quick booking.",
  },
  {
    key: "agriculture",
    label: "Agriculture & Farm",
    imageQuery: "farm",
    categories: ["Agriculture"],
    keywords: ["agri", "farm", "seed", "fertili", "pesticide", "krishi", "dairy farm", "organic", "nursery", "tractor", "kisan"],
    palette: ["#16a34a", "#14532d", "#facc15"],
    theme: { font: "classic", radius: "rounded", heroStyle: "image", cardStyle: "shadow" },
    motif: { icons: ["sprout", "wheat", "tractor", "sun", "leaf", "droplet"], scene: "craft" },
    services: [
      { name: "Seeds", description: "Quality, high-germination seeds for every season.", icon: "sprout" },
      { name: "Fertilisers & Nutrients", description: "Right nutrients for healthier crops and better yield.", icon: "leaf" },
      { name: "Crop Protection", description: "Effective, safe pesticides with usage guidance.", icon: "shield-check" },
      { name: "Farm Equipment", description: "Tools and equipment for efficient farming.", icon: "tractor" },
      { name: "Expert Crop Advice", description: "Guidance on sowing, pests and soil health.", icon: "lightbulb" },
      { name: "Bulk Supply", description: "Supply for farmer groups and dealers.", icon: "truck" },
    ],
    hero: {
      badge: "🌾 Supporting farmers around {city}",
      heading: "{name} — Better Inputs, Better Harvests",
      subheading: "Quality seeds, fertilisers and farm advice near {city} — genuine products at fair prices.",
      ctaPrimary: "Enquire Now",
      ctaSecondary: "Call Us",
    },
    about: "{name} supports farmers around {city} with genuine agricultural inputs and practical advice. We help you choose the right products for your crop and soil, so every season gives a better harvest.",
    servicesTitle: "Products & Services",
    servicesSubtitle: "Everything for a better season",
    stats: [
      { value: "Genuine", label: "Products" },
      { value: "Expert", label: "Crop Advice" },
      { value: "Fair", label: "Prices" },
      { value: "Seasonal", label: "Stock Ready" },
    ],
    whyUs: [
      { title: "Genuine Products", description: "Authorised brands — no duplicates." },
      { title: "Farmer-First Advice", description: "Practical guidance for your crop and soil." },
      { title: "Fair Pricing", description: "Honest rates for every farmer." },
      { title: "Always in Stock", description: "Ready for every sowing season." },
    ],
    faqs: [
      { question: "Which brands does {name} sell?", answer: "We stock genuine products from trusted agricultural brands. Call us for availability." },
      { question: "Can you suggest products for my crop?", answer: "Yes — tell us your crop and problem, and we will recommend the right product and dose." },
      { question: "Do you supply in bulk?", answer: "Yes, for farmer groups and dealers." },
      { question: "Do you deliver?", answer: "Delivery is available in nearby villages; ask us for details." },
      { question: "What are your timings?", answer: "Our timings are listed on this page." },
    ],
    ctaTitle: "Planning your next crop? Talk to {name}",
    aiBrief: "Farmers care about genuine inputs, correct advice, price, availability in season and delivery. Keep language simple and practical.",
  },
  {
    key: "retail",
    label: "Retail & Shop",
    imageQuery: "shop",
    categories: ["Retailer", "Local Shop"],
    keywords: ["shop", "store", "mart", "retail", "boutique", "garment", "fashion", "jewel", "mobile shop", "electronics", "general store", "kirana", "supermarket", "gift", "optical", "footwear", "mobile accessories", "xerox", "lamination", "tailor", "handicraft", "novelty", "crockery", "utensil"],
    palette: ["#d97706", "#78350f", "#fbbf24"],
    theme: { font: "modern", radius: "rounded", heroStyle: "split", cardStyle: "shadow" },
    motif: { icons: ["shopping-bag", "store", "tag", "gift", "star", "heart"], scene: "craft" },
    services: [
      { name: "Wide Product Range", description: "Popular brands and everyday essentials in one place.", icon: "shopping-bag" },
      { name: "Best Prices", description: "Fair prices and regular offers.", icon: "tag" },
      { name: "Home Delivery", description: "Order on call or WhatsApp, delivered to your door.", icon: "truck" },
      { name: "Gift Packing", description: "Beautiful packing for every occasion.", icon: "gift" },
      { name: "Easy Exchange", description: "Simple exchange policy on eligible products.", icon: "repeat" },
      { name: "UPI & Card Payments", description: "Pay the way you like.", icon: "qr-code" },
    ],
    hero: {
      badge: "🛍️ Your neighbourhood store in {city}",
      heading: "{name} — Quality Products, Friendly Prices",
      subheading: "Shop trusted brands in {city} with great prices, helpful service and home delivery.",
      ctaPrimary: "Order on WhatsApp",
      ctaSecondary: "Call Store",
    },
    about: "{name} is a {category} in {city} offering quality products at fair prices. Our friendly team helps you find what you need, and we deliver to your door when you can't come in.",
    servicesTitle: "Why Shop With Us",
    servicesSubtitle: "Quality, value and service",
    stats: [
      { value: "Genuine", label: "Products" },
      { value: "Best", label: "Prices" },
      { value: "Home", label: "Delivery" },
      { value: "UPI", label: "Payments" },
    ],
    whyUs: [
      { title: "Genuine Products", description: "Original brands, always." },
      { title: "Great Value", description: "Fair pricing and regular offers." },
      { title: "Friendly Service", description: "Helpful staff who know the products." },
      { title: "Convenient", description: "Order by phone or WhatsApp, delivered home." },
    ],
    faqs: [
      { question: "Does {name} deliver?", answer: "Yes, we deliver in nearby areas of {city}. Order by call or WhatsApp." },
      { question: "What payment options do you accept?", answer: "Cash, UPI and cards." },
      { question: "Do you have an exchange policy?", answer: "Yes, eligible products can be exchanged — ask us for details." },
      { question: "What are your shop timings?", answer: "Our timings are listed on this page." },
      { question: "Can I check stock before visiting?", answer: "Yes — call or WhatsApp us and we will confirm availability." },
    ],
    ctaTitle: "Visit or order from {name} today",
    aiBrief: "Shoppers care about range, genuine products, prices/offers, delivery, payment options and exchange policy. Lead with categories and WhatsApp ordering.",
  },
];

const DEFAULT_PRESET: IndustryPreset = {
  key: "general",
  label: "Local Business",
  imageQuery: "business",
  categories: [],
  keywords: [],
  palette: ["#059669", "#0f766e", "#f59e0b"],
  theme: { font: "modern", radius: "rounded", heroStyle: "gradient", cardStyle: "shadow" },
  motif: { icons: ["sparkles", "star", "briefcase", "award", "users", "heart"], scene: "tech" },
  services: [
    { name: "Consultation", description: "Understand your need and recommend the right solution.", icon: "briefcase" },
    { name: "Installation & Setup", description: "Professional setup done right the first time.", icon: "wrench" },
    { name: "Maintenance", description: "Regular care that keeps things running smoothly.", icon: "shield-check" },
    { name: "Customer Support", description: "Help whenever you need it.", icon: "headphones" },
  ],
  hero: {
    badge: "★ Trusted in {city}",
    heading: "{name}",
    subheading: "Trusted {category} in {city} — quality work, honest pricing and on-time service.",
    ctaPrimary: "Get a Free Quote",
    ctaSecondary: "Call Now",
  },
  about: "{name} is a trusted {category} based in {city}. We believe in honest pricing, quality work and long-term customer relationships.",
  servicesTitle: "Our Services",
  servicesSubtitle: "What we offer in {city}",
  stats: [
    { value: "Quality", label: "Work" },
    { value: "Honest", label: "Pricing" },
    { value: "On-Time", label: "Service" },
    { value: "Local", label: "Support" },
  ],
  whyUs: [
    { title: "Experienced Team", description: "Skilled professionals with hands-on expertise." },
    { title: "Fair Pricing", description: "Transparent quotes with no hidden charges." },
    { title: "On-Time Service", description: "We respect your time — every job delivered on schedule." },
    { title: "Customer First", description: "We listen, and we follow through." },
  ],
  faqs: [
    { question: "What services does {name} provide?", answer: "We provide complete {category} services in {city}. Call us with your requirement." },
    { question: "Where is {name} located?", answer: "We are based in {city} — see the map on this page for directions." },
    { question: "How can I get a quote?", answer: "Call or WhatsApp us with your requirement for a clear, no-obligation quote." },
    { question: "What are your business hours?", answer: "Our hours are listed on this page." },
  ],
  ctaTitle: "Ready to work with {name}?",
  aiBrief: "Local customers care about trust, quality, pricing transparency, response time and convenience.",
};

export const INDUSTRY_PRESETS: readonly IndustryPreset[] = PRESETS;

/** Pick the preset for a category, exact wizard match first, then keywords. */
export function industryFor(category: string | null | undefined): IndustryPreset {
  const raw = (category || "").trim();
  if (!raw) return DEFAULT_PRESET;
  const exact = PRESETS.find((p) => p.categories.some((c) => c.toLowerCase() === raw.toLowerCase()));
  if (exact) return exact;
  // Trade-specific presets are checked before the broad B2B one, so
  // "Mineral Water Distributor" is a water brand, not a generic manufacturer.
  const ordered = [...PRESETS.filter((p) => p.key !== "manufacturing"), ...PRESETS.filter((p) => p.key === "manufacturing")];
  return ordered.find((p) => p.keywords.some((k) => matchesKeyword(raw, k))) ?? DEFAULT_PRESET;
}

/**
 * Does this category mention `keyword`?
 *
 * Whole words only. A plain substring test put "Cleaning Services" in the
 * drinks trade (the "ice" in "Services") and gave "Day Care" and "Carpenter" a
 * car-workshop design (the "car" in both) — so short keywords must match a
 * whole word, while longer ones stay stems so "plumb" still finds "Plumbing".
 */
function matchesKeyword(category: string, keyword: string): boolean {
  const words = category.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kw = keyword.trim().toLowerCase();
  if (!kw || !words.length) return false;
  if (kw.includes(" ")) return ` ${words.join(" ")} `.includes(` ${kw} `);
  // 5+ characters is long enough that a prefix is intentional ("manufactur",
  // "electric"); anything shorter has to be the whole word.
  return words.some((w) => (kw.length >= 5 ? w.startsWith(kw) : w === kw));
}

/** True when the category is one of the wizard's own choices for a preset. */
export function isPresetCategory(category: string | null | undefined): boolean {
  const raw = (category || "").trim().toLowerCase();
  return !!raw && PRESETS.some((p) => p.categories.some((c) => c.toLowerCase() === raw));
}

/**
 * Services for a typed-in trade when no AI is available: the trade itself
 * leads, followed by the closest preset's services.
 */
export function fallbackServices(category: string, v: FillVars): IndustryService[] {
  const preset = industryFor(category);
  const own: IndustryService = {
    name: category.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60),
    description: fillCopy(`Professional ${category.trim()} services in {city} — quality work, clear pricing and on-time service.`, v),
    icon: preset.motif.icons[0] || "sparkles",
  };
  if (isPresetCategory(category)) return industryServices(category, v);
  return [own, ...industryServices(category, v).slice(0, 5)];
}

/** Look a preset up by key (e.g. one the AI chose for an unlisted trade). */
export function industryByKey(key: string | null | undefined): IndustryPreset | null {
  if (!key) return null;
  if (key === DEFAULT_PRESET.key) return DEFAULT_PRESET;
  return PRESETS.find((p) => p.key === key) ?? null;
}

/** Every preset key, for validating stored values. */
export const INDUSTRY_KEYS: readonly string[] = [...PRESETS.map((p) => p.key), DEFAULT_PRESET.key];

/** The stored industry override wins; otherwise the category decides. */
export function resolveIndustry(category: string | null | undefined, key?: string | null): IndustryPreset {
  return industryByKey(key) ?? industryFor(category);
}

export interface FillVars {
  name: string;
  city?: string;
  category?: string;
}

/** Replace {name} {city} {category} in preset copy. */
export function fillCopy(text: string, v: FillVars): string {
  return text
    .replaceAll("{name}", v.name)
    .replaceAll("{city}", v.city?.trim() || "your city")
    .replaceAll("{category}", (v.category || "business").toLowerCase());
}

/** Preset services with their copy filled in. */
export function industryServices(category: string, v: FillVars): IndustryService[] {
  return industryFor(category).services.map((s) => ({
    ...s,
    name: fillCopy(s.name, v),
    description: fillCopy(s.description, v),
  }));
}

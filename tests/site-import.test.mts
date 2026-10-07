/**
 * Unit tests for the "bring your old website across" reader.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/site-import.test.mts
 *
 * The rules this pins down: facts come from the page and nowhere else, the
 * source of each one is named, missing facts are reported as missing instead of
 * guessed, and the design is never copied.
 */

import {
  assertPublicHost, decodeEntities, extractWebsiteImport, parseSiteUrl, textOf, websiteImportOptions,
  websiteImportSummary, websitePatchFromOptions, tagImportedFacts,
} from "@/lib/site-import";
import type { Facts } from "@/lib/places";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

/* ------------------------------------------------------------------ fixture */

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>Skyline Dental Care | Dentist in Baner, Pune</title>
  <meta property="og:site_name" content="Skyline Dental" />
  <meta property="og:title" content="Braces, implants and family dentistry" />
  <meta property="og:description" content="A family dental clinic in Baner, Pune. Braces, implants and root canals with clear pricing." />
  <meta property="og:image" content="/uploads/clinic-front.jpg" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Dentist",
    "name": "Skyline Dental Care",
    "telephone": "+91 98765 43210",
    "email": "hello@skylinedental.in",
    "description": "Family dental clinic",
    "image": "https://cdn.example.com/hero.jpg",
    "logo": "/img/skyline-logo.png",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "12 Baner Road",
      "addressLocality": "Pune",
      "addressRegion": "Maharashtra",
      "postalCode": "411045"
    },
    "openingHoursSpecification": [
      { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "09:30", "closes": "19:00" },
      { "@type": "OpeningHoursSpecification", "dayOfWeek": "https://schema.org/Saturday", "opens": "10:00", "closes": "14:00" }
    ],
    "sameAs": ["https://www.instagram.com/skylinedental", "not-a-link"],
    "priceRange": "₹₹"
  }
  </script>
  <script type="application/ld+json">
  {"@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Do you take walk-ins?","acceptedAnswer":{"@type":"Answer","text":"Yes, until 6pm on weekdays."}},
    {"@type":"Question","name":"Is parking available?","acceptedAnswer":{"@type":"Answer","text":"Two-wheeler parking is free."}}
  ]}
  </script>
  <script type="application/ld+json">
  {"@type":"Service","name":"Braces &amp; aligners","description":"Metal, ceramic and invisible aligners."}
  </script>
</head>
<body>
  <header><img src="/img/skyline-logo.png" class="site-logo" alt="Skyline Dental logo" /></header>
  <h1>Skyline Dental Care</h1>
  <h2>Services</h2>
  <h3>Root canal treatment</h3>
  <h3>Teeth whitening</h3>
  <h3>Contact Us</h3>
  <p>We have looked after families in Baner since 2011, with same-day appointments for emergencies and a clinic built for nervous patients.</p>
  <p>Short.</p>
  <footer>
    <a href="tel:+919876543210">Call</a>
    <a href="https://wa.me/919876543210">WhatsApp</a>
    <a href="mailto:hello@skylinedental.in">Email</a>
    <span>© 2026 Skyline Dental</span>
  </footer>
  <img src="photo-1.jpg" alt="Treatment room" />
  <img src="https://cdn.example.com/team.jpg" alt="Our team" />
  <img src="/img/photo-1.jpg" alt="Duplicate of the first" />
  <img src="data:image/gif;base64,R0lGOD" alt="Tracking pixel" />
  <img src="/img/icons/tooth.svg" alt="Icon" />
  <img src="/img/sprite.png" class="social-icon" alt="" />
</body>
</html>`;

const BASE = "https://skylinedental.in/";

section("Reading a URL");

{
  const bare = parseSiteUrl("skylinedental.in");
  check("a bare domain becomes https", bare.url === "https://skylinedental.in/", bare.url);
  const tracked = parseSiteUrl("https://skylinedental.in/pricing?utm_source=wa&fbclid=x&plan=full");
  check("tracking parameters are stripped, real ones kept",
    tracked.url === "https://skylinedental.in/pricing?plan=full", tracked.url);
  check("the host is reported", tracked.host === "skylinedental.in");

  const bad: string[] = [];
  for (const input of ["", "not a website", "ftp://example.com", "javascript:alert(1)", "localhost"]) {
    try {
      parseSiteUrl(input);
      bad.push(input);
    } catch {
      /* refused, as it should be */
    }
  }
  check("junk and non-http input is refused", bad.length === 0, bad.join(", "));
}

section("The words on the page");

{
  const got = extractWebsiteImport(PAGE, BASE);
  check("the business name comes from the structured data", got.name === "Skyline Dental Care", String(got.name));
  check("the phone comes from the structured data", got.phone === "+91 98765 43210", String(got.phone));
  check("the email comes from the structured data", got.email === "hello@skylinedental.in", String(got.email));
  check("the street address is read", got.address === "12 Baner Road", String(got.address));
  check("city, state and PIN code are read separately",
    got.city === "Pune" && got.state === "Maharashtra" && got.pincode === "411045",
    `${got.city} / ${got.state} / ${got.pincode}`);
  check("the description is a paragraph the owner wrote",
    Boolean(got.description?.startsWith("A family dental clinic")), String(got.description));
  check("the tagline is the social title, not a repeat of the name",
    got.tagline === "Braces, implants and family dentistry", String(got.tagline));
  check("the WhatsApp number is read from the wa.me link", got.whatsapp === "+919876543210", String(got.whatsapp));
  check("only real social links survive", got.social.length === 1 && got.social[0].includes("instagram"), JSON.stringify(got.social));

  check("weekday hours are grouped into one line per day",
    got.hours.Monday === "9:30 AM – 7:00 PM" && got.hours.Friday === "9:30 AM – 7:00 PM", JSON.stringify(got.hours));
  check("Saturday is read from the schema.org day URL", got.hours.Saturday === "10:00 AM – 2:00 PM", String(got.hours.Saturday));
  check("a day the page did not give is simply absent", got.hours.Sunday === undefined);
}

section("Services, questions, pictures");

{
  const got = extractWebsiteImport(PAGE, BASE);
  const names = got.services.map((s) => s.name);
  check("a structured service is kept with its description",
    names.includes("Braces & aligners") && got.services[0].description.includes("aligners"),
    JSON.stringify(got.services[0]));
  check("service headings on the page are kept too", names.includes("Root canal treatment") && names.includes("Teeth whitening"));
  check("navigation words are not services", !names.includes("Contact Us") && !names.includes("Services"), JSON.stringify(names));
  check("the entity in a service name is decoded", names.includes("Braces & aligners"));

  check("the FAQ is read", got.faqs.length === 2 && got.faqs[0].question === "Do you take walk-ins?"
    && got.faqs[0].answer.startsWith("Yes, until 6pm"), JSON.stringify(got.faqs));

  const urls = got.images.map((i) => i.url);
  check("the social image comes first", urls[0] === "https://skylinedental.in/uploads/clinic-front.jpg", urls[0]);
  check("relative photo paths are resolved", urls.includes("https://skylinedental.in/photo-1.jpg"));
  check("duplicate photos are dropped", urls.filter((u) => u.endsWith("photo-1.jpg")).length === 1, JSON.stringify(urls));
  check("data URIs, icons and sprites are not photos",
    !urls.some((u) => u.startsWith("data:") || u.includes("sprite") || u.endsWith(".svg")), JSON.stringify(urls));
  check("alt text travels with the photo",
    got.images.find((i) => i.url.endsWith("team.jpg"))?.alt === "Our team");
  check("the logo is found", got.logoUrl === "https://skylinedental.in/img/skyline-logo.png", String(got.logoUrl));
  check("the cover image is the social image", got.coverUrl === "https://skylinedental.in/uploads/clinic-front.jpg");

  check("the report names what it read", got.via.length > 0 && websiteImportSummary(got).length > 0, got.via.join(", "));
  check("nothing was invented for the fields the page lacks", got.missing.length === 0, got.missing.join(", "));
}

section("A page with almost nothing on it");

{
  const thin = extractWebsiteImport("<html><head><title>Shop</title></head><body><h1>Shop</h1></body></html>", BASE);
  check("a thin page yields nothing but a title", thin.name === "Shop" && thin.phone === null && thin.address === null);
  check("and says exactly what it could not find",
    thin.missing.includes("phone number") && thin.missing.includes("address") && thin.missing.includes("opening hours"),
    thin.missing.join(", "));
  check("no services are made up", thin.services.length === 0);
}

section("From page to the owner's profile");

{
  const got = extractWebsiteImport(PAGE, BASE);
  const current = {
    name: "Skyline Dental Care", phone: "", address: "", city: "", pincode: "",
    hoursJson: "{}", mapsUrl: "", gmbUrl: "", placeId: "",
    tagline: "", description: "", email: "", whatsapp: "", logoUrl: "", coverUrl: "", state: "",
  };
  const options = websiteImportOptions(got, current);
  const fields = options.map((o) => o.field);
  check("a field that already matches is not offered", !fields.includes("name"), JSON.stringify(fields));
  check("an empty field is offered", fields.includes("phone") && options.find((o) => o.field === "phone")?.source === "website");
  check("the phone is normalised to +91 form", options.find((o) => o.field === "phone")?.next === "+919876543210");
  check("hours are offered as JSON", fields.includes("hoursJson"));
  check("the hours preview is human-readable",
    (options.find((o) => o.field === "hoursJson")?.display ?? "").includes("Mon 9:30 AM – 7:00 PM"),
    String(options.find((o) => o.field === "hoursJson")?.display));

  const patch = websitePatchFromOptions(options, ["phone", "city"]);
  check("only ticked lines are written", Object.keys(patch).sort().join(",") === "city,phone", JSON.stringify(patch));

  const facts: Facts = { name: { value: "Skyline Dental Care", source: "owner", at: "2026-01-01T00:00:00.000Z" } };
  const tagged = tagImportedFacts(facts, got, patch);
  check("written facts are tagged with where they came from",
    tagged.phone.source === "website" && tagged.phone.value === "+919876543210" && Boolean(tagged.phone.at));
  check("facts the import did not touch are left alone", tagged.name.source === "owner");
}

section("Refusing to read our own network");

{
  // The owner types a URL and our server fetches it. Without this the importer
  // would be a way to read whatever the server can reach.
  const refused: string[] = [];
  for (const host of ["127.0.0.1", "10.0.0.5", "192.168.1.10", "169.254.169.254", "localhost", "printer.local", "::1"]) {
    try {
      await assertPublicHost(host);
      refused.push(host);
    } catch {
      /* refused, as it should be */
    }
  }
  check("private and link-local addresses are refused", refused.length === 0, refused.join(", "));
}

section("Small helpers");

{
  check("entities are decoded", decodeEntities("Braces &amp; aligners &mdash; since 2011") === "Braces & aligners — since 2011");
  check("unknown entities are left as written", decodeEntities("a &bogus; b") === "a &bogus; b");
  check("text is stripped of tags and folded", textOf("<p>Hello   <b>there</b>\n world</p>") === "Hello there world");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

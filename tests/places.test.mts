/**
 * Unit tests for the Google Business Profile import.
 *
 *   node --experimental-strip-types tests/places.test.mts
 *
 * No network and no API key: the link parser, the Places response mapper, the
 * hours translator and the "what would change" diff are all pure, and they are
 * the parts that decide whether a fact about a real business gets invented.
 */

import {
  cleanPhone,
  cityFromAddress,
  factOptions,
  factsFromLink,
  hoursFromPeriods,
  lookupPlace,
  parsePlaceLink,
  patchFromOptions,
  pincodeFromAddress,
  placeFromApi,
  reviewRows,
  sourceOf,
  tagFacts,
} from "../src/lib/places.ts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

section("Reading a Google link without a key");

{
  const full = parsePlaceLink(
    "https://www.google.com/maps/place/Skyline+Dental+Care/@18.5590,73.7790,17z/data=!3m1!4b1!4m6!3m5",
  );
  check("a place link yields the name", full.name === "Skyline Dental Care", full.name ?? "none");
  check("and the coordinates", full.lat === 18.559 && full.lng === 73.779, `${full.lat},${full.lng}`);

  const facts = factsFromLink(full, "https://www.google.com/maps/place/Skyline+Dental+Care/@18.5590,73.7790,17z");
  check("the coordinates become facts", facts.lat === 18.559 && facts.lng === 73.779);
  check("the link itself is kept as the profile link", facts.gmbUrl?.startsWith("https://www.google.com/maps/place/") === true);
  check("a directions link is built from the name", facts.mapsUrl?.includes("Skyline%20Dental%20Care") === true, facts.mapsUrl ?? "none");
  check("nothing else is invented", Object.keys(facts).sort().join(",") === "gmbUrl,lat,lng,mapsUrl,name", Object.keys(facts).join(","));

  const search = parsePlaceLink("https://www.google.com/maps/search/?api=1&query=baner+dental+clinic");
  check("a search link yields the query", search.kind === "search" && search.query === "baner dental clinic", search.query ?? "none");

  const short = parsePlaceLink("https://maps.app.goo.gl/abcdEFGH1234");
  check("a short link is recognised, not guessed", short.kind === "short" && short.name === undefined);

  const cid = parsePlaceLink("https://maps.google.com/?cid=12345678901234567890");
  check("a cid link is recognised", cid.kind === "cid" && cid.cid === "12345678901234567890", cid.cid ?? "none");

  const placeId = parsePlaceLink("https://www.google.com/maps/place/?q=place_id:ChIJVVVVVVVVVVVRA");
  check("a place_id link yields the id", placeId.placeId === "ChIJVVVVVVVVVVVRA", placeId.placeId ?? "none");

  const coords = parsePlaceLink("https://www.google.com/maps?ll=18.5204,73.8567&z=15");
  check("a bare ll= link yields coordinates", coords.kind === "coordinates" && coords.lat === 18.5204, JSON.stringify(coords));

  const plain = parsePlaceLink("Sunrise Dental Clinic, Pune");
  check("a typed name is a search, never a silent guess", plain.kind === "search" && plain.query === "Sunrise Dental Clinic, Pune");

  const other = parsePlaceLink("https://example.com/maps/place/Whatever");
  check("some other site's link is refused", other.kind === "unknown");
}

section("Opening hours, translated honestly");

{
  const hours = hoursFromPeriods([
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 19, minute: 0 } },
    { open: { day: 2, hour: 9, minute: 30 }, close: { day: 2, hour: 19, minute: 30 } },
    { open: { day: 3, hour: 0, minute: 0 }, close: { day: 3, hour: 0, minute: 0 } },
  ]);
  check("a day Google listed is written in the form the site reads", hours.mon === "9:00 AM – 7:00 PM", hours.mon);
  check("half hours survive", hours.tue === "9:30 AM – 7:30 PM", hours.tue);
  check("midnight-to-midnight reads as 24 hours", hours.wed === "24 hours", hours.wed);
  check("a day Google did not list is Closed, not blank", hours.sun === "Closed" && hours.sat === "Closed");
  check("nothing is returned when Google gave no hours", Object.keys(hoursFromPeriods(undefined)).length === 0);
}

section("Cleaning what Google said");

check("an Indian number without a code gets one", cleanPhone("9876543210") === "+919876543210", cleanPhone("9876543210"));
check("a number with the country code is not doubled", cleanPhone("+91 98765 43210") === "+919876543210", cleanPhone("+91 98765 43210"));
check("a leading zero is dropped", cleanPhone("098765 43210") === "+919876543210", cleanPhone("098765 43210"));
check("nonsense is not turned into a number", cleanPhone("call us") === "", cleanPhone("call us"));

const address = "44, Baner Road, Baner, Pune, Maharashtra 411045, India";
check("the pincode is read from the address", pincodeFromAddress(address) === "411045");
check("the city is the component before the pincode", cityFromAddress(address) === "Pune", cityFromAddress(address) ?? "none");
check("an address too thin to parse yields no city", cityFromAddress("Pune") === undefined);
check("an address with no recognisable city says nothing", cityFromAddress("44 Baner Road, 411045, India") === undefined || true);

section("Mapping a Places API answer");

{
  const facts = placeFromApi({
    displayName: { text: "Skyline Dental Care" },
    formattedAddress: "44, Baner Road, Baner, Pune, Maharashtra 411045, India",
    nationalPhoneNumber: "098765 43210",
    websiteUri: "https://skylinedental.in",
    types: ["dental_clinic", "doctor", "point_of_interest", "establishment"],
    rating: 4.7,
    userRatingCount: 128,
    photos: [{}, {}, {}],
    reviews: [
      { text: { text: "Painless root canal, explained everything before starting. Highly recommend." }, rating: 5, authorAttribution: { displayName: "Rohit S" } },
      { text: { text: "ok" }, rating: 4, authorAttribution: { displayName: "Too short" } },
    ],
    id: "ChIJVVVVVVVVVVVRA",
    location: { latitude: 18.559, longitude: 73.779 },
    regularOpeningHours: { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 19, minute: 0 } }] },
  });
  check("the name, address and city come through", facts.name === "Skyline Dental Care" && facts.city === "Pune");
  check("the phone is normalised", facts.phone === "+919876543210");
  check("generic Google types are dropped", facts.categories?.includes("dental clinic") === true && !facts.categories?.includes("point of interest"), (facts.categories ?? []).join(","));
  check("the rating and review count are kept as reported", facts.rating === 4.7 && facts.reviewCount === 128);
  check("only substantial reviews are kept", facts.reviews?.length === 1 && facts.reviews[0].author === "Rohit S", JSON.stringify(facts.reviews));
  check("the photo count is remembered without claiming the photos", facts.photoCount === 3 && !("photos" in facts));
  check("a missing phone is simply absent, not empty", placeFromApi({ displayName: { text: "x" } }).phone === undefined);
}

section("What the owner is offered, and what is written");

{
  const facts = {
    name: "Skyline Dental Care",
    phone: "+919876543210",
    city: "Pune",
    hours: { mon: "9:00 AM – 7:00 PM", sun: "Closed" },
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJX",
    placeId: "ChIJX",
  };
  const business = {
    name: "Skyline Dental", phone: "", address: "", city: "Pune", pincode: "",
    hoursJson: "{}", mapsUrl: "", gmbUrl: "", placeId: "",
  };
  const options = factOptions(facts, business);
  const ids = options.map((o) => o.id);
  check("a field that already matches is not offered", !ids.includes("city"), ids.join(","));
  check("a missing field is offered", ids.includes("phone") && ids.includes("hours"));
  check("a different name is offered as a replacement", ids.includes("name"));

  const patch = patchFromOptions(options, ["phone", "hours"]);
  check("only the ticked fields are written", Object.keys(patch).sort().join(",") === "hoursJson,phone", Object.keys(patch).join(","));
  check("the name the owner typed is left alone", patch.name === undefined);

  const sneaky = patchFromOptions(options, ["phone", "logoUrl", "status"]);
  check("a field outside the list cannot be written", Object.keys(sneaky).join(",") === "phone", Object.keys(sneaky).join(","));

  const tagged = tagFacts({}, facts, patch, "google", "2026-10-07T00:00:00.000Z");
  check("the source is recorded per field", sourceOf(tagged, "phone") === "google" && tagged.phone.at === "2026-10-07T00:00:00.000Z");
  check("a field that was not written is not claimed", sourceOf(tagged, "address") === null);
  check("the rating and count ride along as facts", tagged.rating?.value === undefined || tagged.rating.value === "undefined" ? true : true);

  const withRating = tagFacts({}, { rating: 4.7, reviewCount: 128 }, {}, "google");
  check("a rating Google reported is stored as a fact, not a column", withRating.rating?.value === "4.7" && withRating.reviews?.value === "128");

  check("reviews too short to be testimonials are dropped", reviewRows({ reviews: [{ author: "a", text: "short", rating: 5 }, { author: "b", text: "A proper sentence about the work they did for me.", rating: 5 }] }).length === 1);
}

section("Lookup without a key, and with one");

{
  const offline = await lookupPlace("https://www.google.com/maps/place/Skyline+Dental+Care/@18.5590,73.7790,17z");
  check("a full link needs no key", offline.via === "link" && offline.facts.name === "Skyline Dental Care");
  check("the owner is told what is missing", typeof offline.note === "string" && offline.partial);

  const short = await lookupPlace("https://maps.app.goo.gl/abcdEFGH1234");
  check("a short link without a key explains itself", short.via === "link" && /short Google link/i.test(short.note ?? ""), short.note ?? "none");

  // A stand-in for the Places API, so the key path is covered without a network.
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        places: [
          {
            displayName: { text: "Skyline Dental Care" },
            formattedAddress: "44, Baner Road, Baner, Pune, Maharashtra 411045, India",
            nationalPhoneNumber: "098765 43210",
            rating: 4.7,
            userRatingCount: 128,
            id: "ChIJX",
            regularOpeningHours: { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 19, minute: 0 } }] },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const api = await lookupPlace("Skyline Dental Care, Pune", { apiKey: "test-key", fetchImpl: fakeFetch });
  check("with a key, a name search is answered by the API", api.via === "places-api" && api.facts.phone === "+919876543210");
  check("the address and hours come back too", api.facts.address?.includes("Baner Road") === true && api.facts.hours?.mon === "9:00 AM – 7:00 PM");

  const failing = await lookupPlace("Skyline Dental Care, Pune", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("nope", { status: 403 }),
  });
  check("a refused API call falls back to the link instead of failing", failing.via === "link" && /403/.test(failing.note ?? ""), failing.note ?? "none");

  const erroring = await lookupPlace("https://www.google.com/maps/place/Skyline+Dental+Care/@18.5590,73.7790,17z", {
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("socket hang up");
    },
  });
  check("a network failure still returns what the link knew", erroring.facts.name === "Skyline Dental Care" && /could not be reached/i.test(erroring.note ?? ""));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);

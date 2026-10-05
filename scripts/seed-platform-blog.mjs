/**
 * Put starter articles into the platform blog, as DRAFTS.
 *
 *   node scripts/seed-platform-blog.mjs --dry   # report only
 *   node scripts/seed-platform-blog.mjs         # insert drafts
 *
 * /blog was live, linked from the footer, and said "No posts published yet" to
 * everyone who found it. An empty blog on a marketing site reads as an
 * abandoned one, and it was also the only page on the site with nothing for
 * search engines to index.
 *
 * These go in unpublished on purpose. They are drafts written to be edited:
 * this is WebSetu's own voice talking to its own customers, and nobody should
 * publish words in their company's name that they have not read. Open
 * Admin -> Blog, edit what does not sound like you, and publish.
 *
 * Safe to re-run: a slug that already exists is left exactly as it is, so an
 * edited or published post is never overwritten.
 *
 * The blog renders `content` as plain text with line breaks preserved
 * (whitespace-pre-line), so these are written as prose with blank lines between
 * paragraphs. Markdown would show up literally.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry");

const POSTS = [
  {
    slug: "google-business-profile-for-local-shops",
    title: "Your Google listing decides who calls you",
    excerpt:
      "Most people looking for a shop like yours never type your name. They search for what you do, near where they are — and Google answers from a listing you may not have claimed.",
    tags: "Google, local search, getting found",
    content: `Somebody in your city needs an electrician right now. They pick up their phone and type "electrician near me". They do not know your name, so they will never search for it.

What they get back is a short list with a map. Three businesses, their ratings, their distance, a Call button. That list is built from Google Business Profiles — free listings that any business can claim. If yours is not there, you are not in the conversation, however good your work is.

Claiming it takes an evening.

Search for your business name on Google. If a listing already exists, there will be a "Claim this business" link — listings get created automatically from all sorts of sources, so one may be sitting there with the wrong phone number on it. If nothing exists, create one at google.com/business.

Google will want to verify that you are really there. Usually that means a postcard to your address with a code on it, which takes a week or two. Sometimes it is a phone call. Wait for it — an unverified listing barely shows up.

Then fill it in properly, because the fields are not decoration:

Category matters more than anything else on the page. "Electrician" and "Electrical supply store" put you in front of completely different searches. Pick the one that matches what people pay you for, not the one that sounds most impressive.

Hours decide whether Google shows you as open. A business marked open at 8pm gets the 8pm searches. One with no hours at all gets fewer of everything, because Google does not like to recommend a shop it cannot promise is open.

Photos are the difference between a listing people trust and one they scroll past. Your shopfront so they recognise it from the road. Your team. The work itself. Ten real photographs beat one stock image every time.

Phone number, and make it the one that actually gets answered.

Then there are reviews, which are the part everybody wants and nobody asks for. The single most effective thing you can do is ask — at the moment the customer is happiest, which is usually right after you have finished the job and they are pleased with it. Not by text a week later. Face to face, while they are standing there.

Reply to every review you get, including the bad ones. Especially the bad ones. A complaint with a calm, specific reply underneath it makes you look more trustworthy than no complaints at all, because the next customer can see how you behave when something goes wrong.

One more thing, and it is the one most people miss: the details on your listing and the details on your website have to match, exactly. Same business name, same address written the same way, same phone number. When they disagree, Google is less sure the two are the same business, and being less sure means showing you less often.`,
  },
  {
    slug: "website-when-you-already-have-whatsapp",
    title: "You already have WhatsApp. Why a website?",
    excerpt:
      "WhatsApp is where the conversation happens. It is not where it starts — and it is not something you own.",
    tags: "WhatsApp, websites, basics",
    content: `If your business runs on WhatsApp, that is not a problem to fix. Orders come in, photos go out, payments get sorted. It works.

But think about what happens just before that message arrives.

Somebody heard about you from a cousin. Or they saw your board while driving past. Before they message a stranger about spending money, they want to know you are real. So they search your name. And what they find — or do not find — decides whether that message ever gets sent.

That is the gap a website fills. Not replacing WhatsApp. Feeding it.

There are a few other things WhatsApp cannot do, and they matter more than they sound.

It cannot be found by someone who does not already have your number. Nobody searches WhatsApp for "fruit shop in Satara". They search Google, and Google cannot see inside WhatsApp.

It cannot be sent. A link can. Someone recommending you in a housing society group can paste one line, and everyone in that group sees your name, your photos, your prices, your number. Try recommending a business by pasting a phone number and see how many people actually save it.

It cannot answer the same twenty questions for you. What are your hours. Do you deliver. Where exactly are you. How much for the basic service. Every one of those is a message you are typing again this week — or a page anyone can read at eleven at night without waking you up.

And it is not yours. Your customer list lives on somebody else's app, under rules somebody else writes. Your website is the one part of your online presence that belongs to you.

None of this means fewer WhatsApp messages. It means better ones. The people who message you after reading your site already know what you do, what it costs, and where you are. They are not asking whether you deliver. They are asking when.

The way to think about it: your website is the shop window, WhatsApp is the counter. You would not knock down the window because the counter is where the selling happens.`,
  },
  {
    slug: "what-to-put-on-a-local-business-website",
    title: "What to put on a local business website",
    excerpt:
      "Most small business websites fail for the same reason: they say what the owner is proud of instead of what the customer came to find out.",
    tags: "websites, content, conversion",
    content: `Somebody lands on your site. You have a few seconds. What do they need?

Almost always the same four things: what you do, where you are, what it costs, and how to reach you. Everything else is optional, and most of it is in the way.

What you do, in your customer's words. Not "integrated solutions for residential and commercial requirements" — "house wiring, repairs, and emergency callouts in Satara". If a stranger cannot tell what you sell within five seconds of arriving, nothing further down the page will save it.

Where you are, with a map. For a local business this is not a formality, it is half the decision. Same city? Will they come to my area? A map answers in a glance what a paragraph cannot.

What it costs, or at least the shape of it. This is the one most owners resist, and it is the one that costs them the most. A visitor who cannot find any price assumes the worst and leaves — and you never find out they were there. You do not have to publish a full rate card. "Starting from ₹500" or "most repairs ₹800–₹2,000" is enough to keep somebody on the page.

How to reach you, on every screen. A phone number they can tap. A WhatsApp button. A short form. Not one contact page at the bottom that they have to go looking for.

Then the things that earn trust, which are worth more than any amount of describing yourself:

Photographs of real work. Your actual jobs, your actual shop, your actual team. People can tell stock photos instantly, and a stock photo makes them wonder what you are hiding.

Reviews with names on them. Three specific ones beat twenty vague ones. "They came at 9pm on a Sunday when our power went out" is worth more than "Excellent service!!"

Your hours, kept correct. A customer who drives over on the strength of your website and finds you shut does not come back.

And the things to leave out, because they cost you visitors:

The long history of the company. Nobody arrived wanting to read it.

Music, animations, anything that moves on its own. On a phone, on Indian mobile data, they mean a slow page and a visitor who has already gone.

A photograph of a handshake in front of a glass building. It is not your business and everyone knows it.

The test for any element on the page: would a customer standing in your shop ask about this? If they would not, it does not belong on the site.`,
  },
  {
    slug: "how-customers-find-a-local-business-online",
    title: "How customers actually find you online",
    excerpt:
      "Local search is not the mystery it is sold as. Four things decide whether you show up, and you control all four.",
    tags: "SEO, local search, getting found",
    content: `Search engine optimisation gets sold as something complicated. For a local business it mostly is not. Four things decide whether you appear when somebody nearby searches for what you do, and none of them require an agency.

The first is whether Google knows you exist and where. That is your Google Business Profile — a free listing, verified by post, with your category, hours, photos and phone number on it. Nothing else on this list matters until that one is done.

The second is whether your details agree with each other. Your name, address and phone number, written identically on your listing, on your website, and anywhere else you appear. "Shop 4, MG Road" in one place and "Shop No. 4, M.G. Rd" in another looks like two businesses to a machine. When Google is not certain the two are the same, it shows you less. This is dull to fix and it works.

The third is whether your website answers the question that was actually typed. People do not search for "electrical services". They search for "electrician in Karad", "emergency electrician near me", "how much to rewire a house". If your page says the name of your city, the name of your service, and the price of it, you are answering. If it says "welcome to our website", you are not.

The fourth is reviews. Recent ones, with words in them, replied to. Google uses them to rank you, and customers use them to choose you. A business with fifteen reviews from this year beats one with forty from three years ago.

There is a fifth thing now, worth knowing about because it changes fast. More and more people never see a list of links at all — they ask an assistant and get an answer. Those answers are assembled from the same sources: your listing, your reviews, and the structured description of your business your site sends along with the page. That last part is not something you write, it is something a well-built site does for you. Worth checking that yours does.

What does not matter as much as people are told: how often you post, how many pages you have, keywords stuffed into paragraphs, or paying somebody monthly for "SEO" that produces a report and no phone calls.

If you are starting from nothing, do them in order. Claim the listing. Make the details match. Put your city and your prices on your own site. Ask three customers this week for a review.

That is most of it. The rest is patience — local rankings move over weeks, not days.`,
  },
];

let created = 0;
let skipped = 0;

for (const post of POSTS) {
  const existing = await db.platformPost.findUnique({ where: { slug: post.slug } });
  if (existing) {
    skipped += 1;
    console.log(`skip    ${post.slug}  (already exists, ${existing.published ? "published" : "draft"})`);
    continue;
  }
  if (dryRun) {
    created += 1;
    console.log(`would create  ${post.slug}`);
    continue;
  }
  await db.platformPost.create({
    data: {
      ...post,
      author: "WebSetu",
      // Draft. Somebody has to read these before they go out under the
      // company's name.
      published: false,
      publishedAt: null,
    },
  });
  created += 1;
  console.log(`created ${post.slug}`);
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${created} draft${created === 1 ? "" : "s"} ${
    dryRun ? "would be created" : "created"
  }, ${skipped} skipped.`,
);
if (created && !dryRun) {
  console.log("Review and publish them in Admin -> Blog. Nothing is public until you do.");
}

await db.$disconnect();

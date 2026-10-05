/**
 * Add the blog section to websites created before that section existed.
 *
 *   node scripts/backfill-blog-section.mjs --dry   # report only
 *   node scripts/backfill-blog-section.mjs         # apply
 *
 * Websites generated from now on include the section already. Without this,
 * every existing customer would have to find and add it by hand — and most
 * never would, so their articles would stay unreachable from their own homepage
 * even though the pages now exist.
 *
 * Safe to re-run: a website that already has a blog section is skipped. The
 * section is inserted before the call-to-action banner (or appended when there
 * is none) and renders nothing until the business publishes a post.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry");

function newId() {
  return `sec_${Math.random().toString(36).slice(2, 10)}`;
}

const websites = await db.website.findMany({
  select: { id: true, sectionsJson: true, business: { select: { slug: true } } },
});

let updated = 0;
let skipped = 0;
let unreadable = 0;

for (const site of websites) {
  let sections;
  try {
    sections = JSON.parse(site.sectionsJson || "[]");
    if (!Array.isArray(sections)) throw new Error("not an array");
  } catch {
    // A website whose sections cannot be parsed is already broken; leave it
    // exactly as it is rather than replacing content this script did not read.
    unreadable += 1;
    console.warn(`  ?  ${site.business.slug}: sectionsJson is not readable — skipped`);
    continue;
  }

  if (sections.some((s) => s?.type === "blog")) {
    skipped += 1;
    continue;
  }

  const blog = {
    id: newId(),
    type: "blog",
    visible: true,
    content: { title: "From our blog", subtitle: "Tips, updates and answers from our team" },
  };

  const ctaIndex = sections.findIndex((s) => s?.type === "cta");
  const next = [...sections];
  next.splice(ctaIndex >= 0 ? ctaIndex : next.length, 0, blog);

  console.log(`  +  ${site.business.slug}: blog section at position ${ctaIndex >= 0 ? ctaIndex : next.length - 1}`);
  if (!dryRun) {
    await db.website.update({ where: { id: site.id }, data: { sectionsJson: JSON.stringify(next) } });
  }
  updated += 1;
}

console.log(
  `\n${dryRun ? "[dry run] would update" : "updated"} ${updated}, already had one ${skipped}, unreadable ${unreadable}`,
);
await db.$disconnect();

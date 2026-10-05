/**
 * Verify SMTP credentials and optionally send one real message.
 *
 *   node scripts/mail-check.mjs                 # verify only
 *   node scripts/mail-check.mjs you@example.com # verify + send a test
 *
 * Reads .env directly so it works without the Next.js runtime.
 */
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME } = process.env;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("SMTP_HOST / SMTP_USER / SMTP_PASS missing from .env");
  process.exit(1);
}

const port = Number(SMTP_PORT ?? 465);
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: SMTP_SECURE ? SMTP_SECURE === "true" : port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});

console.log(`connecting to ${SMTP_HOST}:${port} as ${SMTP_USER} ...`);
await transport.verify();
console.log("SMTP credentials OK");

const to = process.argv[2];
if (to) {
  const info = await transport.sendMail({
    from: `"${SMTP_FROM_NAME || "WebSetu"}" <${SMTP_FROM_EMAIL || SMTP_USER}>`,
    to,
    subject: "WebSetu SMTP test",
    text: "If you are reading this, transactional email is wired up correctly.",
    html: '<p style="font-family:sans-serif">If you are reading this, <b>transactional email is wired up correctly</b>.</p>',
  });
  console.log("sent:", info.messageId, "->", info.accepted.join(", "));
}
await transport.close();

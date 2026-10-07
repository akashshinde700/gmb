# Gap 5 — Hosting, HTTPS + Business Email Bundle

Bhai, gap 5 mein jo 10Web/Wix/Hostinger "bundle" bechte hain (hosting + CDN + email), uska asli
product value cheez humne bana di: **customer ka domain poori tarah kaam kare** — site, HTTPS,
ownership proof, aur business email (MX/SPF/DKIM/DMARC) — sab ek hi jagah, asli DNS ke against
verified.

Ye "kisi aur ka panel bech dena" nahi hai — ye woh kaam hai jo har chhota business galat karta hai
aur jiske karan uske quotation spam mein chale jaate hain.

---

## 1. Kya bana

**`src/lib/hosting.ts` (naya, pure)** — ek domain ke saare records, chaar groups mein, har record ke
saath ek saaf English line ki "ye kis liye hai":

| Group | Records | Kya karta hai |
|---|---|---|
| Your website | A (@), CNAME (www) | domain kholne pe site aaye |
| Proof of ownership | TXT `_websetu.<domain>` | koi doosra aapka domain apni site pe na lagaye |
| HTTPS certificate | CAA `issue`, `issuewild` (optional) | CA ko permission; khaali CAA bhi theek hai |
| Business email | MX, SPF, DKIM, DMARC (+ autodiscover/… ) | mail deliver ho, aur **signed** ho |

**Mailbox providers (asli published settings):** WebSetu mailbox, **Google Workspace** (uske 5 MX
rows), **Zoho** (mx.zoho.in/mx2/mx3 — India mein sabse common), **Microsoft 365** (tenant MX +
2 DKIM CNAMEs + autodiscover), aur "**abhi koi mailbox nahi**" — jo sach mein ek valid choice hai
(website sirf, enquiry phone/WhatsApp/dashboard pe).

**Verification ek injectable resolver se** — production `node:dns`, tests/probes ek table. Har record
ka result ek hi line mein: `In place` / `Not published` / **`Points elsewhere`** (jab dekh liya ki
kahan point kar raha hai) / `Could not check` (jab hum khud read nahi kar paye — customer ko galti
ka ilzaam nahi).

**Safety/never-invent rules (jo product mein hard-coded hain):**
- DKIM ki key **kabhi invent nahi hoti** — provider ke console se paste karani padti hai; value na ho
  to row "Needs a value" dikhata hai, pending nahi.
- Platform ke apne hostnames refuse hote hain (warna MX badal ke apni hi mail tod denge).
- Lookup fail hona **success nahi** hai; DNS timeout se domain ACTIVE nahi hota.
- Zoho ke 3 MX rows mein se sirf 1 publish ho to baki 2 "**not published**" hain — "wrong" nahi —
  kyunki mail chal hi raha hai; isi liye "email ready" = **ek** mail server + SPF, aur "sab done"
  tabhi jab poora set ho. (Ye ek asli product judgement hai, test mein pinned.)

**API `GET/POST /api/hosting`** — provider chunna, DKIM value save, DMARC posture (none →
quarantine → reject), DNS verify (rate-limited), aur **"Clear site cache"** (`revalidatePath` — `/s/`
ISR 300s ki jagah customer ko turant apna edit dikhe). Settings `Setting` table mein
`hosting:<businessId>` pe — schema ko chhua nahi.

**Dashboard tab "Hosting & Email"** (Website group mein, SEO ke baad) — provider picker, DKIM box,
DMARC ladder, records ki table copy-buttons ke saath, per-record status + "Found: …" (jo DNS ne
actually kaha), aur DMARC ko p=none se shuru karne ki wajah + "dmarc@ apne domain pe banana" wali
notes.

---

## 2. Proof

**Unit — `npm run test:hosting` → 90/0** (pure, no network): platform-host refusal, har provider ka
record set (Google ke 5 MX, Microsoft ke 2 DKIM CNAME + tenant), SPF merge/conflict, DMARC posture
ladder, verification-token matching, MX set ka "missing vs wrong" judgement, "resolver fail = error,
not success", summary/headline ki sachai, aur dashboard wiring (client component hai, isliye text
ke through — repo ka convention).

**Live probe — 37/37, do baar chala ke (idempotent)**, dev server + real DNS:
- domain add (google.com test target), platform host "That domain belongs to the platform" se refuse
- provider Google → 5 MX + `v=spf1 include:_spf.google.com ~all`, DKIM waiting, DMARC p=none
- **asli DNS check:** google.com ka asli SPF hmare planned SPF se **match** hua → `In place`;
  uske asli MX `10 smtp.google.com` → `Points elsewhere` + found value dikhaya; hamara A record
  unke IPs ke against → `Points elsewhere` with actual IPs; ownership TXT → `Not published yet`
- summary: `ok 1, missing 3, wrong 9` + headline "Some records exist but point somewhere else — fix
  the ones marked below."
- DKIM/DMARC store hue, provider switch pe purani DKIM value clear, galat posture/provider/action
  par saaf error, purge 200, last-check store hua (tab dobara kholne pe status wahi)

**Regression:** domains 36/0, section-editor 15/0, design 72/0, figma 125/0, commerce 78/0,
distinct-sites all checks, api-smoke 105/0, `tsc` 0, `eslint` 0.

---

## 3. Honest limits

- **CDN:** DNS/edge already hai (Cloudflare host pe), aur panel se cache purge ho jaata hai. Koi naya
  CDN product nahi bana — ye kaam host/Cloudflare ka hai, humne uska control surface diya.
- **Mail server hum host nahi karte:** "WebSetu mailbox" option tab tak adhoora hai jab tak
  deployment pe `MAIL_HOST` set na ho (panel ye saaf likh deta hai). Google/Zoho/Microsoft ke saath
  poora kaam karta hai — jo 95% customers karte hain.
- **DKIM/DMARC ka andar ka hissa** (mail signing khud) mail provider ke server pe hota hai, na ki
  hamare paas — hum record plan karte hain, verify karte hain, aur posture ladder chalate hain.
- **CAA** optional rakha: galat CAA certificate *rok* deta hai, isliye default theek hai aur panel
  wajah likhta hai.

---

## 4. Bache hue

- Push: is session mein remote band hai — commit local hai, **naya session** push karega.
- Photographic imagery (image-provider key), Autopilot ka host cron (donon pehle se pending).
- Crowded trade ke liye uniqueness % ki wording relative karni hai (dashboard + wizard).

# Push kaise karein — 3 raaste, aasaan se mushkil tak

Tumhara saara kaam tayyar hai. Is workspace mein ye commits hain (`main` ke upar):

```
47497b2 (main)   Merge pull request #1            ← GitHub pe already hai
f4042e9          art variety, per-visit leads, freeform editor,
                 white-label reseller + Builder API, e-commerce, Figma import,
                 scale proof (1,000 sites, 20/20)
c12c3c8          Hosting & email bundle (unit 90/0, live probe 37/37)
f6d8c7e, cdc691b push instructions (docs)
```

**Total:** 83 files badle / naye — is folder mein sab kuch rakha hai:
`/home/user/push-artifacts/`

| File | Kis kaam ka |
|---|---|
| **gmb-changes.zip** | **Raasta 1 ke liye** — 83 badli hui files, sahi folder structure ke saath |
| gmb-session.bundle | Raasta 2 ke liye — poore commits (history ke saath) |
| 0001…0003-*.patch | Raasta 2 ka alternative — ek-ek commit ka patch |

---

## ⭐ Raasta 0 — jo `.patch` download kiya hai, usse (sabse seedha terminal raasta)

**Pehle ek zaroori baat:** `0001-Hosting-email-bundle-...patch` **akele kaam nahi karega** — usko
bade commit `f4042e9` ki zaroorat hai (wo hosting se pehle aaya tha). Maine test kiya: `main` pe wo
patch fail ho jaata hai.

**Iske liye maine ek all-in-one patch banaya hai: `gmb-all-in-one.patch`** — ismein poori session ka
kaam hai (83 files) aur ye seedha `main` pe clean apply hota hai (tested).

```bash
cd gmb                          # tumhara clone
git checkout main
git pull
git checkout -b arena/cd3fcf8e-gmb
git apply /path/to/gmb-all-in-one.patch
git add -A
git commit -m "WebSetu session work: art variety, editor, reseller API, e-commerce, Figma import, scale proof, hosting & email bundle"
git push -u origin arena/cd3fcf8e-gmb
```

- Path kaise likhein: Mac/Linux → `~/Downloads/gmb-all-in-one.patch` ·
  Windows (Git Bash) → `C:/Users/Naam/Downloads/gmb-all-in-one.patch` (forward slashes).
- `git apply` fail ho jaye to `git apply -v` chalao — wo bata deta hai kaunsi file atki.
- Chahte ho **4 commits ki history** (ek squash commit ki jagah)? `series-all/` ke **chaaron**
  patch download karo aur `git am` se order mein lagao:
  ```bash
  git am /path/to/series-all/0001-*.patch /path/to/series-all/0002-*.patch \
         /path/to/series-all/0003-*.patch /path/to/series-all/0004-*.patch
  ```
  (Ye dono tareeke maine test kiye — dono `main` pe saaf chalte hain.)
- Push ke baad PR: **https://github.com/akashshinde700/gmb/compare/main...arena/cd3fcf8e-gmb**

---

## ✅ Raasta 1 — GitHub website se, **koi terminal nahi** (agar git bilkul nahi hai)

Sirf browser chahiye. 6 step.

1. **Zip download karo**: `push-artifacts/gmb-changes.zip` (Arena file viewer mein kholo → Download).
2. **Unzip karo** apne computer pe. Andar ye folders dikhenge: `src`, `tests`, `prisma`, aur kuch files
   (`package.json`, `worklog.md`, reports).
3. GitHub kholo (Chrome/Edge mein — folder drag karne ke liye): **https://github.com/akashshinde700/gmb**
4. **"Add file" → "Upload files"** pe click karo.
5. Unzipped folder ke **andar ki cheezein** (yaani `src`, `tests`, `prisma`, `package.json`, …) **drag karke**
   upload area mein chhod do. GitHub folder structure khud preserve karta hai.
   - ⚠️ Browser ke "choose files" button se multiple files select **mat** karo (wo paths kharab kar
     deta hai) — **drag & drop** karo.
6. Neeche **commit message** likho (kuch bhi, jaise `Hosting & email bundle + session work`), aur
   **"Create a new branch for this commit and start a pull request"** wala option choose karke branch
   ka naam likho: `arena/cd3fcf8e-gmb` → **Propose changes** → phir **Create pull request**.

**Check (30 sec):** ye link khulna chahiye —
https://github.com/akashshinde700/gmb/blob/arena/cd3fcf8e-gmb/src/lib/hosting.ts
Agar file dikh gayi, sab sahi upload hua. 🎉

> Note: is raaste se sab kuch **ek hi commit** mein jayega (meri 4 commits ki history nahi rahegi).
> Code bilkul same rahega — bas history squashed. Chahiye history, to Raasta 2.

---

## Raasta 2 — Terminal se, commits/history ke saath

Git install hona chahiye (`git --version` se pata chalta hai). Mac: Terminal, Windows: Git Bash.

```bash
# 1. repo clone karo (agar pehle se hai to skip)
git clone https://github.com/akashshinde700/gmb.git
cd gmb

# 2. bundle se commits lao (bundle file ka poora path likho)
git fetch /path/to/gmb-session.bundle HEAD:arena/cd3fcf8e-gmb

# 3. push karo
git push origin arena/cd3fcf8e-gmb
```

- `/path/to/gmb-session.bundle` ki jagah asli path — Mac/Linux: `~/Downloads/gmb-session.bundle`,
  Windows (Git Bash): `C:/Users/TumharaNaam/Downloads/gmb-session.bundle` (forward slashes).
- **Password maanga jaye to:** GitHub ka account password **nahi** chalega. Do options:
  - **GitHub Desktop** install karke usse clone karo, phir `Repository → Open in Terminal` —
    Desktop ka login use ho jayega, kuch type nahi karna padega. **Ye sabse aasaan hai.**
  - Ya naya **Personal Access Token** banao (github.com/settings/tokens → classic, `repo` scope) aur
    password ki jagah paste karo. **Token yahan chat mein mat bhejo.**
- Phir PR: **https://github.com/akashshinde700/gmb/compare/main...arena/cd3fcf8e-gmb** → Create pull request.

### Patch se bhi ho sakta hai (agar bundle route atke)
```bash
cd gmb && git checkout main && git pull && git checkout -b arena/cd3fcf8e-gmb
git am /path/to/0001-*.patch /path/to/0002-*.patch /path/to/0003-*.patch
git push origin arena/cd3fcf8e-gmb
```
(Patches order mein lagao. Commit hashes naye banenge — content wahi rahega.)

---

## Raasta 3 — Naya Arena session

Naya coding session kholo aur **ye paste karo**:

> Workspace `/home/user/gmb`, branch `arena/cd3fcf8e-gmb`. `git log --oneline -6` dekho — `main`
> (47497b2) ke upar 4 commits hone chahiye (`f4042e9`, `c12c3c8`, `f6d8c7e`, `cdc691b`). Agar commits
> na dikhein (checkout dobara clone ho gaya ho), to
> `git fetch /home/user/push-artifacts/gmb-session.bundle HEAD:arena/cd3fcf8e-gmb` chala kar wapas lao.
> Phir `git push origin arena/cd3fcf8e-gmb` karo aur `main` ke against PR kholo. Sandbox-only files
> (`src/lib/db.ts`, `prisma/seed.ts`, `prisma.config.ts`, `prisma/schema.prisma` ki `engineType` line)
> uncommitted hi chhodna. Poora context: `worklog.md` (Task 20-a…21-a).

---

## Agar kuch atak jaye

| Dikkat | Kya karo |
|---|---|
| Upload ke baad `src/lib/hosting.ts` 404 deta hai | Files flatten ho gaye — dobara upload karo, is baar **folders drag** karke (Chrome mein) |
| `git fetch bundle` → "Repository lacks these prerequisite commits" | Tumhara clone purana hai — pehle `git checkout main && git pull`, phir fetch |
| `git fetch bundle` → "not a git bundle" | Wo `.zip` file hai, bundle nahi — sahi file use karo |
| `push` pe "Authentication failed" | GitHub password se nahi hota — GitHub Desktop ka login use karo, ya naya token banake password ki jagah daalo |
| `push` pe "protected branch" / "no permission" | Tumhara account repo ka owner/admin hai ya nahi, ye check karo |
| Zip upload page pe accept nahi karta | Zip ko pehle unzip karo — GitHub zip upload nahi karta, sirf files |

---

## ⚠️ Ek zaroori baat

Jo token tumne chat mein bheja tha — **abhi revoke kar do**: https://github.com/settings/tokens → Delete.
Teeno raaste uske bina chalte hain, aur chat mein aaya token exposed maana jaata hai.

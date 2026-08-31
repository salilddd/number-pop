# Play Console submission — copy and answers

Everything here is ready to paste into Play Console. Nothing in this file ships
inside the app; it exists so the listing and the console forms aren't rewritten
from scratch each time.

---

## Store listing

**App name** (max 30)

```
Number Pop
```

**Short description** (max 80 — this one is 69)

```
Pop the right bubble. Times tables, division, adding and subtracting.
```

**Full description** (max 4000)

```
Number Pop is a fast, friendly arithmetic game for children — and a genuinely
useful one. A question appears, bubbles drift across the chalkboard, and you tap
the right answer before it floats away. Answer quickly and you score more. You
get three lives.

PRACTICE THAT ACTUALLY ADAPTS

Number Pop keeps a private record of every individual number fact your child
answers, and quietly asks more of the ones they find hard. Facts you get wrong,
answer slowly, or haven't seen in a while come back around more often — but not
so often that you get stuck on the same four questions. The My Tables screen
turns that record into a grid you can actually read, so you can see the 7s
turning gold week by week.

The wrong answers are chosen carefully too. They're the mistakes children really
make — the adjacent multiple, the near miss, the digit swap, the dropped carry —
so getting it right means doing the arithmetic rather than spotting the one
number that looks plausible.

WHAT'S IN IT

• Times tables, division, addition and subtraction, plus a mixed mode
• Pick exactly which tables and number ranges to practise
• Three difficulties, from a gentle 25-pixel drift to a brisk one
• Questions asked three ways: straight, backwards (7 × ? = 42), and true or false
• Power-ups earned on a streak — slow down time, freeze the field, or remove two
  wrong answers
• Boss levels, and a jungle that grows a new plant for every perfect level
• A gorilla who reacts to how you're doing, and who can be poked, fed and
  startled on the home screen

FOR PARENTS

No ads. No in-app purchases. No account or sign-in. No analytics. No chat, no
links out, nothing to fill in.

Number Pop requests no Android permissions at all — not even internet access —
so no information can leave the device even in principle. High scores and
practice history are saved on the phone and nowhere else. Uninstalling deletes
them.

It also means the whole game works offline, on a plane, in the car, anywhere.

Free, complete, and finished. There is no paid version.
```

---

## Category and contact

| Field | Answer |
|---|---|
| App or game | **Game** |
| Category | **Educational** |
| Tags | Educational, Casual, Brain games |
| Email | *your public contact address — Play shows this on the listing* |
| Website | `https://salilddd.github.io/number-pop/privacy.html` (or the repo) |
| Phone | optional, leave blank |

---

## Privacy policy URL

```
https://salilddd.github.io/number-pop/privacy.html
```

Published from `docs/privacy.html` in this repo. To turn it on: GitHub →
repo **Settings** → **Pages** → Source **Deploy from a branch** → branch `main`,
folder `/docs` → Save. It goes live in a minute or two.

**Before submitting, replace `CONTACT_EMAIL_HERE` in `docs/privacy.html`** with
the address you want to publish. It appears twice on one line.

---

## Data safety form

The answer is "no" throughout, and it is defensible on inspection — the app
holds no `INTERNET` permission, so there is no channel over which data could be
collected.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | n/a — nothing is transmitted |
| Do you provide a way for users to request that their data is deleted? | n/a — uninstalling removes everything |

If asked about locally stored data: the high scores, settings and practice
history are stored **on the device only** and never transmitted. Under Google's
definition, data that never leaves the device is not "collected".

---

## Content rating questionnaire (IARC)

Category: **Game**. Every question below is **No**:

- Violence, blood, or realistic violence of any kind
- Sexuality or nudity
- Profanity or crude humour
- Controlled substances — drugs, alcohol, tobacco
- Gambling, simulated gambling, or real-money gambling
- Fear or horror content
- User interaction, chat, or sharing of user location
- Digital purchases / in-app purchases
- Sharing user-provided personal information

Expected outcome: **Everyone / PEGI 3 / USK 0**.

---

## Target audience and content

| Field | Answer |
|---|---|
| Target age groups | **Ages 5 and under, 6–8, 9–12** |
| Is the app appealing to children? | **Yes** |
| Store presence | Appeals to children |
| Ads | **No, my app does not contain ads** |

Selecting a child age group puts the app in the **Families programme**, which
requires the privacy policy above plus a compliance attestation covering COPPA
and GDPR. Nothing in the app needs to change to satisfy either — there is
nothing to disclose.

---

## App access

**All functionality is available without special access.** No login, no
credentials for reviewers, nothing region-locked.

---

## Government / financial / health declarations

All **No**. Not a government app, no financial features, no health features, no
news content.

---

## Graphics needed

| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit, no transparency | `store/play-icon-512.png` |
| Feature graphic | 1024 × 500 PNG or JPG, no transparency | `store/play-feature-1024x500.png` |
| Phone screenshots | 2–8, min 320px on the short side, 16:9 or 9:16 | `store/screenshots/`, five at 1080 × 1920 |
| 7" tablet screenshots | optional | skip |
| 10" tablet screenshots | optional | skip |

The screenshots are of the real game, rendered by
`store/make-screenshots.ps1` — home, a live question, a boss, the My Tables
grid and the topic picker. Upload them in that order; the store shows the
first one beside the icon, and a live question says what the game is faster
than a menu does.

Re-run that script after any visual change. It is worth reading its header
before touching the flags: `requestAnimationFrame` does not advance in
headless Chromium, so the harness steps the frame function by hand, and both
the device scale factor and the decision to use the frame uncropped are
load-bearing — getting either wrong silently produces elliptical bubbles or
crops the gorilla's head off.

---

## Release

- Upload `android/app/build/outputs/bundle/release/app-release.aab`
- Release name: `1.0 (1)`
- Release notes: `First release.`
- Countries: all, unless you have a reason not to

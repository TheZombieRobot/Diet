# PAK'nSAVE Integration Feasibility

**Verdict (18 October 2026):** Direct transfer of a grocery list into a PAK'nSAVE online cart is **unproven and must not be built in the MVP.** No public developer interface was found, the website and online-shopping terms could not be read in full from this environment, and the only "integration" paths available to a third party would involve automating Foodstuffs' website or impersonating its app, which this project rules out. The MVP ships a **guided manual-add** experience instead: the laptop side panel shows your list and opens a PAK'nSAVE search for each item; you add to cart yourself.

This document records what was checked, what was found, what could not be verified, and the conditions under which anything deeper could be reconsidered.

---

## 1. Rules this project follows regardless of what the terms say

- No handling, storing or relaying of your PAK'nSAVE/Club+ login or session.
- No reverse engineering of the PAK'nSAVE website, app or any network traffic.
- No scraping of prices, stock, or product data.
- No bypassing of bot protection, rate limits or technical controls.
- No automated clicking or form filling on paknsave.co.nz unless a written permission or an official interface exists.
- The app never displays a price, a stock level, or a cart status that it has not actually confirmed. In the MVP it therefore displays none of these.

---

## 2. How the check was done and its limits

Checks were done with web search only. This execution environment's network policy blocks direct page fetches from paknsave.co.nz, foodcomposition.co.nz, developer.chrome.com and others (the proxy returned "403" for those hosts). So:

- Claims below marked **verified** come from search-engine extracts of the named page.
- Claims marked **not verified** need you (or the implementing model in a less restricted environment) to open the page and read it. These are checklist items 6–8 in `IMPLEMENTATION_CHECKLIST.md`.
- Nothing here is legal advice. If you ever want to go beyond Tier 1, a short email to Foodstuffs North Island asking permission is the right next step (template in section 7).

---

## 3. What was established

### 3.1 PAK'nSAVE Pāpāmoa and online shopping
| Finding | Status | Source |
|---|---|---|
| PAK'nSAVE Pāpāmoa, 42 Domain Road, Pāpāmoa 3118, lists Click & Collect among its services | Verified from search extract | [Store page](https://www.paknsave.co.nz/upper-north-island/bay-of-plenty/papamoa) |
| PAK'nSAVE offers Click & Collect only; no home delivery | Verified from search extract | [Shop FAQ](https://www.paknsave.co.nz/shop/frequently-asked-questions), [Online shopping](https://www.paknsave.co.nz/more/online-shopping) |
| Online shopping requires a free Club+ account | Verified from search extract | [Shop FAQ](https://www.paknsave.co.nz/shop/frequently-asked-questions) |
| The official PAK'nSAVE app lets you create, save and share multiple shopping lists and build an order from a list | Verified from search extract (company marketing copy) | [App page](https://www.paknsave.co.nz/app) |
| Same-day Click & Collect slot availability at Pāpāmoa | Not verified | Check in the app or site when you shop |
| Whether online prices equal in-store prices at Pāpāmoa | Not verified | The app will not show prices, so this does not block the MVP |

### 3.2 Developer access
| Finding | Status | Source |
|---|---|---|
| No public API, developer program or partner integration for consumers or third-party apps was found for PAK'nSAVE, New World or Foodstuffs | Verified absence in search results (absence of evidence, not proof) | Searches returned only supplier EDI material ([Sandfield case study](https://www.sandfield.co.nz/our-work/foodstuffs-new-exchange-is-leaping-ahead)) and corporate news |
| Community scrapers exist (GitHub, PyPI) that pull product data from the site | Verified they exist | [pakn-scraper](https://github.com/Jason-nzd/pakn-scraper), [nz-supermarket-scraper](https://pypi.org/project/nz-supermarket-scraper/). Their existence does not make scraping permitted, and this project will not use or imitate them. |

### 3.3 Terms and conditions
| Document | What is known | Status |
|---|---|---|
| [Website Terms and Conditions](https://www.paknsave.co.nz/terms-and-conditions) | Governs "use of this Site, including any service or content we provide you via the Site"; using the site is deemed acceptance. The extract was cut off before any clause about automated access. | **Clause on automation, robots, scraping, reproduction: not verified.** Must be read. |
| [Online Shopping Terms and Conditions](https://www.paknsave.co.nz/shop/terms-and-conditions) | Covers the service "where you can search for and purchase grocery items"; notes that the general website terms also apply. | **Clauses on third-party tools, account use, prices "indicative", substitutions: not verified.** Must be read. |
| [App End User Licence Agreement](https://www.paknsave.co.nz/terms-and-conditions/app-end-user-licence-agreement) | Prohibits using the app to build a competing product, using it "to provide services to third parties without prior written consent", and removing or circumventing security or technical measures. | Verified from search extract. Applies to the mobile app, not the website, but signals Foodstuffs' stance on automation and circumvention. |
| [Savey Meal-bot terms](https://www.paknsave.co.nz/terms-and-conditions/savey-meal-bot) | Exists; not relevant to cart integration. | Noted only |

**Working assumption until the terms are read:** treat the website as prohibiting automated access and bulk extraction. Nearly every NZ retailer's terms do, and the App EULA shows the same posture. Tier 1 below is designed to be acceptable even under a strict reading, because the extension only opens ordinary web pages that you then use yourself.

### 3.4 Chrome's own rules for the extension
| Finding | Status | Source |
|---|---|---|
| Side Panel API needs the `sidePanel` permission and Chrome 114+ with Manifest V3; `sidePanel.open()` from Chrome 116 | Verified | [Chrome sidePanel reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| Chrome Web Store policies require a single disclosed purpose, collect only data strictly necessary for it, and prohibit collecting browsing activity except for a prominently described user-facing feature. A 2026 policy update tightened the "strictly necessary" wording. | Verified | [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [2026 update](https://developer.chrome.com/blog/cws-policy-updates-2026) |
| The MVP extension is loaded unpacked, so Web Store review does not apply; we still design to its rules so that a later listing is possible | Decision | — |

---

## 4. Integration tiers

| Tier | What it does | Needs | Legal/terms risk | Technical risk | MVP? |
|---|---|---|---|---|---|
| **0. List only** | Side panel shows the list; copy item name to clipboard; tick off | `sidePanel`, `storage` | None | None | Yes, baseline |
| **1. Guided manual add** | As Tier 0, plus a "Find at PAK'nSAVE" button per item that opens a new tab on the PAK'nSAVE search page for that term. You add to cart yourself. | As Tier 0. Opening a URL is an ordinary user navigation; no page access permission. | Very low. Same as typing in the search box. Confirm the terms do not prohibit deep-linking (unusual). | Low. The search URL pattern must be observed by *you* using the site normally and written down; if it changes, the button falls back to copy-to-clipboard. | **Yes, the MVP target** |
| **2. Cart awareness** | Extension reads the page you are on to auto-tick items present in your cart | Host permission for paknsave.co.nz and a content script that reads the page | Medium. Reading page content you are viewing is usually within terms, but "reproduction" and "automated means" clauses could be stretched to cover it. Requires reading the terms first. | Medium. Page structure changes break it silently; must fail safe (never claim an item is in the cart unless clearly read). | No. Reconsider after terms review and a successful MVP. |
| **3. Automated add-to-cart** | Extension clicks "add" on the site, or calls the site's internal endpoints | Everything above plus either written permission or an official API | High. Likely prohibited as automation; internal endpoints would be reverse engineering, which this project forbids. | High. Fragile, could be read as bot activity and jeopardise your Club+ account. | **No. Not planned.** Only revisited with written permission or a published API. |

---

## 5. The guided manual-add experience (Tier 1) in detail

What you will see on the laptop while shopping:

1. **Open the side panel** by clicking the extension icon. Your list appears, grouped by aisle (produce, meat, dairy, pantry, frozen, other), with quantities in buyable units ("2 × 250 g" rather than "430 g").
2. **Each line has three controls:** a tick box, a "Find" button and a "note" field.
3. **"Find"** opens a new tab on the PAK'nSAVE search results for a cleaned-up search term (for example "avocado" rather than "2 ripe avocados"). The search term is editable, because the best search phrase is sometimes a brand or pack size. If the search URL pattern is unknown or has changed, "Find" instead copies the term to the clipboard and tells you to paste it into the site's search box.
4. **You add the product to your cart on PAK'nSAVE's own page.** The extension does not know whether you did; it waits for you to tick.
5. **Tick** marks the line done; **note** records a substitution ("got frozen instead") or "not stocked". Notes are kept for the next planning session so the recipe library can learn what Pāpāmoa does not carry.
6. **Progress bar** shows how many lines are done. "Clear list" removes it from the laptop; the phone keeps its own copy.
7. **Nothing is shown about price, stock, or whether the cart contains the item.** A small footer reads: "This panel does not read PAK'nSAVE pages. Prices and stock are whatever the site shows you."

For in-store shopping without the laptop, the same list is on the phone with the same tick boxes. The side panel is a convenience for Click & Collect.

Alternative you may prefer: the official PAK'nSAVE app has its own shareable lists. The phone app offers "Copy list as text" so you can paste it into the official app if you find that smoother. No integration is involved.

---

## 6. Nutrition data licensing (related feasibility question)

The New Zealand Food Composition Database (foodcomposition.co.nz) is the preferred source of nutrient values.

| Finding | Status | Source |
|---|---|---|
| The database is owned by The New Zealand Institute for Bioeconomy Science Limited (formerly Plant & Food Research) and the Ministry of Health | Verified from search extract | [Terms of use](https://www.foodcomposition.co.nz/terms/) |
| FOODfiles is licensed under "a worldwide, non-exclusive, non-transferable, royalty free, right to access and use the FOODfiles Data subject to the following conditions", including not modifying the data and limits on reproduction; a clause 4 covers use in "any product or service" | Partially verified; **clause 4 wording not read** | [Terms of use](https://www.foodcomposition.co.nz/terms/) |
| Current release is FOODfiles 2024; download requires agreeing to the terms; a recommended citation exists in the data manual | Verified from search extract | [FOODfiles page](https://www.foodcomposition.co.nz/foodfiles/), [2024 data manual](https://www.foodcomposition.co.nz/downloads/new-zealand-food-composition-database-2024-data-manual.pdf) |

**Decision:** read clause 4 before loading data (checklist item 8). If it permits non-commercial use within a personal app with attribution, use a hand-curated subset of roughly 150 items with the recommended citation on the app's "About data" screen. If it does not, use the USDA FoodData Central (public domain), which is less NZ-specific but unencumbered, and note the gap for NZ-only items such as feijoa.

---

## 7. If you ever want more than Tier 1

Send this to Foodstuffs North Island (customer services or the privacy/legal contact on paknsave.co.nz) and keep the reply in `docs/handoff/`:

> I am a PAK'nSAVE Pāpāmoa Click & Collect customer building a personal, non-commercial shopping-list tool for my own use. It currently only opens your website's search page for each item on my list; I add items to my cart myself. I would like to ask whether (a) that is acceptable under your website terms, and (b) whether you offer, or would permit, any supported way for a personal tool to read my own cart contents or add items to it. I will not scrape data, store my login outside your site, or bypass any technical measure. Thank you.

Tier 2 or 3 work starts only if the answer is yes, or an official interface is published.

---

## 8. Open items (tracked in the checklist)

1. Read the Website Terms and Conditions in full; paste the automation/reproduction clauses here.
2. Read the Online Shopping Terms in full; paste clauses on third-party tools and prices.
3. Read foodcomposition.co.nz terms clause 4; decide NZ vs USDA data.
4. Observe, as a normal user, the URL that paknsave.co.nz uses for a product search and record it in `apps/extension/README.md`. If the site offers no stable search URL, Tier 1 degrades to copy-to-clipboard.
5. Record whether the "developer mode extensions" warning is tolerable or whether a Web Store listing is wanted later.

# consent-rr

Cookie-consent **r**esource **r**eplacements for uBlock Origin.

A consent manager is normally dealt with by hiding its banner and clicking its
buttons (`trusted-click-element`), which means the banner has to render first,
the selector has to keep matching, and the click has to land. These resources
take the other route: uBO redirects the CMP's own script to a stub that reports
a decision the visitor already made. No banner is ever built, nothing has to be
clicked, and the page's consent API answers normally.

Currently covered: **OneTrust** (and its CookiePro tier), **Cookie Information**,
**InMobi Choice** (formerly Quantcast Choice), **Osano**, **Civic Cookie
Control**, **Cookiebot**, **Securiti**, **Transcend**, **Usercentrics**,
**PubTech**, **Termly**, **Ketch**, **AppConsent**, **CookieScript**,
**Didomi**, **Complianz**, **Ziff Davis's own zdconsent**,
**Google Funding Choices**, **tarteaucitron**, **CookieYes**,
**consentmanager.net** and **Cookiez**.

| Resource | What the page sees |
| --- | --- |
| `onetrust-reject.js` | A stored *reject all*: `C0001` on, everything else off. Tags parked behind a category stay parked. |
| `onetrust-accept.js` | A stored *accept all*: every category on, and tags parked behind one are switched back on. |
| `cookieinformation-reject.js` | Cookie Information: the necessary category approved, everything else denied. One resource - no accept or unblock variant. |
| `inmobi-reject.js` | InMobi Choice: a stored refusal. Nothing consented to, a TC string that says so, and `__tcfapi`, `__gpp` and `__uspapi` all answering instead of stalling. |
| `civic-reject.js` | Civic Cookie Control: every optional category the site declares recorded as `revoked`, the necessary ones untouched, and `CookieControl` answering. |
| `civic-reject-unblock.js` | Civic, for a site that withholds content until a category is on: accepts the categories that do not read as tracking, refuses the ones that do, and still refuses the IAB layer. |
| `cookiebot-reject.js` | Cookiebot: their own default state, which is already a refusal - `necessary` true, `preferences`, `statistics` and `marketing` false - with `CookieConsent` answering and parked tags left parked. |
| `securiti-reject.js` | Securiti: a refusal recorded in their own `__privaci_cookie_consents`, with the API their loader parks answering instead of queueing for an SDK that never arrives. |
| `transcend-reject.js` | Transcend: no banner, and the refusal recorded through airgap's own API - which leaves airgap itself in place, blocking by that refusal. |
| `cookiescript-reject.js` | CookieScript: their own reject-all record in their cookie, their consent mode denied, and the tags their auto-blocker parked left parked. |
| `appconsent-reject.js` | AppConsent: nothing consented, their `IABTCF_` keys saying so, and `__tcfapi` answering instead of a stub nothing will replace. |
| `appconsent-accept.js` | AppConsent, granting - for a consent-or-pay wall that keeps the page shut until the answer is yes. Every purpose and vendor consented, and a vendor handed that string may act on it. |
| `ketch-reject.js` | Ketch: their 1.9MB SDK never fetched, their command queue answering a refusal, and a returning visitor's record revoked code by code. |
| `ketch-reject-unblock.js` | Ketch, for a site that withholds content until a purpose is consented to: the same stored and sent refusal, while the API tells the page every purpose is on. |
| `termly-reject.js` | Termly: no banner, their own opted-in record - essential alone - with their denied Google consent mode, and the tags their auto-blocker parked left parked. |
| `pubtech-reject.js` | PubTech CMP: no banner, their publisher-cookie string with every choice off, and `__tcfapi` answering a refusal the IAB's own library agrees is one. |
| `usercentrics-reject.js` | Usercentrics: no banner, and no service consented in the record their own blocker reads - which leaves that blocker in place, blocking by it. A service a returning visitor had accepted is revoked by name. |
| `didomi-reject.js` | Didomi: no banner, their own token with nothing consented - in the cookie and in localStorage, as their storage service writes both - and the three events their own refusal emits, in their order. No `__tcfapi` yet. |
| `didomi-accept.js` | Didomi, granting: every purpose they define consented, plus any the tenant named in `didomiConfig`. Content a site gates on its own purpose read is shown. Still no TC string, so IAB vendors are not told anything. |
| `complianz-reject.js` | Complianz (WordPress): their own refusal written per category under the site's own cookie prefix, with their policy id kept so the next page does not wipe it, and the tags their blocker parked left parked. |
| `complianz-accept.js` | Complianz, granting: every category consented, and the elements their blocker rewrote to `data-src-cmplz` put back - script, iframe, image and stylesheet - with their content notice removed. |
| `zdconsent-reject.js` | Ziff Davis (mashable.com, speedtest.net, askmen.com): their own Deny All record, the OneTrust record underneath that their script actually reads, and the queued work a page waits on run - which blocking the file outright leaves unrun. |
| `zdconsent-accept.js` | Ziff Davis, granting - for the EU build, where nothing is consented until a visitor answers, and for an accept-or-pay site where their script rewrites OneTrust's reject button into a subscribe link. It will not overrule a GPC header. |
| `fundingchoices-reject.js` | Google Funding Choices: the inactive path their own script takes - the two iframes consumers wait on, their internal queue answering instead of collecting - plus the IAB layer it leaves out, `__tcfapi` refusing as cmpId 300. Their `FCCDCF` consent cookie is cleared rather than replaced, because absent is how Google's own readers read a refusal. No accept resource. |
| `tarteaucitron-reject.js` | tarteaucitron, hosted or self-hosted: their own refusal in their own cookie, one `!service=false` entry each, and the per-service events their Google, Bing and Clarity glue listens for - so the refusal reaches consent mode and not just the cookie. No banner, no reload, and their `pro()` beacon not sent. |
| `tarteaucitron-reject-unblock.js` | tarteaucitron, consenting to **video and social** and refusing the rest - their own service types make the cut. A consented embed is started by their own launcher, so the video actually appears; ads, analytics and the rest stay refused. |
| `cookieyes-reject.js` | CookieYes: their own reject-all in their `cookieyes-consent` record - necessary yes, the other five no - the two events they fire at the document, and the IAB layer their file only stubs answered as a refusal. Their `consentid` is kept, never minted, and their page-view beacon is not sent. |
| `cookieyes-reject-unblock.js` | CookieYes, for a site that withholds something until a category is on: the same stored refusal, while the page's own scripts are told every category is on and the tags their plugin parked are let go - only the ones they parked. |
| `consentmanager-reject.js` | consentmanager.net: their `__cmp` answering a refusal across all eighteen commands, the IAB layer refused as cmpId 31 with `euconsent-v2` written, and their events fired where they fire them - `cmpEvent` at the window, their WordPress bridge at the document. One rule drops better than half a megabyte of delivery. |
| `consentmanager-reject-unblock.js` | consentmanager.net, for a site that withholds something until a purpose is on: the same stored and sent refusal, while the tags their blocker parked are let go by their own `data-cmp-src` contract. |
| `cookiez-reject.js` | Cookiez (WordPress): their own refusal in their own record - necessary true, the other four false - carrying the `cookiesHash` their gate checks, without which the record is thrown away and the banner returns. Their WordPress Consent API and Google consent mode bridges go with it; nothing is posted to their REST route. |
| `cookiez-reject-unblock.js` | Cookiez, for a site that withholds something until a category is on: the same stored refusal, and the scripts their blocker parked freed by their own selector - including leaving `data-cc-mode="always"` nodes parked, which is their never-free marker. |
| `ampconsent-reject.js` | AMP's own `amp-consent` extension: their refusal (`REJECTED`) in their own store, `amp-consent:<instanceId>` as `{"s":0}`, and every consent policy answered with their own `unblockOn` arithmetic - an element on the default policy stays blocked, one on `_till_responded` builds, because a refusal is a response. This one cannot be blocked instead: with no extension registered the AMP runtime never builds anything carrying `data-block-on-consent`. |
| `ampconsent-reject-unblock.js` | AMP `amp-consent`, for a page that withholds content behind the default policy: the same stored and reported refusal, with only the runtime's build gate answered yes. |
| `iubenda-reject.js` | iubenda's Cookie Solution: their own refusal in their own record - necessary true, functionality, experience, measurement and marketing false - under the cookie their configuration names, with their api answering, their callbacks fired in their own order, consent mode told denied through their own mapping and the IAB layer refusing as cmp 123 where their tenant switched it on. One rule drops a 4KB loader and the 450KB core behind it. |
| `iubenda-reject-unblock.js` | iubenda, for a site that withholds content: the same stored and sent refusal, while the page's own scripts are told every purpose is on and the tags their auto-blocker parked are freed by their own `_iub_cs_activate` and `data-suppressedsrc` markers. |
| `iubenda-accept.js` | iubenda, for when you actually mean it - which on their deployments is often the only way past the page, because theirs is frequently run as a consent wall and a wall answers to the record rather than to the tags. Grants every purpose, tells consent mode granted, and consents to their own vendor count in the IAB string. |
| `cookieconsent-reject.js` | CookieConsent v3 by Orest Bida (not Osano's old library of the same name): their own refusal in their own record - the read-only categories accepted, everything else refused, with the `consentId`, both timestamps and the revision their gate checks. Their whole API answers, their auto-clear deletes what a refused category names, and their `cc:onConsent` goes to the window as theirs does. |
| `cookieconsent-reject-unblock.js` | CookieConsent v3, for a site that withholds something: the same stored refusal, while the page is told every category is accepted and the tags their manager parked are freed by their own `data-category` / `data-src` / `data-type` contract. |
| `cookieconsent-accept.js` | CookieConsent v3, granting - every category their config names, their services with them, and the parked tags freed, which is what their accept-all does. |
| `cookielawinfo-reject.js` | The legacy Cookie Law Info plugin for WordPress (WebToffee's "GDPR Cookie Consent", not the hosted CookieYes script): their decline in their own `viewed_cookie_policy` cookie, their two globals put back because the page calls one from an inline script, and their server-rendered bar taken out - on 1.x the markup is printed by PHP and their own script is what hides it. The smallest resource here, and one rule by path covers every site that self-hosts it. |
| `osano-reject.js` | Osano: their own default state, which is already a refusal - `ESSENTIAL` accepted, `STORAGE`, `MARKETING`, `PERSONALIZATION` and `ANALYTICS` denied - stored where they store it, with `Osano.cm`, `__tcfapi`, `__gpp` and `__uspapi` answering. |
| `onetrust-reject-unblock.js` | Stores and sends the same refusal as reject - cookie, TCF and GPP all say no - while telling the page's own scripts every category is on, and letting every parked tag go. |

Pick `reject` as the default. `reject-unblock` is for a site that withholds the
content until you agree: it stores and sends the same refusal as `reject` - the
cookie, the TC string and the GPP string all say no - and separately tells the
page's own scripts that every category is on, because that is a variable on the
page rather than anything transmitted. It also un-parks every gated tag. Sites
gate their players on precisely that read:

```js
window.OptanonActiveGroups.includes('C0004')   // automobiles.honda.com
```

Un-parking is a pass that runs again, not once. A resource replacement runs
where the CMP's own script tag is, which is in `<head>`, and uBlock Origin runs
it at document_start - so every tag the page parked is still below it and does
not exist yet. The pass therefore runs at boot, on each batch of nodes the
parser delivers, at `DOMContentLoaded` and at `load`, and a pass after the
first that frees something says so:

```
[consent-rr] cookieyes-reject-unblock 1.1.0 freed=3 deferred
```

Un-parking a tag claims no consent and asks for nothing on its own: uBlock
Origin's own blocking still applies to whatever the freed tag then requests.

`accept` is for when you actually mean it: it grants consent in the cookie, to
every TCF vendor and in the GPP string as well.

[COMPARISON.md](COMPARISON.md) sets the three side by side, row by row, and then
every resource in the repo against each other - measured by running the built
files, not described.

## Install

1. **Resources.** uBlock Origin → *Settings* → *Advanced settings* →
   `userResourcesLocation`. Set it to whichever resource you want, or to both,
   whitespace-separated:

   ```
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/onetrust-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/onetrust-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/onetrust-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieinformation-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookielawinfo-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/inmobi-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/iubenda-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/iubenda-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/iubenda-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/osano-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/civic-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/civic-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookiebot-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieconsent-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieconsent-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieconsent-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/securiti-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/transcend-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/usercentrics-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/pubtech-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/termly-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/ketch-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/ketch-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/appconsent-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/appconsent-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookiescript-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/didomi-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/didomi-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/complianz-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/complianz-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/zdconsent-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/zdconsent-accept.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/fundingchoices-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/tarteaucitron-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/tarteaucitron-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieyes-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookieyes-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/consentmanager-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/consentmanager-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookiez-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/cookiez-reject-unblock.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/ampconsent-reject.js
   https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/ampconsent-reject-unblock.js
   ```

   Then reload the filter lists (*Filter lists* → *Purge all caches* →
   *Update now*).

   Pinned to a release: the URL never moves, and it changes with each one, which
   is what makes uBO refetch - it will not ask again for a URL it already has.
   Swap the tag for `main` to track every push instead.

   Every release is on npm as well, so the same files come off a CDN if you
   would rather not fetch from GitHub - same bytes, same pinning:

   ```
   https://cdn.jsdelivr.net/npm/consent-rr@1.45.0/dist/onetrust-reject.js
   https://unpkg.com/consent-rr@1.45.0/dist/onetrust-reject.js
   ```

   The package is `dist/` and `filters/` and nothing else; `npm i consent-rr`
   is for hosting the files yourself rather than for importing anything.

   Each file stands on its own: nothing else has to be loaded for it to work.
   Its first line, `/// onetrust-reject.js`, is the resource header uBO reads -
   and a comment to JavaScript, so the file is a readable script at the same
   time.
2. **Filters.** Paste [`filters/onetrust.txt`](filters/onetrust.txt),
   [`filters/cookieinformation.txt`](filters/cookieinformation.txt),
   [`filters/inmobi.txt`](filters/inmobi.txt),
   [`filters/osano.txt`](filters/osano.txt) and
   [`filters/civic.txt`](filters/civic.txt) and
   [`filters/cookiebot.txt`](filters/cookiebot.txt) and
   [`filters/securiti.txt`](filters/securiti.txt) and
   [`filters/transcend.txt`](filters/transcend.txt) and
   [`filters/usercentrics.txt`](filters/usercentrics.txt) and
   [`filters/pubtech.txt`](filters/pubtech.txt) and
   [`filters/termly.txt`](filters/termly.txt) and
   [`filters/ketch.txt`](filters/ketch.txt) and
   [`filters/appconsent.txt`](filters/appconsent.txt) and
   [`filters/cookiescript.txt`](filters/cookiescript.txt) and
   [`filters/didomi.txt`](filters/didomi.txt) and
   [`filters/complianz.txt`](filters/complianz.txt) and
   [`filters/zdconsent.txt`](filters/zdconsent.txt) and
   [`filters/fundingchoices.txt`](filters/fundingchoices.txt) and
   [`filters/tarteaucitron.txt`](filters/tarteaucitron.txt) and
   [`filters/cookieyes.txt`](filters/cookieyes.txt) and
   [`filters/consentmanager.txt`](filters/consentmanager.txt) and
   [`filters/cookiez.txt`](filters/cookiez.txt) into *My filters*, or
   host them and subscribe via *Import*.

Redirecting the SDK's own request is the usual way in, but where a tag manager
loads OneTrust there is no request to redirect - uBO's lists neuter
`googletagmanager.com/gtm.js`, so the container never runs and `otSDKStub.js` is
never asked for. The same resources inject as scriptlets, which also puts them
at `document_start`:

```
example.com##+js(onetrust-reject)
```

Written without `.js`: uBO appends that itself when resolving a scriptlet token,
so `+js(onetrust-reject.js)` looks for `onetrust-reject.js.js`, finds nothing and
injects nothing at all. Only `$redirect=` takes the full resource name.

Check it took: each resource announces itself on load, so the console on a
OneTrust site shows a line like

```
[consent-rr] onetrust-reject 1.6.0 groups=,C0001, tcf=refused gpp=refused
```

and `OneTrust.consentRR` reports the same mode and version.

uBlock Origin (the MV2 extension) only — uBO Lite cannot load user resources.

## What the stub actually does

The surface was read off OneTrust's own `otSDKStub.js` and `otBannerSdk.js`, so
page code cannot tell it apart from a return visit. No OneTrust code is
reproduced.

- `window.OnetrustActiveGroups` and `window.OptanonActiveGroups`, both as
  `,C0001,C0002,` — the SDK's exact format.
- `window.OneTrust` and `window.Optanon`, one object, assigned *over* anything
  the page preset there (a site can set `geolocationResponse` before load, and
  the real SDK keeps it).
- `OptanonConsent` and `OptanonAlertBoxClosed` cookies, with the fields the SDK
  writes, including `interactionCount=1` and `intType` (`1` is its
  "Banner - Allow All", `2` its "Banner - Reject All"). An existing `consentId`
  is reused so a site does not see a brand new visitor on every page load.
- `dataLayer` seeded or pushed with the SDK's own `OneTrustLoaded` /
  `OptanonLoaded` events, plus the `OneTrustGroupsUpdated` entry the banner half
  adds once consent is announced, so GTM triggers still fire.
- `InsertScript()` and `InsertHtml()` gated per category the way
  `canInsertForGroup()` is, so a strictly-necessary insert still goes in while
  everything else is refused, and `options.ignoreGroupCheck` still overrides.
- `window.OptanonWrapper()` called once, and kept looked-for a few seconds
  because pages often declare it after the SDK tag.
- `OneTrustGroupsUpdated` dispatched on `window` with the granted ids.
- Server-rendered banner markup (`#onetrust-consent-sdk` and friends) removed,
  as it arrives.
- The IAB **GPP** layer, the US counterpart, which `otSDKStub.js` installs
  itself: `window.__gpp` (`ping`, `addEventListener`, `removeEventListener`,
  `hasSection`, `getSection`, `getField`, plus the `queue` and `events`
  accessors), the `__gppLocator` frame and the `__gppCall` bridge. The section
  is `usnat`: refusing asserts the sale, sharing and targeted-advertising
  opt-outs, accepting declines them, and the Global Privacy Control bit carries
  the browser's own signal either way, since that is a fact about the request
  rather than part of the decision. `getGPPData` is refused, as it is not a
  command in GPP 1.1 and the reference implementation refuses it too.
- The IAB **TCF** layer the SDK installs when a tenant enables it: `window.__tcfapi`
  (`ping`, `getTCData`, `getInAppTCData`, `addEventListener`,
  `removeEventListener`), the `__tcfapiLocator` frame and the `postMessage`
  bridge framed vendors use, calls a page stub parked on `__tcfapi.a` answered,
  and the TC string stored in `eupubconsent-v2`.
- Both halves of the SDK's `substitutePlainTextScriptTags()`: a
  `script[type="text/plain"]` gated on a category is replaced by a live copy of
  itself, and a tag carrying `data-src` gets its `src` back. As in
  `reactivateTag()`, only the tag's own categories decide, never the mode - so a
  tag gated on nothing but `C0001` is revived by reject too, while one naming
  `C0004` as well stays parked. Categories are read from `optanon-category-*`
  and `ot-vscat-*` class names, including ids the site invented, and a
  `MutationObserver` keeps handling tags added later.
- Tags a site parked itself rather than letting `OtAutoBlock.js` do it: the
  categories in a `data-optanon-category` attribute, the source in `data-src` or
  base64 in `data-obfuscated-src`, which is moved across and decoded the way such
  a loader does it. Every category a tag names still has to be consented, as
  `canInsertForGroup()` requires - a site's own loader may only ask whether *any*
  of them is, but being that loose would load an advertising tag off the back of a
  consented necessary one.

### Deliberate gaps

- **The TC string follows the resource**, and its shape is copied from one a
  real OneTrust reject-all wrote: consents all zero, but vendor *legitimate
  interests* left intact, because refusing does not object to legitimate
  interest - that needs a separate action. Policy version 5, and timestamps
  rounded to midday UTC so the string is stable for a day rather than unique per
  page load. Vendor ids are handled as one range to 1500 instead of a bit each.
- **What varies per tenant is left alone rather than guessed.** Four sites
  sampled disagreed on the publisher country (DE, DE, US), on whether a refusal
  keeps legitimate interest at the purpose level (two of three did not), on how
  many vendors keep it (15, 22, 390) and on publisher restrictions (none, none,
  ten). So `publisherCC` is `AA`, the user-assigned code rather than a country;
  a refusal keeps legitimate interest for vendors but not for purposes, the
  majority shape; and no publisher restrictions are written.
  `vendorListVersion` is `178`, which every sample carried. Consent
  language is read off the page's `lang`. The string carries the publisher
  segment beside the core, as a real one does, and vendor ids run to 2000 - a
  real string reached 1650.
- Google's Additional Consent string is written as `2~~dv`, in the
  `OTAdditionalConsentString` cookie and as `addtlConsent` in the TCF answer:
  version, then an empty consented list, then an empty disclosed one. A real
  refusal consents to no AC vendor either - its long tail is a disclosure record,
  not consent. A real acceptance moves some 600 ids into the consented slot,
  which is Google's own global list rather than anything a replacement can
  derive, so neither resource claims them.
- **The IAB layer goes in whether or not the tenant had one.** Plenty of
  OneTrust tenants run with the IAB module off and write no `eupubconsent-v2` at
  all, and a replacement cannot tell which, since that lives in domain data it
  never fetches. So those pages get a CMP where they had none, and anything
  probing `window.__tcfapi` - Google's ad stack, mostly - starts taking TCF into
  account. On reject that is the conservative direction, non-personalised or
  limited ads; on accept it grants. It goes in unconditionally because the
  alternative fails worse: a site that gates its player on `__tcfapi` never
  starts without one, with no banner left to click.
- Category sets are tenant-specific - one site defines `C0001` to `C0004` plus an
  IAB stack group, another only `C0001`, `C0002` and `C0004` - so the cookie
  carries `C0001` to `C0005` plus whatever the page's own class names mention.
  Deliberately a superset: a site asking about a category its tenant never
  defined still gets an answer rather than nothing.
- Sites commonly keep their own record of the choice beside OneTrust's and
  re-prompt until it is set, so both resources set `localStorage`
  `cookieChoiceMade` to `true` - the `cookiechoices.js` convention, which
  OneTrust itself never touches. The key records that a choice was made, not
  which way it went. A site using some other key needs a per-site
  `set-local-storage-item` rule; `filters/onetrust.txt` shows the form.
- **`consent.onetrust` is never dispatched.** `OnConsentChanged()` registers a
  real listener, but consent never *changes* here — exactly like a return visit
  whose choice is already stored. A site that only initialises from that event
  will behave as it does for a returning visitor.
- **No claimed location.** `getGeolocationData()` answers empty rather than
  inventing a region for a site to branch on.
- Cookies are scoped to the registered domain, as the SDK scopes its own -
  found by probing, since a page has no public suffix list and a cookie set on
  one is refused. A host-only copy would not replace the SDK's, it would shadow
  it: two `OptanonConsent` cookies, and a site taking the first match reads
  whichever is older. Seen happening on a live site.
- **Their do-not-track flag is not reproduced.** Theirs reads it -
  `this.DNTEnabled = "yes" === navigator.doNotTrack || "1" === navigator.doNotTrack`
  - and gives a group the status `dnt` where the group's own `IsDntEnabled` is
  set, which their `checkIfGroupHasConsent` then treats as not consented. A
  refusal writes every group off anyway, so this only shows up in
  `onetrust-accept.js`, which grants a group their own code would have left
  alone. Which groups carry `IsDntEnabled` is tenant configuration that is not
  on the page, so nothing here can tell them apart; GPC is honoured instead
  because the flag is per-visitor rather than per-group.
- **A page whose CSP omits `data:` for scripts silently refuses a redirected
  resource.** User resources have no extension URL, so uBO serves them as a
  `data:` URI, and `script-src-elem`/`script-src`/`default-src` without `data:`
  blocks it. Nothing of ours runs: no console line, no cookie, no marker - and
  because the real SDK was replaced at the network layer, the banner is gone too,
  which makes it look like the resource worked. Seen on almbrand.dk, whose CSP
  allows `'self'` and named hosts only.

  The scriptlet form is not fetched, so it is not subject to that directive:

  ```
  ||policy.app.cookieinformation.com/uc.js$script,redirect=cookieinformation-reject.js,domain=example.com
  example.com##+js(cookieinformation-reject)
  ```

  The redirect keeps the real SDK out; the scriptlet supplies the stub. The tell
  is a CSP violation in the console naming a `data:` script, and
  `CookieInformation.consentRR` or `OneTrust.consentRR` being undefined.
- Trusted Types enforcement can likewise block tag revival.
- Accept mode revives advertising tags too, which is what accepting means. uBO
  still blocks the requests they make.

## InMobi Choice

Two files make up this CMP, and **the replacement goes on the second one**:

```
||cmp.inmobi.com/tcfv2/cmp2.js$script,redirect=inmobi-reject.js
```

`choice.js` is a per-site loader. It inserts `cmp2.js`, injects the banner's CSS,
and calls `__tcfapi('init', 2, fn, config)` with the tenant's entire
configuration inline. `cmp2.js` reads that config back out of the page's IAB
stub - `window.__tcfapi()` with no arguments returns the stub's queue, and the
argument list whose first entry is `init` carries it. So leaving `choice.js` alone
is what gets the tenant's own publisher country, consent language and
legitimate-interest purposes into the answer; replacing `choice.js` instead works
too, on defaults.

The stub then installs what `cmp2.js` installs: `window.__tcfapi` (the built-in
commands plus the custom ones the page itself calls, `init`, `getConfig` and the
`displayConsentUi` behind a privacy-settings button), `window.__gpp` with a
`tcfeuv2` section, `window.__uspapi`, `window.__tcfapiui`, both locator frames and
both `postMessage` bridges, and a `gtag` shim on `dataLayer` where the page has
none. Anything the page parked before the redirect landed is replayed. The TC
string goes into `euconsent-v2` and the GPP string into `IABGPP_HDR_GppString`,
with the attributes and the 390-day life `cmp2.js` uses - scoped to the hostname,
as its own writer scopes it, rather than to the registered domain.

Its refusal was measured against a real one on the same tenant, and differs in
three places, all documented in the source: a real refusal keeps legitimate
interest for 212 *named* vendors where this keeps it as one range (which 212 is a
fact about the vendor list, not about the page); it carries five publisher
restrictions and a disclosed-vendors segment listing 1015 vendors, neither of
which can be derived. Global Privacy Control withdraws legitimate interest
altogether, as it does for OneTrust. `addtl_consent` is deliberately not written:
with nothing consented to, `cmp2.js` deletes that cookie rather than writing one.
`__uspapi` answers `1---`, no notice and no opt-out applicable, because where in
the world the visitor is is not something a page can tell.

## Osano

The whole CMP is one per-tenant file, so there is one thing to replace:

```
||cmp.osano.com/*/osano.js$script,redirect=osano-reject.js
```

`window.Osano` is a function of their own making - `osano.js` installs
`Osano = Osano || function(){ Osano.data.push(arguments) }` so a page can call it
before the script lands, then drains that queue and replaces its `push` so later
calls are handled live. This does the same, with their own mapping:
`Osano("onConsentSaved", fn)` becomes the `osano-cm-consent-saved` listener, and
any other first argument sets a property on `Osano.cm`.

`Osano.cm` answers as it would on a return visit: `getConsent()`, the
`analytics` / `marketing` / `personalization` / `optOut` flags, `locale`,
`userData`, the event methods, and the show/hide methods as no-ops, because
nothing was rendered to show. The record goes into `osano_consentmanager` and
`osano_consentmanager_uuid` - in localStorage *and* a cookie, as theirs does,
scoped to the registered domain for a year - and `osano_consentmanager_expdate`
is cleared, which is what their own save does. An id and timestamp already
stored are kept, so a site does not see a decision made afresh on every load.
Google consent mode gets their signal map, with `ad_storage`, `ad_user_data`,
`ad_personalization`, `analytics_storage` and `personalization_storage` denied
and the two `ESSENTIAL` ones granted.

### The IAB layers

How much Osano installs depends on the tenant, and the tail of its bundle says
which: `C({usp: ...})` for a tenant with the IAB module off, or
`C({gpp: ..., tcf: ..., usp: ...})` for one with it on. All three go in here,
because that switch lives in configuration a page cannot be asked, and a vendor
stalled on an API that never answers is the worse failure.

`__tcfapi` carries their own values - cmpId 279, cmpVersion 3332, policy version
5, GVL fallback 187 - and their own default IAB state: no purpose consents,
legitimate interest for purposes 2, 7, 8, 9, 10 and 11, and **no vendors at
all**, which is where this differs from the OneTrust and InMobi resources, both
of which grant vendors a range. Their command set is `setGdprApplies`, `ping`,
`getTCData`, `addEventListener` and `removeEventListener` - no `getInAppTCData`,
no `getVendorList` - and that is the set answered. The string carries the core
segment alone, as their field sequence does, with timestamps at UTC midnight.

`__gpp` reports the two sections it can build, `tcfeuv2` (2) and `uspv1` (6),
under the `DBACNYA` header; their Canadian section is left out rather than
invented. Their own passthrough works too: `__gpp("uspv1.getUSPData", fn)` is
routed to that section's API. `__uspapi` answers `1---`, or `1-Y-` where the
browser sends Global Privacy Control - which is also the one input their code
turns into a CCPA opt-out by itself, so `OPT_OUT` follows it, and here it
withdraws legitimate interest as well.

### Deliberate gaps

- **Nothing is un-blocked, because nothing was blocked.** Osano holds tags back
  by patching the DOM at runtime - `createElement`, `setAttribute`, the `src`
  setters, `document.cookie` - rather than by parking them in the markup the way
  OneTrust and Cookie Information do. With the CMP replaced, a tag it would have
  held back simply runs, and uBlock Origin blocks what it makes of it at the
  network layer. Re-implementing that interception would mean shipping a second
  content blocker inside a consent stub.
- **The record is plain JSON where theirs is encrypted.** Their own reader tries
  `JSON.parse` first and only then decrypts, so what this writes is what
  `osano.js` itself would read back if it ever loaded - it would honour the
  refusal rather than re-prompt. The cookie copy is percent-encoded, unlike
  theirs: an unencoded quote or comma in a `Cookie` header is what a strict
  server-side parser refuses, taking the rest of the header with it. localStorage,
  which their reader consults first, carries it verbatim.
- **Two departures inside the IAB layer.** Their publisher country falls back to
  `US` where the location lookup has not answered; this writes `AA`, the
  user-assigned code, because `US` names a country a page cannot know. And
  Global Privacy Control withdraws legitimate interest here, as it does in the
  other resources - their own default keeps it either way, but that signal is
  the objection a plain refusal is not.
- **Tenant data is left empty rather than invented**: `jurisdiction` and
  `countryCode` come from a location lookup, `revision`, `cmpContentHash` and
  `publishTimestamp` from the tenant's own configuration. `gdprApplies` answers
  `true`, the protective answer where it cannot be known.
## Civic Cookie Control

```
||cc.cdn.civiccomputing.com/9/cookieControl-9*.js$script,redirect=civic-reject.js
```

The page drives this one. It loads the script and then calls
`CookieControl.load({...})` with its whole configuration inline - the categories,
their `onAccept` and `onRevoke` callbacks, the cookie settings, and whether the
IAB module is on - so everything the stub answers with is the site's own, and
none of it has to be guessed at.

`CookieControl` is in place before that call and carries their method set:
`load`, `update`, `config`, `info`, `getCategoryConsent`, `changeCategory`,
`toggleCategory`, `open`, `hide`, `notify`, `acceptAll`, `rejectAll`, the
`getCookie` / `getAllCookies` / `saveCookie` / `delete` helpers, `geoInfo` and
`geoTest`. The decision goes into their `CookieControl` cookie as URL-encoded
JSON - `necessaryCookies`, `optionalCookies` keyed by their own
`_validCookieName` (the name with separators stripped, so `marketing (social)`
becomes `marketingsocial`), `statement`, `consentDate`, `consentExpiry`,
`interactedWith` and `user` - scoped to the registered domain, `SameSite=Lax`,
for the site's `consentCookieExpiry` or 90 days. An existing record's `user` and
`consentDate` are kept, so a site does not see a decision made afresh each load.

`interactedWith: true` is what does the work: their `finaliseSetup` only builds a
notification when it is false.

One difference from what their own script writes, and it is deliberate: a real
refusal leaves `optionalCookies` **empty**, where this names every category as
`revoked`. Their code accepts anything that is *not* revoked - a `ccpa`-mode site
does that to every category on load, and a `gdpr`-mode one to any category whose
`lawfulBasis` is legitimate interest - so an empty map hands those straight back.
Everything else matches field for field, down to the uuid shape.

The record goes in as **plain JSON, not percent-encoded** - their `saveConsent`
passes `configuration.encodeCookie` as the encode flag and it is false by
default. That is not a detail: sites read this cookie back with their own
helpers, and those do not decode. Goldsmiths runs `JSON.parse` straight over the
raw value and asks whether a category is accepted, so an encoded record throws
there and the site concludes nothing was consented to - which is exactly what an
earlier version of this resource caused. Where a site sets `encodeCookie`,
theirs encodes and so does this. (Osano's cookie is the other way round: theirs
is encrypted, so the plain JSON written there is percent-encoded to keep a
`Cookie` header well formed. The rule is the CMP's own format, not a preference.)

### The IAB layer

Unlike the other consent managers here, this one needs no guessing: the IAB
module is a paid option and the page declares it as `iabCMP: true`. With it off
their script installs no `__tcfapi` at all, and neither does this. With it on,
`__tcfapi` goes in with cmpId 259 and cmpVersion 9, their `update` / `ping` /
`getTCData` / `addEventListener` / `removeEventListener` set, the
`__tcfapiLocator` frame and the `postMessage` bridge - and the TC string goes
where theirs goes, into `iabConsent` inside the same cookie, which their reader
takes verbatim when no compressed `addtlConsent` sits beside it. The separate
`CookieControlTC` cookie follows `setCookieControlTC`, as theirs does.

A refusal here turns **legitimate interest off as well**, which is where this
differs from the OneTrust and InMobi resources: their `_defaultStore` has every
purpose consent and legitimate interest false, and their reject-all leaves them
that way.

### Sites that withhold content

Refusing is the point, but a site may gate its videos, maps or embeds on one of
its own categories and show a placeholder until that category's `onAccept` has
run. Goldsmiths does exactly that, from the configuration on its own page:

```js
{ name: "embedded", label: "Embedded content", …
  onAccept: function() {
      dataLayer.push({ civic_cookies_embedded: "consent_given", … });
      document.dispatchEvent(new Event("embeddedConsentGiven"));   // the page listens for this
  } }
```

The category is the site's own, so no resource can know its name. Name it in
the filter instead, alongside the redirect:

```
gold.ac.uk##+js(civic-reject, embedded)
```

That category is then recorded as `accepted`, its `onAccept` runs, and anything
parked for it with `data-cc-category` gets its `data-src` back - their own accept
path, for that one category. Everything else stays refused. Up to three names,
and `*` for all of them; the console line prints the names a site uses.

Both lines are needed: the scriptlet supplies the stub with its argument at
`document_start`, and the redirect keeps the real script from replacing it.

Arguments only reach the scriptlet form - a `$redirect=` takes none. Where one
line is wanted instead, `civic-reject-unblock.js` decides for itself:

```
||cc.cdn.civiccomputing.com/9/cookieControl-9*.js$script,redirect=civic-reject-unblock.js:10,domain=example.com
```

The `:10` raises its priority above the plain `civic-reject.js` rule, which
matches the same request.

It accepts the categories whose name and label do not read as tracking, and
refuses the ones that do - `analyt`, `statistic`, `performance`, `advertis`,
`marketing`, `targeting`, `tracking`, `remarket`, `personali[sz]`. On
Goldsmiths that is `embedded` accepted, `analytics` and `advertising` refused,
so the videos play while the two `gtag("consent", "update", …)` calls their
other categories make are never run.

**This is the one thing in the repo that is guessed at rather than read off
somebody's code**, so the console line prints both lists:

```
[consent-rr] civic-reject-unblock 1.4.0 mode=gdpr revoked=analytics,advertising accepted=embedded iab=off cookie=written
```

Plenty of sites park their embeds under a category called `marketing`, where
that guess refuses the thing you wanted. Name it instead - an argument overrules
the guess, in either direction. Either way the IAB layer still refuses:
unblocking a site's own content is no reason to consent for a vendor list.

### Deliberate gaps

- **Nothing is freed and nothing is deleted.** A tag parked for a category
  carries `data-cc-category` and `data-src`, and their script frees it by copying
  `data-src` into `src` when that category is accepted. None is, so parked tags
  stay parked. Their `deleteAll` - which removes every cookie outside the
  consented set on each load - answers `false` here: that is the blocking half
  of this CMP, uBlock Origin is doing it, and deleting a visitor's cookies is not
  a consent stub's to do.
- **The category callbacks are not called.** Their own load calls `onAccept`
  only for accepted categories, and `onRevoke` only when somebody changes one.
  Nothing is accepted and nobody changed anything, so neither fires. `onLoad`
  does, a second later, as theirs does.
- **The decision cannot be changed from the page.** `changeCategory`,
  `toggleCategory`, `acceptAll` and `rejectAll` answer without doing anything -
  theirs re-render a panel that was never built. A site whose own preferences
  page is built on those calls will find them inert, so a category that has to
  be on is named in the filter instead.
- **`tcfPolicyVersion` is answered as 4 while the string carries 5.** That is
  their inconsistency - their API hardcodes 4, their encoder takes 5 from the
  vendor list they fetch - kept rather than tidied up, so a vendor branching on
  either gets what their script would have given it.
- **No API key check, and no claimed location.** Theirs will not start without
  validating the key against `apikeys.civiccomputing.com`, which also returns
  the visitor's country. `geo` is `null` and `geoInfo()` answers `false`.
- **Version 9 only.** Version 8 is a different, much smaller build and the
  filter deliberately does not match it.

## Cookiebot

```
||consent.cookiebot.com/uc.js$script,redirect=cookiebot-reject.js
||consent.cookiebot.eu/uc.js$script,redirect=cookiebot-reject.js
```

`uc.js` is the engine - it defines the API, blocks the tags, writes the cookie
and fires the events. `cc.js` beside it is the dialog and the site's own
configuration, and is never asked for once `uc.js` is replaced.

`window.CookieConsent` and `window.Cookiebot` are one object, as theirs are, and
it carries their default state, which is already a refusal: `necessary` true,
`preferences`, `statistics` and `marketing` false, `consented` false, `declined`
true, and **`hasResponse` true**, which is what stops their banner being built.
The site's configuration is read off their own script tag - `data-cbid`,
`data-framework`, `data-user-country` - so `Cookiebot.serial` answers with the
site's id rather than an empty string.

The cookie is written the way theirs is, with the quotes and commas already
percent-escaped inside the value, which their own reader unescapes:

```
CookieConsent={stamp:%270%27%2Cnecessary:true%2Cpreferences:false%2Cstatistics:false%2Cmarketing:false%2Cmethod:%27explicit%27%2Cver:1%2Cutc:…}
```

Run through their own parser that yields `declined`. A `stamp` already issued is
kept; where there is none their placeholder `0` stands in, because the real one
is a hash their server issues and nothing here can compute it. The region is
named only where the site's tag says which it is.

Their events fire in their order - `CookiebotOnLoad`, then the declined half,
then `CookiebotOnTagsExecuted`, then `CookiebotOnConsentReady` a tick later -
each with its `CookieConsent…` twin and its `CookiebotCallback_…` global. The
consent-mode signals are theirs too, values and all: Google's seven keys with
`security_storage` granted and the rest denied, their developer id,
`ads_data_redaction`, Microsoft's `uetq` and Clarity.

### Deliberate gaps

- **A tag marked `necessary` runs; everything else stays parked.** Their own
  check tests a tag's categories against `preferences`, `statistics` and
  `marketing` only, so a tag naming none of those is freed - by this as by them.
  `script[type="text/plain"][data-cookieconsent]` and the `data-src` /
  `data-cookieblock-src` forms on `iframe`, `img`, `embed`, `video`, `audio`,
  `picture` and `source` are all handled, `ignore` is left alone, and the
  `cookieconsent-optin-…` classes go on either way.
- **No IAB TCF layer.** Where a site sets `data-framework` to one of the IAB
  values, `uc.js` installs the IAB stub and then loads a separate module that
  implements `__tcfapi`. That module is in neither file, so its identity cannot
  be read off anything and a TC string is not something to invent. Such a site
  is named on the console line - `iab=IAB` rather than `iab=off` - so it is
  visible rather than silent. Tell me if you hit one and it can be built from
  that site's own module.
- **The decision cannot be changed from the page.** `show`, `renew`, `withdraw`
  and `submitCustomConsent` answer without doing anything: theirs re-render a
  dialog that was never built.

## Securiti

```
||cdn-prod.securiti.ai/consent/cookie-consent-sdk-loader.js$script,redirect=securiti-reject.js
```

The loader is a bootstrapper: it asks `app.securiti.ai` where the visitor is,
decides whether TCF applies, and then fetches the SDK - 600 kB of it - with its
stylesheet, its utils and the site's configuration. Replacing the loader means
none of that is requested.

It parks five functions for the SDK to drain - `initCmp`,
`setConsentBannerParams`, `showConsentPreferencesPopup`, `overrideThemeMatching`
and `registerSrtiCookieSDKEvents` - and those answer here rather than queueing
for something that never arrives. `window.SecuritiSDK` carries their
`registerEvent` and `onReady`, and the events that describe a decision already
made - `onLoad`, `onReady`, `onConsentGiven` - are answered on registration,
because theirs fire them once the SDK is ready and this is ready as soon as it
exists. Their Google consent mode goes out denied, in their own key order, the
way gtag pushes it.

**The categories are the part no page can supply.** They live in the tenant's
configuration, fetched from their CDN by id, so a refusal cannot name them - and
does not have to. Every reader in their SDK asks whether a category's id is set
in the record's `consents` map, so a record whose map is empty refuses all of
them, whatever they turn out to be called:

```json
{"consents":{},"st":{},"gcm":{"…":"…","security_storage":"granted"},"ts":1790666096}
```

That goes in `__privaci_cookie_consents` with `__privaci_cookie_consent_uuid`
beside it, and `__privaci_cookie_no_action` - the marker that says nobody has
answered - is cleared. A visitor id and timestamp already stored are kept.

### Their auto-blocking script

A site may load a second, per-tenant file beside the loader:

```
cdn-app3.securiti.ai/consent/auto_blocking/<tenant>/<domain>.js
```

**Leave it alone.** It blocks tags by the site's own classification - moving
`src` to `data-src` and the type to `text/plain` - and releases a category when
the SDK calls `setConsentedCategories`. With the loader replaced that call never
comes, and its own rule is

```js
function O(e) {                                 // allow this resource?
    var t = n.concat(c.non_optout_categories);  // consented ids + Essential
    return t.length && e && e.length && t.some(t => -1 < e.indexOf(t));
}
```

so it reads the refusal this writes, releases nothing, and still lets essential
scripts run. That is the refusal enforced a second time by the site's own list,
at no cost - blocking or nooping that file makes things worse, not better.

One caveat: it reads the consent cookie when it loads, which can be before the
loader runs. A visitor who had previously accepted gets one more page load on
the old cookie before this takes over.

### Deliberate gaps

- **The category names are never known**, so anything a site drives off them -
  `onCategoryConsented`, a preference centre built from them - sees an empty
  map rather than a list of refusals. Nothing is granted either way.
- **No location is claimed.** `__isTcfEnabledForLocation` is `false` and
  `getUserLocationAndLanguage()` answers `null`; theirs come back from the
  lookup this never makes.
- **No IAB layer.** Where a tenant's location has TCF on, their loader also
  fetches `sdk-stub.js` and the SDK implements `__tcfapi`. None of that is put
  back, for the same reason as Cookiebot: the identity is not in any file
  served here, and a TC string is not something to invent.

## Transcend

```
||transcend-cdn.com/cm*/*/ui.js$script,redirect=transcend-reject.js
||transcend-cdn.com/cm*/*/uiV2.js$script,redirect=transcend-reject.js
||assets.mayoclinic.org/content/dam/cpm-transcend/ui.js$script,redirect=transcend-reject.js
```

**Replace the banner, not the engine.** Transcend ships in two halves, and the
page loads the engine first: `airgap.js` is the init script, and it carries the
tenant's whole configuration - the purposes, the cookie-to-purpose table, the
allowed hosts - and blocks requests and cookies itself, by consent. `ui.js` is
the banner, 390 kB of Preact, which airgap fetches only when it decides to
prompt.

So this stands in for `ui.js`: nothing is rendered, and the refusal is recorded
through airgap's own API, which leaves the engine in place as the thing
enforcing it.

```js
airgap.ready(ag => {
    const purposes = ag.getConsent().purposes;   // the tenant's own names
    …                                            // every one of them false
    ag.setConsent(null, refused, { confirmed: true, prompted: true, timestamp });
});
```

The purpose names never have to be known: `getConsent()` hands them over,
including their tri-state `"Auto"`, which becomes an explicit no. Eight tenants
sampled - Costco, Airtable, Mayo Clinic and five others - have between four and
seven purposes, and barely any two sets are the same; Airtable's include
`Marketing`, `Sales` and `EnrichmentConsent`, and others add `Video` or
`GcmAdvanced`. The resource was run against all eight and refuses every purpose
of each.

**How the decision is authorised** is their `requireAuth` option, and not one
of the eight sets it. So the auth is their own load branch:

```js
Bp = e => isTrusted(e) && e.type === "load" && e.timeStamp <= <init time>
```

a trusted `load` event, which every page fires - their path for a decision
nobody clicked. That is waited for rather than guessed at, and the refusal
lands on the current page. Where a tenant does set `requireAuth: "off"`, `null`
is proof enough and no waiting is needed; asking `loadOptions` first keeps their
own *Authorization proof is untrusted* out of the console everywhere else.

Because airgap only fetches `ui.js` when it wants to prompt, the timing works
out: a visitor with nothing recorded gets the prompt, which is this, which
records the refusal; a visitor who already has it recorded never triggers the
fetch, and there is nothing to do.

Two names and two paths, because their builds differ. An older one points at
one UI for the whole tenant, `ui: "/cm/<id>/ui.js"`; a newer one names it per
regime and under a different prefix - Airtable's is
`[{"url":"uiV2.js","kind":"ui"}]` served from `/cm-test/`. The engine and the
API are the same in both, so the resource is too; only the filename and the
path move, and a test checks the rules against a real url of each kind.

**And the bundle need not be on their CDN at all.** airgap takes the UI from
`loadOptions.ui`, so a tenant can point that anywhere: Mayo Clinic's airgap
config names the usual `/cm/<id>/ui.js`, yet the page overrides it and serves
the banner from `assets.mayoclinic.org`, which no `transcend-cdn.com` rule can
reach. That one is named above. For any other site that does the same, the
scriptlet form needs no url:

```
example.com##+js(transcend-reject)
```

It works in either position. Served in place of the banner it runs with airgap
already ready. Injected as a scriptlet it runs at `document_start`, before
`airgap.js` - the first script on the page - has executed, and installs their
own stub shape, `{ readyQueue, ready }`, which `airgap.js` spreads over its own
definition, so the callback queued there is one it drains.

### Deliberate gaps

- **Injected after the page has loaded**, that trusted event has been and gone,
  and the refusal goes to their `tcm` cookie instead - read on the next page
  rather than this one. The console line says which way it went:
  `via=setConsent`, `via=load` or `via=cookie`. That record is the one their own
  banner writes: a genuine cookie from Indiegogo, one of the eight, taken with
  none of this in play, carries the same fields with the same values for a full
  refusal - in the same key order, because both build it from that tenant's own
  purpose list - bar `updated`, which says the decision replaced an earlier one,
  is `false` for a first record, and which airgap coerces and reports rather
  than enforces. A test holds ours against it.
- **A site with a consent UI of its own** - Costco builds one on airgap rather
  than using `ui.js` - reads the same refusal, so it has nothing to prompt for,
  but it may ask before airgap has got as far as fetching `ui.js`. The scriptlet
  form records the refusal before anything renders; `filters/transcend.txt` has
  the lines.
- **`airgap.js` is deliberately left alone**, and a test asserts the filter list
  never names it. Replacing the engine would drop its blocking and mean
  reimplementing the API it exposes.

## Didomi

```
||sdk.privacy-center.org/*/loader.js$script,redirect=didomi-reject.js
||sdk.privacy-center.org/sdk/*/modern/sdk.*.js$script,redirect=noopjs
||sdk.privacy-center.org/sdk/*/modern/ui-web-*.js$script,redirect=noopjs
```

**The loader is the whole CMP.** Its first line sets
`window.didomiVendorListCore` - the IAB vendor list, inlined - and it carries
the tenant's configuration and fetches both the SDK and the UI bundle. Replace
it and neither of the others is asked for; the two `noopjs` rules are for a
tenant that references them directly.

Their record, from the function in their SDK that builds a fresh one:

```js
{ user_id, created, updated,
  vendors:     { enabled: [], disabled: [] },
  purposes:    { enabled: [], disabled: [] },
  vendors_li:  { enabled: [], disabled: [] },
  purposes_li: { enabled: [], disabled: [] },
  version: null }
```

base64 in a `didomi_token` cookie **and** in localStorage under the same name,
because their `setTokenToStorages` writes both. An empty `enabled` *is* the
refusal.

**Writing the record is not the end of their path**, which is the mistake this
repo has made before. After storing the token their own code emits, in order:

```
internal.consent.updated
internal.consent.changed
consent.changed   { consentToken, fromEUConsent, action }
```

and both of their queues have to be drained and then kept working -
`didomiOnReady` (plain functions) and `didomiEventListeners`
(`{ event, listener }`). A page that pushes to either after the SDK would have
loaded is a page still waiting, so each is replaced with a pushable that
answers immediately.

It also publishes `didomiState` and pushes it into the data layer with their
own twenty field names. `didomiPurposesConsent` is the one sites gate their
players on - the `OptanonActiveGroups` of this CMP.

**An accept resource is possible here, which is not true of every CMP.**
Didomi's purpose ids are a fixed vocabulary - `cookies`,
`create_ads_profile`, `select_personalized_ads`, `measure_ad_performance` and
the rest - rather than per-tenant strings, so granting them needs no knowledge
of the tenant. OneTrust's category ids have to be harvested from the page's
own parked nodes; these do not. A tenant's own additions are read from
`didomiConfig.app.customPurposes`, the only place they can be known from.

**No IAB TCF yet, and that is deliberate.** There is no `__tcfapi`, no
`euconsent-v2`, no `addtl_consent`, and `getUserStatus()` reports an empty
`consent_string`. A tenant whose tags wait on the TCF API rather than on
Didomi's own purpose read will still need an exception until `didomi-tcf.js`
lands. A TC string invented here would be read by every vendor on the page as
consent, which is worse than answering nothing - and onetrust, osano,
usercentrics and pubtech each grew their TCF module after the core had field
time.

## Usercentrics

```
||cmp.usercentrics.eu/ui/loader.js$script,redirect=usercentrics-reject.js
||app.usercentrics.eu/browser-ui/*/loader.js$script,redirect=usercentrics-reject.js
```

**Replace the CMP, not the blocker.** Usercentrics also ships in two halves,
and they come from different hosts: `loader.js` off
`web.<region>.cmp.usercentrics.eu` is the CMP, which reads its configuration
off its own script tag and fetches the SDK, a legislation-specific controller
and the banner - around 450 kB across four files. `uc-block.bundle.js` off
`privacy-proxy.usercentrics.eu` is the blocker, and it carries a list of some
111 providers with the patterns that match their scripts, iframes, images and
embeds.

What makes this work is where the blocker gets its answer. Not from the CMP -
out of storage:

```js
getCMPv3Settings() {                       // uc-block.bundle.js
    const i = JSON.parse(localStorage.getItem('ucData'));
    return i?.consent?.services ?? {};
}
```

and its own rule is that `disabledProviders` is every provider **not** in its
whitelist, where the whitelist holds the ids that have consent. So a service it
was never told about stays blocked, and a refusal does not have to name the
tenant's services to be complete. Their own deny-all record agrees: the
`ucString` a denied visitor carries decompresses to `"status":"ALL_DENIED"`
with `"serviceIds":[]`.

Booted against the real bundle, that leaves 89 script patterns and 86 iframe
patterns disabled, nothing whitelisted, and the record their blocker reads
written by this instead of by them.

**A returning visitor is the case an empty record cannot carry**, and it is
worth the extra work. The blocker builds its whitelist at construction from
whatever is already in storage, and its `setItem` hook only visits the ids
present in the value written over it - so an empty map says nothing about the
two services that visitor had accepted and they stay consented. The ids are in
that old record, so each one is named with `consent: false`, which is what
their own deny-all writes too. Both shapes are read: `ucData` for a v3 page and
`uc_settings`, their v2 key, because the blocker falls back to its v2 branch
whenever it cannot see a loader tag - which is what a scriptlet injection looks
like. No v2 record is invented where the page has none.

It works in either position. Served in place of `loader.js` it runs after the
blocker, and the write tells it. Injected as a scriptlet it runs first, and the
blocker reads the refusal at construction instead.

**Both generations are covered**, because they keep the record in different
places and both are still deployed. v3 is `web.<region>.cmp.usercentrics.eu`,
`ucData`, and `__ucCmp` with `UC_UI` beside it. v2 is
`app.usercentrics.eu/browser-ui/<version>/` - 3.108.0 and 3.64.0 sampled, and
their contract is the same bar one unused key - `uc_settings`
in the shape its own `mapSettings` builds, and `UC_UI` as the whole API, 31
methods of it, with no `__ucCmp` and no `UC_CMP_API_READY`:

```js
mapSettings(t, n) {                        // index.module.js, v2
    return { controllerId: t.controllerId, id: t.id, language: t.selectedLanguage,
             services: mapServices(n), version: t.version };
}
```

The generation is read off the script the page loads the CMP from, and the
record that generation's blocker reads is the one written - so a v2 page is not
handed a v3 API it would not otherwise have. Where there is no such script,
because this was injected rather than served, both records go in: the blocker
picks its branch off the DOM, and with no tag at all that is the v2 branch.
Booted against the real bundle on a v2 page, that is again nothing whitelisted
and 89 script patterns left disabled.

Their v2 gtag push is the same `window.dataLayer.push(arguments)`, and v2
touches no cookie at all - `document.cookie` appears nowhere in its 464 kB.

**A third flavour is a library rather than a loader.** Their browser-sdk -
`app.usercentrics.eu/browser-sdk/<version>/bundle.js`, 4.53.0 sampled - is UMD
with a global `UC_SDK` and no banner of its own: the site calls it and builds
its own UI. There is nothing to stand in for, so it is not replaced, and no
rule names it. What makes a refusal hold there is that it is recorded the way
their own code records one:

```js
setUserActionPerformed(t) {                // browser-sdk, and v2
    localStorage.setItem('uc_user_interaction', JSON.stringify(t));
    if (t) localStorage.setItem('uc_interaction_type', 'user');
}
fetchUserActionPerformed() { return 'true' === localStorage.getItem('uc_user_interaction'); }
```

so both of those go in beside the record. **Answered, not accepted**: the
record beside them consents to nothing, and the SDK reading it leaves the
visitor alone rather than prompting again. It keeps the same `uc_settings` that
v2 does, so the blocker needs nothing else. The scriptlet form is what to use
on such a site - `example.com##+js(usercentrics-reject)` - since there is no
CMP script to redirect.

Its settings and template fetches are left alone too
(`api.usercentrics.eu/settings/<id>/latest/<lang>.json` and
`aggregator.service.usercentrics.eu/aggregate/<lang>?templates=...`): a
replaced CMP never asks for either, and a running SDK fares worse with them
broken than answered. That aggregate url is also where the service ids come
from, and they are global template ids pinned per tenant -
`HkocEodjb7@52.11.43` is Google Analytics, `H1Vl5NidjWX@40.18.46` their own
CMP.

### The IAB layer

A TCF tenant's `__tcfapi` comes from the SDK a redirect keeps out, so a page
waiting on one would get nothing. It is answered, with a refusal:

```
cmpId=5 cmpVersion=3 policy=5 isServiceSpecific=true
purposeConsents=0 purposeLegitimateInterests=0
vendorConsents=0 vendorLegitimateInterests=0 specialFeatureOptins=0
```

decoded there by `@iabtcf/core` in the tests rather than by this repo's reading
of the spec. Every vector is empty because **that is their own deny-all**:
`denyAllDisclosed()` calls `unsetAllVendorConsents`,
`unsetAllVendorLegitimateInterests`, and then unsets purpose consents and
purpose legitimate interests too. InMobi's refusal keeps legitimate interest
because InMobi's own default does; this one objects because theirs does.

`gdprApplies` is the one field that is not a refusal but a claim about the law,
and it says GDPR applies - a vendor told otherwise may process with no consent
at all. A mutation flipping it survived the first pass of tests, which is why
it has an assertion of its own now.

**The identity is the part a replaced CMP cannot know.** It is per tenant:
`tcf2.cmpId` and `tcf2.cmpVersion` come back from their settings API, and the
two tenants sampled read `318`/`1` and `null`/`null`. So where the visitor
already carries a `uc_tcf` string, the identity is read back out of it - cmpId,
cmpVersion, list version, publisher country, scope - and reused exactly. Where
there is none, their own fallback is used, `cmpId = tcf2.cmpId || 5` and
`cmpVersion = tcf2.cmpVersion || 3`, and the console says `iab=refused/default`
rather than `iab=refused`.

**Whether a tenant is TCF at all cannot be read either** - it comes back as
`framework: "TCF2"` - so the layer goes in on evidence the page carries: a
`uc_tcf` record from a previous visit, the `__tcfapi` stub a TCF publisher puts
there, or a `__tcfapiLocator` frame. A tenant that is not TCF has none of them
and gets nothing added that their own CMP would not have had. Whatever the
page's stub had queued is answered on the way in, rather than left in a queue
nothing will read.

The record goes in their own `uc_tcf`, `{ acString, tcString, timestamp,
vendors }`, with the AC string left empty rather than invented: it lists
Google's additional-consent vendors, a refusal consents to none of them, and
their own resurface check reads an empty one as nothing to compare.

**GPP carries the same refusal**, as `DBABMA~<tc string>` - section 2,
`tcfeuv2`, whose payload is that string. `@iabgpp/cmpapi` decodes what this
builds and the test compares its parse field for field against what callers
are handed, so a drift in either shows up. `supportedAPIs` is theirs verbatim,
`["2:tcfeuv2","5:tcfcav1","6:uspv1"]`, even though only the first is carried,
and the identity is the one the TCF layer resolved, because their own
`CmpApi` is built from the same pair:

```js
this.cmpId = tcf2.cmpId || 5;            // browser-sdk
this.cmpVersion = tcf2.cmpVersion || 3;
this.gppApi = new CmpApi(this.cmpId, this.cmpVersion);
```

GPP is a setting of its own on their side, `gppEnabled`, so it does **not**
follow TCF: it goes in on its own evidence, a `__gpp` stub or a `__gppLocator`
frame, and a page with the TCF stub alone gets the TCF layer only. Where there
is GPP evidence but no TC string there is no section to carry, so their stub is
left exactly as it was rather than replaced by one answering with an empty
string. A queued call on their stub is answered on the way in, and the locator
frame their own API creates is created here too. `getGPPData` is refused,
because it is not a command in GPP 1.1 and the reference implementation refuses
it.

### Deliberate gaps

- **The service names are only known where the visitor had accepted**, since
  that is the only place they appear. A first visit writes an empty map, so a
  site driving a preference centre off `getServicesBaseInfo()` sees an empty
  list rather than a list of refusals. Nothing is granted either way.
- **No `ucString`.** That is their cross-domain record, lz-string-compressed,
  and it is what carries a decision to a sibling domain. It is not written:
  nothing on the page reads it once the CMP is replaced, and the sibling domain
  gets this resource too.
- **No US or Canadian GPP section.** Which one applies needs the jurisdiction
  their location lookup returns, and a replaced CMP never makes it. Section 2
  is carried, and `hasSection("usnat")` answers false rather than guessing.
- **The legacy CMP before v2 is not targeted.** The blocker still has a branch
  for it - `window.usercentrics.getConsents()`, off
  `usercentrics.eu/latest/main.js` - and nothing here answers that. v2 does not
  define `window.usercentrics` either, so this is the generation before it.
- **The legacy CMP before v2 cannot be reached at all.** Their blocker still
  has a branch for it - `window.usercentrics.getConsents()`, off
  `usercentrics.eu/latest/main.js` - but that script is gone: the url answers
  404 with their marketing page. On a site still carrying the tag the blocker
  takes that branch, finds no `window.usercentrics`, and whitelists nothing, so
  everything is blocked without this. What it also does is throw out of its own
  `setItem` hook, which is why writes here are retried once.
- **No cross-domain record.** Their `cross-domain-bridge.html`, an iframe on
  their own origin, is how a decision reaches a sibling domain, and v3's
  lz-string `ucString` is what it carries. Neither is written: nothing on the
  page reads them once the CMP is replaced, and the sibling domain gets this
  resource too.

## PubTech CMP

```
||cmp.pubtech.ai/*/pubtech-cmp-*.js$script,redirect=pubtech-reject.js
```

One file is the whole CMP - the TCF API, the banner, the vendor lists it goes
on to fetch - and the tenant's configuration is inlined at the top of that very
file as `window.__pub_tech_cmp_config`. So replacing it takes the configuration
with it, which decides what a refusal can state.

Five tenants were read - 312, 466, 121, 356 and 188 - across both builds they
ship, the module one and the classic `pubtech-cmp-v2.js`. They differ in
configuration and agree on the identity, so it is hard-coded: **cmpId 352,
cmpVersion 6, vendor list 178, policy version 5**. `@iabtcf/core` decodes the
string in the tests and every vector in it is empty.

What the configuration took with it is recovered from the visitor instead of
guessed:

| | theirs | without it |
| --- | --- | --- |
| `publisherCountryCode` | `IT` on both tenants | read back out of an existing TC string, else `AA` |
| `publisherCookieVersion` | `3`, `3`, `6`, `22`, `3` across the five | read back out of an existing pcstring, else `0`, which is their own fallback |

Their publisher-cookie string is their own codec - the version, a `-`, then one
character each for feature, user-experience and measurement cookies, with `1`
enabled and `0` disabled - so a full refusal is `<version>-000` and
`technicalCookies`, which has no character, stays on as their necessary
category. The TC string goes in `euconsent-v2` and the additional-consent
string in `ac_euconsent-v2`, left empty in both the cookie and localStorage
because it lists the Google vendors a visitor consented to and this one
consented to none.

**The part worth getting right is their consent queue.** A page registers
callbacks by pushing onto `__pub_tech_cmp_on_consent_queue`, and their drainer
calls each one, records the arguments, then **replaces `push`** so a callback
registered later fires at once with those same arguments:

```js
r[e].latestArgs = n;                       // their lt()
r[e].push = async function(cb) { cb(...r[e].latestArgs); Array.prototype.push.call(r[e], cb) };
```

Page code gated on consent is waiting on exactly that, so it is reproduced
rather than left hanging - both that queue and the `__pre` one - along with
their two GTM events.

### Deliberate gaps

- **No GPP.** Their bundle has no `__gpp` at all, so there is none to put back.
- **No publisher restrictions.** Their own string carries more here on a
  tenant with legitimate interest switched off, which is four of the five
  sampled: they unset the legitimate-interest vectors and then restrict
  purposes 2 and up to `REQUIRE_CONSENT`. This writes the empty vectors and
  not the restrictions - a vendor with neither consent nor legitimate interest
  has no basis either way, and a malformed restriction block would cost the
  whole string its parse. A test pins that choice.
- **Their module build is one of two.** `pubtech-cmp-v2-esm.js` is a module and
  `pubtech-cmp-v2.js` is not; tenant 188 serves the latter. A `data:` URI
  module script may be declined by the browser, and a user resource is served
  as one, so on a module tenant the scriptlet form is the reliable shape -
  `filters/pubtech.txt` says so. The classic build has no such question.
- **The asset host is left alone**: the vendor lists and the publisher-cookie
  declarations are fetched by the CMP this replaces, so nothing asks for them,
  and a rule for them would only break a banner on a page where their CMP is
  still running.

## Termly

```
||app.termly.io/resource-blocker/$script,redirect=termly-reject.js
```

One file is their whole CMP - the auto-blocker, the banner, the tenant
configuration and the visitor's geo, around 460 kB served per request, with the
website uuid in the path and the options in the query string (`autoBlock=on`,
and `masterConsentsOrigin` where a group of sites shares one consent). The rule
stops at the path so both forms match.

**The polarity was the thing to get right**, and their own constants read
backwards at first glance:

```js
OPT_IN:  { ...map(defaultValue=false), do_not_sell: false }   // essential only
OPT_OUT: { ...map(defaultValue=true),  do_not_sell: false }   // everything
map = ({defaultValue}) => values.map(c => [ c, c === ESSENTIAL || defaultValue ])
```

`consentAll()` sets **OPT_OUT**, and their `isAllDeclined()` is
`every(c => c === ESSENTIAL || !state[c])` - so `true` is consented, and their
`OPT_IN` is the refusal. That is what goes into
`localStorage.TERMLY_API_CACHE`, which is a namespaced cache,
`{ TERMLY_COOKIE_CONSENT: { createdAt, value } }`, merged rather than replaced
so the entries beside it and any `document_version_id` already recorded
survive. `do_not_sell` is set where theirs leaves it false: a visitor refusing
is refusing that too.

**Their parked tags stay parked, bar the ones they never block.** The
auto-blocker parks `[data-categories]` elements with the real url in `data-src`
or `data-href` and scripts typed `text/plain`; releasing one clones the node,
puts the url back, retypes the script `text/javascript` and replaces the
original. This releases the elements whose categories include `essential` -
their filter is `some()`, so a tag marked `essential,analytics` goes in on that
path too - which is exactly what their own code does where the CMP is off for a
region and the visitor sends GPC.

Google consent mode is derived rather than invented: their keys map to
categories (`ad_*` to advertising, `analytics_storage` to analytics,
`functionality_storage` and `personalization_storage` to performance,
`security_storage` to essential, `social_storage` and `unclassified_storage` to
their own), so this refusal produces their denied map exactly - everything
denied but `security_storage`. It goes out through their gtag, which is
`dataLayer.push(arguments)`, after their developer id and before the
`userPrefUpdate` and `Termly.consentSaveDone` events, and `window
.TERMLY_FORCE_DISABLE_GCM` is honoured.

### Deliberate gaps

- **No TC string.** A TCF tenant's `__tcfapi` comes from this same file, and
  where their CMP is off they leave behind a ping answering `cmpId 412`,
  `cmpVersion 1`, `cmpStatus "error"`, `cmpLoaded false` - preserving whatever
  `gdprApplies` the page's own stub had. That is what goes back, on evidence of
  a stub or a locator frame, rather than a string invented for a framework the
  tenant may not have enabled: a vendor reading an error has no consent to act
  on, which is the answer.
- **Their embed and documents are left alone** - `embed.min.js` and
  `/document/...` render a published policy or cookie list, which is content a
  visitor asked for rather than consent machinery.
- **GPC changes their side, not this one.** They read it: in a region where
  their CMP is disabled, a GPC visitor gets essentials released and denied
  consent-mode defaults, while one without gets everything released. This
  refuses either way.

## Ketch

```
||global.ketchcdn.com/web/v3/config/*/boot.js$script,redirect=ketch-reject.js
||cdn.ketchjs.com/ketchtag/*/ketch-sdk.js$script,redirect=noopjs
```

**Replace the loader and the rest never arrives.** `boot.js` inlines the
property's configuration and a country-to-jurisdiction table, puts their
command queue on the page, and then fetches the SDK - 1.9 MB of it - which goes
on to fetch `config.json`, a geo lookup and the vendor list. Replacing the
loader means none of that is requested, so the second rule above only matters
where a property names the SDK directly.

**Their queue is the contract worth reproducing**, because page code waits on
it:

```js
window.semaphore = window.semaphore || [];              // boot.js
window.ketch = function() { window.semaphore.push(arguments) };
window.semaphore.unshift(["init", config]);
```

Their SDK shifts that `init` entry off, drains whatever the page queued behind
it, then replaces `semaphore.push` with its own router and sets
`semaphore.ketch` and `semaphore.loaded`. All of that happens here too, with
the router answering a refusal - including their argument convention, where
trailing functions are the resolve and reject callbacks, so
`ketch("getConsent", fn)` works. The command names are theirs, read off that
router: `showConsent` and `showPreferences` rather than the longer spellings
their SDK object uses, and no `emit` or `once`, which it does not route. Each
answer is built fresh per call, because a page that mutated the object it was
handed would otherwise be mutating what every later caller reads. `getConsent()` answers the shape their own
`retrieveConsent()` returns when nothing is recorded:

```js
{ purposes: {}, vendors: [], googleVendors: [], vendorConsents: { tcf: {}, google: {} } }
```

**The purpose codes are what a replaced loader cannot know** - they arrive in
the `config.json` the SDK fetches. So the refusal is expressed where it does
not need them: the API answers nothing consented, and Google consent mode goes
out denied with their two data-layer events, `ketchPermitChanged` and
`switchbitPermitChanged`. The public record, `_ketch_consent_v1_` - base64 JSON
of `{ <code>: { status, canonicalPurposes } }`, in localStorage and a cookie -
is rewritten only where the visitor already has one, with every status flipped
to `denied` and their canonical purposes kept, since that record is the only
place those are visible. On a first visit nothing is written, which is their own
behaviour: `setPublicConsent()` returns without writing when the map comes out
empty.

### For a site that withholds content

```
||global.ketchcdn.com/web/v3/config/*/boot.js$script,redirect=ketch-reject-unblock.js:10,domain=realtruck.com
```

`ketch-reject-unblock.js` is **reject's record with accept's page surface**,
the same trade as OneTrust's and Civic's: what is stored and what is sent are
the refusal, field for field, while the API tells the page every purpose is
consented so the content is released. The cost is precisely that - whatever the
site had withheld now runs, and uBlock Origin is what filters its requests.

The site's own gate decides what has to be answered, and theirs reads a single
purpose code:

```js
window.ketch("on", "consent", e => { hasConsent = e?.purposes?.optional || false })
window.ketch("on", "userConsentUpdated", e => { c && !e?.purposes?.optional && location.reload() })
```

Two things follow. The code is the property's own, so the answer cannot be a
list of names prepared in advance - it answers **by key**, and a purpose it has
never heard of reads as consented, while only the codes it actually knows stay
enumerable so stringifying the answer invents nothing. And `userConsentUpdated`
is never emitted: that second listener reloads the page when an update says the
purpose is off, which would be a reload for every page view. A test holds both
modes to firing `consent` once and that event never.

A code that is asked for is remembered, so a site that reads one and then
iterates - or spreads, or stringifies - finds it there rather than an empty
map. Before anything asks, the enumerable codes are only the ones the visitor's
own record carried; nothing is invented.

The names that are not purposes read through to the object underneath rather
than answering true: `then`, because a truthy one makes an awaited answer hang,
`toJSON`, because it would break stringifying, the object's own methods, and
`__proto__`, which would otherwise hand back a boolean where a prototype
belongs. The same test governs `in`, so a caller checking for `Symbol.iterator`
is told no rather than being sent down an iterate path that throws.

### Deliberate gaps

- **No IAB layer.** Their SDK carries `__tcfapi`, `__gpp` and `__uspapi`, each
  switched on by a plugin in the property configuration that a replaced loader
  never sees, and the identity those strings need comes with it. Nothing is put
  back; a page waiting on one gets nothing rather than an invented string.
- **A property that loads the SDK without the loader** gets no stub from the
  redirect, since there is no `boot.js` request to replace. The scriptlet form
  covers it, and `filters/ketch.txt` says so.
- **GPC changes their side, not this one.** They read it strictly -
  `navigator.globalPrivacyControl === true` **and** a `gpcsignal` cookie - and
  then only in a jurisdiction their `gpc` plugin lists, where it maps to a set
  of purposes to deny. This refuses with or without any of that.

## AppConsent

```
||cdn.appconsent.io/tcf2-clear/*/core.bundle.js$script,redirect=appconsent-reject.js
||cdn.appconsent.io/tcf2-clear/*/*.bundle.js$script,redirect=noopjs
```

Their core bundle is the whole CMP - the TCF API with the IAB's own `cmpapi`
embedded, their state, and the loader for the banner chunks it fetches
afterwards. Replacing the core means those chunks are never asked for; the
second rule only matters where something else requests one.

The identity comes from their own TC model builder, which hard-codes it:

```js
n.cmpId = 2;                               // core.bundle.js, twice
n.publisherCountryCode = "FR";
n.lastUpdated = new Date(t.setUTCHours(0, 0, 0, 0));   // midnight UTC
n.setAllVendorsDisclosed();
```

so every string carries `cmpId 2`, policy version 5, and every vendor as
disclosed - up to the **4000** their own vendor cap falls back to. `cmpVersion`
and the publisher country come back with a configuration a replaced bundle
never fetches, so both are read out of a string the visitor already carries
where there is one, and otherwise default to theirs (33, matching the bundle
series, and `FR`).

Beside `__tcfapi` they keep the standard **`IABTCF_` keys** in localStorage -
seventeen of them - each a string of `0` and `1`, one character per id, built
by their `lt(set, length)`. Those are written here the same way, which is what
a vendor or an in-app bridge reads when it does not ask the API.

Their global answers under **their manager's own method names** - `init`,
`startCMP`, `initIAB`, `setConfiguration`, `update`, `updateExtraPurpose`,
`show`, `noShow`, `presentNotice`, `retryShow`, `accept`, `deny`, `fakedeny`,
`setExternalIds`, `getExternalIds`, `getUuid`, `isFloatingNeedUpdate`,
`extraFloatingAllowed` - and the ones that would render, record or re-ask
resolve without doing any of it.

### Granting, for a wall that charges for a refusal

```
||cdn.appconsent.io/tcf2-clear/*/core.bundle.js$script,redirect=appconsent-accept.js:10,domain=example.com
```

`appconsent-accept.js` is the same resource one line apart, and it **grants**:
every purpose, every legitimate interest, both special features, every vendor
to 4000, and the publisher purposes - in the string and in their keys. It is
for a consent-or-pay wall, where refusing is what keeps the page shut.

The trade is real and worth stating plainly: **a vendor handed that string is
entitled to act on it**, exactly as with `onetrust-accept.js`. What makes it
worth having is that uBlock Origin still filters what those vendors request -
the string says yes, the network says no. Use it per site, never globally.

### Deliberate gaps

- **No GPP and no US privacy string.** Neither appears anywhere in their
  bundle, so there is none to put back.
- **Their state is restamped, never invented.** A real
  `localStorage.appconsent`, captured from a site after accepting, reads
  `{ consents: { consentables: [ { id, iab_id, name, vendors_number, status,
  legintStatus, type } ], vendors: [...] } }`, with their own enum - `ALLOWED
  1`, `PENDING 0`, `DISALLOWED -1` - and a validator in the bundle insisting a
  status is one of those three. Its `type` takes four values, and a real
  accepted state carries all of them: `0` purpose, `1` feature, `2` special
  feature, `3` special purpose.

  Where a visitor already has that state, every consentable and vendor in it
  takes the mode's status, and their names, counts and a vendor's declared id
  lists are left as they are.

  `legintStatus` needs more care, because `-1` means two different things
  depending on the record it is in - *not applicable* in an accepted one,
  *refused* in a refused one - so granting from a refusal cannot tell from the
  field alone which entries could carry a legitimate interest. For purposes it
  does not need to: which of them may be taken on legitimate interest is TCF
  policy rather than a tenant's data, and it is `2, 7, 8, 9, 10, 11` - exactly
  where a real accepted record carries a yes. Everything else keeps what it
  had.

  Measured against both of their real records: granting from their accepted one
  reproduces it field for field, and refusing from it reproduces their
  continue-without-accepting record - the one that forwards to the wall -
  field for field. Granting from *that* record matches on every status and
  every purpose, and leaves three non-purpose flags at `-1` that their own
  accept sets: feature 2, special purpose 2 and special feature 2. Their basis
  for granting those is not visible outside that record - TCF gives a feature
  no legitimate interest at all - so this does not invent one. A test pins all
  three facts.

  Where there is no state, the key is untouched: the list comes back with the
  configuration this never fetches. An earlier pass also wrote `hasConsent` and
  `consentedAll` there - neither appears anywhere in their bundle.
- **GPC and DNT are not read**, because they do not read them either: neither
  `globalPrivacyControl` nor `doNotTrack` appears in their bundle.

## CookieScript

```
||cdn.cookie-script.com/s/*.js$script,redirect=cookiescript-reject.js
||cdn.cookie-script.com/iabtcf/*/sdk_cmp.js$script,redirect=noopjs
```

One per-site bundle is the whole CMP - banner, auto-blocker, the tenant's
configuration, and the loader for their IAB SDK - with a hash of that
configuration in the path. Replacing it keeps the SDK and its vendor lists
from being asked for at all.

Their record is a cookie, `CookieScriptConsent`, written field by field by
their own `a(name, value)` and read back as plain JSON. A reject-all writes:

```json
{ "action": "reject", "categories": "[]" }
```

with `categories` a JSON string inside the record rather than an array, which
is their shape rather than a convenience here. Their `key`, which comes back
from their own collector, and their `consenttime`, which is configuration, are
left exactly as they were - nothing here talks to that collector. Ninety days,
on `window.location.host` with a leading `www.` dropped, both theirs.

**Their parked tags stay parked, bar the category they never block.** The
auto-blocker parks `[data-cookiescript="accepted"]` elements with the url in
`data-src` and scripts typed `text/plain`. The subtlety is the filter: theirs
frees an element only when **every** category on it is allowed - it strips the
allowed names out of `data-cookiecategory` and skips whatever is left - so a
tag marked `"strict targeting"` stays parked where a tag marked `"strict"`
goes in. A test pins that distinction, and a mutation turning it into *any*
category is caught.

Their two data-layer events go out, `CookieScriptConsentUpdated[strict]` and
`CookieScriptGoogleConsentUpdated`, and their consent mode is denied through
the page's own `gtag` - where there is none, the console says `gcm=nogtag`
rather than inventing one.

**The window events are their reject-all path, in their order.** Theirs is:

```js
Kt = function() { instance.onReject(); dispatch('CookieScriptReject');
                  dispatch('CookieScriptCurrentState', instance.currentState()); ... }
```

so `CookieScriptLoaded` goes out at once, and then the page's `onReject`
callback, `CookieScriptReject` and `CookieScriptCurrentState` - a tick later,
because a page assigns `CookieScript.instance.onReject` in the script *after*
theirs, which has not run when this does. `CookieScriptAcceptAll` is their
accept-all event and is not fired: an earlier pass of this resource did fire
it, which is page code being told the opposite of what was recorded.

### Deliberate gaps

- **No IAB layer.** Their TCF SDK is a separate file, fetched only for a TCF
  tenant, and the identity it needs is `cmpId 374` - which `getCMPId()`
  answers here - but the vendor list it would encode against comes with the
  configuration this replaces. The TC string lives in
  `localStorage.CookieScriptConsentString`, and their own banner text says the
  TCF signal is read only when the `CookieScriptConsent` cookie is present: so
  the cookie is what this writes, and the string is left alone.
- **Nothing is reported to their collector.** Their bundle reads
  `navigator.doNotTrack` for exactly one purpose, to put `&dnt=` on a request
  to `consent.cookie-script.com/collect` along with the consent text. No
  request is made here, with or without the signal, and a test pins that the
  refusal is the same either way.

## Complianz

```
/wp-content/plugins/*/complianz.min.js$script,redirect=complianz-reject.js
```

**Complianz is a WordPress plugin, so it is served first-party from the site's
own path.** There is no vendor host to match, and the plugin directory is not
one name but several - `complianz-gdpr`, `complianz-gdpr-premium`, and themes
that vendor the banner under their own name. The rule matches the *file* under
any plugins path, which is what keeps working when the next theme does the same
thing.

**Nothing in their record can be hardcoded.** Every cookie name is
`complianz.prefix + name`, and the prefix, the expiry, the policy id, the
consent type, the region and the cookie domain and path all come from a
`complianz` object the page declares before their script would have run. The
resource reads that object and uses their defaults only where it is silent.

Three of their behaviours the resource has to follow rather than approximate:

- **An empty cookie can mean yes.** Their `cmplz_has_consent` treats an absent
  record as consent where `complianz.consenttype` is `optout` or `other`, so a
  refusal writes `deny` explicitly. Writing nothing would consent on exactly
  the sites that assume consent.
- **The policy id is part of the record.** Their
  `cmplz_check_cookie_policy_id` compares the stored id against
  `complianz.current_policy_id` and, on a mismatch, calls `cmplz_deny_all()`,
  clears every `cmplz` cookie and shows the banner again. A record without the
  current id is wiped on the next page.
- **Their decision dispatches per category.** `cmplz_set_consent` ends in a
  `cmplz_status_change` CustomEvent carrying `{ category, value, region,
  categories }`, once per category, and both page code and their tag-manager
  bridge listen for it.

Their four categories are fixed - `functional`, `preferences`, `statistics`,
`marketing` - and `functional` is always consented, because their own
`cmplz_has_consent` returns true for it unconditionally.

**The accept resource revives the tags their blocker parked.** Complianz
rewrites a blocked element's `src` to `data-src-cmplz` and leaves a
`.cmplz-blocked-content-notice` over it; accept walks those back for LINK, IMG,
IFRAME and SCRIPT using their own attribute names, marks each `cmplz-activated`
and removes the notice. A reject leaves all of it exactly as it is, which is
the blocking the plugin is for.

Also bridged: **the WordPress Consent API**. Where the site has
`wp_set_consent`, theirs calls it per category, so this does too rather than
inventing a shape.

Their do-not-track handling is left alone. `cmplz_do_not_track()` reads
`navigator.globalPrivacyControl` and `navigator.doNotTrack`, and a visitor who
set either has already said something this should not talk over.

Deliberately left alone as well: their `/wp-json/complianz/` REST routes, which
only the banner script calls, and `complianz-gpc.min.js`, their Global Privacy
Control helper, which is on the visitor's side.

## Ziff Davis zdconsent

```
||cdn.ziffstatic.com/jst/zdconsent*.js$script,redirect=zdconsent-reject.js
```

Ziff Davis's own consent layer - mashable.com, speedtest.net, askmen.com,
pcmag.com and the rest of the group.

**It is a OneTrust front end**, which is why this is the first resource here
built out of another one. Their script's first act is to inject OneTrust's
`otSDKStub.js`, and the function that decides what is consented reads
OneTrust's own record - the `OptanonConsent` cookie's groups, or
`window.OnetrustActiveGroups` - over the top of its own defaults. So the
resource is the OneTrust layer plus theirs, and both records are written: a
page reading `OptanonActiveGroups` and a page reading `zdconsent.optins` are
told the same thing. With their script replaced, `cdn.cookielaw.org` is never
asked for anything. Each layer says its own console line.

**Two files, one difference.** `zdconsent_eu.js` is byte-identical to
`zdconsent.js` but for two booleans - `gdprApplies` and `optinApplies` - baked
true, and the site decides which one a visitor is served. One wildcard covers
both, and the resource reads back which it was: uBO redirects the request, so
the script element keeps its original `src`. Their own `geoCC`/`geoRC` cookies,
`window.OOKLA` on speedtest.net, and their `?zdconsent2=EU` override all refine
it afterwards, exactly as their own geo code does.

**The queues are the point.** A page pushes work into `window.zdconsent.run`,
`cmd`, `analytics`, `functional`, `social` and `useractioncomplete`, and their
script runs each queue once the matching consent exists. An entry can be a
function, a URL, or `{ src, type }` - all three appear on their own sites.
`run` is ungated: mashable.com queues nine things into it, and speedtest.net
declares the queues inline above the tag. Blocking the file outright leaves
every queue unrun, which is the breakage this replaces. The stub runs `run` and
`useractioncomplete` whatever was decided, and leaves the consent-gated ones
parked exactly as their own Deny All does.

Their record, from the function their Deny All button ends in:

```
cookie zdconsent=optout       their own decision, and the one their code reads
cookie opt_out=1              set alongside it
cookie zd_core_lialready=true added by their opt-out path
cookie usprivacy=1YYY         outside GDPR only, where theirs writes it
```

**GPC is honoured, but only outside GDPR, and their own cookie overrides it:**

```js
!q && navigator.globalPrivacyControl && (K = false, P = true);
a && (a === 'optin' ? (K = true, P = false)
                    : a === 'optout' && (K = false, P = true));
```

so a stored `optin` silently cancels a visitor's GPC header. `reject` agrees
with GPC and is written whatever the browser sends. `accept` does not override
it: outside GDPR, where their own code reads it, a page that asked for accept
keeps the refusal, both layers stand down together, and the console line says
`gpc=set skipped=accept want=gpc`. Under GDPR their gate is `!gdprApplies`, so
the EU build never reads GPC and neither does this.

**Is an accept resource needed at all?** For the sites sampled, no - `reject`
is the default and leaves them working. The consent-gated queues on
mashable.com and speedtest.net hold analytics and push-notification code, not
content, and `run` is ungated. Two cases make `accept` worth having:

- **the EU build**, where nothing is consented until a visitor answers, so a
  site that queues real functionality behind `functional` or `social` is only
  usable with consent;
- **accept-or-pay**, which their script implements by rewriting OneTrust's
  *Reject All* button into a **Subscribe** link to `/subscribe`, disabling the
  toggles and adding a login link. There is no refusal on offer there. Note
  that `reject` already beats that wall rather than losing to it: no banner is
  ever built, so the dialog never appears and the refusal is recorded anyway.

**Not done here, deliberately:**

- **the adblock report.** Their script sets `window.adblock`, calls
  `Pogo.setADB(true)`, writes a `_pgabp` cookie and sends
  `gtag('event', 'adblock', { has_adblock: 1 })`. It is a report about the
  visitor, and this file only exists because a blocker is installed.
- **`https://zdbb.net/optout`.** Their own refusal calls it, server-side, along
  with `zd.core.setLocalOptout`. A redirected script talks to nobody; the
  cookie record is the part the page reads.
- **an invented site id.** `siteId`, `bu` and `oneTrustSiteId` come from a
  hostname table inside their file, so they are empty rather than guessed. The
  cookie domain is computed with their own function, and `isPremiumSubscriber`
  is left alone because it is the page's field, not theirs - their script reads
  it.

One thing worth knowing if you read their markup: a page that gives the tag
`id="zdconsent"`, as speedtest.net does, makes `window.zdconsent` the *script
element* until something assigns over it, because a document's ids are named
properties of the window. The resource will not hang the API on a node.

## Google Funding Choices

```
||fundingchoicesmessages.google.com^$script,redirect=fundingchoices-reject.js
```

The CMP and ad-block messaging AdSense and Ad Manager publishers get from
inside the Google console, rather than as a tag of their own.

**Blocking the request is already safe, and this does not change that.** It is
here for what blocking leaves behind: a page watching for the iframes their
script appends waits for something that is never coming, and a visitor who
consented before installing a blocker keeps the cookie that says so. One host
rule covers every shape they serve a script from - `/i/pub-<id>`, `/f/<token>`,
`/l/<token>` - because the token is minted per page and there is nothing stable
in the path to match.

**What it reproduces is their own inactive path.** Their `/f/<token>` script is
what the loader serves when Funding Choices has decided it has nothing to show,
and all of this was measured by booting it rather than read from a doc:

- **two hidden iframes in the top document**, named `googlefcInactive` and
  `googlefcLoaded`. They are the signal consumers wait on, and the counterpart
  of the `googlefcPresent` iframe the publisher's own inline snippet makes -
  which is the page's and is left alone.
- **`window.googlefc.__fci` as a queue that answers rather than collects**,
  over exactly two command names, `loaded` and `prov`, each answered with the
  string `[null,[4]]` and anything else with `[null,[2]]` - a JSPB array with
  their status enum in field 2. Whatever a page queued in their pairs-of-two
  layout before this arrived is answered too, and an odd-length queue is left
  alone, as theirs is.
- **`window.__fcInternalApiManager`**, by their own method names, whose
  `setError()` is the call their inactive path makes and is what makes every
  answer the same one.
- **`window.__fcInternalApiPostMessageReady`** and a listener that answers
  `{__fciCall: {command, callId}}` with `{__fciReturn: "[<callId>,[4]]"}` to
  the sender's origin. A command outside the two, or a call with no numeric
  `callId`, gets silence - also theirs.

**The refusal is their cookie's absence, plus clearing it.** `gpt.js` and
`adsbygoogle.js` each read exactly one Funding Choices thing, and it is not an
API - it is the `FCCDCF` cookie, URI-decoded if it starts with `%`, parsed as
JSPB, field 4, whose field 1 is the TC string:

```js
this.tcString = (a = Em(document)) && dc(z(a, 1)) != null ? J(a, 1) : null;
```

No cookie means no TC string, which is the refusal. Writing one would mint a
consent string of this repo's own making, so nothing is written - and an
`FCCDCF` a visitor consented to earlier is cleared, on the host and on the
registrable domain, because theirs is set for about thirteen months and a
refusal that let it stand would not be one.

**The IAB layer is answered, and refuses.** Their messaging script is the TCF
CMP, and it is the one thing the inactive path does not put up - so a page or a
vendor waiting on `__tcfapi` waits forever once the request is blocked.
`__tcfapi` answers here as **cmpId 300**, which is Google LLC on the IAB's own
published list, with `gdprApplies: true` and a string that grants nothing in
any set it carries: purposes, legitimate interests, vendors, special features,
publisher. The `__tcfapiLocator` frame and the postMessage relay go up with it,
so a vendor in a frame is answered too, and the IAB's own library reads the
string back.

Nothing is stored for it - no `euconsent-v2`, no `IABTCF_` key - because theirs
keeps the string in the cookie below, which is the one being refused. The pair
is deliberate: a vendor that asks the API is told no, and Google's own ad
scripts, which read the cookie rather than any API, are told there is nothing
at all.

**There is no accept resource.** There is nothing a page needs consent for
here that blocking the request would not already have taken away.

**Not done, deliberately:**

- **`googlefc.callbackQueue` is left exactly as it is**, because their own
  inactive path leaves it: two callbacks pushed before booting their script
  both stayed unrun and the queue stayed two long. Running them would be this
  resource inventing a behaviour the CMP does not have on this path - and the
  key names it answers to cannot be measured either, because the script that
  drains them is the messaging one, served from a token-bound URL that answers
  403 to anything but the page it was minted for.
- **the loader's markers.** Their script stamps two window properties named
  `btoa(id + "loader_js")` and `btoa(id + "cached_js")`, where the id is minted
  inside the script body rather than carried in the URL, so it cannot be known
  from outside. Only their own loader reads them.
- **the adblock side.** Nothing here reports a blocker, counts one, or helps
  anything else do so.

## tarteaucitron

```
||cdntag.tarteaucitron.io/load.js$script,redirect=tarteaucitron-reject.js
/tarteaucitron.js$script,redirect=tarteaucitron-reject.js
/tarteaucitron.min.js$script,redirect=tarteaucitron-reject.js
/\/tarteaucitron\.[0-9a-f]{6,}\.(min\.)?js/$script,redirect=tarteaucitron-reject.js
```

Both an open-source CMP a site hosts itself and a paid service at
tarteaucitron.io, and close to universal on French public-sector and media
sites.

**Two deployments, and they hand over different things.** Measured on
`cdntag.tarteaucitron.io/load.js?domain=...&uuid=...` at 1.35.0 and on a
self-hosted build, `info.gouv.fr/build/tarteaucitron.<hash>.js`:

- the **hosted loader** is one 95 KB file with the site's configuration *and*
  its service list inlined - `tarteaucitron.init({36 keys})` and
  `tarteaucitron.job=["twitterembed"]` are in the file itself. Replacing it
  takes both with it, so the resource works from their own defaults, which is
  why the one that matters, `cookieName`, is the same in both.
- the **self-hosted build** inlines neither: the page calls
  `tarteaucitron.init({...})` and pushes its services afterwards. Both arrive
  after the resource, so `init()` merges what it is given the way theirs does -
  page values win, by `hasOwnProperty` - and `job.push` is live, which is also
  what theirs is: their own build replaces `job.push` after init.

**Their record is one cookie**, named by `parameters.cookieName` and defaulting
to `tarteaucitron`, with an entry per service:

```
tarteaucitron=!youtube=true!googleads=false!xiti=false
```

each status one of `wait`, `true` or `false` - measured by driving their own
*Deny All*, which leaves exactly that and `state {twitterembed: false}`. Their
writer rewrites one entry at a time rather than appending, and this does too.

**Their events go to the document, not the window**, and they are not
decoration. `sendEvent` builds a plain `Event` and calls
`document.dispatchEvent`, and their own Google, Bing and Clarity glue listens
there:

```js
document.addEventListener("bingads_consentModeKo", function() {
    window.uetq.push("consent", "update", {ad_storage: "denied"});
}, {once: true});
```

so firing `<key>_consentModeKo` is how a refusal reaches the consent-mode
layer instead of stopping at the cookie. Consent mode is denied for Google and
Bing either way - and pushed in the shape theirs pushes, which was measured
rather than assumed: an **arguments object**, `Object.keys` `"0","1","2"`, not
an array. Tag Manager reads a consent command out of that shape, and an array
only looks the same under indexing, so a denial pushed as one can be passed
over. Their own file defines no `window.gtag`, and neither does this.

### Keeping the videos and social embeds

`tarteaucitron-reject-unblock.js` consents to **video and social** and refuses
everything else. Their own model makes that a clean cut rather than a guess:
every service carries a type, and their own `respondAll` takes a type to act
on. Over the 247 services in 1.35.0:

| type | count | |
| --- | --- | --- |
| `analytic` | 67 | refused |
| `ads` | 51 | refused |
| `api` | 29 | refused - maps and captchas, the next thing worth arguing about |
| `video` | 26 | **consented, and started** |
| `support` | 23 | refused |
| `other` | 22 | refused |
| `social` | 21 | **consented, and started** |
| `google` | 6 | refused |
| `comment` | 2 | refused - disqus and facebookcomment, a tracker wearing a comment box |

One name is refused despite its type, and it is there because **two of their
own bundles disagree**: `acast` is `type: "other"` in info.gouv.fr's
self-hosted build and `type: "video"` in their CDN's services bundle at the
same version. A reader's record from that page refuses it, and replacing a
site's build takes its typings with it - so the registry this falls back to
must not end up the more permissive of the two. It is podcast advertising and
measurement under either typing.

Measured against that reader's own cookie, this resource reproduces it entry
for entry, including the five services that tenant defines itself and their
public bundle has never heard of - those are refused because an unknown type
is refused:

```
!eulerian=false!locala=false!kword=false!doubleclick=false!criteo=false
!azerion=false!amazondsp=false!adform=false!brevonotification=false
!acast=false!youtube=true!vimeo=true!dailymotion=true!facebook=true
!instagram=true!twitterembed=true
```

**How it starts one**, which is the part that cannot be faked: a service's
launcher is `tarteaucitron.services[key].js()`, and it builds its embed through
this resource's own functions -

```js
js: function() {
    tarteaucitron.fallback(["youtube_player"], function(x) {
        var video_id = tarteaucitron.getElemAttr(x, "videoID"), ...
    });
}
```

- so `fallback`, `getElemAttr`, `getStyleSize` and `addScript` are implemented
rather than stubbed, and their own launchers run against them. Driven against
their real 1.35.0 bundle, their YouTube launcher builds
`<iframe src="//www.youtube-nocookie.com/embed/...">` while `googleads` stays
`!googleads=false`.

The registry those launchers live in is their services bundle. Where the page
loaded it itself, it is adopted. Where it did not - the hosted loader fetches
it with `addInternalScript(pathToServices)` - this fetches that one file and
nothing else, which is the request the replaced file would have made anyway.
**A service whose type is not known yet is refused in the meantime**, so a
bundle that never arrives leaves everything refused rather than everything
open. The filter patterns above are written so they cannot catch that bundle,
or this variant would be a no-op.

A page cannot argue its way past the cut either: `respondAll(true)` and
`setConsent(key, true)` are answered by type, not by the caller.

**Not done, deliberately:**

- **no banner.** Nothing is built, so there is no external CSS to fetch, and a
  refused embed is left as the page wrote it rather than covered with their
  "click to allow" box. The one exception is an **empty hidden
  `#tarteaucitronRoot`**: their `tac.root_available` means the markup is there
  to reach, and pages hook it to put their own button inside the root, so
  firing it over a null throws inside the page's own handler. One empty
  container is not a banner.
- **no reload.** Their `respondAll` sets `tarteaucitron.reloadThePage` when a
  refusal revokes a service that had already launched. Nothing launches under
  a refusal here, so there is nothing to undo.
- **no beacon.** Their `pro()` accumulates a status string and posts it to
  `logs.tarteaucitron.io/collect` with the site's uuid and domain through
  `sendBeacon`. It is a report of the visitor's choice to a third party, and it
  is most of the reason to replace the file. `pro` and `proPing` keep their
  shape and send nothing.
- **no accept-all.** A grant for an ad or analytics service would be a grant,
  and this repo's accept resources are for walls that withhold content.
  Nothing here withholds anything.

### Their do-not-track switch

Their own code reads the header four ways - `navigator.doNotTrack === "1"`,
`=== "yes"`, `navigator.msDoNotTrack === "1"`, `window.doNotTrack === "1"` - and
acts on it only where the page set `handleBrowserDNTRequest`, writing
`<service>=false` per service. A refusal is that already, so nothing changes
there; `tarteaucitron-reject-unblock.js` consents to video and social, and with
that switch on and the header sent it now consents to **nothing**, because
theirs would not either. The flag is also exposed the way theirs is - a boolean
off their parameters, assigned inside `init` - where it used to be a function
here, which is always truthy.

## CookieYes

```
||cdn-cookieyes.com/client_data/*/script.js$script,redirect=cookieyes-reject.js
||cdn-cookieyes.com/client_data/*/banner.js$script,redirect=cookieyes-reject.js
```

**One file is the whole install.** `client_data/<id>/script.js` carries the IAB
TCF stub, their auto-blocker, the tenant's configuration *and* the request for
`banner.js` - so replacing it means `banner.js` is never asked for either, and
neither is `common/iab-gvl-v3.json`, the global vendor list they ship, which is
**917 KB** a visitor stops fetching.

**It is domain-locked**, which is worth knowing before testing one: the
registered domain is inlined in the file and compared to `location.hostname` by
suffix, and a mismatch *throws*:

```js
const e = { registeredDomain: "www.fontsquirrel.com",
            currentDomain: window.location.hostname };
...
throw new Error("Looks like your website URL has changed...")
```

So a tenant's loader booted anywhere else does nothing at all. Nothing in the
resource checks a domain.

**Measured on two tenants** - fontsquirrel.com and domaintools.com - which
agree on the six categories and their `isNecessary` flags, the cookie shape and
pair order, the minted `consentid`, the log beacon, and `script.js` requesting
nothing but `banner.js`. They differ in two ways worth knowing: `_rootDomain` is
a full host on one and **empty** on the other, so their own cookie is host-only
there; and one carries the IAB TCF stub while the other carries neither, so
whether a tenant is IAB-enabled is configuration inside the replaced file. The
refusal installs the IAB layer either way - a vendor that asks is told no, which
is never weaker than no answer, and a page that waits gets an answer rather than
stalling. The console line reports it as `tcf=refused`.

A newer deployment **splits the configuration out** into
`client_data/<id>/<random>.json`, the banner targeting rules, and
`client_data/<id>/audit-table/<random>.json`, the cookie descriptions. Both are
fetched by `banner.js`, not by `script.js`, so replacing the loader still takes
all four and there is nothing extra to match.

**Their record** is one cookie of comma-separated pairs, measured on a first
visit:

```
cookieyes-consent=consentid:c3pOWHhYcHNXT3Byb2ljcTFtazJSeUFNZlZVcGV3Y2c,
                  consent:,action:,necessary:,functional:,analytics:,
                  performance:,advertisement:,other:
```

Six categories - `necessary`, `functional`, `analytics`, `performance`,
`advertisement`, `other` - each `yes` or `no`, with `consent` the decision and
`action` whether the visitor answered. The refusal written here is `necessary`
yes and the other five no, `consent:no`, `action:yes`, so nothing re-prompts.

**The `consentid` is not minted.** Theirs is 22 random characters from
`_ckyRandomString`; an id invented here would be an id this repo created and
then handed to a page's analytics. One already in the cookie is kept, and
otherwise it stays empty - which `getCkyConsent()` reports as `""`.

**Their events go to the document**, through a single dispatcher:

```js
function C(e, t) {
    const n = new CustomEvent(e, {detail: t});
    document.dispatchEvent(n);
}
```

`cookieyes_banner_load` carries `getCkyConsent()`, and
`cookieyes_consent_update` carries `{ accepted: [slug], rejected: [slug] }`.
`getCkyConsent()`, `performBannerAction()` and `revisitCkyConsent()` all answer,
and a page cannot argue a refused category into a yes through any of them.

**The IAB layer refuses as cmpId 401** - CookieYes Limited, from the IAB's own
published list - with `gdprApplies: true` and a string that grants nothing in
any set it carries. The vendor list version it reports, **179** with policy
version 5, is read off the vendor list *their own file ships*, not a third
party's copy. Nothing is stored for it: theirs keeps the TC string and the
Google additional-consent string inside the `cookieyes-consent` record, which
is the one being refused.

### CCPA, GPC and DNT

Measured on both tenants' `banner.js`, because the record has to mean the right
thing under either law. Their default state is:

```js
_ckySetInStore("consent", activeLaw === "ccpa" && shouldFollowGPC ? "yes" : "no");
for (const cat of _ckyStore._categories) {
    let s = "yes";
    if ( (activeLaw === "gdpr" && !cat.isNecessary && !cat.defaultConsent.gdpr)
      || (activeLaw === "ccpa" && optedOut && !cat.defaultConsent.ccpa) ) { s = "no"; }
    _ckySetInStore(cat.slug, s);
}
```

Under GDPR a category is `no` unless it is necessary - which is exactly the
record written here, so their own default confirms it. **Under CCPA the
categories start as `yes` and the consent token inverts**: `"yes"` there means
the visitor *opted out*, which is why their opt-out checkbox is pre-checked when
consent is `yes` or GPC is set.

So the consent token is the one ambiguous field, and **every category being
`no` is not ambiguous at all** - it reads as refused under either law. The
resource reports `activeLaw: gdpr`, under which its own token is the protective
one and the whole record is consistent; the tenant's real law is in the file
being replaced, and claiming `ccpa` would mean writing a `yes` that a GDPR
reader takes as consent.

**GPC is read and reported.** Their `script.js` seeds
`_ckyStore._gpcStatus = !!navigator.globalPrivacyControl` and their `banner.js`
computes `shouldFollowGPC = respectGPC && _gpcStatus`, where `respectGPC` is a
tenant's setting. Both fields are kept, with `respectGPC` true - the
privacy-forward of the two values it can take - and the console line says
whether the browser sent one. Nothing about the refusal changes with it: a
refusal already says what GPC asks for.

**Their DNT check cannot fire, and this does not copy it.** Their un-parking
routine opens with

```js
if (1 === navigator.doNotTrack) return;
```

a strict comparison against a *number* where the DOM gives the string `"1"`, so
the guard never holds and DNT reaches nothing. The intent is plain - do not free
parked tags for a visitor who asked not to be tracked - and `reject` frees
nothing anyway, so the intent is met without reproducing dead code.

There is **no `__uspapi`, no `__gpp` and no `us_privacy` string** anywhere in
either tenant's files: their CCPA support is their own cookie and their own
opt-out UI, so the resource puts none of those up either.

**Their blocker is in the file being replaced**, and that is a trade worth
stating plainly. `script.js` patches `document.createElement` so a script whose
`src` matches their provider list has its `type` flipped to
`javascript/blocked`, and `_ckyIsCategoryToBeBlocked` treats an *empty* store as
blocked for every non-necessary category - their default-deny. With the file
replaced that machinery is gone and uBlock Origin is what blocks. What their
WordPress plugin parked in the markup - `type="text/plain"` with
`data-cookieyes="cookieyes-analytics"` - stays parked under `reject`, because
nothing turns it back on.

`cookieyes-reject-unblock.js` is for a site that withholds something until a
category is on: the same stored refusal and the same IAB refusal, while the
page's own scripts are told every category is on and their parked tags are let
go. Only what *they* parked - their attribute, or the `javascript/blocked` type
their own blocker writes - is freed; a bare `type="text/plain"` script might be
a template's or another CMP's, and freeing one on a guess would be this resource
running code nobody asked it to. A parked node is replaced by a copy rather
than retyped, because a type alone does not run a script already in the
document, which is why their own un-parking inserts one too.

**Scripts only, and that is not an omission.** An iframe is never parked in the
markup: their blocker handles one at runtime by inserting a sized
`video-placeholder` div after it - with the YouTube thumbnail where the `src` is
a YouTube URL - and leaves the iframe's own `src` in place. Neither `data-src`
nor any `data-cky-src` appears anywhere in their files. With their script
replaced that blocker never runs, so an iframe is simply an iframe and uBlock
Origin decides what it may fetch; there is nothing moved aside to put back.

**The record is written in every scope a stored yes could be in.** Theirs goes
out with `domain=_ckyStore._rootDomain`, which is per-tenant configuration
*inside* the file being replaced, and the two readers disagree on which
duplicate wins - their own `_ckyGetCookieMap` assigns over its map as it goes,
so the last wins, where a first-match read takes the first. A refusal written
to one scope only could therefore be shadowed by an acceptance in another, so
it is written host-only and on each domain above, with their own attributes:
their expiry, `SameSite=Strict` unless a tenant turned iframe support on, and
`secure` - which theirs adds even on `http`, where the browser then drops the
cookie and no decision is recorded at all.

**Not done, deliberately:**

- **no banner**, and their placeholder markup is left as the page wrote it.
- **no log.** Theirs sends a `sendBeacon` to `log.cookieyes.com/api/v1/log` on
  load, *before any decision*, carrying a consent session id and the banner id.
  It is a page view reported to a third party, and it is most of the reason to
  replace the file.
- **no cookie purge.** Theirs deletes the cookies it lists per category - `_ga`,
  `lidc`, `demdex` and the rest - but that list is per tenant and inlined in the
  replaced file, so it cannot be known from outside. uBlock Origin blocks the
  requests that would set them in the first place.

## consentmanager.net

```
||consentmanager.net/delivery/js/semiautomatic.min.js$script,redirect=consentmanager-reject.js
||consentmanager.net/delivery/cmp.php$script,redirect=consentmanager-reject.js
||consentmanager.net/delivery/js/cmp_final.min.js$script,redirect=consentmanager-reject.js
```

Jaeger & Kloss's CMP, measured across all four files they serve, on two
tenants' delivery - fasthosts.co.uk and dastelefonbuch.de.

**What a page actually downloads**, and why one rule is worth having:

| | | |
| --- | --- | --- |
| `delivery/js/semiautomatic.min.js` | 18 KB | the bootstrap: builds the `cmp.php` URL from window globals and loads the bundle |
| `delivery/cmp.php?cdid=…&h=…` | 6 KB | per tenant: `window.cmp_config_data`, the loader functions, and the request for the custom data |
| `delivery/js/cmp_final.min.js` | **493 KB** | the CMP itself |
| `delivery/customdata/<base64>.js` | 43–147 KB | per tenant vendor and UI data |

Replacing the bootstrap or `cmp.php` takes the rest with it - better than half a
megabyte a visitor stops fetching. The `||` rules match every delivery host
they use (`cdn.`, `b.delivery.`, and the rest), and the customdata needs no rule
because nothing asks for it once `cmp.php` is replaced. That filename is itself
the configuration: base64 of
`m_1.w_170577.r_GDPR.l_en.d_53863.x_130.v.p.t_53863.xt_118` - the website id,
the regime and the language.

**The record that matters is not theirs.** Their own consent record is
`__cmpconsent<id>`, `__cmpconsentx<id>` or `__cmpconsents<id>`, keyed on a
`consentscope` with a per-tenant id - and both live in `cmp_config_data` inside
the file being replaced, so the name cannot be known from outside. **Nothing
else reads it**: grepped across their bootstrap, their `cmp.php` and *both*
tenants' customdata, the only reader is the 493 KB bundle. So it is not written
here, and an invented name would be a record of this repo's making.

What a third party reads is `euconsent-v2`, which their own bundle writes:

```js
r.alt = o > 0 ? (s ? "euconsent-v2" : "nc_euconsent-v2")
              : (s ? "euconsent" : "nc_euconsent");
```

so **that one is written**, with a string that grants nothing, as **cmpId 31** -
which their own `cmp.php` states outright (`"iabid":31` in `cmp_config_data`,
on both tenants) and the IAB's published list confirms. It goes into every
scope a stored one could be in, because their own `writeCookie` takes its
domain from a per-tenant `consentscope`, and their `getDomainForScope` carries
its own two-level suffix list to build one.

**Their events go to two different targets**, which is the sort of thing that
quietly reaches nobody if it is assumed:

```js
window.dispatchEvent(new CustomEvent("cmpEvent", {detail: {type, subtype, data}}));
window.dispatchEvent(new CustomEvent("cmpEvent_" + type, {detail: …}));
…
document.dispatchEvent(new CustomEvent("wp_consent_type_defined"));
```

`cmpEvent` and `cmpEvent_<type>` at the **window**, and their WordPress Consent
API bridge at the **document** - next to `window.wp_consent_type` and a
`wp_set_consent` call per category. All of it is reproduced, and the tests
listen on both targets so a dispatch at the wrong one cannot pass unnoticed.

**Everything page-facing hangs off `cmpmngr.api`**, which is their layout -
`window.__cmp` is a thin delegate to it, and `__tcfapi`, `__gpp` and `__dsa`
are the same (theirs only replaces a stub a page already installed; this one
puts `__tcfapi` up regardless, because a page waiting on it would otherwise
wait forever). Their **30-command table** is answered, and **each command gets
its own payload**, not one for all:

| command | answers |
| --- | --- |
| `getCMPData` | their 34 keys - `cmpDataObject`, `purposeLI`, `hasGlobalScope`, `publisherCC`, `choiceType` … and no `cmpId`, which lives on the ping |
| `getConsentData` | three fields: `consentData`, `gdprApplies`, `hasGlobalScope` |
| `getVendorConsents` | the custom pair `getCMPData` has not - `customPurposeConsents`, `customVendorConsents` |
| `getVendorList` | `{}`, as theirs does |
| `checkConsent` | `{consent: false, vendors: {}}` |
| `getUserLocation` / `getUserGeo` | `{cmpUserCountry, cmpUserRegion}`, empty rather than invented - theirs comes from the replaced file |
| `ping` | `apiVersion: "2.3"`, `cmpId: 31`, `tcfPolicyVersion: 5` - and **false for any version but 2**, which is theirs |

`consentExists` and `userChoiceExists` are both true, so nothing re-prompts, and
a page cannot set a consent or open a screen: `setConsent`, `showScreen` and the
rest are answered rather than obeyed. `__uspapi` answers `1YYN`.

`consentmanager-reject-unblock.js` is for a site that withholds something until
a purpose is consented to: the same stored and sent refusal, while the tags
their blocker parked are let go by **their own contract** - a `.cmplazyload`
element with `data-cmp-src`, the type from `data-cmp-type`, the display from
`data-cmp-hide-display`, an `onload` from `data-cmp-onload`, and a script freed
by inserting a copy marked `data-cmp-ab="1"` rather than retyping it, which is
what theirs does.

**Not done, deliberately:**

- **no banner**, and their own markup is left as the page wrote it.
- **no cross-domain sharing.** Their `writeStore` posts
  `cmpcd:set:<key>=<value>` into a `__cmpcdframe` iframe, which is how a choice
  is shared between a customer's domains through their server.
- **no tracking.** Theirs calls Microsoft Clarity, Microsoft UET and Xandr, and
  pushes a data layer event, when a decision is made. The methods keep their
  shape and send nothing.
- **no cookie purge.** Theirs deletes the cookies of non-consented vendors from
  a per-tenant list in the replaced file. uBlock Origin blocks the requests
  that would set them.

## Cookiez

```
/plugins/cookiez*/assets/build/banner.js$script,redirect=cookiez-reject.js
/plugins/cookiez*/assets/build/lang-*.js$script,redirect=noopjs
```

A WordPress plugin, so like Complianz it is served **first-party** from the
site's own `wp-content` path and there is no vendor host to match. The rule
matches the file under any `cookiez*` plugin directory, which keeps working
when a premium or renamed build turns up, and the `?ver=` query does not get in
the way. Their language file is a webpack chunk of banner text that the
bundle's own chunk loader fetches, so with `banner.js` replaced nothing asks
for it - the `noopjs` rule is for a page that hardcodes it anyway.

**Their record**, reproduced field for field from a real refusal on a site
running it:

```json
cookiez-user-consent={"data":{"consent":{"necessary":true,"functional":false,
    "analytics":false,"advertising":false,"unclassified":false}},
    "meta":{"cookiesHash":"79a37b2f…","timestamp":1791239063}}
```

URI-encoded, `path=/`, `max-age` of `86400 * consentExpiration` and
`SameSite=Lax`, all from their own writer. Five categories, and their builder is

```js
J = e => Object.fromEntries(Object.values(R).map(t => [t, t === Necessary || e]));
```

so `J(false)` *is* the refusal above - necessary true and the other four false.

**The hash decides whether the record counts at all.** Their gate:

```js
if (!e?.meta) return false;
if (Date.now()/1e3 - e.meta.timestamp > 86400 * consentExpiration) return false;
const n = window.cookiezBannerSettings?.cookiesHash;
return !n || e.meta.cookiesHash === n;
```

A record whose `cookiesHash` does not match the current one is thrown away and
**the banner shows again** - the same shape of trap as Complianz's `policy_id`.
The hash is a page global, read here exactly where their own writer reads it,
which is the only reason a record written from outside survives.

**The `consentId` is not minted, and here that is not a judgement call.**
Theirs comes back from their own server:

```js
n = (await N.sendConsentLog(e, t, Q()?.data?.consentId)).consentId;
const o = {data: n ? {consentId: n, consent: e} : {consent: e}, …};
```

When that call fails, their own record carries **no `consentId` key at all**. So
one already stored is carried over, and otherwise the key is left out - a shape
their own code produces.

**Their two bridges** go with the record, gated as theirs are on `supportGcm`
and the tenant's integrations: the **WordPress Consent API**, whose names are
not the category names (`analytics` becomes `statistics`, `advertising` becomes
`marketing`), and **Google consent mode**, which theirs calls through
`window.gtag` directly rather than pushing to a data layer, and skips where a
tenant delegates it to Site Kit.

**There is no page-facing API to reproduce**, which is worth saying plainly
because the temptation is to invent one. Their bundle dispatches no
`CustomEvent` and no DOM event of any kind, and the one global it sets -
`window.cookiezBanner` - is banner internals (`screenManager`, `translations`,
`content`, `apiConfig`) put up only when a banner is actually built. So this
resource puts nothing of its own up: the record is the interface.

`cookiez-reject-unblock.js` frees the scripts their blocker parked, by **their
own selector**:

```
script[type="text/plain"][data-cc-category="<category>"]:not([data-cc-mode="always"])
```

The copy drops every `data-cc-` attribute and the `type`, takes its `src` from
`data-cc-src`, keeps inline text, and goes back in at the original position -
all of which is what theirs does. A node marked `data-cc-mode="always"` stays
parked even there, because that is their own never-free marker.

**What their boot does that this deliberately overrides.** Their settings come
from `cookiezBannerSettings.settings` merged over their own defaults
(`consentExpiration` 180, `gpcDntSupport` false, `supportGcm` false), with
`integrations` merged in from the *top level* of that global - which is why
those two are read from two different places here. Then, on a site configured
`adaptive` and `opt-in-out`:

```js
const n = await Mt(e.regionalRules, {...});                 // their geo endpoint
if (n === NoBanner) { const t = J(true); q(t); re(t, e); return {skipBanner: true}; }
const o = n === OptOut ? OptOut : OptIn;
if (o === OptOut) { re(J(true), e); }
```

so in a no-banner region their own code **un-parks everything and tells both
bridges granted**, and in an opt-out region it **tells both bridges granted** -
with no banner and no user action. The refusal written here is what overrides
that, and it also stops the geo call happening at all on the next page: their
gate is short-circuited by `ee()`, which is simply *a record exists*.

**Their DNT support does not exist.** The setting is called `gpcDntSupport`, and
`doNotTrack` appears nowhere in their bundle - only
`navigator.globalPrivacyControl` is read. Nothing is claimed on DNT's behalf
here either; the console line reports whether a GPC signal was sent.
`googleTagsBeforeConsent` is likewise only in their defaults object and never
read by the bundle, so it is a server-side setting their PHP consumes.

**Not done, deliberately:** no banner, no geo lookup, nothing posted to their
REST route (`cookiezBannerSettings.serviceUrl`, with an `X-WP-Nonce` header),
and no banner internals of this repo's making. The one property this resource
does define, its own re-entry marker, is **not enumerable** - a page's walk of
`window` sees nothing that was not already there.

## AMP amp-consent

`cdn.ampproject.org/v0/amp-consent-0.1.mjs` (and `-0.1.js`, and the `-latest`
aliases of both).

This one is not a CMP that owns the page. It is an AMP extension, and the AMP
runtime will not build **any** element that waits on consent until the
extension has registered a service and that service has answered. From the
runtime itself:

```js
getServiceForDoc(this, 'consentPolicyManager', 'amp-consent')
    .then(s => !s || (policy ? s.whenPolicyUnblock(policy)
                             : s.whenPurposesUnblock(purposes)))
    .then(ok => { if ( !ok ) throw new Error('BLOCK_BY_CONSENT'); })
```

So **blocking the file is the one thing not to do**: with no extension, that
promise never resolves - the runtime waits 16 seconds, logs, and keeps waiting -
and every gated element stays unbuilt for the life of the page. The gate catches
anything with `data-block-on-consent` and anything whose tag is named in

```html
<meta name="amp-consent-blocking" content="AMP-AD,AMP-ANALYTICS">
```

which is why a blocked `amp-consent` can look harmless on one site and leave
holes where the video was on the next.

What goes in instead is their refusal, in their own vocabulary:

- `consentState` `REJECTED`, written where they write it. AMP has no cookie
  here: the record lives in `localStorage` under `amp-store:<source origin>` as
  base64 of `{"vv":{"amp-consent:<instanceId>":{"v":{"s":0},"t":<ms>}}}`, and
  the `0` is their own encoding - their reader maps `false` and `0` to
  `REJECTED`, `true` and `1` to `ACCEPTED`. The instance id is read off the
  page: the inline config, their legacy single-entry `consents` map, or the
  `type` attribute.
- every policy resolved with their own arithmetic rather than a verdict made up
  here. Their predefined policies carry `unblockOn` lists -

  | policy | `unblockOn` | under a refusal |
  | --- | --- | --- |
  | `default`, `_till_accepted` | `[1,3]` | stays blocked |
  | `_till_responded`, `_auto_reject` | `[4,1,2,3]` | builds |

  — and a publisher's own `unblockOn` on the default policy is honoured,
  because it is theirs. A page that already unblocks on anything needs nothing
  further.
- nothing requested: no `checkConsentHref` POST, no `promptUISrc` iframe, no
  `onUpdateHref` ping, and no anonymous page id minted for their check-consent
  url.

`ampconsent-reject-unblock.js` is for a page that withholds content behind the
default policy. It stores and reports the same refusal - what an ad request
carries is still a refusal - and answers only the build gate differently.

### The scriptlet form is the safer one here

AMP asks for these files with `crossorigin="anonymous"`, and the module build
with `type="module"`. A user resource is handed over as a `data:` URI, which a
site's CSP can refuse and which is a thornier fetch for a CORS'd module script
than for an ordinary one. The scriptlet form is injected rather than fetched:

```
example.com##+js(ampconsent-reject)
```

It does not need the file blocked as well, and this is measured rather than
assumed: a scriptlet runs at `document_start`, so its entry is in AMP's queue
first, and the runtime's own `registerExtension` takes only the first
registration of a name - the real file's arrival is then a no-op, its banner
never shows and nothing of it runs. The reverse is the thing to avoid: if the
real extension registers first, it wins and this resource does nothing.

### Deliberate gaps

- **The TCF postMessage API.** A tenant with `"exposesTcfApi": true` gets an
  iframe named `__tcfapiLocator` from their extension and `__tcfapiCall`
  messages answered. Nothing here answers those, so an iframe that asks gets no
  reply rather than a refusal. For the vendors that matters to, the iframe is an
  ad frame uBlock Origin already stopped.
- **Their vendors' check-consent endpoints** are left unblocked. A page names
  one with `<amp-consent type="...">` and their extension holds the url;
  nothing here asks for any of them, and a rule per vendor would be a second
  thing to keep in step with their table.
- **The runtime is left alone.** `v0.mjs` and `v0.js` are the whole page on an
  AMP document.

## iubenda

`cdn.iubenda.com/cs/iubenda_cs.js`, which is a 4KB loader: it reads
`_iub.csConfiguration`, installs `window._cmp.pubSub`, sets a few `_iub`
fields and fetches the real thing -

```js
"https://cdn.iubenda.com/cookie_solution/iubenda_cs/1.108.0/core-" + o.lang + ".js"
```

— 450KB of it. Replace the loader and neither arrives.

**Their record**, which is what stops the banner coming back, built the way
their own `getConsentObj` builds it and written where theirs is: a cookie named
`_iub_cs-` plus their storage id, URL-encoded because their own converter
encodes a value that looks like JSON for a cookie and leaves it decoded for
`localStorage`.

```json
{"timestamp":"2026-10-06T00:00:00.000Z","version":"1.108.0",
 "purposes":{"1":true,"2":false,"3":false,"4":false,"5":false}}
```

Their five purposes, from their own `per_purpose` table: 1 necessary,
2 functionality, 3 experience, 4 measurement, 5 marketing. Purpose 1 is true in
every mode because their own `storeConsent` forces it, and a tenant without
`perPurposeConsent` gets their simple form, `"consent": false`, instead. The
storage id is `"s" + siteId` where `storage.useSiteId` is on and the
`cookiePolicyId` otherwise, and `storage.type` - per item, with a group default
behind it - picks between the cookie and `localStorage`. Where a record already
sits in the other one it is overwritten there too, because with their
`autoSync` on the one left behind would be read back.

Their preference id is **not** minted: `cons.rand` comes from their consent-log
server, and a record without it simply has no preference id, which is a shape
their own `getPreferenceId` handles. An existing one is carried over.

**Their callbacks** fire in the order their own code fires them for a stored
decision, including the two quirks worth copying: `onReady` is called with
`consent.consent` as its argument, and `onConsentRead` falls back to
`onConsentGiven` where consent was given and no `onConsentRead` is defined -
which is how a page's `onConsentGiven` fires on a return visit.

**Google consent mode** is theirs as well, mapping and sender both: `gtag`
where the page has one, their `template` pair at `_iub.gtmDataLayer` and
`_iub.gtmDataLayerV2` where the tenant asked for it, and the data layer their
`googleConsentModeDataLayerName` names otherwise.

| signal | purpose |
| --- | --- |
| `analytics_storage` | 4 |
| `ad_storage`, `ad_personalization`, `ad_user_data` | 5 |
| `functionality_storage`, `security_storage` | 2 |
| `personalization_storage` | 3 |

### Their auto-blocker stays

`cs.iubenda.com/autoblocking/<siteId>.js` is the file parking the trackers: it
rewrites a tag's `src` into `data-suppressedsrc` and marks it
`_iub_cs_activate` before anything runs. **Blocking it would let every tracker
load unparked**, so nothing here touches it, and the reject resource leaves
what it parked exactly where it is.

`iubenda-reject-unblock.js` frees those tags by their own markers, and the pass
runs again as the document arrives because this resource stands in for a script
in `<head>` and the parked tags are below it. Their suppressed reader is
`data-suppressed<attr>` → `suppressed<attr>` → `<attr>`, and their own
activators call it with **`href`** for a link, **`poster`** for a video and
**`data`** for an object as well as `src` - all four are restored, and every
marker comes off the freed node.

### The consent wall

Theirs is often run as a wall, and a wall answers to the record rather than to
the tags - freeing the parked scripts does not take it down. `iubenda-accept.js`
is the one for that case: every purpose true in their record, consent mode told
granted, and the IAB string consenting to their own vendor count, 1223, which
their loader states as `_iub.vendorsCountGVL3`. It consents on your behalf;
`iubenda-reject.js` is the default everywhere else.

### The IAB layer

Installed only where their tenant sets `"enableTcf": true`, and every constant
read off something of theirs: cmp id **123** from the IAB's published list
(their own bundle reads `_iub.IUBENDA_CMP_ID`, which arrives with the per-tenant
configuration), vendor list **179** from their loader's `_iub.GVL3`, policy
version **5** from their own TCF module, publisher country `AA` because
`tcfPublisherCC` is per tenant. The cookie goes under the name their
`preferenceCookie.tcfV2Name` gives it, `euconsent-v2` by default, so a stored
acceptance cannot outlive the refusal.

Their own `cs/tcf/stub-v2.js` and `cs/gpp/stub.js` are dropped by the list: each
installs a window-level API that queues every call until their core arrives, and
a stub that loads *after* this resource would overwrite a working `__tcfapi`
with one that answers nothing.

### It waits for their configuration

Their loader reads `_iub.csConfiguration` synchronously and cannot work without
it, so a page always sets it above their script tag - which is where a redirect
lands. A scriptlet runs earlier than that, at document_start, before the page
has run anything. Measured before this waited: a record named `_iub_cs-` with no
tenant id, in their simple form on a per-purpose tenant, and not one of the
page's callbacks fired. Nothing is written until the configuration exists, and
an empty configuration object is not the same thing as none.

Injected twice - the network rule and the scriptlet both landing - it installs
once: the marker is the guard, and without it the page's own callbacks fired
twice and the consent-mode signals went out twice.

### Deliberate gaps

- **`__gpp` and `usprivacy`.** Their US flow writes `_iub_cs-uspr` and
  `usprivacy` and answers `__gpp` through a module of its own. Nothing here
  writes or answers either, so a US page gets the refusal above and no US
  signal.
- **Their CCPA opt-out.** `isCcpaAcknowledged` and `isCcpaOptedOut` answer
  false, which is their own default for a visitor who was never asked.
- **Global Privacy Control.** Their own `getPreferences` applies a GPC signal to
  the US purposes `s`, `sh` and `adv`. A refusal here is already stronger than
  that, and accept is an explicit choice that overrides it.
- **A granting additional-consent string.** It would need the tenant's own
  Google vendor list, which is not on the page. The refusal carries `2~~dv`, the
  shape their `gacVersion` 2 gives for consenting to nothing.

## CookieConsent (Orest Bida)

`cookieconsent.umd.js`, wherever it is served from - their GitHub tag on
jsDelivr, their npm name `vanilla-cookieconsent`, unpkg, or a copy a site hosts
itself. **Not** Osano's old library of the same common name; Osano's current CMP
has its own section above.

This is the first family here whose bundle is open source, which gave it an
oracle the others did not have: the real `cookieconsent.umd.js` 3.1.0 was run
beside the resource in the same page, with the same config, and the two were
compared - the record field for field, their `getUserPreferences`, which cookies
their auto-clear deleted, which parked tags were freed and which callbacks fired
in which order. They agreed on all of it. The self-hosted copy measured
(`csc.edu`) is byte-identical to jsDelivr's 3.1.0, same sha1, which is why one
rule by filename covers every deployment.

**Their record**, and their own gate on it:

```js
e.V && _ && d !== t.revision && (e.j = !1)
e.T = !(_ && e.j && e.C && e.S && f)
```

a string `consentId`, a revision equal to the page's, a `consentTimestamp`, a
`lastConsentTimestamp` and `categories` as an array - miss any one and their
banner is back, so all of them are written:

```json
{"categories":["necessary"],"revision":0,"data":null,
 "consentTimestamp":"...","consentId":"<uuid>",
 "services":{"necessary":[]},"languageCode":"en",
 "lastConsentTimestamp":"...","expirationTime":1806989257050}
```

**The `consentId` is minted here**, which is the opposite of what this repo does
for families whose id comes from a consent-log server. Theirs is made in the
browser with `crypto.getRandomValues`, so this makes it the same way - and an
existing one is carried over with their first `consentTimestamp`.

**Their API waits for `run(config)`**, which is their own contract: the bundle
only puts `window.CookieConsent` in place, and everything - the categories, the
cookie name, the revision, the callbacks, whether they manage script tags - comes
from the config the page passes. All nineteen of their methods answer.

**Their auto-clear is done**, because it is the visible half of a refusal: a
refused category's `autoClear.cookies` are deleted their own way, host-only, the
configured domain dot-prefixed and for a `www` host the bare domain too, with a
regexp entry matched against the cookies actually there. **Their `reloadPage` is
not** - theirs reloads when a category goes from accepted to refused, and a
resource that refuses on every load would reload every load.

**Their events go to the window**, because their dispatcher is a bare
`dispatchEvent(new CustomEvent(name, {detail}))`. A first consent fires
`cc:onFirstConsent` then `cc:onConsent`; overwriting a stored acceptance fires
`cc:onConsent` and `cc:onChange` with `changedCategories` and `changedServices`,
which is what their own bundle does - measured against it.

**Bots are left alone**, because theirs leaves them alone: with their
`hideFromBots` on, a user agent matching `/bot|crawl|spider|slurp|teoma/i` or
`navigator.webdriver` makes their own `run()` return before doing anything.

### Three things their config can do

Found by running their own bundle beside the resource a second time and
comparing more of the surface:

- **`expiresAfterDays` can be a function**, and theirs calls it with the
  acceptType (`$ = () => w(e) ? e(m.o.F) : e`). A tenant writing
  `type => type === 'all' ? 365 : 30` was getting the 182-day default.
- **A service carries its own `onAccept` and `onReject`**, called from the same
  pass that runs their script tags. A refusal calls neither, because their own
  flag starts false; the unblock and accept resources call `onAccept`.
- **`setLanguage` answers `false`** for a code that is not in their
  translations *and* for one that is already current, unless `force` is passed.

### Deliberate gaps

- **Their module build.** A page that imports `cookieconsent.esm.js` calls
  `run()` off the import, so a stub that sets `window.CookieConsent` answers
  nobody, and a bundler's copy compiled into a site's own application file
  cannot be reached at all. On either of those the banner stays.
- **No banner, so no `show()`.** Their `show`, `hide`, `showPreferences` and
  `hidePreferences` are no-ops rather than lies: nothing is built to show.
- **Their stylesheet is left alone.** With no banner built, `cookieconsent.css`
  styles nothing, and blocking it would be one more request for no reason.

## Cookie Law Info (legacy WordPress plugin)

`/wp-content/plugins/cookie-law-info/js/cookielawinfo.js` - WebToffee's "GDPR
Cookie Consent", plugin slug `cookie-law-info`, the ancestor of today's
CookieYes plugin. **Not** the hosted CookieYes script, which has its own section
here; nothing of `_ckyStore`, `cookieyes-consent` or `data-cookieyes` exists in
this one.

Every copy is served by the site itself, so one rule by path covers all of them.
Four versions were read - 1.5.4, 1.6.3, 3.3.2 and 4.1.10, the last two
byte-identical - and this is the whole plugin: two globals, one cookie, no
script blocking, no categories, no API. It is the smallest resource in the repo.

**Their record** is one cookie, and their own constants:

```js
ACCEPT_COOKIE_NAME = 'viewed_cookie_policy'
ACCEPT_COOKIE_EXPIRE = 365
document.cookie = name+"="+value+expires+"; path=/";
```

`'yes'` from their accept, `'no'` from their decline - which only 1.5.4 and
1.6.3 write, the later file having no decline path at all. `'no'` is what goes
in, and a stored `'yes'` is overwritten. Their banner shows on that cookie being
*absent* rather than on its value.

### Their banner is not always theirs to insert

This is the thing to know about this plugin. 3.3.2 and 4.1.10 prepend the markup
themselves (`jQuery('body').prepend(html)`), so replacing the file leaves nothing
in the document. **1.5.4 and 1.6.3 have no prepend at all** - their markup is
printed into the page by PHP and the script only wires and positions it. A live
1.6.3 page carries `#cookie-law-info-bar` and `#cookie-law-info-again`, and
their own `cli-style.css` gives the bar `position:absolute; z-index:9999` with
**no `display:none`** - their script is what hides it once the cookie exists. So
a stub that only wrote the cookie would leave a dead cookie bar on screen.

Both of theirs are taken out, by the ids their own settings name
(`notify_div_id`, `showagain_div_id`) and by their defaults where the page never
calls in. Removed rather than hidden: with no banner to reopen, a show-again tab
that does nothing is worse than no tab.

### It cannot be blocked instead

The page calls their function from an inline script:

```js
cli_show_cookiebar({
    html: '<div id="cookie-law-info-bar">...</div>',
    settings: '{"notify_div_id":"#cookie-law-info-bar", ...}'
});
```

With the file gone that is a `ReferenceError`, and it takes the rest of that
inline block with it - on the sites sampled the call sits inside a jQuery ready
handler shared with other plugins. Their other global, `l1hs`, goes back in for
the same reason (it normalises a colour to a leading `#`, and their own file
calls it with `settings.text` and `settings.border`).

### Deliberate gaps

- **The modern plugin's own script.** `cookie-law-info-public.js` does park
  scripts (`data-cli-class`, `text/plain`) and writes
  `cookielawinfo-checkbox-<category>` cookies beside this one. None of the four
  sites sampled ships it; a site that does needs more than this resource.
- **No accept variant.** Nothing is gated behind consent in any version of this
  plugin, so there is nothing an acceptance would release.
- **Their stylesheet is left alone.** `cli-style.css` styles a bar that is no
  longer there.

## Development

```sh
npm run build   # src/ -> dist/, one flat file per resource
npm run lint    # every source file on its own, before it is concatenated
npm test        # builds, then runs the suite against the built files
```

`lint` walks `src/` rather than naming files, because the script it replaced
named three by hand and two of them had moved. It reports a syntax error
against the file it is in rather than the resource that file was concatenated
into, flags a template literal before the bundler silently strips the line it
is on, and finds a lib under a family's `lib/` that no entry includes. CI runs
it ahead of the suite.

Each consent manager carries its own version, from `resourceVersions` in
`package.json`, so adding or fixing one never restamps another's resources. The
build substitutes `@@VERSION@@` with that family's version and refuses to ship a
file where the placeholder survived. `version` in `package.json` is the repo's
own, which is what a release and its tag are named after:

```sh
# bump the family's entry in resourceVersions if its resources changed
npm version minor --no-git-tag-version   # the repo's own version
npm run build && npm test                # dist/ carries the new number
git commit -a && git tag -a v1.3.0 -m '1.3.0 - what changed'
git push origin main --follow-tags
gh release create v1.3.0 --verify-tag --title v1.3.0 --notes-file notes.md
```

The install URLs above are pinned, so they move with each release too - the build
refuses to run while they name a different version from `package.json`, which
stops a release shipping instructions for the one before it.

Every version has a [release](https://github.com/ryanbr/consent-rr/releases),
and its tag gives a URL that never moves - useful both for pinning and as its own
cache-buster, since uBO will not refetch a URL it already has:

```
https://raw.githubusercontent.com/ryanbr/consent-rr/v1.45.0/dist/onetrust-reject.js
```

[AGENTS.md](AGENTS.md) is the working guide - the format traps, the filter-token
rules, where the values come from, and why the tests are written the way they are.

One directory per consent manager under `src/`, its shared code in that
directory's `lib/`, and `dist/` stays flat because uBO addresses a resource by
name alone.

`src/onetrust/onetrust-*.js` are thin entry points; the behaviour is in
`src/onetrust/lib/onetrust-core.js`, pulled in by a `// @include` line, so accept and
reject cannot drift apart. The build inlines it, leaving one self-contained file
per resource. `dist/` is committed, because those are the files uBO fetches.

uBO's resources format is line-based and unforgiving, and the bundler enforces
it: a **blank line ends a resource**, a line starting with `// ` or `#` is
**dropped**, and a `/// ` line is the header or a directive — so blank lines and
whole-line comments are stripped from the output, and no code line may begin
with `/// `. Resources must also stay **ASCII**,
because uBO encodes a user resource with `btoa()`. Sources may not use template
literals, since the stripping is line-based.

Tests run the built files in jsdom, parsed with the same rules uBO applies and
joined the way uBO joins several `userResourcesLocation` URLs. The TC string is
not taken on trust: `@iabtcf/core`, the IAB reference implementation, decodes it
and the tests assert which purposes, special features and vendor ranges come
back, in both directions.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

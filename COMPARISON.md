# The three resources compared

Measured, not described: this file is written by `tools/comparison.mjs`, which
runs each built resource against the same page and records what it did. `npm run
build` regenerates it and CI fails if the committed copy has drifted. Everything
below is from the OneTrust resources at **1.5.0**.

A row in bold is one where the three differ.

## What is stored

Written to the visitor's own browser, and read back by the site on the next page.

| | `reject` | `reject-unblock` | `accept` |
| --- | --- | --- | --- |
| **cookie `groups`** | `C0001:1,C0002:0,C0003:0,C0004:0,C0005:0,V2STACK42:0` | `C0001:1,C0002:0,C0003:0,C0004:0,C0005:0,V2STACK42:0` | `C0001:1,C0002:1,C0003:1,C0004:1,C0005:1,V2STACK42:1` |
| **cookie `intType`** | 2 (Banner - Reject All) | 2 (Banner - Reject All) | 1 (Banner - Allow All) |
| `OptanonAlertBoxClosed` | written | written | written |
| `OTAdditionalConsentString` | `2~~dv` | `2~~dv` | `2~~dv` |
| localStorage `cookieChoiceMade` | `true` | `true` | `true` |

## What is sent

The IAB strings, which is what a vendor is handed and may act on.

| | `reject` | `reject-unblock` | `accept` |
| --- | --- | --- | --- |
| **TCF purpose consents** | 0 of 11 | 0 of 11 | 11 of 11 |
| **TCF purpose legitimate interests** | 0 of 11 | 0 of 11 | 6 of 11 |
| **TCF special feature opt-ins** | 0 of 2 | 0 of 2 | 2 of 2 |
| **TCF vendor consents** | 0 | 0 | 2000 |
| TCF vendor legitimate interests | 2000 | 2000 | 2000 |
| **GPP sale / sharing / targeted** | opted out | opted out | not opted out |

## What the page can read

Variables and API answers, local to the page. Nothing here leaves the browser.

| | `reject` | `reject-unblock` | `accept` |
| --- | --- | --- | --- |
| **`OnetrustActiveGroups`** | `,C0001,` | `,C0001,C0002,C0003,C0004,C0005,V2STACK42,` | `,C0001,C0002,C0003,C0004,C0005,V2STACK42,` |
| **`OptanonActiveGroups`** | `,C0001,` | `,C0001,C0002,C0003,C0004,C0005,V2STACK42,` | `,C0001,C0002,C0003,C0004,C0005,V2STACK42,` |
| **`GetDomainData()` C0004** | inactive | active | active |
| `IsAlertBoxClosed()` | true | true | true |

## What happens on the page

| | `reject` | `reject-unblock` | `accept` |
| --- | --- | --- | --- |
| tag gated on C0001 | freed | freed | freed |
| **tag gated on C0002** | parked | freed | freed |
| **embed gated on C0003** | parked | freed | freed |
| **tag gated on C0004** | parked | freed | freed |
| **tag the site parked itself (C0002)** | parked | freed | freed |
| banner markup | removed | removed | removed |
| `OneTrustGroupsUpdated` fired | 1 | 1 | 1 |
| **`consent.onetrust` fired** | 0 | 1 | 0 |

## By category

Each cell reads: the value in the cookie `groups` field · whether the page is
told the category is on · what happens to a tag gated on it · whether an
`InsertScript()` call naming it goes in.

| | `reject` | `reject-unblock` | `accept` |
| --- | --- | --- | --- |
| C0001 | 1 · told · freed · inserted | 1 · told · freed · inserted | 1 · told · freed · inserted |
| **C0002** | 0 · hidden · parked · refused | 0 · told · freed · inserted | 1 · told · freed · inserted |
| **C0003** | 0 · hidden · parked · refused | 0 · told · freed · inserted | 1 · told · freed · inserted |
| **C0004** | 0 · hidden · parked · refused | 0 · told · freed · inserted | 1 · told · freed · inserted |
| **C0005** | 0 · hidden · parked · refused | 0 · told · freed · inserted | 1 · told · freed · inserted |
| **V2STACK42** | 0 · hidden · parked · refused | 0 · told · freed · inserted | 1 · told · freed · inserted |

`C0001` is strictly necessary and is never refused. `V2STACK42` is the IAB
stack group, which every IAB-enabled tenant sampled carries. A tag naming more
than one category needs all of them, so one marked `C0001,C0004` stays parked
wherever `C0004` does.

## Choosing

`reject` refuses, and nothing gated on a category other than `C0001` runs.

`reject-unblock` is **reject's record with accept's page surface**: every row
under *stored* and *sent* matches `reject` exactly, every row under *read* and
*page* matches `accept`. It is for a site that withholds content until you
agree - it satisfies the site's own check and frees its parked tags, while no
vendor or server is ever told you consented. The cost is precisely that those
tags execute; uBlock Origin still filters what they request.

`accept` grants: the cookie, every TCF vendor and the GPP string all say yes,
and a vendor receiving that string is entitled to act on it.

Keep `reject` global and escalate per site. The console line names which one ran:

```
[consent-rr] onetrust-reject 1.5.0 groups=,C0001, tcf=refused gpp=refused
[consent-rr] onetrust-reject-unblock 1.5.0 groups=,C0001,C0002,C0003,C0004,C0005,V2STACK42, stored=,C0001, tcf=refused gpp=refused
[consent-rr] onetrust-accept 1.5.0 groups=,C0001,C0002,C0003,C0004,C0005,V2STACK42, tcf=granted gpp=granted
```

Sizes: `reject` 36.1 KB, `reject-unblock` 36.1 KB, `accept` 36.1 KB.

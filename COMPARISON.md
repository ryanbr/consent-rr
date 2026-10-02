# Resources compared

Measured, not described: this file is written by `tools/comparison.mjs`, which
boots each built resource on a page its own consent manager would recognise and
records what it did. `npm run build` regenerates it and CI fails if the
committed copy has drifted.

Two parts: the three OneTrust modes row by row, because they are the same CMP
answered three ways and worth comparing closely, then every resource in the
repo side by side.

# The three OneTrust modes

From the OneTrust resources at **1.5.0**.
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

# Every resource, side by side

14 consent managers, 19 resources. Each one was booted on a page its own
consent manager would recognise, and the rows below are what it did there - the
globals it defined, the cookies it wrote, the signals it sent. A resource that
shares a page with another (the OneTrust three, the Civic two) was measured on
the same fixture as its sibling.

| Resource | Size | What it defines |
| --- | --- | --- |
| `onetrust-reject` | 36.1 KB | `Optanon`, `OneTrust`, `OnetrustActiveGroups`, `OptanonActiveGroups`, `__tcfapi`, `__gpp` |
| `onetrust-accept` | 36.1 KB | `Optanon`, `OneTrust`, `OnetrustActiveGroups`, `OptanonActiveGroups`, `__tcfapi`, `__gpp` |
| `onetrust-reject-unblock` | 36.1 KB | `Optanon`, `OneTrust`, `OnetrustActiveGroups`, `OptanonActiveGroups`, `__tcfapi`, `__gpp` |
| `cookieinformation-reject` | 10.9 KB | `CookieInformation`, `CookieConsent`, `CookieConsentDialog`, `cicc`, `cicl`, `isCookieInformationAPIReady` |
| `inmobi-reject` | 24.8 KB | `__gpp`, `__uspapi`, `__tcfapiui` |
| `osano-reject` | 34.0 KB | `Osano`, `__uspapi`, `__tcfapi`, `__gpp` |
| `civic-reject` | 22.8 KB | `CookieControl` |
| `civic-reject-unblock` | 22.8 KB | `CookieControl` |
| `cookiebot-reject` | 14.7 KB | `CookieConsent`, `Cookiebot`, `uetq`, `CB_OnTagsExecuted_Processed` |
| `securiti-reject` | 8.2 KB | `SecuritiSDK`, `__ScrtSdkApiOps`, `initCmp`, `setConsentBannerParams`, `showConsentPreferencesPopup`, `overrideThemeMatching` +4 more |
| `transcend-reject` | 5.2 KB | - |
| `cookiescript-reject` | 16.4 KB | `CookieScriptData`, `CookieScript` |
| `appconsent-reject` | 16.6 KB | `__tcfapi`, `appconsent` |
| `appconsent-accept` | 16.6 KB | `__tcfapi`, `appconsent` |
| `ketch-reject` | 13.0 KB | - |
| `ketch-reject-unblock` | 13.0 KB | - |
| `termly-reject` | 9.2 KB | `Termly` |
| `pubtech-reject` | 16.0 KB | `__tcfapi`, `__pub_tech_cmp_on_consent_queue__pre`, `__pub_tech_cmp_on_consent_queue`, `__pub_tech_cmp_consent_rr` |
| `usercentrics-reject` | 29.8 KB | `__ucCmp`, `UC_UI` |

## What each one stores and sends

| Resource | Cookies written | In localStorage | Google consent mode | IAB APIs | GPC changes it |
| --- | --- | --- | --- | --- | --- |
| `onetrust-reject` | `OptanonConsent`, `OptanonAlertBoxClosed`, `OTAdditionalConsentString`, `eupubconsent-v2` | `cookieChoiceMade` | - | `__tcfapi`, `__gpp` | yes |
| `onetrust-accept` | `OptanonConsent`, `OptanonAlertBoxClosed`, `OTAdditionalConsentString`, `eupubconsent-v2` | `cookieChoiceMade` | - | `__tcfapi`, `__gpp` | yes |
| `onetrust-reject-unblock` | `OptanonConsent`, `OptanonAlertBoxClosed`, `OTAdditionalConsentString`, `eupubconsent-v2` | `cookieChoiceMade` | - | `__tcfapi`, `__gpp` | yes |
| `cookieinformation-reject` | `CookieInformationConsent` | - | - | - | no |
| `inmobi-reject` | `euconsent-v2`, `IABGPP_HDR_GppString` | - | - | `__tcfapi`, `__gpp`, `__uspapi` | yes |
| `osano-reject` | `osano_consentmanager`, `osano_consentmanager_uuid` | `osano_consentmanager`, `osano_consentmanager_uuid` | default: granted security_storage, functionality_storage | `__tcfapi`, `__gpp`, `__uspapi` | yes |
| `civic-reject` | `CookieControl` | - | - | - | no |
| `civic-reject-unblock` | `CookieControl` | - | - | - | no |
| `cookiebot-reject` | `CookieConsent` | - | update: granted security_storage | - | no |
| `securiti-reject` | `__privaci_cookie_consents`, `__privaci_cookie_consent_uuid` | - | update: granted security_storage | - | no |
| `transcend-reject` | - | - | - | - | no |
| `cookiescript-reject` | `CookieScriptConsent` | - | update: granted security_storage | - | no |
| `appconsent-reject` | - | `IABTCF_CmpSdkID`, `IABTCF_CmpSdkVersion`, `IABTCF_DisclosedVendors`, `IABTCF_PolicyVersion` +13 more | - | `__tcfapi` | no |
| `appconsent-accept` | - | `IABTCF_CmpSdkID`, `IABTCF_CmpSdkVersion`, `IABTCF_DisclosedVendors`, `IABTCF_PolicyVersion` +13 more | - | `__tcfapi` | no |
| `ketch-reject` | `_ketch_consent_v1_` | - | update: granted security_storage | - | no |
| `ketch-reject-unblock` | `_ketch_consent_v1_` | - | update: granted security_storage | - | no |
| `termly-reject` | - | `TERMLY_API_CACHE` | default: granted security_storage | - | no |
| `pubtech-reject` | `pubtech-cmp-pcstring`, `euconsent-v2`, `ac_euconsent-v2` | `ac_euconsent-v2` | - | `__tcfapi` | no |
| `usercentrics-reject` | - | `ucData`, `uc_interaction_type`, `uc_user_interaction` | update: granted nothing | - | no |

Every one of them refuses; what differs is what each consent manager gives a
page to read, and therefore what a refusal has to answer.

The last column is measured by booting each one twice, with the clock and the
randomness pinned so the two runs differ in nothing but the signal, and then
comparing what the visitor is left carrying. The 5 it changes carry a
field for it to change - OneTrust's own `browserGpcFlag`, InMobi's
legitimate interest, Osano's opt-out. The 14 it does not have nowhere to
put it: every category is refused with or without the signal either way.

## What each one does to a parked tag

A tag the site parked behind a category, and one it parked behind nothing but
its necessary category, on the fixtures that have them.

| Resource | Parked tags after it ran |
| --- | --- |
| `onetrust-reject` | `nec: freed`, `ads: parked` |
| `onetrust-accept` | `nec: freed`, `ads: freed` |
| `onetrust-reject-unblock` | `nec: freed`, `ads: freed` |
| `cookieinformation-reject` | `nec: freed`, `stat: parked` |
| `civic-reject` | `stat: parked`, `content: parked` |
| `civic-reject-unblock` | `stat: parked`, `content: freed` |
| `cookiebot-reject` | `nec: freed`, `stat: parked` |
| `cookiescript-reject` | `nec: freed`, `stat: parked` |
| `termly-reject` | `nec: freed`, `stat: parked` |
| `usercentrics-reject` | `stat: parked` |

Where a consent manager parks tags in the markup, a refusal leaves them parked -
except the ones gated on nothing but a necessary category, which its own script
would run too. Osano and Securiti do not park tags in the markup at all: they
patch the DOM at runtime, so with them replaced there is nothing parked and
uBlock Origin does the blocking.

## What each one says

```
[consent-rr] onetrust-reject 1.5.0 groups=,C0001, tcf=refused gpp=refused
[consent-rr] onetrust-accept 1.5.0 groups=,C0001,C0002,C0003,C0004,C0005,V2STACK42, tcf=granted gpp=granted
[consent-rr] onetrust-reject-unblock 1.5.0 groups=,C0001,C0002,C0003,C0004,C0005,V2STACK42, stored=,C0001, tcf=refused gpp=refused
[consent-rr] cookieinformation-reject 1.0.2 approved=cookie_cat_necessary denied=cookie_cat_functional,cookie_cat_statistic,cookie_cat_marketing,cookie_cat_unclassified cookie=written
[consent-rr] inmobi-reject 1.0.0 config=read cc=IT lang=IT tcf=refused li=kept gpp=refused usp=1--- cookie=written gppcookie=written
[consent-rr] osano-reject 1.1.0 consent=ESSENTIAL denied=STORAGE,MARKETING,PERSONALIZATION,ANALYTICS,OPT_OUT tcf=refused li=kept gpp=refused usp=1--- cookie=written
[consent-rr] civic-reject 1.4.0 mode=gdpr revoked=analytics,embedded iab=off cookie=written
[consent-rr] civic-reject-unblock 1.4.0 mode=gdpr revoked=analytics accepted=embedded iab=off cookie=written
[consent-rr] cookiebot-reject 1.0.1 necessary=true denied=preferences,statistics,marketing iab=off cookie=written
[consent-rr] securiti-reject 1.0.0 consents=none tenant=read gcm=denied cookie=written
[consent-rr] transcend-reject 1.1.0 refused=Advertising,Analytics,Functional,SaleOfInfo via=setConsent
[consent-rr] cookiescript-reject 1.0.6 action=reject categories=strict cookie=written freed=1 removed=0 gcm=denied/default api=ready reload=reloading
[consent-rr] appconsent-reject 1.0.4 tcf=refused cmp=2/33/default cc=FR keys=17 state=absent drained=0
[consent-rr] appconsent-accept 1.0.4 tcf=granted cmp=2/33/default cc=FR keys=17 state=absent drained=0
[consent-rr] ketch-reject 1.1.1 purposes=2 denied record=revoked gcm=denied queue=ready drained=0
[consent-rr] ketch-reject 1.1.1 purposes=2 denied surface=granted stored=denied record=revoked gcm=denied queue=ready drained=0
[consent-rr] termly-reject 1.0.0 consented=essential denied=advertising,analytics,performance,social_networking,unclassified dns=true gcm=denied freed=1 api=ready tcf=off cache=written
[consent-rr] pubtech-reject 1.0.0 pc=0-000 tcf=refused cc=AA/default ac=empty queues=drained gtm=sent
[consent-rr] usercentrics-reject 1.4.0 settings=sROYKApBP lang=de revoked=none gcm=denied gpc=off cmp=v3 answered=true iab=off gpp=off data=written
```

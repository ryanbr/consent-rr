# extra/tealium.js, the notes

Everything learned while building the Tealium loader replacement:
what their object looks like, which builds were read, what each
decision traded, and the field reports behind it. The resource
itself keeps only what a maintainer needs at the point of use and
points here for the rest.

Resource replacement for the Tealium universal tag loader, served from
tags.tiqcdn.com/utag/`<account>`/`<profile>`/`<env>`/utag.js
Not a cookie-consent resource, though it answers a consent api where a
tenant compiled one in: it lives outside src/ and is not built into
dist/ by tools/build.mjs. Hand-maintained, ship as-is.
Read off forty-nine tenant loaders - elsgroup/actuel-rh,
cbsi/cbstve,
gendigital/ccleaner, foxcorp/fscom-main, tsb/tsb-uk-new, cdw/main,
epson/secglobal, hsbc/global-common-dotcom, ccl/main,
newbalance/nb-jnbo-new, barclaysuk/barclaycard-public,
academysports/main, hktdc/main, random/rhcorp-prh,
jysk-fynske-medier/partners, nordea/op-web and
newsinternational/dreamteam.2016, xe/xrates, williamhillgroup/es-web,
cbsi/webplex-marketing, newsltd/dt, virgin/main, prada/prada2019,
autodesk/global-sites from the .cn host, rasch/cash.ch,
vodafone/gr-universal, sony-marketing/hk, fullsail/fsmktg, humana/main,
royalmail/parcelforce, hsbc/global-hsbcnet,
axelspringer/ac-wieistmeineip, consumentenbond/adv-cb-nl,
newsinternational/thesun.irish.web.2, gendigital/avast,
sony-marketing/sid, canoneurope/mktg-nsos,
citi-popular-e/wizinkpublicweb, thehartford/hig-corporate,
nordea/com-web, drillisch/winsim.de, vodafone/ro-main-new, epson/india
and robert-bosch/global-pt-umbrella-web, 20kB to 1.5MB - and five
tag files: lbg/code utag.2.js at 515 bytes, and tsb's
utag.419.js, utag.263.js and utag.272.js at 37kB, 27kB and 12.6kB, 77kB
of vendors on one page.
Three generations are in there: forty-seven are utag.loader ut4.0, one is
ut4.46 and bofa's is ut4.48, with build stamps from 201812202215 to
202611260040\. barclaysuk is ut4.46.202609221137
and ships pretty-printed over 4496 lines, which is worth knowing before
counting anything in it: a pattern written for the minified form, like
view:function, matches none of it.
Eight years, three generations and both hosts, and all forty-nine publish
the same fifteen members in the same order.

Two corpora are quoted below and they are not the same size. Anything that
says `*the` `forty-four*` was measured before the four loaders behind the
AdGuard reports, and tm.pluto.tv, were added - the tag census, the template
sampling, the sha256 count, the consent-manager split. Those numbers were
not re-run over forty-nine, and saying forty-nine of them here would be a
guess rather than a measurement. Two of them,
barclaysuk and consumentenbond, ship pretty-printed rather than
minified, which is the other thing to know before counting: a pattern
written for one form finds nothing in the other.
That is why this pins the contract and
nothing about a build.
Their environment is not always prod either - barclaysuk serves from
PROD-A and ods from dev - so the path pattern takes a hyphen and a
capital there.
Count anything in these with a reader that does not care about line
length. Their longest lines run from 4.6k characters to 469k, and a
line-oriented search quietly answers zero on the big ones, which is how
three of the numbers here were wrong until they were counted again.
A page loads several of theirs at once, and only the first needs a rule.
A tag file's url is built by their own loader, in AS:

a.src = utag.cfg.path + 'ut'+'ag.' + a.id + '.js'

and that split string is why "utag." does not appear as a literal in any
of them. AS is a no-op on this object, so no utag.N.js is ever asked
for and no rule is needed for one.
utag.v.js is the third kind of line on such a page, and it comes from
two paths: utag/tiqapp/utag.v.js, and the tenant's own
utag/`<account>`/`<profile>`/`<env>`/utag.v.js. All three read were two bytes
and a comment. The payload is the query string either way,
a=`<account>`/`<profile>`/`<version>` with a cache buster, so it is a version
ping wearing a script's clothes. None of the loaders names it, so a tag
file or their companion asks for it rather than the loader. Nothing is
lost by blocking it and nothing is gained by replacing it.
All four publish the same fifteen members on window.utag, in the same
order: id o sender send rpt dbi db_log loader DB RP view link track
handler ut.

## Contents

- [What the page keeps](#what-the-page-keeps)
- [The shape of every remaining gap](#the-shape-of-every-remaining-gap)
- [One more known gap of the same kind](#one-more-known-gap-of-the-same-kind)
- [What is deliberately not there](#what-is-deliberately-not-there)
- [One known gap](#one-known-gap)
- [Where the consent work belongs](#where-the-consent-work-belongs)
- [Where a tenant compiled in their consent manager](#where-a-tenant-compiled-in-their-consent-manager)
- [What it refuses](#what-it-refuses)
- [What it clears](#what-it-clears)
- [A first-party host needs its own line](#a-first-party-host-needs-its-own-line)
- [What this fixes and what it cannot](#what-this-fixes-and-what-it-cannot)
- [Why that is not detected here](#why-that-is-not-detected-here)
- [Why this exists](#why-this-exists)
- [What it looks like to somebody using the site](#what-it-looks-like-to-somebody-using-the-site)
- [The ml.com one](#the-mlcom-one)
- [And a warning that came out of reading it](#and-a-warning-that-came-out-of-reading-it)
- [Notes on the members](#notes-on-the-members)
- [Mutation testing, and the four that cannot be killed](#mutation-testing-and-the-four-that-cannot-be-killed)
- [What their own tag files call, and why nothing was added for it](#what-their-own-tag-files-call-and-why-nothing-was-added-for-it)
- [A sync file can hide the page](#a-sync-file-can-hide-the-page)
- [What the clearing costs, and the one read that was free to lose](#what-the-clearing-costs-and-the-one-read-that-was-free-to-lose)

## What the page keeps

What the page keeps, because a page calls these itself:

```
view(data, cb, uids)    their own thin wrappers over track - theirs
link(data, cb, uids)    are literally
view:function(a,c,d){return this.track({
event:'view',data:a||{},cfg:{cb:c,uids:d}})}
track(a, b, c, d, e)    taking either their object shape or an event
name with the callback as the third argument
THE CALLBACK IS THE POINT. utag.link({...}, function(){ location =
somewhere }) is how a page defers a navigation until tracking says it
is done, and a stub that never calls back is a dead link. It is called
synchronously here, which keeps the user gesture a navigation needs;
theirs calls it once its senders have gone, which is the one
divergence that matters and is in the page's favour.
data                    window.utag_data where the page set one, left
exactly as it is rather than copied
id, cfg, o, sender, send, rpt, dbi, db_log, DB, RP, handler, loader
and ut, so a page or a tag reading any of the fifteen finds it
ut.vi                   their visitor-id minter, which answers the
empty string here: the one member whose job is
to create an identifier, and which builds it
out of the browser - navigator.plugins, then
screen.width + screen.height + parseInt(
screen.colorDepth || screen.pixelDepth), go
into theirs, so the id it mints is a
fingerprint with a random prefix
cfg                     with window.utag_cfg_ovrd copied over it, as
theirs does, so a page that set noview or
nocookie there reads it back
udoname                 utag_data, the global theirs merges into
utag.data as window[utag.udoname]
```

## The shape of every remaining gap

The shape of every remaining gap, which is worth stating once instead of
chasing: a tenant's extensions run inside utag.handler.extend, and they
put their own members on these objects. Forty-four loaders read, and the
ones that showed up in exactly one tenant each include
utag.customContainers, a container registry drillisch builds with
if (!utag.customContainers) utag.customContainers = {}; utag.target,
which vodafone fills with handleTargetResponse for Adobe Target;
utag.loader.chkCanRunTime, which thehartford defines; and
utag.gdpr.consent_updated, which canoneurope sets. None of them is the
loader's own, none exists on another tenant, and none exists at all
until the extension pass runs - which is the pass this refuses, and the
pass that reads the data layer on its way to a tag. A page on such a
tenant that calls one finds nothing, and there is no list of them to
complete: they are the tenant's code, not Tealium's api.

## One more known gap of the same kind

One more known gap of the same kind: utag.ut.sha256,
and md5 with it. Neither is the loader's own - both are installed by a
tenant extension, inside one of the utag.handler.extend functions, as
utag.ut.sha256 = function(t, n) { ... } over a crypto-js derivative.
Fourteen of the forty-four define it that way and nine mention an
ut.md5. The extension pass that installs them is part of what this
refuses, and the same extensions are the ones hashing
utag.data['customer_email'] on their way to a tag. A page that calls
utag.ut.sha256 itself therefore finds nothing, and would have found
nothing on the thirty tenants that never define it either.
Implementing a hash on
speculation looked worse than saying this: if a site turns out to call
it, it is a pure function and can be added.
Their consent config reads - cookieNS, domain, path, consentPeriod,
noqueue, noview, eventProfile, defaultConsentForDoNotSell and the dr and
track_sent flags - are left off on purpose, as are the two helpers whose
output shape would be a guess: getDeTokenizedContent, which belongs to
the prompt rendering this stops, and sortedObject. They are a tenant's
settings, every one
of them is read rather than called, and undefined is falsy, so a page
that looks at one gets an answer it can use instead of an exception.
Two classes of their names are left off wholesale, and knowing they are
classes saves enumerating them. Everything ending _old or Old -
initdata_old, END_old, RD_old, LR_old, trigger_old, RE_old,
setConsentValueOld - is how a newer build keeps the previous
implementation beside the current one. And the split-cookie helpers -
readIndividualCookies, prepareAndWriteCookies, convertCustomMultiCookies,
checkCookiesAgainstWhitelist, addExpFlag, containsExpFlag, writeCookie
and the rest - are a loader converting between the two cookie shapes,
which is work this resource has nothing to do: it expires both shapes
and writes neither.

## What is deliberately not there

What is deliberately not there, beyond the data-layer readers: utag.v_id,
because it is the identifier, and the loader internals it assigns to
itself as it runs - cl, cond, pre, runonce, initcatch, tagsettings and
the jdh trio - which no page reads and which only mean anything to a
loader that is loading tags. utag.pagevars is the page's own to assign,
and assigning it onto this object works as it would; nothing calls it,
because the pass that would is the one gathering the data layer.

## One known gap

One known gap: window.tealiumConsentRegister. Their loader only reads
it - no build assigns it - so it is their consent manager tag that
creates it, and that tag is one of the ones this stops arriving. A page
calling it directly rather than through utag.gdpr finds nothing, and
inventing a shape for it from four loaders that never build one would
be guessing.

## Where the consent work belongs

Where the consent work belongs, since this repo has a family per cmp and
none of them is Tealium: on a site whose cmp is OneTrust or Didomi or any
of the other twenty-nine, that family's resource owns the consent and
this one does not compete with it. This writes no consent record and
clears none - CONSENTMGR, which their own manager keeps, is named in this
file and never touched - and it claims no consent either, so there is
nothing here for another resource's state to disagree with.
The exception is the forty of the forty-four that compiled a manager in
at all, and the fourteen carrying its whole surface in particular. There
is no family for that cmp, so on those tenants this is the consent
resource, and the refusal below is doing consent work rather than
webcompat.
One interaction is worth knowing rather than guarding against: gdpr is
published whatever the tenant, because with the loader gone there is no
way to tell which build it was. On the thirty-eight without a manager a
page that feature-tests utag.gdpr finds one. Nothing is granted by that
- every answer below refuses - but a page written to prefer Tealium's
manager over its own cmp would take the Tealium path and get a refusal
instead of its cmp's answer. Gating it would mean guessing at a build
that is not there, and a refusal is the safe side of that guess.
Gating it on their CONSENTMGR cookie was the obvious idea and is the
wrong way round: that cookie exists only after their manager has
recorded a decision - their own code checks whether a visitor has
consented since a change and deletes it if not - and with the loader
replaced their manager never runs, so it never appears. The gate would
hold shut on the six tenants where this surface does real work, and a
first visit or a cleared jar would turn a preferences link from doing
nothing into throwing. Ungated errs towards more refusal; gated errs
towards an exception inside a consent ui.

## Where a tenant compiled in their consent manager

Where a tenant compiled in their consent manager, which most did,
utag.gdpr answers a refusal in the shapes their own enforcement reads:
getConsentState() a number, and 0 rather than 1, which is the value
their applyConsentState tests with parseInt(cs)!==1;
getSelectedCategories() an array, and an empty one, which their code
unshifts always_on onto; getCookieValues() an object; getEnforcementMode
a string, and none rather than opt-in: see the note at the member for
what that trades. The two prompts carry isEnabled false, since there is
no prompt to enable with no tag to run it.
Counted across the forty-four by whether a build defines
setConsentValue, which is the functional line rather than a reference
count: fourteen carry the whole manager, twenty-six carry its
enforcement half alone, and four have none of it at all - axelspringer,
epson/secglobal, foxcorp and xe. The fourteen refer to utag.gdpr
between 105 and 285 times where the twenty-six refer to it 41 to 54,
and it is those fourteen that carry the page-facing half: a cookie
preferences link calls showConsentPreferences(_lang) or
showExplicitConsent(_lang), and a tenant's own banner calls
setConsentValue(1), setAllCategories(false), setPreferencesValues(prefs,
noCollect) or setPreferencesFromList(list). All of them are here. The
setters take what they are given and drop it, because nothing stores and
no tag is waiting on a category, and the two show calls do nothing,
because no prompt arrives to be shown - a link that does nothing is
better than a link that throws, which is what a missing member gives.
getCategories() answers an array, empty, since the tenant's categories
arrive with the prompt this stops; shouldBlockTag() answers true, which
is the refusal their own
if (!utag.gdpr.shouldBlockTag(uid)) uids.push(uid) reads.

## What it refuses

What it refuses, all of it read off their loader: every utag.N.js tag
file, which is where the vendors are and which the loader is the only
thing that requests; the senders, which are image and script beacons
built in their own send and sender; the utag_main cookie, which is where
their visitor id, session id and session number live as v_id, ses_id and
_sn; and the data layer itself, which is the collection worth naming.
RDcp reads every cookie into o["cp."+name] and is in all six, as are
RDmeta, RDqp, RDdom and RDpv for the meta tags, the query string, the
document and the page variables. RDlocalStorage, which walks
Object.keys(window.localStorage) into o["ls."+key], and RDsessionStorage
beside it are in three of the six - cdw, gendigital and tsb - so
harvesting the stores is a build or a tenant setting rather than a
given, and ignoreLocalStorage turns it off where it is there. A tenant's
tags see all of it. None of those readers is on the object this
installs, which is the one place where being less complete than theirs
is the point.

## What it clears

What it clears: utag_main and every utag_main_* beside it, on the host
and every parent suffix of two labels or more, and only the ones in the
jar. Theirs comes packed or split: packed is one cookie carrying v_id,
ses_id, _sn and _se as sub-values, split is a cookie each, and their own
test for which is document.cookie.includes("utag_main_") - all
forty-four carry that machinery. Their visitor id is in one shape or
the other, and replacing the loader stops a new one being written
without taking away the one already there. With it, their visitor
attributes: RDva reads them back as readAttr(o, "tealium_va") and
readAttr(o, "tealium_va_" + account + "_" + profile), so both names go
from storage, which is why the url's two halves are kept apart and not
only joined into their id.
The rule it answers, and it needs both of their hosts: tags.tiqcdn.com
is the usual one, and tags.tiqcdn.cn serves the same loaders -
autodesk/global-sites comes from there, 700kB of it, and one of prada's
extensions rewrites a tag's src to that host for visitors on
prada.com/cn. One line covers both:

```
||tags.tiqcdn.*/utag/*/utag.js$script,redirect=tealium.js
```

or two, where a list would rather be explicit than wildcard a tld:

```
||tags.tiqcdn.com/utag/*/utag.js$script,redirect=tealium.js
||tags.tiqcdn.cn/utag/*/utag.js$script,redirect=tealium.js
```

The resource itself does not care which host it came from: the account
and profile come out of the path, and so does the environment, which is
not always prod - PROD-A and dev both turn up.

## A first-party host needs its own line

A first-party host needs its own line, and the one in hand is

```
||tags.stepstone.com/utag/*/utag.js$script,redirect=tealium.js
```

Tealium will serve the same loader from a tenant's own name, so neither
tiqcdn line reaches it. tags.stepstone.com is the one AdGuard has had to
allowlist; autodesk's tag config names tms.wape.autodesk.com, so the
shape to look for is a host serving /utag/`<something>`/utag.js, whatever
it is called.
pluto.tv is the same thing one step further. Their app config carries

```
"tealiumEnv":"https://tm.pluto.tv/pluto-tv-web/prod/utag.js"
```

and that is a real loader, 875kB of it, declaring id cbsi.pluto-tv-web
with cfg.path //tm.pluto.tv/pluto-tv-web/prod/. There is no utag segment
in the path at all, so every rule above misses it and it needs

```
||tm.pluto.tv/*/prod/utag.js$script,redirect=tealium.js
```

AdGuard allowlists their tiqcdn url rather than this one, so a page can
reach the same loader by either name.
What that costs is only the id string. account and profile feed nothing
else now that their records are cleared by prefix, so an underivable
path leaves utag.id empty and everything else - the fifteen members, the
entry points, the clearing - stands up as usual. Deriving a partial id
from such a path would be a guess: pluto-tv-web is the profile, and cbsi
is nowhere in the url to be read.
On such a host the path is a vanity one and says nothing true: that
loader is served from /utag/de/prod/utag.js and declares itself
id stepstone.stepstone-de, with cfg.path pointing back at
tiqcdn.com/utag/stepstone/stepstone-de/prod/. There are two segments
where this expects three, so no account and no profile come out of it
and utag.id is published empty. That is the honest answer rather than a
guess - de is not the account, prod is not the profile - and the only
thing it costs is their id string, which is theirs to read and not a
page's. What it must not cost is the clearing, which is why their
visitor attributes go by prefix: see the note at STORED.

## What this fixes and what it cannot

What this fixes and what it cannot, which are two different failures and
worth keeping apart. Blocking the loader outright breaks the page's own
code: the standard integration puts utag.view(utag_data) or utag.link in
an inline script, utag is then undefined, the call throws, and the rest
of that script block never runs - so whatever it was going to start
dies with it, whether or not it had anything to do with Tealium. That is
the failure publishing this object closes, and it is the whole argument
for a replacement over a rule that only blocks.
The other failure is not closed and cannot be from here: a tenant
deploys functionality through Tealium as well as tracking, and all of it
stops. Counted across the forty-four, their configs schedule 1420 tags,
a median of twenty per tenant and 254 at the most, each its own
utag.N.js. Which of them matter is not knowable here - the config
carries ids and flags, and the behaviour is in files this never fetches
- and prada's tag 14 below is exactly the case: a currency rate table,
so replacing their loader leaves prices unconverted. The lever for that
is a per-site exception, not a change to this file, and it is the honest
cost of the rule.

## Why that is not detected here

Why that is not detected here, asked and measured rather than assumed,
because the obvious answer is to work out which tags are worth keeping
and keep them. The key for it exists and is not per-tenant: every entry
in utag.loader.cfg carries tid, a template id global to Tealium, and the
forty-four use 124 distinct ones. tcat sits next to it and looks like a
category but is not one - tid 20010 appears under seven different tcat
values across these tenants, so it is the tenant's own labelling.
Two things kill it anyway.
The cfg lives inside the loader and nowhere else, so a detector has to
download the loader before it can decide anything: 21kB at the smallest,
a median of 323kB, 1.39MB at the largest. That is the whole of what
replacing it saves, spent before the first decision.
And it would buy almost nothing. Sampling one instance of each of the
top twenty-six templates, which cover 1227 of the 1420 tags, and reading
what each one contacts: twenty-five of the twenty-six send to a third
party - googletagmanager, connect.facebook.net, bat.bing.com,
analytics.tiktok.com, s.pinimg.com, snap.licdn.com, adsrvr.org,
c.amazon-adsystem.com, dpm.demdex.net, everestjs.net, arttrk.com,
cdn.brcdn.com. One contacts nobody. Exactly one entry of the 1420 has an
explicit src, and it is the currency table.
That table is also the answer to whether the rare one could be let
through: it is 3220 bytes of pure data, one tealiumiq_currency global of
timestamped rates and a single helper, no network and no behaviour of
its own. What converts a displayed price is the tenant's extension code,
which is the pass this refuses for the data-layer reads it makes - so
allowing the file would not put prada's prices back.
Which also answers the worry about a per-site list to maintain: there is
barely anything to put on one. Ninety-nine per cent of what rides on
this loader is tracking, and the breakage a visitor actually meets is
the page's own script throwing, which is handled above and tested.
A tag file is a separate request that nothing makes once the loader is
replaced, so no rule is needed for utag.N.js and blocking those buys
nothing. utag/tiqapp/utag.currency.js is the same thing wearing another
name: prada's loader has it as tag 14 in utag.loader.cfg, with an
explicit src of //tags.tiqcdn.com/utag/tiqapp/utag.currency.js that one
of their extensions rewrites to the .cn host for prada.com/cn. It is a
rate table, 3kB of it, declaring a tealiumiq_currency global for that
tag's own use, and AS is what asks for it - so it goes the way the
numbered ones go.
The version ping can go in a list if a list wants it, and one
line reaches both of its paths - tiqapp's and the tenant's own, and a
header that names only tiqapp is wrong, which is how it was written once:

```
||tags.tiqcdn.*/utag/*/utag.v.js$script
```

which costs a page two bytes of comment it never reads. That pattern
cannot take the loader with it, since the loader's name is utag.js and
this one asks for utag.v.js; and the redirect rule above cannot take
the ping, for the same reason in reverse.
utag.sync.js is the one line the rule above does not reach, because
utag.sync.js does not contain the string utag.js. It is theirs for sync
tags, the vendor snippets a tenant wants running before the page draws,
and the page carries that script tag itself rather than the loader
fetching it - no loader read here references it.

Six have now been read and the first guess about them was wrong. They are
not all empty and they do touch the api: pluto's and prada's are 109 bytes
of copyright line, bofa's is 606 and tsb's 843, hsbc's is 3.4kB, and
autodesk's on the .cn host is 166kB which calls utag.link, reads utag.data,
and fires Adobe Target and Audience Manager at cdn.tt.omtrdc.net,
dpm.demdex.net and their own personalize.ml.dhx.autodesk.com. Three of the
six also carry Adobe Alloy's pre-hiding snippet - body opacity to zero,
removed on a three-second timeout.

The .cn host serves it as well, so the rule takes the same wildcard the
redirect does:

```
||tags.tiqcdn.*/utag/*/utag.sync.js$script
```

Block it or point it here, either works. What must not happen is letting it
through while the loader is replaced: the pre-hiding would run with nothing
of theirs left to take the style off early, and a populated one would be
calling utag.link on a page whose loader is gone.
If a list points it here instead, nothing breaks: the id comes out of
that url too, and whichever copy runs second finds a loader already
standing and leaves it alone.
The account and profile come from the url, which is also where
their own id comes from, so the resource needs nothing per tenant.

## Why this exists

Why this exists, in somebody else's words: AdGuard carries four
allowlist entries for these loaders, which is what a network block looks
like when it breaks a site badly enough to need undoing -

```
@@||tags.tiqcdn.com/utag/cbsi/pluto-tv/prod/utag.js$domain=pluto.tv
@@||tags.tiqcdn.com/utag/bofa/ml/prod/utag.js$domain=ml.com
@@||tags.tiqcdn.com/utag/cbsi/webplex-intl/prod/utag.js$domain=
southpark.de|southpark.lat|southparkstudios.com.br|
southparkstudios.com
@@||tags.stepstone.com/utag/de/prod/utag.js$domain=stepstone.de
```

All four were read for this file. All four publish the same fifteen
members and declare the id this derives from their path, bofa on a
ut4.48 loader, which is a generation newer than anything else here.
Nothing in those entries asks for anything beyond letting the request
through - no $important, no $script, just a domain - so what a block
broke there was not a rule that needed tuning. It was the page. Two of
them show it in their own markup: southparkstudios.com embeds
"tealiumTagManagerConfig":{"settings":{"account":"cbsi",
"profile":"webplex-intl" and hangs a tealiumClickData field off every
nav entry, which is their click handler's argument to utag.link, so an
absent utag throws inside a handler and the link stops working; pluto.tv
carries "tealiumEnv" in __NEXT_DATA__ and loads the file from it at
runtime. An allowlist entry fixes both by handing the whole loader back,
tags and all. A redirect fixes them by answering the call instead, which
is the case for replacing rather than blocking.

## What it looks like to somebody using the site

What it looks like to somebody using the site, from the report those
entries came out of - AdguardFilters issue 219502, filed against
pluto.tv on an on-demand episode and labelled critical: "Il video non
parte (rimane in buffering) con adguard attivo", the video does not
start and sits buffering, and it plays as soon as the blocker is off.
Not a cosmetic break and not a missing pixel: the player never starts.
Two things in that thread are worth keeping.
The same block reached their console app through AdGuard's DNS list -
"Pluto tv app refuses to load. It says they're having issues" - and
another reader reported the same for paramount, which is another cbsi
tenant. What was done in the end was to stop blocking tags.tiqcdn.com
on that list at all.
A redirect cannot help that case, and it is worth being plain about it:
there is no scriptlet in a console app, and a DNS answer is given before
anything can be replaced. What this closes is the browser half, and it
closes it twice over - the page gets an object whose entry points answer
and whose callbacks run, and the request itself succeeds, so a script
element's onload fires where a blocked one fires onerror or nothing. An
app that waits on either before starting playback gets what it waited
for.

## The ml.com one

The ml.com one, which is the case for answering the request rather than
for answering the api, and which was predicted wrong here before it was
tested. AdguardFilters issue 219435: "The website just hangs. I can't
even click the login portion to login." Their page bundle makes no call
into the api at all - no view, no link, no track, nothing on utag.cfg or
utag.data - and the reading here was that this resource could not help
them. It does: the hang does not reproduce with it in place. So what
they were waiting on was the request, not the object, and a redirect
answers that at 200 where a block answers it with onerror or with
nothing. The api is the second route, not the only one, and on a page
that never calls it the first route is the whole fix.
What their page does have is a queue. It pushes customError,
manualLinkClick, rescanDOM, productview, impressions and the rest into
window.bactmQueue, and drains it on a bactm_libload event, gated on
window.bactm existing; one more handler, the footer feedback click, is
attached only if window.bactm.plugins.feedback.launch is a function.
window.bactm is built inside bofa's own extensions - it sits in their
loader at offset 264466 wrapped in the usual if(!utag_condload) guard,
and the loader dispatches bactm_libload from the same code - so it is
the extension pass that makes it, which is the pass this refuses. With
this resource that queue stays undrained and that handler stays
unattached, and the page works anyway: nothing of theirs waits on
either, so the queue simply sits there with the analytics calls it
collected going nowhere, which is the refusal doing its job.
That is also the reason this dispatches no events, ever. Firing a ready
event of theirs would make a page like that one drain its queue into a
facade that does not exist and throw on the first method it reached.
Staying silent is what keeps an undrained queue harmless, and a test
holds it.
So of those four entries, three are answered: pluto.tv, whose player
waits on the request; southparkstudios.com, whose click handlers call
utag.link; and ml.com, by field test rather than by reading. stepstone.de
answers 403 to a fetch and was not read either way.
Their login is not gated on bactm anywhere in that bundle, so what hung
it is still not established - only that it stops hanging once something
answers that url.

## And a warning that came out of reading it

And a warning that came out of reading it: do not widen the rule to the
host or to /utag/*. ml.com's config loads an Adobe Launch property from
tags.tiqcdn.com/utag/`<hash>`/`<hash>`/`<hash>`/hostedLibFiles/EP`<hash>`/,
which is the same path prefix and nothing to do with the loader. The
rule above names /utag/*/utag.js and leaves that alone, which is the
point of naming the file.
STORED, their visitor attributes, cleared by prefix rather than by name.

The record is tealium_va, and a tenant's is tealium_va_`<account>`_
`<profile>` beside it. Computing that second name needs the account,
which a first-party vanity path does not carry - stepstone's says
de/prod and their account is stepstone/stepstone-de - so a computed
name leaves the record sitting there. A prefix reaches it without
knowing any of that, and it is what the cookie pass already does for
utag_main and utag_main_*. The underscore is the whole guard: it
keeps a page's own tealium_vault out of it. Names are enumerated
with key(), values are never read, and removeItem is reached only
for a key just seen - so an unrelated store is walked and left
alone, where the old names were removed whether or not they existed.

## Notes on the members

Notes on the members, which used to sit beside them in the code and
shipped with them: uBO drops a comment only at column zero, so prose
indented into the body goes out to every user, and half of what this
resource shipped was these. Same words, moved out of the way. Each is
named by the member it belongs to.

### `IN_URL`

Their own id is account.profile - id:"elsgroup.actuel-rh" in the
loader for /utag/elsgroup/actuel-rh/prod/utag.js - so the url the
redirected element still carries is where both halves are. Checked
against the id each loader declares for itself on seventeen
tenants, hyphens and dots included: jysk-fynske-medier.partners and
newsinternational.dreamteam.2016 are both theirs, which is why the
two halves take a dot and a hyphen and not just word characters.

### `COOKIE`

Their cookie, and the one thing in it worth taking away: v_id, read
back as o["cp.utag_main_v_id"] and handed to the data layer as
tealium_visitor_id. ses_id and _sn ride along in the same cookie.

### `stored`

Their visitor attributes, read back by RDva as
readAttr(o, "tealium_va") and
readAttr(o, "tealium_va_" + o["ut.account"] + "_" + o["ut.profile"]).
Replacing the loader stops new ones arriving and leaves whatever is
already there, so both names go - localStorage is the one they read,
and the other store costs a call to be sure.

### `forget`

One read of the jar, and only to find out whether there is anything
to expire: a name that is not in document.cookie has nothing to
expire at any suffix either, since a cookie set on a parent domain
is in document.cookie as well.

### `was`

Counted by what the store lost rather than by what was asked
of it: removing a key that was never there is a no-op, and a
count of the asking would say two on an untouched store. The
length of a store is a count and not a read of anything in
it.

### `the empty-store guard`

An empty store has nothing of theirs in it, so the removals
and the second count are both waste - and an empty store is
exactly what a first visit looks like.

### `held`

One read of the jar, and the names come out of it rather than
out of a list, because theirs comes in two shapes. Packed is one
utag_main carrying v_id, ses_id, _sn and _se as sub-values.
Split is a cookie each, named utag_main_v_id and the rest, and
their own test for it is
document.cookie.includes("utag_main_") - all forty-four read
carry that machinery, behind
utag.cfg.split_cookie. The underscore is what keeps a page's own
utag_mainly out of it.

### `data`

The data layer is the page's own object. Theirs reads it and adds
its own several hundred keys; this one hands back what the page put
there and nothing else, by reference, so a page that keeps writing
to window.utag_data keeps seeing it on utag.data as it would.

### `answer`

Their callback, called rather than dropped. A page that passes one
is usually waiting to navigate.
No catch of its own: track wraps every call to this, so one here
would be unreachable - and a guard nothing can reach is a guard
nothing can check.

### `ut`

Their utilities, as far as they are pure. vi mints a visitor id, so
it answers the empty string; flatten and loader are theirs to use on
data this one does not gather.
Their helpers, written to their own implementations rather than to
what the names suggest - the ten loaders read carry the same bodies,
from the 2018 build to this month's, and a page that calls one of
these should get their answer and not a near miss.

### `merge`

merge(a, b, c): c decides. Theirs overwrites when it is truthy
and fills only what is undefined when it is not, and the second
is the call their own loader makes.

### `loader`

The queues a page or a tag pushes to, and the named calls theirs
exposes. Not the RD readers - RDcp, RDlocalStorage, RDsessionStorage,
RDmeta, RDqp, RDdom, RDpv, RDva, RDut, RDses - which are the data
layer being gathered, and are the one part of their surface this is
deliberately missing.

### `cfg`

Their tag config map, keyed by tag id and read in all forty-four
as utag.loader.cfg. Empty here, which is the truth: no tag is
configured to run.

### `INIT`

The entry points theirs calls on itself, in case something on
the page reaches for one to re-run the loader, and their cookie
removers, which have nothing left to remove. GET is in every
loader read and is where theirs starts: it sets utag.cl, calls
utag.pre() and installs the extension pass.

### `getEnforcementMode`

none, and that is a decision taken for the page rather than
against it. Their own enforcement returns early on it -
if (enforcementMode === 'none') return - so none reads as
nothing being gated, which is what page logic usually treats as
no consent being needed.
opt-in was the other answer, and it says the stronger thing:
tags are gated, which here is true in the strongest sense since
none of them will run at all. It breaks two page shapes though,
and both are common. A page that withholds an embed until
marketing consent sees enforcement on with getConsentState() 0,
reads it as a visitor who has not consented, and keeps the embed
hidden. And a page that draws its own banner keeps drawing it,
because the setters here drop and the record their manager keeps
in a CONSENTMGR cookie - barclaysuk refers to it nineteen times,
tsb reads it back as cp.CONSENTMGR - is never written. Theirs
cannot re-prompt, since their prompt arrives with the consent
manager tag this stops, but a tenant's own code can.
What none does NOT do is claim a consent. getConsentState stays
0, the categories stay empty, and the tag filters still refuse,
because the shape that actually costs a visitor something is
if (getConsentState() === 1) { inject vendor } - a page told yes
goes and loads the tracker itself, which is worse than an embed
that stays hidden. If a site gates content on that value rather
than on the mode, lift the rule for it.

### `setConsentValue`

Their setters, taken and dropped. setConsentValue(1) is a page
granting, and there is nothing to grant to and nothing here that
stores: no tag is waiting on a category and no cookie is written
either way.

### `showConsentPreferences`

The two a preferences link calls, theirs taking a language. No
prompt arrives to be shown, so a link that calls one of these
does nothing - which is what a link whose script was replaced
can do, and is better than the exception it would throw if the
member were missing.

### `shouldBlockTag`

if (!utag.gdpr.shouldBlockTag(uid)) uids.push(uid) is how the
ut4.0 builds filter a track call's uids, so true is the refusal
and leaves that list empty. ut4.46 asks the question the other
way round, as shouldTagFire, so that one answers false. Both are
here because a page on either generation may ask either.

### `showDoNotSellBanner`

What ut4.46 added, and the page-facing half of it first: a do
not sell link calls showDoNotSellBanner, and their own flow
reaches it through
if (!utag.gdpr.dns.getDnsState()) { showDoNotSellBanner() }.
That call site is all their loader has - getDnsState itself is
defined in the consent manager tag, which is one of the ones
this stops arriving, so the answer below is read off the call
and not off an implementation. true says the visitor is already
opted out of a sale, which they are, since nothing is collected
to sell, and it is also what keeps their banner from being asked
for. Their own flow never reaches it in any case: doNotSell is
{} here, so the isEnabled it tests first is undefined, and dns
is here for a page that calls it rather than for them.

### `updateConsentCookie`

The cookie writers ut4.46 exposes, taken and dropped like the
rest. updateConsentCookie is also reachable without touching
gdpr at all - their track handles an update_consent_cookie
event with a consent_categories payload - and that path lands on
the same refusal, since this track stores nothing whatever the
event says.

### `getTraceId`

Their trace feature, which a page can ask for. No trace is
running with no tag to trace, so the answer is the empty
string rather than a missing member.

### `typeOf`

Their own helpers live on gdpr as well as on ut, and their
enforcement calls utag.gdpr.typeOf itself, so these are the same
implementations rather than second ones.

### `consent_prompt`

categories beside isEnabled, because a page that reads a
prompt's categories to draw its own list would otherwise be
iterating undefined. Theirs guards that with
if (!Array.isArray(_prompt.categories)) return []; a page has no
reason to.

### `cfg`

Their cfg carries the tenant's build settings, and theirs merges
window.utag_cfg_ovrd over them - a page that sets noview or
nocookie there reads it back on utag.cfg, so it is copied in. By
value, since it is the page's own object and this one has no
settings of its own to defend.

### `extend`

Arrays in all forty-four, and the place a tenant's extensions
live: utag.handler.extend = [ function(a, b){ ... } ] with
utag.handler.cfg_extend = [ { id, blr, alr, ... } ] beside
it. Empty here, and that is the extension pass this
refuses rather than an oversight - those functions are
where a tenant reads utag.data['customer_email'] and the
rest of the data layer. A page that pushes to one of them
finds an array to push to, and nothing that will run it.

### `udoname`

The name of the global their loader merges into utag.data, which
theirs reads as window[utag.udoname]. utag_data is the default
and the one this resource took its data from.

### `claimed`

A page element with id="utag" is a named property of the window, so
what is standing there may be a tag rather than a loader. Only a
loader - an object carrying their track - is left alone.
The "///" line above is the resource header uBO reads, and a comment to
JavaScript. uBO drops these "//" lines when it parses.

## Mutation testing, and the four that cannot be killed

Eighty-one mutations run against this file, and seventy-seven die. The four
that live are equivalent mutants - the mutated file behaves exactly as the
original, so no test can tell them apart - and they are listed here so the
next person does not go hunting for a test that cannot exist.

**flatten keeps an empty object**

Their flatten drops an empty object rather than recursing into it. Dropping nothing and recursing into nothing produce the same output, because there is nothing in it either way.

**clears whether or not it is there**

Expiring a cookie that is not in the jar writes an expiry for a name nobody holds. The jar afterwards is identical.

**works an empty store anyway**

Removing the `was === 0` guard changes nothing now that keys are enumerated rather than computed: an empty store yields no names, so the loop never runs and the count stays zero. The guard says "do not touch an empty store" and is kept for that, not because it is observable.

**counts asking, not losing**

done.storage counts what the store actually lost. Counting what was asked for instead used to differ, because the old pass called removeItem for two computed names whether or not they existed. Clearing by prefix only names a key it has just seen, so asked and lost are now the same number.

The last two became equivalent with the prefix rewrite - the code got more
precise, and two mutations that used to be distinguishable stopped being
so. A fifth, which dropped the profile from the computed name
`tealium_va_`<account>`_<profile>`, was deleted rather than re-pointed: that
name is not built any more, and the two mutations that replace it - going
back to an exact name, and dropping the underscore so the prefix catches a
neighbour - both die.

## What their own tag files call, and why nothing was added for it

Thirty tag files were read for this - one instance of each of the
twenty-six most-used templates, plus four of prada's - and every `utag.*`
reference in them was diffed against what this publishes. They are the best
corpus for the question, because unlike the loaders they are written
`*against*` the loader's api.

Everything structural is already answered. They use `utag.loader.GV`,
`LOAD`, `RC`, `SC`, `cfg` and `f`; `utag.handler.C`; `utag.ut.flatten`,
`hasOwn`, `isEmpty`, `isEmptyObject`, `merge`, `typeOf`, `vi` and `loader`;
`utag.DB` 460 times across all thirty; `utag.o`, `utag.sender`, `utag.view`,
`utag.link`, `utag.data`, `utag.gdpr.getConsentState`,
`getSelectedCategories` and `getCookieValues`. All present.

What is left splits three ways, and none of it is reachable, because a tag
file only runs if the loader loads it and this never does.

```
utag.mobile, utag.init_mobile, utag.target, utag.datacloud,
utag.enableRemap, utag.ut.adobeViewScriptRequested,
utag.ut.gtagScriptRequested, utag.data.targetdata_uid
    Tag-side or extension-created. No loader of the forty-nine assigns
    mobile or init_mobile at all; the rest are a tenant's own, which is
    the class already described above.

utag.ut.md5
    The documented hashing gap, alongside sha256.

utag.cfg.utagdb, utag.cfg.utid, utag.tagsettings, utag.globals
    Loader-provided, and deliberately not published. utagdb is `false`
    on all forty-nine. utid is `account/profile/buildstamp` - the stamp
    is their build's and cannot be known here. tagsettings is assigned
    by twenty of the forty-nine and globals by thirteen, both as
    `window.utag.<name> || {}`, so theirs does preserve a value a page
    set first.
```

That last group was added and then reverted. Publishing it changes nothing
a page can observe - an absent `cfg.utagdb` reads `undefined`, which is as
false as `false` - and a test already pinned `tagsettings` as an omitted
internal next to `cl`, `cond`, `pre`, `runonce` and `initcatch`. Reversing
a decision a test is holding needs a reachable consumer, and there is none:
the only code that reads these is a tag file or an extension.

## A sync file can hide the page

A sync file can hide the page: Worth knowing before anyone makes `utag.sync.js` a redirect instead of a
block. It is not always a sync tag loader. bofa's is Adobe Alloy's
pre-hiding snippet and nothing else:

```
element.innerText = "body { opacity: 0 !important }";
document.head.appendChild(element);
setTimeout(() => { element.parentNode.removeChild(element) }, 3000);
```

tsb's does the same with the same three-second timeout. Of five sampled,
two hide the page that way; pluto's and prada's are 109 bytes and hsbc's
3.4kB without it. Blocking the file means the page is never hidden, which
is the outcome to want. Allowing it while the loader is replaced means the
page is hidden until whatever removes the style runs - here a timeout that
self-heals, but that is theirs to change.

ml.com's own bundle builds that url and appends it, so this file arrives on
some pages whether or not the loader does, which is the one route by which
a tag-side file runs against this object at all. It touches nothing on
`utag`.

## What the clearing costs, and the one read that was free to lose

Measured per boot, on a page with a store of its own:

```
page keys     key()   length   removeItem
0                 2        3            2
500             502        3            2
2000           2002        3            2
```

`key()` is one call per key and that is what enumeration costs - the price
of reaching a record whose name cannot be computed on a vanity path. The
page's own keys are read by name only, never by value: `getItem` is never
called, which is the line that matters, since reading values out of a store
is what RDlocalStorage does on its way to a tag. Nothing of the page's is
removed - 500 keys in, 500 keys out.

`length` used to be 2006 of those reads at 2000 keys, because the walk
asked the store for its length on every turn: `i < store_.length`. That
length was already in hand as `was`, read once before the walk to count the
delta afterwards, and nothing is removed until the walk finishes, so it
cannot go stale. Using it drops the reads to three regardless of how big
the store is - three rather than four because an empty sessionStorage
short-circuits before the delta read.

A mutation that truncates the walk to one key is killed, so the bound is
under test rather than merely correct today.

The rest of the per-boot cost is inherent and already documented: one
cookie read, and names times domain forms writes to expire what is there,
because an expiry has to name both and the jar does not say which domain
form a cookie was set with.

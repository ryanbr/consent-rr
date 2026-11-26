# extra/optimizely.js, the notes

What the Optimizely Web Experimentation replacement does, what it keeps
working for a page, what it refuses, and what it costs. The resource is
hand-maintained and ships as it is, so the notes live here rather than in
its header.

Unlike the other two in this directory, this one was not written against a
corpus of their builds. What is below is read off the resource and
measured, and it says so where a claim has no evidence behind it yet.

## Contents

- [What this is, and the rule](#what-this-is-and-the-rule)
- [What a page keeps, and what it loses](#what-a-page-keeps-and-what-it-loses)
- [What it publishes, measured](#what-it-publishes-measured)
- [What it costs per page](#what-it-costs-per-page)
- [Notes on the members](#notes-on-the-members)
- [The mutation sweep](#the-mutation-sweep)
- [What is not done here](#what-is-not-done-here)

## What this is, and the rule

Resource replacement for the Optimizely Web Experimentation snippet,
served from `cdn.optimizely.com/js/<projectId>.js`:

```
||cdn.optimizely.com/js/*.js$script,redirect=optimizely.js
```

The same client is also served for Performance Edge, at a different shape
that the resource reads as well - though no rule here points at that path,
because no file served from it has been checked:

```
/public/<account>/<project>/<revision>_<hash>_edge_helper.js
```

A redirect leaves the script element carrying the url it was going to
fetch, which is the only place the project's identity survives - the
snippet url gives the project id alone, and the edge url is the only shape
that also carries the account and the revision.

It is not a cookie-consent resource: it lives outside `src/` and
`tools/build.mjs` does not build it into `dist/`.

## What a page keeps, and what it loses

Its own header puts it best, and that text is preserved here: the page
keeps a working `window.optimizely` - push, get, initialized and the
lifecycle listeners, plus the flat Classic api for the projects whose
snippet predates the migration - so code that queues commands or waits on
the client proceeds.

What it loses is everything the real client does with them: no experiment
or campaign data, no variation DOM rewriting, no redirect experiments, no
visitor profile, no `optimizelyEndUserId` or session cookies, no
localStorage, and no beacons to `logx.optimizely.com`,
`rum.optimizely.com` or `prediction.cmab.optimizely.com`.

## What it publishes, measured

Booted against `cdn.optimizely.com/js/123456.js`, the object carries 54
top-level members, all enumerable and all own properties. The modern ones
are `push`, `get`, `initialized`, `state`, `data`, `revision` and
`timeout`; the rest are the Classic flat api, from `activate` and
`bucketUser` through `trackEvent`, `variationMap`, `optOut`,
`optOutThirdPartyCookies` and the Site Catalyst and Universal Analytics
hooks.

`get('state')` answers with their state surface - `getActivationId`,
`getActiveExperimentIds`, `getCampaignStates`, `getDecisionObject`,
`getDecisionString`, `getExperimentStates`, `getPageStates`,
`getRedirectInfo`, `getTrafficExclusionStats`, `getCampaignStateLists`,
`getVariationMap` and `isGlobalHoldback`, twelve in all - and
`initialized` reads true, so a page that waits on the client does not wait
forever.

It declines to publish anything if a real client is already there: an
existing `window.optimizely` that is not an array and answers `get` is
left alone.

## What it costs per page

```
file on disk      27693 bytes
injected          25625 bytes   (31495 before the comments moved here)
compile           0.185 ms (median of 200)
boot              0.30 ms (median of 25, in jsdom)
timers            0
listeners         1 at boot, DOMContentLoaded once, for the lifecycle
cookie reads      0
cookie writes     0
storage calls     0
requests          0
```

Two more listeners exist but are conditional: `popstate` and `hashchange`
go on only when something subscribes to a url change.

Compile and boot are the same before and after the trim, within the noise
of the measurement - comments cost download, not time. What the trim
bought is the 5870 bytes. An earlier version of this table recorded boot
as 1.12ms from a different harness; the figure above is the one that can
be compared with the line beside it, since both were taken the same way.

Every zero in that table is pinned by a test that wraps the accessor
rather than reading the result afterwards: `document.cookie` both ways,
all five methods on `Storage.prototype`, `fetch`, `sendBeacon`,
`XMLHttpRequest`, `getTimezoneOffset`, `navigator.userAgent`, script
insertion, and `addEventListener` on window and document. The expected
record is one line long.

## Notes on the members

These were comment blocks inside the resource, where every indented line
ships to a user. Each is reproduced here with the declaration it belongs
to, and the resource keeps a single line in its place. That is the same
arrangement tealium and perimeterx use.

### `identityFromScript`

```
const identityFromScript = ( ) => {
```

The request was redirected, not the element, so the script still carries
the url it was going to fetch - the only place the identity of the project
survives. Two shapes: `/js/<project>.js`, which is the snippet and holds
the project id alone, and
`/public/<account>/<project>/<revision>_<hash>_edge_helper.js`, which is
the same client served for Performance Edge and is the only shape that
carries the account and the revision as well.

### `releaseObserver`

```
const releaseObserver = ( ) => {
```

Nothing left to watch means the records the engine builds for every
childList change under the root are built for no one, so the observer goes
rather than idling for the life of the page. The next register makes a new
one.

### `drop`

```
const drop = entry => {
```

False means the entry is spent and should go. A callback can register
another observer, which scans itself and may remove entries, so the index
a loop is holding cannot be trusted afterwards - removal is by identity,
and registering scans the new entry alone rather than all of them, which
keeps a nested call from rescanning the document.

### `pollGroups`

```
const pollGroups = new Map();
```

Their poll keeps one interval per distinct period with a map of callbacks
on it, so ten waiters at the default period are ten calls a tick on one
timer rather than ten timers. Keyed by token, not by the function, so the
same callback can wait twice and cancel once.

### the waitUntil guard

```
if ( condition() ) {
```

No guard on condition: theirs calls it straight away, so a value that is
not callable throws inside the executor and the promise rejects. Guarding
here would leave it pending for ever instead.

### `historyPatch`

```
let historyPatch = null;
```

The wrappers installed for the current subscriptions; `active` is cleared
on the last unsubscription, so a wrapper which stays wrapped by another
script only calls the method and does not notify again.

### `pushState`

```
const pushState = w.history.pushState;
```

Captured for these wrappers only: the shared variables are set again by
the next subscription, possibly to a wrapper of another script which calls
these wrappers.

### restoring history.pushState

```
if ( w.history.pushState === ourPushState ) {
```

Put the natives back only while ours are still the ones installed. Another
script may have wrapped history after us, and restoring over that would
unhook it - theirs checks the same identity before restoring.

### `persistHtml`

```
const persistHtml = (html, selector, placement) => {
```

Theirs re-inserts the markup if the page removes it, which is what the
persist means. This inserts once: the re-insertion exists for variation
code, and no variation runs here.

### `LOG_LEVELS`

```
const LOG_LEVELS = { OFF: 0, ERROR: 1, WARN: 2, INFO: 3, DEB
```

Their logger buffers every line and prints nothing until a level is set -
shouldLog is false while logLevel is null, which is how it starts - so a
normal page sees a silent console. These lines appear the same way theirs
do: push({type:'log', level:'WARN'}), or the legacy push(['log']), which
means INFO. Levels, wording and the complaint about an unknown level are
all theirs.

### `visitor`

```
const visitor = {
```

get('visitor') is assembled from their profile providers, one per key,
each declaring what it provides. Fourteen appear in every snippet read;
the eight marked below are bundled only when a project's audiences ask for
them, and they are here anyway so a page reading one does not meet
undefined. dcpData is the Dynamic Customer Profile key, registered with
the dynamic_customer_profile audience matcher; theirs fetches it, so it is
an empty object here for the same reason location is an object. Nothing
about the visitor is measured: strings are empty, maps are empty, and
location is an object rather than absent, because a property chain into it
is exactly what their own geo.js walks. campaign is singular and holds
their utm_campaign value; campaigns, with an s, is a key of data and not
of this. first_session is true because theirs is true when the event
history is empty, and this one always is. lineItems and dimensions were
mine and are declared by no snippet: dimensions is project data, not a
visitor key.

### `visitor.currentTimestamp`

```
Object.defineProperty(visitor, 'currentTimestamp', {
```

Theirs marks this one lazy, so a read takes the time of the read.

### `RECENCY_FILTERS`

```
const RECENCY_FILTERS = [ 'most_recent', 'least_recent' ];
```

get('behavior') is registered as a plugin by every snippet seen, so it has
to answer. Their three methods read the visitor event store, which here
holds nothing, and the argument checks below are theirs: a page that
passes a bad descriptor should still hear about it.

### the reduced query

```
return spec.reduce ? undefined : [];
```

Theirs executes the spec then takes the first element when a reduce is
asked for. Executed against no events that is an empty list, so a reduced
query has nothing to hand back.

### the jquery module

```
if ( name === 'jquery' ) { return w.$; }
```

Theirs does not bundle jQuery, it borrows the page's: env/jquery reads a
closure-scoped $ if there is one and otherwise window.$, and it never
looks at window.jQuery. So a page that called noConflict - jQuery present,
$ gone
- gets undefined from theirs, and gets undefined here. A fallback to jQuery
would be answering something they do not.

### the event_emitter module

```
if ( name === 'event_emitter' ) { return eventEmitter; }
```

Declared below, and only ever reached once the api is installed.

### `register`

```
const register = spec => {
```

Their emitter puts a token on the spec it was handed when it has none, and
hands the same token back, which is the only way a page learns the one it
must pass to removeListener.

### `eventEmitter`

```
const eventEmitter = {
```

get('event_emitter') is in their module registry beside state and data. on
takes the spec and returns its token, off takes the bare token.

### `commandsV0`

```
const commandsV0 = {
```

Their push picks a table by version: the array and string forms are
version 0, an object carries its own or defaults to 1, and the third table
in their client is empty, so a version 2 call finds nothing. A name in the
wrong table is refused there as well, which is why this is two lists and
not one - push('activate') is a version 0 call for a version 1 name, and
their answer to it is false.

### `HIGH_PRIORITY`

```
const HIGH_PRIORITY = [
```

Their push takes a second argument, used once while the client boots:
window.optimizely = window.optimizely.filter(c => !push(c, true)) runs the
six names below out of the queue early, before the opt-out and disable
checks, and leaves everything else in the array for the normal drain. With
the flag set, any other name is ignored and reports false, and that
happens before the table is consulted, so an unknown name is refused
quietly rather than warned about.

### `classicData`

```
const classicData = {
```

Optimizely Classic, the product before this one, is still served for
projects last saved before the migration, from the same `/js/<id>.js`
path. It puts its whole api straight on the object instead of behind push
and get, and their own bundled mode ships both at once, so the two
surfaces sit together here the way they do there. Every method is a no-op;
the maps are the empty ones a project with no running experiment has.
referrer stays empty for the reason it is empty in get('visitor'): theirs
reads document.referrer and this does not.

### the Classic method table

```
classic[name] = hasOwn(commandsV0, name) ? commandsV0[name] 
```

Eleven of these are also v0 push names, and in Classic the method and the
pushed command are the same function, so a page gets the same behaviour
whichever way it asks. log is the one that is not a no-op, and it was the
one diverging: push(['log']) turned the console on while optimizely.log()
did nothing.

### publishing the Classic $

```
try {
```

Their $ is the jQuery they bundled, read at the time it is asked for
rather than captured, the same as get('jquery').
## The mutation sweep

The harness is `tools/mutate.mjs`, and the mutations are
`tools/mutations/optimizely.json`: 144 of them, each a single substitution
into the resource, and after each one it runs `test/optimizely.test.mjs`
and asks whether the suite noticed. `npm run mutate -- optimizely` is the
whole sweep. What it is for is the repo's own rule: a test that passes
against broken code is pointed at the wrong thing. It lived as a scratch
script on one machine first, which made the result quotable and not
repeatable - the weaker half of a measurement.

```
138 of 138 killed
6 survive and cannot be killed
8 of the kills were reported by a suite that failed and then hung
```

Twenty-four of the tests in that file exist because of this sweep - the
suite went from 52 to 76 while it ran. Each one is what was missing when a
mutation survived: an inherited name accepted as a command or a module
(`push(['toString'])`, `get('__proto__')`), a sticky state replayed
without checking whether it had fired, a replay for a non-lifecycle filter
that happens to be named `initialized`, the `name` filter on a delivery,
`emit(null)`, a throwing listener taking the rest of the batch with it,
the same for a throwing observer callback and for a throwing url handler
and a throwing poll waiter, the options check on `observeSelector`, a
`visitor_id` that does not change between loads, a `currentTimestamp`
taken once and kept, an edge path with no revision, a short number in the
path read as a project, a lowercase log level, the high-priority pass
accepting a name their boot does not drain, a url teardown that runs while
a second subscriber is still there, and twelve ways of reaching out of the
page that nothing was watching for.

### The six that cannot be killed

- **history patched per subscription** - the guard is nested inside the
  first-subscription branch, which already implies no patch is installed,
so   forced true on its own it is never reached with a patch there. Forced
true   *together* with that branch the wrappers nest and every `pushState`
notifies twice - and that pair is killed, by the test that subscribes
twice.
- **the legacy log means debug** - nothing in the file logs below `warn`, so
  INFO and DEBUG are the same level to every consumer of it.
- **no handler check** - `addListener` is reachable only through `push`,
  which swallows what it throws. It is not on the published object:
verified   at runtime, not read off the source.
- **no token check on removal** - `removeListener` the same way, and for the same reason.
- **lifecycle fires every load event** - `DOMContentLoaded` fires once, so
  dropping `{ once: true }` changes nothing a page could see.
- **lifecycle fires synchronously** - only the already-parsed branch is
  affected, and the sticky replay hides the difference for every event but
`activate`. The test for that path pins the `setTimeout` from the other
side: a tag beside the resource must still be able to register an
`activate` listener.

### Two things it taught about the harness itself

**A bad mutation fakes a coverage gap.** Three of the first twenty-two
survivors were mutations that changed nothing: `if ( false ) { } else if (
false ) {` left the `setTimeout` branch live and the lifecycle still ran,
`location: undefined || {...}` is the same object, and an inserted `void
0;` is not a mutation at all. A fourth matched `referrer: ''`, which
appears twice - in the modern visitor and in the Classic one - so it was
never applied at all. Each looked exactly like a missing test.

**A bad measurement does the same.** Four survivors were faults in the
test that was meant to catch them, not in the resource. The storage
wrapper was written onto the `localStorage` instance, and jsdom serves
each Storage through a proxy, so it never took and recorded nothing. The
`fetch` and `Object.prototype` baselines were read after the fixture
returned, by which time the inline script had already run - a baseline of
the damage. Both are taken in `beforeParse` now, on `Storage.prototype`.

**A hang is not a survivor.** Eight mutations leak an interval, so node
never exits after the suite has finished. The harness read the partial
output, found no summary tally, and reported them as gaps - but the suite
had already marked two tests failed. It was looking for TAP's `not ok`
while the spec reporter had written its own mark. The tests were right and
the reader was wrong, which is the same mistake in a different place. The
same leak in a test of mine hung the whole suite once, which is the reason
every `poll` in `test/optimizely.test.mjs` is cancelled.

## What is not done here

**Its one-line comments still ship.** The 23 blocks are a line each now,
which is 1679 of the 25625 bytes that reach a user. That is the floor for
this arrangement, not a thing left undone, but it is worth knowing the
number before adding another line.

**No corpus of their builds was read.** tealium and perimeterx were
written against dozens of real loaders; this one was written against the
resource and the snippet shapes above. Where a claim here has no evidence
behind it, it says so.

**The linter sees less of this file than of a built one.**
`tools/lint.mjs` does walk `extra/`, and for these three files it checks
what uBO's own parser cares about: that each one parses, that no blank
line ends the resource early, that every byte is ASCII because `btoa()`
throws otherwise, and that the first line is the `///` header naming the
file. What it deliberately does not check there is a backtick, which only
matters to the bundler these files do not go through, and line length,
which is style. This file still carries 22 lines over 79 columns; the
backtick it used to carry went with the comment block that quoted it.

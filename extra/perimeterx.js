/// perimeterx.js
// Resource replacement for the PerimeterX (HUMAN Security) client served
// from client.px-cloud.net/<appId>/main.min.js
// Not a cookie-consent resource: it lives outside src/ and is not built
// into dist/ by tools/build.mjs. Hand-maintained, ship as-is.
// The rule it answers:
//   ||client.px-cloud.net/*/main.min.js$script,redirect=perimeterx.js
// And the same client from a site's own host, which is how a first-party
// deployment serves it. The path is the app id with the PX taken off and
// the file is init.js, confirmed in the field on
// www.dormtherapy.com/jAYekY18/init.js - 242kB, answered with an x-px-hash
// header, and carrying PXjAYekY18 as its own app id, which is jAYekY18
// with the PX put back:
//   ||www.dormtherapy.com/jAYekY18/init.js$script,redirect=perimeterx.js
// There is no generic form of that rule worth writing - /<eight
// characters>/init.js would match a great deal that is not theirs, and a
// redirect that misfires replaces somebody's real script - so it is one
// line per host. The app id is recovered from either shape, so the
// resource itself needs nothing per host.
// Only main.min.js and init.js are served, one per host: main.js,
// client.js, px.js, sensor.js, bundle.js and index.js all answer 404 on
// client.px-cloud.net, and only init.js answers on a first-party host. The
// app id is read from any filename after the id segment regardless, so a
// rename costs a filter line and nothing here.
// Three more of theirs, separate requests rather than this resource's
// business, and none of them referenced by captcha.js - so a list may
// block them without touching a challenge:
//   ic.px-cloud.net/bd/auditor.js   386kB, picked by their own
//   crcldu.com/bd/auditor.js        JR(t){return t?ic:crcldu} - the second
//                                   is byte-identical and carries no PX
//                                   branding, which is what makes it worth
//                                   naming in a list
//   ri.px-cloud.net/index.js        102kB, and it stores its payload as a
//                                   string on a global with a generated
//                                   name rather than running it directly
// js.px-cloud.net is in every build as the head of a url list a tenant's
// configuration extends, so it belongs in the same group.
// One of their payload fields is set from !!navigator.brave, so on a site
// where this resource is not the one answering - a tenant whose
// first-party path no rule covers - the browser choice is still recorded.
// uBO can take that bit away on its own:
//   example.com##+js(set-constant, navigator.brave, undefined)
// undefined is the value to use, not false and not noopFunc: theirs is an
// object with isBrave() on it and Chrome has no such property at all, so
// undefined is a browser that exists while false is one that never has.
// It is worth scoping per site rather than everywhere. Brave exposes that
// property deliberately and some pages read it for their own reasons, and
// taking one bit away while canvas and audio still farble leaves a profile
// that is rarer than either answer on its own - both of those are read by
// thirteen of the fourteen builds. Where this resource did answer, nothing
// reads the property anyway.
// That deployment proxies their collector as well, which the same build
// names: [ "/jAYekY18/xhr", "https://collector-PXjAYekY18.px-cloud.net" ].
// Leave both alone. The first is on the site's own host and blocking a
// path there is a good way to break something else, the second is per
// tenant rather than the collector-a seen in error reporting, and with the
// client replaced nothing on the page calls either one.
// Do not block their collector or challenge hosts alongside it. With the
// client replaced nothing on the page calls collector-a.px-cloud.net, so
// blocking it buys nothing, and captcha.px-cloud.net - with
// captcha.px-cdn.net as the onerror fallback - is where a challenge page
// fetches the captcha.js it needs. Blocking those leaves a challenged
// visitor on a page they cannot solve.
// What this does to enforcement, since that is the question it raises:
// PerimeterX decides server side, off the _px3 cookie, and this forges
// nothing. A site enforcing hard can still challenge or block, exactly as
// it would with the script blocked outright - the resource neither defeats
// that nor worsens it.
//   a served block page    their own html, loading captcha.js from the
//                          hosts above. This resource is not on that page,
//                          so the challenge renders and can be solved
//   an in-page challenge   theirs renders the modal itself, from a
//                          template inside the client, after it sees a
//                          block response. That does not happen here, so
//                          no modal appears, and a site which challenges
//                          that way is not usable with this resource - the
//                          same end state as blocking the client, and the
//                          reason to lift the rule per site rather than
//                          paper over it
// Reading captcha.js itself, 608kB behind atob and a cyclic xor over
// "bAZChiM", settles what the challenge needs from this resource: nothing.
// It carries its own https://collector- host, its own challengeDone,
// challengeDoneSent and challengeDoneTime state, and it calls the page's
// _pxOnCaptchaSuccess or _pxOnError - and no client build references any
// of _pxOnCaptchaSuccess, _pxOnError, _pxSelectedLocale, _pxTranslation or
// isPxCaptchaContext, so those belong to the block page and the challenge
// between them, not here. Their setChallenge only stores what it is handed
// - ms(e){ lW=1, lA(e) } onto lx - so it reads as a notification into the
// sensor client rather than the route a solution travels, and the no-op
// here drops a notification rather than a solution.
// A first-party deployment serves the same client off the site's own host,
// where no generic rule can find it; the app id is still recovered from
// the script element, so a per-site rule works.
// Read off fifteen tenant builds - PXG2JgnYto, PXGWPp4wUS, PXNsLC0Hv5,
// PXZLuyHD0K, PXeBumDLwe, PXfoFgWNLE, PXmpzBoAGV, PXqFLuLdVQ, PXqLRSnBjb,
// PX3c3eZ9Ug, PXUMwuT9do, PXvGqcQp2O, PXDr7Isq2U, PXtsv50IS4 and
// PXjAYekY18 first party, 13kB to 957kB, served with max-age=600.
// They rebuild often enough to watch it happen: PXeBumDLwe was fetched
// twice in one day, 245593 bytes and then 244455, with its three member
// names moving out of the string table into the clear between the two. The
// contract did not move, which is why the tests here pin the contract
// rather than anything about a build - no byte offsets, no identifiers, no
// table indices. The big ones carry 18 to 24 base91 string tables
// behind a per-table alphabet, so the names below come from decoding those
// tables rather than from documentation. Twelve publish the same three
// members, five of them with the member names themselves behind the
// tables.
// The thirteenth is a different generation and worth knowing about:
// PXDr7Isq2U is 13kB, posts to /api/v1/collector rather than v2, reads no
// canvas, WebGL or audio at all, keeps its session id in
// sessionStorage.pxsid, and publishes { Events } alone - no ClientUuid and
// no setChallenge. What this resource puts up is a superset of that, which
// is the safe direction: a page on such a tenant finds more than it would
// have, never less.
// Two event names travel on that emitter, and this resource fires
// neither. risk is in twelve of the thirteen - the legacy build triggers
// it in the clear, right after writing their cookie - and xhrResponse is
// what the collector reply raises. A page waiting on risk waits forever
// here, exactly as it would with the script blocked, because a score is
// theirs to make and inventing one would tell the page's own logic
// something this resource has no way to know.
// What decided the surface: across all nine, the only name their client
// writes to the window is PX, alongside the computed window[appId]. Every
// other _px global is a read of something the page supplied - _pxRootUrl,
// _pxFetch, _pxCustomAbrDomains, _pxPreventAnalyticsCookie, _pxAppId and
// pxInit - and _pxVid and _pxUuid appear only inside the block page their
// own server serves, never as a live write, which is why nothing here
// mints one. pxParams is read off the public object and never assigned by
// the client, so it is the page's own property there as it is here.
// What the page keeps, from mb = { Events, ClientUuid, setChallenge } and
// the two lines that publish it - window[appId] = mb, and window.PX = mb
// where the app id is the one the script was built for:
//   window.PX and window.<appId>   the same object, so a page that reads
//                                  either one finds it
//   Events                         their emitter, with on, one, off,
//                                  subscribe and trigger, and their own
//                                  semantics: subscribe pushes
//                                  { fn, ctx, once }, and trigger drains a
//                                  channel with shift() and keeps what is
//                                  not once, so handler order survives
//   ClientUuid                     the empty string. This is the one place
//                                  theirs mints an identifier, so the
//                                  property answers and the id is not
//                                  created
//   setChallenge                   a no-op
//   window.pxInit(px), or window.<appId>_asyncInit(px)   their callback
//                                  into the page once init is done,
//                                  called asynchronously as theirs is
// What it refuses, all of it named in their own tables: the canvas and
// toDataURL read, WebGL including WEBGL_debug_renderer_info and the
// unmasked vendor and renderer, OfflineAudioContext with getChannelData,
// navigator plugins, mimeTypes, languages, platform, hardwareConcurrency,
// deviceMemory, maxTouchPoints, userAgentData, getBattery, permissions and
// mediaDevices, the booleans a build sets from navigator.brave and
// navigator.bluetooth - so which browser the visitor chose is one of the
// things recorded - the transcendental vector they fingerprint the FPU
// with, tan through sinh, named in their own list beside a polyfill of
// Math.atanh, screen availWidth, availHeight, colorDepth and pixelDepth,
// getTimezoneOffset, speechSynthesis, RTCPeerConnection, the behavioural
// listeners - mousemove, mousedown, mouseup, keydown, keyup, touchstart,
// touchmove, scroll, wheel, pointerdown, pointermove, drag, paste,
// devicemotion and deviceorientation - the automation probes webdriver,
// callPhantom, _phantom, __nightmare, domAutomationController and the
// chrome-extension:// scan, the XMLHttpRequest and fetch wrappers, the
// Worker and Blob it builds, every cookie it writes - _px2, _px3, pxvid,
// _pxmvid, pxjsc, px_hvd, _pxac, _px_acp, _px_pcdt, px_c_p_, _pxfc_ and
// pxfc - and the POST to collector-a.px-cloud.net/api/v2/collector.
// What it clears, rather than merely not writing: their visitor id, from
// the cookie on the host and every parent suffix of two labels or more,
// and from the localStorage and sessionStorage mirrors - _pxvid, pxvid and
// _pxmvid - plus the legacy sessionStorage.pxsid, and the app-id-prefixed
// keys a modern build actually writes: <appId>__pxvid, the ttl'd mirror
// their own vid lookup falls back on, and <appId>_px-ff, the ttl'd store
// beside it. Their token is left
// alone, as above, and while one of _px3, _px2 or _px is still in the jar
// the clearing waits: a visitor holding a token reads as a returning one,
// and taking the id away underneath that leaves two halves disagreeing,
// which earns a challenge rather than avoiding one. Nothing refreshes
// their token once the client is replaced, so the wait ends by itself.
// What it will not do: no token is forged, no vid or uuid is minted, and
// no sensor data is synthesised. PerimeterX enforces server side, and a
// site whose enforcer wants a fresh client token will still challenge or
// block - that is not something this resource tries to defeat. It also
// leaves existing cookies alone: _px3 is the server's own token, and
// deleting it would invite a fresh challenge rather than prevent one.
// Three deliberate divergences, all of them in the page's favour:
//   off()        theirs reads this.channels[name] with no guard, so an
//                off() before any on() throws there. Here it is a no-op.
//   trigger()    theirs calls a handler with no catch, so one handler that
//                throws abandons the drain and strands the rest. Here each
//                handler is called inside a catch, so the channel is drained
//                and the order is kept whatever a handler does.
//   window.PX    theirs sets it only where the page's declared app id is the
//                one the script was built for. Here it is set whenever no
//                client holds the name, because a page reading window.PX is
//                better served by an object than by undefined.
// The "///" line above is the resource header uBO reads, and a comment to
// JavaScript. uBO drops these "//" lines when it parses.
(function() {
    'use strict';
    const w = window;
    const doc = w.document;
    // Their own shape for an app id, from the block-page parser that reads
    // one back out of a document: PX[A-Za-z0-9]{4,8}
    const NAME = 'perimeterx';
    const VERSION = '1.0.0';
    const SHAPE = /^PX[A-Za-z0-9]{4,8}$/;
    const IN_URL = /\/(PX[A-Za-z0-9]{4,8})\/[^/]*$/;
    // A first-party deployment serves the same client from the site's own
    // host, and their own watcher says where: eleven of the thirteen builds
    // read build the regex "/" + appId.replace("PX", "") + "/init.js" once
    // _pxFirstPartyEnabled is set, so the path segment is the app id with
    // the PX taken off, and init.js is the file.
    // init.js is the file in the field, and their own self-reference list
    // is [ "/init.js", "/main.min.js" ], so both count - and main.js with
    // it, since the only difference is whether a build was minified.
    const FIRST_PARTY =
        /\/([A-Za-z0-9]{4,10})\/(?:init|main|main\.min)\.js(?:[?#]|$)/;
    // Every id ends up as a property name on the window, so each one is
    // held to their shape on the way out - the url branches included, not
    // only the page's own declaration. A path that yields PX on its own,
    // or PX and ten more characters, is not an app id and is refused.
    const valid = found => SHAPE.test(found) ? found : '';
    const inUrl = text => {
        if ( typeof text !== 'string' ) { return ''; }
        const first = FIRST_PARTY.exec(text);
        if ( first !== null ) {
            // Their own form has the PX taken off, so it goes back on -
            // unless a deployment left it, which already reads as an id.
            const held = first[1];
            return valid(SHAPE.test(held) ? held : 'PX' + held);
        }
        const match = IN_URL.exec(text);
        return match !== null ? valid(match[1]) : '';
    };
    // Theirs carries its own app id as a build constant and compares that
    // with the page's window._pxAppId. The request was redirected and not
    // the element, so the element still carries the url it was going to
    // fetch, and that url is the nearest thing to their constant: it is
    // this script's own identity rather than the page's declaration about
    // it. The page scan is last because it cannot tell one tenant's tag
    // from another's.
    let from = 'none';
    const identify = ( ) => {
        try {
            const mine = doc.currentScript;
            const found = inUrl(mine !== null ? mine.src : '');
            if ( found !== '' ) { from = 'element'; return found; }
        } catch ( ex ) {
        }
        try {
            if ( typeof w._pxAppId === 'string' && SHAPE.test(w._pxAppId) ) {
                from = 'snippet';
                return w._pxAppId;
            }
        } catch ( ex ) {
        }
        try {
            const tags = doc.querySelectorAll(
                'script[src*="px-cloud.net"],script[src*="/init.js"]');
            for ( const tag of tags ) {
                const found = inUrl(tag.src);
                if ( found !== '' ) { from = 'scan'; return found; }
            }
        } catch ( ex ) {
        }
        try {
            const found = inUrl(w._pxJsClientSrc);
            if ( found !== '' ) { from = 'clientsrc'; return found; }
        } catch ( ex ) {
        }
        return '';
    };
    const id = identify();
    const noopfn = ( ) => { };
    // Identifiers their client leaves behind, and their own reader is the
    // evidence for the names: the visitor id is looked up as mL(ot) or
    // mL("pxvid"), with mL reading document.cookie and ot being
    // atob("X3B4dmlk"), then as mL("_pxmvid"), then from a ttl'd mirror of
    // the same key in storage - a cookie with a resilient copy beside it.
    // The legacy generation keeps a session id in sessionStorage.pxsid.
    // Replacing the client stops new ones being written; it does not take
    // away the ones already there, and the cookie carries a year, so they
    // are cleared here. Their own deleter nn(name) writes a past expiry
    // twice, once with the domain and once without, which is the shape
    // followed below.
    // NOT _px3, _px2 or the legacy _px: those are the server's own token,
    // and deleting one invites a fresh challenge rather than preventing
    // it. Nothing is read on the way - a cookie is expired by writing, and
    // storage only has keys removed - so this adds no read of either.
    const IDS = [ '_pxvid', 'pxvid', '_pxmvid' ];
    const SESSION_IDS = [ 'pxsid' ];
    // Their storage goes through a facade - mn(t) hands back
    // { getItem, setItem, removeItem } whose every key runs through
    // mt(name, true), which is appId + "_" + name - so the mirror of the
    // visitor id sits at <appId>__pxvid rather than _pxvid, and their
    // ttl'd store at <appId>_px-ff. Both forms are removed here: the bare
    // one for the builds that do not prefix, and the prefixed one, which
    // is what a modern build actually writes.
    const STORED = IDS.concat(SESSION_IDS, [ 'px-ff' ]);
    // Their token names, which are the server's own and are never
    // cleared - and which also say whether a session is live.
    const TOKENS = [ '_px3', '_px2', '_px' ];
    const suffixes = ( ) => {
        const out = [ '' ];
        let host = '';
        try { host = String(w.location.hostname || ''); } catch ( ex ) { }
        if ( host === '' ) { return out; }
        const parts = host.split('.');
        while ( parts.length >= 2 ) {
            out.push(parts.join('.'));
            parts.shift();
        }
        return out;
    };
    // A visitor holding one of their tokens reads as a returning one. Take
    // the visitor id away underneath that and the two halves disagree,
    // which is the shape that earns a challenge rather than avoids one, so
    // the clearing waits for the session to lapse: no token, nothing to
    // disagree with. Their token is not refreshed with the client replaced,
    // so the wait ends on its own.
    // One read of the jar answers both questions: whether a session is
    // live, and which of their ids are actually there. A name that is not
    // in document.cookie has nothing to expire at any suffix either, since
    // a cookie set on a parent domain is in document.cookie as well, so
    // the writes for an absent name are all waste.
    const inJar = ( ) => {
        let held = '';
        try { held = String(doc.cookie || ''); } catch ( ex ) { return []; }
        if ( held === '' ) { return []; }
        const out = [];
        for ( const part of held.split(';') ) {
            const at = part.indexOf('=');
            out.push((at === -1 ? part : part.slice(0, at)).trim());
        }
        return out;
    };
    const forget = ( ) => {
        const done = { cleared: 0, storage: 0, token: 'none' };
        const there = inJar();
        for ( const name of TOKENS ) {
            if ( there.indexOf(name) !== -1 ) {
                done.token = 'live';
                return done;
            }
        }
        const mine = IDS.filter(name => there.indexOf(name) !== -1);
        const where = mine.length !== 0 ? suffixes() : [];
        for ( const name of mine ) {
            done.cleared += 1;
            for ( const domain of where ) {
                const parts = [ name + '=', 'path=/',
                    'expires=Thu, 01 Jan 1970 00:00:01 GMT' ];
                if ( domain !== '' ) { parts.push('domain=' + domain); }
                try { doc.cookie = parts.join('; '); } catch ( ex ) { }
            }
        }
        for ( const store of [ 'localStorage', 'sessionStorage' ] ) {
            let held;
            try { held = w[store]; } catch ( ex ) { continue; }
            if ( held === null || held === undefined ) { continue; }
            // Counted by what the store lost, not by what was asked of
            // it: removing a key that was never there is a no-op, and a
            // line saying twenty would be worse than saying nothing. The
            // length of a store is a count rather than a read of anything
            // in it, so this adds no read of a key or a value.
            let was = 0;
            try { was = held.length; } catch ( ex ) { }
            for ( const name of STORED ) {
                try { held.removeItem(name); } catch ( ex ) { }
                if ( id === '' ) { continue; }
                try { held.removeItem(id + '_' + name); } catch ( ex ) { }
            }
            try { done.storage += Math.max(0, was - held.length); }
            catch ( ex ) { }
        }
        return done;
    };
    const taken = forget();
    // Said once, at the end, the way every resource in src/ says it: what
    // actually went in rather than what was meant to. id and from answer
    // whether a rule fired and how the tenant was recognised, cleared and
    // storage answer what was taken away, and token=live is the reason
    // both can be zero on a site where nothing is wrong.
    const report = took => {
        let where = '';
        try { where = String(w.location.href || ''); } catch ( ex ) { }
        try {
            if ( typeof console !== 'object' ) { return; }
            if ( typeof console.info !== 'function' ) { return; }
            console.info(
                '[consent-rr] ' + NAME + ' ' + VERSION +
                ' id=' + (id !== '' ? id : 'none') +
                ' from=' + from +
                ' took=' + took +
                ' cleared=' + taken.cleared +
                ' storage=' + taken.storage +
                ' token=' + taken.token +
                (where !== '' ? ' on ' + where : '')
            );
        } catch ( ex ) {
        }
    };
    // Their emitter, from jH. channels is not a property until the first
    // subscribe, which is theirs as well.
    const events = {
        on: function(name, fn, ctx) {
            this.subscribe(name, fn, ctx, false);
        },
        one: function(name, fn, ctx) {
            this.subscribe(name, fn, ctx, true);
        },
        off: function(name, fn) {
            if ( this.channels === undefined ) { return; }
            const channel = this.channels[name];
            if ( channel === undefined ) { return; }
            for ( let i = 0; i < channel.length; i++ ) {
                if ( channel[i].fn !== fn ) { continue; }
                channel.splice(i, 1);
                break;
            }
        },
        subscribe: function(name, fn, ctx, once) {
            if ( this.channels === undefined ) { this.channels = {}; }
            this.channels[name] = this.channels[name] || [];
            this.channels[name].push({
                fn: fn,
                ctx: ctx,
                once: once || false,
            });
        },
        trigger: function(name) {
            if ( this.channels === undefined ) { return; }
            const held = Object.prototype.hasOwnProperty;
            if ( held.call(this.channels, name) === false ) { return; }
            const args = Array.prototype.slice.call(arguments, 1);
            const channel = this.channels[name];
            const kept = [];
            while ( channel.length > 0 ) {
                const entry = channel.shift();
                if ( typeof entry.fn === 'function' ) {
                    try {
                        entry.fn.apply(entry.ctx, args);
                    } catch ( ex ) {
                    }
                }
                if ( entry.once !== true ) { kept.push(entry); }
            }
            this.channels[name] = kept;
        },
    };
    const px = {
        Events: events,
        ClientUuid: '',
        setChallenge: noopfn,
    };
    // A page element with id="PX" or id="PX..." is a named property of the
    // window, so what is standing on either name may be a tag rather than a
    // client. Only a client - an object carrying their Events - is left
    // alone, and the same test decides both names.
    const claimed = value => {
        if ( value === null || value === undefined ) { return false; }
        if ( typeof value !== 'object' ) { return false; }
        try {
            return value.Events !== undefined &&
                typeof value.Events.on === 'function';
        } catch ( ex ) {
        }
        return false;
    };
    if ( ( id !== '' && claimed(w[id]) ) || claimed(w.PX) ) {
        report('theirs');
        return;
    }
    try {
        if ( id !== '' ) { w[id] = px; }
    } catch ( ex ) {
    }
    try {
        if ( claimed(w.PX) === false ) { w.PX = px; }
    } catch ( ex ) {
    }
    try {
        if ( id !== '' && typeof w._pxAppId !== 'string' ) {
            w._pxAppId = id;
        }
    } catch ( ex ) {
    }
    // Theirs calls back into the page once init is done - window.pxInit
    // where the app id is its own, window.<appId>_asyncInit otherwise - and
    // init is a collector round trip, so the call is always asynchronous.
    // The snippet defines the callback before the tag, since the tag is
    // async, but a page that defines it later gets the two later passes.
    report(id !== '' ? 'alias+px' : 'px');
    let called = false;
    const fire = ( ) => {
        if ( called ) { return; }
        let fn;
        try {
            if ( typeof w.pxInit === 'function' ) {
                fn = w.pxInit;
            } else if ( id !== '' ) {
                const named = w[id + '_asyncInit'];
                if ( typeof named === 'function' ) { fn = named; }
            }
        } catch ( ex ) {
            return;
        }
        if ( fn === undefined ) { return; }
        called = true;
        try {
            fn(px);
        } catch ( ex ) {
        }
    };
    w.setTimeout(fire, 0);
    doc.addEventListener('DOMContentLoaded', fire, { once: true });
    w.addEventListener('load', fire, { once: true });
})();

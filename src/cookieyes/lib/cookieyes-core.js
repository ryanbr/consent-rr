/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Shared implementation for cookieyes-reject.js and
    cookieyes-reject-unblock.js.

    CookieYes, from cdn-cookieyes.com/client_data/<id>/script.js. Measured by
    booting that file and their banner.js on TWO tenants - fontsquirrel.com
    and domaintools.com - which agree on everything below and differ in two
    ways worth writing down.

    WHAT THE TWO TENANTS AGREE ON: the same six categories with the same
    isNecessary flags, the same cookie name and pair order, a consentid minted
    on the first visit either way, the same sendBeacon to log.cookieyes.com on
    load, and script.js requesting nothing but banner.js.

    WHERE THEY DIFFER:

      _rootDomain   "www.fontsquirrel.com" on one and "" on the other, which
                    is why the record here is written host-only AS WELL as on
                    each domain above: an empty one makes their own cookie
                    host-only, since the browser drops a domain attribute it
                    cannot use.

      the IAB layer  one carries the TCF stub and the __tcfapiLocator frame,
                    the other carries neither - so whether a tenant is
                    IAB-enabled is configuration, and it is in the file being
                    replaced. The refusal is installed either way. On a tenant
                    that had no CMP that is more than the file did, and it is
                    deliberate: a vendor that asks is told no, which is never
                    weaker than no answer at all, and a page that waits on
                    __tcfapi gets an answer rather than stalling. The console
                    line says tcf=refused so it is visible.

    THE NEWER DEPLOYMENT SPLITS THE CONFIGURATION OUT into two more files -
    client_data/<id>/<random>.json, the banner targeting rules, and
    client_data/<id>/audit-table/<random>.json, the cookie descriptions - and
    both are fetched by banner.js, not by script.js. So replacing script.js
    still takes all four: 26KB and 169KB of script, and the two JSON files
    nobody asks for.

    ONE FILE IS THE WHOLE INSTALL. script.js carries the IAB TCF stub, their
    auto-blocker, their per-tenant configuration AND the request for
    banner.js, so replacing it means banner.js is never asked for either -
    nor their 917KB common/iab-gvl-v3.json.

    IT IS DOMAIN-LOCKED, which is worth knowing before testing one: the
    registered domain is inlined in the file and compared against
    location.hostname by suffix, and a mismatch THROWS -

        registeredDomain: "www.fontsquirrel.com"

    - so booting a tenant's loader anywhere else gets "Looks like your
    website URL has changed" and nothing else. Nothing here checks a domain.

    THEIR RECORD is one cookie, cookieyes-consent, of comma-separated pairs,
    measured on a first visit:

        consentid:c3pOWHhYcHNXT3Byb2ljcTFtazJSeUFNZlZVcGV3Y2c,consent:,
        action:,necessary:,functional:,analytics:,performance:,
        advertisement:,other:

    Six categories, each yes or no; consent is the decision, action is
    whether the visitor answered. Their own reject-all leaves necessary yes
    and the rest no, with consent no and action yes.

    THE consentid IS NOT MINTED HERE. Theirs is 22 random characters base64'd
    by _ckyRandomString, and an id this repo invented would be an id of its
    own making in a page's analytics. One already in the cookie is kept, and
    otherwise it is empty - which getCkyConsent reports as "", the same as
    theirs does before their own code has run.

    THEIR EVENTS GO TO THE DOCUMENT, through one dispatcher:

        function C(e, t) {
            const n = new CustomEvent(e, {detail: t});
            document.dispatchEvent(n);
        }

    cookieyes_banner_load carries getCkyConsent(), and
    cookieyes_consent_update carries {accepted: [slug], rejected: [slug]}.

    THEIR BLOCKER IS IN THE FILE BEING REPLACED, and that is a trade worth
    stating. script.js patches document.createElement so a script whose src
    matches their provider list has its type flipped to javascript/blocked,
    and _ckyIsCategoryToBeBlocked treats an EMPTY store as blocked for every
    category that is not necessary - their default-deny. With the file
    replaced that machinery is gone, and uBlock Origin is what blocks. What
    their WordPress plugin parked in the markup - type="text/plain" with
    data-cookieyes="cookieyes-analytics" - stays parked either way, because
    nothing here turns it back on.

    CCPA, GPC AND DNT, measured on both tenants' banner.js, because the record
    this file writes has to mean the right thing under either law.

    THEIR DEFAULT STATE, which is the function a first visit lands in:

        _ckySetInStore("consent", activeLaw === "ccpa" && shouldFollowGPC
            ? "yes" : "no");
        for (const cat of _ckyStore._categories) {
            let s = "yes";
            if ( (activeLaw === "gdpr" && !cat.isNecessary
                      && !cat.defaultConsent.gdpr)
                || (activeLaw === "ccpa" && optedOut
                      && !cat.defaultConsent.ccpa) ) { s = "no"; }
            _ckySetInStore(cat.slug, s);
        }

    Under GDPR a category is no unless it is necessary, which is exactly the
    record written here - their own default confirms it. Under CCPA the
    categories START as yes and the consent token INVERTS: "yes" there means
    the visitor opted out, which is why their opt-out checkbox is pre-checked
    when consent is yes or GPC is set.

    So the consent token is the one ambiguous field, and every CATEGORY being
    no is not ambiguous at all - it reads as refused under either law. This
    reports activeLaw gdpr, under which its own token is the protective one
    and the whole record is consistent; the tenant's real law is in the file
    being replaced, and claiming ccpa would mean writing yes in a field a
    gdpr reader takes as consent.

    GPC IS READ AND REPORTED. Their script.js seeds
    _ckyStore._gpcStatus = !!navigator.globalPrivacyControl, and their
    banner.js re-reads it and computes
    shouldFollowGPC = respectGPC && _gpcStatus, where respectGPC is a
    tenant's setting. Both are kept here, with respectGPC true - the
    privacy-forward default of the two - and the console line says whether
    the browser sent one. Nothing about the refusal changes with it: a
    refusal already says what GPC asks for.

    THEIR DNT CHECK CANNOT FIRE, and this does not copy it. Their un-parking
    routine opens with

        if (1 === navigator.doNotTrack) return;

    which is a strict comparison against a NUMBER where the DOM gives the
    string "1", so the guard never holds and DNT reaches nothing. The intent
    is plain - do not free parked tags for a visitor who asked not to be
    tracked - and reject frees nothing anyway, so the intent is met without
    reproducing dead code.

    NOT DONE HERE, deliberately:

      no banner          nothing is built, and their placeholder markup is
                         left as the page wrote it.
      no log             theirs sends a sendBeacon to
                         log.cookieyes.com/api/v1/log on load, BEFORE any
                         decision, carrying a consent session id and the
                         banner id. It is a page view reported to a third
                         party and it is most of the reason to replace the
                         file.
      no cookie purge    theirs deletes the cookies it lists per category -
                         _ga, lidc, demdex and the rest - but that list is
                         per tenant and inlined in the replaced file, so it
                         cannot be known from outside. uBlock Origin blocks
                         the requests that would set them in the first place.

*/

function consentRRCookieYes(mode, installTcf) {
    const w = window;
    const doc = w.document;
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'cookieyes-' + mode;
    // reject-unblock refuses exactly as reject does, and still lets the
    // parked tags go: un-parking one claims no consent, and uBlock Origin
    // still blocks whatever it then asks for.
    const reviveAll = mode === 'reject-unblock';

    const COOKIE = 'cookieyes-consent';
    // Their six, from the _categories array in the file: necessary carries
    // isNecessary true and a default consent of true under both gdpr and
    // ccpa, and the other five default to false under both.
    const CATEGORIES = [
        'necessary', 'functional', 'analytics', 'performance',
        'advertisement', 'other',
    ];

    const noopfn = function() {
    }.bind();
    const noopstrfn = function() {
        return '';
    }.bind();
    const noopfalsefn = function() {
        return false;
    }.bind();

    const standing = typeof w.cookieyes === 'object' && w.cookieyes !== null
        ? w.cookieyes
        : null;
    if ( standing !== null && standing.consentRR !== undefined ) { return; }

    /**************************************************************************/

    const readCookie = name => {
        const prefix = name + '=';
        for ( const pair of String(doc.cookie || '').split(';') ) {
            let text = pair;
            while ( text.charAt(0) === ' ' ) { text = text.substring(1); }
            if ( text.indexOf(prefix) === 0 ) {
                return decodeURIComponent(text.substring(prefix.length));
            }
        }
        return '';
    };

    // Their own pairs, parsed the way their _ckyGetCookieMap does: comma
    // separated, each a key and a value either side of the first colon.
    const parse = text => {
        const out = {};
        for ( const pair of String(text || '').split(',') ) {
            const at = pair.indexOf(':');
            if ( at === -1 ) { continue; }
            out[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
        }
        return out;
    };

    const store = parse(readCookie(COOKIE));

    // Theirs mints 22 random characters here. An id invented by this repo
    // would be an id of its own making, so one already stored is kept and
    // nothing new is made.
    const consentId = typeof store.consentid === 'string'
        ? store.consentid
        : '';

    const compose = ( ) => {
        const parts = [
            'consentid:' + consentId,
            'consent:no',
            'action:yes',
        ];
        for ( const slug of CATEGORIES ) {
            parts.push(slug + ':' + (slug === 'necessary' ? 'yes' : 'no'));
        }
        return parts.join(',');
    };

    // Every scope a stored yes could be sitting in. Theirs is written with
    // domain=_ckyStore._rootDomain, which is per-tenant configuration INSIDE
    // the file being replaced - "www.fontsquirrel.com" on the one sampled, a
    // registrable domain on another - so it cannot be known from outside. And
    // the two readers disagree on which duplicate wins: their own
    // _ckyGetCookieMap assigns over the map as it goes, so the LAST wins,
    // while a first-match read takes the first. A refusal written to only one
    // scope could therefore be shadowed by an acceptance in another. Writing
    // it to all of them leaves every reader, either way round, with a no.
    // The empty scope is the host-only write, and it is not redundant: a
    // browser keys a cookie on its host-only flag as well as its name and
    // domain, so a host-only yes and a domain refusal can sit side by side.
    // jsdom's jar collapses the two, which is why the test for this watches
    // the write rather than the jar.
    const scopes = ( ) => {
        const out = [ '' ];
        const host = String(w.location.hostname || '');
        if ( /^[0-9.]+$/.test(host) || host.indexOf('.') === -1 ) { return out; }
        const labels = host.split('.');
        for ( let at = 0; at < labels.length - 1; at += 1 ) {
            out.push(labels.slice(at).join('.'));
        }
        return out;
    };

    // Their own attributes, from their _ckySetCookie: path, their expiry in
    // days, SameSite Strict unless a tenant turned iframe support on, and
    // secure. Theirs adds secure unconditionally, which on an http page means
    // the browser drops the cookie and no decision is recorded at all - so it
    // is added where it can hold.
    let wrote = 0;
    const write = ( ) => {
        const value = compose();
        for ( const slug of CATEGORIES ) {
            store[slug] = slug === 'necessary' ? 'yes' : 'no';
        }
        store.consent = 'no';
        store.action = 'yes';
        store.consentid = consentId;
        // Their own default, and the only value available: a tenant's
        // scriptExpiry comes down with the banner configuration inside the
        // file being replaced, and there is no page-side way to set it - so
        // reading it back off the store this file put up would be reading
        // this file's own constant through two more lines.
        const days = 365;
        let sameSite = 'Strict';
        try {
            if ( w.ckySettings && w.ckySettings.iframeSupport ) {
                sameSite = 'None';
            }
        } catch ( ex ) {
        }
        const https = String(w.location.protocol) === 'https:';
        if ( sameSite === 'None' && https === false ) { sameSite = 'Strict'; }
        for ( const domain of scopes() ) {
            try {
                doc.cookie = COOKIE + '=' + value +
                    // expires, as theirs writes it, not max-age.
                    '; expires=' +
                    new Date(Date.now() + days * 86400000).toUTCString() +
                    '; path=/' +
                    (domain !== '' ? '; domain=' + domain : '') +
                    '; SameSite=' + sameSite +
                    (https ? '; secure' : '');
                wrote += 1;
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // Their dispatcher, which is one function and goes to the document.
    let events = 0;
    const fire = (name, detail) => {
        try {
            doc.dispatchEvent(new w.CustomEvent(name, { detail: detail }));
            events += 1;
        } catch ( ex ) {
        }
    };

    // What getCkyConsent answers. reject-unblock reports every category on,
    // which is the same split this repo's other unblock resources make: the
    // record says no, the page's own scripts are told yes, and uBlock Origin
    // decides what any of them may fetch.
    const reported = slug => reviveAll || slug === 'necessary';

    const consentState = ( ) => {
        const categories = {};
        for ( const slug of CATEGORIES ) { categories[slug] = reported(slug); }
        return {
            activeLaw: 'gdpr',
            categories: categories,
            isUserActionCompleted: true,
            consentID: consentId,
            languageCode: '',
        };
    };

    /**************************************************************************/

    // Their parked markup: their WordPress plugin writes type="text/plain"
    // with data-cookieyes="cookieyes-<category>", and their blocker uses
    // javascript/blocked at runtime. A type alone does not run a script that
    // is already in the document, so it is replaced by a copy, which is what
    // their own un-parking does.
    //
    // SCRIPTS ONLY, and that is not an omission. An iframe is never parked in
    // the markup: their blocker handles one at runtime by inserting a sized
    // video-placeholder div after it - with the YouTube thumbnail where the
    // src is a YouTube url - and it leaves the iframe's own src in place.
    // Neither data-src nor any data-cky-src appears anywhere in their files.
    // With their script replaced that blocker never runs, so an iframe is
    // simply an iframe and uBlock Origin decides what it may fetch; there is
    // nothing moved aside for this to put back.
    // Only what THEY parked: their attribute, or the type their own blocker
    // writes at runtime. A bare type="text/plain" script is not necessarily
    // theirs - a template or another CMP parks the same way - and freeing one
    // on a guess would be this resource running code nobody asked it to.
    const PARKED = 'script[data-cookieyes],' +
        'script[type="javascript/blocked"]';
    const DEAD = [ 'text/plain', 'javascript/blocked' ];

    let revived = 0;
    const revive = ( ) => {
        if ( reviveAll === false ) { return; }
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(PARKED));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
            try {
                const type = String(node.getAttribute('type') || '')
                    .toLowerCase();
                if ( DEAD.includes(type) === false && type !== '' ) { continue; }
                const copy = doc.createElement('script');
                for ( const attribute of Array.from(node.attributes) ) {
                    if ( attribute.name === 'type' ) { continue; }
                    copy.setAttribute(attribute.name, attribute.value);
                }
                copy.type = 'text/javascript';
                if ( node.src === '' && node.textContent !== '' ) {
                    copy.textContent = node.textContent;
                }
                node.parentNode.insertBefore(copy, node);
                node.parentNode.removeChild(node);
                revived += 1;
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // Their internal store, by the names their own code and a tenant's
    // markup reach for. _providersToBlock is empty because the list is per
    // tenant and inlined in the file being replaced - and with their blocker
    // gone there is nothing here for it to drive.
    // What the browser is asking for, read where their own script.js reads
    // it. A refusal already says what GPC asks for, so nothing here turns on
    // it - it is reported, and their own field is filled in.
    let gpc = false;
    try {
        gpc = w.navigator.globalPrivacyControl === true;
    } catch ( ex ) {
    }

    const ckyStore = {
        _backupNodes: [],
        _categories: CATEGORIES.map(slug => ({
            slug: slug,
            isNecessary: slug === 'necessary',
            defaultConsent: {
                gdpr: slug === 'necessary',
                ccpa: slug === 'necessary',
            },
            cookies: [],
        })),
        _providersToBlock: [],
        _bannerConfig: {
            // gdpr, because the record written here is unambiguous and
            // protective under it. See the note above on the consent token
            // inverting under ccpa.
            activeLaw: 'gdpr',
            // Theirs is respectGPC && _gpcStatus, where respectGPC is the
            // tenant's setting - true here, the privacy-forward one of the
            // two it can be.
            respectGPC: true,
            shouldFollowGPC: gpc,
            scriptExpiry: 365,
            placeHolder: { status: false, styles: {} },
        },
        _language: { _active: '', _default: '' },
        _bannerDisplayState: 'hidden',
        _isPreview: false,
        // Seeded in their script.js, from the same place.
        _gpcStatus: gpc,
        _resetConsentID: false,
        _bannerAttached: false,
        _prevTCString: '',
        _prevGoogleACMString: '',
        _consent: store,
    };

    const getFromStore = key => {
        const name = String(key);
        return typeof store[name] === 'string' ? store[name] : '';
    };

    const helpers = {
        _ckyStore: ckyStore,
        _ckyGetFromStore: getFromStore,
        _ckySetInStore: (key, value) => {
            // The decision is this resource's, not the caller's: a page
            // cannot argue a refused category into a yes.
            const name = String(key);
            if ( CATEGORIES.includes(name) ) { return; }
            store[name] = String(value);
        },
        _ckyGetCookieMap: ( ) => parse(readCookie(COOKIE)),
        _ckySetCookie: noopfn,
        _ckyIsCategoryToBeBlocked: slug => reported(String(slug)) === false,
        _ckyShouldBlockProvider: noopfalsefn,
        _ckyEscapeRegex: text => String(text)
            .replace(/[.*+?^${}()[\]\\]/g, '\\$&'),
        _ckyReplaceAll: (text, from, to) => String(text).split(from).join(to),
        _ckyStartsWith: (text, start) => String(text)
            .slice(0, String(start).length) === String(start),
        // Theirs makes 22 random characters. Nothing here needs one, and one
        // made here would be an id of this repo's making.
        _ckyRandomString: noopstrfn,
        _ckySetPlaceHolder: noopfn,
        _ckyCreateElementBackup: noopfn,
        _ckyEncodeACString: noopstrfn,
        _ckyDecodeACString: noopstrfn,
        // Their reporting. Theirs posts to log.cookieyes.com/api/v1/log.
        _ckySendPageViewLog: noopfn,
        _ckyXHR: noopfn,
        _ckyFetch: noopfn,
    };
    for ( const key of Object.keys(helpers) ) {
        try {
            w[key] = helpers[key];
        } catch ( ex ) {
        }
    }

    /**************************************************************************/

    write();

    const tcf = typeof installTcf === 'function'
        ? (installTcf().install() ? 'refused' : 'theirs')
        : 'absent';

    // Their public three, and the object their script puts up.
    try {
        w.getCkyConsent = consentState;
        w.revisitCkyConsent = noopfn;
        // Theirs reopens the banner or applies accept_all, accept_partial or
        // reject. There is no banner, and the answer is already no.
        w.performBannerAction = action => {
            void action;
            fire('cookieyes_consent_update', {
                accepted: CATEGORIES.filter(slug => reported(slug)),
                rejected: CATEGORIES.filter(slug => reported(slug) === false),
            });
        };
    } catch ( ex ) {
    }

    const out = standing !== null ? standing : {};
    out.consentRR = { name: NAME, version: VERSION, mode: mode };
    out.getCkyConsent = consentState;
    w.cookieyes = out;

    revive();

    fire('cookieyes_consent_update', {
        accepted: CATEGORIES.filter(slug => reported(slug)),
        rejected: CATEGORIES.filter(slug => reported(slug) === false),
    });
    fire('cookieyes_banner_load', consentState());

    // Said once, at the end, so it reports what actually went in.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' categories=' + CATEGORIES.filter(slug => reported(slug)).join('+') +
            ' cookie=' + (wrote !== 0 ? 'written' : 'refused') +
            ' consentid=' + (consentId !== '' ? 'kept' : 'none') +
            ' freed=' + revived +
            ' events=' + events +
            ' tcf=' + tcf +
            ' gpc=' + (gpc ? 'set' : 'unset') +
            ' banner=none log=none'
        );
    }
}

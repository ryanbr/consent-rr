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
    booting that file and their banner.js.

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

    let wrote = 0;
    const write = ( ) => {
        const value = compose();
        for ( const slug of CATEGORIES ) {
            store[slug] = slug === 'necessary' ? 'yes' : 'no';
        }
        store.consent = 'no';
        store.action = 'yes';
        store.consentid = consentId;
        try {
            doc.cookie = COOKIE + '=' + value + '; path=/; max-age=' +
                31536000;
            wrote += 1;
        } catch ( ex ) {
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
    // Only what THEY parked: their attribute, or the type their own blocker
    // writes at runtime. A bare type="text/plain" script is not necessarily
    // theirs - a template or another CMP parks the same way - and freeing one
    // on a guess would be this resource running code nobody asked it to.
    const PARKED = 'script[data-cookieyes],iframe[data-cookieyes],' +
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
                const tag = node.nodeName.toLowerCase();
                if ( tag === 'iframe' ) {
                    const src = node.getAttribute('data-cky-src') ||
                        node.getAttribute('data-src') || '';
                    if ( src === '' ) { continue; }
                    node.setAttribute('src', src);
                    revived += 1;
                    continue;
                }
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
            activeLaw: 'gdpr',
            shouldFollowGPC: true,
            scriptExpiry: 365,
            placeHolder: { status: false, styles: {} },
        },
        _language: { _active: '', _default: '' },
        _bannerDisplayState: 'hidden',
        _isPreview: false,
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
            ' banner=none log=none'
        );
    }
}

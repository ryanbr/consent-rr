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

    Shared implementation for cookiez-reject.js and
    cookiez-reject-unblock.js.

    Cookiez, a WordPress plugin, served first-party from
    /wp-content/plugins/cookiez/assets/build/banner.js with a lang-<xx>.js
    beside it. Measured on that build, against a real refusal record from a
    site running it.

    THERE IS NO PAGE-FACING API TO REPRODUCE, which is worth saying plainly
    because the temptation is to invent one. Their bundle dispatches no
    CustomEvent and no DOM event of any kind, and the one global they set -
    window.cookiezBanner - is banner internals (screenManager, translations,
    content, apiConfig) put up only when a banner is actually built. So this
    file puts nothing of its own up: the record IS the interface, alongside
    the two bridges below.

    THEIR RECORD, which this reproduces field for field:

        cookiez-user-consent={"data":{"consent":{"necessary":true,
            "functional":false,"analytics":false,"advertising":false,
            "unclassified":false}},
            "meta":{"cookiesHash":"...","timestamp":1791239063}}

    URI-encoded, path=/, max-age 86400 * consentExpiration seconds and
    SameSite=Lax, all from their own writer. Their five categories are
    necessary, functional, analytics, advertising and unclassified, and their
    builder is

        J = e => Object.fromEntries(Object.values(R)
                .map(t => [t, t === R.Necessary || e]));

    so J(false) is exactly the refusal above - necessary true and the other
    four false.

    THE HASH DECIDES WHETHER THE RECORD COUNTS. Their gate is:

        if (!e?.meta) return false;
        if (Date.now()/1e3 - e.meta.timestamp > 86400 * consentExpiration)
            return false;
        const n = window.cookiezBannerSettings?.cookiesHash;
        return !n || e.meta.cookiesHash === n;

    - so a record whose cookiesHash does not match the current one is thrown
    away and the banner shows again. The hash is a page global, which is the
    only reason this can write a record that survives: it is read from
    window.cookiezBannerSettings, exactly as their own writer reads it.

    THE consentId IS NOT MINTED, and here that is not even a judgement call.
    Theirs comes back from their own server:

        n = (await N.sendConsentLog(e, t, Q()?.data?.consentId)).consentId;
        const o = {data: n ? {consentId: n, consent: e} : {consent: e}, ...};

    When that call fails their own record carries no consentId at all - the
    key is absent, not empty. So one already stored is kept, and otherwise
    the key is left out, which is a shape their own code produces.

    NOT DONE HERE, deliberately:

      no banner          nothing is built, so their lang-<xx>.js is not
                         needed either and the filter list sends it to
                         noopjs.
      no consent log     theirs posts the decision to their own REST route,
                         window.cookiezBannerSettings.serviceUrl with an
                         X-WP-Nonce header, and takes the consentId from the
                         reply. Nothing is sent from here.
      no banner globals  window.cookiezBanner is banner internals and exists
                         only when a banner is built. A screenManager of this
                         repo's making would be worse than its absence.

*/

function consentRRCookiez(mode) {
    const w = window;
    const doc = w.document;
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'cookiez-' + mode;
    // reject-unblock refuses exactly as reject does and still frees the
    // scripts their blocker parked: un-parking one claims no consent, and
    // uBlock Origin still blocks whatever it then asks for.
    const reviveAll = mode === 'reject-unblock';

    const COOKIE = 'cookiez-user-consent';
    // Their five, in their own order.
    const CATEGORIES = [
        'necessary', 'functional', 'analytics', 'advertising', 'unclassified',
    ];
    // Their blocking modes. "always" means a node is never freed, whatever
    // is consented - their own un-parking excludes it with a :not().
    const ALWAYS = 'always';
    // Their map into the WordPress Consent API: three of the five, and the
    // names are not the category names.
    const WP = {
        functional: 'functional',
        analytics: 'statistics',
        advertising: 'marketing',
    };

    const guard = typeof w.cookiezConsentRR === 'object' &&
        w.cookiezConsentRR !== null;
    if ( guard ) { return; }

    /**************************************************************************/

    // Their own reader, pattern for pattern.
    const readCookie = name => {
        try {
            const found = String(doc.cookie || '')
                .match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
            if ( found === null ) { return null; }
            if ( found[1] === undefined || found[1] === '' ) { return null; }
            return decodeURIComponent(found[1]);
        } catch ( ex ) {
        }
        return null;
    };

    const stored = ( ) => {
        try {
            const text = readCookie(COOKIE);
            if ( text !== null ) { return JSON.parse(text); }
        } catch ( ex ) {
        }
        return null;
    };

    // Their settings, from the object the plugin prints before the bundle.
    const settings = ( ) => {
        const given = w.cookiezBannerSettings;
        return given !== null && typeof given === 'object' ? given : {};
    };
    const option = (name, fallback) => {
        const inner = settings().settings;
        if ( inner !== null && typeof inner === 'object' &&
            inner[name] !== undefined ) {
            return inner[name];
        }
        return fallback;
    };

    /**************************************************************************/

    // Their refusal, which is J(false): necessary true, the rest false.
    const consent = ( ) => {
        const out = {};
        for ( const name of CATEGORIES ) {
            out[name] = name === 'necessary';
        }
        return out;
    };

    // Their writer. The consentId is carried over where one is stored and
    // the key is otherwise left out, which is the shape their own code
    // produces when their log call fails.
    let wrote = 0;
    const write = ( ) => {
        const was = stored();
        const data = {};
        const id = was !== null && was.data !== undefined &&
            typeof was.data.consentId === 'string' && was.data.consentId !== ''
            ? was.data.consentId
            : '';
        if ( id !== '' ) { data.consentId = id; }
        data.consent = consent();
        const hash = settings().cookiesHash;
        const record = {
            data: data,
            meta: {
                // Read where theirs reads it. Their own gate throws a record
                // away when this does not match, and shows the banner again.
                cookiesHash: typeof hash === 'string' ? hash : '',
                timestamp: Math.floor(Date.now() / 1000),
            },
        };
        const days = Number(option('consentExpiration', 180)) > 0
            ? Number(option('consentExpiration', 180))
            : 180;
        try {
            doc.cookie = COOKIE + '=' +
                encodeURIComponent(JSON.stringify(record)) +
                '; path=/; max-age=' + (86400 * days) + '; SameSite=Lax';
            wrote += 1;
        } catch ( ex ) {
        }
        return id !== '';
    };

    /**************************************************************************/

    // Their two bridges, gated as theirs are: the WordPress Consent API when
    // supportGcm and their wpConsentApiActive integration are both on, and
    // Google consent mode unless a tenant delegates it to Site Kit. Theirs
    // calls window.gtag directly rather than pushing to a data layer.
    const allow = value => (value ? 'allow' : 'deny');
    const granted = value => (value ? 'granted' : 'denied');

    let told = 0;
    const announce = decided => {
        const supportGcm = option('supportGcm', false) === true;
        const integrations = settings().integrations;
        const wpActive = integrations !== null &&
            typeof integrations === 'object' &&
            Boolean(integrations.wpConsentApiActive);
        const toSiteKit = integrations !== null &&
            typeof integrations === 'object' &&
            Boolean(integrations.delegateGcmToSiteKit);
        if ( supportGcm && wpActive ) {
            try {
                if ( typeof w.wp_set_consent === 'function' ) {
                    for ( const name of Object.keys(WP) ) {
                        w.wp_set_consent(WP[name], allow(decided[name]));
                        told += 1;
                    }
                }
            } catch ( ex ) {
            }
        }
        if ( supportGcm && toSiteKit === false ) {
            try {
                if ( typeof w.gtag === 'function' ) {
                    w.gtag('consent', 'update', {
                        analytics_storage: granted(decided.analytics),
                        ad_storage: granted(decided.advertising),
                        ad_user_data: granted(decided.advertising),
                        ad_personalization: granted(decided.advertising),
                    });
                    told += 1;
                }
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // Their own un-parking, selector and all:
    //
    //   script[type="text/plain"][data-cc-category="<cat>"]
    //       :not([data-cc-mode="always"])
    //
    // and the copy drops every data-cc- attribute and the type, takes its
    // src from data-cc-src, keeps inline text, and goes back in at the
    // original position. A refusal frees nothing, because their own filter
    // returns early when no category is consented.
    let revived = 0;
    const revive = ( ) => {
        if ( reviveAll === false ) { return; }
        const wanted = CATEGORIES.filter(name => name !== 'necessary');
        const selector = wanted.map(name =>
            'script[type="text/plain"][data-cc-category="' + name + '"]' +
            ':not([data-cc-mode="' + ALWAYS + '"])'
        ).join(',');
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(selector));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
            try {
                const parent = node.parentNode;
                if ( parent === null ) { continue; }
                const copy = doc.createElement('script');
                for ( const attribute of Array.from(node.attributes) ) {
                    if ( attribute.name.startsWith('data-cc-') ) { continue; }
                    if ( attribute.name === 'type' ) { continue; }
                    copy.setAttribute(attribute.name, attribute.value);
                }
                const src = node.getAttribute('data-cc-src');
                if ( src !== null && src !== '' ) {
                    copy.setAttribute('src', src);
                }
                if ( node.textContent !== '' ) {
                    copy.textContent = node.textContent;
                }
                const next = node.nextSibling;
                parent.removeChild(node);
                parent.insertBefore(copy, next);
                revived += 1;
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // Their GPC path, which is theirs rather than a choice made here: with
    // gpcDntSupport on and the browser sending one, their own code decides
    // without a banner - a refusal under an opt-in template, which is what
    // this writes anyway. It is reported so the console line says whether
    // the browser asked.
    let gpc = false;
    try {
        gpc = w.navigator.globalPrivacyControl === true;
    } catch ( ex ) {
    }

    const decided = consent();
    const kept = write();
    announce(decided);
    revive();

    // A marker rather than an API: their bundle puts up nothing a page calls,
    // so neither does this, and a second evaluation has something to see.
    try {
        w.cookiezConsentRR = { name: NAME, version: VERSION, mode: mode };
    } catch ( ex ) {
    }

    // Said once, at the end, so it reports what actually went in.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' categories=necessary' +
            ' cookie=' + (wrote !== 0 ? 'written' : 'refused') +
            ' hash=' + (settings().cookiesHash ? 'theirs' : 'none') +
            ' consentid=' + (kept ? 'kept' : 'none') +
            ' told=' + told +
            ' freed=' + revived +
            ' gpc=' + (gpc ? 'set' : 'unset') +
            ' banner=none log=none'
        );
    }
}

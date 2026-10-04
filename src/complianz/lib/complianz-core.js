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

    Shared implementation for complianz-accept.js / complianz-reject.js.

    Complianz is a WordPress plugin, so unlike every other CMP here it is
    served first-party from the site's own wp-content path - and under more
    than one name: complianz-gdpr, complianz-gdpr-premium, and a theme that
    vendors it under its own (fhoke-support/dist/js). The filter matches the
    file, not a host.

    Read off their own cookiebanner script rather than their docs.

    NOTHING ABOUT THEIR RECORD CAN BE HARDCODED. Every cookie name is
    complianz.prefix + name, and the prefix, the expiry, the policy id, the
    consent type and the region all come from a 'complianz' object the page
    declares before this script would have run. So this reads that object and
    follows it, with their own defaults where a field is missing.

    Their categories, in their order:

      functional   always consented, their cmplz_has_consent returns true for
                   it before reading anything
      preferences
      statistics
      marketing

    Three things here are theirs and would be easy to get wrong:

    1. AN EMPTY COOKIE CAN MEAN YES. Their cmplz_has_consent is

         cmplz_do_not_track()
             ? cmplz_get_cookie(c) === 'allow'
             : (complianz.consenttype === 'optout' ||
                complianz.consenttype === 'other') &&
               cmplz_get_cookie(c) === '' || cmplz_get_cookie(c) === 'allow'

       so on an opt-out or "other" configuration an *absent* record reads as
       consent. A refusal therefore has to write 'deny' explicitly; writing
       nothing would consent on exactly the sites that assume consent.

    2. THE POLICY ID IS PART OF THE RECORD. Their
       cmplz_check_cookie_policy_id compares the stored id against
       complianz.current_policy_id and, on a mismatch, calls
       cmplz_deny_all(), re-shows the banner and clears every cmplz cookie.
       A record written without the current id is wiped on the next page and
       the banner comes back.

    3. THEIR DECISION DISPATCHES PER CATEGORY. cmplz_set_consent ends in a
       cmplz_status_change CustomEvent carrying
       { category, value, region, categories }, once for each category, and
       the page's own code and their tag-manager bridge both listen for it.

    Their do-not-track handling is left alone. cmplz_do_not_track() reads
    navigator.globalPrivacyControl and navigator.doNotTrack, and a visitor who
    has set either has already said something this resource should not talk
    over.

*/

function consentRRComplianz(mode) {
    const w = window;
    const doc = w.document;

    const accept = mode === 'accept';
    const NAME = 'complianz-' + mode;
    const VERSION = '@@VERSION@@';

    // Theirs, in their order. functional is first and always consented.
    const CATEGORIES = [ 'functional', 'preferences', 'statistics', 'marketing' ];

    const say = what => {
        try {
            w.console.info('[consent-rr] ' + NAME + ' ' + VERSION + ' ' + what);
        } catch(ex) {
        }
    };

    /**************************************************************************/

    // The page's own configuration, with their defaults where a field is
    // absent. Reading it is not optional: the cookie prefix alone makes a
    // hardcoded name wrong.
    const config = ( ) => {
        let given = null;
        try {
            given = w.complianz;
        } catch(ex) {
        }
        if ( given === null || typeof given !== 'object' ) { given = {}; }
        const take = (key, fallback) => {
            try {
                const value = given[key];
                if ( value === undefined || value === null ) { return fallback; }
                return value;
            } catch(ex) {
            }
            return fallback;
        };
        return {
            prefix: String(take('prefix', 'cmplz_')),
            expiry: Number(take('cookie_expiry', 365)) || 365,
            policyId: take('current_policy_id', ''),
            consentType: String(take('consenttype', 'optin')),
            region: take('region', ''),
            domain: String(take('cookie_domain', '')),
            path: String(take('cookie_path', '/')) || '/',
            cleanCookies: Number(take('clean_cookies', 0)) === 1,
        };
    };

    const cfg = config();

    /**************************************************************************/

    const readCookie = name => {
        const want = cfg.prefix + name + '=';
        try {
            for ( const part of String(doc.cookie).split(';') ) {
                const one = part.trim();
                if ( one.startsWith(want) === false ) { continue; }
                return one.slice(want.length);
            }
        } catch(ex) {
        }
        return '';
    };

    // Their writer, including the prefix switch their own cmplz_set_cookie
    // takes as its third argument: a page can ask for an unprefixed name.
    const writeCookie = (name, value, prefixed) => {
        const key = (prefixed === false ? '' : cfg.prefix) + name;
        const when = new Date();
        when.setTime(when.getTime() + cfg.expiry * 86400000);
        let out = key + '=' + value +
            ';SameSite=Lax' +
            (String(w.location.protocol) === 'https:' ? ';secure' : '') +
            ';expires=' + when.toUTCString();
        if ( cfg.domain !== '' ) { out += ';domain=' + cfg.domain; }
        out += ';path=' + cfg.path;
        try {
            doc.cookie = out;
            return true;
        } catch(ex) {
        }
        return false;
    };

    /**************************************************************************/

    const consentedFor = category => {
        if ( category === 'functional' ) { return true; }
        return accept;
    };

    const acceptedCategories = ( ) =>
        CATEGORIES.filter(category => consentedFor(category));

    // Their auto-blocker parks a tag with the category and, optionally, the
    // service on the element. Both are read rather than assumed, because a
    // service is a tenant's own name.
    const parked = ( ) => {
        const out = [];
        try {
            const nodes = doc.querySelectorAll('[data-category], [data-service]');
            for ( const node of Array.from(nodes) ) {
                out.push(node);
            }
        } catch(ex) {
        }
        return out;
    };

    const services = ( ) => {
        const out = [];
        for ( const node of parked() ) {
            let name = '';
            try {
                name = String(node.getAttribute('data-service') || '');
            } catch(ex) {
            }
            if ( name === '' || name === 'general' ) { continue; }
            if ( out.includes(name) === false ) { out.push(name); }
        }
        return out;
    };

    /**************************************************************************/

    // Their record, in the five cookies their own decision writes.
    const writeRecord = ( ) => {
        let wrote = 0;
        for ( const category of CATEGORIES ) {
            const value = consentedFor(category) ? 'allow' : 'deny';
            if ( writeCookie(category, value) ) { wrote += 1; }
        }
        // Without this their cmplz_check_cookie_policy_id denies everything,
        // clears every cmplz cookie and shows the banner again on the next
        // page.
        if ( cfg.policyId !== '' ) {
            writeCookie('policy_id', String(cfg.policyId));
        }
        writeCookie('banner-status', 'dismissed');
        const taken = acceptedCategories();
        try {
            writeCookie('saved_categories', JSON.stringify(taken));
        } catch(ex) {
        }
        const named = services();
        const map = {};
        for ( const service of named ) { map[service] = accept; }
        try {
            writeCookie('consented_services', JSON.stringify(map));
            writeCookie('saved_services', JSON.stringify(map));
        } catch(ex) {
        }
        return { wrote, services: named.length };
    };

    /**************************************************************************/

    const fire = (name, detail) => {
        try {
            let event = null;
            try {
                event = new w.CustomEvent(name, { detail });
            } catch(ex) {
                event = doc.createEvent('CustomEvent');
                event.initCustomEvent(name, false, false, detail || null);
            }
            doc.dispatchEvent(event);
            return true;
        } catch(ex) {
        }
        return false;
    };

    // Their per-category dispatch, from the tail of cmplz_set_consent. The
    // detail fields are theirs.
    const announce = ( ) => {
        let told = 0;
        for ( const category of CATEGORIES ) {
            const consented = consentedFor(category);
            fire('cmplz_status_change', {
                category,
                value: consented ? 'allow' : 'deny',
                region: cfg.region,
                categories: acceptedCategories(),
            });
            told += 1;
            if ( consented === false ) { continue; }
            fire('cmplz_before_category', {
                category,
                categories: acceptedCategories(),
                region: cfg.region,
            });
        }
        return told;
    };

    /**************************************************************************/

    // Reviving a parked tag the way theirs does, which is only reached in
    // accept mode. A refusal leaves every one of them exactly where it is -
    // that is the whole point of their blocker, and this does not undo it.
    const revive = ( ) => {
        if ( accept === false ) { return 0; }
        let count = 0;
        // Their placeholder notices go first, so the page is not left with a
        // "click to accept" box over content that has been released.
        try {
            const notices = doc.querySelectorAll('.cmplz-blocked-content-notice');
            for ( const notice of Array.from(notices) ) {
                try {
                    notice.parentNode.removeChild(notice);
                } catch(ex) {
                }
            }
        } catch(ex) {
        }
        for ( const node of parked() ) {
            let category = '';
            try {
                category = String(node.getAttribute('data-category') || '');
            } catch(ex) {
            }
            if ( category === 'functional' ) { continue; }
            try {
                if ( node.classList.contains('cmplz-activated') ) { continue; }
            } catch(ex) {
            }
            let tag = '';
            try {
                tag = String(node.tagName || '').toUpperCase();
            } catch(ex) {
            }
            const attr = name => {
                try {
                    return node.getAttribute(name);
                } catch(ex) {
                }
                return null;
            };
            try {
                node.classList.add('cmplz-activated');
            } catch(ex) {
            }
            // Their own attribute names, which differ per element: a link
            // carries data-href, an image or a frame data-src-cmplz, and a
            // script data-src with its real type parked alongside it.
            try {
                if ( tag === 'LINK' ) {
                    const href = attr('data-href');
                    if ( href !== null ) { node.setAttribute('href', href); }
                    count += 1;
                    continue;
                }
                if ( tag === 'IMG' || tag === 'IFRAME' ) {
                    const src = attr('data-src-cmplz') || attr('data-src');
                    if ( src !== null ) { node.setAttribute('src', src); }
                    count += 1;
                    continue;
                }
                if ( tag === 'SCRIPT' ) {
                    // A parked script cannot be un-parked in place: the
                    // browser has already skipped it. A copy is what runs.
                    const copy = doc.createElement('script');
                    const type = attr('data-script-type');
                    copy.type = type !== null && type !== 'text/plain'
                        ? type
                        : 'text/javascript';
                    const src = attr('data-src');
                    if ( src !== null ) {
                        copy.src = src;
                        copy.async = false;
                    } else {
                        copy.textContent = String(node.textContent || '');
                    }
                    for ( const name of [ 'data-category', 'data-service' ] ) {
                        const value = attr(name);
                        if ( value !== null ) { copy.setAttribute(name, value); }
                    }
                    copy.classList.add('cmplz-activated');
                    node.parentNode.insertBefore(copy, node.nextSibling);
                    count += 1;
                    continue;
                }
            } catch(ex) {
            }
        }
        return count;
    };

    /**************************************************************************/

    // Their public surface, which other scripts on the page call. Every name
    // here is one theirs puts on the window.
    const install = ( ) => {
        const api = {
            cmplz_get_cookie: name => readCookie(String(name)),
            cmplz_set_cookie: (name, value, prefixed) =>
                writeCookie(String(name), String(value), prefixed),
            cmplz_has_consent: category => {
                // Their own shortcut, and their bot allowance, in their order.
                const want = String(category);
                if ( want === 'functional' ) { return true; }
                return consentedFor(want);
            },
            cmplz_in_array: (value, list) => {
                try {
                    return list.includes(value);
                } catch(ex) {
                }
                return false;
            },
            cmplz_get_banner_status: ( ) => readCookie('banner-status'),
            cmplz_set_banner_status: status => {
                writeCookie('banner-status', String(status));
                fire('cmplz_banner_status', { status: String(status) });
            },
            cmplz_highest_accepted_category: ( ) => {
                for ( const category of [ 'marketing', 'statistics', 'preferences' ] ) {
                    if ( consentedFor(category) ) { return category; }
                }
                return '';
            },
            cmplz_is_service_denied: ( ) => accept === false,
            cmplz_has_service_consent: ( ) => accept,
            cmplz_set_consent: (category, value) => {
                // A page may drive the decision. Honour it only where it
                // agrees with the mode: a refusal asked to allow marketing is
                // a page arguing with the filter, and the filter wins.
                const want = String(value) === 'allow';
                if ( want !== accept && String(category) !== 'functional' ) {
                    return false;
                }
                writeRecord();
                announce();
                return true;
            },
            cmplz_accept_all: ( ) => accept,
            cmplz_deny_all: ( ) => accept === false,
            cmplzScriptLoaded: true,
        };
        for ( const name of Object.keys(api) ) {
            try {
                w[name] = api[name];
            } catch(ex) {
            }
        }
        try {
            w.cmplz_categories = CATEGORIES.slice();
            w.cmplz_accepted_categories = ( ) => acceptedCategories();
        } catch(ex) {
        }
    };

    /**************************************************************************/

    let there = null;
    try {
        there = w.cmplz_set_consent;
    } catch(ex) {
    }
    if ( typeof there === 'function' ) {
        say('kept=theirs');
        return;
    }

    install();
    const record = writeRecord();
    const revived = revive();
    const told = announce();

    // Their load-time events, in the order their own script fires them. A
    // page or a plugin waiting on any of these is waiting for the banner
    // script that is no longer coming.
    fire('cmplz_cookie_warning_loaded', { region: cfg.region });
    fire('cmplz_enable_category', { category: 'functional' });
    fire('cmplz_fire_categories', { categories: acceptedCategories() });
    fire('cmplz_run_after_all_scripts', { categories: acceptedCategories() });

    // Their WordPress Consent API bridge, where the site has one. Theirs
    // calls it per category; this follows rather than inventing a shape.
    try {
        if ( typeof w.wp_set_consent === 'function' ) {
            for ( const category of CATEGORIES ) {
                w.wp_set_consent(
                    category, consentedFor(category) ? 'allow' : 'deny'
                );
            }
        }
    } catch(ex) {
    }

    say('categories=' + (accept ? 'all' : 'functional') +
        ' cookies=' + record.wrote +
        ' services=' + record.services +
        ' revived=' + revived +
        ' told=' + told +
        ' prefix=' + cfg.prefix +
        ' policy=' + (cfg.policyId !== '' ? 'kept' : 'absent') +
        ' consenttype=' + cfg.consentType);
}

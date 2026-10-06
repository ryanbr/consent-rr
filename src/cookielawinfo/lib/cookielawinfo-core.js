/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    The legacy Cookie Law Info plugin for WordPress - WebToffee's "GDPR Cookie
    Consent", the ancestor of today's CookieYes plugin - served by the site
    itself:

        /wp-content/plugins/cookie-law-info/js/cookielawinfo.js?ver=<version>

    NOT the hosted CookieYes script, which is a different generation of the
    same company's work and has its own family here. Nothing of _ckyStore,
    cookieyes-consent or data-cookieyes exists in this one.

    THE SMALLEST CMP IN THIS REPO. Four versions were read - 1.5.4, 1.6.3,
    3.3.2 and 4.1.10, the last two byte-identical to each other - and all of
    them are one file with two globals and one cookie:

        function cli_show_cookiebar(p)      the banner, taking
                                            {html, settings} from the page
        function l1hs(str)                  a hash helper, also global

    The page passes its own markup in, which is why replacing this file is
    enough to leave no banner at all - there is nothing in the document until
    their function prepends it:

        cli_show_cookiebar({
            html: '<div id="cookie-law-info-bar">...</div>',
            settings: '{"notify_div_id":"#cookie-law-info-bar", ...}'
        });

    THEIR RECORD is one cookie, and their own constants:

        ACCEPT_COOKIE_NAME = 'viewed_cookie_policy'
        ACCEPT_COOKIE_EXPIRE = 365
        document.cookie = name+"="+value+expires+"; path=/";

    with 'yes' from their accept and 'no' from their decline - which only
    1.5.4 and 1.6.3 write, the later file having no decline path at all. 'no'
    is what goes in here, because it is their own value for this answer.

    Their banner shows on the absence of that cookie rather than on its
    value:

        if (!Cookie.exists(ACCEPT_COOKIE_NAME)) { ... displayHeader() }

    so a record of either value keeps it away, and a stored 'yes' from before
    this was installed is overwritten.

    THEIR BANNER IS NOT ALWAYS THEIRS TO INSERT, which is the one thing a
    no-op gets wrong. 3.3.2 and 4.1.10 prepend the markup themselves -

        jQuery('body').prepend(html);

    - so replacing the file leaves nothing in the document. 1.5.4 and 1.6.3
    have no prepend at all, no mention of body: their markup is printed into
    the page by PHP and the script only wires and positions it. Measured on a
    live 1.6.3 site, the page carries

        <div id="cookie-law-info-bar">...</div>
        <div id="cookie-law-info-again">...</div>

    and their own cli-style.css gives #cookie-law-info-bar position absolute
    and z-index 9999 with NO display:none - it is their script that hides it
    once the cookie exists. So a stub that only declines would leave a dead
    cookie bar sitting on the page.

    Both of theirs go, by the ids their own settings name - notify_div_id and
    showagain_div_id - and by their defaults where the page never calls in.

    WHAT THIS FILE DOES NOT DO, in any of the four versions: block or park a
    single script, name a category, or offer an api. There is nothing to
    un-block and nothing to accept, which is why this family is one resource.

    IT CANNOT BE BLOCKED INSTEAD. The page calls cli_show_cookiebar from an
    inline script, so with the file gone that is a ReferenceError - and it
    takes the rest of that inline block with it, which on the sites sampled
    is inside a jQuery ready handler shared with other plugins.

*/

// @include ../../shared/lib/deferred.js

function consentRRCookieLawInfo() {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'cookielawinfo-reject';
    const VERSION = '@@VERSION@@';

    // Their own constants.
    const COOKIE = 'viewed_cookie_policy';
    const EXPIRE_DAYS = 365;
    // Their decline value, from the versions that have a decline button.
    const VALUE = 'no';

    /**************************************************************************/

    // Their own Cookie.set, attribute for attribute: a day count turned into
    // an expires, a path of /, and nothing else - no domain, no SameSite, no
    // Secure, because theirs sets none of those.
    const write = ( ) => {
        let expires = '';
        if ( EXPIRE_DAYS ) {
            const date = new Date();
            date.setTime(date.getTime() + EXPIRE_DAYS * 24 * 60 * 60 * 1000);
            expires = '; expires=' + date.toGMTString();
        }
        try {
            doc.cookie = COOKIE + '=' + VALUE + expires + '; path=/';
            return true;
        } catch ( ex ) {
        }
        return false;
    };

    const read = ( ) => {
        try {
            const nameEQ = COOKIE + '=';
            for ( let item of String(doc.cookie || '').split(';') ) {
                while ( item.charAt(0) === ' ' ) { item = item.slice(1); }
                if ( item.indexOf(nameEQ) === 0 ) {
                    return item.slice(nameEQ.length);
                }
            }
        } catch ( ex ) {
        }
        return null;
    };

    const before = read();
    const stored = write();

    /**************************************************************************/

    // Their own default ids, from their settings on every version sampled.
    const DEFAULT_IDS = [ '#cookie-law-info-bar', '#cookie-law-info-again' ];

    let removed = 0;
    const drop = selector => {
        const text = String(selector || '').trim();
        if ( text === '' ) { return; }
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(
                text.charAt(0) === '#' || text.charAt(0) === '.'
                    ? text
                    : '#' + text
            ));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
            if ( node.parentNode === null ) { continue; }
            node.parentNode.removeChild(node);
            removed += 1;
        }
    };

    const sweep = ( ) => {
        for ( const id of DEFAULT_IDS ) { drop(id); }
        return 0;
    };

    // Their banner. On 3.3.2 and 4.1.10 the markup arrives here and theirs
    // prepends it, so not prepending is the whole job; on 1.5.4 and 1.6.3 it
    // is already in the page, so the ids their settings name are taken out.
    let called = 0;
    const showCookieBar = function(given) {
        called += 1;
        let settings = null;
        try {
            const payload = given !== null && typeof given === 'object'
                ? given.settings
                : null;
            if ( typeof payload === 'string' ) {
                settings = JSON.parse(payload);
            } else if ( payload !== null && typeof payload === 'object' ) {
                settings = payload;
            }
        } catch ( ex ) {
            settings = null;
        }
        if ( settings !== null && typeof settings === 'object' ) {
            drop(settings.notify_div_id);
            drop(settings.showagain_div_id);
        }
        // Their own ids as well, in case a tenant's settings name neither.
        // This sweep is the fast path rather than the guarantee: the
        // pass-again below is what catches a bar that is still being parsed,
        // and in a harness the document is already built, so no test can
        // tell the two apart.
        sweep();
    };

    // Their other global, verbatim - a page or a theme that calls it gets the
    // answer theirs gives:
    //
    //   function l1hs(str){if(str.charAt(0)=="#"){str=str.substring(1,
    //       str.length);}else{return "#"+str;}return l1hs(str);}
    const hashOf = function l1hs(str) {
        const text = String(str);
        if ( text.charAt(0) === '#' ) {
            return l1hs(text.slice(1));
        }
        return '#' + text;
    };

    try {
        w.cli_show_cookiebar = showCookieBar;
        w.l1hs = hashOf;
    } catch ( ex ) {
    }

    // Their markup is in the body and this stands in for a script in the
    // head, so the sweep runs again as the document arrives - and for a page
    // that prints their bar without ever calling in, that is the only pass
    // there is.
    consentRRDeferred(w, doc, sweep, '');

    /**************************************************************************/

    try {
        Object.defineProperty(w, 'cookieLawInfoRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: 'reject',
                state: function() {
                    return {
                        cookie: COOKIE,
                        value: read(),
                        stored: stored,
                        overwrote: before !== null && before !== VALUE
                            ? before
                            : null,
                        shown: called,
                        removed: removed,
                    };
                },
            },
            configurable: true,
            enumerable: false,
            writable: true,
        });
    } catch ( ex ) {
    }

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' cookie=' + COOKIE + '=' + VALUE +
            ' stored=' + (stored ? 'yes' : 'no') +
            ' was=' + (before === null ? 'absent' : before) +
            ' removed=' + removed +
            ' banner=none blocked=none sent=none'
        );
    }
}

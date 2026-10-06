/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    ConnectHolland's CookieConsentBundle for Symfony, served by the site
    itself:

        /bundles/chcookieconsent/js/cookie_consent.js

    A different shape from every other family here: THE CONSENT IS WRITTEN BY
    THEIR SERVER. Their script posts the banner's form over XHR and the
    Set-Cookie headers on that response are the record; nothing in their
    JavaScript writes a cookie, and nothing in it blocks a tag. Their Twig
    helper decides server-side, at render time, whether a tracker goes into
    the page at all:

        {% if cookie_consent_is_category_allowed('analytics') %}

    so the refusal has to be in their cookies before the next render, and
    there is nothing parked in this page to free.

    THEIR RECORD, from their own Cookie/CookieHandler.php and
    Enum/CookieNameEnum.php:

        Cookie_Consent              date('r'), an RFC 2822 date
        Cookie_Consent_Key          the existing key, else uniqid()
        Cookie_Category_<category>  the string true or false

    each one a year out, on path /, SameSite=Lax, and Secure on an https
    page - their Symfony Cookie is built with a null secure flag, which
    Symfony resolves to the request's own. Their categories are a config list;
    Enum/CategoryEnum.php names analytics, tracking, marketing and
    social_media, their default config names the last three, and the live page
    measured for this names analytics, tracking and marketing. So the form in
    the page is read first and those four are the fallback.

    Their own gate is an exact string compare:

        public function isCategoryAllowedByUser(string $category): bool
        {
            return $this->requestStack->getCurrentRequest()->cookies
                ->get(CookieNameEnum::getCookieCategoryName($category))
                === 'true';
        }

    and their banner shows on Cookie_Consent being absent, not on its value,
    so writing it is what makes the banner stop coming back.

    THEIR BANNER IS SERVER-RENDERED, and their own template puts the script
    tag inside it, immediately above the markup:

        {% block script %}
            <script src="{{ asset('bundles/chcookieconsent/js/cookie_consent.js') }}"></script>
        {% endblock %}
        <div class="ch-cookie-consent ...">

    so this stands in for a script whose own banner is parsed just after it,
    and the pass runs again as the document arrives.

    IT CANNOT BE BLOCKED INSTEAD, and this one is worse than most. Their own
    form theme renders the buttons through Symfony's button_widget -

        {% block submit_row %}
            <div class="ch-cookie-consent__btn-wrapper">
                {{ block('button_widget') }}
            </div>
        {% endblock %}

    - which is type="button", not type="submit". Measured on the live page:
    both buttons are type="button". Their click handler is the only thing that
    submits anything, so blocking the file leaves a banner that cannot be
    dismissed at all. Their stylesheet gives .ch-cookie-consent a z-index of
    99999 and no position, no display:none: it is their script that lifts it
    out of the page flow, so blocking also leaves it sitting in the middle of
    the document.

    WHAT IS NOT REPRODUCED, because it would be a request:

      - Their POST to the form's action. Their CookieLogger writes one
        cookie_consent_log row per category, with the visitor's IP cut to its
        last dot, every time that form is submitted. Nothing is posted here,
        so nothing is logged.
      - Their CustomEvent polyfill, which is for browsers that uBlock Origin
        does not run in.

*/

// @include ../../shared/lib/deferred.js

function consentRRChCookieConsent() {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'chcookieconsent-reject';
    const VERSION = '@@VERSION@@';

    // Their own names.
    const CONSENT_COOKIE = 'Cookie_Consent';
    const KEY_COOKIE = 'Cookie_Consent_Key';
    const CATEGORY_PREFIX = 'Cookie_Category_';
    // Enum/CategoryEnum.php, all four. Used where their form is not in the
    // page to be read.
    const KNOWN = [ 'analytics', 'tracking', 'marketing', 'social_media' ];
    // Their own value for a refused category.
    const REFUSED = 'false';
    // Their own names for the buttons, which are not categories.
    const BUTTONS = [ 'save', 'use_all_cookies', 'use_only_functional_cookies' ];

    /**************************************************************************/

    const read = name => {
        try {
            const nameEQ = name + '=';
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

    // Their CookieHandler::saveCookie, attribute for attribute, measured
    // against what their server actually sets on a live https page:
    //
    //   Cookie_Category_analytics  false   / www.trapicheos.net  HttpOnly
    //   Cookie_Consent  Tue, 06 Oct 2026 08:00:20 +0000          HttpOnly
    //   Cookie_Consent_Key  6ac4aa94b9c7f                        HttpOnly
    //
    // path /, host-only, SameSite=Lax - and NO Secure flag, on an https page.
    // Their Symfony Cookie is built with a null secure flag, which resolves to
    // Response::prepare's secure default, and that is the request as the app
    // sees it: behind a proxy without trusted_proxies set, that is not secure.
    // So no Secure here either, which is also what a refusal wants - a
    // cookie without it is sent on both schemes, so their server reads it
    // either way.
    //
    // HttpOnly is theirs and cannot be set from a page. It is also why their
    // own cookie's lifetime cannot be matched exactly: a browser may cap what
    // a page writes harder than what a server writes - Brave caps a cookie
    // set from JavaScript at 7 days and one set by a header at 6 months, and
    // the live screenshot shows their own year cut to the latter. The year
    // their CookieHandler asks for is asked for here; the browser decides.
    let written = 0;
    let blocked = 0;
    const write = (name, value) => {
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        const line = name + '=' + value +
            '; expires=' + expires.toUTCString() +
            '; path=/; samesite=lax';
        try {
            doc.cookie = line;
        } catch ( ex ) {
            return false;
        }
        // A cookie this wrote is readable, because a page cannot set HttpOnly.
        // So a name that reads back as something else is a cookie their own
        // server set with HttpOnly on - their default - and a page is not
        // allowed to replace one of those. That is the one case this cannot
        // answer, and it says so rather than reporting a refusal it did not
        // manage to store.
        if ( read(name) !== value ) {
            blocked += 1;
            return false;
        }
        written += 1;
        return true;
    };

    /**************************************************************************/

    // date('r'), which is what their CookieHandler stores in Cookie_Consent.
    // Theirs is their server's clock, and the one measured reads
    //
    //   Tue, 06 Oct 2026 08:00:20 +0000
    //
    // so this is in UTC, not in the visitor's zone. Their server only checks
    // that the cookie is there, and a date in the visitor's zone would hand
    // it a timezone offset it is not otherwise given.
    const DAY_NAMES = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];
    const MONTH_NAMES = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const pad = given => (given < 10 ? '0' : '') + given;
    const rfc2822 = date => DAY_NAMES[date.getUTCDay()] + ', ' +
        pad(date.getUTCDate()) + ' ' + MONTH_NAMES[date.getUTCMonth()] + ' ' +
        date.getUTCFullYear() + ' ' + pad(date.getUTCHours()) + ':' +
        pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) +
        ' +0000';

    // uniqid(), which is their key where the visitor has none: thirteen
    // lowercase hex characters, eight of seconds and five of microseconds.
    const uniqid = ( ) => {
        const now = Date.now();
        let head = Math.floor(now / 1000).toString(16);
        while ( head.length < 8 ) { head = '0' + head; }
        let tail = ((now % 1000) * 1000).toString(16);
        while ( tail.length < 5 ) { tail = '0' + tail; }
        return head.slice(-8) + tail.slice(-5);
    };

    /**************************************************************************/

    // Their categories. The page's own form is the authority, because their
    // config list is free-form - a tenant can name a category this does not
    // know - and the form carries one radio pair per category:
    //
    //   <input type="radio" name="cookie_consent[analytics]" value="true">
    //   <input type="radio" name="cookie_consent[analytics]" value="false">
    //
    // beside their buttons and their CSRF token, which are in the same
    // namespace and are not categories.
    const fromForm = ( ) => {
        const out = [];
        let nodes = [];
        try {
            nodes = Array.from(
                doc.querySelectorAll('[name^="cookie_consent["]')
            );
        } catch ( ex ) {
            return out;
        }
        for ( const node of nodes ) {
            const name = String(node.getAttribute('name') || '');
            if ( name.slice(-1) !== ']' ) { continue; }
            const slug = name.slice('cookie_consent['.length, -1);
            if ( slug === '' || slug.charAt(0) === '_' ) { continue; }
            if ( BUTTONS.indexOf(slug) !== -1 ) { continue; }
            if ( out.indexOf(slug) !== -1 ) { continue; }
            out.push(slug);
        }
        return out;
    };

    // Measured against their own file: their refusal button posts
    //
    //   cookie_consent[analytics]=false&cookie_consent[tracking]=false
    //   &cookie_consent[marketing]=false&cookie_consent[_token]=...
    //   &cookie_consent[use_only_functional_cookies]=
    //
    // and their server turns each of those into one Cookie_Category cookie.
    // So the form is the list, and the four names are only for a page that
    // turns out not to carry one - which is why the fallback waits for the
    // document to be done. At the point this script runs their banner is one
    // line further down the page and has not been parsed yet: falling back
    // there would write a refusal for a category the site does not have.
    const refused = [];
    let sawForm = false;
    const recordCategories = ( ) => {
        const found = fromForm();
        if ( found.length !== 0 ) { sawForm = true; }
        // And once their form has been read, it stays read: the pass runs
        // again after the banner has been taken out, and the fallback would
        // then add a category the site never had.
        if ( found.length === 0 && (sawForm || doc.readyState === 'loading') ) {
            return;
        }
        for ( const slug of found.length !== 0 ? found : KNOWN ) {
            if ( refused.indexOf(slug) !== -1 ) { continue; }
            refused.push(slug);
            write(CATEGORY_PREFIX + slug, REFUSED);
        }
    };

    // Their key is kept where the visitor has one, as their own
    // getCookieConsentKey does. Their Cookie_Consent goes in straight away,
    // because its presence is what their banner tests.
    const held = read(KEY_COOKIE);
    const key = held !== null ? held : uniqid();
    const stamp = rfc2822(new Date());
    write(CONSENT_COOKIE, stamp);
    write(KEY_COOKIE, key);
    recordCategories();

    /**************************************************************************/

    // Their banner, which their own script is what positions - so leaving it
    // is leaving it in the middle of the page, with buttons that cannot work.
    let removed = 0;
    const sweep = ( ) => {
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll('.ch-cookie-consent'));
        } catch ( ex ) {
            return 0;
        }
        for ( const node of nodes ) {
            if ( node.parentNode === null ) { continue; }
            node.parentNode.removeChild(node);
            removed += 1;
        }
        // Their own submit clears both of these, because their positioning
        // sets one of them to the banner's height.
        try {
            if ( doc.body !== null ) {
                doc.body.style.marginTop = null;
                doc.body.style.marginBottom = null;
            }
        } catch ( ex ) {
        }
        return 0;
    };

    // Their own event, from the end of their XHR handler:
    //
    //   var buttonEvent = new CustomEvent(
    //       'cookie-consent-form-submit-successful', { detail: event.target });
    //   document.dispatchEvent(buttonEvent);
    //
    // at the document, not bubbling, carrying the button that was clicked.
    // Theirs fires after a click, so it fires here on the pass that takes
    // their banner out rather than at boot, when a page's own listener is
    // not registered yet - and before the removal, so the button a listener
    // is handed is still in the document, as it is in theirs.
    // Said once, from the pass that settles the answer rather than from the
    // top of the script: their banner is parsed one line below their script
    // tag, so at the point this is injected there is no form to read the
    // categories off and no banner to count. A line said here would report
    // refused=none on every page that loads the way a page actually loads.
    let said = 0;
    const report = ( ) => {
        if ( said !== 0 ) { return; }
        said += 1;
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' cookie=' + CONSENT_COOKIE +
            ' written=' + written +
            ' blocked=' + blocked +
            ' refused=' + (refused.length !== 0 ? refused.join(',') : 'none') +
            ' removed=' + removed +
            ' told=' + told +
            ' banner=none parked=none posted=none logged=none'
        );
    };

    let told = 0;
    const tell = ( ) => {
        if ( told !== 0 ) { return; }
        let button = null;
        try {
            button = doc.querySelector(
                '[name="cookie_consent[use_only_functional_cookies]"]'
            ) || doc.querySelector('[name="cookie_consent[save]"]') ||
                doc.querySelector('.ch-cookie-consent__btn');
        } catch ( ex ) {
            button = null;
        }
        try {
            doc.dispatchEvent(new w.CustomEvent(
                'cookie-consent-form-submit-successful',
                { detail: button }
            ));
            told += 1;
        } catch ( ex ) {
        }
    };

    const pass = ( ) => {
        recordCategories();
        let standing = 0;
        try {
            standing = doc.querySelectorAll('.ch-cookie-consent').length;
        } catch ( ex ) {
        }
        // Their banner is here, or the document is far enough along that it
        // is never coming: either way the answer is settled.
        const settled = standing !== 0 || doc.readyState !== 'loading';
        if ( standing !== 0 ) { tell(); }
        sweep();
        if ( doc.readyState !== 'loading' ) { tell(); }
        if ( settled ) { report(); }
        return 0;
    };

    pass();

    // Their banner is parsed just below their script tag, so the pass runs
    // again as the document arrives.
    consentRRDeferred(w, doc, pass, '');

    /**************************************************************************/

    // Their one other global, verbatim - a top-level function declaration in
    // their file, so a page can reach it. It touches no network.
    const serialize = function serializeForm(form, clickedButton) {
        const serialized = [];
        for ( let i = 0; i < form.elements.length; i++ ) {
            const field = form.elements[i];
            if (
                (field.type !== 'checkbox' && field.type !== 'radio' &&
                    field.type !== 'button') || field.checked
            ) {
                serialized.push(
                    encodeURIComponent(field.name) + '=' +
                    encodeURIComponent(field.value)
                );
            }
        }
        serialized.push(
            encodeURIComponent(clickedButton.getAttribute('name')) + '='
        );
        return serialized.join('&');
    };

    try {
        w.serializeForm = serialize;
    } catch ( ex ) {
    }

    /**************************************************************************/

    try {
        Object.defineProperty(w, 'chCookieConsentRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: 'reject',
                state: function() {
                    return {
                        consent: CONSENT_COOKIE,
                        stamp: stamp,
                        key: key,
                        refused: refused.slice(),
                        written: written,
                        blocked: blocked,
                        removed: removed,
                        told: told,
                    };
                },
            },
            configurable: true,
            enumerable: false,
            writable: true,
        });
    } catch ( ex ) {
    }

}

/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    WebToffee's GDPR Cookie Consent for WordPress, the one that does block
    scripts - plugin slug webtoffee-gdpr-cookie-consent, and the same file
    name under the older cookie-law-info slug:

        /public/js/cookie-law-info-public.js?ver=2.5.3

    The legacy single-file version of this plugin has its own resource here,
    cookielawinfo-reject.js; that one has no blocking, no categories and no
    api. This one has all three. Theirs ships unminified, so everything below
    was read rather than inferred.

    THEIR OWN REFUSAL, which is what this writes, verbatim from their file:

        reject_close: function() {
            this.hidePopupOverlay();
            for ( var k in Cli_Data.nn_cookie_ids ) {
                CLI_Cookie.erase(Cli_Data.nn_cookie_ids[k]);
            }
            CLI_Cookie.set(CLI_ACCEPT_COOKIE_NAME, 'no',
                CLI_ACCEPT_COOKIE_EXPIRE);
            ...
            this.generate_user_preference_cookie();
            CLI.generateConsent();
        }

    so a refusal ERASES each non-necessary category cookie rather than setting
    it to no, and then writes three records of its own:

      viewed_cookie_policy      'no', their CLI_ACCEPT_COOKIE_NAME
      cli_user_preference       <lang>-cli-no-<id>-no-<id>-no..., their own
                                join of the checkbox states
      CookieLawInfoConsent      base64 of JSON, their CLI_PREFERNCE_COOKIE:
                                {"ver":<consentVersion>,"<cat>":"false",...}
                                with the keys taken from their checkboxes'
                                data-id minus the "checkbox-" prefix, and the
                                values as the STRINGS true and false

    THEIR COOKIE WRITER, attribute for attribute:

        secure = Boolean(Cli_Data.secure_cookies) ? ";secure" : "";
        domain = Cli_Data.cookieDomain !== '' ? ";domain=" + ... : '';
        document.cookie = name+"="+value+secure+expires+domain+";path=/";

    and their erase is set(name, "", -10), which their own eraseCookie turns
    into an expiry across their host scopes.

    EVERYTHING COMES FROM THE PAGE. Their script reads a Cli_Data object and
    four consts the page prints above it:

        CLI_ACCEPT_COOKIE_NAME      'viewed_cookie_policy'
        CLI_PREFERNCE_COOKIE        'CookieLawInfoConsent'
        CLI_ACCEPT_COOKIE_EXPIRE    365
        CLI_COOKIEBAR_AS_POPUP      false

    each read as typeof X !== 'undefined' ? X : <default>, so the defaults
    above are theirs as well.

    THEIR BANNER IS SERVER-RENDERED. There is no cli_show_cookiebar here and
    no prepend anywhere in the file: the markup is printed into the page by
    PHP and this script only wires it. So the markup has to be taken out, the
    way the legacy resource does it - the bar, the show-again tab, their
    settings popup and its overlay.

    THEIR BLOCKING, by their own contract:

        script[data-cli-class="cli-blocker-script"]
        data-cli-src, data-cli-script-type, data-cli-label,
        data-cli-placeholder, data-cli-element-position, data-cli-block,
        data-cli-block-if-ccpa-optout

    with non-script elements carrying the same data-cli-class and released by
    their renderSrcElement. A refusal leaves all of it parked, which is the
    point of it; webtoffee-reject-unblock.js releases it the way their own
    insertScript does, one at a time, chained on load.

    NOTHING IS LOGGED. Their saveLog posts the whole cookie jar to
    Cli_Data.ajax_url when their logging_on is set. Nothing here posts
    anywhere.

*/

// @include ../../shared/lib/deferred.js

function consentRRWebToffee(mode) {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'webtoffee-' + mode;
    const VERSION = '@@VERSION@@';
    const unblockAll = mode === 'reject-unblock';

    // Their own defaults for the four consts a page prints above their script.
    const named = (name, fallback) => {
        try {
            const given = w[name];
            return given === undefined ? fallback : given;
        } catch ( ex ) {
        }
        return fallback;
    };
    const ACCEPT_COOKIE = String(
        named('CLI_ACCEPT_COOKIE_NAME', 'viewed_cookie_policy')
    );
    const PREFERENCE_COOKIE = String(
        named('CLI_PREFERNCE_COOKIE', 'CookieLawInfoConsent')
    );
    const EXPIRE_DAYS = Number(named('CLI_ACCEPT_COOKIE_EXPIRE', 365)) || 365;

    const data = ( ) => {
        const given = w.Cli_Data;
        return given !== null && typeof given === 'object' ? given : {};
    };
    const field = (name, fallback) => {
        const value = data()[name];
        return value === undefined ? fallback : value;
    };

    // Their own UI, every piece of it.
    const UI = [
        '#cookie-law-info-bar',
        '#cookie-law-info-again',
        '#cliSettingsPopup',
        '.cli-modal-backdrop',
        '.cli-settings-overlay',
    ];

    let erased = 0;
    let written = 0;
    let removed = 0;
    let freed = 0;
    let parked = 0;

    /**************************************************************************/

    // Their CLI_Cookie.set, attribute for attribute.
    const setCookie = (name, value, days) => {
        const secure = Boolean(field('secure_cookies', false)) ? ';secure' : '';
        const domain = String(field('cookieDomain', '')) !== ''
            ? ';domain=' + field('cookieDomain', '')
            : '';
        const date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        const expires = ';expires=' + date.toGMTString();
        try {
            doc.cookie = name + '=' + value + secure + expires + domain +
                ';path=/';
            return true;
        } catch ( ex ) {
        }
        return false;
    };

    const readCookie = name => {
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

    const cookieExists = name => readCookie(name) !== null;

    // Their erase is set(name, "", -10), and their own eraseCookie then walks
    // their host scopes - the page's host, their cookieDomain, and the
    // registrable part. All three are written here, because a category cookie
    // set on one of them cannot be removed from another.
    const eraseCookie = name => {
        if ( cookieExists(name) === false ) { return false; }
        const expired = '; expires=Thu, 01 Jan 1970 00:00:01 GMT';
        const scopes = [ '' ];
        try {
            const host = String(w.location.hostname);
            const cut = host.lastIndexOf('.', host.lastIndexOf('.') - 1);
            if ( cut > -1 ) { scopes.push(host.substring(cut)); }
            scopes.push(host);
        } catch ( ex ) {
        }
        const own = String(field('cookieDomain', ''));
        if ( own !== '' ) { scopes.push(own); }
        for ( const scope of scopes ) {
            try {
                doc.cookie = name + '=' + expired + '; path=/' +
                    (scope !== '' ? '; domain=' + scope : '');
            } catch ( ex ) {
            }
        }
        if ( cookieExists(name) === false ) { erased += 1; }
        return true;
    };

    /**************************************************************************/

    // Their category ids. Their own generateConsent takes them off the
    // checkboxes their banner carries - data-id, with the "checkbox-" prefix
    // stripped - and their nn_cookie_ids is the same list as cookie names,
    // for the non-necessary ones only. The checkboxes are read first, because
    // they carry the necessary category too, and the cookie names behind
    // them where their banner is not in the page at all.
    const nonNecessary = ( ) => {
        const given = field('nn_cookie_ids', []);
        const out = [];
        if ( Array.isArray(given) ) {
            for ( const name of given ) { out.push(String(name)); }
        } else if ( given !== null && typeof given === 'object' ) {
            for ( const key of Object.keys(given) ) {
                out.push(String(given[key]));
            }
        }
        return out;
    };

    const categories = ( ) => {
        const out = [];
        const add = (id, necessary) => {
            const slug = String(id).replace('checkbox-', '');
            if ( slug === '' ) { return; }
            if ( out.some(entry => entry.slug === slug) ) { return; }
            out.push({
                slug: slug,
                cookie: 'cookielawinfo-checkbox-' + slug,
                dataId: String(id),
                necessary: necessary,
            });
        };
        let boxes = [];
        try {
            boxes = Array.from(
                doc.querySelectorAll('.cli-user-preference-checkbox')
            );
        } catch ( ex ) {
        }
        // Which of their categories is the necessary one is their
        // Cli_Data.strictlyEnabled, not the checkbox's disabled attribute:
        // their own disableAllCookies unticks every box whose slug is not in
        // that list, and their enableAllCookies leaves checkbox-necessary
        // alone by name. The list is what a translated site uses - the live
        // payload measured for this carries [ 'necessary', 'obligatoire' ] -
        // so a disabled box is only the last resort where the page ships no
        // list at all - and the checkbox's own disabled attribute is not a
        // substitute, because it is only how their CSS stops a click: their
        // reject erases every cookie in nn_cookie_ids whether the box next to
        // it was clickable or not.
        const strict = [];
        const declared = field('strictlyEnabled', []);
        if ( Array.isArray(declared) ) {
            for ( const slug of declared ) { strict.push(String(slug)); }
        }
        const refused = nonNecessary();
        const strictly = slug => {
            if ( refused.indexOf('cookielawinfo-checkbox-' + slug) !== -1 ) {
                return false;
            }
            if ( refused.indexOf(slug) !== -1 ) { return false; }
            if ( strict.indexOf(slug) !== -1 ) { return true; }
            return slug === 'necessary';
        };
        for ( const box of boxes ) {
            const id = box.getAttribute('data-id');
            if ( id === null ) { continue; }
            add(id, strictly(String(id).replace('checkbox-', '')));
        }
        for ( const name of nonNecessary() ) {
            add(String(name).replace('cookielawinfo-checkbox-', ''), false);
        }
        if ( out.length === 0 ) { add('necessary', true); }
        return out;
    };

    const known = categories();

    /**************************************************************************/

    // Their refusal, in their own order.
    for ( const name of nonNecessary() ) { eraseCookie(name); }
    if ( setCookie(ACCEPT_COOKIE, 'no', EXPIRE_DAYS) ) { written += 1; }

    // Their own toggleUserPreferenceCheckBox, which runs on load and writes a
    // per-category cookie for every category that has none yet, from the
    // checkbox's own default state:
    //
    //   var categoryCookie = 'cookielawinfo-'+jQuery(this).attr('data-id');
    //   if( categoryCookieValue == null ) {
    //       if(jQuery(this).is(':checked'))
    //           CLI_Cookie.set(categoryCookie,'yes',CLI_ACCEPT_COOKIE_EXPIRE);
    //       else CLI_Cookie.set(categoryCookie,'no',...);
    //   }
    //
    // so their necessary category ends a refusal as yes rather than absent -
    // measured against their own file, where that cookie is what is left
    // after their reject button erases the others.
    for ( const entry of known ) {
        if ( entry.necessary === false ) { continue; }
        if ( cookieExists(entry.cookie) ) { continue; }
        if ( setCookie(entry.cookie, 'yes', EXPIRE_DAYS) ) { written += 1; }
    }

    // Their generate_user_preference_cookie: the accept cookie's own value
    // first, as cli-<value>, then every checkbox as <data-id>-<yes|no>, all
    // joined with dashes behind their current language.
    const preference = ( ) => {
        const parts = [];
        const accepted = readCookie(ACCEPT_COOKIE);
        if ( accepted !== null ) { parts.push('cli-' + accepted); }
        for ( const entry of known ) {
            parts.push(entry.dataId + '-' + (entry.necessary ? 'yes' : 'no'));
        }
        if ( parts.length === 0 ) { return ''; }
        return String(field('current_lang', 'en')) + '-' + parts.join('-');
    };
    const preferenceValue = preference();
    if ( preferenceValue !== '' ) {
        if ( setCookie('cli_user_preference', preferenceValue, EXPIRE_DAYS) ) {
            written += 1;
        }
    }

    // Their generateConsent: base64 of JSON, carrying their consentVersion
    // and every category as the string true or false. An existing record is
    // read first, exactly as theirs does - base64 or url-encoded - so a
    // field of theirs this does not know about is kept.
    const consentRecord = ( ) => {
        let held = {};
        const raw = readCookie(PREFERENCE_COOKIE);
        if ( raw !== null ) {
            try {
                let text = raw;
                try {
                    const decoded = w.atob(raw);
                    if ( w.btoa(decoded) === raw ) { text = decoded; }
                } catch ( ex ) {
                    text = decodeURIComponent(raw);
                }
                const parsed = JSON.parse(text);
                if ( parsed !== null && typeof parsed === 'object' ) {
                    held = parsed;
                }
            } catch ( ex ) {
                held = {};
            }
        }
        held.ver = field('consentVersion', 1);
        for ( const entry of known ) {
            held[entry.slug] = entry.necessary ? 'true' : 'false';
        }
        return held;
    };
    const record = consentRecord();
    try {
        if ( setCookie(
            PREFERENCE_COOKIE,
            w.btoa(JSON.stringify(record)),
            EXPIRE_DAYS
        ) ) {
            written += 1;
        }
    } catch ( ex ) {
    }

    /**************************************************************************/

    // Their AfterConsent, which is the only thing of theirs a page can
    // listen for:
    //
    //   const consentUpdate = new CustomEvent('cli_consent_update', {
    //       detail: { status: status, categories: consentCategories } });
    //   document.dispatchEvent(consentUpdate);
    //
    // at the document rather than the window, and carrying the categories
    // split into accepted and rejected.
    let told = 0;
    const afterConsent = status => {
        const accepted = [];
        const rejected = [];
        for ( const entry of known ) {
            if ( entry.necessary || unblockAll ) {
                accepted.push(entry.slug);
            } else {
                rejected.push(entry.slug);
            }
        }
        try {
            doc.dispatchEvent(new w.CustomEvent('cli_consent_update', {
                detail: {
                    status: status,
                    categories: { accepted: accepted, rejected: rejected },
                },
            }));
            told += 1;
        } catch ( ex ) {
        }
    };

    /**************************************************************************/

    // Their banner is printed into the page, so it is taken out rather than
    // left for a script that is no longer there to hide.
    const sweep = ( ) => {
        for ( const selector of UI ) {
            let nodes = [];
            try {
                nodes = Array.from(doc.querySelectorAll(selector));
            } catch ( ex ) {
                continue;
            }
            for ( const node of nodes ) {
                if ( node.parentNode === null ) { continue; }
                node.parentNode.removeChild(node);
                removed += 1;
            }
        }
        // Their own class for a page pushed down by the bar.
        try {
            doc.documentElement.classList.remove('wt-cli-hide-bar');
            if ( doc.body !== null ) {
                doc.body.classList.remove('cli-barmodal-open');
                doc.body.style.removeProperty('overflow');
            }
        } catch ( ex ) {
        }
        return 0;
    };

    /**************************************************************************/

    // Their blocker, released the way their own insertScript does it: a fresh
    // script carrying only the attributes they allow through, the real type
    // from data-cli-script-type, the real src from data-cli-src, and the next
    // one started on load so their order holds.
    const ALLOWED = [
        'data-cli-class', 'data-cli-label', 'data-cli-placeholder',
        'data-cli-script-type', 'data-cli-src',
    ];
    const seen = new WeakSet();
    const counted = new WeakSet();

    // What they parked, counted in both modes: the refusing mode leaves them
    // where they are, and the line should say how many that was.
    const countParked = ( ) => {
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(
                '[data-cli-class="cli-blocker-script"]'
            ));
        } catch ( ex ) {
            return;
        }
        for ( const node of nodes ) {
            if ( counted.has(node) ) { continue; }
            counted.add(node);
            parked += 1;
        }
    };

    const release = ( ) => {
        if ( unblockAll === false ) { return 0; }
        let nodes = [];
        try {
            nodes = Array.from(doc.querySelectorAll(
                '[data-cli-class="cli-blocker-script"]'
            ));
        } catch ( ex ) {
            return 0;
        }
        let freedHere = 0;
        const run = index => {
            if ( index >= nodes.length ) { return; }
            const node = nodes[index];
            if ( seen.has(node) ) { run(index + 1); return; }
            seen.add(node);
            let chained = false;
            try {
                const tag = String(node.tagName || '').toUpperCase();
                const src = node.getAttribute('data-cli-src');
                if ( tag !== 'SCRIPT' ) {
                    // Their renderSrcElement: an iframe or an image goes back
                    // to its own src in place.
                    if ( src !== null ) { node.setAttribute('src', src); }
                    for ( const name of ALLOWED ) {
                        node.removeAttribute(name);
                    }
                    freed += 1;
                    freedHere += 1;
                    run(index + 1);
                    return;
                }
                const type = node.getAttribute('data-cli-script-type');
                const copy = doc.createElement('script');
                for ( const attribute of Array.from(node.attributes) ) {
                    const name = attribute.name;
                    if ( name === 'type' || name === 'src' ) { continue; }
                    if ( ALLOWED.indexOf(name) !== -1 ) { continue; }
                    if ( name.startsWith('data-cli-') ) { continue; }
                    copy.setAttribute(name, attribute.value);
                }
                if ( type !== null && type !== '' ) { copy.type = type; }
                if ( node.async ) { copy.async = node.async; }
                if ( node.defer ) { copy.defer = node.defer; }
                if ( src !== null && src !== '' ) {
                    copy.src = src;
                    chained = true;
                } else {
                    copy.textContent = node.textContent;
                }
                if ( chained ) {
                    copy.onload = copy.onerror = ( ) => { run(index + 1); };
                }
                const parent = node.parentNode;
                if ( parent === null ) { chained = false; } else {
                    parent.insertBefore(copy, node);
                    parent.removeChild(node);
                    freed += 1;
                    freedHere += 1;
                }
            } catch ( ex ) {
                chained = false;
            }
            if ( chained === false ) { run(index + 1); }
        };
        run(0);
        return freedHere;
    };

    const pass = ( ) => {
        sweep();
        countParked();
        return release();
    };

    // Their markup and their parked tags are below this script, so the pass
    // runs again as the document arrives - and the later passes are the ones
    // that free anything at all on a real page, so they say so.
    consentRRDeferred(w, doc, pass, unblockAll ? NAME + ' ' + VERSION : '');

    // Their own ConsentAction fires this after the record is written and the
    // bar is closed, which is where this is.
    afterConsent('reject');

    /**************************************************************************/

    // Their api, by their own method names. The reads answer the refusal; the
    // writes are their banner's own buttons, and there is no banner.
    const allowed = ( ) => known
        .filter(entry => entry.necessary || unblockAll)
        .map(entry => entry.slug);

    const cookieApi = {
        set: setCookie,
        read: readCookie,
        erase: eraseCookie,
        eraseCookie: name => eraseCookie(name),
        exists: cookieExists,
        cookieExist: cookieExists,
        getallcookies: ( ) => {
            const out = {};
            try {
                for ( const item of String(doc.cookie || '').split(';') ) {
                    const pos = item.indexOf('=');
                    if ( pos === -1 ) { continue; }
                    out[item.slice(0, pos).trim()] = item.slice(pos + 1);
                }
            } catch ( ex ) {
            }
            return out;
        },
    };

    const api = {
        // Their own settings object, which a page reads off CLI.
        settings: {},
        allowedCategories: allowed(),
        consent: ( ) => Object.assign({}, record),
        // Their buttons. Nothing moves: there is no banner to answer, and a
        // page cannot argue a refusal up.
        accept_close: ( ) => false,
        reject_close: ( ) => false,
        enableAllCookies: ( ) => {},
        disableAllCookies: ( ) => {},
        toggleUserPreferenceCheckBox: ( ) => {},
        generateConsent: ( ) => Object.assign({}, record),
        generate_user_preference_cookie: ( ) => preferenceValue,
        // Their logging posts the whole cookie jar to their ajax_url.
        saveLog: ( ) => false,
        // Their UI, which does not exist here.
        displayHeader: ( ) => {},
        hideHeader: ( ) => {},
        toggleBar: ( ) => {},
        close_header: ( ) => false,
        showPopupOverlay: ( ) => {},
        hidePopupOverlay: ( ) => {},
        settingsPopUp: ( ) => {},
        settingsPopUpClose: ( ) => {},
        settingsTabbedAccordion: ( ) => {},
        configBar: ( ) => {},
        configButtons: ( ) => {},
        configShowAgain: ( ) => {},
        attachEvents: ( ) => {},
        attachDelete: ( ) => {},
        hideBarInReadMoreLink: ( ) => {},
        reviewConsent: ( ) => {},
        cliRenewConsent: ( ) => {},
        removeAllPreferenceCookies: ( ) => {
            for ( const entry of known ) { eraseCookie(entry.cookie); }
        },
        removeCookieByCategory: ( ) => {},
        checkCategories: ( ) => allowed(),
        success: ( ) => {},
        AfterConsent: status => { afterConsent(status); },
        ConsentAction: ( ) => {},
        set: given => {
            if ( given !== null && typeof given === 'object' ) {
                Object.assign(api.settings, given);
            }
        },
        // Their own hash helper, verbatim, as in the legacy file.
        l1hs: function l1hs(str) {
            const text = String(str);
            if ( text.charAt(0) === '#' ) { return l1hs(text.slice(1)); }
            return '#' + text;
        },
    };

    try {
        w.CLI = api;
        w.CLI_Cookie = cookieApi;
        w.cli_show_cookiebar = ( ) => {};
    } catch ( ex ) {
    }

    /**************************************************************************/

    try {
        Object.defineProperty(w, 'webToffeeRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: mode,
                state: function() {
                    return {
                        accept: ACCEPT_COOKIE,
                        preference: PREFERENCE_COOKIE,
                        categories: known.map(entry => entry.slug),
                        allowed: allowed(),
                        written: written,
                        erased: erased,
                        removed: removed,
                        parked: parked,
                        freed: freed,
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

    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' cookie=' + ACCEPT_COOKIE + '=no' +
            ' written=' + written +
            ' erased=' + erased +
            ' categories=' + (known.length !== 0
                ? known.map(entry => entry.slug).join(',')
                : 'none') +
            ' surface=' + (unblockAll ? 'all' : 'necessary') +
            ' removed=' + removed +
            ' parked=' + parked +
            ' freed=' + freed +
            ' told=' + told +
            ' banner=none logged=none'
        );
    }
}

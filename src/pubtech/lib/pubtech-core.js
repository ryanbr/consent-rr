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

    Stands in for PubTech's pubtech-cmp-v2-esm.js, which is the whole CMP: the
    TCF API, the banner, the vendor lists it fetches and the tenant's own
    configuration, inlined at the top of the file itself.

    Read off the bundles for tenants 312 and 466 rather than from docs:

      pubtech-cmp-pcstring    their publisher-cookie string, a cookie for 365
                              days, encoded by their own codec as
                              the version, the separator, then one
                              character each for feature, user-experience
                              and measurement cookies -
                              with separator "-", ENABLED "1", DISABLED "0".
                              So a full refusal is <version>-000, and the
                              version is the tenant's publisherCookieVersion -
                              3 on one tenant and 22 on the other. Their own
                              getEncoded falls back to 0 where none is set,
                              which is what a first visit writes here.
      euconsent-v2            the TC string, theirs or config.cookieName
      ac_euconsent-v2         the additional-consent string, cookie and
                              localStorage
      the consent queues      __pub_tech_cmp_on_consent_queue__pre and
                              __pub_tech_cmp_on_consent_queue: arrays a page
                              pushes callbacks onto. Their own drainer calls
                              each one, records the arguments as latestArgs,
                              then replaces push so a callback registered
                              later fires at once with those arguments. Page
                              code gated on consent is waiting on exactly that,
                              so it is reproduced rather than left hanging.
      the GTM events          dataLayer.push({ event: ... }) for both
                              __pub_tech_cmp_on_consent_queue and
                              __pubtech_queue_on_consent

    What a replaced file takes with it is the tenant's configuration, so two
    things are read back from the visitor instead of guessed: the publisher
    country out of an existing TC string, and the publisher-cookie version out
    of an existing pcstring. Where there is neither, the fallbacks are theirs.

*/

function consentRRPubTech() {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = 'pubtech-reject';

    // Does nothing the second time it is injected.
    if ( w.__pub_tech_cmp_consent_rr !== undefined ) { return; }

    const PC_COOKIE = 'pubtech-cmp-pcstring';
    const TC_COOKIE = 'euconsent-v2';
    const AC_KEY = 'ac_euconsent-v2';
    const PRE_QUEUE = '__pub_tech_cmp_on_consent_queue__pre';
    const QUEUE = '__pub_tech_cmp_on_consent_queue';

    const readCookie = name => {
        const pairs = String(doc.cookie).split(';');
        for ( const pair of pairs ) {
            const pos = pair.indexOf('=');
            if ( pos === -1 ) { continue; }
            if ( pair.slice(0, pos).trim() !== name ) { continue; }
            return pair.slice(pos + 1).trim();
        }
        return undefined;
    };

    // Their cookie service writes on the registered domain, so the record is
    // read on every subdomain the publisher serves.
    let cookieDomain;
    const findCookieDomain = ( ) => {
        const host = w.location.hostname;
        if ( /^[0-9.]+$/.test(host) || host.indexOf('.') === -1 ) { return ''; }
        const parts = host.split('.');
        const probe = 'consentrr' + Math.floor(Math.random() * 1e6);
        for ( let i = parts.length - 2; i >= 0; i-- ) {
            const candidate = parts.slice(i).join('.');
            try {
                doc.cookie = probe + '=1; path=/; domain=' + candidate;
                if ( readCookie(probe) === undefined ) { continue; }
                doc.cookie = probe + '=; path=/; max-age=0; domain=' + candidate;
                return candidate;
            } catch(ex) {
            }
        }
        return '';
    };

    const writeCookie = (name, value, days) => {
        if ( cookieDomain === undefined ) {
            try {
                cookieDomain = findCookieDomain();
            } catch(ex) {
                cookieDomain = '';
            }
        }
        const secure = w.location.protocol === 'https:' ? '; secure' : '';
        const attributes = '; path=/; max-age=' + (days * 86400) +
            '; samesite=lax' + secure;
        try {
            if ( cookieDomain !== '' ) {
                doc.cookie = name + '=' + value + attributes +
                    '; domain=' + cookieDomain;
                if ( readCookie(name) === value ) { return true; }
            }
            doc.cookie = name + '=' + value + attributes;
            return readCookie(name) === value;
        } catch(ex) {
        }
        return false;
    };

    // Their codec, with every choice disabled. The version is the tenant's
    // publisherCookieVersion, which went away with the file this replaces - so
    // a version already on the visitor is kept, and 0 is their own fallback.
    const pcVersion = ( ) => {
        const existing = readCookie(PC_COOKIE);
        if ( typeof existing !== 'string' ) { return '0'; }
        const parts = decodeURIComponent(existing).split('-');
        if ( parts.length < 2 ) { return '0'; }
        return /^[0-9]{1,6}$/.test(parts[0]) ? parts[0] : '0';
    };

    const pcString = pcVersion() + '-000';

    const language = ( ) => {
        try {
            const lang = doc.documentElement.lang;
            if ( typeof lang === 'string' && lang !== '' ) { return lang; }
        } catch(ex) {
        }
        try {
            return w.navigator.language || 'en';
        } catch(ex) {
        }
        return 'en';
    };

    const tcf = consentRRPubTechTcf(language(), readCookie(TC_COOKIE));

    const wrotePc = writeCookie(PC_COOKIE, pcString, 365);
    const wroteTc = writeCookie(TC_COOKIE, tcf.tcString, 365);
    // The additional-consent string, empty: it lists the Google vendors a
    // visitor consented to, and this one consented to none. Their own writer
    // puts it in both places when the compact cookie is on, and nothing here
    // knows whether it is, so both get the same empty answer.
    let wroteAc = writeCookie(AC_KEY, '', 365);
    try {
        w.localStorage.setItem(AC_KEY, '');
    } catch(ex) {
        wroteAc = wroteAc;
    }

    const installed = tcf.install();

    // Their GTM events, in their order.
    const pushEvents = ( ) => {
        try {
            if ( Array.isArray(w.dataLayer) === false ) { w.dataLayer = []; }
            if ( typeof w.dataLayer.push !== 'function' ) { return false; }
            w.dataLayer.push({ event: QUEUE });
            w.dataLayer.push({ event: '__pubtech_queue_on_consent' });
            return true;
        } catch(ex) {
        }
        return false;
    };
    const pushed = pushEvents();

    // What their drainer hands a callback: the consent event merged with its
    // data, then the TC model, then the publisher-cookie map, then the Google
    // consents. Only the parts a refusal can state are filled in.
    const pcModelMap = {
        featureCookiesChoice: false,
        userExperienceCookiesChoice: false,
        measurementCookiesChoice: false,
    };
    const payload = ( ) => [
        {
            tcString: tcf.tcString,
            acString: '',
            pcString,
            consentUpdate: false,
            cmpType: 'tcf',
        },
        { tcString: tcf.tcString, purposeConsents: {}, vendorConsents: {} },
        pcModelMap,
        { googleConsents: [ 1 ] },
    ];

    // Their lt(): call what is already queued, remember the arguments, then
    // replace push so anything registered afterwards fires at once with them.
    const drain = name => {
        const args = payload();
        let queue;
        try {
            queue = w[name];
            if ( Array.isArray(queue) === false ) {
                w[name] = [];
                queue = w[name];
            } else {
                for ( const callback of queue.slice() ) {
                    if ( typeof callback !== 'function' ) { continue; }
                    try {
                        callback.apply(null, args);
                    } catch(ex) {
                    }
                }
            }
        } catch(ex) {
            return false;
        }
        try {
            queue.latestArgs = args;
            if ( queue.proxyEnabled !== true ) {
                queue.push = function(callback) {
                    if ( typeof callback === 'function' ) {
                        try {
                            callback.apply(null, queue.latestArgs);
                        } catch(ex) {
                        }
                    }
                    return Array.prototype.push.call(queue, callback);
                };
                queue.proxyEnabled = true;
            }
            return true;
        } catch(ex) {
        }
        return false;
    };

    const drainedPre = drain(PRE_QUEUE);
    const drained = drain(QUEUE);

    try {
        w.__pub_tech_cmp_consent_rr = VERSION;
    } catch(ex) {
    }

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' pc=' + pcString + (wrotePc ? '' : ' pccookie=refused') +
            ' tcf=refused' + (installed ? '' : '/noapi') +
            (wroteTc ? '' : ' tccookie=refused') +
            ' cc=' + tcf.publisherCC + (tcf.reusedCountry ? '' : '/default') +
            ' ac=' + (wroteAc ? 'empty' : 'refused') +
            ' queues=' + ((drainedPre && drained) ? 'drained' : 'refused') +
            ' gtm=' + (pushed ? 'sent' : 'refused')
        );
    } catch(ex) {
    }
}

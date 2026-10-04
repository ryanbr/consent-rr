/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    consentmanager.net. Measured across all four files they serve, on two
    tenants' delivery - fasthosts.co.uk and dastelefonbuch.de.

    Their events go to two different targets, so the fixture listens on both:
    cmpEvent at the window, their WordPress bridge at the document. The
    parked nodes are written the way their own blocker writes them, and two
    nodes are NOT theirs, because the unblock variant has to tell them apart.

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.fasthosts.co.uk/article';
const BOOT = 'https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="' + BOOT + '" data-cmp-cdid="eeb0f89b5264c"></script>' +
    '</head><body>' +
    // Theirs, by their own contract.
    '<script id="parked" class="cmplazyload" type="text/plain"' +
    ' data-cmp-src="https://a.example/a.js" data-cmp-vendor="s1"' +
    ' data-cmp-purpose="1"></script>' +
    '<script id="typed" class="cmplazyload" type="text/plain"' +
    ' data-cmp-src="https://b.example/b.js"' +
    ' data-cmp-type="module"></script>' +
    '<iframe id="embed" class="cmplazyload"' +
    ' data-cmp-src="https://www.youtube.com/embed/x" data-cmp-hide="1"' +
    ' data-cmp-hide-display="block" style="display:none"></iframe>' +
    // Not theirs.
    '<script id="notheirs" type="text/plain" src="https://c.example/c.js"></script>' +
    '<div id="plain" class="other">x</div>' +
    '<p id="content">x</p></body></html>';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('consentmanager-reject.js');
    unblock = resources.get('consentmanager-reject-unblock.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        w.__win = [];
        w.__doc = [];
        for ( const name of [
            'cmpEvent', 'cmpEvent_cmpready', 'cmpEvent_consent',
        ] ) {
            w.addEventListener(name, event => {
                w.__win.push({ name, detail: event.detail });
            });
            // Listening on the document too, so a dispatch at the wrong
            // target cannot pass unnoticed.
            w.document.addEventListener(name, ( ) => {
                w.__doc.push('document:' + name);
            });
        }
        w.document.addEventListener('wp_consent_type_defined', ( ) => {
            w.__doc.push('wp_consent_type_defined');
        });
        w.addEventListener('wp_consent_type_defined', ( ) => {
            w.__win.push({ name: 'window:wp_consent_type_defined' });
        });
        w.__told = [];
        w.wp_set_consent = (category, value) => {
            w.__told.push(category + '=' + value);
        };
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const ask = (w, command, parameter) => {
    let answer = [ 'NOT CALLED', 'NOT CALLED' ];
    w.__cmp(command, parameter, (value, success) => {
        answer = [ value, success ];
    });
    return answer;
};
const tcData = w => {
    let data = null;
    w.__tcfapi('getTCData', 2, value => { data = value; });
    return data;
};
const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('consentmanager-reject', ( ) => {
    it('puts up the apis theirs puts up', ( ) => {
        const w = boot(reject);
        assert.equal(typeof w.__cmp, 'function');
        assert.equal(typeof w.__tcfapi, 'function');
        assert.equal(typeof w.__uspapi, 'function');
        assert.equal(typeof w.cmpmngr, 'object');
    });

    it('answers their own getCMPData with nothing consented', ( ) => {
        const [ data, ok ] = ask(boot(reject), 'getCMPData');
        assert.equal(ok, true);
        assert.equal(data.cmpId, 31);
        assert.equal(data.gdprApplies, true);
        // The visitor has answered, so nothing re-prompts.
        assert.equal(data.userChoiceExists, true);
        assert.equal(data.hasConsent, false);
        assert.equal(data.hasNoConsent, true);
        assert.equal(Object.values(data.purposeConsents).includes(true), false);
        assert.equal(Object.keys(data.purposeConsents).length, 11);
        assert.equal(Object.values(data.specialFeatures).includes(true), false);
        assert.deepEqual(Object.keys(data.vendorConsents), []);
        assert.equal(data.consentstring, '');
    });

    it('answers a ping with a loaded cmp', ( ) => {
        const [ data ] = ask(boot(reject), 'ping');
        assert.equal(data.cmpLoaded, true);
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.displayStatus, 'hidden');
        assert.equal(data.cmpId, 31);
        assert.equal(data.gdprAppliesGlobally, true);
    });

    it('answers every command their bundle answers', ( ) => {
        const w = boot(reject);
        for ( const command of [
            'getConsentData', 'getVendorConsents', 'getPublisherConsents',
            'consentStatus', 'getTCData', 'getUSPData', 'exportData',
            'displayConsentUi',
        ] ) {
            const [ , ok ] = ask(w, command);
            assert.equal(ok, true, command);
        }
    });

    it('refuses a command it does not implement', ( ) => {
        assert.deepEqual(ask(boot(reject), 'nonsense'), [ null, false ]);
    });

    it('hands back a listener id and takes it off again', ( ) => {
        const w = boot(reject);
        const [ data ] = ask(w, 'addEventListener');
        assert.equal(data.listenerId, 1);
        assert.deepEqual(ask(w, 'removeEventListener', data.listenerId),
            [ true, true ]);
        assert.deepEqual(ask(w, 'removeEventListener', data.listenerId),
            [ false, false ]);
    });

    it('will not let a page set a consent through their own setters', ( ) => {
        const w = boot(reject);
        for ( const command of [
            'setConsent', 'setVendorConsent', 'setPurposeConsent', 'acceptAll',
        ] ) {
            // What the SETTER's own callback is handed matters as much as the
            // state after it: a page that reads a yes there believes consent
            // was granted and loads on it, whatever a later read says.
            const [ data, ok ] = ask(w, command, { purposes: [ 1, 2, 3 ] });
            assert.equal(ok, true, command);
            assert.equal(data.hasConsent, false, command);
            assert.equal(data.hasNoConsent, true, command);
            assert.equal(
                Object.values(data.purposeConsents).includes(true), false,
                command);
            assert.equal(
                Object.values(data.vendorConsents).includes(true), false,
                command);
        }
        const [ after ] = ask(w, 'getCMPData');
        assert.equal(after.hasConsent, false);
        assert.equal(Object.values(after.purposeConsents).includes(true),
            false);
        assert.equal(w.cmpmngr.getPurposeConsent(1), false);
        assert.equal(w.cmpmngr.getVendorConsent(755), false);
    });

    it('fires their events at the window, not the document', ( ) => {
        // Theirs dispatches cmpEvent and cmpEvent_<type> at the window. A
        // document dispatch would reach no page listener at all.
        const w = boot(reject);
        const names = w.__win.map(entry => entry.name);
        assert.ok(names.includes('cmpEvent'), names.join(','));
        assert.ok(names.includes('cmpEvent_cmpready'), names.join(','));
        assert.ok(names.includes('cmpEvent_consent'), names.join(','));
        assert.deepEqual(
            w.__doc.filter(name => name.startsWith('document:')), []);
    });

    it('carries their detail shape on the event', ( ) => {
        const w = boot(reject);
        const entry = w.__win.find(item => item.name === 'cmpEvent');
        assert.equal(typeof entry.detail, 'object');
        assert.equal(entry.detail.type, 'cmpready');
        assert.equal(entry.detail.data.cmpId, 31);
        assert.equal(entry.detail.data.hasConsent, false);
    });

    it('bridges the WordPress consent api at the document', ( ) => {
        // Theirs dispatches wp_consent_type_defined at the DOCUMENT, next to
        // window.wp_consent_type and a wp_set_consent per category.
        const w = boot(reject);
        assert.equal(w.wp_consent_type, 'optout');
        assert.ok(w.__doc.includes('wp_consent_type_defined'));
        assert.deepEqual(
            w.__win.filter(e => e.name === 'window:wp_consent_type_defined'),
            []);
        assert.deepEqual([ ...w.__told ], [
            'functional=deny', 'preferences=deny', 'statistics=deny',
            'statistics-anonymous=deny', 'marketing=deny',
        ]);
    });

    it('answers US privacy with the sale opted out', ( ) => {
        const w = boot(reject);
        let answer = null;
        w.__uspapi('getUSPData', 1, (data, ok) => {
            answer = [ data.uspString, ok ];
        });
        assert.deepEqual(answer, [ '1YYN', true ]);
        assert.equal(w.cmpmngr.getUSPrivacyString(), '1YYN');
    });

    it('leaves their parked tags parked', ( ) => {
        const w = boot(reject);
        assert.equal(w.document.getElementById('parked').getAttribute('type'),
            'text/plain');
        assert.equal(w.document.getElementById('embed').getAttribute('src'),
            null);
        assert.equal(
            w.document.querySelectorAll('[src="https://a.example/a.js"]').length,
            0);
    });

    it('builds no banner', ( ) => {
        const w = boot(reject);
        assert.equal(w.document.querySelector('[id^="cmpbox"]'), null);
        assert.equal(w.document.querySelector('#cmpwrapper'), null);
    });

    it('shares nothing across domains and sends no tracking', ( ) => {
        const sent = [];
        const w = boot(reject, {
            before: ww => {
                ww.navigator.sendBeacon = url => {
                    sent.push(String(url));
                    return true;
                };
            },
        });
        // Their cross-domain frame and their tracking calls keep their shape
        // and do nothing.
        w.cmpmngr.writeStore('x', 'y');
        w.cmpmngr.sendMicrosoftClarityTracking();
        w.cmpmngr.sendMicrosoftUETTracking();
        w.cmpmngr.sendXandrTracking();
        w.cmpmngr.sendDataLayerEvent('consent');
        assert.deepEqual(sent, []);
        assert.equal(w.document.querySelector('iframe[name="__cmpcdframe"]'),
            null);
    });

    it('does not write their own record, which nothing else reads', ( ) => {
        // __cmpconsent<id> is named from a consentscope and a tenant id that
        // live only in the file being replaced.
        const w = boot(reject);
        for ( const [ name ] of cookies(w) ) {
            assert.equal(name.startsWith('__cmpconsent'), false, name);
        }
    });

    it('stands down on a second evaluation', ( ) => {
        const w = boot(reject);
        const events = w.__win.length;
        w.eval(reject);
        assert.equal(w.__win.length, events);
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const w = boot(reject, { before: ww => { ww.console = undefined; } });
        assert.equal(ask(w, 'getCMPData')[0].cmpId, 31);
    });

    it('announces what went in', ( ) => {
        let out;
        runDom(reject, URL, PAGE, w => { out = lines(w); });
        assert.equal(out.length, 1);
        assert.ok(out[0].startsWith(
            '[consent-rr] consentmanager-reject ' + versions.consentmanager));
        assert.ok(out[0].includes(' purposes=none vendors=none'), out[0]);
        assert.ok(out[0].includes(' tcf=refused freed=0'), out[0]);
        assert.ok(out[0].endsWith(
            ' banner=none crossdomain=none tracking=none'));
    });
});

/******************************************************************************/

describe('consentmanager, the IAB layer', ( ) => {
    it('is cmpId 31, which their own config states', ( ) => {
        // Their cmp.php carries "iabid":31 in window.cmp_config_data, and the
        // IAB's published list agrees.
        const data = tcData(boot(reject));
        assert.equal(data.cmpId, 31);
        assert.equal(TCString.decode(data.tcString).cmpId, 31);
    });

    it('grants nothing, in every set a string carries', ( ) => {
        const decoded = TCString.decode(tcData(boot(reject)).tcString);
        assert.equal(decoded.purposeConsents.size, 0);
        assert.equal(decoded.purposeLegitimateInterests.size, 0);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
        assert.equal(decoded.specialFeatureOptins.size, 0);
        assert.equal(decoded.publisherConsents.size, 0);
        assert.equal(decoded.vendorListVersion, 179);
        assert.equal(decoded.policyVersion, 5);
    });

    it('writes euconsent-v2, because theirs does', ( ) => {
        // A third party reads that cookie without asking any API, so an
        // absent one would leave an earlier acceptance standing.
        const w = boot(reject);
        const stored = cookies(w).get('euconsent-v2');
        assert.notEqual(stored, undefined);
        assert.equal(stored, tcData(w).tcString);
        assert.equal(TCString.decode(stored).purposeConsents.size, 0);
    });

    it('writes it in every scope a stored one could be in', ( ) => {
        const w = boot(reject);
        const all = String(w.document.cookie).split(';')
            .map(pair => pair.trim())
            .filter(pair => pair.startsWith('euconsent-v2='));
        assert.ok(all.length > 1, String(all.length));
    });

    it('overwrites an acceptance from before it was installed', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.document.cookie = 'euconsent-v2=CONSENTED; path=/';
            },
        });
        for ( const pair of String(w.document.cookie).split(';') ) {
            if ( pair.includes('euconsent-v2=') === false ) { continue; }
            assert.equal(pair.includes('CONSENTED'), false, pair);
        }
    });

    it('adds the locator frame a cross-frame caller looks for', ( ) => {
        assert.notEqual(boot(reject).frames.__tcfapiLocator, undefined);
    });

    it('says the regime applies', ( ) => {
        const w = boot(reject);
        assert.equal(tcData(w).gdprApplies, true);
        let ping = null;
        w.__tcfapi('ping', 2, value => { ping = value; });
        assert.equal(ping.gdprApplies, true);
        assert.equal(ping.cmpId, 31);
    });
});

/******************************************************************************/

describe('consentmanager-reject-unblock', ( ) => {
    it('stores and sends the same refusal', ( ) => {
        const w = boot(unblock);
        assert.equal(ask(w, 'getCMPData')[0].hasConsent, false);
        assert.equal(TCString.decode(tcData(w).tcString).purposeConsents.size,
            0);
        assert.notEqual(cookies(w).get('euconsent-v2'), undefined);
    });

    it('frees a parked script as a copy, as theirs does', async ( ) => {
        const w = boot(unblock);
        await settle(40);
        const freed = [ ...w.document.querySelectorAll(
            '[src="https://a.example/a.js"]') ];
        assert.equal(freed.length, 1);
        assert.equal(freed[0].type, 'text/javascript');
        // Their own marker for a node they freed.
        assert.equal(freed[0].getAttribute('data-cmp-ab'), '1');
        // And their attributes came along.
        assert.equal(freed[0].getAttribute('data-cmp-vendor'), 's1');
    });

    it('honours their data-cmp-type', ( ) => {
        const w = boot(unblock);
        const freed = [ ...w.document.querySelectorAll(
            '[src="https://b.example/b.js"]') ];
        assert.equal(freed.length, 1);
        assert.equal(freed[0].type, 'module');
    });

    it('puts a parked iframe back from their own attribute', ( ) => {
        const w = boot(unblock);
        const embed = w.document.getElementById('embed');
        assert.equal(embed.getAttribute('src'),
            'https://www.youtube.com/embed/x');
        // And the display their data-cmp-hide-display names.
        assert.equal(embed.style.display, 'block');
        assert.equal(embed.getAttribute('data-cmp-ab'), '1');
    });

    it('frees nothing that is not theirs', ( ) => {
        const w = boot(unblock);
        assert.equal(w.document.getElementById('notheirs').getAttribute('type'),
            'text/plain');
        assert.equal(
            w.document.querySelectorAll('[src="https://c.example/c.js"]').length,
            1);
        assert.equal(w.document.getElementById('plain').className, 'other');
    });

    it('counts what it freed, and says so', ( ) => {
        let out;
        runDom(unblock, URL, PAGE, w => { out = lines(w); });
        assert.ok(out[0].includes(' freed=3 '), out[0]);
    });
});

/******************************************************************************/

describe('filters, consentmanager', ( ) => {
    it('matches every delivery host they use', ( ) => {
        for ( const path of [
            'js\\/semiautomatic\\.min\\.js', 'cmp\\.php', 'js\\/cmp_final\\.min\\.js',
        ] ) {
            assert.match(filtersText, new RegExp(
                '\\|\\|consentmanager\\.net\\/delivery\\/' + path +
                '\\$script,redirect=consentmanager-reject\\.js'));
        }
    });

    it('never matches their custom data, which is never asked for', ( ) => {
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('!') === false && line !== '')
            .filter(line => line.includes('consentmanager.net'));
        for ( const rule of rules ) {
            assert.equal(rule.includes('customdata'), false, rule);
        }
    });

    it('says in the list what is not written and why', ( ) => {
        assert.match(filtersText, /THE RECORD THAT MATTERS IS NOT THEIRS/);
        assert.match(filtersText, /THEIR EVENTS GO TO TWO DIFFERENT TARGETS/);
    });
});

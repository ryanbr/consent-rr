/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import { filtersText, loadResources, runDom, versions } from './helpers.mjs';

const URL = 'https://www.example.fr/';

const PAGE = '<!doctype html><html lang="fr"><head>' +
    '<script src="https://cdn.appconsent.io/tcf2-clear/current/' +
    'core.bundle.js"></script>' +
    '</head><body><p id="content">x</p></body></html>';

// The stub a TCF publisher leaves on the page, queue and all.
const STUB = '(function() {' +
    ' var queue = [];' +
    ' window.__tcfapi = function() {' +
    '  var args = [].slice.call(arguments);' +
    '  if ( args.length === 0 ) { return queue; }' +
    '  queue.push(args);' +
    ' };' +
    '})();';

let reject;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('appconsent-reject.js');
    accept = resources.get('appconsent-accept.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const boot = (code, options = {}) => runDom(
    code, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const tcData = w => {
    let data;
    w.__tcfapi('getTCData', 2, d => { data = d; });
    return data;
};

const decode = w => TCString.decode(tcData(w).tcString);

// Rewriting the cmp version of a string, to stand in for one their own bundle
// wrote with a version this cannot know: the core segment's fields are fixed
// width, cmpVersion at bit 90.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const withCmpVersion = (tcString, version) => {
    const parts = tcString.split('.');
    let bits = '';
    for ( const character of parts[0] ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    bits = bits.slice(0, 90) + version.toString(2).padStart(12, '0') +
        bits.slice(102);
    while ( bits.length % 6 !== 0 ) { bits += '0'; }
    let out = '';
    for ( let i = 0; i < bits.length; i += 6 ) {
        out += B64.charAt(parseInt(bits.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

/******************************************************************************/

describe('appconsent', ( ) => {
    it('ships as two resources, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('appconsent-'));
        assert.deepEqual(names,
            [ 'appconsent-accept.js', 'appconsent-reject.js' ]);
        for ( const code of [ reject, accept ] ) {
            assert.equal(/^[ \t]*$/m.test(code), false);
            assert.equal(/[^\x20-\x7e\t\n]/.test(code), false);
            assert.ok(code.includes("const VERSION = '" + versions.appconsent + "'"));
        }
        // One line apart: the mode, and nothing else.
        assert.ok(reject.includes('consentRRAppConsent(false)'));
        assert.ok(accept.includes('consentRRAppConsent(true)'));
    });

    it('carries their own identity, read off their builder', ( ) => {
        const d = decode(boot(reject).window);
        // cmpId 2 is hard-coded in their TC model builder, twice, and their
        // publisher country defaults to FR as their language does.
        assert.equal(d.cmpId, 2);
        assert.equal(d.policyVersion, 5);
        assert.equal(d.publisherCountryCode, 'FR');
        assert.equal(d.consentLanguage, 'FR');
        assert.equal(d.isServiceSpecific, true);
    });

    it('refuses everything in reject mode', ( ) => {
        const w = boot(reject).window;
        const d = decode(w);
        assert.equal(d.purposeConsents.size, 0);
        assert.equal(d.purposeLegitimateInterests.size, 0);
        assert.equal(d.specialFeatureOptins.size, 0);
        assert.equal(d.vendorConsents.size, 0);
        assert.equal(d.vendorLegitimateInterests.size, 0);
        assert.equal(d.publisherConsents.size, 0);
        assert.equal(tcData(w).purpose.consents[1], false);
    });

    it('grants everything in accept mode', ( ) => {
        const w = boot(accept).window;
        const d = decode(w);
        // Every purpose and legitimate interest, both special features, and
        // every vendor up to the 4000 their own cap falls back to.
        assert.equal(d.purposeConsents.size, 11);
        assert.equal(d.purposeLegitimateInterests.size, 11);
        assert.equal(d.specialFeatureOptins.size, 2);
        assert.equal(d.vendorConsents.size, 4000);
        assert.equal(d.vendorLegitimateInterests.size, 4000);
        assert.equal(d.publisherConsents.size, 24);
        assert.equal(tcData(w).purpose.consents[1], true);
        assert.equal(tcData(w).vendor.consents[755], true);
    });

    it('says GDPR applies either way', ( ) => {
        // The one field that is a claim about the law rather than an answer:
        // a vendor told otherwise may process with no consent at all.
        for ( const code of [ reject, accept ] ) {
            assert.equal(tcData(boot(code).window).gdprApplies, true);
        }
    });

    it('writes their IABTCF keys, in their encoding', ( ) => {
        const w = boot(accept).window;
        // Their lt(set, length): one character per id, "1" where it is in.
        assert.equal(
            w.localStorage.getItem('IABTCF_PurposeConsents'),
            '111111111110000000000000'
        );
        assert.equal(
            w.localStorage.getItem('IABTCF_SpecialFeaturesOptIns'),
            '110000000000'
        );
        assert.equal(w.localStorage.getItem('IABTCF_VendorConsents').length, 4000);
        assert.equal(
            w.localStorage.getItem('IABTCF_VendorConsents').indexOf('0'), -1
        );
        assert.equal(w.localStorage.getItem('IABTCF_CmpSdkID'), '2');
        assert.equal(w.localStorage.getItem('IABTCF_PolicyVersion'), '5');
        assert.equal(w.localStorage.getItem('IABTCF_PublisherCC'), 'FR');
        assert.equal(
            w.localStorage.getItem('IABTCF_TCString'), tcData(w).tcString
        );
        // Theirs calls setAllVendorsDisclosed, so this does whichever way the
        // answer goes.
        const refusing = boot(reject).window;
        assert.equal(
            refusing.localStorage.getItem('IABTCF_DisclosedVendors').indexOf('0'),
            -1
        );
        assert.equal(
            refusing.localStorage.getItem('IABTCF_PurposeConsents'),
            '000000000000000000000000'
        );
    });

    it('keeps the identity a visitor already carries', ( ) => {
        // cmpVersion comes back with the configuration a replaced bundle
        // never fetches, so a string already there is where it is read from.
        const first = boot(reject).window;
        // A version their own bundle would have carried, which is not the one
        // this falls back to - otherwise reusing and not reusing look alike.
        const theirs = withCmpVersion(
            first.localStorage.getItem('IABTCF_TCString'), 77
        );
        let out;
        const w = boot(accept, {
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('IABTCF_TCString', theirs);
            },
        }).window;
        assert.equal(decode(w).cmpVersion, 77);
        assert.equal(w.localStorage.getItem('IABTCF_CmpSdkVersion'), '77');
        assert.ok(out[0].includes(' cmp=2/77 '), out[0]);
        assert.equal(out[0].includes('/default'), false, out[0]);
        // And without one, their own fallback.
        assert.equal(decode(boot(reject).window).cmpVersion, 33);
    });

    it('answers what their stub was asked before it was replaced', ( ) => {
        const w = boot(accept, {
            before: w_ => {
                w_.eval(STUB);
                w_.eval('window.__answers = [];' +
                    'window.__tcfapi("getTCData", 2, function(d, ok) {' +
                    ' window.__answers.push([ d.purpose.consents[1], ok ]); });');
            },
        }).window;
        assert.deepEqual(plain(w.__answers), [ [ true, true ] ]);
    });

    it('adds the locator frame, and answers ping', ( ) => {
        const w = boot(reject).window;
        assert.notEqual(w.frames.__tcfapiLocator, undefined);
        let ping;
        w.__tcfapi('ping', 2, data => { ping = data; });
        assert.equal(ping.cmpId, 2);
        assert.equal(ping.cmpLoaded, true);
        assert.equal(ping.cmpStatus, 'loaded');
        let listener;
        w.__tcfapi('addEventListener', 2, data => { listener = data; });
        assert.equal(listener.eventStatus, 'tcloaded');
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; },
            listener.listenerId);
        assert.equal(removed, true);
        let other;
        w.__tcfapi('getInAppTCData', 2, (data, ok) => { other = [ data, ok ]; });
        assert.deepEqual(plain(other), [ null, false ]);
    });

    it('records their own state beside it', ( ) => {
        const w = boot(accept).window;
        const state = JSON.parse(w.localStorage.getItem('appconsent'));
        assert.equal(state.tcString, tcData(w).tcString);
        assert.equal(state.hasConsent, true);
        assert.equal(state.consentedAll, true);
        const refusing = boot(reject).window;
        const refused = JSON.parse(refusing.localStorage.getItem('appconsent'));
        assert.equal(refused.hasConsent, false);
        assert.equal(refused.consentedAll, false);
    });

    it('keeps what their state already held', ( ) => {
        const w = boot(reject, {
            before: w_ => {
                w_.localStorage.setItem('appconsent', JSON.stringify({
                    appKey: 'abc', somethingElse: 1,
                }));
            },
        }).window;
        const state = JSON.parse(w.localStorage.getItem('appconsent'));
        assert.equal(state.appKey, 'abc');
        assert.equal(state.somethingElse, 1);
        assert.equal(state.hasConsent, false);
    });

    it('answers their global, without rendering or changing the answer',
        async ( ) => {
            const w = boot(accept).window;
            assert.equal(typeof w.appconsent, 'object');
            assert.equal(await w.appconsent.isReady(), true);
            assert.equal(await w.appconsent.isGdprApplies(), true);
            assert.equal(await w.appconsent.getTCString(), tcData(w).tcString);
            assert.equal(await w.appconsent.hasConsent(), true);
            // Theirs would open the banner; there is none to open.
            assert.equal(await w.appconsent.present(), undefined);
            // And a refusing resource is not talked into granting.
            const refusing = boot(reject).window;
            assert.equal(await refusing.appconsent.consentAll(), false);
            assert.equal(decode(refusing).purposeConsents.size, 0);
        }
    );

    it('does nothing the second time it is injected', ( ) => {
        const w = boot(reject).window;
        const before_ = w.localStorage.getItem('IABTCF_TCString');
        w.eval(accept);
        // The guard is on their API, so the second injection - of either
        // mode - leaves the first answer alone.
        assert.equal(w.localStorage.getItem('IABTCF_TCString'), before_);
        assert.equal(decode(w).purposeConsents.size, 0);
    });

    it('says on the console which way it went', ( ) => {
        let out;
        boot(reject, { before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] appconsent-reject ' + versions.appconsent +
            ' tcf=refused cmp=2/33/default cc=FR keys=17 state=written' +
            ' drained=0'
        );
        let granting;
        boot(accept, { before: w_ => { granting = lines(w_); } });
        assert.ok(granting[0].includes(' tcf=granted'), granting[0]);
    });

    it('refuses the same with GPC on, which they do not read', ( ) => {
        const w = boot(reject, {
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
            },
        }).window;
        // Nothing in their bundle reads the signal - no globalPrivacyControl
        // and no doNotTrack anywhere in it.
        assert.equal(decode(w).purposeConsents.size, 0);
    });
});

/******************************************************************************/

describe('filters, appconsent', ( ) => {
    it('replaces the core and noops the chunks it would fetch', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('appconsent'));
        assert.deepEqual(active, [
            '||cdn.appconsent.io/tcf2-clear/*/core.bundle.js' +
                '$script,redirect=appconsent-reject.js',
            '||cdn.appconsent.io/tcf2-clear/*/*.bundle.js$script,redirect=noopjs',
        ]);
    });

    it('matches the urls they serve, core before chunks', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('appconsent'));
        const core = rules.filter(line => line.includes('appconsent-reject'));
        for ( const url of [
            'https://cdn.appconsent.io/tcf2-clear/current/core.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/core.bundle.js',
        ] ) {
            assert.ok(core.some(r => matches(r, url)), 'no rule matches ' + url);
        }
        // The numbered chunks are what the core lazily fetches for its banner.
        const noops = rules.filter(line => line.includes('noopjs'));
        for ( const url of [
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/1284.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/5572.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/6648.bundle.js',
            'https://cdn.appconsent.io/tcf2-clear/33.2.0/807.bundle.js',
        ] ) {
            assert.ok(noops.some(r => matches(r, url)), 'no noop rule for ' + url);
        }
    });
});

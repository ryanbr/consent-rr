/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import { GppModel } from '@iabgpp/cmpapi';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, versions,
} from './helpers.mjs';

const URL = 'https://www.fantacalcio.it/serie-a/';

// The IAB stub the page carries, verbatim in behaviour: no arguments hands back
// the queue, a ping is answered "stub", everything else is parked.
const STUB = 'window.__tcfapi = (function() {' +
    'var queue = [];' +
    'return function() {' +
    'var args = arguments;' +
    'if ( !args.length ) { return queue; }' +
    'if ( args[0] === "ping" ) {' +
    'args[2]({ gdprApplies: undefined, cmpLoaded: false, cmpStatus: "stub" });' +
    'return; }' +
    'queue.push(args);' +
    '};' +
    '})();';

// fantacalcio.it's own coreConfig, as choice.js passes it.
const CORE = {
    publisherCountryCode: 'IT',
    publisherName: 'Fantacalcio.it',
    lang_: 'it',
    consentScope: 'service',
    privacyMode: [ 'GDPR', 'USP' ],
    gdprEncodingMode: 'TCF_AND_GPP',
    vendorPurposeIds: [ 1, 2, 7, 8, 10, 11, 3, 5, 4, 6, 9 ],
    vendorPurposeLegitimateInterestIds: [ 7, 8, 9, 2, 10, 11 ],
    vendorSpecialFeaturesIds: [ 2, 1 ],
    legitimateInterestOptIn: true,
    totalVendors: 1015,
    googleEnabled: true,
    cmpVersion: 'latest',
    inmobiAccountId: 'Z3sQVQNy9sAbB',
};

// English on the element, Italian in the config: the config is the tenant's.
const PAGE = '<html lang="en"><head></head><body>' +
    '<p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('inmobi-reject.js');
});

const boot = (options = {}) => {
    const core = 'core' in options ? options.core : CORE;
    return runDom(reject, options.url || URL, options.html || PAGE, w => {
        if ( options.stub !== false ) { w.eval(STUB); }
        if ( typeof options.before === 'function' ) { options.before(w); }
        if ( core === null ) { return; }
        w.eval(
            'window.__tcfapi("init", 2, function() {}, { "coreConfig": ' +
            JSON.stringify(core) + ' });'
        );
    });
};

const tcData = w => {
    let data;
    w.__tcfapi('getTCData', 2, value => { data = value; });
    return data;
};

const ping = w => {
    let data;
    w.__tcfapi('ping', 2, value => { data = value; });
    return data;
};

const gppPing = w => {
    let data;
    w.__gpp('ping', value => { data = value; });
    return data;
};

const decode = w => TCString.decode(tcData(w).tcString);

const idsOn = model => {
    const out = [];
    model.forEach((value, id) => {
        if ( value ) { out.push(id); }
    });
    return out;
};

// jsdom objects come from another realm, where deepStrictEqual refuses to
// compare them. A round trip through JSON lands them in this one.
const plain = value => JSON.parse(JSON.stringify(value));

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

/******************************************************************************/

describe('inmobi-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('inmobi-'));
        // One resource: a refusal. No accept-all variant for this one.
        assert.deepEqual(names, [ 'inmobi-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.inmobi + "'"));
    });

    it('replaces the stub with a CMP that says it is loaded', ( ) => {
        const w = boot().window;
        assert.equal(typeof w.__tcfapi, 'function');
        assert.equal(typeof w.__gpp, 'function');
        assert.equal(typeof w.__uspapi, 'function');
        assert.equal(typeof w.__tcfapiui, 'function');
        const data = ping(w);
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.cmpLoaded, true);
        assert.equal(data.displayStatus, 'hidden');
        assert.equal(data.cmpId, 10);
        assert.equal(data.apiVersion, '2.2');
    });

    it('takes the tenant fields out of the init call choice.js parked', ( ) => {
        const w = boot().window;
        const decoded = decode(w);
        // Italian from coreConfig.lang_, not English off the html element.
        assert.equal(decoded.consentLanguage, 'IT');
        assert.equal(decoded.publisherCountryCode, 'IT');
        assert.equal(tcData(w).publisherCC, 'IT');
        assert.equal(w.__tcfapi.consentRR.config, 'read');
    });

    it('falls back to cmp2.js own defaults with no config to read', ( ) => {
        const w = boot({
            core: null,
            html: '<html lang="pt-BR"><body><p>x</p></body></html>',
        }).window;
        const decoded = decode(w);
        // AA is the user-assigned code: nothing is claimed about the publisher.
        assert.equal(decoded.publisherCountryCode, 'AA');
        assert.equal(decoded.consentLanguage, 'PT');
        assert.deepEqual(idsOn(decoded.purposeLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
        assert.equal(w.__tcfapi.consentRR.config, 'default');
    });

    it('answers the calls the page parked before it arrived', ( ) => {
        const seen = [];
        const w = boot({
            before: w_ => {
                w_.eval(STUB);
                w_.parked = (data, success) => {
                    w_.seen = JSON.stringify({
                        status: data && data.eventStatus,
                        listenerId: data && data.listenerId,
                        success,
                    });
                };
                w_.eval('window.__tcfapi("addEventListener", 2, window.parked);');
            },
        }).window;
        seen.push(JSON.parse(w.seen));
        assert.deepEqual(seen, [
            { status: 'tcloaded', listenerId: 1, success: true },
        ]);
    });

    it('refuses every consent, and keeps legitimate interest', ( ) => {
        const w = boot().window;
        const decoded = decode(w);
        assert.deepEqual(idsOn(decoded.purposeConsents), []);
        assert.deepEqual(idsOn(decoded.specialFeatureOptins), []);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.deepEqual(idsOn(decoded.publisherConsents), []);
        // A refusal is not an objection to legitimate interest, and the sampled
        // refusal kept these six purposes.
        assert.deepEqual(idsOn(decoded.purposeLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
        assert.deepEqual(idsOn(decoded.publisherLegitimateInterests),
            [ 2, 7, 8, 9, 10, 11 ]);
        assert.ok(decoded.vendorLegitimateInterests.size > 1000);
        const data = tcData(w);
        assert.deepEqual(
            Object.values(plain(data.purpose.consents)),
            new Array(11).fill(false)
        );
        assert.deepEqual(plain(data.vendor.consents), {});
        assert.equal(data.vendor.legitimateInterests[1], true);
        assert.equal(data.eventStatus, 'tcloaded');
        assert.equal(data.publisher.restrictions[1], undefined);
    });

    it('carries the CMP identity, and a timestamp stable for the day', ( ) => {
        const decoded = decode(boot().window);
        assert.equal(decoded.cmpId, 10);
        assert.equal(decoded.cmpVersion, 61);
        assert.equal(decoded.policyVersion, 5);
        assert.equal(decoded.vendorListVersion, 178);
        assert.equal(decoded.isServiceSpecific, true);
        const now = new Date();
        const midnight = Date.UTC(
            now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
        );
        assert.equal(decoded.created.getTime(), midnight);
        assert.equal(decoded.lastUpdated.getTime(), midnight);
    });

    it('objects to legitimate interest under Global Privacy Control', ( ) => {
        let out;
        const w = boot({
            before: w_ => {
                out = lines(w_);
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true,
                    configurable: true,
                });
            },
        }).window;
        const decoded = decode(w);
        assert.deepEqual(idsOn(decoded.purposeLegitimateInterests), []);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
        assert.deepEqual(plain(tcData(w).vendor.legitimateInterests), {});
        assert.ok(out.join('').includes(' li=objected'));
    });

    it('follows a tenant that has legitimate-interest opt-in off', ( ) => {
        const core = Object.assign({}, CORE, { legitimateInterestOptIn: false });
        const decoded = decode(boot({ core }).window);
        assert.deepEqual(idsOn(decoded.purposeLegitimateInterests), []);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
    });

    it('takes the legitimate-interest purposes from the tenant config', ( ) => {
        const core = Object.assign({}, CORE, {
            vendorPurposeLegitimateInterestIds: [ 2, 7 ],
        });
        const decoded = decode(boot({ core }).window);
        assert.deepEqual(idsOn(decoded.purposeLegitimateInterests), [ 2, 7 ]);
        assert.deepEqual(idsOn(decoded.publisherLegitimateInterests), [ 2, 7 ]);
    });

    it('says GDPR does not apply where the tenant does not ask for it', ( ) => {
        const core = Object.assign({}, CORE, { privacyMode: [ 'USP' ] });
        const w = boot({ core }).window;
        assert.equal(ping(w).gdprApplies, false);
        assert.equal(tcData(w).gdprApplies, false);
        // Still answered rather than left stalling.
        assert.equal(ping(w).cmpStatus, 'loaded');
    });

    it('writes the TC string to euconsent-v2, scoped as their writer scopes it',
        ( ) => {
            const dom = boot();
            const w = dom.window;
            assert.equal(cookies(w).get('euconsent-v2'), tcData(w).tcString);
            const found = cookiesInJar(dom, URL, 'euconsent-v2');
            assert.equal(found.length, 1);
            // cmp2.js scopes to coreConfig.cookieDomain, which defaults to the
            // hostname - not to the registrable domain.
            assert.equal(found[0].domain, 'www.fantacalcio.it');
            assert.equal(Boolean(found[0].hostOnly), false);
            assert.equal(found[0].path, '/');
            assert.equal(found[0].maxAge, 33696000);
        }
    );

    it('takes the cookie scope the tenant configured', ( ) => {
        const core = Object.assign({}, CORE, {
            cookieDomain: 'fantacalcio.it',
            cookiePath: '/serie-a/',
        });
        const dom = boot({ core });
        const found = cookiesInJar(dom, URL, 'euconsent-v2');
        assert.equal(found.length, 1);
        assert.equal(found[0].domain, 'fantacalcio.it');
        assert.equal(found[0].path, '/serie-a/');
    });

    it('writes no addtl_consent, which a refusal has their code delete', ( ) => {
        const w = boot().window;
        assert.equal(cookies(w).has('addtl_consent'), false);
        assert.equal(tcData(w).addtlConsent, undefined);
    });

    it('answers __gpp with the section the reference parse agrees with', ( ) => {
        const w = boot().window;
        const data = gppPing(w);
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.signalStatus, 'ready');
        assert.deepEqual(plain(data.applicableSections), [ 2 ]);
        assert.deepEqual(plain(data.supportedAPIs), [ '2:tcfeuv2' ]);
        assert.ok(data.gppString.startsWith('DBABMA~'));

        // The IAB's own library, parsing what this built: every field of the
        // section it reports has to match the one handed to callers.
        const model = new GppModel();
        model.decode(data.gppString);
        assert.deepEqual(model.getSectionIds(), [ 2 ]);
        const reference = JSON.parse(JSON.stringify(model.getSection('tcfeuv2')));
        let mine;
        w.__gpp('getSection', value => { mine = value; }, 'tcfeuv2');
        mine = JSON.parse(JSON.stringify(mine));
        assert.deepEqual(mine, reference);
        assert.equal(reference.CmpId, 10);
        assert.deepEqual(reference.PurposeConsents, new Array(24).fill(false));
        assert.equal(reference.PublisherCountryCode, 'IT');
    });

    it('answers the GPP commands, and refuses the one that is not one', ( ) => {
        const w = boot().window;
        const answers = {};
        const take = name => (value, success) => {
            answers[name] = { value, success };
        };
        w.__gpp('hasSection', take('has'), 'tcfeuv2');
        w.__gpp('hasSection', take('hasNot'), 'usnat');
        w.__gpp('getField', take('field'), 'tcfeuv2.PublisherCountryCode');
        w.__gpp('getField', take('noField'), 'tcfeuv2.Nonsense');
        w.__gpp('getGPPData', take('gppData'));
        assert.equal(answers.has.value, true);
        assert.equal(answers.hasNot.value, false);
        assert.equal(answers.field.value, 'IT');
        assert.equal(answers.field.success, true);
        assert.equal(answers.noField.success, false);
        // Not a command in GPP 1.1, and the reference implementation refuses it.
        assert.equal(answers.gppData.success, false);
    });

    it('cookies the GPP string only where the tenant encodes GPP', ( ) => {
        const both = boot().window;
        assert.equal(
            cookies(both).get('IABGPP_HDR_GppString'),
            gppPing(both).gppString
        );
        const core = Object.assign({}, CORE, { gdprEncodingMode: 'TCF' });
        const tcfOnly = boot({ core }).window;
        assert.equal(cookies(tcfOnly).has('IABGPP_HDR_GppString'), false);
        // The API is still there: a script gated on __gpp stalls otherwise.
        assert.equal(gppPing(tcfOnly).cmpStatus, 'loaded');
    });

    it('answers the CCPA API the page stubs and then warns about', ( ) => {
        const w = boot().window;
        const answers = [];
        w.__uspapi('getUSPData', 1, (value, success) => {
            answers.push([ value, success ]);
        });
        w.__uspapi('getUSPData', 2, (value, success) => {
            answers.push([ value, success ]);
        });
        assert.deepEqual(plain(answers[0]), [
            { version: 1, uspString: '1---' }, true,
        ]);
        assert.deepEqual(plain(answers[1]), [ null, false ]);
    });

    it('answers the commands the page itself calls', ( ) => {
        const w = boot().window;
        const answers = {};
        const take = name => (value, success) => {
            answers[name] = { value, success };
        };
        // This tenant's footer has a privacy-settings button on this one.
        w.__tcfapi('displayConsentUi', 2, take('ui'));
        w.__tcfapi('getConfig', 2, take('config'));
        w.__tcfapi('init', 2, take('init'));
        w.__tcfapi('getNonIABVendorConsents', 2, take('nonIab'));
        w.__tcfapi('nonsense', 2, take('nonsense'));
        assert.deepEqual(plain(answers.ui), { value: false, success: true });
        assert.equal(answers.init.success, true);
        assert.equal(answers.config.value.publisherCountryCode, 'IT');
        assert.deepEqual(plain(answers.nonIab.value), { consentedVendors: [] });
        assert.equal(answers.nonsense.success, false);
    });

    it('removes an event listener it added', ( ) => {
        const w = boot().window;
        let listenerId;
        w.__tcfapi('addEventListener', 2, data => { listenerId = data.listenerId; });
        const removed = [];
        w.__tcfapi('removeEventListener', 2, ok => { removed.push(ok); }, listenerId);
        w.__tcfapi('removeEventListener', 2, ok => { removed.push(ok); }, listenerId);
        assert.deepEqual(removed, [ true, false ]);
    });

    it('answers a framed vendor over postMessage', ( ) => {
        const w = boot().window;
        const replies = [];
        const source = { postMessage(response) { replies.push(response); } };
        const post = data => {
            const event = new w.MessageEvent('message', {
                data,
                origin: 'https://vendor.example',
            });
            // jsdom will not take a stand-in window as the event source.
            Object.defineProperty(event, 'source', { value: source });
            w.dispatchEvent(event);
        };
        post({ __tcfapiCall: { command: 'ping', version: 2, callId: 'a' } });
        assert.equal(replies[0].__tcfapiReturn.callId, 'a');
        assert.equal(replies[0].__tcfapiReturn.returnValue.cmpStatus, 'loaded');
        post(JSON.stringify({
            __tcfapiCall: { command: 'getTCData', version: 2, callId: 2 },
        }));
        assert.equal(typeof replies[1], 'string');
        assert.equal(JSON.parse(replies[1]).__tcfapiReturn.success, true);
        post({ __gppCall: { command: 'ping', callId: 'b' } });
        assert.equal(replies[2].__gppReturn.callId, 'b');
        assert.equal(replies[2].__gppReturn.returnValue.cmpStatus, 'loaded');
    });

    it('adds the locator frames, and leaves the page its own', ( ) => {
        const w = boot().window;
        assert.equal(
            w.document.querySelectorAll('iframe[name="__tcfapiLocator"]').length,
            1
        );
        assert.equal(
            w.document.querySelectorAll('iframe[name="__gppLocator"]').length,
            1
        );
        // The page's stub adds the TCF frame itself, and a GPP stub adds the
        // other one. Neither may be doubled.
        const already = boot({
            html: '<html><body><iframe name="__tcfapiLocator"></iframe>' +
                '<iframe name="__gppLocator"></iframe>' +
                '<p>x</p></body></html>',
        }).window;
        for ( const name of [ '__tcfapiLocator', '__gppLocator' ] ) {
            assert.equal(
                already.document
                    .querySelectorAll('iframe[name="' + name + '"]').length,
                1,
                name + ' was doubled'
            );
        }
    });

    it('shims gtag onto the data layer only where the page has none', ( ) => {
        const w = boot().window;
        assert.equal(typeof w.gtag, 'function');
        w.gtag('consent', 'update', { ad_storage: 'denied' });
        assert.equal(w.dataLayer.length, 1);
        assert.equal(w.dataLayer[0][0], 'consent');
        const own = boot({
            before: w_ => {
                w_.eval('window.dataLayer = [ "kept" ];');
                w_.eval('window.gtag = function() { window.mine = true; };');
            },
        }).window;
        own.gtag();
        assert.equal(own.mine, true);
        assert.deepEqual(Array.from(own.dataLayer), [ 'kept' ]);
    });

    it('says on the console what went in', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] inmobi-reject ' + versions.inmobi +
            ' config=read cc=IT lang=IT tcf=refused li=kept gpp=refused' +
            ' usp=1--- cookie=written gppcookie=written'
        );
        assert.equal(w.__tcfapi.consentRR.mode, 'reject');
        assert.equal(w.__tcfapi.consentRR.version, versions.inmobi);
    });

    it('does nothing the second time it is injected', ( ) => {
        const dom = boot();
        const w = dom.window;
        const before_ = tcData(w).tcString;
        const out = lines(w);
        w.eval(reject);
        assert.deepEqual(out, []);
        assert.equal(tcData(w).tcString, before_);
        assert.equal(
            w.document.querySelectorAll('iframe[name="__gppLocator"]').length,
            1
        );
    });

    it('works on a page carrying no stub at all', ( ) => {
        const w = boot({ stub: false, core: null }).window;
        assert.equal(ping(w).cmpStatus, 'loaded');
        assert.equal(cookies(w).get('euconsent-v2'), tcData(w).tcString);
    });
});

/******************************************************************************/

describe('filters, inmobi', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces cmp2.js, and leaves choice.js to hand over the config', ( ) => {
        const ours = active.split('\n')
            .filter(line => line.includes('inmobi-reject'));
        assert.ok(ours.length !== 0);
        for ( const line of ours ) {
            assert.ok(/cmp2(-polyfilled)?\.js|\+js\(/.test(line),
                'the redirect belongs on cmp2.js: ' + line);
        }
        // Both file names: choice.js picks the polyfilled one on old browsers.
        assert.ok(active.includes('/cmp2.js'));
        assert.ok(active.includes('/cmp2-polyfilled.js'));
    });
});

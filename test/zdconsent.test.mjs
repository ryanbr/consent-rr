/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Ziff Davis's zdconsent.js. Two things here are unlike every other family:
    the resource stands in for two files that differ by two booleans, and it
    is a OneTrust front end, so both records are written by one file.

    The page fixture is speedtest.net's own markup - the queues declared inline
    above the tag - because adopting those arrays rather than replacing them is
    the difference between a page's queued work running and being dropped.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://mashable.com/article/x';
const DEFAULT_SRC = 'https://cdn.ziffstatic.com/jst/zdconsent.js';
const EU_SRC = 'https://cdn.ziffstatic.com/jst/zdconsent_eu.js';

// Theirs, from speedtest.net: six of the seven queues declared by the page,
// then the tag. A page's own array is the one it pushes to.
const page = (src = DEFAULT_SRC) => '<!doctype html><html lang="en"><head>' +
    '<script>window.zdconsent = window.zdconsent || { run: [], cmd: [],' +
    ' useractioncomplete: [], analytics: [], functional: [], social: [] };' +
    '</script>' +
    '<script type="text/javascript" id="zdconsent" src="' + src +
    '" async="true"></script>' +
    '</head><body><p id="content">x</p></body></html>';

let reject;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('zdconsent-reject.js');
    accept = resources.get('zdconsent-accept.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || page(options.src),
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

// What a page pushes, in all three shapes their own sites use.
const queued = w => {
    const ran = [];
    for ( const name of [
        'run', 'cmd', 'analytics', 'functional', 'social',
        'useractioncomplete', 'targeting',
    ] ) {
        w.zdconsent[name].push(( ) => { ran.push(name); });
    }
    return ran;
};

/******************************************************************************/

describe('zdconsent-reject', ( ) => {
    it('records their own Deny All, in their own cookies', ( ) => {
        const jar = cookies(boot(reject));
        assert.equal(jar.get('zdconsent'), 'optout');
        assert.equal(jar.get('opt_out'), '1');
        // Their opt-out path adds it alongside the two the button writes.
        assert.equal(jar.get('zd_core_lialready'), 'true');
    });

    it('writes OneTrust record too, because their script reads it', ( ) => {
        const w = boot(reject);
        assert.equal(w.OnetrustActiveGroups, ',C0001,');
        assert.equal(w.OptanonActiveGroups, ',C0001,');
        assert.match(cookies(w).get('OptanonConsent'), /C0004%3A0/);
        assert.equal(typeof w.OneTrust, 'object');
    });

    it('answers us_privacy with the sale opt-out set', ( ) => {
        const w = boot(reject);
        assert.equal(w.zdconsent.getUSPrivacyString(), '1YYY');
        assert.equal(cookies(w).get('usprivacy'), '1YYY');
        let answer = null;
        w.__uspapi('getUSPData', 1, (data, ok) => {
            answer = [ data.version, data.uspString, ok ];
        });
        assert.deepEqual(answer, [ 1, '1YYY', true ]);
    });

    it('refuses a version 2 uspapi call rather than queueing it', ( ) => {
        const w = boot(reject);
        let answer;
        w.__uspapi('getUSPData', 2, (data, ok) => { answer = [ data, ok ]; });
        assert.equal(answer[0], null);
        assert.equal(answer[1], false);
    });

    it('turns every optin off, in their own field shapes', ( ) => {
        const optins = { ...boot(reject).zdconsent.optins };
        // comscore is 1 or 0 where the rest are booleans. Theirs, not a typo.
        assert.deepEqual(optins, {
            comscore: 0, ga: false, snowplow: false, googleads: false,
            ccpa: true, core: false, facebook: false, krux: false,
        });
    });

    it('runs the ungated queues and leaves the gated ones parked', async ( ) => {
        const w = boot(reject);
        const ran = queued(w);
        await settle(40);
        assert.deepEqual(ran.sort(), [ 'run', 'useractioncomplete' ]);
    });

    it('runs what the page queued before the tag', async ( ) => {
        const w = runDom(reject, URL, page(), ww => {
            ww.eval('window.zdconsent = { run: [], cmd: [] };' +
                'window.ranEarly = 0;' +
                'window.zdconsent.run.push(function() { window.ranEarly++; });');
        }).window;
        await settle(40);
        assert.equal(w.ranEarly, 1);
    });

    it('adopts the array the page declared, rather than a new one', ( ) => {
        let same = false;
        const w = runDom(reject, URL, page(), ww => {
            ww.eval('window.zdconsent = { run: [] }; window.mine = window.zdconsent.run;');
        }).window;
        same = w.mine === w.zdconsent.run;
        assert.equal(same, true);
    });

    it('loads a queued url, as their own runner does', async ( ) => {
        const w = boot(reject);
        w.zdconsent.run.push('https://cdn.static.zdbb.net/js/x.min.js');
        w.zdconsent.run.push({ src: '/iterable/push-consent.js', type: 'module' });
        await settle(40);
        const srcs = [ ...w.document.querySelectorAll('script') ]
            .map(node => node.getAttribute('src'));
        assert.ok(srcs.includes('https://cdn.static.zdbb.net/js/x.min.js'));
        assert.ok(srcs.includes('/iterable/push-consent.js'));
    });

    it('keeps the original push as _push and marks the queue processed', ( ) => {
        const w = boot(reject);
        assert.equal(typeof w.zdconsent.run._push, 'function');
        assert.equal(w.zdconsent.run._processed, true);
        // Never drained by their own build, so not drained here either.
        assert.equal(w.zdconsent.targeting._processed, undefined);
    });

    it('fires their load events at the window, once each', ( ) => {
        const w = boot(reject);
        const seen = [];
        const names = [
            'zdconsentloaded', 'zdconsent-loaded',
            'zdconsent-userconsentupdated',
        ];
        // Already fired by the time a test can listen, so the data layer is
        // what proves the order - theirs pushes every event it fires.
        for ( const name of names ) {
            w.addEventListener(name, ( ) => { seen.push(name); });
        }
        const fired = w.dataLayer.filter(entry => entry && entry.event)
            .map(entry => entry.event);
        for ( const name of names ) {
            assert.equal(fired.filter(e => e === name).length, 1, name);
        }
        assert.deepEqual(seen, []);
    });

    it('does not fire the consented events', ( ) => {
        const w = boot(reject);
        const fired = w.dataLayer.filter(entry => entry && entry.event)
            .map(entry => entry.event);
        for ( const name of [
            'zdconsentgiven', 'zdconsent-targeting', 'evidonConsentGiven',
            'zdconsent-analytics', 'zdconsent-functional', 'zdconsent-social',
        ] ) {
            assert.equal(fired.includes(name), false, name);
        }
    });

    it('says the visitor has answered, so a page waiting stops', ( ) => {
        assert.equal(boot(reject).zdconsent.userActionDone, true);
    });

    it('cuts the cookie domain the way their own function does', ( ) => {
        assert.equal(boot(reject).zdconsent.domain, 'mashable.com');
        assert.equal(
            boot(reject, { url: 'https://www.speedtest.net/x' }).zdconsent.domain,
            'speedtest.net');
        // Three labels where the second-to-last is com, co or web.
        assert.equal(
            boot(reject, { url: 'https://news.example.co.uk/x' }).zdconsent.domain,
            'example.co.uk');
    });

    it('lets the page name the cookie domain, as theirs does', ( ) => {
        const w = boot(reject, {
            before: ww => { ww.__ZDConsentDomain = 'ziffdavis.com'; },
        });
        assert.equal(w.zdconsent.domain, 'ziffdavis.com');
        assert.equal(w.zdconsent._getCookieDomain(), 'ziffdavis.com');
    });

    it('invents no site id and no user id', ( ) => {
        const zd = boot(reject).zdconsent;
        assert.equal(zd.siteId, '');
        assert.equal(zd.bu, '');
        assert.equal(zd.oneTrustSiteId, '');
        assert.equal(zd.oneTrustUserId, '');
        assert.deepEqual(Object.keys(zd.getApsConsent()), []);
        assert.deepEqual(Object.keys(zd.getApsParams()), []);
    });

    it('leaves isPremiumSubscriber to the page', ( ) => {
        const w = runDom(reject, URL, page(), ww => {
            ww.eval('window.zdconsent = { isPremiumSubscriber: true, run: [] };');
        }).window;
        assert.equal(w.zdconsent.isPremiumSubscriber, true);
    });

    it('sends no adblock report', ( ) => {
        const w = boot(reject);
        assert.equal(cookies(w).get('_pgabp'), undefined);
        assert.equal(w.adblock, undefined);
        const fired = w.dataLayer.filter(entry => entry && entry.event)
            .map(entry => entry.event);
        assert.equal(fired.includes('adblock'), false);
    });

    it('hands a page gtag call to the data layer, as theirs does', ( ) => {
        const w = boot(reject);
        const before = w.dataLayer.length;
        w.zdconsent.gtag('event', 'x', { a: 1 });
        assert.equal(w.dataLayer.length, before + 1);
        assert.equal(w.dataLayer[before][1], 'x');
    });

    it('reports the same consent string as the TCF layer under it', ( ) => {
        const w = boot(reject);
        let fromApi = null;
        w.__tcfapi('getTCData', 2, data => { fromApi = data.tcString; });
        assert.equal(typeof fromApi, 'string');
        assert.equal(w.zdconsent.getConsentString(), fromApi);
    });

    it('announces both layers, once each', ( ) => {
        let out;
        runDom(reject, URL, page(), w => { out = lines(w); });
        assert.equal(out.length, 2);
        assert.equal(out[0],
            '[consent-rr] zdconsent-reject/onetrust ' + versions.zdconsent +
            ' groups=,C0001, tcf=refused gpp=refused');
        assert.ok(out[1].startsWith(
            '[consent-rr] zdconsent-reject ' + versions.zdconsent +
            ' variant=default gdpr=false'));
        assert.ok(out[1].includes(' consent=refused gpc=unset usp=1YYY'));
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const w = boot(reject, { before: ww => { ww.console = undefined; } });
        assert.equal(w.zdconsent.consentGiven, false);
    });

    it('stands down inside a frame whose parent already has the layer', ( ) => {
        const w = boot(reject, {
            before: ww => {
                Object.defineProperty(ww, 'parent', {
                    value: { zdconsent: { inited: true } },
                });
            },
        });
        // Nothing written, neither layer installed.
        assert.equal(cookies(w).get('zdconsent'), undefined);
        assert.equal(w.OneTrust, undefined);
        assert.equal(w.zdconsent.consentRR, undefined);
    });

    it('does not hang the api on a script element named zdconsent', ( ) => {
        // A page's ids are named properties of the window, so their own tag
        // with id="zdconsent" - speedtest.net's markup - is what
        // window.zdconsent reads as until something assigns over it.
        const html = '<!doctype html><html><head>' +
            '<script id="zdconsent" src="' + DEFAULT_SRC + '"></script>' +
            '</head><body></body></html>';
        const w = runDom(reject, URL, html).window;
        assert.equal(w.zdconsent.nodeType, undefined);
        assert.equal(w.zdconsent.consentGiven, false);
        assert.ok(Array.isArray(w.zdconsent.run));
    });

    it('stands down when a second request in the page lands here', ( ) => {
        const w = boot(reject);
        const first = w.zdconsent.consentRR;
        w.eval(reject);
        assert.equal(w.zdconsent.consentRR, first);
    });
});

/******************************************************************************/

describe('zdconsent, the two files', ( ) => {
    it('reads the eu variant off the element uBO redirected', ( ) => {
        const w = boot(reject, { src: EU_SRC });
        assert.equal(w.zdconsent.gdprApplies, true);
        assert.equal(w.zdconsent.optinApplies, true);
        // Not applicable under GDPR, and no usprivacy cookie at all.
        assert.equal(w.zdconsent.getUSPrivacyString(), '1---');
        assert.equal(cookies(w).get('usprivacy'), undefined);
    });

    it('takes the default file as not GDPR', ( ) => {
        const w = boot(reject);
        assert.equal(w.zdconsent.gdprApplies, false);
        assert.equal(w.zdconsent.optinApplies, false);
    });

    it('finds the variant without a currentScript to read', ( ) => {
        // A scriptlet injection has none, so the document is swept instead.
        const html = '<!doctype html><html><head></head><body>' +
            '<script src="' + EU_SRC + '"></script></body></html>';
        const w = runDom(reject, URL, html);
        assert.equal(w.window.zdconsent.gdprApplies, true);
    });

    it('lets their own geo cookies decide over the variant', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.document.cookie = 'geoCC=DE';
                ww.document.cookie = 'geoRC=BE';
            },
        });
        assert.equal(w.zdconsent.gdprApplies, true);
        assert.equal(w.zdconsent.geoCC, 'DE');
        assert.equal(w.zdconsent.geoRC, 'BE');
    });

    it('answers a US visitor the way their map does', ( ) => {
        const w = boot(reject, {
            before: ww => { ww.document.cookie = 'geoCC=US'; },
        });
        assert.equal(w.zdconsent.gdprApplies, false);
        assert.equal(w.zdconsent.ccpaApplies, true);
        assert.equal(w.zdconsent.getUSPrivacyString(), '1YYY');
    });

    it('leaves ccpaApplies absent where theirs does', ( ) => {
        // Theirs publishes it inside the function that applies a country, so
        // with no country known a page finds the field missing, not false.
        const w = boot(reject);
        assert.equal('ccpaApplies' in w.zdconsent, false);
    });

    it('takes their own regime override, as their staff do', ( ) => {
        const w = boot(reject, { url: URL + '?zdconsent2=EU' });
        assert.equal(w.zdconsent.gdprApplies, true);
        assert.equal(w.zdconsent.geoCC, 'GB');
    });

    it('reads a country off window.OOKLA, as theirs does', ( ) => {
        const w = boot(reject, {
            url: 'https://www.speedtest.net/x',
            before: ww => {
                ww.OOKLA = { globals: { location: {
                    countryCode: 'fr', regionCode: 'idf',
                } } };
            },
        });
        assert.equal(w.zdconsent.gdprApplies, true);
        assert.equal(w.zdconsent.geoCC, 'FR');
    });

    it('treats Quebec as opt-in and the rest of Canada as neither', ( ) => {
        const quebec = boot(reject, { before: ww => {
            ww.document.cookie = 'geoCC=CA';
            ww.document.cookie = 'geoRC=QC';
        } });
        assert.equal(quebec.zdconsent.optinApplies, true);
        assert.equal(quebec.zdconsent.gdprApplies, false);
        const ontario = boot(reject, { before: ww => {
            ww.document.cookie = 'geoCC=CA';
            ww.document.cookie = 'geoRC=ON';
        } });
        assert.equal(ontario.zdconsent.optinApplies, false);
    });
});

/******************************************************************************/

describe('zdconsent-accept', ( ) => {
    it('consents to everything, in both records', ( ) => {
        const w = boot(accept, { src: EU_SRC });
        assert.equal(w.zdconsent.consentGiven, true);
        assert.equal(cookies(w).get('zdconsent'), 'optin');
        assert.equal(cookies(w).get('opt_out'), undefined);
        assert.equal(w.OnetrustActiveGroups,
            ',C0001,C0002,C0003,C0004,C0005,V2STACK42,');
    });

    it('expires the opt_out a refusal left behind', ( ) => {
        // The case that matters is a returning visitor who had refused and
        // then swapped the filter: a fresh jar has no opt_out either way.
        const w = boot(accept, {
            src: EU_SRC,
            before: ww => {
                ww.document.cookie = 'opt_out=1; path=/';
                ww.document.cookie = 'zdconsent=optout; path=/';
            },
        });
        assert.equal(cookies(w).get('opt_out'), undefined);
        assert.equal(cookies(w).get('zdconsent'), 'optin');
    });

    it('turns every optin on', ( ) => {
        const optins = { ...boot(accept, { src: EU_SRC }).zdconsent.optins };
        assert.deepEqual(optins, {
            comscore: 1, ga: true, snowplow: true, googleads: true,
            ccpa: true, core: true, facebook: true, krux: true,
        });
    });

    it('runs every queue their own script would', async ( ) => {
        const w = boot(accept, { src: EU_SRC });
        const ran = queued(w);
        await settle(40);
        assert.deepEqual(ran.sort(), [
            'analytics', 'cmd', 'functional', 'run', 'social',
            'useractioncomplete',
        ]);
    });

    it('fires the consented events', ( ) => {
        const w = boot(accept, { src: EU_SRC });
        const fired = w.dataLayer.filter(entry => entry && entry.event)
            .map(entry => entry.event);
        for ( const name of [
            'zdconsentgiven', 'zdconsent-targeting', 'evidonConsentGiven',
            'zdconsent-analytics', 'zdconsent-functional', 'zdconsent-social',
        ] ) {
            assert.equal(fired.includes(name), true, name);
        }
    });

    it('does not overrule a GPC header where their script reads one', ( ) => {
        const w = boot(accept, { before: ww => {
            Object.defineProperty(ww.navigator, 'globalPrivacyControl',
                { value: true, configurable: true });
        } });
        assert.equal(w.zdconsent.consentGiven, false);
        assert.equal(cookies(w).get('zdconsent'), 'optout');
        // And the layer underneath stood down with it, or the record their own
        // code reads would disagree with the one this file wrote.
        assert.equal(w.OnetrustActiveGroups, ',C0001,');
    });

    it('says in the console line that it stood down, and why', ( ) => {
        let out;
        runDom(accept, URL, page(), w => {
            out = lines(w);
            Object.defineProperty(w.navigator, 'globalPrivacyControl',
                { value: true, configurable: true });
        });
        assert.ok(out[1].includes(' consent=refused gpc=set'));
        assert.ok(out[1].includes(' skipped=accept want=gpc'));
    });

    it('grants under GDPR whatever GPC says, as their script does', ( ) => {
        // Their gate is !gdprApplies, so the eu build never reads it.
        const w = boot(accept, { src: EU_SRC, before: ww => {
            Object.defineProperty(ww.navigator, 'globalPrivacyControl',
                { value: true, configurable: true });
        } });
        assert.equal(w.zdconsent.consentGiven, true);
        let out;
        runDom(accept, URL, page(EU_SRC), ww => {
            out = lines(ww);
            Object.defineProperty(ww.navigator, 'globalPrivacyControl',
                { value: true, configurable: true });
        });
        assert.ok(out[1].includes(' gpc=n/a'));
    });
});

/******************************************************************************/

describe('filters, zdconsent', ( ) => {
    it('covers both files with one wildcard', ( ) => {
        assert.match(
            filtersText,
            /\|\|cdn\.ziffstatic\.com\/jst\/zdconsent\*\.js\$script,redirect=zdconsent-reject\.js/
        );
    });

    it('never names OneTrust s own host, which is never asked for', ( ) => {
        const lines2 = filtersText.split('\n')
            .filter(line => line.startsWith('!') === false && line !== '')
            .filter(line => line.includes('ziffstatic'));
        for ( const line of lines2 ) {
            assert.equal(line.includes('cookielaw'), false);
        }
    });

    it('says in the list that it is a OneTrust front end', ( ) => {
        assert.match(filtersText, /IT IS A ONETRUST FRONT END/);
        assert.match(filtersText, /THE QUEUES ARE THE POINT/);
    });
});

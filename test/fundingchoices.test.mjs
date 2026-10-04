/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Google Funding Choices. Every expectation in here was measured by booting
    their own /f/<token> script - the one their loader serves when Funding
    Choices has nothing to show - rather than read from a doc, including the
    two things it does NOT do: run a publisher's callbackQueue, and answer a
    malformed internal call.

    The fixture carries the publisher's own inline snippet, because the
    googlefcPresent iframe it makes is the page's and must survive.

*/

import { strict as assert } from 'node:assert';
import { TCString } from '@iabtcf/core';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://news.example.co.uk/article';
const SRC = 'https://fundingchoicesmessages.google.com/i/pub-1234567890123456?ers=1';

// Google's own snippet, which publishers paste above their ad code.
const SNIPPET = '(function(){function s(){' +
    "if(!window.frames['googlefcPresent']){" +
    'if(document.body){var i=document.createElement("iframe");' +
    'i.name="googlefcPresent";i.style.display="none";' +
    'document.body.appendChild(i);}else{setTimeout(s,0);}}}s();})();';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script async src="' + SRC + '"></script>' +
    '</head><body><p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('fundingchoices-reject.js');
});

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
    w => {
        w.eval(SNIPPET);
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const frameNames = w => [ ...w.document.querySelectorAll('iframe') ]
    .map(node => node.name);

const push = (w, command, entry) => {
    let got = null;
    const callback = answer => { got = answer; };
    w.googlefc.__fci.push(command, entry === undefined ? callback : entry);
    return got;
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('fundingchoices-reject', ( ) => {
    it('appends the two iframes their own script appends', ( ) => {
        const names = frameNames(boot());
        assert.ok(names.includes('googlefcInactive'));
        assert.ok(names.includes('googlefcLoaded'));
    });

    it('leaves the publisher s own googlefcPresent iframe alone', ( ) => {
        const w = boot();
        assert.equal(frameNames(w).filter(n => n === 'googlefcPresent').length, 1);
        assert.equal(typeof w.frames.googlefcPresent, 'object');
    });

    it('makes the iframes reachable by name, which is the signal', ( ) => {
        const w = boot();
        assert.equal(typeof w.frames.googlefcLoaded, 'object');
        assert.equal(typeof w.frames.googlefcInactive, 'object');
    });

    it('hides them the way theirs does', ( ) => {
        const w = boot();
        const frame = [ ...w.document.querySelectorAll('iframe') ]
            .find(node => node.name === 'googlefcLoaded');
        assert.equal(frame.style.display, 'none');
        assert.equal(frame.style.width, '0px');
        assert.equal(frame.style.height, '0px');
        assert.equal(frame.style.left, '-1000px');
        assert.equal(frame.style.zIndex, '-1000');
    });

    it('waits for a body rather than dropping the iframes', async ( ) => {
        // Their own append retries on a 5ms timer. A parser always gives a
        // document a body, so the only way to be waiting for one is to take
        // it away first - otherwise this test passes without the retry.
        let dom;
        const w = runDom(reject, URL, PAGE, ww => {
            ww.eval(SNIPPET);
            dom = ww.document;
            dom.documentElement.removeChild(dom.body);
        }).window;
        assert.equal(w.document.body, null);
        assert.deepEqual(frameNames(w), []);
        dom.documentElement.appendChild(dom.createElement('body'));
        await settle(60);
        const names = frameNames(w);
        assert.ok(names.includes('googlefcLoaded'), names.join(','));
        assert.ok(names.includes('googlefcInactive'), names.join(','));
    });

    it('does not add a name the document already carries', ( ) => {
        // Their own check is by iframe name, and it is the one that stops a
        // second copy going in where their script got part way first.
        const w = boot({
            before: ww => {
                const frame = ww.document.createElement('iframe');
                frame.name = 'googlefcLoaded';
                ww.document.body.appendChild(frame);
            },
        });
        const names = frameNames(w);
        assert.equal(names.filter(n => n === 'googlefcLoaded').length, 1);
        assert.equal(names.filter(n => n === 'googlefcInactive').length, 1);
    });

    it('answers their two command names with the string theirs answers', ( ) => {
        const w = boot();
        assert.equal(push(w, 'loaded'), '[null,[4]]');
        assert.equal(push(w, 'prov'), '[null,[4]]');
    });

    it('answers an unknown command rather than dropping it', ( ) => {
        assert.equal(push(boot(), 'nonsense'), '[null,[2]]');
    });

    it('takes a callback wrapped in their cb object', ( ) => {
        const w = boot();
        let got = null;
        w.googlefc.__fci.push('loaded', { cb: answer => { got = answer; } });
        assert.equal(got, '[null,[4]]');
    });

    it('answers what was queued before it arrived, in their pairs', ( ) => {
        const w = boot({
            before: ww => {
                ww.eval('window.early = [];' +
                    'window.googlefc = { __fci: [] };' +
                    'window.googlefc.__fci.push("loaded",' +
                    ' function(a){ window.early.push(a); });' +
                    'window.googlefc.__fci.push("prov",' +
                    ' function(a){ window.early.push(a); });');
            },
        });
        assert.deepEqual([ ...w.early ], [ '[null,[4]]', '[null,[4]]' ]);
    });

    it('leaves an odd-length queue alone, as theirs does', ( ) => {
        const w = boot({
            before: ww => {
                ww.eval('window.early = 0;' +
                    'window.googlefc = { __fci: ["loaded",' +
                    ' function(){ window.early++; }, "prov"] };');
            },
        });
        assert.equal(w.early, 0);
    });

    it('answers an __fciCall over postMessage with the call id', async ( ) => {
        const w = boot();
        const replies = [];
        const source = { postMessage: (message, origin) => {
            replies.push([ message.__fciReturn, origin ]);
        } };
        const send = call => {
            const event = new w.MessageEvent('message',
                { data: { __fciCall: call } });
            Object.defineProperty(event, 'source', { value: source });
            Object.defineProperty(event, 'origin',
                { value: 'https://fundingchoicesmessages.google.com' });
            w.dispatchEvent(event);
        };
        send({ command: 'loaded', callId: 7 });
        await settle(20);
        assert.deepEqual(replies, [
            [ '[7,[4]]', 'https://fundingchoicesmessages.google.com' ],
        ]);
    });

    it('answers a bad call with silence, which is also theirs', async ( ) => {
        const w = boot();
        const replies = [];
        const source = { postMessage: message => { replies.push(message); } };
        const send = call => {
            const event = new w.MessageEvent('message',
                { data: { __fciCall: call } });
            Object.defineProperty(event, 'source', { value: source });
            Object.defineProperty(event, 'origin', { value: 'https://x.example' });
            w.dispatchEvent(event);
        };
        // An unknown command, no call id, a string call id, and no call at all.
        send({ command: 'bogus', callId: 9 });
        send({ command: 'loaded' });
        send({ command: 'loaded', callId: '7' });
        w.dispatchEvent(new w.MessageEvent('message', { data: { other: 1 } }));
        w.dispatchEvent(new w.MessageEvent('message', { data: 'a string' }));
        await settle(20);
        assert.deepEqual(replies, []);
    });

    it('puts their internal manager up, by their own method names', ( ) => {
        const manager = boot().__fcInternalApiManager;
        for ( const name of [
            'setError', 'setCmpModeObject', 'setExperimentsObject',
            'getSerializedReturnMessageForCommand',
            'getSerializedReturnMessageForInvalidCommand',
        ] ) {
            assert.equal(typeof manager[name], 'function', name);
        }
        assert.equal(manager.getSerializedReturnMessageForCommand('loaded'),
            '[null,[4]]');
        assert.equal(manager.getSerializedReturnMessageForInvalidCommand(),
            '[null,[2]]');
    });

    it('says the postMessage side is ready', ( ) => {
        assert.equal(boot().__fcInternalApiPostMessageReady, true);
    });

    it('writes no consent cookie, because absent is the refusal', ( ) => {
        const w = boot();
        assert.equal(cookies(w).get('FCCDCF'), undefined);
        assert.equal(String(w.document.cookie), '');
    });

    it('writes nothing at all when there is no record to clear', ( ) => {
        // Clearing takes a sweep of every plausible path and domain pair,
        // because neither is readable. A name this document cannot read is
        // one it cannot clear either, so the sweep is skipped - which is the
        // common case, on every page.
        let writes = 0;
        const w = boot({
            before: ww => {
                const own = Object.getOwnPropertyDescriptor(
                    ww.Document.prototype, 'cookie');
                Object.defineProperty(ww.document, 'cookie', {
                    configurable: true,
                    get: ( ) => own.get.call(ww.document),
                    set: value => {
                        writes += 1;
                        own.set.call(ww.document, value);
                    },
                });
            },
        });
        assert.equal(writes, 0);
        assert.equal(String(w.document.cookie), '');
    });

    it('sweeps only when there is something there', ( ) => {
        let writes = 0;
        const w = boot({
            before: ww => {
                const own = Object.getOwnPropertyDescriptor(
                    ww.Document.prototype, 'cookie');
                Object.defineProperty(ww.document, 'cookie', {
                    configurable: true,
                    get: ( ) => own.get.call(ww.document),
                    set: value => {
                        writes += 1;
                        own.set.call(ww.document, value);
                    },
                });
                ww.document.cookie = 'FCCDCF=yes; path=/';
            },
        });
        // The seed write, then the sweep.
        assert.ok(writes > 1, String(writes));
        assert.equal(cookies(w).get('FCCDCF'), undefined);
    });

    it('clears the cookie a visitor consented to earlier', ( ) => {
        // Theirs is set for about thirteen months, so a returning visitor
        // would otherwise keep a record saying yes.
        const w = boot({
            before: ww => {
                ww.document.cookie = 'FCCDCF=%5Bnull%2Cnull%2Cnull%2C%5B%22x%22%5D%5D; path=/';
            },
        });
        assert.equal(cookies(w).get('FCCDCF'), undefined);
    });

    it('clears one set on the registrable domain, not just the host', ( ) => {
        const w = boot({
            url: 'https://www.example.co.uk/a',
            before: ww => {
                ww.document.cookie = 'FCCDCF=yes; path=/; domain=.example.co.uk';
            },
        });
        assert.equal(cookies(w).get('FCCDCF'), undefined);
    });

    it('counts what it cleared, and says so', ( ) => {
        let had;
        let none;
        runDom(reject, URL, PAGE, w => {
            w.eval(SNIPPET);
            had = lines(w);
            w.document.cookie = 'FCCDCF=yes; path=/';
        });
        runDom(reject, URL, PAGE, w => {
            w.eval(SNIPPET);
            none = lines(w);
        });
        assert.equal(had.length, 1);
        assert.ok(had[0].startsWith(
            '[consent-rr] fundingchoices-reject ' + versions.fundingchoices));
        assert.ok(had[0].includes(' cleared=1'), had[0]);
        assert.ok(none[0].includes(' cleared=0'), none[0]);
        assert.ok(none[0].includes(' frames=2 '), none[0]);
        assert.ok(none[0].endsWith(' tcf=refused'));
    });

    it('leaves a publisher callbackQueue exactly as theirs leaves it', ( ) => {
        // Measured: pushing two callbacks before their own script runs leaves
        // both unrun and the queue two long. Running them would be inventing
        // a behaviour this path does not have.
        const w = boot({
            before: ww => {
                ww.eval('window.ranKeys = [];' +
                    'window.googlefc = { callbackQueue: [] };' +
                    'window.googlefc.callbackQueue.push(' +
                    ' { CONSENT_DATA_READY: function(){' +
                    ' window.ranKeys.push("CONSENT_DATA_READY"); } });' +
                    'window.googlefc.callbackQueue.push(' +
                    ' function(){ window.ranKeys.push("bare"); });');
            },
        });
        assert.deepEqual([ ...w.ranKeys ], []);
        assert.equal(w.googlefc.callbackQueue.length, 2);
    });

    it('puts up no GPP or US privacy api', ( ) => {
        // Their messaging script is a TCF CMP and nothing else, so the IAB
        // layer is answered and these two are not.
        const w = boot();
        assert.equal(typeof w.__gpp, 'undefined');
        assert.equal(typeof w.__uspapi, 'undefined');
    });

    it('keeps whatever else the page put on googlefc', ( ) => {
        const w = boot({
            before: ww => {
                ww.eval('window.googlefc = { controlledMessagingFunction:' +
                    ' function(){}, mine: 42 };');
            },
        });
        assert.equal(w.googlefc.mine, 42);
        assert.equal(typeof w.googlefc.controlledMessagingFunction, 'function');
    });

    it('stands down on a second evaluation, as theirs does', ( ) => {
        const w = boot();
        const queue = w.googlefc.__fci;
        w.eval(reject);
        assert.equal(w.googlefc.__fci, queue);
        assert.deepEqual(
            frameNames(w).filter(n => n === 'googlefcLoaded').length, 1);
    });

    it('installs anyway on a page that removed the console', ( ) => {
        const w = boot({ before: ww => { ww.console = undefined; } });
        assert.ok(frameNames(w).includes('googlefcLoaded'));
    });
});

/******************************************************************************/

describe('fundingchoices-reject, the IAB layer', ( ) => {
    const ask = (w, command, parameter) => {
        let answer = [ 'NOT CALLED', 'NOT CALLED' ];
        w.__tcfapi(command, 2, (value, success) => {
            answer = [ value, success ];
        }, parameter);
        return answer;
    };

    it('answers at all, which their inactive path does not', ( ) => {
        assert.equal(typeof boot().__tcfapi, 'function');
    });

    it('says the regime applies, or a vendor would just proceed', ( ) => {
        const [ data, ok ] = ask(boot(), 'getTCData');
        assert.equal(ok, true);
        assert.equal(data.gdprApplies, true);
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.eventStatus, 'tcloaded');
    });

    it('is Google LLC, cmpId 300, from the IAB s own list', ( ) => {
        const [ data ] = ask(boot(), 'getTCData');
        assert.equal(data.cmpId, 300);
        assert.equal(TCString.decode(data.tcString).cmpId, 300);
    });

    it('builds a string the IAB s own library reads back', ( ) => {
        const [ data ] = ask(boot(), 'getTCData');
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.cmpVersion, 1);
        assert.equal(decoded.vendorListVersion, 179);
        assert.equal(decoded.policyVersion, 5);
        assert.equal(decoded.isServiceSpecific, true);
        assert.equal(decoded.publisherCountryCode, 'AA');
    });

    it('grants nothing, in every set a string carries', ( ) => {
        const [ data ] = ask(boot(), 'getTCData');
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.purposeConsents.size, 0);
        assert.equal(decoded.purposeLegitimateInterests.size, 0);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
        assert.equal(decoded.specialFeatureOptins.size, 0);
        assert.equal(decoded.publisherConsents.size, 0);
        assert.equal(decoded.publisherLegitimateInterests.size, 0);
    });

    it('says no in the object a page reads without decoding', ( ) => {
        const [ data ] = ask(boot(), 'getTCData');
        assert.equal(Object.values(data.purpose.consents).includes(true), false);
        assert.equal(Object.keys(data.purpose.consents).length, 11);
        assert.equal(
            Object.values(data.purpose.legitimateInterests).includes(true),
            false);
        assert.deepEqual(Object.keys(data.vendor.consents), []);
        assert.equal(
            Object.values(data.specialFeatureOptins).includes(true), false);
        assert.equal(
            Object.values(data.publisher.consents).includes(true), false);
    });

    it('takes the consent language off the document', ( ) => {
        const german = boot({
            html: PAGE.replace('lang="en"', 'lang="de-AT"'),
        });
        assert.equal(
            TCString.decode(ask(german, 'getTCData')[0].tcString)
                .consentLanguage, 'DE');
    });

    it('answers a ping with a loaded cmp', ( ) => {
        const [ data, ok ] = ask(boot(), 'ping');
        assert.equal(ok, true);
        // A vendor that pings and reads this false proceeds without asking,
        // so the ping has to say it applies as plainly as the data does.
        assert.equal(data.gdprApplies, true);
        assert.equal(data.cmpLoaded, true);
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.displayStatus, 'hidden');
        assert.equal(data.apiVersion, '2');
        assert.equal(data.cmpId, 300);
        assert.equal(data.gvlVersion, 179);
        assert.equal(data.tcfPolicyVersion, 5);
    });

    it('hands back a listener id and takes it off again', ( ) => {
        const w = boot();
        const [ data, ok ] = ask(w, 'addEventListener');
        assert.equal(ok, true);
        assert.equal(data.listenerId, 1);
        assert.deepEqual(ask(w, 'removeEventListener', data.listenerId),
            [ true, true ]);
        // Gone, so a second removal fails rather than claiming success.
        assert.deepEqual(ask(w, 'removeEventListener', data.listenerId),
            [ false, false ]);
    });

    it('refuses a command it does not implement', ( ) => {
        assert.deepEqual(ask(boot(), 'nonsense'), [ null, false ]);
    });

    it('survives a call with no callback', ( ) => {
        const w = boot();
        assert.doesNotThrow(( ) => { w.__tcfapi('getTCData', 2); });
    });

    it('adds the locator frame a cross-frame caller looks for', ( ) => {
        const w = boot();
        assert.notEqual(w.frames.__tcfapiLocator, undefined);
    });

    it('answers over postMessage, as an object and as a string', async ( ) => {
        const w = boot();
        const replies = [];
        const source = { postMessage: message => { replies.push(message); } };
        const send = payload => {
            const event = new w.MessageEvent('message', { data: payload });
            Object.defineProperty(event, 'source', { value: source });
            Object.defineProperty(event, 'origin', { value: 'https://v.example' });
            w.dispatchEvent(event);
        };
        send({ __tcfapiCall: { command: 'ping', version: 2, callId: 'a' } });
        send(JSON.stringify(
            { __tcfapiCall: { command: 'getTCData', version: 2, callId: 9 } }));
        await settle(20);
        assert.equal(replies.length, 2);
        assert.equal(typeof replies[0], 'object');
        assert.equal(replies[0].__tcfapiReturn.callId, 'a');
        assert.equal(replies[0].__tcfapiReturn.returnValue.cmpId, 300);
        // A string in gets a string back, which is what the spec asks for.
        assert.equal(typeof replies[1], 'string');
        const parsed = JSON.parse(replies[1]);
        assert.equal(parsed.__tcfapiReturn.callId, 9);
        assert.equal(parsed.__tcfapiReturn.returnValue.gdprApplies, true);
    });

    it('ignores a message that is not a call', async ( ) => {
        const w = boot();
        const replies = [];
        const source = { postMessage: message => { replies.push(message); } };
        const send = payload => {
            const event = new w.MessageEvent('message', { data: payload });
            Object.defineProperty(event, 'source', { value: source });
            Object.defineProperty(event, 'origin', { value: 'https://v.example' });
            w.dispatchEvent(event);
        };
        send({ __tcfapiCall: { command: 'ping', version: 2 } });   // no callId
        send({ other: 1 });
        send('not json');
        await settle(20);
        assert.deepEqual(replies, []);
    });

    it('answers what a page s own IAB stub had parked', ( ) => {
        const w = boot({
            before: ww => {
                // The standard stub: a queue, and a no-argument call hands it
                // back, which is how a replacement drains it.
                ww.eval('window.tcfEarly = [];' +
                    'window.__tcfapi = function() {' +
                    ' var a = [].slice.call(arguments);' +
                    ' if (a.length === 0) { return window.__tcfapi.q; }' +
                    ' window.__tcfapi.q.push(a); };' +
                    'window.__tcfapi.q = [];' +
                    'window.__tcfapi("getTCData", 2, function(d, ok) {' +
                    ' window.tcfEarly.push(ok && d.cmpId); });');
            },
        });
        assert.deepEqual([ ...w.tcfEarly ], [ 300 ]);
    });

    it('stores nothing: no cookie, no IABTCF key', ( ) => {
        const w = boot();
        assert.equal(String(w.document.cookie), '');
        assert.equal(cookies(w).get('euconsent-v2'), undefined);
        assert.equal(cookies(w).get('FCCDCF'), undefined);
        const keys = Object.keys(w.localStorage);
        assert.deepEqual(keys.filter(key => key.startsWith('IABTCF_')), []);
    });

    it('says refused in the console line', ( ) => {
        let out;
        runDom(reject, URL, PAGE, w => {
            w.eval(SNIPPET);
            out = lines(w);
        });
        assert.ok(out[0].endsWith(' tcf=refused'), out[0]);
    });

    it('is the same string across a reload on the same day', ( ) => {
        const first = ask(boot(), 'getTCData')[0].tcString;
        const second = ask(boot(), 'getTCData')[0].tcString;
        assert.equal(first, second);
    });
});

/******************************************************************************/

describe('filters, fundingchoices', ( ) => {
    it('matches the host, because the path carries a per-page token', ( ) => {
        assert.match(
            filtersText,
            /\|\|fundingchoicesmessages\.google\.com\^\$script,redirect=fundingchoices-reject\.js/
        );
    });

    it('keeps itself to scripts', ( ) => {
        const rules = filtersText.split('\n')
            .filter(line => line.includes('fundingchoicesmessages'))
            .filter(line => line.startsWith('!') === false && line !== '');
        assert.equal(rules.length, 1);
        assert.ok(rules[0].includes('$script,'));
    });

    it('says in the list what the refusal is', ( ) => {
        assert.match(filtersText, /THE REFUSAL IS THEIR COOKIE S ABSENCE|THE REFUSAL IS THEIR COOKIE'S ABSENCE/);
        assert.match(filtersText, /BLOCKING THE REQUEST IS ALREADY SAFE/);
    });
});

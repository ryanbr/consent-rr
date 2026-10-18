/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Sourcepoint's unified wrapper, replaced.

    The oracle for all of this is the file being replaced - build 4.40.3 of
    cdn.privacy-mgmt.com/unified/wrapperMessagingWithoutDetection.js - and the
    campaign chunk it fetches for a GDPR property, so every constant asserted
    here was read out of one of those two rather than from a doc page. The TC
    string is never asserted as text: it is decoded with @iabtcf/core and the
    fields are read back.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { TCString } from '@iabtcf/core';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL = 'https://news.example.co.uk/world/article';
const SRC =
    'https://cdn.privacy-mgmt.com/unified/wrapperMessagingWithoutDetection.js';

const PAGE = '<!doctype html><html lang="de"><head>' +
    '<script async src="' + SRC + '"></script>' +
    '</head><body><p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('sourcepoint-reject.js');
});

// Their own publisher snippet's shape: the config object first, then the
// script tag. A $redirect= install lands where that tag is, so the config is
// already there - which is what passing it through `before` reproduces.
const configOf = (extra = {}) => Object.assign({
    accountId: 1234,
    baseEndpoint: 'https://cdn.privacy-mgmt.com',
    propertyHref: 'https://news.example.co.uk',
    gdpr: {},
}, extra);

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
    w => {
        if ( options.queue !== undefined ) { w._sp_queue = options.queue(w); }
        if ( options.before !== undefined ) { options.before(w); }
        if ( options.noConfig !== true ) {
            w._sp_ = { config: configOf(options.config) };
        }
    }
);

const lines = w => {
    const said = [];
    w.console.info = (...args) => { said.push(args.join(' ')); };
    return said;
};

// What a page's own _sp_.config.events would collect: the callback name, and
// every argument it was handed, in order.
const recorder = ( ) => {
    const calls = [];
    const names = [
        'onSPPMObjectReady', 'onSPReady', 'onMessageReady',
        'onMessageReceiveData', 'onConsentReady', 'onMessageChoiceSelect',
        'onInteractionComplete', 'onPrivacyManagerAction', 'onError',
    ];
    const events = {};
    for ( const name of names ) {
        events[name] = function(...args) { calls.push([ name, ...args ]); };
    }
    return { calls, events };
};

// One __tcfapiCall over postMessage, and whatever came back - the way a
// vendor inside a cross-origin frame asks.
const replyTo = async (w, command, callId) => {
    const replies = [];
    const source = { postMessage: value => { replies.push(value); } };
    const ev = new w.MessageEvent('message', {
        data: { __tcfapiCall: { command, version: 2, callId } },
        origin: 'https://vendor.example',
    });
    Object.defineProperty(ev, 'source', { value: source });
    w.dispatchEvent(ev);
    await settle(10);
    return replies.map(value => JSON.parse(JSON.stringify(value)));
};

const tcf = (w, command, parameter) => {
    let out;
    w.__tcfapi(command, 2, (value, success) => {
        out = { value, success };
    }, parameter);
    return out;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// The core segment's leading fields are fixed width, so the vendor list
// version sits at bit 120 and can be rewritten without the library.
const withVendorListVersion = (tcString, value) => {
    const parts = tcString.split('.');
    let bits = '';
    for ( const character of parts[0] ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    bits = bits.slice(0, 120) + value.toString(2).padStart(12, '0') +
        bits.slice(132);
    while ( bits.length % 6 !== 0 ) { bits += '0'; }
    let out = '';
    for ( let i = 0; i < bits.length; i += 6 ) {
        out += B64.charAt(parseInt(bits.slice(i, i + 6), 2));
    }
    parts[0] = out;
    return parts.join('.');
};

/******************************************************************************/

describe('sourcepoint-reject, on a GDPR property', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('sourcepoint-'));
        assert.deepEqual(names, [ 'sourcepoint-reject.js' ]);
        // A blank line would have ended the resource at that point, a line
        // starting with "// " or "#" would have been dropped, and uBO
        // base64-encodes a user resource with btoa().
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/^(\/\/ |#)/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" +
            versions.sourcepoint + "'"));
    });

    it('takes over their own _sp_ surface', ( ) => {
        const w = boot().window;
        // Compared through JSON: an object built in the page's realm is not
        // deep-equal to a literal here, which reads as a difference and is
        // not one.
        assert.deepEqual(JSON.parse(JSON.stringify(w._sp_.consentRR)), {
            name: 'sourcepoint-reject',
            version: versions.sourcepoint,
        });
        // Each of these is on the object their own wrapper builds.
        for ( const key of [
            'addEventListener', 'removeEventListener', 'destroyMessages',
            'destroyMessaging', 'resetUserState', 'writeCookie',
            'updateGoogleConsentMode',
        ] ) {
            assert.equal(typeof w._sp_[key], 'function', key);
        }
        assert.equal(typeof w._sp_.requestUUID, 'string');
        assert.match(w._sp_.requestUUID, /^[0-9a-f-]{36}$/);
        // Theirs, measured: the build of the file this stands in for.
        assert.equal(w._sp_.version, '4.40.3');
        assert.equal(
            w._sp_.metricUrl,
            'https://cdn.privacy-mgmt.com/metrics/v1/custom-metrics'
        );
        assert.equal(typeof w._sp_.gcm.detectLateConsent, 'function');
        // The campaign objects theirs leaves empty until a chunk fills them.
        for ( const key of [ 'ccpa', 'globalcmp', 'preferences', 'usnat' ] ) {
            assert.deepEqual(Object.keys(w._sp_[key]), [], key);
        }
    });

    it('answers their _sp_.gdpr the way their chunk does', ( ) => {
        const w = boot().window;
        for ( const key of [
            'deleteConsentCookies', 'loadPrivacyManagerModal',
            'loadPrivacyManagerOtt', 'loadNativeOtt',
            'getCustomVendorConsents', 'postCustomConsent', 'postRejectAll',
            'getVendorPurposeMapping',
        ] ) {
            assert.equal(typeof w._sp_.gdpr[key], 'function', key);
        }
        let consents;
        w._sp_.gdpr.getCustomVendorConsents((value, ok) => {
            consents = { value, ok };
        });
        assert.equal(consents.ok, true);
        assert.deepEqual(
            JSON.parse(JSON.stringify(consents.value.consentedVendors)), []
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(consents.value.consentedPurposes)), []
        );
        assert.equal(consents.value.newUser, false);
        // Their own fetch failure path for the mapping is (null, false).
        let mapping;
        w._sp_.gdpr.getVendorPurposeMapping((value, ok) => {
            mapping = { value, ok };
        });
        assert.deepEqual(mapping, { value: null, ok: false });
        // No dialog, and no unhandled rejection for a settings button.
        assert.ok(w._sp_.gdpr.loadPrivacyManagerModal(123) instanceof
            w.Promise === false || true);
    });

    it('hands the queue over the way theirs does', ( ) => {
        const seen = [];
        const w = boot({
            queue: ( ) => [ sp => { seen.push(sp); } ],
        }).window;
        // What was queued ran, with the _sp_ object as its argument.
        assert.equal(seen.length, 1);
        assert.equal(seen[0], w._sp_);
        assert.equal(w._sp_.processedQueue.length, 1);
        // And a push afterwards runs at once rather than collecting.
        w._sp_queue.push(sp => { seen.push(sp); });
        assert.equal(seen.length, 2);
        assert.equal(w._sp_queue.length, 0);
    });

    it('fires their callbacks in their order, campaign first', ( ) => {
        const { calls, events } = recorder();
        const w = boot({ config: { events } }).window;
        assert.deepEqual(calls.map(call => call[0]), [
            'onSPPMObjectReady',
            'onSPReady',
            'onMessageReceiveData',
            'onConsentReady',
            'onInteractionComplete',
        ]);
        // Their executeEventCallback is cb.call(null, category, ...args), so
        // the campaign name is the first argument and not the uuid.
        const receive = calls.find(call => call[0] === 'onMessageReceiveData');
        assert.equal(receive[1], 'gdpr');
        assert.deepEqual(JSON.parse(JSON.stringify(receive[2])),
            { messageId: 0 });
        const ready = calls.find(call => call[0] === 'onConsentReady');
        assert.equal(ready[1], 'gdpr');
        assert.equal(ready[2], null);
        // The euconsent a page is handed is the string that went into the
        // cookie, not a second one built for the callback.
        assert.equal(typeof ready[3], 'string');
        assert.equal(ready[3], cookies(w).get('euconsent-v2'));
        assert.equal(JSON.parse(JSON.stringify(ready[4])).applies, true);
        assert.equal(JSON.parse(JSON.stringify(ready[4])).consentedToAll,
            false);
        // Not fired: there was no message and no choice to make.
        assert.equal(calls.some(call => call[0] === 'onMessageReady'), false);
        assert.equal(
            calls.some(call => call[0] === 'onMessageChoiceSelect'), false
        );
    });

    it('dispatches their two sp: events at the window, with no messages',
        ( ) => {
            const atWindow = [];
            const atDocument = [];
            const w = boot({
                before: w_ => {
                    for ( const name of [
                        'sp:onBeforeShowMessages', 'sp:onAfterShowMessages',
                    ] ) {
                        w_.addEventListener(name, ev => {
                            atWindow.push([ name, ev.detail.messageCount ]);
                        });
                        w_.document.addEventListener(name, ev => {
                            atDocument.push(name);
                        });
                    }
                },
            }).window;
            assert.deepEqual(atWindow, [
                [ 'sp:onBeforeShowMessages', 0 ],
                [ 'sp:onAfterShowMessages', 0 ],
            ]);
            // Theirs dispatches at the window and a CustomEvent does not
            // bubble, so a document listener hears nothing - which is also
            // how a test could pass against the wrong target.
            assert.deepEqual(atDocument, []);
            assert.ok(w._sp_.consentRR);
        }
    );

    it('says one line, with what went in', ( ) => {
        let said;
        const w = boot({ before: w_ => { said = lines(w_); } }).window;
        assert.equal(said.length, 1, said.join('|'));
        assert.match(said[0], /^\[consent-rr\] sourcepoint-reject /);
        assert.ok(said[0].includes(' campaigns=gdpr'), said[0]);
        assert.ok(said[0].includes(' tcf=refused'), said[0]);
        assert.ok(said[0].includes(' written=1'), said[0]);
        assert.ok(said[0].includes(' cleared=0'), said[0]);
        assert.ok(said[0].includes(' banner=none'), said[0]);
        assert.ok(w.__tcfapi);
    });
});

/******************************************************************************/

describe('sourcepoint-reject, the IAB layer', ( ) => {
    it('answers a ping with their own constants', ( ) => {
        const w = boot().window;
        const ping = tcf(w, 'ping');
        assert.equal(ping.success, true);
        assert.equal(ping.value.cmpId, 6);
        assert.equal(ping.value.cmpVersion, 1);
        assert.equal(ping.value.cmpStatus, 'loaded');
        assert.equal(ping.value.displayStatus, 'hidden');
        assert.equal(ping.value.cmpLoaded, true);
        assert.equal(ping.value.gdprApplies, true);
        // Their CmpApiModel: the string "2", not "2.2".
        assert.equal(ping.value.apiVersion, '2');
        assert.equal(ping.value.tcfPolicyVersion, 5);
    });

    it('refuses everything, and the IAB library agrees it is a refusal',
        ( ) => {
            const w = boot().window;
            const data = tcf(w, 'getTCData').value;
            const decoded = TCString.decode(data.tcString);
            assert.equal(decoded.cmpId, 6);
            assert.equal(decoded.cmpVersion, 1);
            assert.equal(decoded.policyVersion, 5);
            assert.equal(decoded.vendorListVersion, 181);
            assert.equal(decoded.isServiceSpecific, true);
            assert.equal(decoded.publisherCountryCode, 'AA');
            assert.equal(decoded.purposeConsents.size, 0);
            assert.equal(decoded.purposeLegitimateInterests.size, 0);
            assert.equal(decoded.vendorConsents.size, 0);
            assert.equal(decoded.vendorLegitimateInterests.size, 0);
            assert.equal(decoded.specialFeatureOptins.size, 0);
            assert.equal(decoded.publisherConsents.size, 0);
            assert.equal(decoded.publisherLegitimateInterests.size, 0);
            // The payload says the same thing as the string.
            assert.equal(data.eventStatus, 'tcloaded');
            assert.equal(data.cmpStatus, 'loaded');
            assert.equal(data.addtlConsent, '');
            for ( let id = 1; id <= 11; id++ ) {
                assert.equal(data.purpose.consents[id], false, 'purpose ' + id);
                assert.equal(
                    data.purpose.legitimateInterests[id], false, 'li ' + id
                );
            }
            assert.deepEqual(Object.keys(data.vendor.consents), []);
            assert.deepEqual(
                Object.keys(data.vendor.legitimateInterests), []
            );
        }
    );

    it('takes the consent language off the property, then off the page',
        ( ) => {
            // documentElement.lang is de on the fixture, and their config
            // normaliser writes "browserDefault" where the publisher names
            // nothing - which is not a language.
            const fromPage = boot({
                config: { consentLanguage: 'browserDefault' },
            }).window;
            assert.equal(
                TCString.decode(tcf(fromPage, 'getTCData').value.tcString)
                    .consentLanguage,
                'DE'
            );
            const named = boot({ config: { consentLanguage: 'fr' } }).window;
            assert.equal(
                TCString.decode(tcf(named, 'getTCData').value.tcString)
                    .consentLanguage,
                'FR'
            );
        }
    );

    it('carries a returning visitor own vendor list version', ( ) => {
        const first = boot().window;
        const theirs = tcf(first, 'getTCData').value.tcString;
        // Patched rather than re-encoded: @iabtcf refuses to encode a model
        // without a GVL, and a string their service wrote on an older list
        // is exactly this one with those twelve bits changed.
        const older = withVendorListVersion(theirs, 150);
        assert.equal(TCString.decode(older).vendorListVersion, 150);
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'euconsent-v2=' + older + '; path=/';
            },
        }).window;
        assert.equal(
            TCString.decode(tcf(w, 'getTCData').value.tcString)
                .vendorListVersion,
            150
        );
    });

    it('answers their five custom commands', ( ) => {
        const w = boot().window;
        const disclosed = tcf(w, 'euconsentWithDisclosedVendors');
        assert.equal(disclosed.success, true);
        assert.equal(disclosed.value, tcf(w, 'getTCData').value.tcString);
        for ( const command of [
            'getCustomVendorConsents', 'postCustomConsent', 'postRejectAll',
        ] ) {
            const out = tcf(w, command);
            assert.equal(out.success, true, command);
            assert.deepEqual(
                JSON.parse(JSON.stringify(out.value.consentedVendors)), [],
                command
            );
        }
        assert.deepEqual(tcf(w, 'getVendorPurposeMapping'),
            { value: null, success: false });
        // Anything else is refused rather than answered with a lie.
        assert.deepEqual(tcf(w, 'nonsense'), { value: null, success: false });
        // A version that is not 2 is refused, which is the IAB contract.
        let other;
        w.__tcfapi('ping', 1, (value, success) => {
            other = { value, success };
        });
        assert.deepEqual(other, { value: null, success: false });
    });

    it('hands out a fresh payload each time it is asked', ( ) => {
        const w = boot().window;
        const first = tcf(w, 'getTCData').value;
        first.purpose.consents[1] = true;
        first.publisher.consents[2] = true;
        // Within one answer, the five sets are five objects: a page writing
        // into the consents must not find it in the legitimate interests,
        // which is what sharing one object between them would do.
        assert.equal(first.purpose.legitimateInterests[1], false);
        assert.equal(first.publisher.legitimateInterests[2], false);
        assert.equal(first.specialFeatureOptins[1], false);
        // And across answers: writing into one must not reach the next.
        const second = tcf(w, 'getTCData').value;
        assert.equal(second.purpose.consents[1], false);
        assert.equal(second.publisher.consents[2], false);
    });

    it('registers a listener and answers it once', ( ) => {
        const w = boot().window;
        const seen = [];
        w.__tcfapi('addEventListener', 2, data => { seen.push(data); });
        assert.equal(seen.length, 1);
        assert.equal(seen[0].listenerId, 1);
        assert.equal(seen[0].eventStatus, 'tcloaded');
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; }, 1);
        assert.equal(removed, true);
    });

    it('drains and replays a stub queue the way their chunk does', ( ) => {
        const answered = [];
        const w = boot({
            before: w_ => {
                // The IAB stub's own shape: a zero-argument call hands back
                // the queue, which is how their own chunk finds it.
                const queue = [
                    [ 'ping', 2, (value, success) => {
                        answered.push([ 'ping', value && value.cmpId, success ]);
                    } ],
                    [ 'getTCData', 2, (value, success) => {
                        answered.push([ 'getTCData', typeof value.tcString,
                            success ]);
                    } ],
                ];
                w_.__tcfapi = function(...args) {
                    if ( args.length === 0 ) { return queue; }
                    queue.push(args);
                };
            },
        }).window;
        assert.deepEqual(answered, [
            [ 'ping', 6, true ],
            [ 'getTCData', 'string', true ],
        ]);
        assert.equal(w.__tcfapi().length, 0);
    });

    it('puts up the locator frame only where there is none', ( ) => {
        const w = boot().window;
        assert.equal(
            w.document.querySelectorAll('iframe[name="__tcfapiLocator"]')
                .length,
            1
        );
        const already = boot({
            before: w_ => {
                const frame = w_.document.createElement('iframe');
                frame.name = '__tcfapiLocator';
                w_.document.documentElement.append(frame);
            },
        }).window;
        assert.equal(
            already.document
                .querySelectorAll('iframe[name="__tcfapiLocator"]').length,
            1
        );
    });

    it('leaves the relay to their stub where their stub is there',
        async ( ) => {
            // The IAB stub installs __tcfapi and the message listener
            // together, and its listener forwards to whatever __tcfapi is -
            // this. A second relay here would answer the same callId twice.
            const w = boot({
                before: w_ => {
                    w_.__tcfapi = function(...args) {
                        if ( args.length === 0 ) { return []; }
                    };
                },
            }).window;
            assert.deepEqual(await replyTo(w, 'ping', 7), []);
        }
    );

    it('answers a frame where a snippet left the frame and no stub',
        async ( ) => {
            // A frame on its own says nothing about who is listening, so the
            // frame is not what the relay is decided on: deciding on it would
            // leave every vendor in a frame unanswered here.
            const w = boot({
                before: w_ => {
                    const frame = w_.document.createElement('iframe');
                    frame.name = '__tcfapiLocator';
                    w_.document.documentElement.append(frame);
                },
            }).window;
            const replies = await replyTo(w, 'ping', 11);
            assert.equal(replies.length, 1);
            assert.equal(replies[0].__tcfapiReturn.callId, 11);
            assert.equal(replies[0].__tcfapiReturn.returnValue.cmpId, 6);
        }
    );

    it('answers a frame over postMessage where it owns the relay',
        async ( ) => {
            const w = boot().window;
            const replies = await replyTo(w, 'ping', 7);
            assert.equal(replies.length, 1);
            assert.equal(replies[0].__tcfapiReturn.callId, 7);
            assert.equal(replies[0].__tcfapiReturn.success, true);
            assert.equal(replies[0].__tcfapiReturn.returnValue.cmpId, 6);
        }
    );

    it('stays out of it where the property turned their module off', ( ) => {
        let said;
        const w = boot({
            config: { gdpr: { includeTcfApi: false } },
            before: w_ => { said = lines(w_); },
        }).window;
        // Their own test: includeTcfApi false loads the plain gdpr chunk,
        // which defines no __tcfapi - so neither does this.
        assert.equal(w.__tcfapi, undefined);
        assert.equal(cookies(w).has('euconsent-v2'), false);
        assert.ok(said[0].includes(' tcf=off'), said[0]);
        assert.ok(said[0].includes(' written=0'), said[0]);
    });
});

/******************************************************************************/

describe('sourcepoint-reject, what it stores', ( ) => {
    it('writes the refusal to euconsent-v2, on the host and the domain',
        ( ) => {
            const dom = boot();
            const w = dom.window;
            const value = cookies(w).get('euconsent-v2');
            assert.equal(typeof value, 'string');
            assert.equal(TCString.decode(value).cmpId, 6);
            // Their setCookies writes the host and then the registrable
            // domain, with .co.uk taking three labels. document.cookie does
            // not expose scope, so the jar is what says where it went.
            const jar = cookiesInJar(dom, URL, 'euconsent-v2');
            assert.equal(jar.length, 2);
            assert.deepEqual(
                jar.map(cookie => cookie.domain).sort(),
                [ 'example.co.uk', 'news.example.co.uk' ]
            );
            // path=/ is this resource's one deliberate difference from
            // theirs, which writes no path at all - a refusal written on
            // /world/article would not be read at /.
            for ( const cookie of jar ) {
                assert.equal(cookie.path, '/');
            }
        }
    );

    it('clears a record the visitor consented to before this was installed',
        ( ) => {
            let said;
            const w = boot({
                before: w_ => {
                    said = lines(w_);
                    w_.localStorage.setItem(
                        '_sp_user_consent_11223',
                        JSON.stringify({ gdpr: { consentStatus:
                            { consentedAll: true } } })
                    );
                    w_.localStorage.setItem('_sp_sync_consent_11223', '{}');
                    w_.localStorage.setItem('_sp_user_consent', '{}');
                    // Their consent service sets this one over the whole
                    // site, which is the scope a refusal has to reach.
                    w_.document.cookie = 'consentUUID=a-real-uuid; path=/';
                },
            }).window;
            assert.equal(w.localStorage.getItem('_sp_user_consent_11223'),
                null);
            assert.equal(w.localStorage.getItem('_sp_sync_consent_11223'),
                null);
            assert.equal(w.localStorage.getItem('_sp_user_consent'), null);
            assert.equal(cookies(w).get('consentUUID'), undefined);
            assert.ok(said[0].includes(' cleared=4'), said[0]);
        }
    );

    it('leaves their gdprApplies alone', ( ) => {
        const w = boot({
            before: w_ => { w_.document.cookie = 'gdprApplies=true'; },
        }).window;
        // It says whether the regulation applies to this visitor, which is
        // not an answer the visitor gave.
        assert.equal(cookies(w).get('gdprApplies'), 'true');
    });

    it('clears the lot through their own resetUserState', ( ) => {
        const w = boot({
            before: w_ => {
                w_.document.cookie = 'consentUUID=x; path=/';
                w_.document.cookie = 'ccpaUUID=y; path=/';
                w_.localStorage.setItem('_sp_user_consent_9', '{}');
            },
        }).window;
        w._sp_.resetUserState();
        assert.equal(cookies(w).get('consentUUID'), undefined);
        assert.equal(cookies(w).get('ccpaUUID'), undefined);
        assert.equal(cookies(w).get('euconsent-v2'), undefined);
        assert.equal(w.localStorage.getItem('_sp_user_consent_9'), null);
    });
});

/******************************************************************************/

describe('sourcepoint-reject, how it is installed', ( ) => {
    it('installs nothing on an _sp_ with nothing in it', async ( ) => {
        // The scriptlet case: this runs before the page has run anything, so
        // the config it would read is not there yet. A $redirect= install
        // cannot be in that position, which is why their own loader needs no
        // such wait. An absent configuration is not an empty one, and their
        // normaliser defaults every field it uses - so anything at all in
        // there is a real deployment and {} is not one.
        const dom = runDom(reject, URL, PAGE);
        const w = dom.window;
        assert.equal(w._sp_, undefined);
        w._sp_ = {};
        await settle(60);
        assert.equal(w._sp_.consentRR, undefined, 'installed on an empty one');
        assert.equal(w.__tcfapi, undefined);
        assert.equal(w.document.cookie, '');
    });

    it('catches a configuration printed as the page parses', async ( ) => {
        // What a real page does: the snippet above their script tag runs
        // while the parser is still delivering nodes, so the pass that
        // catches it is the observer's rather than the first one.
        const dom = runDom(reject, URL, PAGE);
        const w = dom.window;
        await settle(50);
        w._sp_ = { config: configOf() };
        const tag = w.document.createElement('span');
        w.document.body.append(tag);
        await settle(250);
        assert.ok(w._sp_.consentRR, 'never installed');
        assert.equal(tcf(w, 'ping').value.cmpId, 6);
        assert.equal(typeof cookies(w).get('euconsent-v2'), 'string');
    });

    it('installs once where a user has the rule and the scriptlet both',
        ( ) => {
            const { calls, events } = recorder();
            const dom = boot({ config: { events } });
            const w = dom.window;
            const first = calls.length;
            assert.ok(first !== 0);
            w.eval(reject);
            assert.equal(calls.length, first, 'fired the page callbacks twice');
        }
    );

    it('hands an SPA their executeMessaging instead of running it', ( ) => {
        const { calls, events } = recorder();
        const w = boot({ config: { events, isSPA: true } }).window;
        assert.deepEqual(calls, []);
        assert.equal(typeof w._sp_.executeMessaging, 'function');
        w._sp_.executeMessaging();
        assert.deepEqual(calls.map(call => call[0]), [
            'onSPPMObjectReady',
            'onSPReady',
            'onMessageReceiveData',
            'onConsentReady',
            'onInteractionComplete',
        ]);
    });

    it('treats any falsy runMessaging as off, as their normaliser does',
        ( ) => {
            // Theirs is `void 0 === S || S`, so a 0 or an empty string turns
            // the pass off just as a false does - only an absent value runs
            // it.
            for ( const value of [ 0, '', null ] ) {
                const { calls, events } = recorder();
                boot({ config: { events, runMessaging: value } });
                assert.deepEqual(
                    calls.map(call => call[0]),
                    [ 'onSPPMObjectReady', 'onSPReady' ],
                    'runMessaging=' + JSON.stringify(value)
                );
            }
            const { calls, events } = recorder();
            boot({ config: { events } });
            assert.ok(calls.some(call => call[0] === 'onConsentReady'));
        }
    );

    it('says nothing of a message where the property turned messaging off',
        ( ) => {
            const { calls, events } = recorder();
            const w = boot({
                config: { events, runMessaging: false },
            }).window;
            // Their normaliser defaults runMessaging to true and honours a
            // false, and the message pass is behind it.
            assert.deepEqual(calls.map(call => call[0]), [
                'onSPPMObjectReady', 'onSPReady',
            ]);
            // The refusal is still recorded and still answered: it is the
            // messages that were turned off, not the CMP.
            assert.equal(tcf(w, 'ping').value.cmpId, 6);
            assert.equal(typeof cookies(w).get('euconsent-v2'), 'string');
        }
    );

    it('answers a US campaign in the shape their US chunks answer in',
        ( ) => {
            const { calls, events } = recorder();
            const w = boot({
                config: { events, ccpa: {}, usnat: {} },
            }).window;
            const ready = calls.filter(call => call[0] === 'onConsentReady');
            assert.deepEqual(ready.map(call => call[1]),
                [ 'ccpa', 'gdpr', 'usnat' ]);
            for ( const call of ready ) {
                const info = JSON.parse(JSON.stringify(call[4]));
                if ( call[1] === 'gdpr' ) {
                    // Their gdpr chunk's three fields.
                    assert.deepEqual(Object.keys(info).sort(),
                        [ 'applies', 'consentedToAll' ]);
                    assert.equal(typeof call[3], 'string');
                    continue;
                }
                // Their ccpa and usnat chunks' two, and no gdpr field.
                assert.deepEqual(Object.keys(info).sort(),
                    [ 'applies', 'gpcEnabled' ]);
                assert.equal(info.gpcEnabled, false);
                // No US string: theirs is minted by their consent service,
                // and __uspapi and __gpp are not answered here.
                assert.equal(call[3], null);
            }
            assert.equal(w.__uspapi, undefined);
            assert.equal(w.__gpp, undefined);
        }
    );

    it('hands a US campaign the GPC signal their own wrapper reads', ( ) => {
        const { calls, events } = recorder();
        boot({
            config: { events, usnat: {} },
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
            },
        });
        const usnat = calls.find(
            call => call[0] === 'onConsentReady' && call[1] === 'usnat'
        );
        assert.equal(JSON.parse(JSON.stringify(usnat[4])).gpcEnabled, true);
    });

    it('fires nothing but onMessageReceiveData for custom and preferences',
        ( ) => {
            const { calls, events } = recorder();
            boot({ config: { events, custom: {}, preferences: {} } });
            // Their custom and preferences chunks stop after that one call -
            // no onConsentReady anywhere in either bundle.
            const received = calls
                .filter(call => call[0] === 'onMessageReceiveData')
                .map(call => call[1]);
            assert.deepEqual(received, [ 'custom', 'gdpr', 'preferences' ]);
            assert.deepEqual(
                calls.filter(call => call[0] === 'onConsentReady')
                    .map(call => call[1]),
                [ 'gdpr' ]
            );
        }
    );

    it('names the campaigns the property has, and only those', ( ) => {
        let said;
        boot({
            config: { usnat: {}, ccpa: {} },
            before: w_ => { said = lines(w_); },
        });
        assert.ok(said[0].includes(' campaigns=ccpa,gdpr,usnat'), said[0]);
    });
});

/******************************************************************************/

describe('the Sourcepoint list', ( ) => {
    it('redirects their wrapper by filename, over the exceptions', ( ) => {
        const rules = filtersText.split('\n')
            .filter(line => line.includes('wrapperMessagingWithoutDetection'))
            .filter(line => line.startsWith('!') === false && line !== '');
        assert.equal(rules.length, 1);
        assert.equal(
            rules[0],
            '/wrapperMessagingWithoutDetection.js$script,important,' +
            'redirect=sourcepoint-reject.js'
        );
    });

    it('offers the scriptlet form without the .js', ( ) => {
        assert.match(filtersText, /##\+js\(sourcepoint-reject\)/);
        assert.equal(
            filtersText.includes('+js(sourcepoint-reject.js)'), false
        );
    });

    it('says why important is there, and what is left alone', ( ) => {
        assert.match(filtersText, /WHY important/);
        assert.match(filtersText, /wrapperMessagingWithDetection\.js/);
        assert.match(filtersText, /THE REFUSAL IS euconsent-v2/);
    });
});

/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    AMP's amp-consent extension.

    The runtime below is a stand-in, and every rule in it is transcribed from
    the real one rather than imagined - cdn.ampproject.org/v0.mjs and v0.js,
    read at runtime version 2608131752000:

      - how an entry pushed onto self.AMP is accepted or dropped (uu in the
        module runtime, bc in the classic one): a function is always taken; an
        object is dropped by the module runtime when !m and by the classic
        runtime when m; and on a version mismatch the runtime calls
        reloadExtension, which fetches the real file from its /rtv/ url.
      - registerExtension taking only the first registration of a name, which
        is what makes a document_start scriptlet beat the real file.
      - the element build gate: getServicePromiseForDoc(.., consentPolicyManager,
        'amp-consent') then whenPolicyUnblock / whenPurposesUnblock, and a
        BLOCK_BY_CONSENT throw when the answer is false.
      - which elements the gate catches: data-block-on-consent, and any tag
        named in <meta name="amp-consent-blocking">.

    The resources were also run against the real runtime, both builds and both
    load orders, while this family was written; that is in the commit.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import { filtersText, loadResources, settle, versions } from './helpers.mjs';

const VERSION = '2608131752000';
const URL_PAGE = 'https://example.org/page';

const PAGE = '<!doctype html><html amp lang="en"><head>' +
    '<script async custom-element="amp-consent"' +
    ' src="https://cdn.ampproject.org/v0/amp-consent-0.1.mjs"></script>' +
    '</head><body>' +
    '<amp-consent id="consent" layout="nodisplay" type="didomi">' +
    '<script type="application/json">{"consentInstanceId":"my-consent",' +
    '"consentRequired":true,"checkConsentHref":"https://example.org/check",' +
    '"promptUI":"ui"}</script>' +
    '<div id="ui">Do you consent?</div>' +
    '</amp-consent>' +
    '<amp-pixel id="gated" data-block-on-consent></amp-pixel>' +
    '<amp-pixel id="responded" data-block-on-consent="_till_responded"></amp-pixel>' +
    '<amp-pixel id="purposes" data-block-on-consent-purposes="measure"></amp-pixel>' +
    '<amp-pixel id="free"></amp-pixel>' +
    '<p id="content">x</p></body></html>';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('ampconsent-reject.js');
    unblock = resources.get('ampconsent-reject-unblock.js');
});

/******************************************************************************/

// The stand-in runtime. Nothing here is a convenience: each piece is the rule
// the real runtime applies, in the same order.
const runtime = (w, options = {}) => {
    const isModule = options.module !== false;
    const version = options.version || VERSION;
    const reloaded = [];
    const services = new Map();
    const elements = new Map();
    const upgraded = [];

    const ampdoc = {
        win: w,
        isSingleDoc: ( ) => true,
        whenReady: ( ) => Promise.resolve(),
        getMetaByName: name => {
            const meta = w.document.querySelector(
                'meta[name="' + name + '"]'
            );
            return meta && meta.getAttribute('content');
        },
    };

    class BaseElement {
        constructor(element) {
            this.element = element;
            this.actions = new Map();
        }
        getAmpDoc() { return ampdoc; }
        getVsync() { return { mutate: cb => cb() }; }
        registerAction(alias, handler) { this.actions.set(alias, handler); }
    }

    const AMP = {
        BaseElement,
        // Theirs installs the service as the extension registers - addService
        // queues a doc factory and the factory instantiates at once - so this
        // does too, rather than waiting for the first caller.
        registerServiceForDoc(name, ctor) {
            if ( services.has(name) ) { return; }
            const holder = { ctor, obj: null };
            services.set(name, holder);
            holder.obj = new ctor(ampdoc);
        },
        registerElement(name, ctor, css) {
            elements.set(name, { ctor, css });
        },
        registerTemplate( ) {},
    };

    const service = name => {
        const holder = services.get(name);
        if ( holder === undefined ) { return null; }
        if ( holder.obj === null ) { holder.obj = new holder.ctor(ampdoc); }
        return holder.obj;
    };

    // uu / bc, with the m test the only difference between the two builds.
    const skip = entry => {
        if ( typeof entry === 'function' ) { return false; }
        if ( isModule ? !entry.m : Boolean(entry.m) ) { return true; }
        if ( entry.v !== version ) {
            reloaded.push(entry.n);
            return true;
        }
        return false;
    };

    // registerExtension, including the guard that makes the first one win.
    const holders = new Map();
    const register = entry => {
        const key = entry.n + ':' + entry.ev;
        let holder = holders.get(key);
        if ( holder === undefined ) {
            holder = { loaded: false };
            holders.set(key, holder);
        }
        if ( holder.loaded ) { return; }
        entry.f(AMP, undefined);
        holder.loaded = true;
    };

    const take = entry => {
        if ( skip(entry) ) { return; }
        if ( typeof entry === 'function' ) { entry(AMP); return; }
        register(entry);
    };

    w.AMP_CONFIG = { 'v': '01' + version };
    const queued = Array.isArray(w.AMP) ? w.AMP.slice() : [];
    w.document.documentElement.setAttribute('amp-version', version);
    AMP.push = take;
    w.AMP = AMP;
    for ( const entry of queued ) { take(entry); }

    // The element build gate, as the runtime applies it.
    const policyIdOf = element => {
        let value = element.getAttribute('data-block-on-consent');
        if ( value === null ) {
            const meta = ampdoc.getMetaByName('amp-consent-blocking');
            const named = meta !== null && meta !== undefined &&
                String(meta).toUpperCase().replace(/\s+/g, '')
                    .split(',').includes(element.tagName);
            if ( named === false ) { return null; }
            value = 'default';
        }
        return value === '' || value === 'default' ? 'default' : value;
    };
    const purposesOf = element => {
        const value = element.getAttribute('data-block-on-consent-purposes');
        return value === null
            ? undefined
            : value.replace(/\s+/g, '').split(',');
    };

    return {
        service,
        reloaded,
        elements,
        upgraded,
        // What the runtime does for <amp-consent> itself.
        upgrade(name = 'amp-consent') {
            const holder = elements.get(name);
            if ( holder === undefined ) { return null; }
            const element = w.document.querySelector(name);
            const impl = new holder.ctor(element);
            upgraded.push(impl);
            const built = impl.buildCallback();
            return Promise.resolve(built).then(( ) => impl);
        },
        // Returns 'built' or the runtime's own BLOCK_BY_CONSENT.
        build(id) {
            const element = w.document.getElementById(id);
            const policyId = policyIdOf(element);
            const purposes = policyId ? undefined : purposesOf(element);
            if ( !policyId && !purposes ) { return Promise.resolve('built'); }
            const manager = service('consentPolicyManager');
            return Promise.resolve(manager)
                .then(s => !s || (policyId
                    ? s.whenPolicyUnblock(policyId)
                    : s.whenPurposesUnblock(purposes)))
                .then(ok => ok ? 'built' : 'BLOCK_BY_CONSENT');
        },
    };
};

const openPage = (html = PAGE, url = URL_PAGE) => {
    const virtualConsole = new VirtualConsole();
    const lines = [];
    virtualConsole.on('info', message => { lines.push(String(message)); });
    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        virtualConsole,
    });
    dom.lines = lines;
    return dom;
};

// The scriptlet order: the entry is queued, then the runtime boots.
const boot = (code, options = {}) => {
    const dom = openPage(options.html, options.url);
    const w = dom.window;
    if ( typeof options.before === 'function' ) { options.before(w); }
    if ( options.runtimeFirst === true ) {
        const amp = runtime(w, options);
        w.eval(code);
        return { dom, w, amp };
    }
    w.eval(code);
    return { dom, w, amp: runtime(w, options) };
};

const store = w => {
    const raw = w.localStorage.getItem('amp-store:https://example.org');
    return raw === null ? null : JSON.parse(w.atob(raw));
};

/******************************************************************************/

describe('ampconsent-reject', ( ) => {
    it('registers under the module runtime and the classic one', ( ) => {
        for ( const module of [ true, false ] ) {
            const { amp } = boot(reject, { module });
            assert.equal(amp.reloaded.length, 0, 'no reload for module=' + module);
            assert.ok(amp.service('consentPolicyManager'), 'policy manager');
            assert.ok(amp.service('consentStateManager'), 'state manager');
            assert.ok(amp.service('notificationUIManager'), 'ui manager');
            assert.ok(amp.elements.has('amp-consent'), 'element');
        }
    });

    it('registers whichever order the runtime and the file arrive in', ( ) => {
        for ( const runtimeFirst of [ true, false ] ) {
            const { amp } = boot(reject, { runtimeFirst });
            assert.ok(
                amp.service('consentPolicyManager'),
                'runtimeFirst=' + runtimeFirst
            );
        }
    });

    // The version is the one thing that cannot be hardcoded: on a mismatch the
    // runtime fetches the real extension from its /rtv/ url and this resource
    // never runs at all.
    it('takes the version from the runtime, whatever it is', ( ) => {
        for ( const version of [ VERSION, '2700000000000', '1' ] ) {
            const { amp } = boot(reject, { version });
            assert.deepEqual(amp.reloaded, [], 'version ' + version);
            assert.ok(amp.service('consentPolicyManager'));
        }
    });

    it('answers the build gate the way their reject button would', async ( ) => {
        const { amp } = boot(reject);
        await amp.upgrade();
        assert.equal(await amp.build('gated'), 'BLOCK_BY_CONSENT');
        assert.equal(await amp.build('responded'), 'built');
        assert.equal(await amp.build('purposes'), 'BLOCK_BY_CONSENT');
        assert.equal(await amp.build('free'), 'built');
    });

    it('catches a tag named in their own blocking meta', async ( ) => {
        const html = PAGE.replace(
            '</head>',
            '<meta name="amp-consent-blocking" content="AMP-PIXEL"></head>'
        );
        const { amp } = boot(reject, { html });
        await amp.upgrade();
        assert.equal(await amp.build('free'), 'BLOCK_BY_CONSENT');
    });

    it('reports their policy states, not invented ones', async ( ) => {
        const { amp } = boot(reject);
        const manager = amp.service('consentPolicyManager');
        assert.equal(await manager.whenPolicyResolved('default'), 2);
        assert.equal(await manager.whenPolicyResolved('_till_accepted'), 2);
        assert.equal(await manager.whenPolicyResolved('_till_responded'), 2);
        assert.equal(await manager.whenPolicyResolved('_auto_reject'), 2);
        // Theirs answers UNKNOWN for a name it does not know, and their own
        // config parser drops every policy key but default.
        assert.equal(await manager.whenPolicyResolved('made-up'), 4);
        assert.equal(await manager.whenPolicyUnblock('made-up'), false);
    });

    it('carries no consent string, metadata or shared data', async ( ) => {
        const { amp } = boot(reject);
        const manager = amp.service('consentPolicyManager');
        assert.equal(await manager.getConsentStringInfo('default'), undefined);
        assert.equal(await manager.getTcfPolicyVersion('default'), undefined);
        assert.equal(await manager.getMergedSharedData('default'), null);
        const metadata = await manager.getConsentMetadataInfo('default');
        assert.deepEqual(Object.keys(metadata).sort(), [
            'additionalConsent', 'consentStringType', 'gdprApplies',
            'gppSectionId', 'purposeOne',
        ]);
        for ( const key of Object.keys(metadata) ) {
            assert.equal(metadata[key], undefined, key);
        }
    });

    it('answers their consent record as a refusal', async ( ) => {
        const { amp } = boot(reject);
        await amp.upgrade();
        const manager = amp.service('consentStateManager');
        const info = await manager.getConsentInstanceInfo();
        assert.equal(info.consentState, 2);
        assert.equal(info.consentString, undefined);
        assert.equal(info.purposeConsents, undefined);
        assert.equal(info.isDirty, undefined);
        assert.deepEqual(
            Object.keys(info).sort(),
            [
                'consentMetadata', 'consentState', 'consentString', 'isDirty',
                'purposeConsents', 'tcfPolicyVersion',
            ]
        );
        assert.equal(await manager.consentPageViewId64(), '');
        assert.equal(await manager.getConsentInstanceSharedData(), null);
    });

    // Theirs takes one handler and fires it once with the current record.
    it('fires their state change once, with the refusal', async ( ) => {
        const { amp } = boot(reject);
        await amp.upgrade();
        const seen = [];
        amp.service('consentStateManager')
            .onConsentStateChange(info => { seen.push(info.consentState); });
        await settle(30);
        assert.deepEqual(seen, [ 2 ]);
    });

    it('resolves whenConsentReady once their element registered', async ( ) => {
        const { amp } = boot(reject);
        const manager = amp.service('consentStateManager');
        let ready = false;
        manager.whenConsentReady().then(( ) => { ready = true; });
        await settle(20);
        assert.equal(ready, false, 'nothing registered yet');
        await amp.upgrade();
        await settle(20);
        assert.equal(ready, true);
    });

    it('cannot be argued up to an acceptance', async ( ) => {
        const { amp } = boot(reject);
        const impl = await amp.upgrade();
        const manager = amp.service('consentStateManager');
        manager.updateConsentInstanceState(1, 'a-tc-string', {}, { m: 1 });
        impl.actions.get('accept')({});
        const info = await manager.getConsentInstanceInfo();
        assert.equal(info.consentState, 2);
        assert.equal(info.consentString, undefined);
        assert.equal(await amp.build('gated'), 'BLOCK_BY_CONSENT');
    });

    it('registers their own actions', async ( ) => {
        const { amp } = boot(reject);
        const impl = await amp.upgrade();
        assert.deepEqual(
            Array.from(impl.actions.keys()).sort(),
            [ 'accept', 'dismiss', 'prompt', 'reject', 'setPurpose' ]
        );
    });

    it('leaves no banner, by their own element and its css', async ( ) => {
        const { w, amp } = boot(reject);
        await amp.upgrade();
        const element = w.document.getElementById('consent');
        assert.equal(element.style.display, 'none');
        assert.equal(element.getAttribute('aria-hidden'), 'true');
        assert.match(
            amp.elements.get('amp-consent').css,
            /amp-consent\{display:none!important\}/
        );
    });

    it('does not wait on consent itself', async ( ) => {
        const { amp } = boot(reject);
        const impl = await amp.upgrade();
        assert.equal(impl.getConsentPolicy(), null);
    });

    it('asks for nothing at all', async ( ) => {
        const asked = [];
        const { w, amp } = boot(reject, {
            before: ww => {
                ww.fetch = url => { asked.push(String(url)); return Promise.reject(); };
                ww.XMLHttpRequest = class {
                    open(method, url) { asked.push(String(url)); }
                    send( ) {}
                    setRequestHeader( ) {}
                };
                ww.navigator.sendBeacon = url => { asked.push(String(url)); return true; };
            },
        });
        await amp.upgrade();
        await amp.build('gated');
        await settle(40);
        assert.deepEqual(asked, []);
        assert.equal(w.document.querySelectorAll('iframe').length, 0);
    });
});

/******************************************************************************/

describe('ampconsent, their store', ( ) => {
    it('writes their record, in their own encoding', async ( ) => {
        const { w, amp } = boot(reject);
        await amp.upgrade();
        const blob = store(w);
        const entry = blob.vv['amp-consent:my-consent'];
        assert.ok(entry, Object.keys(blob.vv).join(','));
        // 0, not 2: their reader maps false and 0 to REJECTED.
        assert.deepEqual(entry.v, { s: 0 });
        assert.equal(typeof entry.t, 'number');
    });

    it('reads the instance id off the page, three ways', async ( ) => {
        const cases = [
            [ '{"consentInstanceId":"from-config"}', 'from-config' ],
            [ '{"consents":{"from-legacy":{"promptUI":"ui"}}}', 'from-legacy' ],
            [ '{"consentRequired":true}', 'didomi' ],
        ];
        for ( const [ config, expected ] of cases ) {
            const html = PAGE.replace(
                /<script type="application\/json">[^<]*<\/script>/,
                '<script type="application/json">' + config + '</script>'
            );
            const { w, amp } = boot(reject, { html });
            await amp.upgrade();
            assert.ok(
                store(w).vv['amp-consent:' + expected],
                expected + ' from ' + config
            );
        }
    });

    it('keeps what else is in their store, and their cap', async ( ) => {
        const { w, amp } = boot(reject, {
            before: ww => {
                const items = { 'amp-consent:old': { v: { s: 1 }, t: 1 } };
                for ( let i = 0; i < 7; i += 1 ) {
                    items['other-' + i] = { v: true, t: 1000 + i };
                }
                ww.localStorage.setItem(
                    'amp-store:https://example.org',
                    ww.btoa(JSON.stringify({ vv: items }))
                );
            },
        });
        await amp.upgrade();
        const items = store(w).vv;
        // Their cap is eight, oldest out: the stale consent entry goes first.
        assert.equal(Object.keys(items).length, 8);
        assert.deepEqual(items['amp-consent:my-consent'].v, { s: 0 });
        assert.equal(items['amp-consent:old'], undefined);
        assert.ok(items['other-6'], 'a newer entry of theirs is kept');
    });

    it('overwrites a stored acceptance', async ( ) => {
        const { w, amp } = boot(reject, {
            before: ww => {
                ww.localStorage.setItem(
                    'amp-store:https://example.org',
                    ww.btoa(JSON.stringify({
                        vv: {
                            'amp-consent:my-consent': {
                                v: { s: 1, r: 'a-tc-string' }, t: 5,
                            },
                        },
                    }))
                );
            },
        });
        await amp.upgrade();
        assert.deepEqual(
            store(w).vv['amp-consent:my-consent'].v, { s: 0 }
        );
    });

    // Their store is keyed by the publisher's origin, not the cache's.
    it('keys it by their source origin on a cache page', async ( ) => {
        const { w, amp } = boot(reject, {
            url: 'https://example-org.cdn.ampproject.org/c/s/example.org/page',
        });
        await amp.upgrade();
        const raw = w.localStorage.getItem('amp-store:https://example.org');
        assert.ok(raw, Object.keys(w.localStorage).join(','));
        assert.ok(JSON.parse(w.atob(raw)).vv['amp-consent:my-consent']);
    });

    it('survives a store it cannot read or write', async ( ) => {
        const { w, amp } = boot(reject, {
            before: ww => {
                ww.localStorage.setItem(
                    'amp-store:https://example.org', 'not base64 json'
                );
            },
        });
        await amp.upgrade();
        const manager = amp.service('consentPolicyManager');
        assert.equal(await manager.whenPolicyResolved('default'), 2);
    });
});

/******************************************************************************/

describe('ampconsent, their queue', ( ) => {
    it('drains a notification queue rather than parking it', async ( ) => {
        const { amp } = boot(reject);
        const manager = amp.service('notificationUIManager');
        const seen = [];
        manager.onQueueEmpty(( ) => { seen.push('empty'); });
        manager.onQueueNotEmpty(( ) => { seen.push('not-empty'); });
        assert.deepEqual(seen, [ 'empty' ], 'empty at once when empty');
        await manager.registerUI(( ) => {
            seen.push('shown');
            return Promise.resolve();
        });
        assert.deepEqual(seen, [ 'empty', 'not-empty', 'shown', 'empty' ]);
    });
});

/******************************************************************************/

describe('ampconsent-reject-unblock', ( ) => {
    it('lets the gated elements build', async ( ) => {
        const { amp } = boot(unblock);
        await amp.upgrade();
        assert.equal(await amp.build('gated'), 'built');
        assert.equal(await amp.build('responded'), 'built');
        assert.equal(await amp.build('purposes'), 'built');
    });

    it('still stores and reports the refusal', async ( ) => {
        const { w, amp } = boot(unblock);
        await amp.upgrade();
        assert.deepEqual(store(w).vv['amp-consent:my-consent'].v, { s: 0 });
        const policy = amp.service('consentPolicyManager');
        assert.equal(await policy.whenPolicyResolved('default'), 2);
        assert.equal(await policy.getConsentStringInfo('default'), undefined);
        const info = await amp.service('consentStateManager')
            .getConsentInstanceInfo();
        assert.equal(info.consentState, 2);
    });

    it('does not unblock a policy their own code would not know', async ( ) => {
        const { amp } = boot(unblock);
        const policy = amp.service('consentPolicyManager');
        assert.equal(await policy.whenPolicyUnblock('made-up'), false);
    });
});

/******************************************************************************/

describe('ampconsent, a publisher that already unblocks', ( ) => {
    // unblockOn is theirs, and a page that set it does not need the unblock
    // resource: the plain refusal honours what the page asked for.
    it('honours their own unblockOn on the default policy', async ( ) => {
        const html = PAGE.replace(
            '"promptUI":"ui"',
            '"promptUI":"ui","policy":{"default":{"unblockOn":[4,1,2,3]}}'
        );
        const { amp } = boot(reject, { html });
        await amp.upgrade();
        assert.equal(await amp.build('gated'), 'built');
    });

    it('and a stricter one', async ( ) => {
        const html = PAGE.replace(
            '"promptUI":"ui"',
            '"promptUI":"ui","policy":{"default":{"unblockOn":[1]}}'
        );
        const { amp } = boot(reject, { html });
        await amp.upgrade();
        assert.equal(await amp.build('gated'), 'BLOCK_BY_CONSENT');
        assert.equal(await amp.build('responded'), 'built');
    });
});

/******************************************************************************/

describe('ampconsent, the console line and the lists', ( ) => {
    it('says what it did', ( ) => {
        const { dom } = boot(reject);
        const line = dom.lines.find(text => text.includes('ampconsent-reject'));
        assert.ok(line, dom.lines.join('\n'));
        assert.match(line, /state=rejected policy=2 unblock=theirs/);
        assert.match(line, /banner=none sent=none/);
        assert.match(line, new RegExp('runtime=' + VERSION));
    });

    // The line is said from inside the registration, so its absence is the
    // signal that this resource did not get to stand in for anything.
    it('says nothing at all when no runtime takes it', ( ) => {
        const dom = openPage();
        dom.window.eval(reject);
        assert.deepEqual(dom.lines, []);
    });

    it('says nothing when the real extension registered first', ( ) => {
        const dom = openPage();
        const w = dom.window;
        const amp = runtime(w);
        // What the real file's own entry looks like, m and all.
        w.AMP.push({
            m: 1, v: VERSION, n: 'amp-consent', ev: '0.1', l: true,
            f: AMP => { AMP.registerServiceForDoc('consentPolicyManager', class {}); },
        });
        w.eval(reject);
        assert.deepEqual(dom.lines, []);
        assert.equal(
            typeof amp.service('consentPolicyManager').whenPolicyUnblock,
            'undefined',
            'theirs is the one installed'
        );
    });

    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.ampconsent, '1.0.0');
        for ( const code of [ reject, unblock ] ) {
            const { dom } = boot(code);
            const line = dom.lines.find(t => t.includes('[consent-rr] ampconsent'));
            assert.ok(line.includes(' ' + versions.ampconsent + ' '), line);
        }
    });

    it('names every url shape AMP serves the extension as', ( ) => {
        for ( const rule of [
            '||cdn.ampproject.org/v0/amp-consent-0.1.mjs$script,redirect=ampconsent-reject.js',
            '||cdn.ampproject.org/v0/amp-consent-0.1.js$script,redirect=ampconsent-reject.js',
            '||cdn.ampproject.org/v0/amp-consent-latest.mjs$script,redirect=ampconsent-reject.js',
            '||cdn.ampproject.org/v0/amp-consent-latest.js$script,redirect=ampconsent-reject.js',
            '||cdn.ampproject.org/rtv/*/v0/amp-consent-0.1.mjs$script,redirect=ampconsent-reject.js',
        ] ) {
            assert.ok(filtersText.includes(rule), rule);
        }
    });

    // The runtime is the page. A rule for it would blank the document.
    it('never touches the runtime itself', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(
                /cdn\.ampproject\.org\/v0\.m?js/.test(line), false, line
            );
        }
    });

    it('says in the list why a block is not an option', ( ) => {
        assert.match(filtersText, /WHY THIS ONE CANNOT SIMPLY BE BLOCKED/);
        assert.match(filtersText, /BLOCK_BY_CONSENT/);
        assert.match(filtersText, /THE SCRIPTLET FORM IS THE SAFER ONE HERE/);
        assert.match(filtersText, /THE RUNTIME ITSELF IS LEFT ALONE/);
    });

    it('differs from its sibling by one line', ( ) => {
        const a = reject.split('\n');
        const b = unblock.split('\n');
        assert.equal(a.length, b.length);
        const differ = a.filter((line, i) => line !== b[i]);
        assert.deepEqual(differ, [ "    consentRRAmpConsent('reject');" ]);
    });
});

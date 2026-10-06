/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    tarteaucitron. Two deployments - their hosted loader, which inlines the
    site's configuration and service list in the file being replaced, and a
    self-hosted build, where the page calls init() and pushes services
    afterwards - so the fixtures cover both arrival orders.

    The service registry here is written in the shape theirs uses rather than
    vendored: a launcher of theirs builds its embed through this resource's own
    fallback and getElemAttr, and REGISTRY.youtube.js below is their youtube
    launcher's shape, attribute for attribute. The resource was separately
    driven against their real 1.35.0 bundle, which builds the same iframe.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.culture.gouv.fr/article';
const SRC = 'https://cdntag.tarteaucitron.io/load.js?domain=culture.gouv.fr&uuid=abc123';

const PAGE = '<!doctype html><html lang="fr"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body>' +
    '<div class="youtube_player" data-videoID="aaaaaaaaaaa" data-width="560"' +
    ' data-height="315"></div>' +
    '<div class="tac_twitter" data-url="https://twitter.com/x/status/1"></div>' +
    '<p id="content">x</p></body></html>';

// Their own definition shape: key, type, and a js() that reaches its elements
// through tarteaucitron.fallback and tarteaucitron.getElemAttr.
const REGISTRY = 'window.tarteaucitron.services.youtube = {' +
    ' key: "youtube", type: "video", name: "YouTube", needConsent: true,' +
    ' cookies: ["VISITOR_INFO1_LIVE"], js: function() {' +
    '   tarteaucitron.fallback(["youtube_player"], function(x) {' +
    '     var id = tarteaucitron.getElemAttr(x, "videoID"),' +
    '         w = tarteaucitron.getElemAttr(x, "width"),' +
    '         h = tarteaucitron.getElemAttr(x, "height");' +
    '     return "<iframe title=\\"Youtube iframe\\" width=\\"" + w +' +
    '       "\\" height=\\"" + h + "\\" src=\\"//www.youtube-nocookie.com/embed/" +' +
    '       id + "\\"></iframe>";' +
    '   });' +
    ' } };' +
    'window.tarteaucitron.services.twitterembed = {' +
    ' key: "twitterembed", type: "social", name: "Twitter", js: function() {' +
    '   tarteaucitron.addScript("https://platform.twitter.com/widgets.js");' +
    ' } };' +
    'window.tarteaucitron.services.googleads = {' +
    ' key: "googleads", type: "ads", name: "Google Ads", js: function() {' +
    '   window.adsLaunched = true;' +
    ' } };' +
    'window.tarteaucitron.services.xiti = {' +
    ' key: "xiti", type: "analytic", name: "AT Internet", js: function() {' +
    '   window.analyticsLaunched = true;' +
    ' } };' +
    'window.tarteaucitron.services.disqus = {' +
    ' key: "disqus", type: "comment", name: "Disqus", js: function() {' +
    '   window.commentsLaunched = true;' +
    ' } };';

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('tarteaucitron-reject.js');
    unblock = resources.get('tarteaucitron-reject-unblock.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        w.dataLayer = [];
        w.uetq = [];
        w.__events = [];
        const watch = [
            'youtube_consentModeOk', 'youtube_consentModeKo',
            'twitterembed_consentModeOk', 'googleads_consentModeKo',
            'xiti_consentModeKo', 'disqus_consentModeKo',
            'tac.root_available', 'tac.consent_updated', 'tac_consent_update',
        ];
        for ( const name of watch ) {
            w.document.addEventListener(name, ( ) => { w.__events.push(name); });
        }
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

// The registry a page loaded itself, before pushing its services.
const withRegistry = (which, options = {}) => {
    const w = boot(which, options);
    w.eval(REGISTRY);
    return w;
};

const record = w => cookies(w).get('tarteaucitron');

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('tarteaucitron-reject', ( ) => {
    it('writes their refusal in their own cookie shape', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        w.tarteaucitron.job.push('googleads');
        assert.equal(record(w), '!youtube=false!googleads=false');
    });

    it('refuses whatever the loader had already queued', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.eval('window.tarteaucitron = { job: ["xiti", "googleads"] };');
            },
        });
        assert.equal(record(w), '!xiti=false!googleads=false');
        assert.deepEqual({ ...w.tarteaucitron.state },
            { xiti: false, googleads: false });
    });

    it('rewrites an entry rather than repeating it, as theirs does', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.document.cookie = 'tarteaucitron=!youtube=true; path=/';
            },
        });
        w.tarteaucitron.job.push('youtube');
        assert.equal(record(w), '!youtube=false');
    });

    it('takes the cookie name from the page configuration', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.init({ cookieName: 'monChoix' });
        w.tarteaucitron.job.push('youtube');
        assert.equal(cookies(w).get('monChoix'), '!youtube=false');
        assert.equal(record(w), undefined);
    });

    it('keeps their defaults where the page sets nothing', ( ) => {
        const parameters = boot(reject).tarteaucitron.parameters;
        assert.equal(parameters.cookieName, 'tarteaucitron');
        assert.equal(parameters.highPrivacy, true);
        assert.equal(parameters.serviceDefaultState, 'wait');
        assert.equal(parameters.hashtag, '#tarteaucitron');
    });

    it('lets the page win over a default, by hasOwnProperty as theirs does', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.init({ highPrivacy: false, privacyUrl: 'https://x/p' });
        assert.equal(w.tarteaucitron.parameters.highPrivacy, false);
        assert.equal(w.tarteaucitron.parameters.privacyUrl, 'https://x/p');
        // And the ones it did not name are still theirs.
        assert.equal(w.tarteaucitron.parameters.cookieName, 'tarteaucitron');
    });

    it('fires their per-service event at the document', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('googleads');
        assert.ok(w.__events.includes('googleads_consentModeKo'));
    });

    it('denies consent mode for Google and Bing', ( ) => {
        const w = boot(reject);
        // Compared through JSON: these were built in the page's realm, so
        // deepEqual holds them not reference-equal to ones built here.
        assert.deepEqual(JSON.parse(JSON.stringify(w.dataLayer[0])), {
            0: 'consent', 1: 'default', 2: {
                ad_storage: 'denied', analytics_storage: 'denied',
                ad_user_data: 'denied', ad_personalization: 'denied',
                wait_for_update: 800,
            },
        });
        assert.deepEqual(JSON.parse(JSON.stringify(w.dataLayer[1])), {
            0: 'consent', 1: 'update', 2: {
                ad_storage: 'denied', analytics_storage: 'denied',
                ad_user_data: 'denied', ad_personalization: 'denied',
            },
        });
        assert.deepEqual(JSON.parse(JSON.stringify([ ...w.uetq ])), [
            'consent', 'default', { ad_storage: 'denied' },
            'consent', 'update', { ad_storage: 'denied' },
        ]);
    });

    it('pushes consent mode as an arguments object, as theirs does', ( ) => {
        // Measured on their own file: Object.keys "0","1","2" and not an
        // array. Tag Manager reads a consent command out of that shape, and
        // an array only looks the same under indexing - a denial pushed as
        // one can be passed over.
        const w = boot(reject);
        assert.equal(w.Array.isArray(w.dataLayer[0]), false);
        assert.deepEqual(Object.keys(w.dataLayer[0]), [ '0', '1', '2' ]);
        assert.equal(w.dataLayer[0][0], 'consent');
        assert.equal(w.dataLayer[0].length, 3);
        // And no window.gtag invented, which theirs does not define either.
        assert.equal(typeof w.gtag, 'undefined');
    });

    it('fires the events their own code fires when it is ready', ( ) => {
        const w = boot(reject);
        for ( const name of [
            'tac.root_available', 'tac.consent_updated', 'tac_consent_update',
        ] ) {
            assert.ok(w.__events.includes(name), name);
        }
    });

    it('launches nothing, even with their registry present', async ( ) => {
        const w = withRegistry(reject);
        w.tarteaucitron.job.push('youtube');
        w.tarteaucitron.job.push('googleads');
        await settle(40);
        assert.equal(w.document.querySelector('.youtube_player').innerHTML, '');
        assert.equal(w.adsLaunched, undefined);
        assert.equal(w.tarteaucitron.launch.youtube, false);
    });

    it('asks for no services bundle', async ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        await settle(40);
        const srcs = [ ...w.document.querySelectorAll('script[src]') ]
            .map(node => node.src);
        assert.equal(srcs.some(src => src.includes('services')), false);
    });

    it('builds no banner and leaves the embed as the page wrote it', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        // No banner, no alert, no "click to allow" box over the embed.
        assert.equal(w.document.getElementById('tarteaucitronAlertBig'), null);
        assert.equal(w.document.getElementById('tarteaucitronAlertSmall'), null);
        assert.equal(w.document.querySelector('.tac_activate'), null);
        assert.equal(w.document.querySelector('.youtube_player').innerHTML, '');
    });

    it('puts an empty hidden root up, so their event is not a lie', ( ) => {
        // tac.root_available means the markup is there to reach, and pages
        // hook it to put their own button inside the root. One empty
        // container is not a banner, and it keeps a page's handler from
        // throwing on a null.
        const w = boot(reject);
        const root = w.document.getElementById('tarteaucitronRoot');
        assert.notEqual(root, null);
        assert.equal(root.children.length, 0);
        assert.equal(root.style.display, 'none');
        assert.ok(w.__events.includes('tac.root_available'));
    });

    it('leaves a root the page already had alone', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.eval('var r = document.createElement("div");' +
                    'r.id = "tarteaucitronRoot"; r.dataset.mine = "1";' +
                    'document.body.appendChild(r);');
            },
        });
        const roots = w.document.querySelectorAll('#tarteaucitronRoot');
        assert.equal(roots.length, 1);
        assert.equal(roots[0].dataset.mine, '1');
    });

    it('feeds a job list through rather than letting it replace the live one', ( ) => {
        // A page that assigns instead of pushing would otherwise replace the
        // live list with a plain array and nothing would be decided at all.
        const w = boot(reject);
        w.tarteaucitron.job = [ 'googleads', 'xiti' ];
        assert.equal(record(w), '!googleads=false!xiti=false');
        assert.equal(typeof w.tarteaucitron.job.push, 'function');
        assert.equal(w.tarteaucitron.job._push, undefined ||
            w.tarteaucitron.job._push);
    });

    it('honours their own expiry globals', ( ) => {
        // Theirs reads tarteaucitronForceExpire in days, or in hours when
        // tarteaucitronExpireInDay is false, and only below its own ceilings
        // of 365 days and 8760 hours. document.cookie does not report an
        // expiry, so this reads the jar.
        const DAY = 86400000;
        const expiryOf = (before, key) => {
            const dom = runDom(reject, URL, PAGE, before);
            dom.window.tarteaucitron.job.push(key || 'googleads');
            const [ cookie ] = cookiesInJar(dom, URL, 'tarteaucitron');
            assert.notEqual(cookie, undefined);
            return cookie.expires.getTime() - Date.now();
        };
        const near = (got, days) => Math.abs(got - days * DAY) < 2 * DAY;

        // Nothing set: their ceiling.
        assert.ok(near(expiryOf(( ) => {}), 365));
        // Days.
        assert.ok(near(expiryOf(w => { w.tarteaucitronForceExpire = 30; }), 30));
        // Hours, where they say hours.
        assert.ok(near(expiryOf(w => {
            w.tarteaucitronForceExpire = 48;
            w.tarteaucitronExpireInDay = false;
        }), 2));
        // Past their own ceiling falls back rather than honouring it.
        assert.ok(near(expiryOf(w => {
            w.tarteaucitronForceExpire = 99999;
        }), 365));
        // And a page parameter, which the self-hosted deployment sets.
        const dom = runDom(reject, URL, PAGE);
        dom.window.tarteaucitron.init({ expireindays: 7 });
        dom.window.tarteaucitron.job.push('googleads');
        const [ cookie ] = cookiesInJar(dom, URL, 'tarteaucitron');
        assert.ok(near(cookie.expires.getTime() - Date.now(), 7));
    });

    it('sends no beacon and keeps their reporting shape inert', ( ) => {
        const sent = [];
        const w = boot(reject, {
            before: ww => {
                ww.navigator.sendBeacon = url => { sent.push(url); return true; };
            },
        });
        w.tarteaucitron.pro('!youtube=engage');
        w.tarteaucitron.proPing();
        assert.deepEqual(sent, []);
        assert.equal(w.tarteaucitron.proTemp, '');
        assert.equal(w.tarteaucitron.uuid, '');
    });

    it('never asks for a reload, because nothing launched', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        w.tarteaucitron.userInterface.respondAll(false);
        assert.equal(w.tarteaucitron.reloadThePage, false);
    });

    it('answers their own cookie reader', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        assert.equal(w.tarteaucitron.cookie.read(), '!youtube=false');
        w.tarteaucitron.cookie.create('vimeo', 'false');
        assert.equal(w.tarteaucitron.cookie.read(), '!youtube=false!vimeo=false');
    });

    it('answers any language key rather than throwing', ( ) => {
        const w = boot(reject);
        assert.equal(w.tarteaucitron.lang.reload, '');
        assert.equal(w.tarteaucitron.lang.somethingNobodyPinned, '');
    });

    it('does not answer a language key where a function belongs', ( ) => {
        // An '' for hasOwnProperty or toString hands a caller a string where
        // it called a function.
        const lang = boot(reject).tarteaucitron.lang;
        assert.equal(typeof lang.hasOwnProperty, 'function');
        assert.equal(typeof lang.toString, 'function');
        assert.equal(lang.hasOwnProperty('reload'), true);
        assert.equal(lang.hasOwnProperty('neverPinned'), false);
    });

    it('invents no type for a service it has never heard of', ( ) => {
        // A record of this resource's own making must stay distinguishable
        // from a real definition, or a registry arriving later could not move
        // the decision.
        const w = boot(reject);
        w.tarteaucitron.job.push('somethingCustom');
        assert.equal(w.tarteaucitron.services.somethingCustom.type, '');
        assert.equal(w.tarteaucitron.services.somethingCustom.key,
            'somethingCustom');
    });

    it('keeps what the page put on tarteaucitron.user', ( ) => {
        const w = boot(reject, {
            before: ww => {
                ww.eval('window.tarteaucitron = { user: { gtagUa: "G-X" } };');
            },
        });
        assert.equal(w.tarteaucitron.user.gtagUa, 'G-X');
    });

    it('rewrites a dotted key without wiping its neighbour', ( ) => {
        // A tenant defines its own service names, and the key goes into a
        // pattern: an unescaped dot matches any character.
        const w = boot(reject, {
            before: ww => {
                ww.document.cookie =
                    'tarteaucitron=!adxplayer=true!ad.player=true; path=/';
            },
        });
        w.tarteaucitron.job.push('ad.player');
        assert.equal(record(w), '!adxplayer=true!ad.player=false');
    });

    it('ignores a service name that is not one', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('<img src=x>');
        w.tarteaucitron.job.push('');
        w.tarteaucitron.job.push(null);
        assert.equal(record(w), undefined);
    });

    it('stands down on a second evaluation', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.job.push('youtube');
        const job = w.tarteaucitron.job;
        const entries = w.dataLayer.length;
        const events = w.__events.length;
        w.eval(reject);
        assert.equal(w.tarteaucitron.job, job);
        assert.equal(record(w), '!youtube=false');
        // And it says nothing twice: a second consent-mode default or a
        // second tac.root_available is a page told the same thing twice.
        assert.equal(w.dataLayer.length, entries);
        assert.equal(w.__events.length, events);
    });

    it('announces what went in', ( ) => {
        let out;
        const w = runDom(reject, URL, PAGE, ww => { out = lines(ww); });
        w.window.tarteaucitron.job.push('googleads');
        assert.equal(out.length, 1);
        assert.ok(out[0].startsWith(
            '[consent-rr] tarteaucitron-reject ' + versions.tarteaucitron));
        assert.ok(out[0].includes(' banner=none reload=no beacon=none'));
    });
});

/******************************************************************************/

// Their own DNT read, and their own switch for it:
//
//   isDNTRequested = (navigator.doNotTrack === "1" ||
//       navigator.doNotTrack === "yes" || navigator.msDoNotTrack === "1" ||
//       window.doNotTrack === "1")
//   } else if ( !isResponded && isDNTRequested &&
//       tarteaucitron.handleBrowserDNTRequest ) {
//       tarteaucitron.cookie.create(service.key, 'false');
describe('tarteaucitron, their do-not-track switch', ( ) => {
    const withDnt = (which, value, flag, which2) => {
        const w = withRegistry(which, {
            before: ww => {
                if ( value === null ) { return; }
                const name = value === 'ms' ? 'msDoNotTrack' : 'doNotTrack';
                Object.defineProperty(ww.navigator, name, {
                    value: value === 'ms' ? '1' : value,
                    configurable: true,
                });
            },
        });
        w.tarteaucitron.init({ handleBrowserDNTRequest: flag });
        w.tarteaucitron.job.push('youtube');
        w.tarteaucitron.job.push('eulerian');
        void which2;
        return w;
    };

    it('consents to video where their switch is off, header or not', ( ) => {
        for ( const value of [ null, '1', 'yes' ] ) {
            const w = withDnt(unblock, value, false);
            assert.equal(
                record(w), '!youtube=true!eulerian=false', 'dnt=' + value
            );
        }
    });

    it('consents to nothing where their switch is on and the header is sent', ( ) => {
        for ( const value of [ '1', 'yes', 'ms' ] ) {
            const w = withDnt(unblock, value, true);
            assert.equal(
                record(w), '!youtube=false!eulerian=false', 'dnt=' + value
            );
        }
    });

    it('still consents to video where the header is absent', ( ) => {
        const w = withDnt(unblock, null, true);
        assert.equal(record(w), '!youtube=true!eulerian=false');
    });

    // Theirs is a boolean off their parameters, assigned inside init - a page
    // reading it must not find a function here, which is always truthy.
    it('exposes their flag as the boolean theirs is', ( ) => {
        const w = boot(unblock);
        assert.equal(w.tarteaucitron.handleBrowserDNTRequest, false);
        w.tarteaucitron.init({ handleBrowserDNTRequest: true });
        assert.equal(w.tarteaucitron.handleBrowserDNTRequest, true);
        w.tarteaucitron.init({ handleBrowserDNTRequest: false });
        assert.equal(w.tarteaucitron.handleBrowserDNTRequest, false);
    });

    // A refusal is a refusal either way: their switch cannot make it weaker.
    it('changes nothing for the plain refusal', ( ) => {
        const w = withDnt(reject, '1', true);
        assert.equal(record(w), '!youtube=false!eulerian=false');
    });
});

/******************************************************************************/

describe('tarteaucitron-reject-unblock', ( ) => {
    it('consents to video and social, and refuses the rest', ( ) => {
        const w = withRegistry(unblock);
        for ( const key of [
            'youtube', 'twitterembed', 'googleads', 'xiti', 'disqus',
        ] ) {
            w.tarteaucitron.job.push(key);
        }
        assert.deepEqual({ ...w.tarteaucitron.state }, {
            youtube: true, twitterembed: true,
            googleads: false, xiti: false, disqus: false,
        });
        assert.equal(record(w),
            '!youtube=true!twitterembed=true!googleads=false!xiti=false' +
            '!disqus=false');
    });

    it('starts a consented service through their own launcher', async ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('youtube');
        await settle(40);
        const built = w.document.querySelector('.youtube_player').innerHTML;
        assert.match(built, /<iframe/);
        assert.match(built, /youtube-nocookie\.com\/embed\/aaaaaaaaaaa/);
        assert.match(built, /width="560"/);
    });

    it('lets a social launcher fetch its own widget code', async ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('twitterembed');
        await settle(40);
        const srcs = [ ...w.document.querySelectorAll('script[src]') ]
            .map(node => node.src);
        assert.ok(srcs.some(src => src.includes('platform.twitter.com')));
    });

    it('never starts an ad or analytics service', async ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('googleads');
        w.tarteaucitron.job.push('xiti');
        await settle(40);
        assert.equal(w.adsLaunched, undefined);
        assert.equal(w.analyticsLaunched, undefined);
        assert.ok(w.__events.includes('googleads_consentModeKo'));
        assert.ok(w.__events.includes('xiti_consentModeKo'));
    });

    it('leaves consent mode denied, whatever the embeds do', ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('youtube');
        assert.deepEqual(JSON.parse(JSON.stringify(w.dataLayer[1])), {
            0: 'consent', 1: 'update', 2: {
                ad_storage: 'denied', analytics_storage: 'denied',
                ad_user_data: 'denied', ad_personalization: 'denied',
            },
        });
    });

    it('fires the Ok event for what it consented to', ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('youtube');
        assert.ok(w.__events.includes('youtube_consentModeOk'));
        assert.equal(w.__events.includes('youtube_consentModeKo'), false);
    });

    it('refuses what it cannot yet place, and asks for their registry', async ( ) => {
        const w = boot(unblock);
        w.tarteaucitron.job.push('youtube');
        await settle(40);
        // Fail closed: unknown type means refused, not allowed.
        assert.equal(record(w), '!youtube=false');
        assert.equal(w.tarteaucitron.state.youtube, false);
        const srcs = [ ...w.document.querySelectorAll('script[src]') ]
            .map(node => node.src);
        assert.ok(srcs.some(
            src => src === 'https://cdn.tarteaucitron.io/tarteaucitron.services.min.js'
        ), srcs.join(' '));
    });

    it('reconsiders once their registry answers', async ( ) => {
        const w = boot(unblock);
        w.tarteaucitron.job.push('youtube');
        w.tarteaucitron.job.push('googleads');
        await settle(20);
        assert.equal(record(w), '!youtube=false!googleads=false');
        // What the bundle arriving looks like: the definitions, then onload.
        w.eval(REGISTRY);
        const node = [ ...w.document.querySelectorAll('script[src]') ]
            .find(script => script.src.includes('tarteaucitron.services'));
        node.onload();
        await settle(40);
        assert.equal(record(w), '!googleads=false!youtube=true');
        assert.match(
            w.document.querySelector('.youtube_player').innerHTML, /<iframe/);
    });

    it('asks for their registry once, not per service', async ( ) => {
        const w = boot(unblock);
        for ( const key of [ 'youtube', 'vimeo', 'googleads' ] ) {
            w.tarteaucitron.job.push(key);
        }
        await settle(40);
        const asked = [ ...w.document.querySelectorAll('script[src]') ]
            .filter(node => node.src.includes('tarteaucitron.services'));
        assert.equal(asked.length, 1);
    });

    it('reconsiders a service the site defines after it', async ( ) => {
        // The self-hosted case: a site's own services file can land after
        // this one, and a custom video service should not stay refused just
        // because it was late.
        const w = boot(unblock);
        w.tarteaucitron.job.push('maVideo');
        await settle(20);
        assert.equal(record(w), '!maVideo=false');
        w.tarteaucitron.addService('maVideo', {
            key: 'maVideo', type: 'video', name: 'Ma video',
            js: ( ) => { w.maVideoLaunched = true; },
        });
        await settle(20);
        assert.equal(record(w), '!maVideo=true');
        assert.equal(w.maVideoLaunched, true);
    });

    it('asks for nothing when their registry is already there', async ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('youtube');
        await settle(40);
        const asked = [ ...w.document.querySelectorAll('script[src]') ]
            .filter(node => node.src.includes('tarteaucitron.services'));
        assert.deepEqual(asked, []);
    });

    it('will not let a page argue an ad service into a yes', ( ) => {
        const w = withRegistry(unblock);
        w.tarteaucitron.job.push('googleads');
        w.tarteaucitron.userInterface.respondAll(true);
        w.tarteaucitron.setConsent('googleads', true);
        assert.equal(w.tarteaucitron.state.googleads, false);
        assert.equal(w.adsLaunched, undefined);
    });

    it('names the types it consented to in the console line', ( ) => {
        let out;
        const w = runDom(unblock, URL, PAGE, ww => { out = lines(ww); });
        w.window.eval(REGISTRY);
        w.window.tarteaucitron.job.push('youtube');
        assert.ok(out[0].includes(' types=video+social'), out[0]);
    });
});

/******************************************************************************/

describe('tarteaucitron-reject-unblock, against a real record', ( ) => {
    // A visitor's own cookie from a site running 1.35.0, having chosen the
    // videos and the social embeds. Eleven of the sixteen are in their public
    // bundle; the other five are that tenant's own, and are refused here
    // because an unknown type is refused.
    const REAL = '!eulerian=false!locala=false!kword=false!doubleclick=false' +
        '!criteo=false!azerion=false!amazondsp=false!adform=false' +
        '!brevonotification=false!acast=false!youtube=true!vimeo=true' +
        '!dailymotion=true!facebook=true!instagram=true!twitterembed=true';

    // The types their own bundle gives the ones it carries.
    const TYPES = {
        eulerian: 'analytic', doubleclick: 'ads', criteo: 'ads',
        adform: 'ads', acast: 'video', youtube: 'video', vimeo: 'video',
        dailymotion: 'video', facebook: 'social', instagram: 'social',
        twitterembed: 'social',
    };
    const ORDER = [
        'eulerian', 'locala', 'kword', 'doubleclick', 'criteo', 'azerion',
        'amazondsp', 'adform', 'brevonotification', 'acast', 'youtube',
        'vimeo', 'dailymotion', 'facebook', 'instagram', 'twitterembed',
    ];

    it('writes the same record a real visitor ended up with', ( ) => {
        const w = boot(unblock);
        w.eval('window.__types = ' + JSON.stringify(TYPES) + ';' +
            'for (var key in window.__types) {' +
            ' window.tarteaucitron.services[key] = { key: key,' +
            '  type: window.__types[key], name: key, js: function() {} }; }');
        for ( const key of ORDER ) { w.tarteaucitron.job.push(key); }
        assert.equal(record(w), REAL);
    });

    it('refuses acast, which two of their bundles type differently', ( ) => {
        // info.gouv.fr's own build says type "other" and their CDN bundle
        // says "video" for the same key, and the record from that page
        // refuses it. Replacing a site's build takes its typings with it, so
        // the registry this falls back to must not be the more permissive of
        // the two.
        const w = boot(unblock);
        w.eval('window.tarteaucitron.services.acast = { key: "acast",' +
            ' type: "video", name: "Acast", js: function() {' +
            '  window.acastLaunched = true; } };');
        w.tarteaucitron.job.push('acast');
        assert.equal(w.tarteaucitron.state.acast, false);
        assert.equal(w.acastLaunched, undefined);
        assert.equal(record(w), '!acast=false');
    });

    it('refuses it under either of their two typings', ( ) => {
        for ( const type of [ 'video', 'other' ] ) {
            const w = boot(unblock);
            w.eval('window.tarteaucitron.services.acast = { key: "acast",' +
                ' type: "' + type + '", name: "Acast", js: function() {} };');
            w.tarteaucitron.job.push('acast');
            assert.equal(w.tarteaucitron.state.acast, false, type);
        }
    });

    it('refuses a service their bundle does not carry at all', ( ) => {
        // Five of the sixteen are that tenant's own. An unknown type is
        // refused, so a tenant's private ad service cannot ride in on the
        // video exception.
        const w = boot(unblock);
        for ( const key of [ 'locala', 'kword', 'azerion' ] ) {
            w.tarteaucitron.job.push(key);
        }
        assert.equal(record(w), '!locala=false!kword=false!azerion=false');
    });
});

/******************************************************************************/

describe('tarteaucitron, their own helpers', ( ) => {
    it('reads an attribute their way: data- first, then bare', ( ) => {
        const w = boot(reject);
        const node = w.document.querySelector('.youtube_player');
        assert.equal(w.tarteaucitron.getElemAttr(node, 'videoID'), 'aaaaaaaaaaa');
        node.setAttribute('poster', 'bare');
        assert.equal(w.tarteaucitron.getElemAttr(node, 'poster'), 'bare');
        assert.equal(w.tarteaucitron.getElemAttr(node, 'nothing'), '');
    });

    it('refuses a url attribute that is not a url', ( ) => {
        const w = boot(reject);
        const node = w.document.querySelector('.tac_twitter');
        assert.equal(w.tarteaucitron.getElemAttr(node, 'url'),
            'https://twitter.com/x/status/1');
        node.setAttribute('data-url', 'javascript:alert(1)');
        assert.equal(w.tarteaucitron.getElemAttr(node, 'url'), '');
    });

    it('calls the callback without loading where execute is false', ( ) => {
        // Theirs reads execute === false that way, and a launcher uses it to
        // do its own work without a fetch.
        const w = boot(reject);
        let called = 0;
        w.tarteaucitron.addScript('https://x.example/a.js', '',
            ( ) => { called += 1; }, false);
        assert.equal(called, 1);
        const srcs = [ ...w.document.querySelectorAll('script[src]') ]
            .map(node => node.src);
        assert.equal(srcs.some(src => src.includes('x.example')), false);
    });

    it('loads and keeps the callback where execute is not false', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.addScript('https://x.example/b.js', 'tacTest',
            ( ) => {});
        const node = w.document.getElementById('tacTest');
        assert.equal(node.src, 'https://x.example/b.js');
        assert.equal(typeof node.onload, 'function');
        assert.equal(node.async, true);
    });

    it('sizes the way theirs does', ( ) => {
        const size = boot(reject).tarteaucitron.getStyleSize;
        assert.equal(size('560'), '560px');
        assert.equal(size('50%'), '50%');
        assert.equal(size('20rem'), '20rem');
        assert.equal(size(null), 'auto');
        assert.equal(size('nonsense'), 'auto');
    });

    it('fills every matching element, and honours noInner', ( ) => {
        const w = boot(reject);
        w.tarteaucitron.fallback([ 'youtube_player' ], 'replaced');
        assert.equal(w.document.querySelector('.youtube_player').innerHTML,
            'replaced');
        let got = null;
        w.tarteaucitron.fallback([ 'youtube_player' ], node => {
            got = node.className;
            return 'ignored';
        }, true);
        assert.equal(got, 'youtube_player');
        // noInner means the callback got the element and nothing was written.
        assert.equal(w.document.querySelector('.youtube_player').innerHTML,
            'replaced');
    });
});

/******************************************************************************/

describe('filters, tarteaucitron', ( ) => {
    it('matches the hosted loader and a file anywhere', ( ) => {
        assert.match(filtersText,
            /\|\|cdntag\.tarteaucitron\.io\/load\.js\$script,redirect=tarteaucitron-reject\.js/);
        assert.match(filtersText,
            /^\/tarteaucitron\.js\$script,redirect=tarteaucitron-reject\.js$/m);
        assert.match(filtersText,
            /tarteaucitron\\\.\[0-9a-f\]\{6,\}/);
    });

    it('never matches their services bundle, which unblock needs', ( ) => {
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('!') === false && line !== '')
            .filter(line => line.includes('tarteaucitron'));
        for ( const rule of rules ) {
            assert.equal(rule.includes('services'), false, rule);
            assert.equal(rule.includes('lang'), false, rule);
        }
        // And the two file patterns are written so they cannot catch it.
        assert.equal(
            'tarteaucitron.services.min.js'.includes('tarteaucitron.js'), false);
        assert.equal(
            'tarteaucitron.services.min.js'.includes('tarteaucitron.min.js'),
            false);
    });

    it('says in the list why the bundle is left alone', ( ) => {
        assert.match(filtersText, /THEIR SERVICES BUNDLE AND LANGUAGE FILE ARE NOT MATCHED/);
        assert.match(filtersText, /THE RECORD IS ONE COOKIE/);
    });
});

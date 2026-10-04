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

    Implementation for fundingchoices-reject.js.

    Google Funding Choices, from fundingchoicesmessages.google.com - the CMP
    and ad-block messaging that AdSense and Ad Manager publishers get from
    inside the Google console rather than as a tag of their own.

    BLOCKING THE REQUEST IS ALREADY SAFE, and that is the starting point: this
    exists to end the waits blocking leaves behind, and to make sure a
    returning visitor's banked consent does not outlive it.

    MIRRORS GOOGLE'S OWN INACTIVE PATH. Their /f/<token> script is what the
    loader serves when Funding Choices has decided it has nothing to show, and
    everything below was measured by booting it rather than read from a doc:

      two hidden iframes appended to the top document, named googlefcInactive
      and googlefcLoaded - the signal consumers wait for, and the counterpart
      of the googlefcPresent iframe the publisher's own inline snippet makes;

      window.googlefc.__fci replaced with a live queue that answers instead of
      collecting, over exactly two command names, "loaded" and "prov";

      window.__fcInternalApiManager, whose setError() puts it in the state
      where every command answers the same thing;

      window.__fcInternalApiPostMessageReady, with a message listener that
      answers an {__fciCall: {command, callId}} with
      {__fciReturn: "[<callId>,[4]]"} to the sender's origin.

    The answers are theirs, measured: a command in the error state serialises
    to [null,[4]] and an unknown command to [null,[2]], which is a JSPB array
    with the status enum in field 2. A command that is not one of the two, or
    a call with no numeric callId, is answered with silence - also theirs.

    THE REFUSAL IS THE ABSENCE OF THEIR COOKIE, PLUS CLEARING IT. Both of
    Google's own readers - gpt.js and adsbygoogle.js, one reference each and
    nothing else about Funding Choices in either - read the FCCDCF cookie,
    URI-decode it if it starts with %, parse it as JSPB and take field 4,
    whose field 1 is the TC string:

        this.tcString = (a = Em(document)) && dc(z(a, 1)) != null
            ? J(a, 1) : null;

    No cookie means no TC string, which is the refusal, and writing one here
    would be minting a consent string of this repo's own making. But a visitor
    who consented before installing this still has theirs, and it is set for
    about thirteen months, so a refusal has to clear it - on the host and on
    the registrable domain, because the one they wrote is not necessarily the
    one this page can see.

    THE IAB LAYER IS IN lib/fundingchoices-tcf.js, and it is a refusal. Their
    messaging script is the TCF CMP, and it is the one thing this inactive path
    does not put up, so a page or a vendor waiting on __tcfapi waits forever
    once the request is blocked. The API answers; nothing is stored, because
    the only place their own string lives is the cookie being refused.

    NOT DONE HERE, deliberately:

      callbackQueue       A publisher's googlefc.callbackQueue is left exactly
                          as it is, because their own inactive path leaves it:
                          pushed two callbacks before booting their script and
                          neither ran, the queue still two long afterwards.
                          Running them would be this resource inventing a
                          behaviour the CMP does not have on this path, and
                          the key names it answers to cannot be measured - the
                          script that drains them is the messaging one, served
                          from a token-bound url that answers 403 to anything
                          but the page it was minted for.

      the loader's markers
                          Their script stamps two window properties named
                          btoa(id + "loader_js") and btoa(id + "cached_js"),
                          where the id is minted inside the script body rather
                          than carried in the url, so it cannot be known from
                          outside. Only their own loader reads them.

*/

function consentRRFundingChoices(installTcf) {
    const w = window;
    const doc = w.document;
    // Substituted from package.json by tools/build.mjs.
    const VERSION = '@@VERSION@@';
    const NAME = 'fundingchoices-reject';

    const COOKIE = 'FCCDCF';
    // Their two command names, from the object their own validator checks
    // against: {LOADED: 'loaded', F: 'prov'}.
    const COMMANDS = [ 'loaded', 'prov' ];
    // Their two iframe names. googlefcPresent is the publisher's own snippet's
    // and is left alone.
    const FRAMES = [ 'googlefcInactive', 'googlefcLoaded' ];
    // Measured off their script in the state its inactive path puts it in.
    const ANSWER = '[null,[4]]';
    const UNKNOWN = '[null,[2]]';

    const noopfn = function() {
    }.bind();

    // Their own guard, which is why a second evaluation changes nothing: the
    // queue is only replaced where one of theirs is not already standing.
    const googlefc = typeof w.googlefc === 'object' && w.googlefc !== null
        ? w.googlefc
        : {};
    w.googlefc = googlefc;
    if ( googlefc.consentRR !== undefined ) { return; }

    /**************************************************************************/

    // The registrable domain, so a cookie their script set one level up can be
    // expired from here. Two labels, or three where the second to last is a
    // two-letter country code behind a short suffix - the shape a page can
    // work out without a public suffix list.
    const domains = ( ) => {
        const host = String(w.location.hostname || '');
        if ( /^[0-9.]+$/.test(host) || host.indexOf('.') === -1 ) { return []; }
        const labels = host.split('.');
        const out = [];
        for ( let at = 0; at < labels.length - 1; at += 1 ) {
            out.push(labels.slice(at).join('.'));
        }
        return out;
    };

    // Clearing a cookie takes the path and the domain it was set with, and
    // neither is readable, so every plausible pair is expired. A name that was
    // never there costs an assignment.
    let cleared = 0;
    const clearCookie = name => {
        const had = String(doc.cookie || '').indexOf(name + '=') !== -1;
        // Nothing to clear, and nothing clearable: a cookie this document
        // cannot read is one set on a path it cannot write either, so the
        // sweep below would be fourteen assignments for nothing - and no
        // record is the overwhelmingly common case.
        if ( had === false ) { return; }
        const gone = '=; expires=Thu, 01 Jan 1970 00:00:01 GMT';
        for ( const path of [ '/', w.location.pathname ] ) {
            try {
                doc.cookie = name + gone + '; path=' + path;
            } catch ( ex ) {
            }
            for ( const domain of domains() ) {
                try {
                    doc.cookie = name + gone + '; path=' + path +
                        '; domain=' + domain;
                    doc.cookie = name + gone + '; path=' + path +
                        '; domain=.' + domain;
                } catch ( ex ) {
                }
            }
        }
        cleared += 1;
    };

    /**************************************************************************/

    // Their internal API manager, by the names their own prototype carries.
    // setError is the call their inactive path makes, and it is what makes
    // every answer the same one.
    const manager = {
        error: true,
        setError: function() {
            this.error = true;
        },
        setCmpModeObject: noopfn,
        setExperimentsObject: noopfn,
        getSerializedReturnMessageForCommand: function(command) {
            if ( this.error ) { return ANSWER; }
            if ( COMMANDS.includes(command) ) { return ANSWER; }
            return UNKNOWN;
        },
        getSerializedReturnMessageForInvalidCommand: ( ) => UNKNOWN,
    };
    if ( typeof w.__fcInternalApiManager === 'undefined' ) {
        w.__fcInternalApiManager = manager;
    }

    // Their queue, which answers rather than collects. A caller hands in a
    // function or an object with a cb, and gets the serialized message back -
    // an unknown command included, which is answered rather than dropped.
    let answered = 0;
    const answer = (command, entry) => {
        const callback = entry !== null && typeof entry === 'object' &&
            typeof entry.cb === 'function'
            ? entry.cb
            : entry;
        if ( typeof callback !== 'function' ) { return; }
        try {
            callback(COMMANDS.includes(command) ? ANSWER : UNKNOWN);
            answered += 1;
        } catch ( ex ) {
        }
    };

    // Whatever was queued before this arrived, in their pairs-of-two layout:
    // a command name then a callback, repeatedly, and left alone unless the
    // length is even, as theirs is.
    const standing = Array.isArray(googlefc.__fci) ? googlefc.__fci : [];
    const queue = [];
    queue.push = (command, entry) => {
        answer(command, entry);
        return answered;
    };
    queue._push = Array.prototype.push;
    if ( standing.length % 2 === 0 ) {
        for ( let at = 0; at < standing.length - 1; at += 2 ) {
            if ( typeof standing[at] !== 'string' ) { continue; }
            answer(standing[at], standing[at + 1]);
        }
    }
    googlefc.__fci = queue;

    /**************************************************************************/

    // Their postMessage side, which is how their own iframes call in. A
    // command outside the two, or a call with no numeric callId, is answered
    // with silence - measured, not assumed. The reply is the same message with
    // the callId in field 1.
    let replied = 0;
    if ( w.__fcInternalApiPostMessageReady !== true ) {
        w.addEventListener('message', event => {
            try {
                const data = event.data;
                if ( data === null || typeof data !== 'object' ) { return; }
                const call = data.__fciCall;
                if ( call === null || typeof call !== 'object' ) { return; }
                if ( COMMANDS.includes(call.command) === false ) { return; }
                if ( typeof call.callId !== 'number' ) { return; }
                const source = event.source;
                if ( source === null || source === undefined ) { return; }
                if ( typeof source.postMessage !== 'function' ) { return; }
                source.postMessage({
                    __fciReturn: '[' + call.callId + ',[4]]',
                }, event.origin);
                replied += 1;
            } catch ( ex ) {
            }
        });
        w.__fcInternalApiPostMessageReady = true;
    }

    /**************************************************************************/

    // Their iframes. Theirs go in the TOP document, reached as
    // v.top.document || v.document || document - which throws rather than
    // falling through on a cross-origin parent, so this catches and keeps
    // its own. Theirs waits on a 5ms timer for a body, and will not add a
    // name that is already there.
    const target = ( ) => {
        try {
            if ( w.top.document ) { return w.top.document; }
        } catch ( ex ) {
        }
        return doc;
    };

    let framed = 0;
    const addFrame = (where, name) => {
        for ( const node of where.getElementsByTagName('IFRAME') ) {
            if ( node.name === name ) { return; }
        }
        // Their element, attribute for attribute.
        const frame = where.contentType === 'application/xhtml+xml'
            ? where.createElement('iframe')
            : where.createElement('IFRAME');
        frame.name = name;
        frame.src = 'about:blank';
        frame.style.display = 'none';
        frame.style.width = '0px';
        frame.style.height = '0px';
        frame.style.border = 'none';
        frame.style.zIndex = '-1000';
        frame.style.left = '-1000px';
        frame.style.top = '-1000px';
        const append = ( ) => {
            if ( where.body === null ) {
                w.setTimeout(append, 5);
                return;
            }
            where.body.appendChild(frame);
        };
        append();
        framed += 1;
    };

    const where = target();
    for ( const name of FRAMES ) {
        try {
            addFrame(where, name);
        } catch ( ex ) {
        }
    }

    /**************************************************************************/

    clearCookie(COOKIE);

    // The IAB layer, handed in rather than reached for, so a build without it
    // is a resource without it. It goes in after the cookie is cleared: a
    // vendor that answers an addEventListener by reading the record should not
    // find the one this refusal has just deleted.
    let tcf = 'absent';
    if ( typeof installTcf === 'function' ) {
        try {
            tcf = installTcf().install() ? 'refused' : 'theirs';
        } catch ( ex ) {
            tcf = 'failed';
        }
    }

    googlefc.consentRR = { name: NAME, version: VERSION };

    // Said once, at the end, so it reports what actually went in. cleared=1
    // is a visitor who had consented before this was installed.
    if ( typeof console === 'object' && typeof console.info === 'function' ) {
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' frames=' + framed +
            ' answered=' + answered +
            ' replied=' + replied +
            ' cleared=' + cleared +
            ' tcf=' + tcf
        );
    }
}

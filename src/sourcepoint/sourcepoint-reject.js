/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Sourcepoint's unified wrapper,
    cdn.privacy-mgmt.com/unified/wrapperMessagingWithoutDetection.js.

    One file carries the whole CMP: their campaign modules are webpack chunks
    that only this file asks for, so with it replaced there is no message
    iframe, no privacy manager and no consent call - and no banner, because
    their banner is one of those iframes.

    What the page gets instead is the state their own script reaches on a
    property with nothing to show: the _sp_ surface, the _sp_queue handed over
    the way theirs hands it over, the event callbacks a page registered
    through _sp_.config.events fired in their own order, and __tcfapi
    answering a refusal as cmpId 6.

    The refusal is written to euconsent-v2 and nowhere else of theirs: the
    rest of their consent state is minted by their consent service, and a
    record a visitor consented to earlier is cleared rather than rewritten.

    No accept resource and no unblock resource. Nothing is parked for this CMP
    to free - there is no type="text/plain" and no data- attribute of theirs
    anywhere in the file - so blocking is what keeps a tracker out, and uBO is
    already doing that.

*/

(function() {
    'use strict';
    // @include lib/sourcepoint-tcf.js
    // @include lib/sourcepoint-core.js
    consentRRSourcepoint(consentRRSourcepointTcf);
})();

/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for CookieYes: no banner, their own reject-all in their own
    cookieyes-consent record - necessary yes and the other five no, with
    consent no and action yes - and the two events their own code fires, at
    the document, where a page listens.

    One file is the whole install, so replacing script.js means their
    banner.js is never asked for and neither is the 917KB global vendor list
    they ship. The IAB layer answers a refusal as cmpId 401 rather than
    leaving a page waiting on the stub their file opens with.

    Their consentid is not minted: one already stored is kept, and otherwise
    it stays empty. Their log.cookieyes.com beacon, which theirs sends on
    load before any decision, is not sent.

*/

(function() {
    'use strict';
    // @include lib/cookieyes-core.js
    // @include lib/cookieyes-tcf.js
    consentRRCookieYes('reject', consentRRCookieYesTcf);
})();

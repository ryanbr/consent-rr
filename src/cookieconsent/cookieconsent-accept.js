/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    CookieConsent v3 by Orest Bida, granting - for a site that gives nothing
    away until every category is on.

    Every category their config names goes into their own record, their
    acceptType reads "all", the services of each category are accepted with
    it, and the scripts their manager parked are freed, which is what their
    own accept-all button does.

    This consents on your behalf. cookieconsent-reject.js is the default
    everywhere else.

*/

(function() {
    'use strict';
    // @include lib/cookieconsent-core.js
    consentRRCookieConsent('accept');
})();

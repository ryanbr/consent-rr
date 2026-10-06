/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    CookieConsent v3 by Orest Bida, for a site that withholds something until
    a category is on.

    Stores the same refusal as cookieconsent-reject.js - the record carries
    the read-only categories alone - and separately tells the page's own
    scripts that every category and service is accepted, which is what their
    acceptedCategory, acceptedService and getUserPreferences answer. The
    scripts their manager parked are freed by their own contract:

        script[data-category]       the parked tag
        data-category="!analytics"  a leading ! inverts it
        data-service, data-src, data-type

    The copy takes the real type from data-type and the real src from
    data-src, carries every other attribute and chains onload so order holds,
    which is what theirs does.

    Freeing a tag claims no consent, and uBlock Origin still blocks whatever
    it then asks for.

*/

(function() {
    'use strict';
    // @include lib/cookieconsent-core.js
    consentRRCookieConsent('reject-unblock');
})();

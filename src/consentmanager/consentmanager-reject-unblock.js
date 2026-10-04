/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    consentmanager.net, for a site that withholds something until a purpose
    is consented to.

    Stores and sends the same refusal as reject - __cmp answers no, and the
    IAB layer refuses as cmpId 31 - while letting the tags their blocker
    parked in the markup go, by their own contract: a .cmplazyload element
    with data-cmp-src, the type from data-cmp-type, the display from
    data-cmp-hide-display, and a script freed by inserting a copy rather than
    retyping it, which is what theirs does.

    Un-parking a tag claims no consent, and uBlock Origin still blocks
    whatever it then asks for.

*/

(function() {
    'use strict';
    // @include lib/consentmanager-core.js
    // @include lib/consentmanager-tcf.js
    consentRRConsentManager('reject-unblock', consentRRConsentManagerTcf);
})();

/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Cookiez, a WordPress plugin served first-party from
    /wp-content/plugins/cookiez/assets/build/banner.js.

    No banner, and their own refusal in their own record: necessary true and
    functional, analytics, advertising and unclassified false, with the
    cookiesHash their page settings carry - which is what stops their gate
    throwing the record away and showing the banner again.

    Their two bridges go with it, gated as theirs are: the WordPress Consent
    API and Google consent mode. Nothing is posted to their REST route, and
    the consentId their server would have minted is carried over rather than
    invented - absent is a shape their own code produces.

    The scripts their blocker parked stay parked. Use
    cookiez-reject-unblock.js on a site that withholds something until a
    category is on.

*/

(function() {
    'use strict';
    // @include lib/cookiez-core.js
    consentRRCookiez('reject');
})();

/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for ConnectHolland's CookieConsentBundle for Symfony, served by
    the site itself from /bundles/chcookieconsent/js/cookie_consent.js.

    Their refusal in their own cookies - Cookie_Consent, Cookie_Consent_Key
    and Cookie_Category_<category> set to false - written the way their own
    CookieHandler writes them, a year out, on path /, SameSite=Lax and Secure
    on an https page. Their server-rendered banner is taken out, because their
    own script is what positions it and their own buttons are type="button":
    with the file blocked the banner sits in the page and cannot be dismissed.

    One resource. Their gating is server-side, in Twig, so nothing in the page
    is parked for an un-block to free - and an accept would be their
    Cookie_Category cookies set to true, which is simply consenting.

*/

(function() {
    'use strict';
    // @include lib/chcookieconsent-core.js
    consentRRChCookieConsent();
})();

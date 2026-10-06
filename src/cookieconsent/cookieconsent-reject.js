/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for CookieConsent v3 by Orest Bida - the MIT-licensed one served
    from cdn.jsdelivr.net/gh/orestbida/cookieconsent@<version>/dist/
    cookieconsent.umd.js, or self-hosted beside a site's own assets. Not
    Osano's old library of the same common name.

    No banner, and their own refusal in their own record: the read-only
    categories accepted, every other one refused, with the consentId, both
    timestamps, the revision and the categories array their own gate checks
    before deciding a record counts.

    Their api goes on window.CookieConsent and waits for the page to call
    run(config), which is their own contract - everything is read from that
    config, including where the record goes. Their auto-clear is done, so the
    cookies a refused category names are deleted; their reloadPage is not,
    because a resource that refuses on every load would reload every load.

    Their cc:onFirstConsent and cc:onConsent go to the window with the record
    as detail, and the onFirstConsent and onConsent callbacks in the page's
    own config are called with the same payload.

    The scripts their manager parked stay parked. Use
    cookieconsent-reject-unblock.js on a site that withholds something until
    a category is on, or cookieconsent-accept.js where a refusal is not an
    option.

*/

(function() {
    'use strict';
    // @include lib/cookieconsent-core.js
    consentRRCookieConsent('reject');
})();

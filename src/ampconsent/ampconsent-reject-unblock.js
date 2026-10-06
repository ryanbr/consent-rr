/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    AMP's amp-consent, for a page that withholds content until consent.

    Stores and reports the same refusal as ampconsent-reject.js - the record
    is REJECTED and what an ad request carries is still a refusal - and only
    answers the runtime's build gate differently: whenPolicyUnblock and
    whenPurposesUnblock say yes, so an element behind data-block-on-consent
    builds.

    That is their own distinction, not one invented here: a policy's unblockOn
    list and the consent state are separate things in their code, and a
    publisher can already set "unblockOn": [4,1,2,3] on the default policy to
    get exactly this. This resource makes that choice for a page that did not.

    Unblocking an element claims no consent, and uBlock Origin still blocks
    whatever the element then asks for.

*/

(function() {
    'use strict';
    // @include lib/ampconsent-core.js
    consentRRAmpConsent('reject-unblock');
})();

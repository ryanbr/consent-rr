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

    Stands in for InMobi Choice's cmp2.js, granting rather than refusing. The
    page sees a visitor who already agreed: no banner, no re-prompt, and a TC
    string that consents to the purposes, special features and vendors the
    tenant's own configuration names - so content a site withholds until the
    answer is yes is shown.

    This one hands consent to IAB vendors, which the refusing resource does
    not. It is for a wall that keeps the page shut, not a default: a string
    that consents to 2000 vendor ids is read by every one of them that asks.

    Global Privacy Control is not overruled by granting. Where the browser
    sends it - Brave does by default - the string still objects to legitimate
    interest and __uspapi still answers 1-Y-, while the purposes the wall is
    waiting on are consented to. They answer different questions: one is a
    standing signal from the browser, the other is this visitor getting past a
    door. A tenant that reads only the consents sees a yes either way.

    What it still does not say yes to: addtl_consent is not written, so
    Google's additional vendors are told nothing either way - the same as the
    refusing resource, and for the same reason, that the id list behind it
    belongs to their vendor list rather than to the page. The USP string stays
    1---, because notice and opt-out under that regime are not consent and a
    grant here says nothing about them.

    Point it at cmp2.js rather than choice.js. choice.js is the loader that
    hands the CMP its tenant configuration, so leaving it alone is what makes
    the answer carry the tenant's own purposes, publisher country and language.

*/

(function() {
    'use strict';
    // @include lib/inmobi-tcf.js
    // @include lib/inmobi-gpp.js
    // @include lib/inmobi-core.js
    consentRRInMobi(consentRRInMobiTcf, consentRRInMobiGpp, true);
})();

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

    Stands in for Civic Cookie Control's cookieControl-9.x.min.js. The page
    sees a visitor who refused every optional category: no banner, no
    re-prompt, the decision already in their own cookie, and CookieControl
    answering as it would on a return visit.

    The site's own CookieControl.load({...}) call supplies the categories, so
    the refusal names them exactly rather than guessing. Where that call asks
    for the IAB module, window.__tcfapi goes in too; where it does not, their
    own script installs none either, and neither does this.

*/

(function() {
    'use strict';
    // @include lib/civic-tcf.js
    // @include lib/civic-core.js
    consentRRCivic(consentRRCivicTcf);
})();

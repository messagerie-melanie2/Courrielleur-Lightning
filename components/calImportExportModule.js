/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

this.NSGetFactory = (cid) => {
    let scriptLoadOrder = [
        "resource://calendar/calendar-js/calIcsImportExport.js",
        "resource://calendar/calendar-js/calHtmlExport.js",
        "resource://calendar/calendar-js/calOutlookCSVImportExport.js",

        "resource://calendar/calendar-js/calListFormatter.js",
        "resource://calendar/calendar-js/calMonthGridPrinter.js",
        "resource://calendar/calendar-js/calWeekPrinter.js",
        "resource://calendar/calendar-js/calTimeWeekPrinter.js",
        "resource://calendar/calendar-js/calPlanningPrinter.js",
        "resource://calendar/calendar-js/calTimeDayPrinter.js",
        "resource://calendar/calendar-js/calOneItemPrinter.js"
    ];

    for (let script of scriptLoadOrder) {
        Services.scriptloader.loadSubScript(script, this);
    }

    let components = [
        calIcsImporter, calIcsExporter, calHtmlExporter, calOutlookCSVImporter,
        calOutlookCSVExporter, calListFormatter, calMonthPrinter, calWeekPrinter,
        calTimeWeekPrinter, calPlanningPrinter, calTimeDayPrinter, calOneItemPrinter
    ];

    this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
    return this.NSGetFactory(cid);
};

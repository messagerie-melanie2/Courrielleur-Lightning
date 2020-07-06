/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is OEone Calendar Code, released October 31st, 2001.
 *
 * The Initial Developer of the Original Code is
 * OEone Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2001
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Garth Smedley <garths@oeone.com>
 *   Mike Potter <mikep@oeone.com>
 *   Colin Phillips <colinp@oeone.com>
 *   Chris Charabaruk <ccharabaruk@meldstar.com>
 *   ArentJan Banck <ajbanck@planet.nl>
 *   Chris Allen <chris@netinflux.com>
 *   Eric Belhaire <belhaire@ief.u-psud.fr>
 *   Michiel van Leeuwen <mvl@exedo.nl>
 *   Matthew Willis <mattwillis@gmail.com>
 *   Martin Schroeder <mschroeder@mozilla.x-home.org>
 *   Joey Minta <jminta@gmail.com>
 *   Diego Mira David <diegomd86@gmail.com>
 *   Eduardo Teruo Katayama <eduardo@ime.usp.br>
 *   Glaucus Augustus Grecco Cardoso <glaucus@ime.usp.br>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://calendar/modules/utils/calL10NUtils.jsm");

ChromeUtils.import("resource://gre/modules/Services.jsm");

var gItem;

function loadItemPrintDialog() {
    gItem = window.arguments[0].item;

    opener.setCursor("auto");

    refreshHtml();

    self.focus();
}

/**
 * Gets the settings from the dialog's UI widgets.
 * notifies an Object with title, layoutCId, eventList, start, and end
 *          properties containing the appropriate values.
 */
function getPrintSettings(receiverFunc) {
    let settings = getWhatToPrintSettings();
    receiverFunc(settings);
}

function getWhatToPrintSettings() {

    let settings = new Object();
    settings.title = gItem.title;
    settings.layoutCId = "@mozilla.org/calendar/printformatter;1?type=oneitem";

    settings.events = new Array();
    settings.events.push(gItem);

    return settings;
}

/**
 * Looks at the selections the user has made (start date, layout, etc.), and
 * updates the HTML in the iframe accordingly. This is also called when a
 * dialog UI element has changed, since we'll want to refresh the preview.
 */
function refreshHtml(finishFunc) {
    getPrintSettings((settings) => {
        document.title = cal.l10n.getCalString("PrintPreviewWindowTitle", [settings.title]);
        let printformatter = Cc[settings.layoutCId].createInstance(Ci.calIPrintFormatter);
        printContent = "";
        try {

            let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
            const PR_UINT32_MAX = 4294967295; // signals "infinite-length"
            pipe.init(true, true, 0, PR_UINT32_MAX, null);
            printformatter.formatToHtml(pipe.outputStream,
                                        null,
                                        null,
                                        settings.events.length,
                                        settings.events,
                                        settings.title);
            pipe.outputStream.close();
            // convert byte-array to UTF-8 string:
            let convStream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                                 .createInstance(Ci.nsIConverterInputStream);
            convStream.init(pipe.inputStream, "UTF-8", 0,
                            Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
            try {
                let portion = {};
                while (convStream.readString(-1, portion)) {
                    printContent += portion.value;
                }
            } finally {
                convStream.close();
            }
        } catch (e) {
            Components.utils.reportError("Calendar print dialog:refreshHtml: " + e);
        }

        printContent = "data:text/html," + encodeURIComponent(printContent);
        document.getElementById("content").src = printContent;

        if (finishFunc) {
            finishFunc();
        } else{
          // CM2V3 - Else Print preview
          // Calendar PrintUtils
          PrintUtils.printPreview(PrintPreviewListener);
        }
    }
);
}


/** CM2V3 PrintPreviewListener **/ 
var PrintPreviewListener = {
  getPrintPreviewBrowser: function () {
    var browser = document.getElementById("ppBrowser");
    if (!browser) {
      browser = document.createElement("browser");
      browser.setAttribute("id", "ppBrowser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablesecurity", "true");
      browser.setAttribute("type", "content");
      document.getElementById("firstHbox").appendChild(browser);
    }
    return browser;
  },
  getSourceBrowser: function () {
    return document.getElementById("content");
  },
  getNavToolbox: function () {
    return document.getElementById("firstHbox");
  },
  onEnter: function () {
    document.getElementById("content").collapsed = true;
  },
  onExit: function () {
    window.close();
    // CM2V3 MANTIS 2284: Orientation automatique lors des impressions - Sauvegarde l'orientation
    var printSettings=PrintUtils.getPrintSettings();

    try {
      if (gPrintSettingsAreGlobal && gSavePrintSettings) {
        printSettings.orientation = save_orientation;
        let psrv = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                              .getService(Components.interfaces.nsIPrintSettingsService);
        psrv.savePrintSettingsToPrefs(printSettings, true, printSettings.kInitSaveOrientation);
      }
    } catch (e) {} 
  }
};

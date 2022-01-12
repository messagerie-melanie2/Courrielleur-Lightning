/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

ChromeUtils.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");

/*
 * Helpers for printing and print preparation
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.print namespace.

this.EXPORTED_SYMBOLS = ["calprint"]; /* exported calprint */

var gPrintSettingsAreGlobal = false;

var calprint = {
    /**
     * Returns a simple key in the format YYYY-MM-DD for use in the table of
     * dates to day boxes
     *
     * @param dt    The date to translate
     * @return      YYYY-MM-DD
     */
    getDateKey: function(date) {
        return date.year + "-" + date.month + "-" + date.day;
    },

    /**
     * Add category styles to the document's "sheet" element. This is needed
     * since the HTML created is serialized, so we can't dynamically set the
     * styles and can be changed if the print formatter decides to return a
     * DOM document instead.
     *
     * @param document      The document that contains <style id="sheet"/>.
     * @param categories    Array of categories to insert rules for.
     */
    insertCategoryRules: function(document, categories) {
        let sheet = document.getElementById("sheet");
        sheet.insertedCategoryRules = sheet.insertedCategoryRules || {};

        for (let category of categories) {
            let prefName = cal.view.formatStringForCSSRule(category);
            let color = Preferences.get("calendar.category.color." + prefName) || "transparent";
            if (!(prefName in sheet.insertedCategoryRules)) {
                sheet.insertedCategoryRules[prefName] = true;
                let ruleAdd = ' .category-color-box[categories~="' + prefName + '"] { ' +
                              " border: 2px solid " + color + "; }\n";
                sheet.textContent += ruleAdd;
            }
        }
    },

    /**
     * Add calendar styles to the document's "sheet" element. This is needed
     * since the HTML created is serialized, so we can't dynamically set the
     * styles and can be changed if the print formatter decides to return a
     * DOM document instead.
     *
     * @param document      The document that contains <style id="sheet"/>.
     * @param categories    The calendar to insert a rule for.
     */
    insertCalendarRules: function(document, calendar) {
        let sheet = document.getElementById("sheet");
        let color = calendar.getProperty("color") || "#A8C2E1";
        sheet.insertedCalendarRules = sheet.insertedCalendarRules || {};

        if (!(calendar.id in sheet.insertedCalendarRules)) {
            sheet.insertedCalendarRules[calendar.id] = true;
            let formattedId = cal.view.formatStringForCSSRule(calendar.id);
            let ruleAdd = ' .calendar-color-box[calendar-id="' + formattedId + '"] { ' +
                          " background-color: " + color + "; " +
                          " color: " + cal.view.getContrastingTextColor(color) + "; }\n";
            sheet.textContent += ruleAdd;
        }
    },

    /**
     * Serializes the given item by setting marked nodes to the item's content.
     * Has some expectations about the DOM document (in CSS-selector-speak), all
     * following nodes MUST exist.
     *
     * - #item-template will be cloned and filled, and modified:
     *   - .item-interval gets the time interval of the item.
     *   - .item-title gets the item title
     *   - .category-color-box gets a 2px solid border in category color
     *   - .calendar-color-box gets background color of the calendar
     *
     * @param document          The DOM Document to set things on
     * @param item              The item to serialize
     * @param dayContainer      The DOM Node to insert the container in
     */
    addItemToDaybox: function(document, item, boxDate, dayContainer) {
        // Clone our template
        let itemNode = document.getElementById("item-template").cloneNode(true);
        itemNode.removeAttribute("id");
        itemNode.item = item;

        // Fill in details of the item
        let itemInterval = cal.print.getItemIntervalString(item, boxDate);
        itemNode.querySelector(".item-interval").textContent = itemInterval;
        itemNode.querySelector(".item-title").textContent = item.title;
        if (item.hasProperty('LOCATION')) {
          let lieu="("+item.getProperty('LOCATION')+")";
          itemNode.querySelector(".item-lieu").textContent=lieu;
        }

        // Fill in calendar color
        itemNode.querySelector(".calendar-color-box")
                .setAttribute("calendar-id", cal.view.formatStringForCSSRule(item.calendar.id));
        cal.print.insertCalendarRules(document, item.calendar);

        //itemEvent
        let td=itemNode.querySelector(".itemEvent");
        let categories=item.getCategories({});
        if (0<categories.length) {
          let pref=cal.view.formatStringForCSSRule(categories[0]);
          let color=Services.prefs.getCharPref("calendar.category.color."+pref, "transparent");
          td.setAttribute("style", "border-right:solid 8px "+color+";");
        }

        // icones
        let imgDoc=document.getElementById("itemEvent-img");
        let calColor=item.calendar.getProperty('color');
        if (!calColor){
            calColor="#A8C2E1";
        }

        // prive
        if (item.hasProperty("CLASS") &&
            "PRIVATE"==item.getProperty("CLASS")) {
          let img=imgDoc.cloneNode(true);
          img.removeAttribute("id");
          img.setAttribute('src', this.getBase64Picto("locked"));
          td.appendChild(img);
        }

        // annulé
        if (item.hasProperty("STATUS") && "CANCELLED"==item.getProperty("STATUS")) {
          let style="text-decoration-line: line-through;background-color:#9AE46D;";
          td.setAttribute("style", style);
        }
        
        // participants
        let parts=item.getAttendees({});
        if (parts && 0!=parts.length) {
          let img=imgDoc.cloneNode(true);
          img.removeAttribute("id");
          img.setAttribute('src', this.getBase64Picto("attendees"));
          td.appendChild(img);
        }

        //attachement
        let attachments = item.getAttachments({});
        if (attachments && 0!=attachments.length) {
          let img=imgDoc.cloneNode(true);
          img.removeAttribute("id");
          let nomImg="attach-"+(cal.view.getContrastingTextColor(calColor)=="white"?"fff":"000");
          img.setAttribute('src', this.getBase64Picto(nomImg));
          td.appendChild(img);
        }

        //recurent
        if (!(item==item.parentItem ||
            item.parentItem.recurrenceInfo.getExceptionFor(item.recurrenceId))) {
          let img=imgDoc.cloneNode(true);
          img.removeAttribute("id");
          let nomImg="recur-"+(cal.view.getContrastingTextColor(calColor)=="white"?"fff":"000");
          img.setAttribute('src', this.getBase64Picto(nomImg));
          td.appendChild(img);
        }

        // Add it to the day container in the right order
        cal.data.binaryInsertNode(dayContainer, itemNode, item, cal.view.compareItems);
    },

    /**
     * Serializes the given item by setting marked nodes to the item's
     * content. Should be used for tasks with no start and due date. Has
     * some expectations about the DOM document (in CSS-selector-speak),
     * all following nodes MUST exist.
     *
     * - Nodes will be added to #task-container.
     * - #task-list-box will have the "hidden" attribute removed.
     * - #task-template will be cloned and filled, and modified:
     *   - .task-checkbox gets the "checked" attribute set, if completed
     *   - .task-title gets the item title.
     *
     * @param document          The DOM Document to set things on
     * @param item              The item to serialize
     */
    addItemToDayboxNodate: function(document, item) {
        let taskContainer = document.getElementById("task-container");
        let taskNode = document.getElementById("task-template").cloneNode(true);
        taskNode.removeAttribute("id");
        taskNode.item = item;

        let taskListBox = document.getElementById("tasks-list-box");
        if (taskListBox.hasAttribute("hidden")) {
            let tasksTitle = document.getElementById("tasks-title");
            taskListBox.removeAttribute("hidden");
            tasksTitle.textContent = cal.l10n.getCalString("tasksWithNoDueDate");
        }

        // Fill in details of the task
        if (item.isCompleted) {
            taskNode.querySelector(".task-checkbox").setAttribute("checked", "checked");
        }

        taskNode.querySelector(".task-title").textContent = item.title;

        let collator = cal.l10n.createLocaleCollator();
        cal.data.binaryInsertNode(taskContainer, taskNode, item, (a, b) => collator.compareString(0, a, b), node => node.item.title);
    },

    /**
     * Get time interval string for the given item. Returns an empty string for all-day items.
     *
     * @param aItem     The item providing the interval
     * @return          The string describing the interval
     */
    getItemIntervalString: function(aItem, aBoxDate) {
        // omit time label for all-day items
        let startDate = aItem[cal.dtz.startDateProp(aItem)];
        let endDate = aItem[cal.dtz.endDateProp(aItem)];
        if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
            return "";
        }

        // check for tasks without start and/or due date
        if (!startDate || !endDate) {
            return cal.getDateFormatter().formatItemTimeInterval(aItem);
        }

        let dateFormatter = cal.getDateFormatter();
        let defaultTimezone = cal.dtz.defaultTimezone;
        startDate = startDate.getInTimezone(defaultTimezone);
        endDate = endDate.getInTimezone(defaultTimezone);
        let start = startDate.clone();
        let end = endDate.clone();
        start.isDate = true;
        end.isDate = true;
        if (start.compare(end) == 0) {
            // Events that start and end in the same day.
            return dateFormatter.formatTimeInterval(startDate, endDate);
        } else {
            // Events that span two or more days.
            let compareStart = aBoxDate.compare(start);
            let compareEnd = aBoxDate.compare(end);
            if (compareStart == 0) {
                return "\u21e4 " + dateFormatter.formatTime(startDate); // unicode '⇤'
            } else if (compareStart > 0 && compareEnd < 0) {
                return "\u21ff";                                        // unicode '↔'
            } else if (compareEnd == 0) {
                return "\u21e5 " + dateFormatter.formatTime(endDate);   // unicode '⇥'
            } else {
                return "";
            }
        }
    },

    htmlEscape: function htmlEscape(str) {
      return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    // CM2V6 - Print picto
    getBase64Picto: function getBase64Picto (aTypePicto) {
      switch (aTypePicto) {

        // Attachments icons
        case "attach-000":
          return "data:image/png;base64,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";

        case "attach-fff":
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A\n/wD/oL2nkwAAAAlwSFlzAAAewQAAHsEBw2lUUwAAAAd0SU1FB9wBDQoZEO0CuzMAAAHHSURBVCjP\nfZAxaBpxGMXfJf8WQT2kvaG9xRLuMmQqJd26lJKiiyE9iRbc5Ci4FAtCWskg1K0gZHBQI1QQepwH\n2oOqoAimHtzqUCg4HChdesmFw0ZMremQxNYOfeP3/d77Ph7wlxKJBAAglUqtViqVUK/Xa2qa9kmW\nZT/+p1ardZDL5Q4AsBRFbWSz2Q/NZjMEANS/cLfb3e33+/sPNzfPf11cfDs5Pg7pus7yPP9K07SX\nKwAgiiIAoFwu37Es6y3HcbeebG3tHRYKnwkhEk3T54QQqlarzZfS2+12RZblH36/f+Nq5JQkaSBJ\nUiGTyQgAsHINdzqdPdM0heFw+Lper38BgI+q+tTldN4zDGMWj8cVAFi9NjAM89jr9d6MRqMvACCf\nz992u1zvrdNTKxaLLVoiAFAqldY8Hs92IBBYLGazn2/m8/maoigPAICmadi2ffkSwzBhXdffAfje\naDQuk8gN1jCM/Wq1+lUQBNi2/efCaDQiLMtOAMDn86FYLD6j3W6vKIrPAUBRlEUx1BW0HgwGD9d5\n/uhsMnGapnk/EonsADjhOA6DwWDZAADhcPjudDp95HA4zsbjsaaqqpVMJpFOp5eq/w2lybHPwtTT\nMgAAAABJRU5ErkJggg==";

        case "locked":
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAMAAABhq6zVAAAAAXNSR0IArs4c6QAAAQtQTFRFBAMC\nBQQDCAgICQkJCwsHExEOGhMLFhYWHBwcIB0cHh4eLykhKysrLS0tLi4uODg4TU1NgVorcnJyqm8r\npHE2enp6rHEurXMyoHdEo3tLhISEpH5OqIFMtH4+p4JSp4JTuIA+qoRVq4dYrIdYuoRCq4hYuoZH\nvIdGvIhJuolLr41erY1kvIpMsI1fvYxOpZF2vo1Qm5eUxpZdx5tkqKOeyp9oqqqqy6RxzqRwzaZu\nzaZ20KZ0zKd70Kh0z6t8sbGxz6x7zayDzq2D1Kx51a5+0rKJ1bKE2LWMvLy8vr6+1rqUwMDAwcDA\nwsLC2r6a4MKe4cKc4MSg38Sj4cSg4sWh48ai0tLS29vbAAAA69v6/wAAAAF0Uk5TAEDm2GYAAAAB\nYktHRACIBR1IAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2wUbCAwapBH+bAAAAIx0RVh0\nQ29tbWVudABNZW51LXNpemVkIGljb24KPT09PT09PT09PQoKKGMpIDIwMDMgSmFrdWIgJ2ppbW1h\nYycgU3RlaW5lciwgCmh0dHA6Ly9qaW1tYWMubXVzaWNoYWxsLmN6CgpjcmVhdGVkIHdpdGggdGhl\nIEdJTVAsCmh0dHA6Ly93d3cuZ2ltcC5vcmdnisdHAAAAYklEQVQI12NgwAAREREwppQnB4eAFITN\n68sMJM0gcjzeINoHwtEPDPLz87MSBPNC3E3l5OQ1xMCcUBddOzsHdWEwJ8BC29HRSUEczPF3tlRS\nUlWXBXNsjQw0NfXURCJQHQIAMg8Pn/sMm5AAAAAASUVORK5CYII=";

        case "recur-000":
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMAQMAAABsu86kAAAABlBMVEUBAwAAAAApmxC6AAAAAXRS\nTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAAHdElNRQfXBB4VFyc8\nzVA9AAAAJ0lEQVQImWNgYGCQB+IGBgUHhgIHhp8fGBQegNgKDAwCDAz8QCkGAGejBTgaI5dnAAAA\nAElFTkSuQmCC";

        case "recur-fff":
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMAQMAAABsu86kAAAABlBMVEUBAwD///8pJTaoAAAAAXRS\nTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAAHdElNRQfXBB4VGBLt\n5ojRAAAAJ0lEQVQImWNgYGCQB+IGBgUHhgIHhp8fGBQegNgKDAwCDAz8QCkGAGejBTgaI5dnAAAA\nAElFTkSuQmCC";

        case "attendees":
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A\n/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9sFGwgMBSkZ85kAAAH5SURBVCjP\nTZFPSJNxHIc/v73z3Xzd/z8J2kryT8JcoKQUHkYdCoK6BGodIoTWoUNFUYfoJJHSIYRKCrqldTAI\nJbTDEsmBEZPG1oxaiZA5VrbNsXfv3r3v79uhVnuOH3guz4fhL0O35yErFYPbZj4nmeruMAYratA5\nZfJF9WzthmM3Z3bfm4mRphNxIl7hRGWdSNGI52WNrj+OlI21gqNBbNrlteCXTKSoYKpO0DhQ0Yn5\nXAK1NFpFw8hhJwBg2G+X7Otz5lxRgSgwxhjACVB1AoEREViuqHJhYU3BcJ/P1WrPT7rl2K3vqp3n\npBZksgW2xyvCaTGRR+Js/l0KbxKbdxkAjPbiZFNP75TD4xQXl1ewsW2At/PA9KEL949Igm57Hvmi\nqhofTGflWSMAFAQU+gfOV3Z4HGLb/s8QzBIevLcGlpPf1A9rPy69HDkxXi35B9eVnhdjF7Pb4TFS\nlsZp8dE1aj39bLI2eRUBmBX7T3U/DIYGu6a/ltjrjBvMP4DiutGSjHe9gjr3MxF+8l8Ihdonjh7v\nG1ox7ES6roNl0I7VjXoK7LU7OxveBjt83qn4x3i5Khhu+BfO5D5FsbVFjJUAkQEmK2PJSBSX/UuB\n0YMJW+1XRrm+uTuVTAejifBVk9nUDJ1YqaxpHiU1IbTxp1rjvk0g9k/4DdS+3NBPHyKkAAAAAElF\nTkSuQmCC";
      }
    },

    // Print settings
    getPrintSettings: function getPrintSettings() {
      var pref = Components.classes["@mozilla.org/preferences-service;1"]
                           .getService(Components.interfaces.nsIPrefBranch);
      if (pref) {
        gPrintSettingsAreGlobal = pref.getBoolPref("print.use_global_printsettings", false);
      }

      var printSettings;
      try {
        var PSSVC = Components.classes["@mozilla.org/gfx/printsettings-service;1"]
                            .getService(Components.interfaces.nsIPrintSettingsService);
        if (gPrintSettingsAreGlobal) {
          printSettings = PSSVC.globalPrintSettings;
          if (!printSettings.printerName)
            printSettings.printerName = PSSVC.defaultPrinterName;

          // First get any defaults from the printer
          PSSVC.initPrintSettingsFromPrinter(printSettings.printerName, printSettings);
          // now augment them with any values from last time
          PSSVC.initPrintSettingsFromPrefs(printSettings, true,  printSettings.kInitSaveAll);
        } else {
          printSettings = PSSVC.newPrintSettings;
        }
      } catch (e) {
         dump("getPrintSettings: "+e+"\n");
      }
      return printSettings;
    },

    savePrintSettings: function(settings, flags){

      let PSSVC=Cc["@mozilla.org/gfx/printsettings-service;1"]
                        .getService(Ci.nsIPrintSettingsService);
      PSSVC.savePrintSettingsToPrefs(settings, true, flags);
    },
    
    // retourne hauteur utile en mm
    calculeHauteurUtile: function(){
    
      const kIPrintSettings=Components.interfaces.nsIPrintSettings;
      let settings=cal.print.getPrintSettings();
      
      let hauteur;
      if (kIPrintSettings.kPortraitOrientation==settings.orientation){
        hauteur=settings.paperHeight;
        if (-1==hauteur)
          hauteur=297;
      } else{
        hauteur=settings.paperWidth;
        if (-1==hauteur)
          hauteur=210;
      }
      if (kIPrintSettings.kPaperSizeInches==settings.paperSizeUnit)
        hauteur*=25.4;
      
      hauteur-=(settings.marginTop+settings.marginBottom)*25.4;
      
      return hauteur;
    }
};

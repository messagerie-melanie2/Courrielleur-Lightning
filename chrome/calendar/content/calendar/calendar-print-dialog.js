/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported loadCalendarPrintDialog, printAndClose, onDatePick */

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

var printContent = "";

// MANTIS 2284: Orientation automatique lors des impressions - Sauvegarde l'orientation
var save_orientation;

/**
 * Gets the calendar view from the opening window
 */
function getCalendarView() {
    let theView = window.opener.currentView();
    if (!theView.startDay) {
        theView = null;
    }
    return theView;
}

/**
 * Loads the print dialog, setting up all needed elements.
 */
function loadCalendarPrintDialog() {
    // set the datepickers to the currently selected dates
    let theView = getCalendarView();
    if (theView) {
        document.getElementById("start-date-picker").value = cal.dtz.dateTimeToJsDate(theView.startDay);
        document.getElementById("end-date-picker").value = cal.dtz.dateTimeToJsDate(theView.endDay);
    } else {
        document.getElementById("printCurrentViewRadio").setAttribute("disabled", true);
    }
    if (!theView || !theView.getSelectedItems({}).length) {
        document.getElementById("selected").setAttribute("disabled", true);
    }
    document.getElementById(theView ? "printCurrentViewRadio" : "custom-range")
            .setAttribute("selected", true);

    // MANTIS 2284: Orientation automatique lors des impressions - Sauvegarde l'orientation
    var printSettings = PrintUtils.getPrintSettings();
    save_orientation = printSettings.orientation;

    // selection du modele selon vue active
    let indexSel=0;
    let modele="";
    if (theView) {
      if (theView.nodeName == "calendar-month-view"
          || theView.nodeName == "calendar-multiweek-view")
        modele="type=monthgrid";
      else if (theView.nodeName == "calendar-day-view"
              || theView.nodeName == "calendar-agenda-view")
        modele="type=timeday";
      else if (theView.nodeName == "calendar-week-view"
              || theView.nodeName == "calendar-week-agenda-view"
              || theView.nodeName == "calendar-week2-agenda-view")
        modele="type=timeweek";
    }

    // Get a list of formatters
    let catman = Components.classes["@mozilla.org/categorymanager;1"]
                           .getService(Components.interfaces.nsICategoryManager);
    let catenum = catman.enumerateCategory("cal-print-formatters");

    // Walk the list, adding items to the layout menupopup
    let layoutList = document.getElementById("layout-field");
    while (catenum.hasMoreElements()) {
        let entry = catenum.getNext();
        entry = entry.QueryInterface(Components.interfaces.nsISupportsCString);
        let contractid = catman.getCategoryEntry("cal-print-formatters", entry);
        let formatter = Components.classes[contractid]
                                  .getService(Components.interfaces.calIPrintFormatter);
        // Use the contractid as value
        let itemMenu=layoutList.appendItem(formatter.name, contractid);
        if (theView &&
            contractid.endsWith(modele))
          indexSel=layoutList.getIndexOfItem(itemMenu);
    }
    layoutList.selectedIndex=indexSel;

    // liste des agendas
    // CM2V3 - Add calendars list
    // Walk the list, adding items to the calendars layout menupopup
    let calendarsLayoutList = document.getElementById("calendars-layout-field");
    let sbs = Components.classes["@mozilla.org/intl/stringbundle;1"]
                    .getService(Components.interfaces.nsIStringBundleService);
    let props = Services.strings.createBundle("chrome://calendar/locale/calendar.properties");
    let libAll = props.GetStringFromName("all");

    let calendars = cal.getCalendarManager().getCalendars({});

    calendarsLayoutList.appendItem(libAll, "All");
    let count = 0;
    for (var calendar of calendars) {
        if (!calendar.getProperty("disabled") && calendar.getProperty("calendar-main-in-composite")) {
	        // Use the calendar id as value
	        var max_length = 28;
          calendarsLayoutList.appendItem(calendar.name.substr(0, max_length - 3) + (calendar.name.length > max_length ? "..." : ""), calendar.id);
          count++;
	      }
    }
    if (count == 1)
      calendarsLayoutList.removeItemAt(0);
    calendarsLayoutList.selectedIndex = 0;
    // fin liste des agendas

    opener.setCursor("auto");

    eventsAndTasksOptions("tasks");

    refreshHtml();

    self.focus();
}

/**
 * Retrieves a settings object containing info on what to print. The
 * receiverFunc will be called with the settings object containing various print
 * settings.
 *
 * @param receiverFunc  The callback function to call on completion.
 */
function getPrintSettings(receiverFunc) {
    let tempTitle = document.getElementById("title-field").value;
    let settings = {};
    let requiresFetch = true;
    settings.title = tempTitle || cal.l10n.getCalString("Untitled");
    settings.layoutCId = document.getElementById("layout-field").value;
    settings.start = null;
    settings.end = null;
    settings.eventList = [];
    settings.printEvents = document.getElementById("events").checked;
    settings.printTasks = document.getElementById("tasks").checked;
    settings.printCompletedTasks = document.getElementById("completed-tasks").checked;
    settings.printTasksWithNoDueDate = document.getElementById("tasks-with-no-due-date").checked;
    let theView = getCalendarView();
    switch (document.getElementById("view-field").selectedItem.value) {
        case "currentView":
        case "": { // just in case
            settings.start = theView.startDay.clone();
            settings.end = theView.endDay.clone();
            settings.end.day += 1;
            settings.start.isDate = false;
            settings.end.isDate = false;
            break;
        }
        case "selected": {
            let selectedItems = theView.getSelectedItems({});
            settings.eventList = selectedItems.filter((item) => {
                if (cal.item.isEvent(item) && !settings.printEvents) {
                    return false;
                }
                if (cal.item.isToDo(item) && !settings.printTasks) {
                    return false;
                }
                return true;
            });

            // If tasks should be printed, also include selected tasks from the
            // opening window.
            if (settings.printTasks) {
                let selectedTasks = window.opener.getSelectedTasks();
                for (let task of selectedTasks) {
                    settings.eventList.push(task);
                }
            }

            // We've set the event list above, no need to fetch items below.
            requiresFetch = false;
            break;
        }
        case "custom": {
            // We return the time from the timepickers using the selected
            // timezone, as not doing so in timezones with a positive offset
            // from UTC may cause the printout to include the wrong days.
            let currentTimezone = cal.dtz.defaultTimezone;
            settings.start = cal.dtz.jsDateToDateTime(document.getElementById("start-date-picker").value);
            settings.start = settings.start.getInTimezone(currentTimezone);
            settings.end = cal.dtz.jsDateToDateTime(document.getElementById("end-date-picker").value);
            settings.end = settings.end.getInTimezone(currentTimezone);
            settings.end = settings.end.clone();
            settings.end.day += 1;
            break;
        }
        default: {
            dump("Error : no case in printDialog.js::printCalendar()");
            break;
        }
    }

    // Some filters above might have filled the events list themselves. If not,
    // then fetch the items here.
    if (requiresFetch) {
        let listener = {
            QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
            onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDateTime) {
                receiverFunc(settings);
            },
            onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
                settings.eventList = settings.eventList.concat(aItems);
                if (!settings.printTasksWithNoDueDate) {
                    eventWithDueDate = [];
                    for (let item of settings.eventList) {
                        if (item.dueDate || item.endDate) {
                            eventWithDueDate.push(item);
                        }
                    }
                    settings.eventList = eventWithDueDate;
                }
            }
        };
        let filter = getFilter(settings);
        if (filter) {
            cal.view.getCompositeCalendar(window.opener).getItems(filter, 0, settings.start, settings.end, listener);
        } else {
            // No filter means no items, just complete with the empty list set above
            receiverFunc(settings);
        }
    } else {
        receiverFunc(settings);
    }
}

/**
 * Sets up the filter for a getItems call based on the javascript settings
 * object
 *
 * @param settings      The settings data to base upon
 */
function getFilter(settings) {
    let filter = 0;
    if (settings.printTasks) {
        filter |= Components.interfaces.calICalendar.ITEM_FILTER_TYPE_TODO;
        if (settings.printCompletedTasks) {
            filter |= Components.interfaces.calICalendar.ITEM_FILTER_COMPLETED_ALL;
        } else {
            filter |= Components.interfaces.calICalendar.ITEM_FILTER_COMPLETED_NO;
        }
    }

    if (settings.printEvents) {
        filter |= Components.interfaces.calICalendar.ITEM_FILTER_TYPE_EVENT |
                  Components.interfaces.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
    }
    return filter;
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
            // CM2V3 - Add events in selected calendar list
            let calendarsLayoutList = document.getElementById("calendars-layout-field");
            if (calendarsLayoutList.selectedIndex > 0) {
              let tmpList = [];
              for (var event of settings.eventList) {
                if (event.calendar.id == calendarsLayoutList.value) {
                  tmpList.push(event);
                }
              }
              settings.eventList = tmpList;
            }
            // fin CM2V3

            let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
            const PR_UINT32_MAX = 4294967295; // signals "infinite-length"
            pipe.init(true, true, 0, PR_UINT32_MAX, null);
            printformatter.formatToHtml(pipe.outputStream,
                                        settings.start,
                                        settings.end,
                                        settings.eventList.length,
                                        settings.eventList,
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

    let browser = document.getElementById("ppBrowser");
    if (null==browser) {
      browser=document.createElement("browser");
      browser.setAttribute("id", "ppBrowser");
      browser.setAttribute("flex", "1");
      browser.setAttribute("disablehistory", "true");
      browser.setAttribute("disablesecurity", "true");
      browser.setAttribute("type", "content");
      //document.getElementById("firstHbox").appendChild(browser);
      document.getElementById("firstHbox").insertBefore(browser, document.getElementById("content"));
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

    // MANTIS 2284: Orientation automatique lors des impressions - Sauvegarde l'orientation
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


/**
 * Prints the document and then closes the window
 */
function printAndClose() {
    refreshHtml(() => {
        let printSettings = PrintUtils.getPrintSettings();
        // Evicts "about:blank" header
        printSettings.docURL = " ";

        // we don't do anything with statusFeedback, msgPrintEngine requires it
        let statusFeedback = Cc["@mozilla.org/messenger/statusfeedback;1"]
                                 .createInstance();
        statusFeedback = statusFeedback.QueryInterface(Ci.nsIMsgStatusFeedback);

        let printWindow = window.openDialog("chrome://messenger/content/msgPrintEngine.xul",
                                            "", "chrome,dialog=no,all", 1, [printContent],
                                            statusFeedback, false, 0);

        let closer = (aEvent) => {
            // printWindow is loaded multiple time in the print process and only
            // at the end with fully loaded document, so we must not register a
            // onetime listener here nor should we close too early so that the
            // the opener is still available when the document finally loaded
            if (aEvent.type == "unload" && printWindow.document.readyState == "complete") {
                printWindow.removeEventListener("unload", closer);
                window.close();
            }
        };
        printWindow.addEventListener("unload", closer);

        if (gPrintSettingsAreGlobal && gSavePrintSettings) {
            let PSSVC = Cc["@mozilla.org/gfx/printsettings-service;1"]
                            .getService(Ci.nsIPrintSettingsService);
            PSSVC.savePrintSettingsToPrefs(printSettings, true,
                                           printSettings.kInitSaveAll);
            PSSVC.savePrintSettingsToPrefs(printSettings, false,
                                           printSettings.kInitSavePrinterName);
        }
    });
    return false; // leave open
}

/**
 * Called when once a date has been selected in the datepicker.
 */
function onDatePick() {
    let radioGroup = document.getElementById("view-field");
    let items = radioGroup.getElementsByTagName("radio");
    let index;
    for (let i in items) {
        if (items[i].getAttribute("id") == "custom-range") {
            index = i;
            break;
        }
    }

    if (index && index != 0) {
        radioGroup.selectedIndex = index;
        setTimeout(refreshHtml, 0);
    }
}

function eventsAndTasksOptions(targetId) {
    let checkbox = document.getElementById(targetId);
    let checked = checkbox.getAttribute("checked") == "true";
    // Workaround to make the checkbox persistent (bug 15232).
    checkbox.setAttribute("checked", checked ? "true" : "false");

    if (targetId == "tasks") {
        setElementValue("tasks-with-no-due-date", !checked, "disabled");
        setElementValue("completed-tasks", !checked, "disabled");
    }
}

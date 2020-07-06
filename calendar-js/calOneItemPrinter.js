/* -*- Mode: javascript; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is Mozilla Calendar code.
 *
 * The Initial Developer of the Original Code is
 *   Joey Minta <jminta@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * The output code for the time sheet was written by
 *   Ferdinand Grassmann <ferdinand@grassmann.info>
 *
 * Contributor(s):
 *   Matthew Willis <lilmatt@mozilla.com>
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
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/PluralForm.jsm");

/**
 * Prints a time sheet view of a week of events
 */
function calOneItemPrinter() {
  this.wrappedJSObject = this;
}

var calOneItemPrinterClassID = Components.ID("{255229db-781a-11e1-b0c4-0800200c9a66}");
var calOneItemPrinterInterfaces = [Components.interfaces.calIPrintFormatter];
calOneItemPrinter.prototype = {
    classID: calOneItemPrinterClassID,
    QueryInterface: XPCOMUtils.generateQI(calOneItemPrinterInterfaces),

    classInfo: XPCOMUtils.generateCI({
        classID: calOneItemPrinterClassID,
        contractID: "@mozilla.org/calendar/printformatter;1?type=oneitem",
        classDescription: "CalendarOne Item Print Formatter",
        interfaces: calOneItemPrinterInterfaces
    }),

    get name() { return cal.l10n.getCalString("oneitem"); },

    formatToHtml : function(aStream, aStart, aEnd, aCount, aItems, aTitle) {
      // Load the HTML template file  FIXME: might be useful to allow custom template
      let document = cal.xml.parseFile("chrome://calendar-common/skin/printing/calOneItemPrinter.html");

      // Print orientation
      const kIPrintSettings = Components.interfaces.nsIPrintSettings;
      var settings = cal.print.getPrintSettings();

      settings.orientation = kIPrintSettings.kPortraitOrientation;
      var flags = settings.kInitSaveOrientation;
      cal.print.savePrintSettings(settings, flags);

      var props=Services.strings.createBundle("chrome://calendar/locale/calendar.properties");

      // Set page title
      document.getElementById("title").textContent = aTitle;

      // Get the first item
      var item = aItems[0];

      // Set calendar name
      document.getElementById("calendar-name").textContent = "Agenda de " + item.calendar.name;

      let itemContainer=document.getElementById("item-container");
      let divbloc=document.getElementById("blocinfos");
      let divprop=document.getElementById("propriete");
      let ligne=2;
      function fixeLigne(div){
        div.setAttribute("style", "grid-row-start:"+(ligne++)+";");
      }

      // Object
      let div=divbloc.cloneNode("true");
      div.removeAttribute("id");
      div.querySelector(".property-name").textContent=props.GetStringFromName("object");
      div.querySelector(".property-value").textContent=item.title;
      fixeLigne(div);
      itemContainer.appendChild(div);

      // Emplacement
      if (item.hasProperty('LOCATION')) {
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("place");
        div.querySelector(".property-value").textContent=item.getProperty('LOCATION');
        fixeLigne(div);
        itemContainer.appendChild(div);
      }

      // Dates
      var sDate = item.startDate || item.entryDate || item.dueDate;
      var eDate = item.endDate || item.dueDate || item.entryDate;
      var dateFormatter=cal.getDateFormatter();
      var defaultTimezone=cal.dtz.defaultTimezone;
      let dateStartString, dateEndString;
      if (sDate && sDate.isDate) {
        var tmpeDate = eDate.clone();
        tmpeDate.day -= 1;
        if (sDate.icalString == tmpeDate.icalString) {
          let dateString =
               dateFormatter.dayName(sDate.getInTimezone(defaultTimezone).weekday)
               + " " + sDate.getInTimezone(defaultTimezone).day
               + " " + dateFormatter.monthName(sDate.getInTimezone(defaultTimezone).month)
               + " " + sDate.getInTimezone(defaultTimezone).year;
        }
        else {
          dateStartString =
               dateFormatter.dayName(sDate.getInTimezone(defaultTimezone).weekday)
               + " " + sDate.getInTimezone(defaultTimezone).day
               + " " + dateFormatter.monthName(sDate.getInTimezone(defaultTimezone).month)
               + " " + sDate.getInTimezone(defaultTimezone).year;
          dateEndString =
               dateFormatter.dayName(eDate.getInTimezone(defaultTimezone).weekday)
               + " " + eDate.getInTimezone(defaultTimezone).day
               + " " + dateFormatter.monthName(eDate.getInTimezone(defaultTimezone).month)
               + " " + eDate.getInTimezone(defaultTimezone).year;
        }
      }
      else if (sDate) {
        dateStartString =
               dateFormatter.dayName(sDate.getInTimezone(defaultTimezone).weekday)
               + " " + sDate.getInTimezone(defaultTimezone).day
               + " " + dateFormatter.monthName(sDate.getInTimezone(defaultTimezone).month)
               + " " + sDate.getInTimezone(defaultTimezone).year
               + " - " + dateFormatter.formatTime(sDate.getInTimezone(defaultTimezone));
        dateEndString =
               dateFormatter.dayName(eDate.getInTimezone(defaultTimezone).weekday)
               + " " + eDate.getInTimezone(defaultTimezone).day
               + " " + dateFormatter.monthName(eDate.getInTimezone(defaultTimezone).month)
               + " " + eDate.getInTimezone(defaultTimezone).year
               + " - " + dateFormatter.formatTime(eDate.getInTimezone(defaultTimezone));
      }
      if (dateStartString){
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("start");
        div.querySelector(".property-value").textContent=dateStartString;
        fixeLigne(div);
        itemContainer.appendChild(div);
      }
      if (dateEndString){
        let prop=divprop.cloneNode("true");
        prop.removeAttribute("id");
        prop.querySelector(".property-name").textContent=props.GetStringFromName("end");
        prop.querySelector(".property-value").textContent=dateEndString;
        //fixeLigne(div);
        div.appendChild(prop);
      }

      // Catégories
      var categories = item.getCategories({});
      if (categories && categories.length > 0) {
        var categoriesName = "";
        for (var category of categories) {
          categoriesName += (categoriesName == "" ? "" : ", ") + category;
        }
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("categories");
        div.querySelector(".property-value").textContent=categoriesName;
        fixeLigne(div);
        itemContainer.appendChild(div);
      }

      // Statut
      if (item.status) {
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("status");
        div.querySelector(".property-value").textContent=props.GetStringFromName(item.status);;
        fixeLigne(div);
        itemContainer.appendChild(div);
      }

      // Privé
      if (item.hasProperty("CLASS")) {
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("class");
        div.querySelector(".property-value").textContent=props.GetStringFromName(item.getProperty("CLASS"));
        fixeLigne(div);
        itemContainer.appendChild(div);
      }

      // Recurrence
      if (sDate && item.parentItem.recurrenceInfo) {
        let detailsString = this.recurrenceRule2String(item.parentItem.recurrenceInfo, sDate, eDate, sDate.isDate);
        let rrules = this.splitRecurrenceRules(item.parentItem.recurrenceInfo);
        if (rrules[0].length == 1) {
          let rule = rrules[0][0];
          div=divbloc.cloneNode("true");
          div.removeAttribute("id");
          div.querySelector(".property-name").textContent=props.GetStringFromName("recurrence");
          div.querySelector(".property-value").textContent=props.GetStringFromName(rule.type);
          fixeLigne(div);
          itemContainer.appendChild(div);
        }
        if (detailsString) {
          let tpl=document.getElementById("recurrence");
          prop=tpl.cloneNode("true");
          prop.removeAttribute("id");
          prop.querySelector(".property-name").textContent=props.GetStringFromName("recurrencetype");
          prop.querySelector(".property-value").textContent=detailsString;
          //fixeLigne(div);
          div.appendChild(prop);
        }
      }

      // Organisateur
      if (item.organizer) {
        var organizerName = item.organizer.commonName;
        if (!organizerName) organizerName = item.organizer.id.replace(/mailto:/ig, "");
        div=divbloc.cloneNode("true");
        div.removeAttribute("id");
        div.querySelector(".property-name").textContent=props.GetStringFromName("organizer");
        div.querySelector(".property-value").textContent=organizerName;
        fixeLigne(div);
        itemContainer.appendChild(div);
      }

      // Participants
      var attendees=item.getAttendees({});
      var parts;
      var noParts;
      if (attendees && 0 != attendees.length){
        parts = new Array();
        noParts = new Array();
        for (var attendee of attendees) {
          let partName = attendee.commonName;
          if (!partName) partName = attendee.id.replace(/mailto:/ig, "");
          if (attendee.role == "NON-PARTICIPANT") noParts.push(partName);
          else parts.push("[" + props.GetStringFromName(attendee.participationStatus) + "] " + partName);
        }
      }

      // Parts
      if (parts && parts.length > 0) {
        let first=true;
        for (var part of parts) {
          if (first){
            div=divbloc.cloneNode("true");
            div.removeAttribute("id");
            div.querySelector(".property-name").textContent=props.GetStringFromName("participants");
            div.querySelector(".property-value").textContent=part;
            fixeLigne(div);
            itemContainer.appendChild(div);
            first=false;
          } else {
            let prop=divprop.cloneNode("true");
            prop.removeAttribute("id");
            prop.querySelector(".property-value").textContent=part;
            div.appendChild(prop);
          }
        }
      }

      // Non parts
      if (noParts && noParts.length > 0) {
        let first=true;
        for (var noPart of noParts) {
          if (first){
            div=divbloc.cloneNode("true");
            div.removeAttribute("id");
            div.querySelector(".property-name").textContent=props.GetStringFromName("nonparticipants");
            div.querySelector(".property-value").textContent=noPart;
            fixeLigne(div);
            itemContainer.appendChild(div);
            first=false;
          } else{
            let prop=divprop.cloneNode("true");
            prop.removeAttribute("id");
            prop.querySelector(".property-value").textContent=noPart;
            div.appendChild(prop);
          }
        }
      }

      // Pièces jointes
      var attachments = item.getAttachments({});
      if (attachments && 0 != attachments.length){
        let first=true;
        for (var attachment of attachments) {
          if (first){
            div=divbloc.cloneNode("true");
            div.removeAttribute("id");
            div.querySelector(".property-name").textContent=props.GetStringFromName("attachments");
            div.querySelector(".property-value").textContent=cal.attachments.makePrettyName(attachment.uri);
            fixeLigne(div);
            itemContainer.appendChild(div);
            first=false;
          } else {
            let prop=divprop.cloneNode("true");
            prop.removeAttribute("id");
            prop.querySelector(".property-value").textContent=cal.attachments.makePrettyName(attachment.uri);
            div.appendChild(prop);
          }
        }
      }

      // Description
      if (item.hasProperty('DESCRIPTION')) {
        let tpl=document.getElementById("description");
        let div1=tpl.cloneNode(true);
        div1.removeAttribute("id");
        div1.textContent=item.getProperty('DESCRIPTION');
        fixeLigne(div1);
        itemContainer.appendChild(div1);
      }

      // Remove templates from HTML, no longer needed
      let templates = document.getElementById("templates");
      templates.remove();
      // Stream out the resulting HTML
      let html = cal.xml.serializeDOM(document);
      let convStream = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
                                 .createInstance(Components.interfaces.nsIConverterOutputStream);
      convStream.init(aStream, "UTF-8");
      convStream.writeString(html);
    },

    /**
     * This function takes the recurrence info passed as argument and creates a
     * literal string representing the repeat pattern in natural language.
     *
     * @param recurrenceInfo    An item's recurrence info to parse.
     * @param startDate         The start date to base rules on.
     * @param endDate           The end date to base rules on.
     * @param allDay            If true, the pattern should assume an allday item.
     * @return                  A human readable string describing the recurrence.
     */
    recurrenceRule2String: function(recurrenceInfo, startDate, endDate, allDay) {
        function getRString(name, args) {
          return cal.l10n.getString("calendar-event-dialog", name, args);
        }

        // Retrieve a valid recurrence rule from the currently
        // set recurrence info. Bail out if there's more
        // than a single rule or something other than a rule.
        recurrenceInfo = recurrenceInfo.clone();
        let rrules = this.splitRecurrenceRules(recurrenceInfo);
        if (rrules[0].length == 1) {
            let rule = rrules[0][0];
            // currently we don't allow for any BYxxx-rules.
            if (cal.wrapInstance(rule, Components.interfaces.calIRecurrenceRule) &&
                !this.checkRecurrenceRule(rule, ['BYSECOND',
                                            'BYMINUTE',
                                            //'BYDAY',
                                            'BYHOUR',
                                            //'BYMONTHDAY',
                                            'BYYEARDAY',
                                            'BYWEEKNO',
                                            //'BYMONTH',
                                            'BYSETPOS'])) {
                function day_of_week(day) {
                    return Math.abs(day) % 8;
                }
                function day_position(day) {
                    let dow = day_of_week(day);
                    return (Math.abs(day) - dow) / 8 * (day < 0 ? -1 : 1);
                }
                function nounClass(aDayString, aRuleString) {
                    // Select noun class (grammatical gender) for rule string
                    let nounClass = getRString(aDayString + "Nounclass");
                    return aRuleString + nounClass.substr(0, 1).toUpperCase() +
                           nounClass.substr(1);
                }
                function pluralWeekday(aDayString) {
                    let plural = getRString("pluralForWeekdays") == "true";
                    return (plural ? aDayString + "Plural" : aDayString);
                }

                let ruleString;
                if (rule.type == 'DAILY') {
                    if (this.checkRecurrenceRule(rule, ['BYDAY'])) {
                        let days = rule.getComponent("BYDAY", {});
                        let weekdays = [2, 3, 4, 5, 6];
                        if (weekdays.length == days.length) {
                            let i;
                            for (i = 0; i < weekdays.length; i++) {
                                if (weekdays[i] != days[i]) {
                                    break;
                                }
                            }
                            if (i == weekdays.length) {
                                ruleString = getRString("repeatDetailsRuleDaily4");
                            }
                        } else {
                            return false;
                        }
                    } else {
                        let dailyString = getRString("dailyEveryNth");
                        ruleString = PluralForm.get(rule.interval, dailyString)
                                               .replace("#1", rule.interval);
                    }
                } else if (rule.type == 'WEEKLY') {
                    // weekly recurrence, currently we
                    // support a single 'BYDAY'-rule only.
                    if (this.checkRecurrenceRule(rule, ['BYDAY'])) {
                        // create a string like 'Monday, Tuesday and Wednesday'
                        let days = rule.getComponent("BYDAY", {});
                        let weekdays = "";
                        // select noun class (grammatical gender) according to the
                        // first day of the list
                        let weeklyString = nounClass("repeatDetailsDay" + days[0], "weeklyNthOn");
                        for (let i = 0; i < days.length; i++) {
                            if (rule.interval == 1) {
                                weekdays += getRString(pluralWeekday("repeatDetailsDay" + days[i]));
                            } else {
                                weekdays += getRString("repeatDetailsDay" + days[i]);
                            }
                            if (days.length > 1 && i == (days.length - 2)) {
                                weekdays += ' ' + getRString("repeatDetailsAnd") + ' ';
                            } else if (i < days.length - 1) {
                                weekdays += ', ';
                            }
                        }

                        weeklyString = getRString(weeklyString, [weekdays]);
                        ruleString= PluralForm.get(rule.interval, weeklyString)
                                              .replace("#2", rule.interval);

                    } else {
                        let weeklyString = getRString("weeklyEveryNth");
                        ruleString = PluralForm.get(rule.interval, weeklyString)
                                               .replace("#1", rule.interval);
                    }
                } else if (rule.type == 'MONTHLY') {
                    if (this.checkRecurrenceRule(rule, ['BYDAY'])) {
                        let weekdaysString_every = "";
                        let weekdaysString_position = "";
                        let byday = rule.getComponent("BYDAY", {});
                        let firstDay = byday[0];
                        // build two strings for weekdays with and without
                        // "position" prefix, then join these strings
                        for (let i = 0 ; i < byday.length; i++) {
                            if (day_position(byday[i]) == 0) {
                                if (!weekdaysString_every) {
                                    firstDay = byday[i];
                                }
                                weekdaysString_every += getRString(pluralWeekday("repeatDetailsDay" + byday[i])) + ", ";
                            } else {
                                if (day_position(byday[i]) < -1 || day_position(byday[i]) > 5) {
                                    // we support only weekdays with -1 as negative
                                    // position ('THE LAST ...')
                                    return false;
                                }
                                if (byday.some(function(element) {
                                                   return (day_position(element) == 0 &&
                                                           day_of_week(byday[i]) == day_of_week(element));
                                               })) {
                                    // prevent to build strings such as for example:
                                    // "every Monday and the second Monday..."
                                    continue;
                                }
                                let ordinalString = "repeatOrdinal" + day_position(byday[i]);
                                let dayString = "repeatDetailsDay" + day_of_week(byday[i]);
                                ordinalString = nounClass(dayString, ordinalString);
                                ordinalString = getRString(ordinalString);
                                dayString = getRString(dayString);
                                let stringOrdinalWeekday = getRString("ordinalWeekdayOrder",
                                                                      [ordinalString, dayString]);
                                weekdaysString_position += stringOrdinalWeekday + ", ";
                            }
                        }
                        let weekdaysString = weekdaysString_every + weekdaysString_position;
                        weekdaysString = weekdaysString.slice(0,-2).
                                         replace(/,(?= [^,]*$)/, ' ' + getRString("repeatDetailsAnd"));

                        let monthlyString = weekdaysString_every ? "monthlyEveryOfEvery" : "monthlyRuleNthOfEvery";
                        monthlyString = nounClass("repeatDetailsDay" + day_of_week(firstDay), monthlyString);
                        monthlyString = getRString(monthlyString, [weekdaysString]);
                        ruleString = PluralForm.get(rule.interval, monthlyString).
                                                replace("#2", rule.interval);
                    } else if (this.checkRecurrenceRule(rule, ['BYMONTHDAY'])) {
                        let component = rule.getComponent("BYMONTHDAY", {});

                        // First, find out if the 'BYMONTHDAY' component contains
                        // any elements with a negative value. If so we currently
                        // don't support anything but the 'last day of the month' rule.
                        if (component.some(function(element, index, array) {
                                               return element < 0;
                                           })) {
                            if (component.length == 1 && component[0] == -1) {
                                let monthlyString = getRString("monthlyLastDayOfNth");
                                ruleString = PluralForm.get(rule.interval, monthlyString)
                                                       .replace("#1", rule.interval);
                            } else {
                                // we don't support any other combination for now...
                                return false;
                            }
                        } else {
                            if (component.length == 31 &&
                                component.every(function (element, index, array) {
                                                    for (let i = 0; i < array.length; i++) {
                                                        if ((index + 1) == array[i]) {
                                                            return true;
                                                        }
                                                    }
                                                    return false;
                                                })) {
                                // i.e. every day every N months
                                ruleString = getRString("monthlyEveryDayOfNth");
                                ruleString = PluralForm.get(rule.interval, ruleString)
                                                       .replace("#2", rule.interval);
                            } else {
                                // i.e. one or more monthdays every N months
                                let day_string = "";
                                for (let i = 0; i < component.length; i++) {
                                    day_string += component[i];
                                    if (component.length > 1 &&
                                        i == (component.length - 2)) {
                                        day_string += ' ' + getRString("repeatDetailsAnd") + ' ';
                                    } else if (i < component.length-1) {
                                        day_string += ', ';
                                    }
                                }
                                let monthlyString = getRString("monthlyDayOfNth", [day_string]);
                                ruleString = PluralForm.get(rule.interval, monthlyString)
                                                       .replace("#2", rule.interval);
                            }
                        }
                    } else {
                        let monthlyString = getRString("monthlyDayOfNth", [startDate.day]);
                        ruleString = PluralForm.get(rule.interval, monthlyString)
                                               .replace("#2", rule.interval);
                    }
                } else if (rule.type == 'YEARLY') {
                    let bymonth = rule.getComponent("BYMONTH", {});
                    if (this.checkRecurrenceRule(rule, ['BYMONTH']) &&
                        this.checkRecurrenceRule(rule, ['BYMONTHDAY'])) {
                        let bymonthday = rule.getComponent("BYMONTHDAY", {});

                        if (bymonth.length == 1 && bymonthday.length == 1) {
                            let monthNameString = getRString("repeatDetailsMonth" + bymonth[0]);

                            let yearlyString = getRString("yearlyNthOn",
                                                          [monthNameString, bymonthday[0]]);
                            ruleString = PluralForm.get(rule.interval, yearlyString)
                                                   .replace("#3", rule.interval);
                        }
                    } else if (this.checkRecurrenceRule(rule, ['BYMONTH']) &&
                               this.checkRecurrenceRule(rule, ['BYDAY'])) {
                        let byday = rule.getComponent("BYDAY", {});

                        if (bymonth.length == 1 && byday.length == 1) {
                            let dayString = "repeatDetailsDay" + day_of_week(byday[0]);
                            let month = getRString("repeatDetailsMonth" + bymonth[0]);
                            if (day_position(byday[0]) == 0) {
                                let yearlyString = "yearlyOnEveryNthOfNth";
                                yearlyString = nounClass(dayString, yearlyString);
                                let day = getRString(pluralWeekday(dayString));
                                yearlyString = getRString(yearlyString, [day, month]);
                                ruleString = PluralForm.get(rule.interval, yearlyString)
                                                       .replace("#3", rule.interval);
                            } else {
                                let yearlyString = "yearlyNthOnNthOf";
                                let ordinalString = "repeatOrdinal" + day_position(byday[0])
                                yearlyString = nounClass(dayString, yearlyString);
                                ordinalString = nounClass(dayString, ordinalString);
                                let ordinal = getRString(ordinalString);
                                let day = getRString(dayString);
                                yearlyString = getRString(yearlyString, [ordinal, day, month]);
                                ruleString = PluralForm.get(rule.interval, yearlyString)
                                                       .replace("#4", rule.interval);
                            }
                        } else {
                            return false;
                        }
                    } else {
                        let monthNameString = getRString("repeatDetailsMonth" + (startDate.month + 1));

                        let yearlyString = getRString("yearlyNthOn",
                                                      [monthNameString, startDate.day]);
                        ruleString = PluralForm.get(rule.interval, yearlyString)
                                               .replace("#3", rule.interval);
                    }
                }

                let kDefaultTimezone=cal.dtz.defaultTimezone;
                let dateFormatter = cal.getDateFormatter();

                let detailsString;
                if (!endDate || allDay) {
                    if (rule.isFinite) {
                        if (rule.isByCount) {
                            let countString = getRString("repeatCountAllDay",
                                [ruleString,
                                 dateFormatter.formatDateShort(startDate)]);
                            detailsString = PluralForm.get(rule.count, countString)
                                                      .replace("#3", rule.count);
                        } else {
                            let untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
                            detailsString = getRString("repeatDetailsUntilAllDay",
                                [ruleString,
                                 dateFormatter.formatDateShort(startDate),
                                 dateFormatter.formatDateShort(untilDate)]);
                        }
                    } else {
                        detailsString = getRString("repeatDetailsInfiniteAllDay",
                                                   [ruleString,
                                                    dateFormatter.formatDateShort(startDate)]);
                    }
                } else {
                    if (rule.isFinite) {
                        if (rule.isByCount) {
                            let countString = getRString("repeatCount",
                                [ruleString,
                                 dateFormatter.formatDateShort(startDate),
                                 dateFormatter.formatTime(startDate),
                                 dateFormatter.formatTime(endDate) ]);
                            detailsString = PluralForm.get(rule.count, countString)
                                                      .replace("#5", rule.count);
                        } else {
                            let untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
                            detailsString = getRString("repeatDetailsUntil",
                                [ruleString,
                                 dateFormatter.formatDateShort(startDate),
                                 dateFormatter.formatDateShort(untilDate),
                                 dateFormatter.formatTime(startDate),
                                 dateFormatter.formatTime(endDate)]);
                        }
                    } else {
                        detailsString = getRString("repeatDetailsInfinite",
                            [ruleString,
                             dateFormatter.formatDateShort(startDate),
                             dateFormatter.formatTime(startDate),
                             dateFormatter.formatTime(endDate) ]);
                    }
                }
                return detailsString;
            }
        }
        return false;
    },

    /**
     * Split rules into negative and positive rules.
     *
     * @param recurrenceInfo    An item's recurrence info to parse.
     * @return                  An array with two elements: an array of positive
     *                            rules and an array of negative rules.
     */
    splitRecurrenceRules: function(recurrenceInfo) {
        var ritems = recurrenceInfo.getRecurrenceItems({});
        var rules = [];
        var exceptions = [];
        for (var r of ritems) {
            if (r.isNegative) {
                exceptions.push(r);
            } else {
                rules.push(r);
            }
        }
        return [rules, exceptions];
    },

    /**
     * Check if a recurrence rule's component is valid.
     *
     * @see                     calIRecurrenceRule
     * @param aRule             The recurrence rule to check.
     * @param aArray            An array of component names to check.
     * @return                  Returns true if the rule is valid.
     */
    checkRecurrenceRule: function(aRule, aArray) {
        for (var comp of aArray) {
            var ruleComp = aRule.getComponent(comp, {});
            if (ruleComp && ruleComp.length > 0) {
                return true;
            }
        }
        return false;
    }
};
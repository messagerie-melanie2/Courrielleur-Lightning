/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

/**
 * Prints a two column view of a week of events, much like a paper day-planner
 */
function calWeekPrinter() {
    this.wrappedJSObject = this;
}

var calWeekPrinterClassID = Components.ID("{2d6ec97b-9109-4b92-89c5-d4b4806619ce}");
var calWeekPrinterInterfaces = [Components.interfaces.calIPrintFormatter];
calWeekPrinter.prototype = {
    classID: calWeekPrinterClassID,
    QueryInterface: XPCOMUtils.generateQI(calWeekPrinterInterfaces),

    classInfo: XPCOMUtils.generateCI({
        classID: calWeekPrinterClassID,
        contractID: "@mozilla.org/calendar/printformatter;1?type=weekplan",
        classDescription: "Calendar Week Print Formatter",
        interfaces: calWeekPrinterInterfaces
    }),

    get name() { return cal.l10n.getCalString("weekPrinterName"); },

    formatToHtml: function(aStream, aStart, aEnd, aCount, aItems, aTitle) {
        let document = cal.xml.parseFile("chrome://calendar-common/skin/printing/calWeekPrinter.html");
        let defaultTimezone = cal.dtz.defaultTimezone;

        // Set page title
        document.getElementById("title").textContent = aTitle;
        
        const kIPrintSettings = Components.interfaces.nsIPrintSettings;
        var settings = cal.print.getPrintSettings();

        settings.orientation = kIPrintSettings.kPortraitOrientation;
        var flags = settings.kInitSaveOrientation;
        
        cal.print.savePrintSettings(settings, flags);        

        // Table that maps YYYY-MM-DD to the DOM node container where items are to be added
        let dayTable = {};
        let weekInfoService = cal.getWeekInfoService();
        
        // liste des semaines pour setupListeAgenda
        let semaines=[];

        // Make sure to create tables from start to end, if passed
        if (aStart && aEnd) {
            for (let current = weekInfoService.getStartOfWeek(aStart); current.compare(aEnd) < 0; current.day += 7) {
                this.setupWeek(document, current, dayTable);
                
              // construction de la liste des semaines
              let weekno=weekInfoService.getWeekTitle(current);
              semaines.push(weekno);
            }
        }

        // liste des agendas extraite depuis les événements
        let agendas=[];
        let couleurAgendas=[];
        // liste des categories extraite depuis les événements
        let categories=[];
        
        for (let item of aItems) {
            let itemStartDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
            let itemEndDate = item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];

            if (!itemStartDate && !itemEndDate) {
                cal.print.addItemToDayboxNodate(document, item);
                continue;
            }
            itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
            itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

            let boxDate = itemStartDate.clone();
            boxDate.isDate = true;
            for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
                // Ignore items outside of the range, i.e tasks without start date
                // where the end date is somewhere else.
                if (aStart && aEnd && boxDate &&
                    (boxDate.compare(aStart) < 0 || boxDate.compare(aEnd) >= 0)) {
                    continue;
                }

                let boxDateKey = cal.print.getDateKey(boxDate);

                if (!(boxDateKey in dayTable)) {
                    // Doesn't exist, we need to create a new table for it
                    let startOfWeek = weekInfoService.getStartOfWeek(boxDate);
                    this.setupWeek(document, startOfWeek, dayTable);
                }
                
                // agenda
                let nomag=item.calendar.name;
                if (!agendas.includes(nomag)){
                  agendas.push(nomag);
                  let c=item.calendar.getProperty("color")||"transparent";
                  couleurAgendas.push(c);
                }
                // categories
                for (var cat of item.getCategories({})) {
                  if (!categories.includes(cat)){
                    categories.push(cat);
                  }
                }

                cal.print.addItemToDaybox(document, item, boxDate, dayTable[boxDateKey]);
            }
        }
    
        // construction de la liste des agendas
        // et des categories
        for (var semaine of semaines){
          this.setupListeAgenda(document, agendas, couleurAgendas, semaine);
          
          this.setupListeCategories(document, categories, semaine);
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

    setupWeek: function(document, startOfWeek, dayTable) {
        const weekdayMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

        let weekTemplate = document.getElementById("week-template");
        let weekContainer = document.getElementById("week-container");
        let defaultTimezone = cal.dtz.defaultTimezone;

        // Clone the template week and make sure it doesn't have an id
        let currentPage = weekTemplate.cloneNode(true);
        //currentPage.removeAttribute("id");
        currentPage.item = startOfWeek.clone();
        
        // Set up the week number title
        let weekTitle=this.getDateString(startOfWeek);
        currentPage.querySelector(".week-number").textContent = weekTitle;
        
        let weekInfo=cal.getWeekInfoService();
        let weekno=weekInfo.getWeekTitle(startOfWeek);
        let ident="semaine-"+weekno;
        currentPage.setAttribute("id", ident);

        // Set up the day boxes
        let dateFormatter = cal.getDateFormatter();
        let endOfWeek = weekInfo.getEndOfWeek(startOfWeek);
        for (let currentDate = startOfWeek.clone(); currentDate.compare(endOfWeek) <= 0; currentDate.day++) {
            let weekday = currentDate.weekday;
            let weekdayName = weekdayMap[weekday];
            let dayOffPrefName = "calendar.week.d" + weekday + weekdayName + "soff";
            dayTable[cal.print.getDateKey(currentDate)] = currentPage.querySelector("." + weekdayName + "-container");

            let titleNode = currentPage.querySelector("." + weekdayName + "-title");
            titleNode.textContent = dateFormatter.formatDateLong(currentDate.getInTimezone(defaultTimezone));

            if (Preferences.get(dayOffPrefName, false)) {
                let daysOffNode = currentPage.querySelector("." + weekdayName + "-box");
                daysOffNode.className += " day-off";
            }
        }

        // Now insert the week into the week container, sorting by date (and therefore week number)
        function compareDates(a, b) {
            return !a || !b ? -1 : a.compare(b);
        }

        cal.data.binaryInsertNode(weekContainer, currentPage, currentPage.item, compareDates);
    },
    
    // affichage des agendas
    setupListeAgenda: function(document, agendas, couleurAgendas, semaine){

      if (0==agendas.length)
        return;
      
      let semaineContainer=document.getElementById("semaine-"+semaine);
      let agendasContainer=semaineContainer.querySelector(".agendas-container");
      let libelle=document.getElementById("agenda-libelle");
      
      for (var i=0;i<agendas.length;i++){
        let ag=agendas[i];
        let lib=libelle.cloneNode(true);
        lib.textContent="Agenda de "+ag;
        let fond=couleurAgendas[i];
        let c=cal.view.getContrastingTextColor(fond);
        lib.setAttribute("style", "background-color:"+fond+";color:"+c+";");
        agendasContainer.appendChild(lib);
      }
    },
    
    // affichage des categories
    setupListeCategories: function(document, categories, semaine){

      if (0==categories.length)
        return;

      let semaineContainer=document.getElementById("semaine-"+semaine);
      let categoriesContainer=semaineContainer.querySelector(".categories-container");
      let libelle=document.getElementById("categorie-libelle");
      
      let l=1;
      let c=1;
      for (var cat of categories){
        
        let lib=libelle.cloneNode(true);
        lib.removeAttribute("id");
        lib.textContent=cat;

        let couleur=this.getCategorieColor(cat);
        lib.setAttribute("style", "border-right-color:"+couleur+"; grid-row:"+l+"/"+l+"; grid-column:"+c+"/"+c+";");
      
        categoriesContainer.appendChild(lib);
        
        if (4==++c){
          c=1;
          l++;
        }
      }
    },

    getCategorieColor: function(categorie){
      
      let pref=cal.view.formatStringForCSSRule(categorie);
      let color=Services.prefs.getCharPref("calendar.category.color."+pref, "transparent");
      return color;
    },
    
    getDateString: function(startOfWeek){

      let debut=startOfWeek.clone();
      let weekInfo=cal.getWeekInfoService();
      let fin=weekInfo.getEndOfWeek(debut);
      
      let dateFormatter=cal.getDateFormatter();
      let defaultTimezone=cal.dtz.defaultTimezone;
      
      let dateString;
      
      if (debut.getInTimezone(defaultTimezone).month==fin.getInTimezone(defaultTimezone).month) 
        dateString=debut.day + " - " + fin.day + " " + dateFormatter.monthName(fin.getInTimezone(defaultTimezone).month) + " " + fin.year;
      else dateString=debut.day + " " + dateFormatter.monthName(debut.getInTimezone(defaultTimezone).month) + " " + debut.year
                      + " - " + fin.day + " " + dateFormatter.monthName(fin.getInTimezone(defaultTimezone).month) + " " + fin.year;

      let weekno=weekInfo.getWeekTitle(debut);
      dateString+=" (Semaine"+weekno+")";
      return dateString;
    }
};

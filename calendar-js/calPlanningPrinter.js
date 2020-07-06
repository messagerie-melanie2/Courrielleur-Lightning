/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");


function calPlanningPrinter() {
    this.wrappedJSObject = this;
}

var calPlanningPrinterClassID = Components.ID("{3ccec83a-1990-4b92-98e6-e5a2915522cd}");
var calPlanningPrinterInterfaces = [Components.interfaces.calIPrintFormatter];
calPlanningPrinter.prototype = {
    classID: calPlanningPrinterClassID,
    QueryInterface: XPCOMUtils.generateQI(calPlanningPrinterInterfaces),

    classInfo: XPCOMUtils.generateCI({
        classID: calPlanningPrinterClassID,
        contractID: "@mozilla.org/calendar/printformatter;1?type=planning",
        classDescription: "Calendar Planning Print Formatter",
        interfaces: calPlanningPrinterInterfaces
    }),

    get name() { return cal.l10n.getCalString("planningPrinterName"); },

    formatToHtml: function(aStream, aStart, aEnd, aCount, aItems, aTitle) {
        let document = cal.xml.parseFile("chrome://calendar-common/skin/printing/calPlanningPrinter.html");
        let defaultTimezone = cal.dtz.defaultTimezone;

        // Set page title
        document.getElementById("title").textContent = aTitle;
        
        const kIPrintSettings = Components.interfaces.nsIPrintSettings;
        var settings = cal.print.getPrintSettings();

        settings.orientation = kIPrintSettings.kPortraitOrientation;
        var flags = settings.kInitSaveOrientation;
        
        cal.print.savePrintSettings(settings, flags);

        // 5/7 jours
        if (Services.prefs.getBoolPref("printer.meddtl.hebdo.printcompleteweek", false)){
          let modele=document.getElementById("planning-template");
          let d=modele.querySelector(".saturday-title");
          d.removeAttribute("hidden");
          d=modele.querySelector(".sunday-title");
          d.removeAttribute("hidden");
          modele=document.getElementById("agenda-planning");
          d=modele.querySelector(".day-6");
          d.removeAttribute("hidden");
          d=modele.querySelector(".day-0");
          d.removeAttribute("hidden");
        }

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
              semaines.push(current.clone());
            }
        }


        // liste des agendas extraite depuis les événements
        let agendas=[];
        let agendasId=[];

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

            // agenda
            let nomag=item.calendar.name;
            if (!agendas.includes(nomag)){
              agendas.push(nomag);
              agendasId.push(item.calendar.id);
            }
          }
        }

        // trier les agendas (Ticket mantis 0005488)
        agendas=this.triAgendas(agendas, agendasId);

        // setupPlanningSemaine
        for (var semaine of semaines){
          this.setupPlanningSemaine(document, agendas, aItems, semaine);
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
        let planningTemplate = document.getElementById("planning-template");
        let planningContainer = document.getElementById("planning-container");
        let defaultTimezone = cal.dtz.defaultTimezone;

        // Clone the template week and make sure it doesn't have an id
        let currentPage = planningTemplate.cloneNode(true);
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
          let titleNode = currentPage.querySelector("." + weekdayName + "-title");
          let ladate=currentDate.getInTimezone(defaultTimezone);
          titleNode.textContent=dateFormatter.dayName(weekday)+" "+ladate.day;
        }

        // Now insert the week into the week container, sorting by date (and therefore week number)
        function compareDates(a, b) {
            return !a || !b ? -1 : a.compare(b);
        }

        cal.data.binaryInsertNode(planningContainer, currentPage, currentPage.item, compareDates);
    },

    // affichage du contenu des semaines pour chaque agenda
    setupPlanningSemaine: function(document, agendas, aItems, startOfWeek){
      if (0==agendas.length)
        return;

      let weekInfo=cal.getWeekInfoService();
      let semaine=weekInfo.getWeekTitle(startOfWeek);
      let ident="semaine-"+semaine;
      let semaineContainer=document.getElementById(ident);
      let planningContainer=semaineContainer.querySelector(".planning-contenu");
      let planningTemplate=document.getElementById("agenda-planning");

      for (var i=0;i<agendas.length;i++){
        let agenda=agendas[i];

        let planning=planningTemplate.cloneNode(true);
        planning.removeAttribute("id");

        let libelle=planning.querySelector(".agenda-libelle");
        libelle.textContent=agenda;

        planningContainer.appendChild(planning);

        this.setupPlanningAgenda(document, agenda, aItems, startOfWeek, planning);
      }
    },

    // le planning d'un agenda pour une semaine (startOfWeek)
    setupPlanningAgenda: function(document, agenda, aItems, startOfWeek, planning){

      let defaultTimezone=cal.dtz.defaultTimezone;
      let weekInfo=cal.getWeekInfoService();
      let semaine=weekInfo.getWeekTitle(startOfWeek);
      let endOfWeek=startOfWeek.clone();
      endOfWeek.day+=6;

      for (let item of aItems) {

        if (item.calendar.name!=agenda)
          continue;

        let itemStartDate=item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
        let itemEndDate=item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];
        if (!itemStartDate && !itemEndDate)
          continue;
        itemStartDate=itemStartDate.getInTimezone(defaultTimezone);
        itemEndDate=itemEndDate.getInTimezone(defaultTimezone);

        if (0==this.compareJours(itemStartDate, itemEndDate)){
          if (1==this.compareJours(itemStartDate, endOfWeek) ||
              -1==this.compareJours(itemStartDate, startOfWeek))
          continue;

        } else{
          if (1==this.compareJours(itemStartDate, endOfWeek) ||
              1!=this.compareJours(itemEndDate, startOfWeek))
          continue;
        }

        this.setupItemPlanning(document, item, itemStartDate, itemEndDate, planning, startOfWeek);
      }
    },

    setupItemPlanning: function(document, item, itemStartDate, itemEndDate, planning, startOfWeek){

      let allday=itemStartDate.isDate;
      let heure="";
      let lieu="";
      if (item.hasProperty('LOCATION'))
        lieu="("+item.getProperty('LOCATION')+")";

      let dateFormatter=cal.getDateFormatter();

      // sur un seul jour
      if (0==this.compareJours(itemStartDate, itemEndDate) ||
          (itemStartDate.isDate && itemEndDate.day==itemStartDate.day+1)){

        // heure si pas un jour entier
        if (!allday){
          heure=dateFormatter.formatTimeInterval(itemStartDate, itemEndDate);
        }

        let itemPlanning=this.createItemPlanning(document, heure, item.title, lieu);

        let ident=".day-"+itemStartDate.weekday;
        let jour=planning.querySelector(ident);
        jour.appendChild(itemPlanning);

        return;
      }

      // sur plusieurs jours (pas forcement tous dans cette semaine - ex: commence/termine autre semaine)
      let courant=startOfWeek.clone();
      let jours=[];

      for (var i=0;i<7;i++){
        if (!allday){
          if (1!=this.compareJours(itemStartDate, courant) &&
              -1!=this.compareJours(itemEndDate, courant)){
            jours.push(courant.weekday);
          }
        } else{
          if (1!=this.compareJours(itemStartDate, courant) &&
              1==this.compareJours(itemEndDate, courant)){
            jours.push(courant.weekday);
          }
        }
        courant.day+=1;
      }

      courant=startOfWeek.clone();
      for (var n=0;n<jours.length;n++){
        let j=jours[n];
        heure="";
        // heure si pas un jour entier
        if (!allday){
          if (itemStartDate.weekday==j){
            heure="\u21e4 "+dateFormatter.formatTime(itemStartDate);
          } else if (itemEndDate.weekday==j){
            heure="\u21e5 "+dateFormatter.formatTime(itemEndDate);
          } else{
            heure="\u21ff";
          }
        }

        let itemPlanning=this.createItemPlanning(document, heure, item.title, lieu);

        let ident=".day-"+jours[n];
        let jour=planning.querySelector(ident);
        jour.appendChild(itemPlanning);

        courant.day+=1;
      }
    },

    createItemPlanning: function(document, heure, titre, lieu){

      let itemTemplate=document.getElementById("item-template");

      let itemPlanning=itemTemplate.cloneNode(true);
      itemPlanning.removeAttribute("id");

      let div=itemPlanning.querySelector(".item-heure");
      div.textContent=heure;

      div=itemPlanning.querySelector(".item-titre");
      div.textContent=titre;

      div=itemPlanning.querySelector(".item-lieu");
      div.textContent=lieu;

      return itemPlanning;
    },

    getDateString: function(startOfWeek){

      let debut=startOfWeek.clone();
      let weekInfo=cal.getWeekInfoService();
      let fin=weekInfo.getEndOfWeek(debut);

      let dateFormatter=cal.getDateFormatter();
      let defaultTimezone=cal.dtz.defaultTimezone;

      let dateString="Planning du ";

      if (debut.getInTimezone(defaultTimezone).month==fin.getInTimezone(defaultTimezone).month)
        dateString+=debut.day + " au " + fin.day + " " + dateFormatter.monthName(fin.getInTimezone(defaultTimezone).month) + " " + fin.year;
      else dateString+=debut.day + " " + dateFormatter.monthName(debut.getInTimezone(defaultTimezone).month) + " " + debut.year
                      + " au " + fin.day + " " + dateFormatter.monthName(fin.getInTimezone(defaultTimezone).month) + " " + fin.year;

      let weekno=weekInfo.getWeekTitle(debut);
      dateString+=" (Semaine"+weekno+")";
      return dateString;
    },

    compareJours: function (a,b){
      if (a.year!=b.year) return (a.year<b.year?-1:1);
      if (a.month!=b.month) return (a.month<b.month?-1:1);
      return (a.day==b.day)?0:(a.day<b.day?-1:1);
    },

    triAgendas: function(agendas, agendasId){

      let sortOrder=Preferences.get("calendar.list.sortOrder", "").split(" ");
      let nouveau=[];
      for (var i of sortOrder){
        let nb=agendas.length;
        for (var n=0;n<nb;n++){
          if (agendasId[n]==i){
            nouveau.push(agendas[n]);
            continue;
          }
        }
      }
      return nouveau;
    }
};

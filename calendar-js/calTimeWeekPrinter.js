/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

// nombre de divisions dans une heure (12 => tranches de 5 minutes)
var calTimeDayPrinterDivMin=12;

/**
 * Prints a two column view of a week of events, much like a paper day-planner
 */
function calTimeWeekPrinter() {
    this.wrappedJSObject = this;
}

var calTimeWeekPrinterClassID = Components.ID("{927A8692-FEF1-4EB8-8ADF-4F9A320F8563}");
var calTimeWeekPrinterInterfaces = [Components.interfaces.calIPrintFormatter];
calTimeWeekPrinter.prototype = {
  classID: calTimeWeekPrinterClassID,
  QueryInterface: XPCOMUtils.generateQI(calTimeWeekPrinterInterfaces),

  classInfo: XPCOMUtils.generateCI({
      classID: calTimeWeekPrinterClassID,
      contractID: "@mozilla.org/calendar/printformatter;1?type=timeweek",
      classDescription: "Calendar Time Week Print Formatter",
      interfaces: calTimeWeekPrinterInterfaces
  }),

  get name() { return cal.l10n.getCalString("timeweekPrinterName"); },

  _heureDebut: null,
  get heureDebut(){
    if (null==this._heureDebut){
      this._heureDebut=Services.prefs.getIntPref("calendar.view.daystarthour", 8);
    }
    return this._heureDebut;
  },

  _heureFin: null,
  get heureFin(){
    if (null==this._heureFin){
      this._heureFin=Services.prefs.getIntPref("calendar.view.dayendhour", 17);
    }
    return this._heureFin;
  },

  get nombreHeures(){
    return this.heureFin-this.heureDebut;
  },

  _samdim: null,
  get samdim(){
    if (null==this._samdim){
      this._samdim=Services.prefs.getBoolPref("printer.meddtl.hebdo.printcompleteweek", false);
    }
    return this._samdim;
  },
  
  get nbjours(){
    return this.samdim?7:5;
  },

  formatToHtml: function(aStream, aStart, aEnd, aCount, aItems, aTitle) {
      let document = cal.xml.parseFile("chrome://calendar-common/skin/printing/calTimeWeekPrinter.html");
      let defaultTimezone = cal.dtz.defaultTimezone;

      // Set page title
      document.getElementById("title").textContent = aTitle;

      const kIPrintSettings = Components.interfaces.nsIPrintSettings;
      var settings = cal.print.getPrintSettings();

      settings.orientation = kIPrintSettings.kLandscapeOrientation;
      var flags = settings.kInitSaveOrientation;

      cal.print.savePrintSettings(settings, flags);

      // Table that maps YYYY-MM-DD to the DOM node container where items are to be added
      let dayTable = {};
      let alldayTable = {};
      let weekInfoService = cal.getWeekInfoService();

      // liste des semaines pour setupListeAgenda
      let semaines=[];

      // Make sure to create tables from start to end, if passed
      if (aStart && aEnd) {
          for (let current = weekInfoService.getStartOfWeek(aStart); current.compare(aEnd) < 0; current.day += 7) {
              this.setupWeek(document, current, dayTable, alldayTable);

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
            
              if (!this.samdim && 
                  (6==boxDate.weekday || 0==boxDate.weekday)){
                continue;
              }        
              
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
                  this.setupWeek(document, startOfWeek, dayTable, alldayTable);
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

              if (itemStartDate.isDate)
                this.addItemToDaybox(document, item, itemStartDate, itemEndDate, boxDate, alldayTable[boxDateKey]);
              else
                this.addItemToDaybox(document, item, itemStartDate, itemEndDate, boxDate, dayTable[boxDateKey]);
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

  setupWeek: function(document, startOfWeek, dayTable, alldayTable) {

      let weekTemplate = document.getElementById("week-template");
      let weekContainer = document.getElementById("week-container");
      let blocHeure=document.getElementById("bloc-heure");
      let defaultTimezone = cal.dtz.defaultTimezone;

      // Clone the template week and make sure it doesn't have an id
      let currentPage = weekTemplate.cloneNode(true);
      currentPage.removeAttribute("id");
      currentPage.item = startOfWeek.clone();

      // Set up the week number title
      let weekTitle=this.getDateString(startOfWeek);
      currentPage.querySelector(".libelle-semaine").textContent = weekTitle;

      let weekInfo=cal.getWeekInfoService();
      let weekno=weekInfo.getWeekTitle(startOfWeek);
      let ident="semaine-"+weekno;
      currentPage.setAttribute("id", ident);

      // .lignes-template
      let sheet = document.getElementById("sheet");
      let nbHeures=this.nombreHeures;
      let prop=" .lignes-template {grid-template-rows: [jours] auto [entier] auto ";
      let propheures="";
      let r=0;
      for (var heure=this.heureDebut;heure<this.heureFin; heure++){
        for (var n=0;n<calTimeDayPrinterDivMin;n++,r++)
          propheures+=" [t"+r+"] 1fr";
      }
      prop+=propheures+";}";
      
      // .colonnes-template
      prop+=" \n .colonnes-template {grid-template-columns: [heures] 3em";
      let currentDate=startOfWeek.clone();
      let endOfWeek=weekInfo.getEndOfWeek(startOfWeek);
      for (nb=this.nbjours; nb && currentDate.compare(endOfWeek) <= 0; currentDate.day++, nb--) {
        let weekday=currentDate.weekday;
        prop+=" [d"+weekday+"] auto";
      }
      prop+=";}";

      sheet.textContent+=prop;

      // ajout des blocs heure/jour
      let conteneurSemaines=currentPage.querySelector(".conteneur-semaine");
      let heurejour=document.getElementById("heurejour");
      let maxi=cal.print.calculeHauteurUtile();
      let hdiv=Math.round(maxi*0.8);
      let style="max-height:"+hdiv+"mm;height:"+hdiv+"mm;";
      if (conteneurSemaines.hasAttribute("style"))
         style+=conteneurSemaines.getAttribute("style");
      conteneurSemaines.setAttribute("style", style);

      for (var heure=this.heureDebut;heure<this.heureFin; heure++){
        div=blocHeure.cloneNode(true);
        div.removeAttribute("id");
        let r=this.getLigne(heure);
        let r2=this.getLigne(heure+1);
        div.setAttribute("style", "grid-row-start:"+r+"; grid-row-end:"+r2+";");
        let h=div.querySelector(".heure");
        h.textContent=heure;
        conteneurSemaines.appendChild(div);

        for (let currentDate=startOfWeek.clone(), nb=this.nbjours; nb && currentDate.compare(endOfWeek) <= 0; currentDate.day++, nb--) {
          let weekday=currentDate.weekday;
          div=heurejour.cloneNode(true);
          div.removeAttribute("id");
          div.setAttribute("style", "grid-row-start:"+r+"; grid-row-end:"+r2+";grid-column-start:d"+weekday+";");
          conteneurSemaines.appendChild(div);
        }
      }

      // ajout des libelles des jours
      // et des blocs de jours
      let dateFormatter=cal.getDateFormatter();
      let jour=document.getElementById("jour");
      let jourTemplate=document.getElementById("conteneur-evenements");
      let jourEntier=document.getElementById("jour-entier");

      for (let currentDate=startOfWeek.clone(), nb=this.nbjours; nb && currentDate.compare(endOfWeek) <= 0; currentDate.day++, nb--) {
        let weekday=currentDate.weekday;
        let dayKey=cal.print.getDateKey(currentDate);

        // libelles des jours
        let lejour=jour.cloneNode(true);
        lejour.removeAttribute("id");
        lejour.setAttribute("style", "grid-column-start:d"+weekday+";");
        let txt=lejour.querySelector(".libelle-jour");
        txt.textContent=dateFormatter.dayName(weekday)+" "+currentDate.day+" "+dateFormatter.monthName(currentDate.month);
        conteneurSemaines.appendChild(lejour);

        // blocs evenements jour entier
        let eventjour=jourEntier.cloneNode(true);
        eventjour.removeAttribute("id");
        eventjour.setAttribute("style", "grid-column-start:d"+weekday+";");
        conteneurSemaines.appendChild(eventjour);
        alldayTable[dayKey]=eventjour;

        // blocs evenements != entiers
        eventjour=jourTemplate.cloneNode(true);
        eventjour.removeAttribute("id");
        style="grid-template-rows:"+propheures+"; grid-column-start:d"+weekday+";";
        eventjour.setAttribute("style", style);   
        conteneurSemaines.appendChild(eventjour);
        
        //dayTable[dayKey]=eventjour;
        dayTable[dayKey]=eventjour;
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
  },

  // version modifiee de cal.print.addItemToDaybox
  addItemToDaybox: function(document, item, itemStartDate, itemEndDate, boxDate, dayContainer) {

    // ignorer si hors plage horaire affichée
    if ((itemStartDate.day==boxDate.day && itemStartDate.hour>=this.heureFin) ||
        (itemEndDate.day==boxDate.day && itemEndDate.hour<=this.heureDebut)){
      return;
    }

    let div=document.getElementById("item-template").cloneNode(true);
    div.removeAttribute("id");
    div.item = item;

    // Fill in details of the item
    let itemInterval = cal.print.getItemIntervalString(item, boxDate);
    div.querySelector(".item-heure").textContent = itemInterval;
    div.querySelector(".item-titre").textContent = item.title;
    if (item.hasProperty('LOCATION')) {
      let lieu="("+item.getProperty('LOCATION')+")";
      div.querySelector(".item-lieu").textContent=lieu;
    }

    // Fill in calendar color
    div.setAttribute("calendar-id", cal.view.formatStringForCSSRule(item.calendar.id));
    cal.print.insertCalendarRules(document, item.calendar);

    //itemEvent
    let categories=item.getCategories({});
    if (0<categories.length) {
      let pref=cal.view.formatStringForCSSRule(categories[0]);
      let color=Services.prefs.getCharPref("calendar.category.color."+pref, "transparent");
      div.setAttribute("style", "border-right:solid 8px "+color+";");
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
      img.setAttribute('src', cal.print.getBase64Picto("locked"));
      div.appendChild(img);
    }
    
    function hexToRgb(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    }

    let rgbaString = hexToRgb(calColor).r+","+hexToRgb(calColor).g+","+hexToRgb(calColor).b;

    let style = "";
    // annulé
    if (item.hasProperty("STATUS") && "CANCELLED"==item.getProperty("STATUS")) 
    {
      style="text-decoration-line: line-through;background-color:rgba("+rgbaString+",1);";
    }

    // participants
    let parts=item.getAttendees({});
    if (parts && 0!=parts.length) {
      let img=imgDoc.cloneNode(true);
      img.removeAttribute("id");
      img.setAttribute('src', cal.print.getBase64Picto("attendees"));
      div.appendChild(img);
    }

    //attachement
    let attachments = item.getAttachments({});
    if (attachments && 0!=attachments.length) {
      let img=imgDoc.cloneNode(true);
      img.removeAttribute("id");
      let nomImg="attach-"+(cal.view.getContrastingTextColor(calColor)=="white"?"fff":"000");
      img.setAttribute('src', cal.print.getBase64Picto(nomImg));
      div.appendChild(img);
    }

    //recurent
    if (!(item==item.parentItem ||
        item.parentItem.recurrenceInfo.getExceptionFor(item.recurrenceId))) {
      let img=imgDoc.cloneNode(true);
      img.removeAttribute("id");
      let nomImg="recur-"+(cal.view.getContrastingTextColor(calColor)=="white"?"fff":"000");
      img.setAttribute('src', cal.print.getBase64Picto(nomImg));
      div.appendChild(img);
    }

    // placement
    if (itemStartDate.isDate){

      let cl=div.getAttribute("class");
      div.setAttribute("class", cl+" itemEntier");
      div.setAttribute("style", style);

    } else{

      let start, end=-1;
      if (itemStartDate.day==boxDate.day &&
          itemStartDate.hour>=this.heureDebut){
        start=this.getLigne(itemStartDate.hour, itemStartDate.minute);
        if (-1==start)
          start="t0";
      }
      if (itemEndDate.day==boxDate.day &&
          itemEndDate.hour<this.heureFin &&
          0!=itemEndDate.compare(itemStartDate)){
        end=this.getLigne(itemEndDate.hour, itemEndDate.minute);
      }
      
      style+="grid-row-start:"+start+";grid-row-end:"+end+";";    
      div.setAttribute("style", style);
    }

    // Add it to the day container in the right order
    cal.data.binaryInsertNode(dayContainer, div, item, cal.view.compareItems);
  },
  
  // retourne la référence de ligne (t<x>)
  getLigne: function(heure, minutes=null){

    if (heure>this.heureFin)
      return -1;
    let r=heure-this.heureDebut;
    if (0>r)
      return -1;
    if (r)
      r*=calTimeDayPrinterDivMin;
    if (minutes)
      r+=Math.round(minutes*calTimeDayPrinterDivMin/60);

    return "t"+r;
  }
};

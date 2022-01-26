/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

/**
 * Prints a one day view of a day of events
 */
function calTimeDayPrinter() {
    this.wrappedJSObject = this;
}

// nombre de divisions dans une heure (12 => tranches de 5 minutes)
var calTimeDayPrinterDivMin=12;

var calTimeWeekPrinterClassID = Components.ID("{C3E4C0C0-6F07-4865-84AA-F21F7131F8B2}");
var calTimeWeekPrinterInterfaces = [Components.interfaces.calIPrintFormatter];
calTimeDayPrinter.prototype = {
  classID: calTimeWeekPrinterClassID,
  QueryInterface: XPCOMUtils.generateQI(calTimeWeekPrinterInterfaces),

  classInfo: XPCOMUtils.generateCI({
      classID: calTimeWeekPrinterClassID,
      contractID: "@mozilla.org/calendar/printformatter;1?type=timeday",
      classDescription: "Calendar Time Day Print Formatter",
      interfaces: calTimeWeekPrinterInterfaces
  }),

  get name() { return cal.l10n.getCalString("timedayPrinterName"); },

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

  formatToHtml: function(aStream, aStart, aEnd, aCount, aItems, aTitle) {

      let document = cal.xml.parseFile("chrome://calendar-common/skin/printing/calTimeDayPrinter.html");
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
      let alldayTable = {};
      let weekInfoService = cal.getWeekInfoService();

      // Make sure to create tables from start to end, if passed
      if (aStart && aEnd) {
          for (let current = aStart.clone(); current.compare(aEnd) < 0; current.day += 1) {
              this.setupDay(document, current, dayTable, alldayTable);
          }
      }

      // liste des agendas extraite depuis les événements
      let agendas=[];
      let couleurAgendas=[];
      // liste des categories extraite depuis les événements
      let categories=[];
      // mémorisation des taches sans date pour insertion à la fin
      let taches=[];

      for (let item of aItems) {
          let itemStartDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
          let itemEndDate = item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];

          if (!itemStartDate && !itemEndDate) {
              taches.push(item);
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
                  this.setupDay(document, startOfWeek, dayTable, alldayTable);
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
      // et de la liste des categories
      // ainsi que les taches sans date
      for (let current = aStart.clone(); current.compare(aEnd) < 0; current.day += 1) {

        this.setupListeAgenda(document, agendas, couleurAgendas, current);

        this.setupListeCategories(document, categories, current);

        this.insereTachesSansDate(document, taches, current);
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

  setupDay: function(document, day, dayTable, alldayTable) {

      let jourTemplate = document.getElementById("jour-template");
      let jourContainer = document.getElementById("jour-container");

      let defaultTimezone = cal.dtz.defaultTimezone;

      // Clone the template jour and make sure it doesn't have an id
      let currentPage = jourTemplate.cloneNode(true);
      currentPage.removeAttribute("id");
      let lejour=day.clone();
      currentPage.item=lejour;
      let identjour=this.getIdentJour(lejour);
      currentPage.setAttribute("id", identjour);

      // Set up the week number title
      let jourTitle=this.getDateString(day);
      currentPage.querySelector(".libelle-jour").textContent=jourTitle;

      // .lignes-template
      let sheet = document.getElementById("sheet");
      let nbHeures=this.nombreHeures;
      let prop=" .lignes-template {grid-template-rows: [jour] auto [entier] auto";
      let propheures="";
      let r=0;
      for (var heure=this.heureDebut;heure<this.heureFin; heure++){
        for (var n=0;n<calTimeDayPrinterDivMin;n++,r++)
          propheures+=" [t"+r+"] 1fr";
      }
      prop+=propheures+";}";
      
      sheet.textContent+=prop;

      // ajout des blocs horaires
      let blocHeure=document.getElementById("bloc-heure");
      let heurejour=document.getElementById("heurejour");
      let conteneurJour=currentPage.querySelector(".contenu-jour");
      let maxi=cal.print.calculeHauteurUtile();
      let hdiv=Math.round(maxi*0.8);
      let style="max-height:"+hdiv+"mm;height:"+hdiv+"mm;";
      if (conteneurJour.hasAttribute("style"))
         style+=conteneurJour.getAttribute("style");
      conteneurJour.setAttribute("style", style);
      
      let div=conteneurJour.querySelector(".heurejour");
      style=div.getAttribute("style");

      for (var heure=this.heureDebut;heure<this.heureFin; heure++){
        
        let r=this.getLigne(heure);
        let r2=this.getLigne(heure+1);
        
        let div=blocHeure.cloneNode(true);
        div.removeAttribute("id");
        div.setAttribute("style", "grid-row-start:"+r+"; grid-row-end:"+r2+";");
        let h=div.querySelector(".heure");
        h.textContent=heure;
        conteneurJour.appendChild(div);

        div=heurejour.cloneNode(true);
        div.removeAttribute("id");
        div.setAttribute("style", "grid-row-start:"+r+"; grid-row-end:"+r2+";grid-column-start:rdv;");
        conteneurJour.appendChild(div);
      }

      // evenements != entiers
      let dayKey=cal.print.getDateKey(lejour);
      divjour=currentPage.querySelector(".conteneur-evenements");
      style="grid-template-rows: "+propheures+";";
      if (divjour.hasAttribute("style"))
        style+=divjour.getAttribute("style"); 
      divjour.setAttribute("style", style);
      conteneurJour.appendChild(divjour);
      dayTable[dayKey]=divjour;

      // alldayTable et dayTable
      divjour=conteneurJour.querySelector(".jour-entier");
      alldayTable[dayKey]=divjour;


      // Now insert the week into the week container, sorting by date (and therefore week number)
      function compareDates(a, b) {
          return !a || !b ? -1 : a.compare(b);
      }

      cal.data.binaryInsertNode(jourContainer, currentPage, currentPage.item, compareDates);
  },

  // affichage des agendas
  setupListeAgenda: function(document, agendas, couleurAgendas, jour){

    if (0==agendas.length)
      return;

    let identjour=this.getIdentJour(jour);
    let jourContainer=document.getElementById(identjour);
    let agendasContainer=jourContainer.querySelector(".agendas-container");
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
  setupListeCategories: function(document, categories, jour){

    if (0==categories.length)
      return;

    let identjour=this.getIdentJour(jour);
    let jourContainer=document.getElementById(identjour);
    let categoriesContainer=jourContainer.querySelector(".categories-container");
    let libelle=document.getElementById("categorie-libelle");

    let l=1;
    let c=1;
    for (var cat of categories){

      let lib=libelle.cloneNode(true);
      lib.removeAttribute("id");
      lib.textContent=cat;

      let couleur=this.getCategorieColor(cat);
      lib.setAttribute("style", "border-left-color:"+couleur+"; grid-row:"+l+"/"+l+"; grid-column:"+c+"/"+c+";");

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

  getDateString: function(day){

    let jour=day.clone();
    let dateFormatter=cal.getDateFormatter();

    let dateString=dateFormatter.dayName(jour.weekday)+" "+jour.day+" "+dateFormatter.monthName(jour.month);

    let weekInfo=cal.getWeekInfoService();
    let weekno=weekInfo.getWeekTitle(jour);
    dateString+=" ("+weekno+")";
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
    // annulé #6286: Les évts barrés ne sont pas barrés lors de l'impression
    if (item.hasProperty("STATUS") && "CANCELLED"==item.getProperty("STATUS")) 
    {
        style="text-decoration-line:line-through;background-color:rgba("+rgbaString+",0.5);";
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

  getIdentJour: function(day){
    return day.year+"-"+day.month+"-"+day.day
  },

  // insere les taches sans date dans les pages des jours
  // taches : tableau des taches
  insereTachesSansDate: function(document, taches, jour){

    if (0==taches.length){
      return;
    }

    let identjour=this.getIdentJour(jour);
    let jourContainer=document.getElementById(identjour);
    let taskList=jourContainer.querySelector(".taskList");

    let taskTemplate=document.getElementById("task-template");

    for (let tache of taches){

      let task=taskTemplate.cloneNode(true);
      task.removeAttribute("id");

      let titre=task.querySelector(".task-title");
      titre.textContent=tache.title;

      if (tache.isCompleted) {
        task.querySelector(".task-checkbox").setAttribute("checked", "checked");
        titre.setAttribute("isCompleted", "true");
      }

      taskList.appendChild(task);
    }
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

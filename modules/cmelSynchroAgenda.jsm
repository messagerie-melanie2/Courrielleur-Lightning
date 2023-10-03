
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

const EXPORTED_SYMBOLS = ["cmelSynchroAgenda"];


// interval du timer en secondes
// + valeur pour espacer les rafraichissements entre agendas
// "courrielleur.agenda.timer.secondes"
const CMEL_AGTIMER=3;

// délai en secondes avant premier refresh
// "courrielleur.agenda.delaistart.secondes"
const CMEL_AGSTART=2;

// temps (secondes depuis 1970) pour le prochain rafraichissement
// valeur 0 ou pas de valeur => pas de rafraichissement
// "calendar.registry.<id>.cm2nextrefresh"


//delai de mise en veille en minutes
var CMEL_DELAIVEILLE=2;
//taux rafraichissement en minutes mode veille agendas en ecriture (-1=pas de rafraichissement)
var CMEL_VEILLEMIN_W=-1;
//taux rafraichissement en minutes mode veille agendas en lecture (-1=pas de rafraichissement)
var CMEL_VEILLEMIN_R=-1;


// démarrage automatique (depuis lightning dans le cas ou pacome de démarre pas=> possibilité cachée)
// "courrielleur.agenda.timer.auto"

var lastRefresh = new Date(Date.now());
var cmelSynchroAgenda={

  // instance timer
  _timer:null,
  // interval du timer en secondes
  _intervalTimer: CMEL_AGTIMER,
  // démarrage automatique depuis lightning si true
  _auto: false,
  // temps courant (mis a jour par timer)
  _courant:0,

  // temps de démarrage effectif (secondes depuis 1970 calculé dans init)
  // si 0 n'est pas démarré
  _starttime:0,

  // tableau identifiants agendas
  _agendas:null,

  // true si client en veille => pas de refraichissement
  _enveille:false,


  Termine: function(){

    this.QuitteVeille();
  },

  init: function(){

    this._intervalTimer=Services.prefs.getIntPref("courrielleur.agenda.timer.secondes", CMEL_AGTIMER);
    this._courant=Math.round(Date.now()/1000);
    this.debugMsg("init _courant:"+this.debugTps(this._courant));

    this._auto=Services.prefs.getBoolPref("courrielleur.agenda.timer.auto", false);

    if (this._auto){

      let delaistart=Services.prefs.getIntPref("courrielleur.agenda.delaistart.secondes", CMEL_AGSTART);
      this._starttime=this._courant+delaistart;
      this.debugMsg("init _starttime:"+this.debugTps(this._starttime));

      this.initTimer();

    } else{
      this._starttime=0;
    }

    //initialiser les temps de rafraichissement des agendas
    this.initAgendas();

    this.InitVeille();
  },

  initAgendas: function(){
    this.debugMsg("initAgendas");

    this._agendas=[];

    let agendas=Services.prefs.getCharPref("calendar.list.sortOrder", "").split(" ");
    for (var calid of agendas){
      if (""==calid)
        continue;
      this.debugMsg("initAgendas identifiant agenda:"+calid);
      this._agendas.push(calid);
      Services.prefs.setIntPref("calendar.registry."+calid+".cm2nextrefresh", 0);
    }
  },

  initTimer: function(){

    if (null==this._timer)
      this._timer=Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
    else
       this._timer.cancel();

    this._timer.initWithCallback(cmelSynchroAgenda,
                                  this._intervalTimer*1000,
                                  Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
  },

  // démarrage effectif (permet d'exécuter pacome avant au démarrage de tb)
  Demarre: function(){

    this._courant=Math.round(Date.now()/1000);
    let delaistart=Services.prefs.getIntPref("courrielleur.agenda.delaistart.secondes", CMEL_AGSTART);
    this._starttime=this._courant+delaistart;
    this.debugMsg("Demarre _starttime:"+this.debugTps(this._starttime));

    let index=0;
    for (var calid of this._agendas){
       if (0==calid)
         continue;
      Services.prefs.setIntPref("calendar.registry."+calid+".cm2nextrefresh", this._starttime+this._intervalTimer*index);
      index++;
    }

    this.initTimer();
  },

  notify: function(aTimer) {

    this._courant=Math.round(Date.now()/1000);

    if (this._courant<this._starttime){
      // trop tôt!
      return;
    }

    let calMan=null;

    for (var calid of this._agendas){
      if (0==calid)
        continue;
      let cm2nextrefresh=Services.prefs.getIntPref("calendar.registry."+calid+".cm2nextrefresh", 0);
      if (0<cm2nextrefresh &&
          cm2nextrefresh<=this._courant){
        // rafraichissement agenda
        if (null==calMan)
          calMan=cal.getCalendarManager();
        let calendar=calMan.getCalendarById(calid);
        if (null==calendar)
          Services.prefs.setIntPref("calendar.registry."+calid+".cm2nextrefresh", 0);
        else
          this.refreshCalendar(calendar);
      }
    }
  },

  // remplace calCalendarManager setupRefreshTimer
  setupCalendarTimer: function(calendar){

    this.debugMsg("setupCalendarTimer agenda:"+calendar.name);

    if (-1==this._agendas.indexOf(calendar.id)){
      this.debugMsg("setupCalendarTimer ajout agenda");
      this._agendas.push(calendar.id);
      let tps=0==this._starttime?0:this._courant;
      Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", tps);
      return;
    }

    if (0==this._starttime){
      // le systeme n'est pas démarré
      return;
    }

    // positionner cm2nextrefresh
    let cm2nextrefresh=Services.prefs.getIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", 0);
    if (0==cm2nextrefresh){

      if (this._courant<=this._starttime){

        // initialisation au démarrage
        cm2nextrefresh=this._starttime;
        // ajout décalage
        let index=this._agendas.indexOf(calendar.id);
        if (-1!=index)
          cm2nextrefresh+=this._intervalTimer*index;

        Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", cm2nextrefresh);

      } else {

        // case "refreshInterval" modifié?
        Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", this._courant);
      }

    } else {
      // en principe cm2nextrefresh doit etre 0!
      Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", this._courant);
    }
  },

  // remplace calCalendarManager clearRefreshTimer
  clearCalendarTimer: function(calendar){
    this.debugMsg("clearCalendarTimer agenda:"+calendar.name);

    Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", 0);

    let index=this._agendas.indexOf(calendar.id);
    if (-1!=index)
      this._agendas[index]=0;
  },

  // remplace calendar.refresh
  refreshCalendar: function(calendar){

    if (0==this._starttime){
      // le systeme n'est pas démarré
      return;
    }

    let cm2nextrefresh=Services.prefs.getIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", 0);

    if (0==cm2nextrefresh){
      //cm2nextrefresh!!!
      cm2nextrefresh=this._courant;
      Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", cm2nextrefresh);
    }

    if (cm2nextrefresh>this._courant){
      // trop tôt!
      return;
    }

    let refreshInterval=calendar.getProperty("refreshInterval");
    // On force la réactivation en cas de perte de session Kerberos
    calendar.setProperty("disabled", false);
    //let now = new Date(Date.now());
    //if(!calendar.getProperty("disabled") && calendar.canRefresh){
      //lastRefresh = now;
      this.debugMsg("rafraichissement agenda:"+calendar.name);
      // refresh original
      calendar.refresh();

      // temps suivant
      if (null==refreshInterval)
        refreshInterval=30;//idem lightning

      cm2nextrefresh+=refreshInterval*60;
      // Force refresh every 1 minutes
      //cm2nextrefresh+=1*60;
      Services.prefs.setIntPref("calendar.registry."+calendar.id+".cm2nextrefresh", cm2nextrefresh);
    //}
  },

  /* service de mise en veille */
  _cmelIdleService: null,

  get cmelIdleService() {

    if (null==this._cmelIdleService)
      this._cmelIdleService=Components.classes["@mozilla.org/widget/idleservice;1"].getService(Components.interfaces.nsIIdleService);;

    return this._cmelIdleService;
  },

  //delai pour mise en veille
  cmelDelaiveille: CMEL_DELAIVEILLE,
  //taux rafraichissement en mode veille (agendas en ecriture)
  cmelVeillemin_w: CMEL_VEILLEMIN_W,
  //taux rafraichissement en mode veille (agendas en lecture)
  cmelVeillemin_r: CMEL_VEILLEMIN_R,

  //initialisation idleservice
  InitVeille: function(){

    this.debugMsg("Initialisation de la veille");

    this.cmelDelaiveille=Services.prefs.getIntPref("courrielleur.agenda.delaiveille", CMEL_DELAIVEILLE);

    this.cmelVeillemin_w=Services.prefs.getIntPref("courrielleur.agenda.veillemin_write", CMEL_VEILLEMIN_W);

    this.cmelVeillemin_r=Services.prefs.getIntPref("courrielleur.agenda.veillemin_read", CMEL_VEILLEMIN_R);

    this.cmelIdleService.addIdleObserver(this, this.cmelDelaiveille*60);
  },

  QuitteVeille: function(){

    this.cmelIdleService.removeIdleObserver(this, this.cmelDelaiveille*60);
  },

  observe: function ccm_observe(aSubject, aTopic, aData) {

    switch (aTopic) {
      case "idle":
        this.EntreeVeille();
        break;
      case "back":
      case "active":
        //fin de poste inactif
        this.SortieVeille();
        break;
    }
  },

  //entree en veille
  EntreeVeille: function(){

    this.debugMsg("Entree en veille");

    this._enveille=true;

    if (0 >= this.cmelVeillemin_w &&
        0 >= this.cmelVeillemin_r){
      this._timer.cancel();
    }
  },

  //fin de veille (notification idleservice 'back')
  SortieVeille: function() {

    this.debugMsg("signal de fin de veille");

    this._enveille=false;

    if (0 >= this.cmelVeillemin_w &&
        0 >= this.cmelVeillemin_r){

      // modifier cm2nextrefresh si necessaire
      // permet de conserver l'étalement des rafraichissements
      this._courant=Math.round(Date.now()/1000);
      let index=0;
      for (var calid of this._agendas){
        if (0==calid || null==calid)
          continue;
        let tps=Services.prefs.getIntPref("calendar.registry."+calid+".cm2nextrefresh", 0);
        if (tps<this._courant){
          let cm2nextrefresh=this._courant+this._intervalTimer*index;
          Services.prefs.setIntPref("calendar.registry."+calid+".cm2nextrefresh", cm2nextrefresh);
        }
        index++;
      }

      this.initTimer();
    }
  },
  /* fin veille */

  _debug:null,

  get debug(){
    if (null==this._debug)
      this._debug=Services.prefs.getBoolPref("calendar.debug.log");
    return this._debug;
  },

  debugMsg: function(msg){
    if (this.debug)
      Services.console.logStringMessage("[cmelSynchroAgenda] "+(new Date).toTimeString()+" : "+msg);
  },

  debugTps: function(secondes){
    return new Date(secondes*1000).toTimeString();
  }
}

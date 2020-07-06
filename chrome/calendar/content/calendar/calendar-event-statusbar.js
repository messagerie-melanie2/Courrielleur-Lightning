/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");


/* exported gEventStatusFeedback */

/**
 * This code might change soon if we support Thunderbird's activity manager.
 * NOTE: The naming "Meteors" is historical.
 */
 var gEventStatusFeedback = {
     mEventStep: 0,
     mEventCount: 0,
     mEventCost: 0,
     mWindow: null,
     mStatusText: null,
     mStatusBar: null,
     mStatusProgressPanel: null,
     mThrobber: null,
     mProgressMode: Components.interfaces.calIStatusObserver.NO_PROGRESS,
     mCurIndex: 0,
     mInitialized: false,

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIStatusObserver]),  

     initialize: function(aWindow) {
        if (!this.mInitialized) {
            this.mWindow = aWindow;
            this.mStatusText = this.mWindow.document.getElementById("status-event-text");            
            this.mStatusBar = this.mWindow.document.getElementById("statusbar-icon");
            this.mStatusProgressPanel = this.mWindow.document.getElementById("statusbar-progresspanel");
            this.mThrobber = this.mWindow.document.getElementById("navigator-throbber");
            this.mInitialized = true;
        }
     },

     showStatusString: function(status){
         if (this.mStatusText) {
           this.mStatusText.value=status;
         }
     },

     get spinning() {
         return this.mProgressMode;
     },

     startMeteors: function(aProgressMode, aEventCount, aEventCost, aStatus) {
         if (aProgressMode != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
             if (!this.mInitialized) {
                Components.utils.reportError("StatusObserver has not been initialized!");
                return;
             }
             this.mCurIndex = 0;
             if (aEventCost) {
                 this.mEventCost = this.mEventCost + aEventCost;
                 this.mEventStep = parseInt(100 / this.mEventCost);
             }
             if (aEventCount) {
                 this.mEventCount = this.mEventCount + aEventCount;
             }
             this.mProgressMode = aProgressMode;
             this.mStatusProgressPanel.removeAttribute("collapsed");
             if (this.mProgressMode == Components.interfaces.calIStatusObserver.DETERMINED_PROGRESS) {
                 this.mStatusBar.removeAttribute("collapsed");
                 this.mStatusBar.setAttribute("mode", "determined");
                 this.mStatusBar.value = 50;
                 this.showStatusString(aStatus);
             }
             if (this.mThrobber) {
                 this.mThrobber.setAttribute("busy", true);
             }
         }
     },

     stopMeteors: function() {
         if (!this.mInitialized) {
            return;
         }
         if (this.spinning != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
             this.mProgressMode = Components.interfaces.calIStatusObserver.NO_PROGRESS;
             this.mStatusProgressPanel.collapsed = true;
             this.mStatusBar.setAttribute("mode", "normal");
             this.mStatusBar.value = 0;
             this.mEventCount = 0;
             this.mEventCost = 0;
             this.showStatusString("");
             if (this.mThrobber) {
                 this.mThrobber.setAttribute("busy", false);
             }
         }
     },

     eventCompleted: function(aStatus) {
         if (!this.mInitialized) {
            return;
         }
         if (this.spinning != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
             if (this.spinning == Components.interfaces.calIStatusObserver.DETERMINED_PROGRESS) {
                   this.mStatusBar.value = 100;
                   this.mCurIndex++;
                   this.showStatusString(aStatus);
             }
             if (this.mThrobber){
                 this.mThrobber.setAttribute("busy", true);
             }
         }
     },
     
     updateProgress: function(aStatus) {
         if (!this.mInitialized) {
            return;
         }
         if (this.spinning != Components.interfaces.calIStatusObserver.NO_PROGRESS) {
             if (this.spinning == Components.interfaces.calIStatusObserver.DETERMINED_PROGRESS) {
                   this.mStatusBar.value = (parseInt(this.mStatusBar.value) + this.mEventStep)%100;
                   this.showStatusString(aStatus);
             }
             if (this.mThrobber){
                 this.mThrobber.setAttribute("busy", true);
             }
         }
     }
 };
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://calendar/modules/ltnInvitationUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

// CMel
const TAG_RDVTRAITE = "~rdvtraite";
// Fin CMel

/**
 * This bar lives inside the message window.
 * Its lifetime is the lifetime of the main thunderbird message window.
 */
//#6927: Forcer une synchronisation d'agenda avant l'affichage d'une invitation
var lastRefresh = Date.now();
var ltnImipBar = {

    actionFunc: null,
    itipItem: null,
    foundItems: null,
    msgOverlay: null,

    /**
     * Thunderbird Message listener interface, hide the bar before we begin
     */
    onStartHeaders: function() {
        ltnImipBar.resetBar();
    },

    /**
     * Thunderbird Message listener interface
     */
    onEndHeaders: function() {

    },

    /**
     * Load Handler called to initialize the imip bar
     * NOTE: This function is called without a valid this-context!
     */
    load: function() {
        // Add a listener to gMessageListeners defined in msgHdrViewOverlay.js
        gMessageListeners.push(ltnImipBar);

        // We need to extend the HideMessageHeaderPane function to also hide the
        // message header pane. Otherwise, the imip bar will still be shown when
        // changing folders.
        ltnImipBar.tbHideMessageHeaderPane = HideMessageHeaderPane;
        HideMessageHeaderPane = function() {
            ltnImipBar.resetBar();
            ltnImipBar.tbHideMessageHeaderPane.apply(null, arguments);
        };

        // Set up our observers
        Services.obs.addObserver(ltnImipBar, "onItipItemCreation");
    },

    /**
     * Unload handler to clean up after the imip bar
     * NOTE: This function is called without a valid this-context!
     */
    unload: function() {
        removeEventListener("messagepane-loaded", ltnImipBar.load, true);
        removeEventListener("messagepane-unloaded", ltnImipBar.unload, true);

        ltnImipBar.resetBar();
        Services.obs.removeObserver(ltnImipBar, "onItipItemCreation");
    },

    observe: function(subject, topic, state) {
        if (topic == "onItipItemCreation") {
            let itipItem = null;
            let msgOverlay = null;
            try {
                if (!subject) {
                    let sinkProps = msgWindow.msgHeaderSink.properties;
                    // This property was set by lightningTextCalendarConverter.js
                    itipItem = sinkProps.getPropertyAsInterface("itipItem",
                                                                Components.interfaces.calIItipItem);
                    msgOverlay = sinkProps.getPropertyAsAUTF8String("msgOverlay");
                }
            } catch (e) {
                // This will throw on every message viewed that doesn't have the
                // itipItem property set on it. So we eat the errors and move on.

                // XXX TODO: Only swallow the errors we need to. Throw all others.
            }
            if (!itipItem || !msgOverlay || !gMessageDisplay.displayedMessage) {
                return;
            }

            let imipMethod = gMessageDisplay.displayedMessage.getStringProperty("imip_method");
            cal.itip.initItemFromMsgData(itipItem, imipMethod, gMessageDisplay.displayedMessage);

            let imipBar = document.getElementById("imip-bar");
            imipBar.setAttribute("collapsed", "false");
            imipBar.setAttribute("label", cal.itip.getMethodText(itipItem.receivedMethod));

            // CMel
            if (itipItem.receivedMethod == "REQUEST") {
            	let rdvtraite = MsgHasRdvTraite(gMessageDisplay.displayedMessage);
                if (rdvtraite) itipItem.localStatus=TAG_RDVTRAITE;
            }
            // Fin CMel

            ltnImipBar.msgOverlay = msgOverlay;

            cal.itip.processItipItem(itipItem, ltnImipBar.setupOptions);
        }
    },

    /**
     * Hide the imip bar and reset the itip item.
     */
    resetBar: function() {
        document.getElementById("imip-bar").collapsed = true;
        ltnImipBar.resetButtons();

        // Clear our iMIP/iTIP stuff so it doesn't contain stale information.
        cal.itip.cleanupItipItem(ltnImipBar.itipItem);
        ltnImipBar.itipItem = null;
    },

    /**
     * Resets all buttons and its menuitems, all buttons are hidden thereafter
     */
    resetButtons: function() {
        lastReset = Date.now();
        let buttons = ltnImipBar.getButtons();
        buttons.forEach(hideElement);
        buttons.forEach(aButton => ltnImipBar.getMenuItems(aButton).forEach(showElement));
    },

    /**
     * Provides a list of all available buttons
     */
    getButtons: function() {
        let toolbarbuttons = document.getElementById("imip-view-toolbar")
                                     .getElementsByTagName("toolbarbutton");
        return Array.from(toolbarbuttons);
    },

    /**
     * Provides a list of available menuitems of a button
     *
     * @param aButton        button node
     */
    getMenuItems: function(aButton) {
        let items = [];
        let mitems = aButton.getElementsByTagName("menuitem");
        if (mitems != null && mitems.length > 0) {
            for (let mitem of mitems) {
                items.push(mitem);
            }
        }
        return items;
    },

    /**
     * Checks and converts button types based on available menuitems of the buttons
     * to avoid dropdowns which are empty or only replicating the default button action
     * Should be called once the buttons are set up
     */
    conformButtonType: function() {
        // check only needed on visible and not simple buttons
        let buttons = ltnImipBar.getButtons()
                                .filter(aElement => aElement.hasAttribute("type") && !aElement.hidden);
        // change button if appropriate
        for (let button of buttons) {
            let items = ltnImipBar.getMenuItems(button).filter(aItem => !aItem.hidden);
            if (button.type == "menu" && items.length == 0) {
                // hide non functional buttons
                button.hidden = true;
            } else if (button.type == "menu-button") {
                if (items.length == 0 ||
                    (items.length == 1 &&
                     button.hasAttribute("oncommand") &&
                     items[0].hasAttribute("oncommand") &&
                     button.getAttribute("oncommand")
                           .endsWith(items[0].getAttribute("oncommand")))) {
                    // convert to simple button
                    button.removeAttribute("type");
                }
            }
        }
    },

    /**
     * This is our callback function that is called each time the itip bar UI needs updating.
     * NOTE: This function is called without a valid this-context!
     *
     * @param itipItem      The iTIP item to set up for
     * @param rc            The status code from processing
     * @param actionFunc    The action function called for execution
     * @param foundItems    An array of items found while searching for the item
     *                      in subscribed calendars
     */
    setupOptions: function(itipItem, rc, actionFunc, foundItems) {
        //#6927: Forcer une synchronisation d'agenda avant l'affichage d'une invitation
        //(Uniquement si la date de dernier rafraichissement est infèrieur à la date du message et date de plus de 5 secondes)
        let refreshTreshold = new Date(Date.now());
        refreshTreshold.setSeconds(refreshTreshold.getSeconds()-5);
        if(lastRefresh < gMessageDisplay.displayedMessage.date/1000 && lastRefresh < refreshTreshold)
        {
          lastRefresh = new Date(Date.now());
          let calendars = cal.getCalendarManager().getCalendars({});//.filter(cal.itip.isSchedulingCalendar);
          for (i = 0; i < calendars.length; i++)
          {
            calendars[i].refresh();
          }
        }

        let imipBar = document.getElementById("imip-bar");
        let data = cal.itip.getOptionsText(itipItem, rc, actionFunc, foundItems);

        if (Components.isSuccessCode(rc)) {
            ltnImipBar.itipItem = itipItem;
            ltnImipBar.actionFunc = actionFunc;
            ltnImipBar.foundItems = foundItems;
        }

        // We need this to determine whether this is an outgoing or incoming message because
        // Thunderbird doesn't provide a distinct flag on message level to do so. Relying on
        // folder flags only may lead to false positives.
        let isOutgoing = function(aMsgHdr) {
            if (!aMsgHdr) {
                return false;
            }
            let author = aMsgHdr.mime2DecodedAuthor;
            let isSentFolder = aMsgHdr.folder && aMsgHdr.folder.flags &
                               Components.interfaces.nsMsgFolderFlags.SentMail;
            if (author && isSentFolder) {
                let accounts = MailServices.accounts;
                for (let identity of fixIterator(accounts.allIdentities,
                                                 Components.interfaces.nsIMsgIdentity)) {
                    if (author.includes(identity.email) && !identity.fccReplyFollowsParent) {
                        return true;
                    }
                }
            }
            return false;
        };

        // We override the bar label for sent out invitations and in case the event does not exist
        // anymore, we also clear the buttons if any to avoid e.g. accept/decline buttons
        if (isOutgoing(gMessageDisplay.displayedMessage)) {
            if (ltnImipBar.foundItems && ltnImipBar.foundItems[0]) {
                data.label = cal.l10n.getLtnString("imipBarSentText");
            } else {
                data = {
                    label: cal.l10n.getLtnString("imipBarSentButRemovedText"),
                    buttons: [],
                    hideMenuItems: [],
                    hideItems: [],
                    showItems: []
                };
            }
        }
        // #7437 Parfois, pas besoin de tout rafraichir.
        if(data)
        {
            imipBar.setAttribute("label", data.label);
            // let's reset all buttons first
            ltnImipBar.resetButtons();
            // now we update the visible items - buttons are hidden by default
            // apart from that, we need this to adapt the accept button depending on
            // whether three or four button style is present
            for (let item of data.hideItems) {
                hideElement(document.getElementById(item));
            }
            for (let item of data.showItems) {
                showElement(document.getElementById(item));
            }
            // adjust button style if necessary
            ltnImipBar.conformButtonType();
            ltnImipBar.displayModifications();
        }
    },

    /**
     * Displays changes in case of invitation updates in invitation overlay
     */
    displayModifications: function() {
        if (!ltnImipBar.msgOverlay || !msgWindow || !ltnImipBar.foundItems ||
            !ltnImipBar.foundItems[0] || !ltnImipBar.itipItem) {
            return;
        }

        let msgOverlay = ltnImipBar.msgOverlay;
        let diff = cal.itip.compare(ltnImipBar.itipItem.getItemList({})[0], ltnImipBar.foundItems[0]);
        // displaying chnages is only needed if that is enabled, an item already exists and there are
        // differences
        if (diff != 0 && Preferences.get("calendar.itip.displayInvitationChanges", false)) {
            let foundOverlay = ltn.invitation.createInvitationOverlay(ltnImipBar.foundItems[0],
                                                                      ltnImipBar.itipItem);
            let serializedOverlay = cal.xml.serializeDOM(foundOverlay);
            let organizerId = ltnImipBar.itipItem.targetCalendar.getProperty("organizerId");
            if (diff == 1) {
                // this is an update to previously accepted invitation
                msgOverlay = ltn.invitation.compareInvitationOverlay(serializedOverlay, msgOverlay,
                                                                     organizerId);
            } else {
                // this is a copy of a previously sent out invitation or a previous revision of a
                // meanwhile accepted invitation, so we flip comparison order
                msgOverlay = ltn.invitation.compareInvitationOverlay(msgOverlay, serializedOverlay,
                                                                     organizerId);
            }
        }
        msgWindow.displayHTMLInMessagePane("", msgOverlay, false);
    },

    /**
     * Exceutes an action triggered by an imip bar button
     *
     * @param   {String}  aParticipantStatus  A partstat string as per RfC 5545
     * @param   {String}  aResponse           Either 'AUTO', 'NONE' or 'USER',
     *                                          see calItipItem interface
     * @returns {Boolean}                     true, if the action succeeded
     */
    executeAction: function(aParticipantStatus, aResponse) {
        /**
         * Internal function to trigger an scheduling operation
         *
         * @param   {Function}     aActionFunc   The function to call to do the
         *                                         scheduling operation
         * @param   {calIItipItem} aItipItem     Scheduling item
         * @param   {nsIWindow}    aWindow       The current window
         * @param   {String}       aPartStat     partstat string as per RfC 5545
         * @param   {Object}       aExtResponse  JS object containing at least
         *                                         an responseMode property
         * @returns {Boolean}                    true, if the action succeeded
         */
        function _execAction(aActionFunc, aItipItem, aWindow, aPartStat, aExtResponse) {
            cal.LOG("in _execAction - User pressed the button.");
            if (cal.itip.promptCalendar(aActionFunc.method, aItipItem, aWindow)) {
                let isDeclineCounter = aPartStat == "X-DECLINECOUNTER";
                // filter out fake partstats
                if (aPartStat.startsWith("X-")) {
                    aParticipantStatus = "";
                }
                // hide the buttons now, to disable pressing them twice...
                //#7437 Reset les bouttons dans tous les cas
                //if (aPartStat == aParticipantStatus) {
                    ltnImipBar.resetButtons();
                //}

                let opListener = {
                    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
                    onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
                        if (Components.isSuccessCode(aStatus) && isDeclineCounter) {
                            // TODO: move the DECLINECOUNTER stuff to actionFunc
                            aItipItem.getItemList({}).forEach(aItem => {
                                // we can rely on the received itipItem to reply at this stage
                                // already, the checks have been done in cal.itip.processFoundItems
                                // when setting up the respective aActionFunc
                                let attendees = cal.itip.getAttendeesBySender(
                                    aItem.getAttendees({}),
                                    aItipItem.sender
                                );
                                let status = true;
                                if (attendees.length == 1 && ltnImipBar.foundItems &&
                                    ltnImipBar.foundItems.length) {
                                    // we must return a message with the same sequence number as the
                                    // counterproposal - to make it easy, we simply use the received
                                    // item and just remove a comment, if any
                                    try {
                                        let item = aItem.clone();
                                        item.calendar = ltnImipBar.foundItems[0].calendar;
                                        item.deleteProperty("COMMENT");
                                        // once we have full support to deal with for multiple items
                                        // in a received invitation message, we should send this
                                        // from outside outside of the forEach context
                                        status = cal.itip.sendDeclineCounterMessage(
                                            item,
                                            "DECLINECOUNTER",
                                            attendees,
                                            { value: false }
                                        );
                                    } catch (e) {
                                        cal.ERROR(e);
                                        status = false;
                                    }
                                } else {
                                    status = false;
                                }
                                if (!status) {
                                    cal.ERROR("Failed to send DECLINECOUNTER reply!");
                                }
                            });
                        }
                        // For now, we just state the status for the user something very simple
                        let label = cal.itip.getCompleteText(aStatus, aOperationType);
                        imipBar.setAttribute("label", label);

                        if (!Components.isSuccessCode(aStatus)) {
                            cal.showError(label);
                        } else {
                        	// CMel
                        	MsgSetRdvTraite(gMessageDisplay.displayedMessage);
                        	// Fin CMel
                        }
                    },
                    onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
                        cal.LOG("in onGetResult - aCalendar.name: "+aCalendar.name);
                    }
                };

                try {
                    // CMel
                    // Bugzilla 168680 - Add email attachments
                    cal.LOG("in _execAction - Starting aActionFunc");
                    aActionFunc(opListener, aParticipantStatus, aExtResponse, currentAttachments);
                    // CMel
                } catch (exc) {
                    Components.utils.reportError(exc);
                }
                return true;
            }
            return false;
        }

        let imipBar = document.getElementById("imip-bar");
        if (aParticipantStatus == null) {
            aParticipantStatus = "";
        }
        if (aParticipantStatus == "X-SHOWDETAILS" ||
            aParticipantStatus == "X-RESCHEDULE") {
            let counterProposal;
            let items = ltnImipBar.foundItems;
            if (items && items.length) {
                let item = items[0].isMutable ? items[0] : items[0].clone();

                if (aParticipantStatus == "X-RESCHEDULE") {
                    // TODO most of the following should be moved to the actionFunc defined in
                    // calItipUtils
                    let proposedItem = ltnImipBar.itipItem.getItemList({})[0];
                    let proposedRID = proposedItem.getProperty("RECURRENCE-ID");
                    if (proposedRID) {
                        // if this is a counterproposal for a specific occurrence, we use
                        // that to compare with
                        item = item.recurrenceInfo.getOccurrenceFor(proposedRID).clone();
                    }
                    let parsedProposal = ltn.invitation.parseCounter(proposedItem, item);
                    let potentialProposers = cal.itip.getAttendeesBySender(
                        proposedItem.getAttendees({}),
                        ltnImipBar.itipItem.sender
                    );
                    let proposingAttendee = potentialProposers.length == 1 ?
                                            potentialProposers[0] : null;
                    if (proposingAttendee &&
                        ["OK", "OUTDATED", "NOTLATESTUPDATE"].includes(parsedProposal.result.type)) {
                        counterProposal = {
                            attendee: proposingAttendee,
                            proposal: parsedProposal.differences,
                            oldVersion: parsedProposal.result == "OLDVERSION" ||
                                        parsedProposal.result == "NOTLATESTUPDATE",
                            onReschedule: () => {
                                imipBar.setAttribute(
                                    "label",
                                    cal.l10n.getLtnString("imipBarCounterPreviousVersionText")
                                );
                                // TODO: should we hide the buttons in this case, too?
                            }
                        };
                    } else {
                        imipBar.setAttribute(
                            "label",
                            cal.l10n.getLtnString("imipBarCounterErrorText")
                        );
                        ltnImipBar.resetButtons();
                        if (proposingAttendee) {
                            cal.LOG(parsedProposal.result.descr);
                        } else {
                            cal.LOG("Failed to identify the sending attendee of the counterproposal.");
                        }

                        return false;
                    }
                }
                // if this a rescheduling operation, we suppress the occurrence
                // prompt here
                modifyEventWithDialog(
                    item,
                    null,
                    aParticipantStatus != "X-RESCHEDULE",
                    null,
                    counterProposal
                );
            }
        } else {
            let response;
            if (aResponse) {
                if (aResponse == "AUTO" || aResponse == "NONE" || aResponse == "USER") {
                    response = { responseMode: Components.interfaces.calIItipItem[aResponse] };
                }
                // Open an extended response dialog to enable the user to add a comment, make a
                // counterproposal, delegate the event or interact in another way.
                // Instead of a dialog, this might be implemented as a separate container inside the
                // imip-overlay as proposed in bug 458578
            }
            let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                                   .getService(Components.interfaces.calIDeletedItems);
            let items = ltnImipBar.itipItem.getItemList({});
            if (items && items.length) {
                let delTime = delmgr.getDeletedDate(items[0].id);
                let dialogText = cal.l10n.getLtnString("confirmProcessInvitation");
                let dialogTitle = cal.l10n.getLtnString("confirmProcessInvitationTitle");

                // #6272: Le choix d'agenda par défaut n'est pas respecté lors de l'acceptation d'une invitation
                if(delTime)
                {
                  let calendars = cal.getCalendarManager().getCalendars({}).filter(cal.itip.isSchedulingCalendar);
                  //let matchingCals = calendars.filter(calendar => cal.itip.getInvitedAttendee(ltnImipBar.itipItem.getItemList({})[0], calendar) != null);
                  if (calendars.length == 1)
                  {
                    //if (delTime && !cal.itip.promptCalendar(aResponse, ltnImipBar.itipItem, window))
                    if (!Services.prompt.confirm(window, dialogTitle, dialogText))
                        return false;
                  }
                }
            }

            if (aParticipantStatus == "X-SAVECOPY") {
                // we create and adopt copies of the respective events
                let saveitems = ltnImipBar.itipItem.getItemList({}).map(cal.itip.getPublishLikeItemCopy.bind(cal));
                if (saveitems.length > 0) {
                    let methods = { receivedMethod: "PUBLISH", responseMethod: "PUBLISH" };
                    let newItipItem = cal.itip.getModifiedItipItem(ltnImipBar.itipItem,
                                                                   saveitems, methods);
                    // control to avoid processing _execAction on later user changes on the item
                    let isFirstProcessing = true;
                    // setup callback and trigger re-processing
                    let storeCopy = function(aItipItem, aRc, aActionFunc, aFoundItems) {
                        if (isFirstProcessing && aActionFunc && Components.isSuccessCode(aRc)) {
                            _execAction(
                                aActionFunc,
                                aItipItem,
                                window,
                                aParticipantStatus
                            );
                        }
                    };
                    cal.itip.processItipItem(newItipItem, storeCopy);
                    isFirstProcessing = false;
                }
                // we stop here to not process the original item
                return false;
            }
            return _execAction(
                ltnImipBar.actionFunc,
                ltnImipBar.itipItem,
                window,
                aParticipantStatus,
                response
            );
        }
        return false;
    }
};

addEventListener("messagepane-loaded", ltnImipBar.load, true);
addEventListener("messagepane-unloaded", ltnImipBar.unload, true);

// CMel
function MsgSetRdvTraite(msghdr) {
  var msgs = Components.classes["@mozilla.org/array;1"]
  						.createInstance(Components.interfaces.nsIMutableArray);

  msgs.appendElement(msghdr, false);
  msghdr.folder.addKeywordsToMessages(msgs, TAG_RDVTRAITE);
  msghdr.folder.markMessagesRead(msgs, true);
}


function MsgHasRdvTraite(msgHdr) {
  let tags = msgHdr.getStringProperty("keywords").split(" ");
  for (var i = 0; i < tags.length; i++) {
    if (TAG_RDVTRAITE==tags[i]) {
    	return true;
    }
  }
  return false;
}
// Fin Cmel

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload, onAccept, onCancel, updatePartStat, browseDocument,
 *          sendMailToOrganizer, openAttachment, reply
 */

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
ChromeUtils.import("resource://calendar/modules/utils/calCategoryUtils.jsm");
ChromeUtils.import("resource://calendar/modules/utils/calL10NUtils.jsm");

/**
 * Sets up the summary dialog, setting all needed fields on the dialog from the
 * item received in the window arguments.
 */
function onLoad() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    item = item.clone(); // use an own copy of the passed item
    window.calendarItem = item;

    // the calling entity provides us with an object that is responsible
    // for recording details about the initiated modification. the 'finalize'-property
    // is our hook in order to receive a notification in case the operation needs
    // to be terminated prematurely. this function will be called if the calling
    // entity needs to immediately terminate the pending modification. in this
    // case we serialize the item and close the window.
    if (args.job) {
        // store the 'finalize'-functor in the provided job-object.
        args.job.finalize = () => {
            // store any pending modifications...
            this.onAccept();

            let calendarItem = window.calendarItem;

            // ...and close the window.
            window.close();

            return calendarItem;
        };
    }

    // set the dialog-id to enable the right window-icon to be loaded.
    if (cal.item.isEvent(item)) {
        setDialogId(document.documentElement, "calendar-event-summary-dialog");
    } else if (cal.item.isToDo(item)) {
        setDialogId(document.documentElement, "calendar-task-summary-dialog");
    }

    window.attendees = item.getAttendees({});

    let calendar = cal.wrapInstance(item.calendar, Ci.calISchedulingSupport);
    window.readOnly = !(cal.acl.isCalendarWritable(calendar) &&
                        (cal.acl.userCanModifyItem(item) ||
                         (calendar &&
                          item.calendar.isInvitation(item) &&
                          cal.acl.userCanRespondToInvitation(item))));
    if (!window.readOnly && calendar) {
        let attendee = calendar.getInvitedAttendee(item);
        if (attendee) {
            // if this is an unresponded invitation, preset our default alarm values:
            if (!item.getAlarms({}).length &&
                (attendee.participationStatus == "NEEDS-ACTION")) {
                cal.alarms.setDefaultValues(item);
            }

            window.attendee = attendee.clone();
            // Since we don't have API to update an attendee in place, remove
            // and add again. Also, this is needed if the attendee doesn't exist
            // (i.e REPLY on a mailing list)
            item.removeAttendee(attendee);
            item.addAttendee(window.attendee);

            window.responseMode = "USER";
        }
    }

    // CM2V7 - MANTIS 0004782: Modification du titre d'une réunion
    //document.getElementById("item-title").value = item.title;
    setElementValue("item-title", item.title);
    document.getElementById("item-title").focus();
    if (calendar.readOnly) document.getElementById("item-title").setAttribute("disabled", true);

    document.getElementById("item-calendar").value = calendar.name;
    document.getElementById("item-start-row").Item = item;
    document.getElementById("item-end-row").Item = item;

    // show reminder if this item is *not* readonly.
    // this case happens for example if this is an invitation.
    let argCalendar = window.arguments[0].calendarEvent.calendar;
    let supportsReminders =
        (argCalendar.getProperty("capabilities.alarms.oninvitations.supported") !== false);
    if (!window.readOnly && supportsReminders) {
        document.getElementById("reminder-row").removeAttribute("hidden");
        loadReminders(window.calendarItem.getAlarms({}));
        updateReminder();
    }

    updateRepeatDetails();
    updateAttendees();
    updateLink();

	// CM2V6 - Attachments URL - Gestion des pieces jointes dans la fenetre reduite
    let hasAttachments = capSupported("attachments");
    let attachments = item.getAttachments({});
    if (hasAttachments && attachments && attachments.length > 0) {
        for (let attachment of attachments) {
            addAttachment(attachment);
        }
    }
    // End CM2V6 Attachments

    let location = item.getProperty("LOCATION");
    if (location && location.length) {
        document.getElementById("location-row").removeAttribute("hidden");
        document.getElementById("item-location").value = location;
    }

    // CM2V6
    if (cal.item.isEvent(item)) {
      let categoryMenuList = document.getElementById("item-categories");
      let indexToSelect = appendCategoryItems(item, categoryMenuList);
      categoryMenuList.selectedIndex = indexToSelect;
      if (calendar.readOnly) categoryMenuList.setAttribute("disabled", true);
      let categoryRow=document.getElementById("category-row-event");
      categoryRow.removeAttribute("hidden");
    } else {
        let categories = item.getCategories({});
        if (categories.length > 0) {
            document.getElementById("category-row").removeAttribute("hidden");
            document.getElementById("item-category").value = categories.join(", "); // TODO l10n-unfriendly
        }
    }
    // Fin CM2V6

    let organizer = item.organizer;
    if (organizer && organizer.id) {
        document.getElementById("organizer-row").removeAttribute("hidden");
        let cell = document.getElementsByClassName("item-organizer-cell")[0];
        let text = cell.getElementsByTagName("label")[0];
        let icon = cell.getElementsByTagName("img")[0];

        let role = organizer.role || "REQ-PARTICIPANT";
        let userType = organizer.userType || "INDIVIDUAL";
        let partstat = organizer.participationStatus || "NEEDS-ACTION";
        let orgName = (organizer.commonName && organizer.commonName.length)
                       ? organizer.commonName : organizer.toString();
        let userTypeString = cal.l10n.getCalString(
            "dialog.tooltip.attendeeUserType2." + userType,
            [organizer.toString()]
        );
        let roleString = cal.l10n.getCalString(
            "dialog.tooltip.attendeeRole2." + role,
            [userTypeString]
        );
        let partstatString = cal.l10n.getCalString(
            "dialog.tooltip.attendeePartStat2." + partstat,
            [orgName]
        );
        let tooltip = cal.l10n.getCalString(
            "dialog.tooltip.attendee.combined",
            [roleString, partstatString]
        );

        text.setAttribute("value", orgName);
        cell.setAttribute("tooltiptext", tooltip);
        icon.setAttribute("partstat", partstat);
        icon.setAttribute("usertype", userType);
        icon.setAttribute("role", role);
    }

    let status = item.getProperty("STATUS");
    // CM2V6
    if (cal.item.isEvent(item)) {
      var statusRow=document.getElementById("status-row-event");
      statusRow.removeAttribute("hidden");
      if (status && status.length) {
        if ("TENTATIVE"==status || "CONFIRMED"==status || "CANCELLED"==status || "NEED-ACTION"==status) {
          var itemstatus=document.getElementById("item-status");
          itemstatus.value=status;
        }
      }
    } else {
        if (status && status.length) {
            let statusRow = document.getElementById("status-row");
            for (let i = 0; i < statusRow.childNodes.length; i++) {
                if (statusRow.childNodes[i].getAttribute("status") == status) {
                    statusRow.removeAttribute("hidden");
                    if (status == "CANCELLED" && cal.item.isToDo(item)) {
                        // There are two labels for CANCELLED, the second one is for
                        // todo items. Increment the counter here.
                        i++;
                    }
                    statusRow.childNodes[i].removeAttribute("hidden");
                    break;
                }
            }
        }
    }
    if (calendar.readOnly) document.getElementById("item-status").setAttribute("disabled", true);
    // Fin CM2V6

    // CM2V6 - MANTIS 1904: Ajouter la possibilité de modifier la confidentialité d'un évènement auquel on est invité.
    var privacy = item.getProperty("CLASS");
    if (cal.item.isEvent(item)) {
      var privacyRow=document.getElementById("privacy-row-event");
      privacyRow.removeAttribute("hidden");
      if (privacy && privacy.length) {
        if ("PRIVATE"==privacy || "PUBLIC"==privacy) {
          var itemprivacy=document.getElementById("item-privacy");
          itemprivacy.value=privacy;
          if (calendar.readOnly) itemprivacy.setAttribute("disabled", true);
        }
      }
    }
    // Fin CM2V6

    if (item.hasProperty("DESCRIPTION")) {
        let description = item.getProperty("DESCRIPTION");
        if (description && description.length) {
            document.getElementById("item-description-box")
                .removeAttribute("hidden");
            let textbox = document.getElementById("item-description");
            textbox.value = description;
            textbox.inputField.readOnly = true;
        }
    }

    document.title = item.title;

    // If this item is read only we remove the 'cancel' button as users
    // can't modify anything, thus we go ahead with an 'ok' button only.
    if (window.readOnly) {
        document.documentElement.getButton("cancel").setAttribute("collapsed", "true");
        document.documentElement.getButton("accept").focus();
    }

    window.focus();
    opener.setCursor("auto");
}

function onUnload() {
    if (typeof ToolbarIconColor !== "undefined") {
        ToolbarIconColor.uninit();
    }
}

/**
 * Saves any changed information to the item.
 *
 * @return      Returns true if the dialog
 */
function onAccept() {
    dispose();
    if (window.readOnly) {
        return true;
    }
    // let's make sure we have a response mode defined
    let resp = window.responseMode || "USER";
    let respMode = { responseMode: Ci.calIItipItem[resp] };

    let args = window.arguments[0];
    let oldItem = args.calendarEvent;
    let newItem = window.calendarItem;
    let calendar = newItem.calendar;

    // CMel - MANTIS 0004782: Modification du titre d'une réunion
    cal.item.setItemProperty(newItem, "title", getElementValue("item-title"));
    if (cal.item.isEvent(newItem)) {
        let itemstatus = document.getElementById("item-status");
        newItem.setProperty("STATUS", itemstatus.value);
        // CM2V6 - MANTIS 1904: Ajouter la possibilité de modifier la confidentialité d'un évènement auquel on est invité.
        let itemprivacy = document.getElementById("item-privacy");
        newItem.setProperty("CLASS", itemprivacy.value);

        setCategory(newItem, "item-categories");
        // participation modifiee
        if (newItem.calendar.getProperty("pacome")) {
          let oldCal = oldItem.calendar;
          let newCal = newItem.calendar;
          if (oldCal.getInvitedAttendee
        		  && newCal.getInvitedAttendee) {
	          let attOld = oldCal.getInvitedAttendee(oldItem);
	          let attNew = newCal.getInvitedAttendee(newItem);
	          if (attOld && attNew && attOld.participationStatus != attNew.participationStatus){
	            newItem.setProperty("X-CM2V3-ACTION","REPLY");
	          } else {
	            newItem.setProperty("X-CM2V3-ACTION","MODIFY");
	          }
          } else {
        	  newItem.setProperty("X-CM2V3-ACTION","MODIFY");
          }
       }
    }
    // Fin CMel

    saveReminder(newItem);
    adaptScheduleAgent(newItem);
    args.onOk(newItem, calendar, oldItem, null, respMode);
    window.calendarItem = newItem;
    return true;
}

/**
 * Called when closing the dialog and any changes should be thrown away.
 */
function onCancel() {
    dispose();
    return true;
}

/**
 * Updates the user's partstat, sends a notification if requested and closes the
 * dialog
 *
 * @param {string}  aResponse  a literal of one of the response modes defined
 *                               in calIItipItem (like 'NONE')
 * @param {string}  aPartStat  (optional) a partstat as per RfC5545
 */
function reply(aResponse, aPartStat=null) {
    if (aPartStat && window.attendee) {
        let aclEntry = window.calendarItem.calendar.aclEntry;
        if (aclEntry) {
            let userAddresses = aclEntry.getUserAddresses({});
            if (userAddresses.length > 0 &&
                !cal.email.attendeeMatchesAddresses(window.attendee, userAddresses)) {
                window.attendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
            }
        }
        window.attendee.participationStatus = aPartStat;
        updateToolbar();
    }
    saveAndClose(aResponse);
}

/**
 * Stores the event in the calendar and closes the dialog
 *
 * @param {string}  aResponse  a literal of one of the response modes defined
 *                               in calIItipItem (like 'NONE')
 */
function saveAndClose(aResponse="NONE") {
    // we use NONE as default since we don't want to send out notifications if
    // the user just updates the reminder settings
    window.responseMode = aResponse;
    document.documentElement.acceptDialog();
}

function updateToolbar() {
    if (window.readOnly) {
        document.getElementById("summary-toolbar").setAttribute("hidden", "true");
        return;
    }

    let replyButtons = document.getElementsByAttribute("type", "menu-button");
    for (let element of replyButtons) {
        element.removeAttribute("hidden");
        if (window.attendee) {
            // we disable the control which represents the current partstat
            let status = window.attendee.participationStatus || "NEEDS-ACTION";
            if (element.getAttribute("value") == status) {
                element.setAttribute("disabled", "true");
            } else {
                element.removeAttribute("disabled");
            }
        }
    }

    let notificationBox = document.getElementById("status-notification");
    if (window.attendee) {
        // we display a notification about the users partstat
        let partStat = window.attendee.participationStatus || "NEEDS-ACTION";
        let type = cal.item.isEvent(window.calendarItem) ? "event" : "task";

        let msgStr = {
            ACCEPTED: type + "Accepted",
            COMPLETED: "taskCompleted",
            DECLINED: type + "Declined",
            DELEGATED: type + "Delegated",
            TENTATIVE:  type + "Tentative"
        };
        // this needs to be noted differently to get accepted the '-' in the key
        msgStr["NEEDS-ACTION"] = type + "NeedsAction";
        msgStr["IN-PROGRESS"] = "taskInProgress";

        let msg = cal.l10n.getString("calendar-event-dialog", msgStr[partStat]);

        notificationBox.appendNotification(msg,
                                           "statusNotification",
                                           null,
                                           notificationBox.PRIORITY_INFO_MEDIUM);
    } else {
        notificationBox.removeAllNotifications();
    }
}

/**
 * Updates the dialog w.r.t recurrence, i.e shows a text describing the item's
 * recurrence)
 */
function updateRepeatDetails() {
    let args = window.arguments[0];
    let item = args.calendarEvent;

    // step to the parent (in order to show the
    // recurrence info which is stored at the parent).
    item = item.parentItem;

    // retrieve a valid recurrence rule from the currently
    // set recurrence info. bail out if there's more
    // than a single rule or something other than a rule.
    let recurrenceInfo = item.recurrenceInfo;
    if (!recurrenceInfo) {
        return;
    }

    document.getElementById("repeat-row").removeAttribute("hidden");

    // First of all collapse the details text. If we fail to
    // create a details string, we simply don't show anything.
    // this could happen if the repeat rule is something exotic
    // we don't have any strings prepared for.
    let repeatDetails = document.getElementById("repeat-details");
    repeatDetails.setAttribute("collapsed", "true");

    // Try to create a descriptive string from the rule(s).
    let kDefaultTimezone = cal.dtz.defaultTimezone;
    let startDate = item.startDate || item.entryDate;
    let endDate = item.endDate || item.dueDate;
    startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
    endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
    let detailsString = recurrenceRule2String(recurrenceInfo, startDate,
                                              endDate, startDate.isDate);

    if (!detailsString) {
        detailsString = cal.l10n.getString("calendar-event-dialog", "ruleTooComplexSummary");
    }

    // Now display the string...
    let lines = detailsString.split("\n");
    repeatDetails.removeAttribute("collapsed");
    while (repeatDetails.childNodes.length > lines.length) {
        repeatDetails.lastChild.remove();
    }
    let numChilds = repeatDetails.childNodes.length;
    for (let i = 0; i < lines.length; i++) {
        if (i >= numChilds) {
            let newNode = repeatDetails.firstChild
                                       .cloneNode(true);
            repeatDetails.appendChild(newNode);
        }
        repeatDetails.childNodes[i].value = lines[i];
        repeatDetails.childNodes[i].setAttribute("tooltiptext", detailsString);
    }
}

/**
 * Updates the attendee listbox, displaying all attendees invited to the
 * window's item.
 */
function updateAttendees() {
    if (window.attendees && window.attendees.length) {
        document.getElementById("item-attendees").removeAttribute("hidden");
        setupAttendees();
    }
}

/**
 * Updates the reminder, called when a reminder has been selected in the
 * menulist.
 */
function updateReminder() {
    commonUpdateReminder();
}

/**
 * Browse the item's attached URL.
 *
 * XXX This function is broken, should be fixed in bug 471967
 */
function browseDocument() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    let url = item.getProperty("URL");
    launchBrowser(url);
}

/**
 * Extracts the item's organizer and opens a compose window to send the
 * organizer an email.
 */
function sendMailToOrganizer() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    let organizer = item.organizer;
    let email = cal.email.getAttendeeEmail(organizer, true);
    let emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [item.title]);
    let identity = item.calendar.getProperty("imip.identity");
    cal.email.sendTo(email, emailSubject, null, identity);
}


// CM2V6
/**
 * Adds the given attachment to dialog controls.
 *
 * @param attachment    The calIAttachment object to add
 */
function addAttachment(aAttachment) {
    var attachment = aAttachment.clone();

    if (!attachment ||
        !attachment.hashId) {
        return;
    }

    function roundNumber(num, dec) {
	    let result = Math.round(num*Math.pow(10,dec))/Math.pow(10,dec);
	    return result;
    }

    // We currently only support uri attachments
    if (attachment.uri) {

        let item = document.createElement('listitem');
        let cellItem = document.createElement('listcell');

        // Set listitem attributes
        // Call in calAttachmentsUtils
        cellItem.setAttribute("label", cal.attachments.makePrettyName(attachment.uri));
        cellItem.setAttribute("crop", "end");
        cellItem.setAttribute("class", "listitem-iconic");
        let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mce-conf.krb.gendarmerie.fr/services/download/krbindex.php");
        if (attachment.uri.schemeIs("file")) {
            // Change icons view
            //item.setAttribute("image", "moz-icon://" + attachment.uri);
            cellItem.setAttribute("image", "moz-icon://." + attachment.uri.spec.split('.').pop() + "?size=16");
        } else if (attachment.uri.spec.indexOf(myurl) == 0) {
		        // Change icons view
            cellItem.setAttribute("image", "moz-icon://." + cal.attachments.makePrettyName(attachment.uri).split('.').pop() + "?size=16");
		    } else {
            cellItem.setAttribute("image", "moz-icon://dummy.html");
        }

        // full attachment object is stored here
        item.attachment = attachment;

        item.appendChild(cellItem);

        // Attachment Size
        let cellSize = document.createElement('listcell');
        let size = attachment.getParameter("SIZE");
        if (!size) {
         size = "";
        }
        else {
          if (size/1024 >= 1) {
           if (size/1024/1024 >= 1) size = roundNumber(size/1024/1024,1) + " Mo";
           else size = roundNumber(size/1024,1) + " Ko";
          }
        }


        cellSize.setAttribute("label", size);

        item.appendChild(cellSize);

        let documentLink = document.getElementById("attachment-link");
        documentLink.appendChild(item);

        // Update the number of rows and save our attachment globally
        documentLink.rows = documentLink.getRowCount();
    }

    // Bugzilla 168680 - don't use gAttachMap array
    /*gAttachMap[attachment.hashId] = attachment;*/
    updateAttachment();
}

/**
 * Handler function to handle pressing keys in the attachment listbox.
 *
 * @param event     The DOM event caused by the key press.
 */
function attachmentLinkKeyPress(event) {
    const kKE = Components.interfaces.nsIDOMKeyEvent;
    switch (event.keyCode) {
        case kKE.DOM_VK_ENTER:
            openAttachment();
            break;
    }
}

/**
 * Handler function to take care of clicking on an attachment
 *
 * @param event     The DOM event caused by the clicking.
 */
function attachmentLinkClicked(event) {
    event.currentTarget.focus();

    if (event.button != 0) {
        return;
    }

    if (event.originalTarget.localName == "listitem" && event.detail == 2) {
        openAttachment();
    }
}


/**
 * This function updates dialog controls related to item attachments
 */
function updateAttachment() {
    var hasAttachments = capSupported("attachments");
    //setElementValue("cmd_attach_url", !hasAttachments && "true", "disabled");

    var documentRow = document.getElementById("item-attachments-box");
    //var attSeparator = document.getElementById("event-grid-attachment-separator");
    if (!hasAttachments) {
        documentRow.setAttribute("hidden", "true");
        //attSeparator.setAttribute("collapsed", "true");
    } else {
        documentRow.removeAttribute("hidden");
        //var documentLink = document.getElementById("attachment-link");
        //setElementValue(documentRow, documentLink.getRowCount() < 1 && "true", "collapsed");
        //setElementValue(attSeparator, documentLink.getRowCount() < 1 && "true", "collapsed");
    }
}

/**
 * Test if a specific capability is supported
 *
 * @param aCap      The capability from "capabilities.<aCap>.supported"
 */
function capSupported(aCap) {
    let calendar = getCurrentCalendar();
    return calendar.getProperty("capabilities." + aCap + ".supported") !== false;
}

/**
* Fills up a menu - either a menupopup or a menulist - with menuitems that refer
* to categories.
*
* @param aItem                 The event or task
* @param aCategoryMenuList     The direct parent of the menuitems - either a
*                                menupopup or a menulist
* @param aCommand              A string that is applied to the "oncommand"
*                                attribute of each menuitem
* @return                      The index of the category that is selected.
*                                By default 0 is returned.
*/
function appendCategoryItems(aItem, aCategoryMenuList, aCommand) {

    var categoriesList = cal.category.fromPrefs();

    // 'split'may return an array containing one
    // empty string, rather than an empty array. This results in an empty
    // menulist item with no corresponding category.
    if (categoriesList.length == 1 && !categoriesList[0].length) {
        categoriesList.pop();
    }

    // insert the category already in the menulist so it doesn't get lost
    if (aItem) {
        for (var itemCategory of aItem.getCategories({})) {
            if (!categoriesList.some(function(cat){ return cat == itemCategory; })){
                categoriesList.push(itemCategory);
            }
        }
        cal.l10n.sortArrayByLocaleCollator(categoriesList);
    }

    while (aCategoryMenuList.hasChildNodes()) {
       aCategoryMenuList.removeChild(aCategoryMenuList.lastChild);
    }

    let indexToSelect = 0;
    let menuitem = addMenuItem(aCategoryMenuList, cal.l10n.getCalString("None"), "NONE", aCommand);
    if (aCategoryMenuList.localName == "menupopup") {
        menuitem.setAttribute("type", "checkbox");
    }
    for (var i in categoriesList) {
        menuitem = addMenuItem(aCategoryMenuList, categoriesList[i], categoriesList[i], aCommand);
        if (aCategoryMenuList.localName == "menupopup") {
            menuitem.setAttribute("type", "checkbox");
        }
        if (itemCategory && categoriesList[i] == itemCategory) {
            indexToSelect = parseInt(i) + 1;  // Add 1 because of 'None'
        }
    }

    return indexToSelect;
}

/**
 * Sets the category on the given item, from the menuitem element.
 *
 * @param aItem           The item to set the category on.
 * @param aMenuElement    The menuitem to retrieve the category from.
 */
function setCategory(aItem, aMenuElement) {
    // Category
    var category = getElementValue(aMenuElement);
    // xxx todo: what about category "NONE"?
    if (category == "NONE") {
        aItem.setCategories(0, []);
    } else {
        aItem.setCategories(1, [category]);
    }
}

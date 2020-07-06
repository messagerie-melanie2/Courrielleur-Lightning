/*
fichier calendar-event-dialog-reminder.js modifie pour le courrielleur
*/

/* ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is Sun Microsystems code.
 *
 * The Initial Developer of the Original Code is Sun Microsystems.
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Michael Buettner <michael.buettner@sun.com>
 *   Philipp Kewisch <mozilla@kewis.ch>
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

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calIteratorUtils.jsm");
Components.utils.import("resource://gre/modules/PluralForm.jsm");

let allowedActionsMap = {}; 

/**
 * Sets up the reminder dialog.
 */
function onLoad() {
    let calendar = window.arguments[0].calendar;

    // Set up the action map
    let supportedActions = calendar.getProperty("capabilities.alarms.actionValues") ||
                           ["DISPLAY" /* TODO email support, "EMAIL" */];
    for (let action of supportedActions) {
        allowedActionsMap[action] = true;
    }

    // Hide all actions that are not supported by this provider
    let firstAvailableItem;
    let actionNodes = document.getElementById("reminder-actions-menupopup").childNodes;
    for (let actionNode of Array.slice(actionNodes)) {
        let shouldHide = (!(actionNode.value in allowedActionsMap) ||
                          (actionNode.hasAttribute("provider") &&
                           actionNode.getAttribute("provider") != calendar.type));
        setElementValue(actionNode, shouldHide && "true", "hidden");
        if (!firstAvailableItem && !shouldHide) {
            firstAvailableItem = actionNode;
        }
    }

    // Correct the selected item on the supported actions list. This will be
    // changed when reminders are loaded, but in case there are none we need to
    // provide a sensible default.
    if (firstAvailableItem) {
        document.getElementById("reminder-actions-menulist").selectedItem = firstAvailableItem;
    }

    loadReminder();
    opener.setCursor("auto");
}

/**
 * Load Reminders from the window's arguments and set up dialog controls to
 * their initial values.
 */
function loadReminder() {

	let args = window.arguments[0];
	let reminders = args.reminders || args.item.getAlarms({});
	cal.LOG("cm2calendar loadReminder reminders.length="+reminders.length);
	if (0==reminders.length) {
		return;
	}
	
	let length=document.getElementById("reminder-length");
	let unit=document.getElementById("reminder-unit");

	//init reminder-length - reminder-unit
	let reminder=reminders[0];

	if (reminder.action in allowedActionsMap &&
			Components.interfaces.calIAlarm.ALARM_RELATED_START==reminder.related) {

		// Unit and length
		let alarmlen = Math.abs(reminder.offset.inSeconds / 60);
		cal.LOG("cm2calendar loadReminder alarmlen="+alarmlen);
		if (alarmlen % 1440 == 0) {
			unit.value="days";
			length.value=alarmlen / 1440;
		} else if (alarmlen % 60 == 0) {
			unit.value="hours";
			length.value=alarmlen / 60;
		} else {
			unit.value="minutes";
			length.value=alarmlen;
		}
	}
}


/**
* retourne tableau reminder � partir des valeurs saisies pour la fonction de rappel.
*/
function getReminderFromUI() {

	let length=document.getElementById("reminder-length");
	let unit=document.getElementById("reminder-unit");
	
	cal.LOG("cm2calendar-event-dialog-reminder.js getReminderFromUI unit="+unit.value+" - length="+length.value);

	let reminders=[  ];
	
	let reminder=cal.createAlarm();
	
	let offset=cal.createDuration();
	if ("minutes"==unit.value) {
		offset.minutes=length.value;
	} else if ("hours"==unit.value) {
		offset.hours=length.value;
	} else if ("days"==unit.value) {
		offset.days=length.value;
	} 
	offset.normalize();
	offset.isNegative=true;
	reminder.related=reminder.ALARM_RELATED_START;
	reminder.offset=offset;
	if ("DISPLAY" in allowedActionsMap) {
			reminder.action="DISPLAY";
	} else {
			let calendar=window.arguments[0].calendar;
			let actions=calendar.getProperty("capabilities.alarms.actionValues") || [];
			reminder.action=actions[0];
	}
	
	reminders.push(reminder);
	
	return reminders;
}



/**
 * Handler function to be called when the accept button is pressed.
 *
 * @return      Returns true if the window should be closed
 */
function onAccept() {
	let listbox = document.getElementById("reminder-listbox");
	let reminders=getReminderFromUI();
	if (window.arguments[0].onOk) {
			window.arguments[0].onOk(reminders);
	}

	return true;
}


/**
 * Handler function to be called when the cancel button is pressed.
 */
function onCancel() {
    if (window.arguments[0].onCancel) {
        window.arguments[0].onCancel();
    }
}

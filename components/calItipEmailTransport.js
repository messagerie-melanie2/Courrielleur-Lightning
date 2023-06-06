/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://calendar/modules/ltnInvitationUtils.jsm");
ChromeUtils.import("resource://calendar/modules/utils/calL10NUtils.jsm");
ChromeUtils.import("resource://calendar/modules/calRecurrenceUtils.jsm");

/**
 * Constructor of calItipEmailTransport object
 */
function calItipEmailTransport() {
    this.wrappedJSObject = this;
    this._initEmailTransport();
}
var calItipEmailTransportClassID = Components.ID("{d4d7b59e-c9e0-4a7a-b5e8-5958f85515f0}");
var calItipEmailTransportInterfaces = [Ci.calIItipTransport];
calItipEmailTransport.prototype = {
    classID: calItipEmailTransportClassID,
    QueryInterface: XPCOMUtils.generateQI(calItipEmailTransportInterfaces),
    classInfo: XPCOMUtils.generateCI({
        classID: calItipEmailTransportClassID,
        contractID: "@mozilla.org/calendar/itip-transport;1?type=email",
        classDescription: "Calendar iTIP Email Transport",
        interfaces: calItipEmailTransportInterfaces,
    }),

    mHasXpcomMail: false,
    mDefaultAccount: null,
    mDefaultIdentity: null,
    mDefaultSmtpServer: null,

    get scheme() { return "mailto"; },
    get type() { return "email"; },

    mSenderAddress: null,
    get senderAddress() {
        return this.mSenderAddress;
    },
    set senderAddress(aValue) {
        return (this.mSenderAddress = aValue);
    },

    sendItems: function(aCount, aRecipients, aItipItem) {
        if (this.mHasXpcomMail) {
            cal.LOG("sendItems: Preparing to send an invitation email...");
            let items = this._prepareItems(aItipItem);
            if (items === false) {
                return false;
            }
            
            // CM2V6 Attachments - 26/08/2011 - Traitement des pièces jointes de l'événement
        	let this_ = this;
        	let item = aItipItem.getItemList({})[0];
        	cal.attachments.readAttachmentsFiles(item, function () {
        		this_._sendXpcomMail(aRecipients, items.subject, items.body, aItipItem);
        	}, true);
        	// End CM2V6 Attachments

        } else {
            // sending xpcom mail is not available if no identity has been set
            throw Cr.NS_ERROR_NOT_AVAILABLE;
        }
    },

    _prepareItems: function(aItipItem) {
        let item = aItipItem.getItemList({})[0];

        // Get ourselves some default text - when we handle organizer properly
        // We'll need a way to configure the Common Name attribute and we should
        // use it here rather than the email address

        let summary = item.getProperty("SUMMARY") || "";
        let subject = "";
        let body = "";
        switch (aItipItem.responseMethod) {
            case "REQUEST": {
                let usePrefixes = Preferences.get(
                    "calendar.itip.useInvitationSubjectPrefixes",
                    true
                );
                if (usePrefixes) {
                    let seq = item.getProperty("SEQUENCE");
                    let subjectKey = seq && seq > 0
                        ? "itipRequestUpdatedSubject"
                        : "itipRequestSubject";
                    subject = cal.l10n.getLtnString(subjectKey, [summary]);
                } else {
                    subject = summary;
                }
                body = cal.l10n.getLtnString(
                    "itipRequestBody",
                    [item.organizer ? item.organizer.toString() : "", summary]
                );
                break;
            }
            case "CANCEL": {
                subject = cal.l10n.getLtnString("itipCancelSubject", [summary]);
                body = cal.l10n.getLtnString(
                    "itipCancelBody",
                    [item.organizer ? item.organizer.toString() : "", summary]
                );
                break;
            }
            case "DECLINECOUNTER": {
                subject = cal.l10n.getLtnString("itipDeclineCounterSubject", [summary]);
                body = cal.l10n.getLtnString(
                    "itipDeclineCounterBody",
                    [item.organizer ? item.organizer.toString() : "", summary]
                );
                break;
            }
            case "REPLY": {
                // Get my participation status
                let att = cal.itip.getInvitedAttendee(item, aItipItem.targetCalendar);
                if (!att && aItipItem.identity) {
                    att = item.getAttendeeById(cal.email.prependMailTo(aItipItem.identity));
                }
                if (!att) { // should not happen anymore
                    return false;
                }

                // work around BUG 351589, the below just removes RSVP:
                aItipItem.setAttendeeStatus(att.id, att.participationStatus);
                let myPartStat = att.participationStatus;
                let name = att.toString();

                // Generate proper body from my participation status
                let subjectKey, bodyKey;
                switch (myPartStat) {
                    case "ACCEPTED":
                        subjectKey = "itipReplySubjectAccept";
                        bodyKey = "itipReplyBodyAccept";
                        break;
                    case "TENTATIVE":
                        subjectKey = "itipReplySubjectTentative";
                        bodyKey = "itipReplyBodyTentative";
                        break;
                    case "DECLINED":
                        subjectKey = "itipReplySubjectDecline";
                        bodyKey = "itipReplyBodyDecline";
                        break;
                    default:
                        subjectKey = "itipReplySubject";
                        bodyKey = "itipReplyBodyAccept";
                        break;
                }
                subject = cal.l10n.getLtnString(subjectKey, [summary]);
                body = cal.l10n.getLtnString(bodyKey, [name]);
                break;
            }
        }
        
        return {
            subject: subject,
            body: body
        };
    },

    _initEmailTransport: function() {
        this.mHasXpcomMail = true;

        try {
            this.mDefaultSmtpServer = MailServices.smtp.defaultServer;
            this.mDefaultAccount = MailServices.accounts.defaultAccount;
            this.mDefaultIdentity = this.mDefaultAccount.defaultIdentity;

            if (!this.mDefaultIdentity) {
                // If there isn't a default identity (i.e Local Folders is your
                // default identity, then go ahead and use the first available
                // identity.
                let allIdentities = MailServices.accounts.allIdentities;
                if (allIdentities.length > 0) {
                    this.mDefaultIdentity = allIdentities.queryElementAt(0, Ci.nsIMsgIdentity);
                } else {
                    // If there are no identities, then we are in the same
                    // situation as if we didn't have Xpcom Mail.
                    this.mHasXpcomMail = false;
                    cal.LOG("initEmailService: No XPCOM Mail available: " + e);
                }
            }
        } catch (ex) {
            // Then we must resort to operating system specific means
            this.mHasXpcomMail = false;
        }
    },

    _sendXpcomMail: function(aToList, aSubject, aBody, aItipItem) {
        let identity = null;
        let account;
        if (aItipItem.targetCalendar) {
            identity = aItipItem.targetCalendar.getProperty("imip.identity");
            if (identity) {
                identity = identity.QueryInterface(Ci.nsIMsgIdentity);
                account = aItipItem.targetCalendar
                                   .getProperty("imip.account")
                                   .QueryInterface(Ci.nsIMsgAccount);
            } else {
                cal.WARN("No email identity configured for calendar " +
                         aItipItem.targetCalendar.name);
            }
        }
        if (!identity) { // use some default identity/account:
            identity = this.mDefaultIdentity;
            account = this.mDefaultAccount;
        }

        let compatMode = 0;
        switch (aItipItem.autoResponse) {
            case Ci.calIItipItem.USER: {
                cal.LOG("sendXpcomMail: Found USER autoResponse type.");
                // We still need this as a last resort if a user just deletes or
                //  drags an invitation related event
                let parent = Services.wm.getMostRecentWindow(null);
                if (parent.closed) {
                    parent = cal.window.getCalendarWindow();
                }
                /*let cancelled = Services.prompt.confirmEx(
                    parent,
                    cal.l10n.getLtnString("imipSendMail.title"),
                    cal.l10n.getLtnString("imipSendMail.text"),
                    Services.prompt.STD_YES_NO_BUTTONS,
                    null,
                    null,
                    null,
                    null,
                    {}
                );
                if (cancelled) {
                    cal.LOG("sendXpcomMail: Sending of invitation email aborted by user!");
                    break;
                } // else go on with auto sending for now*///#6107: Suppression envoi d'une invitation sans POP-UP de confirmation  
            }
            // falls through intended
            case Ci.calIItipItem.AUTO: {
                // don't show log message in case of falling through
                if (aItipItem.autoResponse == Ci.calIItipItem.AUTO) {
                    cal.LOG("sendXpcomMail: Found AUTO autoResponse type.");
                }
                let toList = "";
                // CM2V6 - Liste des non participants
                let toNonParticipantList = "";
                for (let recipient of aToList) 
                {
                    // Strip leading "mailto:" if it exists.
                    let rId = recipient.id.replace(/^mailto:/i, "");
                    // CM2V6 - Test s'il s'agit d'un non participant
                    if (recipient.role &&  "NON-PARTICIPANT" == recipient.role) 
                    {
                        // Prevent trailing commas.
                        if (toNonParticipantList.length > 0) 
                        {
                            toNonParticipantList += ", ";
                        }
                        // Add this recipient id to the list.
                        toNonParticipantList += rId;
                    } 
                    else
                    {
                        // #6372 Diminution du nombre de notifications
                        // Si l'attendee a accepté ou refusé l'evenement, et qu'il a l'attribut
                        // X-MEL-EVENT-SAVED, alors il ne doit pas recevoir de notifications.
                        try
                        {
                          //#6706 Envoi de la notification en cas de suppression (sujet "événement annulé")
                          //#6372 Pas de notification lors de certaines modifications
                          if(!aSubject.includes("nement annu") && recipient.getProperty("X-MEL-EVENT-SAVED") == 1 && (recipient.participationStatus == "ACCEPTED" || recipient.participationStatus == "DECLINED"))
                          {
                            cal.LOG("SUBJECT: "+aSubject);
                            cal.LOG("sendXpcomMail: No need to notify " + recipient.toString());
                          } 
                          else
                          {
                            cal.LOG("Ajout de " + recipient.toString() + " à la liste des destinataires.");
                            cal.LOG("X-MEL-EVENT-SAVED: " + recipient.getProperty("X-MEL-EVENT-SAVED"));
                            cal.LOG("STATUS: " + recipient.participationStatus);
                            // Prevent trailing commas.
                            if (toList.length > 0) 
                            {
                              toList += ", ";
                            }
                            // Add this recipient id to the list.
                            toList += rId;
                          }
                        }
                        catch(ex)
                        {
                          cal.LOG("Attention: Une erreur est survenue lors de l'analyse des utilisateurs à notifier: " + ex);
                          cal.LOG("L'execution continue.");
                        }
                    }
                    // Fin CM2V6 - Test s'il s'agit d'un non participant
                } 
                // CM2V6 Attachments - 30/08/2011 - Recuperation du mail text pour l'ecriture dans le fichier tmp
                let mailText = null;
                let nonParticipantMailText = null;
        		ChromeUtils.import("resource://calendar/modules/utils/calEmailUtils.jsm");
        		ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
        		ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
        		if (toNonParticipantList != "") {
        			let aItemNonP = aItipItem.clone();
        			nonParticipantMailText = cal.email._getMailText(compatMode, toNonParticipantList, aSubject, aBody, aItemNonP, identity, /* Non participant */true);
        		}
        				
        		if (toList != "") mailText = cal.email._getMailText(compatMode, toList, aSubject, aBody, aItipItem, identity, /* Participant */false);
        					
        		// Mail text pour les participants
        		if (mailText) {
          			// compose fields for message: from/to etc need to be specified both here and in the file
          			let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
          												  .createInstance(Components.interfaces.nsIMsgCompFields);
          			composeFields.characterSet = "UTF-8";
          			composeFields.to = toList;
          			composeFields.from = identity.email;
          			composeFields.replyTo = identity.replyTo;
          			let validRecipients;
		            if (identity.doCc) {
		            	validRecipients = cal.email.validateRecipientList(identity.doCcList);
		                if (validRecipients != "") {
		                	composeFields.cc = validRecipients;
		                }
		            }
		            if (identity.doBcc) {
		            	validRecipients = cal.email.validateRecipientList(identity.doBccList);
		                if (validRecipients != "") {
		                	composeFields.bcc = validRecipients;
		                 }
		            }
					
        			// CM2V3 Attachments - 30/08/2011 - Genere le fichier temporaire
        			let mailFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
        			mailFile.append("itipTemp");
        			mailFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE,
        										  parseInt("0600", 8));
        										  
                    //cal.LOG("***calItipEmailTransport.js _sendXpcomMail() mailFile.createUnique()");
                    
                    let ostream = Cc["@mozilla.org/network/file-output-stream;1"]
                               .createInstance(Ci.nsIFileOutputStream);

                    // Let's write the file - constants from file-utils.js
                    const MODE_WRONLY = 0x02;
                    const MODE_CREATE = 0x08;
                    const MODE_TRUNCATE = 0x20;
                    ostream.init(mailFile,
                                    MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE,
                                    parseInt("0600", 8),
                                    0);

                    //cal.LOG("***calItipEmailTransport.js _sendXpcomMail() ostream.init()");
          
        			// Ecriture dans un StringInputStream ... Un converter ne fonctionne pas avec une piece jointe binaire
        			let stringInputStream = Cc["@mozilla.org/io/string-input-stream;1"]
        						   				.createInstance(Components.interfaces.nsIStringInputStream);
        			stringInputStream.setData(mailText, mailText.length);
        			// End CM2V3 Attachments
        											
        			// CM2V3 Attachments - 30/08/2011 - Copie asynchrone du binaire dans le fichier                 
        			NetUtil.asyncCopy(stringInputStream, ostream, function(aResult) {
        				if (!Components.isSuccessCode(aResult)) {
        					// an error occurred!
        				}
        				FileUtils.closeSafeFileOutputStream(ostream);

                        ostream=null;
                        stringInputStream=null;
                        mailText=null;
        					  
                        //cal.LOG("***calItipEmailTransport.js _sendXpcomMail() _mailFile path: " + mailFile.path);
        				let msgSend = Cc["@mozilla.org/messengercompose/send;1"]
        											.createInstance(Components.interfaces.nsIMsgSend);
        
        				msgSend.sendMessageFile(identity,
        										account.key,
        										composeFields,
        										mailFile,
        										true  /* deleteSendFileOnCompletion */,
        										false /* digest_p */,
        										(Services.io.offline ? Components.interfaces.nsIMsgSend.nsMsgQueueForLater
        																	: Components.interfaces.nsIMsgSend.nsMsgDeliverNow),
        										null  /* nsIMsgDBHdr msgToReplace */,
        										null  /* nsIMsgSendListener aListener */,
        										null  /* nsIMsgStatusFeedback aStatusFeedback */,
        										""    /* password */);
    				});
    			}
        				
    			// Mail text pour les non participants
    			if (nonParticipantMailText) {
    				// compose fields for message: from/to etc need to be specified both here and in the file
    				let composeFieldsNonP = Cc["@mozilla.org/messengercompose/composefields;1"]
    												  .createInstance(Components.interfaces.nsIMsgCompFields);
    				composeFieldsNonP.characterSet = "UTF-8";
    				composeFieldsNonP.to = toNonParticipantList;
    				composeFieldsNonP.from = identity.email;
    				composeFieldsNonP.replyTo = identity.replyTo;
    					
    				// CM2V3 Attachments - 30/08/2011 - Genere le fichier temporaire
    				let mailFileNonP = Services.dirsvc.get("TmpD", Ci.nsIFile);
    				mailFileNonP.append("itipTempNonP");
    				mailFileNonP.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE,
    										  parseInt("0600", 8));
    										  
                    //cal.LOG("mailFileNonP.createUnique");
                    
                    let ostreamNonP = Cc["@mozilla.org/network/file-output-stream;1"]
                               .createInstance(Ci.nsIFileOutputStream);

                    // Let's write the file - constants from file-utils.js
                    const MODE_WRONLY = 0x02;
                    const MODE_CREATE = 0x08;
                    const MODE_TRUNCATE = 0x20;
                    ostreamNonP.init(mailFileNonP,
                                    MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE,
                                    parseInt("0600", 8),
                                    0);
    										  
    				// Ecriture dans un StringInputStream ... Un converter ne fonctionne pas avec une piece jointe binaire
    				let stringInputStreamNonP = Cc["@mozilla.org/io/string-input-stream;1"]
    						   						.createInstance(Components.interfaces.nsIStringInputStream);
    				stringInputStreamNonP.setData(nonParticipantMailText, nonParticipantMailText.length);
    				// End CM2V3 Attachments
    											
    				// CM2V3 Attachments - 30/08/2011 - Copie asynchrone du binaire dans le fichier                 
    				NetUtil.asyncCopy(stringInputStreamNonP, ostreamNonP, function(aResult) {
    					if (!Components.isSuccessCode(aResult)) {
    						// an error occurred!
    					}
    					FileUtils.closeSafeFileOutputStream(ostreamNonP);

                        ostreamNonP=null;
                        stringInputStreamNonP=null;
                        nonParticipantMailText=null;
    					  
    					//cal.LOG("_mailFileNonP path: " + mailFileNonP.path);
    					let msgSendNonP = Cc["@mozilla.org/messengercompose/send;1"]
    											.createInstance(Components.interfaces.nsIMsgSend);
    
    					msgSendNonP.sendMessageFile(identity,
    											account.key,
    											composeFieldsNonP,
    											mailFileNonP,
    											true  /* deleteSendFileOnCompletion */,
    											false /* digest_p */,
    											(Services.io.offline ? Components.interfaces.nsIMsgSend.nsMsgQueueForLater
    																	: Components.interfaces.nsIMsgSend.nsMsgDeliverNow),
    											null  /* nsIMsgDBHdr msgToReplace */,
    											null  /* nsIMsgSendListener aListener */,
    											null  /* nsIMsgStatusFeedback aStatusFeedback */,
    											""    /* password */);
    				});
        		}
        		return true;
      			// End CM2V6 Attachments
                break;
            }
            case Ci.calIItipItem.NONE: {
                // we shouldn't get here, as we stoppped processing in this case
                // earlier in checkAndSend in calItipUtils.jsm
                cal.LOG("sendXpcomMail: Found NONE autoResponse type.");
                break;
            }
            default: {
                // Also of this case should have been taken care at the same place
                throw new Error("sendXpcomMail: " +
                                "Unknown autoResponse type: " +
                                aItipItem.autoResponse);
            }
        }
        return false;
    }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([calItipEmailTransport]);

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 ChromeUtils.import("resource:///modules/mailServices.js");
 ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
 ChromeUtils.import("resource://calendar/modules/utils/calL10NUtils.jsm");
 ChromeUtils.import("resource://calendar/modules/ltnInvitationUtils.jsm");
 ChromeUtils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
 
 XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");
 
 /*
  * Functions for processing email addresses and sending email
  */
 
 // NOTE: This module should not be loaded directly, it is available when
 // including calUtils.jsm under the cal.email namespace.
 
 this.EXPORTED_SYMBOLS = ["calemail"]; /* exported calemail */
 
 var calemail = {
	 /**
	  * Convenience function to open the compose window pre-filled with the information from the
	  * parameters. These parameters are mostly raw header fields, see #createRecipientList function
	  * to create a recipient list string.
	  *
	  * @param {String} aRecipient       The email recipients string.
	  * @param {String} aSubject         The email subject.
	  * @param {String} aBody            The encoded email body text.
	  * @param {nsIMsgIdentity} aIdentity    The email identity to use for sending
	  */
	 sendTo: function(aRecipient, aSubject, aBody, aIdentity) {
		 let msgParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"]
								   .createInstance(Components.interfaces.nsIMsgComposeParams);
		 let composeFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
									   .createInstance(Components.interfaces.nsIMsgCompFields);
 
		 composeFields.to = aRecipient;
		 composeFields.subject = aSubject;
		 composeFields.body = aBody;
 
		 msgParams.type = Components.interfaces.nsIMsgCompType.New;
		 msgParams.format = Components.interfaces.nsIMsgCompFormat.Default;
		 msgParams.composeFields = composeFields;
		 msgParams.identity = aIdentity;
 
		 MailServices.compose.OpenComposeWindowWithParams(null, msgParams);
	 },
	 
	 // CMel - Bugzilla 168680 - add the attachments to the email before send
	 /**
	  * Convenience function to open the compose window pre-filled with the information from the
	  * parameters. These parameters are mostly raw header fields, see #createRecipientList function
	  * to create a recipient list string.
	  *
	  * @param {String} aRecipient       The email recipients string.
	  * @param {String} aSubject         The email subject.
	  * @param {String} aBody            The encoded email body text.
	  * @param {Array} aAttachments      Attachments list
	  * @param {nsIMsgIdentity} aIdentity    The email identity to use for sending
	  */
	 sendToWithAttachments: function(aRecipient, aSubject, aBody, aAttachments, aIdentity) {
		 let msgParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"]
								   .createInstance(Components.interfaces.nsIMsgComposeParams);
		 let composeFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
									   .createInstance(Components.interfaces.nsIMsgCompFields);
									   
		 composeFields.to = aRecipient;
		 composeFields.subject = aSubject;
		 composeFields.body = aBody;
			 
		 // Bugzilla 168680 - Adding attachments in the message
		 for (let attachment in aAttachments) {
		   let msgAttachment = Components.classes["@mozilla.org/messengercompose/attachment;1"]
										   .createInstance(Components.interfaces.nsIMsgAttachment);
		   msgAttachment.url = attachment.uri.spec;
		   composeFields.addAttachment(msgAttachment);
		 }
 
		 msgParams.type = Components.interfaces.nsIMsgCompType.New;
		 msgParams.format = Components.interfaces.nsIMsgCompFormat.Default;
		 msgParams.composeFields = composeFields;
		 msgParams.identity = aIdentity;
 
		 MailServices.compose.OpenComposeWindowWithParams(null, msgParams);
	 },
	 // Fin CMel
 
	 /**
	  * Iterates all email identities and calls the passed function with identity and account.
	  * If the called function returns false, iteration is stopped.
	  *
	  * @param {Function} aFunc       The function to be called for each identity and account
	  */
	 iterateIdentities: function(aFunc) {
		 let accounts = MailServices.accounts.accounts;
		 for (let i = 0; i < accounts.length; ++i) {
			 let account = accounts.queryElementAt(i, Components.interfaces.nsIMsgAccount);
			 let identities = account.identities;
			 for (let j = 0; j < identities.length; ++j) {
				 let identity = identities.queryElementAt(j, Components.interfaces.nsIMsgIdentity);
				 if (!aFunc(identity, account)) {
					 break;
				 }
			 }
		 }
	 },
 
	 /**
	  * Prepends a mailto: prefix to an email address like string
	  *
	  * @param  {String} aId     The string to prepend the prefix if not already there
	  * @return {String}         The string with prefix
	  */
	 prependMailTo: function(aId) {
		 return aId.replace(/^(?:mailto:)?(.*)@/i, "mailto:$1@");
	 },
 
	 /**
	  * Removes an existing mailto: prefix from an attendee id
	  *
	  * @param  {String} aId     The string to remove the prefix from if any
	  * @return {String}         The string without prefix
	  */
	 removeMailTo: function(aId) {
		 return aId.replace(/^mailto:/i, "");
	 },
 
	 /**
	  * Provides a string to use in email "to" header for given attendees
	  *
	  * @param  {calIAttendee[]} aAttendees          Array of calIAttendee's to check
	  * @return {String}                             Valid string to use in a 'to' header of an email
	  */
	 createRecipientList: function(aAttendees) {
		 let cbEmail = function(aVal) {
			 let email = calemail.getAttendeeEmail(aVal, true);
			 if (!email.length) {
				 cal.LOG("Dropping invalid recipient for email transport: " + aVal.toString());
			 }
			 return email;
		 };
		 return aAttendees.map(cbEmail)
						  .filter(aVal => aVal.length > 0)
						  .join(", ");
	 },
 
	 /**
	  * Returns a wellformed email string like 'attendee@example.net',
	  * 'Common Name <attendee@example.net>' or '"Name, Common" <attendee@example.net>'
	  *
	  * @param  {calIAttendee} aAttendee     The attendee to check
	  * @param  {Boolean} aIncludeCn         Whether or not to return also the CN if available
	  * @return {String}                     Valid email string or an empty string in case of error
	  */
	 getAttendeeEmail: function(aAttendee, aIncludeCn) {
		 // If the recipient id is of type urn, we need to figure out the email address, otherwise
		 // we fall back to the attendee id
		 let email = aAttendee.id.match(/^urn:/i) ? aAttendee.getProperty("EMAIL") || "" : aAttendee.id;
		 // Strip leading "mailto:" if it exists.
		 email = email.replace(/^mailto:/i, "");
		 // We add the CN if requested and available
		 let commonName = aAttendee.commonName;
		 if (aIncludeCn && email.length > 0 && commonName && commonName.length > 0) {
			 if (commonName.match(/[,;]/)) {
				 commonName = '"' + commonName + '"';
			 }
			 commonName = commonName + " <" + email + ">";
			 if (calemail.validateRecipientList(commonName) == commonName) {
				 email = commonName;
			 }
		 }
		 return email;
	 },
 
	 /**
	  * Returns a basically checked recipient list - malformed elements will be removed
	  *
	  * @param {String} aRecipients      A comma-seperated list of e-mail addresses
	  * @return {String}                 A validated comma-seperated list of e-mail addresses
	  */
	 validateRecipientList: function(aRecipients) {
		 let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
									.createInstance(Components.interfaces.nsIMsgCompFields);
		 // Resolve the list considering also configured common names
		 let members = compFields.splitRecipients(aRecipients, false, {});
		 let list = [];
		 let prefix = "";
		 for (let member of members) {
			 if (prefix != "") {
				 // the previous member had no email address - this happens if a recipients CN
				 // contains a ',' or ';' (splitRecipients(..) behaves wrongly here and produces an
				 // additional member with only the first CN part of that recipient and no email
				 // address while the next has the second part of the CN and the according email
				 // address) - we still need to identify the original delimiter to append it to the
				 // prefix
				 let memberCnPart = member.match(/(.*) <.*>/);
				 if (memberCnPart) {
					 let pattern = new RegExp(prefix + "([;,] *)" + memberCnPart[1]);
					 let delimiter = aRecipients.match(pattern);
					 if (delimiter) {
						 prefix = prefix + delimiter[1];
					 }
				 }
			 }
			 let parts = (prefix + member).match(/(.*)( <.*>)/);
			 if (parts) {
				 if (parts[2] == " <>") {
					 // CN but no email address - we keep the CN part to prefix the next member's CN
					 prefix = parts[1];
				 } else {
					 // CN with email address
					 let commonName = parts[1].trim();
					 // in case of any special characters in the CN string, we make sure to enclose
					 // it with dquotes - simple spaces don't require dquotes
					 if (commonName.match(/[-[\]{}()*+?.,;\\^$|#\f\n\r\t\v]/)) {
						 commonName = '"' + commonName.replace(/\\"|"/, "").trim() + '"';
					 }
					 list.push(commonName + parts[2]);
					 prefix = "";
				 }
			 } else if (member.length) {
				 // email address only
				 list.push(member);
				 prefix = "";
			 }
		 }
		 return list.join(", ");
	 },
 
	 /**
	  * Check if the attendee object matches one of the addresses in the list. This
	  * is useful to determine whether the current user acts as a delegate.
	  *
	  * @param {calIAttendee} aRefAttendee   The reference attendee object
	  * @param {String[]} aAddresses         The list of addresses
	  * @return {Boolean}                    True, if there is a match
	  */
	 attendeeMatchesAddresses: function(aRefAttendee, aAddresses) {
		 let attId = aRefAttendee.id;
		 if (!attId.match(/^mailto:/i)) {
			 // Looks like its not a normal attendee, possibly urn:uuid:...
			 // Try getting the email through the EMAIL property.
			 let emailProp = aRefAttendee.getProperty("EMAIL");
			 if (emailProp) {
				 attId = emailProp;
			 }
		 }
 
		 attId = attId.toLowerCase().replace(/^mailto:/, "");
		 for (let address of aAddresses) {
			 if (attId == address.toLowerCase().replace(/^mailto:/, "")) {
				 return true;
			 }
		 }
 
		 return false;
	 },
	 // CMel
	 // CM2V3 Attachments - 30/08/2011 - Methode pour ne récupérer que le mail text
	 _getMailText: function cal_email_getmailtext(compatMode, aToList, aSubject, aBody, aItem, aIdentity, aIsNonParticipant) {
		 try {
 
			 function encodeMimeHeader(header) {
				 let mimeConverter = Components.classes["@mozilla.org/messenger/mimeconverter;1"]
											   .createInstance(Components.interfaces.nsIMimeConverter);
				 let fieldNameLen = (header.indexOf(": ") + 2);
				 return mimeConverter.encodeMimePartIIStr_UTF8(header,
															   false,
															   "UTF-8",
															   fieldNameLen,
															   Components.interfaces.nsIMimeConverter.MIME_ENCODED_WORD_SIZE);
			 }
			 // CM2V3 Attachments - 29/08/2011 - Formater la piece jointe pour l'envoi du mail : Saut de ligne tous les 77 caractères
			 function formatMailAttachment(aTextAttachment) {
					   // Utilisation du serializer ICS : pas très propre mais fonctionnel et assez rapide
					   let serializer = Components.classes["@mozilla.org/calendar/ics-serializer;1"]
										  .createInstance(Components.interfaces.calIIcsSerializer);
					   let service = Components.classes["@mozilla.org/calendar/ics-service;1"]
										   .getService(Components.interfaces.calIICSService);
					   let property = service.createIcalProperty("ATTACH");
					   property.value = aTextAttachment
					   serializer.addProperty(property);;
					   let serializedItem = serializer.serializeToString();
					   //cal.LOG("CalDAV: serialize property: " + serializedItem);			
					   return serializedItem.substring(94, serializedItem.length - 16);
			 }
			 // End CM2V3 Attachments
			 
			 // CM2V7 - MANTIS 0004831: Les envois de message d’invitation ne contiennent pas de message-id
			 let composeUtils = Components.classes["@mozilla.org/messengercompose/computils;1"]
							 .createInstance(Components.interfaces.nsIMsgCompUtils);
			 let messageId = composeUtils.msgGenerateMessageId(aIdentity);
			 // Fin CM2V7
 
			 let itemList = aItem.getItemList({});
			 let serializer = Components.classes["@mozilla.org/calendar/ics-serializer;1"]
										.createInstance(Components.interfaces.calIIcsSerializer);
 
			 // Home-grown mail composition; I'd love to use nsIMimeEmitter, but it's not clear to me whether
			 // it can cope with nested attachments,
			 // like multipart/alternative with enclosed text/calendar and text/plain.
			 let mailText = ("MIME-version: 1.0\r\n" +
							 (aIdentity.replyTo
							  ? "Return-path: " + aIdentity.replyTo + "\r\n" : "") +
							 "From: " + aIdentity.email + "\r\n" +
							 // CM2V7 - MANTIS 0004831: Les envois de message d’invitation ne contiennent pas de message-id
							 "Message-ID: " + messageId + "\r\n" +
							 // Fin CM2V7
							 "To: " + aToList + "\r\n" +
							 "Date: " + (new Date()).toUTCString() + "\r\n" +
							 "Subject: " + encodeMimeHeader(aSubject.replace(/(\n|\r\n)/, "|")) + "\r\n");
			 // CM2V3 Attachments - 18/08/2011 - Ajout de la piece jointe dans le message
			 cal.LOG("sendXpcomMail: mailText");
			 
			 let attachments = itemList[0].getAttachments({}); 
			 if (attachments && attachments.length > 0 && aItem.responseMethod == "REQUEST") {
				 cal.LOG("sendXpcomMail: attachments");
				   
			 mailText += ("Content-type: multipart/mixed; boundary=\"Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\"\r\n" +
						  "\r\n" +
						  "This is a multi-part message in MIME format.\r\n\r\n");
							  
			 for (let attachment of attachments) {
				 if (attachment.getParameter("VALUE") 
				   && "BINARY" == attachment.getParameter("VALUE")
				   && attachment.formatType
				   && attachment.encoding
				   && attachment.getParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME")) {
					 let aAttachmentName = attachment.getParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME");
					 mailText += ("--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
							  "Content-type: " + attachment.formatType + "; name=" + aAttachmentName + "\r\n" +
							  "Content-ID: <" + attachment.hashId + ">\r\n" +
							  "Content-Description: " + aAttachmentName + "\r\n" +
							  "Content-Transfer-Encoding: " + attachment.encoding + "\r\n" +
							  "Content-disposition: attachment; filename=\"" + aAttachmentName + "\"\r\n" +
							  "\r\n" +
							  formatMailAttachment(attachment.rawData) +
							  "\r\n" );
					 
					 //LOG("sendXpcomMail: attachments.rawData: " + attachment.rawData);         
					 attachment.rawData = "CID:" + attachment.hashId;
					 attachment.deleteParameter("VALUE");
					 attachment.deleteParameter("FMTTYPE");
					 attachment.deleteParameter("ENCODING");
					 attachment.deleteParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME");
					 attachment.deleteParameter("X-CM2V3-SEND-ATTACH-INVITATION");
				 }
			 }
				   
			 if (!aIsNonParticipant) {
				 serializer.addItems(itemList, itemList.length);
				 let methodProp = cal.getIcsService().createIcalProperty("METHOD");
				 methodProp.value = aItem.responseMethod;
				 serializer.addProperty(methodProp);
				 let calText = serializer.serializeToString();
				 let utf8CalText = ltn.invitation.encodeUTF8(calText);
				  
				 mailText += ("--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
							  "Content-class: urn:content-classes:calendarmessage\r\n" +
							  "Content-type: text/calendar; method=" + aItem.responseMethod + "; charset=UTF-8\r\n" +
							  "Content-transfer-encoding: 8BIT\r\n" +
							  "\r\n" +
							  utf8CalText +
							  "\r\n");
						  
			 } else {
				 mailText += ("--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
							  "Content-type: multipart/alternative;\r\n" +
							  " boundary=\"Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\"\r\n" +
							  "\r\n\r\n" +
							  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\r\n" +
							  "Content-Type: text/plain; charset=UTF-8; format=flowed\r\n" +
							  "Content-transfer-encoding: 8BIT\r\n" +
							  "\r\n" +
							  ltn.invitation.encodeUTF8(this._getTextCartouche(itemList[0])) +
							  "\r\n" +
							  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\r\n" +
							  "Content-Type: text/html; charset=UTF-8\r\n" +
							  "Content-transfer-encoding: 8BIT\r\n" +
							  "\r\n" +
							  ltn.invitation.encodeUTF8(this._getHtmlCartouche(itemList[0])) +
							  "\r\n" +
							  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)--\r\n" +
							  "\r\n");
			 }
							  
			 mailText += ("--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)--\r\n");
			 
			 cal.LOG("mailText: Done");
			 } else {
				 // CM2V6 - MANTIS 3689: Le message de reponse a l'acceptation d'une invit contiendrait 2 fois les PJ
				 if (attachments && attachments.length > 0 && aItem.responseMethod == "REPLY") {
					 itemList[0].removeAllAttachments();
				 }
				 // Fin CM2V6
				 if (!aIsNonParticipant) {
					 serializer.addItems(itemList, itemList.length);
					 let methodProp = cal.getIcsService().createIcalProperty("METHOD");
					 methodProp.value = aItem.responseMethod;
					 serializer.addProperty(methodProp);
					 let calText = serializer.serializeToString();
					 let utf8CalText = ltn.invitation.encodeUTF8(calText);
						 
					 switch (compatMode) {
						 case 1:
							 mailText += ("Content-class: urn:content-classes:calendarmessage\r\n" +
											"Content-type: text/calendar; method=" + aItem.responseMethod + "; charset=UTF-8\r\n" +
											"Content-transfer-encoding: 8BIT\r\n" +
											"\r\n" +
											utf8CalText +
											"\r\n");
							 break;
						 default:
							 mailText += ("Content-type: multipart/mixed; boundary=\"Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\"\r\n" +
											"\r\n\r\n" +
											"--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
											"Content-type: multipart/alternative;\r\n" +
											" boundary=\"Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)\"\r\n" +
											"\r\n\r\n" +
											"--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)\r\n" +
											"Content-type: text/plain; charset=UTF-8\r\n" +
											"Content-transfer-encoding: 8BIT\r\n" +
											"\r\n" +
											ltn.invitation.encodeUTF8(aBody) +
											"\r\n" +
											"--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)\r\n" +
											"Content-type: text/calendar; method=" + aItem.responseMethod + "; charset=UTF-8\r\n" +
											"Content-transfer-encoding: 8BIT\r\n" +
											"\r\n" +
											utf8CalText +
											"\r\n" +
											"--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCbwA)--\r\n" +
											"\r\n" +
											"--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)\r\n" +
											"Content-type: application/ics; name=invite.ics\r\n" +
											"Content-transfer-encoding: 8BIT\r\n" +
											"Content-disposition: attachment; filename=invite.ics\r\n" +
											"\r\n" +
											utf8CalText +
											"\r\n" +
											"--Boundary_(ID_qyG4ZdjoAsiZ+Jo19dCbWQ)--\r\n");
							   break;
					 }
				 } else {
					 mailText += ("Content-type: multipart/alternative;\r\n" +
								  " boundary=\"Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\"\r\n" +
								  "\r\n\r\n" +
								  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\r\n" +
								  "Content-Type: text/plain; charset=UTF-8; format=flowed\r\n" +
								  "Content-transfer-encoding: 8BIT\r\n" +
								  "\r\n" +
								  ltn.invitation.encodeUTF8(this._getTextCartouche(itemList[0])) +
								  "\r\n" +
								  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)\r\n" +
								  "Content-Type: text/html; charset=UTF-8\r\n" +
								  "Content-transfer-encoding: 8BIT\r\n" +
								  "\r\n" +
								  ltn.invitation.encodeUTF8(this._getHtmlCartouche(itemList[0])) +
								  "\r\n" +
								  "--Boundary_(ID_ryU4ZdJoASiZ+Jo21dCaze)--\r\n");
				 }
			 }
			 cal.LOG("sendXpcomMail: mailText: " + mailText);
			 return mailText;
		 } catch (exc) {
			 cal.ASSERT(false, exc);
			 return null;
		 }       
	 },
	 // End CM2V3 Attachments
 
	 /**
	  * Append the text to node, converting contained URIs to <a> links.
	  *
	  * @param text      The text to convert.
	  * @param node      The node to append the text to.
	  */
	 _linkifyText: function cal_email_linkifytext(text, node) {
		 let doc = node.ownerDocument;
		 let localText = text;
	 
		 // XXX This should be improved to also understand abbreviated urls, could be
		 // extended to only linkify urls that have an internal protocol handler, or
		 // have an external protocol handler that has an app assigned. The same
		 // could be done for mailto links which are not handled here either.
	 
		 // XXX Ideally use mozITXTToHTMLConv here, but last time I tried it didn't work.
	 
		 while (localText.length) {
			 let pos = localText.search(/(^|\s+)([a-zA-Z0-9]+):\/\/[^\s]+/);
			 if (pos == -1) {
				 node.appendChild(doc.createTextNode(localText));
				 break;
			 }
			 pos += localText.substr(pos).match(/^\s*/)[0].length;
			 let endPos = pos + localText.substr(pos).search(/([.!,<>(){}]+)?(\s+|$)/);
			 let url = localText.substr(pos, endPos - pos);
	 
			 if (pos > 0) {
				 node.appendChild(doc.createTextNode(localText.substr(0, pos)));
			 }
			 let a = doc.createElement("a");
			 a.setAttribute("href", url);
			 a.textContent = url;
	 
			 node.appendChild(a);
	 
			 localText = localText.substr(endPos);
		 }
	 },
 
	 /**
	  * Returns the html representation of the event as a DOM document.
	  *
	  * @param event         The calIItemBase to parse into html.
	  * @return              The DOM document with values filled in.
	  */
	 // CM2V3 Attendees - Methodes pour generer le code HTML/Text en fonction de l'item
	 _getHtmlCartouche: function cal_email_gethtmlcartouche(event) {
		 // Creates HTML using the Node strings in the properties file
		 let doc = cal.xml.parseFile("chrome://lightning/content/lightning-invitation.xhtml");
		 let formatter = cal.getDateFormatter();
		 
		 let self = this;
		 function field(field, contentText, linkify) {
			   let descr = doc.getElementById("imipHtml-" + field + "-descr");
			   if (descr) {
				   let labelText = cal.l10n.getLtnString("imipHtml." + field);
				   descr.textContent = labelText;
			   }
		 
			   if (contentText) {
				   let content = doc.getElementById("imipHtml-" + field + "-content");
				   doc.getElementById("imipHtml-" + field + "-row").hidden = false;
				   if (linkify) {
					   self._linkifyText(contentText, content);
				   } else {
					   content.textContent = contentText;
				   }
			   }
		 }
 
		 // Simple fields
		 let headerDescr = doc.getElementById("imipHtml-header-descr");
		 if (headerDescr) {
			 headerDescr.textContent = cal.l10n.getLtnString("imipHtml.nonattendees.header");
		 }
		 
		 field("summary", event.title);
		 field("location", event.getProperty("LOCATION"));
		 
		 let dateString = formatter.formatItemInterval(event);
		 
		 if (event.recurrenceInfo) {
			   let kDefaultTimezone = cal.calendarDefaultTimezone();
			   let startDate =  event.startDate;
			   let endDate = event.endDate;
			   startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
			   endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
			   let repeatString = recurrenceRule2String(event.recurrenceInfo, startDate,
														endDate, startDate.isDate);
			   if (repeatString) {
				   dateString = repeatString;
			   }
		 
			   let formattedExDates = [];
			   let modifiedOccurrences = [];
			   function dateComptor(a,b) {
				   a.startDate.compare(b.startDate);
			   }
		 
			   // Show removed instances
			   for (let exc of event.recurrenceInfo.getRecurrenceItems({})) {
				   if (exc instanceof Components.interfaces.calIRecurrenceDate) {
					   if (exc.isNegative) {
						   // This is an EXDATE
						   formattedExDates.push(formatter.formatDateTime(exc.date));
					   } else {
						   // This is an RDATE, close enough to a modified occurrence
						   let excItem = event.recurrenceInfo.getOccurrenceFor(exc.date);
						   cal.binaryInsert(modifiedOccurrences, excItem, dateComptor, true)
					   }
				   }
			   }
			   if (formattedExDates.length > 0) {
				   field("canceledOccurrences", formattedExDates.join("\n"));
			   }
		 
			   // Show modified occurrences
			   for (let recurrenceId of event.recurrenceInfo.getExceptionIds({})) {
				   let exc = event.recurrenceInfo.getExceptionFor(recurrenceId);
				   let excLocation = exc.getProperty("LOCATION");
		 
				   // Only show modified occurrence if start, duration or location
				   // has changed.
				   if (exc.startDate.compare(exc.recurrenceId) != 0 ||
					   exc.duration.compare(event.duration) != 0 ||
					   excLocation != event.getProperty("LOCATION")) {
					   cal.binaryInsert(modifiedOccurrences, exc, dateComptor, true)
				   }
			   }
		 
			   function stringifyOcc(occ) {
				   let formattedExc = formatter.formatItemInterval(occ);
				   let occLocation = occ.getProperty("LOCATION");
				   if (occLocation != event.getProperty("LOCATION")) {
					   let location = cal.l10n.getLtnString("imipHtml.newLocation", [occLocation]);
					   formattedExc += " (" + location + ")";
				   }
				   return formattedExc;
			   }
		 
			   if (modifiedOccurrences.length > 0) {
				   field("modifiedOccurrences", modifiedOccurrences.map(stringifyOcc).join("\n"));
			   }
		   }
		 
		   field("when", dateString);
		   field("comment", event.getProperty("COMMENT"), true);
		 
		   // DESCRIPTION field
		   let eventDescription = (event.getProperty("DESCRIPTION") || "")
									   /* Remove the useless "Outlookism" squiggle. */
									   .replace("*~*~*~*~*~*~*~*~*~*", "");
		   field("description", eventDescription, true);

		   // URL
		   field("url", event.getProperty("URL"), true);

		   // ATTACH - we only display URI but no BINARY type attachments here
		   let links = [];
		   let attachments = event.getAttachments({});
		   for (let attachment of attachments) {
			   if (attachment.uri && attachment.uri.spec != 'about:blank') {
				   links.push(attachment.uri.spec);
			   }
		   }
		   field("attachments", links.join(" / "), true);
		 
		   // ATTENDEE and ORGANIZER fields
		   let attendees = event.getAttendees({});
		   let attendeeTemplate = doc.getElementById("attendee-template");
		   let attendeeTable = doc.getElementById("attendee-table");
		   // CMel
		   let nonAttendeeTable = doc.getElementById("nonattendee-table");
		   let organizerTable = doc.getElementById("organizer-table");
		   doc.getElementById("imipHtml-attendees-row").hidden = (attendees.length < 1);
		   doc.getElementById("imipHtml-organizer-row").hidden = !event.organizer;
		 
		   let setupAttendee = function (aAttendee) {
			 let row = attendeeTemplate.cloneNode(true);
			 row.removeAttribute("id");
			 row.removeAttribute("hidden");
		 
			 // resolve delegatees/delegators to display also the CN
			 let del = cal.itip.resolveDelegation(aAttendee, attendees);
			 if (del.delegators != "") {
				 del.delegators = " " + cal.l10n.getLtnString("imipHtml.attendeeDelegatedFrom",
													  [del.delegators]);
			 }
		 
			 // display itip icon
			 let role = aAttendee.role || "REQ-PARTICIPANT";
			 let ps = aAttendee.participationStatus || "NEEDS-ACTION";
			 let ut = aAttendee.userType || "INDIVIDUAL";
			 let itipIcon = row.getElementsByClassName("itip-icon")[0];
			 itipIcon.setAttribute("role", role);
			 itipIcon.setAttribute("usertype", ut);
			 itipIcon.setAttribute("partstat", ps);
			 let attName = (aAttendee.commonName && aAttendee.commonName.length)
						   ? aAttendee.commonName : aAttendee.toString();
			 let utString = cal.l10n.getLtnString("imipHtml.attendeeUserType2." + ut,
										  [aAttendee.toString()]);
			 let roleString = cal.l10n.getLtnString("imipHtml.attendeeRole2." + role,
											[utString]);
			 let psString = cal.l10n.getLtnString("imipHtml.attendeePartStat2." + ps,
										  [attName, del.delegatees]);
			 let itipTooltip = cal.l10n.getLtnString("imipHtml.attendee.combined",
											 [roleString, psString]);
			 row.setAttribute("title", itipTooltip);
			 // display attendee
			 row.getElementsByClassName("attendee-name")[0].textContent = aAttendee.toString() +
																		  del.delegators;
			 return row;
		   };
		 
		   // Fill rows for attendees and organizer
		   field("attendees");
		   // CMel
		   field("nonattendees");
		   for (let attendee of attendees) {
			   // CMel
			   if (attendee.role == "NON-PARTICIPANT") {
                 doc.getElementById("imipHtml-nonattendees-row").hidden = false;
                 nonAttendeeTable.appendChild(setupAttendee(attendee));
               }
               else {
                 attendeeTable.appendChild(setupAttendee(attendee));
               }
		   }
		 
		   field("organizer");
		   if (event.organizer) {
			   organizerTable.appendChild(setupAttendee(event.organizer));
		   }
		   // Create the HTML string for display
		   return cal.xml.serializeDOM(doc);
	 },	    
 
	 _getTextCartouche: function cal_email_gettextcartouche(event) {
		 // Creates HTML using the Node strings in the properties file
		 let text;
		 // Create text var
		 text = "";
 
		 // Create header row
		 text += cal.l10n.getLtnString("imipHtml.nonattendees.header") + "\r\n\r\n";
 
		 if (event.title) {
			 text += cal.l10n.getLtnString("imipHtml.summary") + " " + event.title + "\r\n\r\n";
		 }
 
		 let eventLocation = event.getProperty("LOCATION");
		 if (eventLocation) {
			 text += cal.l10n.getLtnString("imipHtml.location") + " " + eventLocation + "\r\n\r\n";
		 }
 
		 let dateString = cal.getDateFormatter().formatItemInterval(event);
		 text += cal.l10n.getLtnString("imipHtml.when") + " " + dateString + "\r\n\r\n";
 
		 if (event.organizer &&
			 (event.organizer.commonName || event.organizer.id))
		 {
			 // Trim any instances of "mailto:" for better readibility.
			 let orgname = event.organizer.commonName ||
							 event.organizer.id.replace(/mailto:/ig, "");
			 
			 text += cal.l10n.getLtnString("imipHtml.organizer") + " " + orgname + "\r\n\r\n";
		 }
				 
		 //cm2v3 - affichage des participants
		 let participants = event.getAttendees({});
		 if (participants && participants.length > 0){
			 
			 let parts = [];
			 let nonparts = [];
			 
			 for (let participant of participants) {
				 let partName = participant.commonName;
				 if (partName) partName = participant.id.replace(/mailto:/ig, "");
				 if (participant.role && "NON-PARTICIPANT" == participant.role) nonparts.push(participant);
				 else parts.push(participant);
			 }
			 
			 if (parts.length > 0) text += cal.l10n.getLtnString("imipHtml.attendees") + "\r\n";
			 parts.sort();
			 for (let participant of parts) {
				 text += "\t" + participant + "\r\n";
			 }
			 
			 text += "\r\n";
			 if (nonparts.length > 0) text += cal.l10n.getLtnString("imipHtml.nonattendees") + "\r\n";
			 nonparts.sort();
			 for (let participant of nonparts) {
				 text += "\t" + participant + "\r\n";
			 }
			 text += "\r\n";
		 }
		 //fin cm2v3
 
		 let eventDescription = event.getProperty("DESCRIPTION");
		 if (eventDescription) {
			 // Remove the useless "Outlookism" squiggle.
			 let desc = eventDescription.replace("*~*~*~*~*~*~*~*~*~*", "");
			 text += cal.l10n.getLtnString("imipHtml.description") + " " + desc + "\r\n\r\n";
		 }
 
		 let eventComment = event.getProperty("COMMENT");
		 if (eventComment) {
			 text += cal.l10n.getLtnString("imipHtml.comment") + " " + eventComment + "\r\n\r\n";
		 }
		 return text;
	 }
	 // End CM2V3 Attendees
	 // Fin CMel
 };
 
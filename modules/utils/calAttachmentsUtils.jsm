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
 * The Initial Developer of the Original Code is
 *   Thomas Payen <thomas.payen@apitech.fr>
 * Portions created by the Initial Developer are Copyright (C) 2012
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

// Add modules to load attachments
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");

//NOTE: This module should not be loaded directly, it is available when
//including calUtils.jsm under the cal.attachments namespace.

this.EXPORTED_SYMBOLS = ["calattachments"]; /* exported calattachments */

var calattachments = {    
    /**
     * Copy the binary attachment into a file.
     * call in CalDAVCalendar.
     *
     * @param calIItemBase aItem
     * @param bool aIsCached
     */
    writeAttachmentsFiles: function(aItem, aIsCached, aCalendar, aTargetCalendar) {
      // Delete the attachments directory 
      this.deleteAttachmentsDirectory(aItem, aIsCached, aCalendar);
      
      // Delete the temporaly attachments directory
      if (aIsCached) {
	      if (aTargetCalendar) {
	    	  let this_ = this;
	    	  let getItemListener = {
	    	            onGetResult: function writeAttachmentsFiles_getItem_onResult(aCalendar,
	    	                                                     aStatus,
	    	                                                     aItemType,
	    	                                                     aDetail,
	    	                                                     aCount,
	    	                                                     aItems) {

	    	                let foundItem = aItems[0];
	    	                this_.clearAttachmentsTempDirectory(aItem, aCalendar, (foundItem ? foundItem : null));
	    	            },
	    	            onOperationComplete: function writeAttachmentsFiles_getItem_onOperationComplete() {}
	    	        };

	    	  aTargetCalendar.getItem(aItem.id,
		                                     getItemListener);
	      }
	      else {
	    	  this.clearAttachmentsTempDirectory(aItem, aCalendar, null);
	      }
      }
        
      // Retrieves all related objects (parent + occurrences)
      var parentItem = aItem.parentItem;
      var items = new Array(parentItem);
      var rec = parentItem.recurrenceInfo;
      if (rec) {
        var exceptions = rec.getExceptionIds ({});
        if (exceptions.length > 0) {
            // we need to serialize each exid as a separate
            // event/todo; setupItemBase will handle
            // writing the recurrenceId for us
            for (let exid of exceptions) {
                let ex = rec.getExceptionFor(exid);
                if (ex) {
                  items.push(ex);
                }
            }
        }
      }
      
      for (let item of items) {
        // For each item, get the attachments
        let attachments = item.getAttachments({});
        if (attachments && attachments.length > 0) {
          // Get attachment item directory
          for (let attachment of attachments) {
            // If it is a binary attachment it is copied to a file, otherwise it's a URL
            if (attachment.getParameter("VALUE") 
              && "BINARY" == attachment.getParameter("VALUE").toUpperCase()
              && attachment.encoding
              && "BASE64" == attachment.encoding.toUpperCase()) {
              var directory = this.createAttachmentsDirectory(item, aIsCached, aCalendar);              
              if (directory == null) {
                return;
              }
              break;
            }
          }
              	           
          for (let attachment of attachments) {
            // If it is a binary attachment it is copied to a file, otherwise it's a URL
            if (attachment.getParameter("VALUE") 
              && "BINARY" == attachment.getParameter("VALUE").toUpperCase()
              && attachment.encoding
              && "BASE64" == attachment.encoding.toUpperCase()) {

              try {
                var stringInputStream = Components.classes["@mozilla.org/io/string-input-stream;1"]
                              .createInstance(Components.interfaces.nsIStringInputStream);
                             
                var localFile = Components.classes["@mozilla.org/file/local;1"]
					                    .createInstance(Components.interfaces.nsILocalFile);
                
            		// Formats the file name to avoid problems with the copy
			        var fileName = this.makePrettyAttachmentName(attachment.getParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME"));
			        
			        // Problem with the windows file system when path supperior to 256 characters
			        if ((fileName.length + directory.path.length) >= 256) {
				        fileName = "..." + fileName.substring(((fileName.length + directory.path.length) - 253),fileName.length);
			        }

			        localFile.initWithFile(directory);
			        localFile.append(fileName);
			        if( !localFile.exists() ) {
			          // Read only create file
			          //localFile.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0550);
				          
				          // Open the file stream
                  // Can also optionally pass a flags parameter here. It defaults to
                  // FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE;
                  var ostream = FileUtils.openSafeFileOutputStream(localFile);

                  // Decode the base-64 encoding binary file
                  // TODO: Support other encoding
                  var data = atob(attachment.rawData);
                  
                  // Writing to StringInputStream ... A converter does not work with a binary attachment
                  stringInputStream.setData(data, data.length);

                  // Asynchronous copy the binary file
                  NetUtil.asyncCopy(stringInputStream, ostream, function(aResult) {
                    if (!Components.isSuccessCode(aResult)) {
                      // an error occurred!
                    }
                    FileUtils.closeSafeFileOutputStream(ostream);
                    ostream = null;
                    stringInputStream = null;
                    data = null;
                    
                    localFile.permissions = 0o555;
                  });
                }
              }
              catch (err) {
                cal.WARN("Failed to write binary attachment in \"" + directory.path + fileName + "\"");
              }
              finally {
                // Copy the uri of the attachment to open
                attachment.uri = Services.io.newURI("file://" + localFile.path, null, null);
                attachment.deleteParameter("ENCODING");
                attachment.setParameter("VALUE", "BINARY");
                
                cal.LOG("Attachment uri: " + attachment.uri.spec);
              }
            }
          }
        }
      }
    }, // End writeAttachmentsFiles

    /**
     * Format a binary attachment - Read the stream and convert to base64
     *
     * @param nsIAttachment aAttachment
     * @param aCallback
     */
    formatBinaryAttachment: function(aAttachment, aCallback) {
	    var filename = this.makePrettyName(aAttachment.uri);
	    
	    // Myurl: link to download attachment
	    let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mceweb2.si.minint.fr/services/download/");
      
      	// Read the data from uri
	    function readData(aUri, aAttachment) {
	    	var channel = Services.io.newChannelFromURI2(aUri,
									                    null,
									                    Services.scriptSecurityManager.getSystemPrincipal(),
									                    null,
									                    Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
									                    Components.interfaces.nsIContentPolicy.TYPE_OTHER);

		    NetUtil.asyncFetch(channel, function (aInputStream, aStatusCode, aRequest) {
			    if (!Components.isSuccessCode(aStatusCode)) {
			      cal.LOG("Attachment: !Components.isSuccessCode(aStatusCode) ");
			      aCallback(null);
			      return;
			    }

			    // Read the binary file with a binary input stream
			    var bstream = Components.classes["@mozilla.org/binaryinputstream;1"].
						      createInstance(Components.interfaces.nsIBinaryInputStream);

			    try {
			      bstream.setInputStream(aInputStream);
			      var bytes = bstream.readBytes(aInputStream.available());
			      aAttachment.encoding = "base64";
			      aAttachment.formatType = channel.contentType;
			      aAttachment.setParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME", filename);
			      aAttachment.rawData = btoa(bytes);
			      
			      bstream = null;
			      aInputStream = null;
			    }
			    catch (err) {
			      cal.WARN("formatBinaryAttachment err: " + err);
			    }
			    aCallback();
		    });
	    }
	    
	    // If myurl URL, download the attachment with auth
	    if (aAttachment.uri.spec.indexOf(myurl) == 0) {
		    cal.attachments_url.Cm2LanceHordeAuth(aAttachment.uri, function (aUri) {
			    readData (aUri, aAttachment);
		    });
	    }
	    else {
	    	readData(aAttachment.uri, aAttachment);
	    }
    }, // End formatBinaryAttachment

    /**
     * Read all attachments file and generate rawData
     *
     * @param calIItemBase aItem
     * @param bool aSendBinaryInvitation
     * @callback aCallback
     */
    readAttachmentsFiles: function(aItem, aCallback, aSendBinaryInvitation) {
	  // Default value for sending binary invitation
	  aSendBinaryInvitation = aSendBinaryInvitation || false;
	    
	  // Attachments count to load
	  let mapAttachments = 0;
	    
      // Retrieves all related objects (parent + occurrences)
	  let parentItem = aItem.parentItem;
      let items = new Array(parentItem);
      let rec = parentItem.recurrenceInfo;
      if (rec) {
        let exceptions = rec.getExceptionIds ({});
        if (exceptions.length > 0) {
            // we need to serialize each exid as a separate
            // event/todo; setupItemBase will handle
            // writing the recurrenceId for us
            for (let exid of exceptions) {
                let ex = rec.getExceptionFor(exid);
                if (ex)  
                  items.push(ex);
            }
        }
      }
	    
     for (let item of items) {
        // Get all attachments from item
        let attachments = item.getAttachments({});
        
        // Count number of attachments to load
        for (let attachment of attachments) { 
          if ((attachment.getParameter("VALUE") 
		        && "BINARY" == attachment.getParameter("VALUE"))
		        || (attachment.getParameter("X-CM2V3-SEND-ATTACH-INVITATION") 
		        && "TRUE" == attachment.getParameter("X-CM2V3-SEND-ATTACH-INVITATION") 
		        && aSendBinaryInvitation)) {
              mapAttachments ++;
          }
        }
      }
      
      // Si pas de piece jointe on continue le traitement
      if (mapAttachments == 0 || !Preferences.get("calendar.attachments.active", true)) {
        aCallback();
      }
      
      // All items (parent and occurrences)
      for (let item of items) {
        // Get all attachments from item
        let attachments = item.getAttachments({});
        
        // Now add back the new ones
        for (let attachment of attachments) { 
          if ((attachment.getParameter("VALUE") 
		        && "BINARY" == attachment.getParameter("VALUE"))
		        || (attachment.getParameter("X-CM2V3-SEND-ATTACH-INVITATION") 
		        && "TRUE" == attachment.getParameter("X-CM2V3-SEND-ATTACH-INVITATION") 
		        && aSendBinaryInvitation)) {
	            this.formatBinaryAttachment(attachment, function() {
			          mapAttachments--;

			          if (mapAttachments == 0) {
			            aCallback();
			          }
		          });
		      }
		    }
      }
    }, // End readAttachmentsFiles

    /**
     * Creating directory to store attachments.
     * The path is different if the calendar is cached or not.
     * 
     * @param calIItemBase aItem
     * @param bool aIsCached
     */
    createAttachmentsDirectory: function(aItem, aIsCached, aCalendar) {
      // Defining the directory (temporary or not)
      let sDirectory = aIsCached ? "ProfD" : "TmpD";
      
      aCalendar = aCalendar || aItem.calendar;
      
      let directory = Components.classes["@mozilla.org/file/directory_service;1"].
               				getService(Components.interfaces.nsIProperties).
           					get(sDirectory, Components.interfaces.nsIFile);
               
      try {    
        // Generation of the tree if it does not already exist      
        directory.append("calendar-data");
        if (!directory.exists() || !directory.isDirectory()) {   // if it doesn't exist, create
           directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));
        }
        directory.append(this.makePrettyCalendarName(aCalendar.name));
        if (!directory.exists() || !directory.isDirectory()) {   // if it doesn't exist, create
           directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));
        }
        directory.append(this.makePrettyCalendarName(aItem.id));
        cal.LOG("aItem.id: " + aItem.id);
        if (!directory.exists() || !directory.isDirectory()) {   // if it doesn't exist, create
           directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt("0755", 8));
        }
        // /calendar-data/<md5(calendar-name)>/<md5(event-uid)>
      }
      catch (err) {
        cal.WARN("Failed to create directory \"" + directory.path + "\"");
        cal.WARN("Error: \"" + err + "\"");
        directory = null;
      }
      return directory;
    }, // End createAttachmentsDirectory

    /**
     * Delete the directory that stores attachments
     * The path is different if the calendar is cached or not.
     * 
     * @param calIItemBase aItem
     * @param bool aIsCached
     */
    deleteAttachmentsDirectory: function(aItem, aIsCached, aCalendar) {
      // Defining the directory (temporary or not)
      var sDirectory = aIsCached ? "ProfD" : "TmpD";
      
      aCalendar = aCalendar || aItem.calendar;

      var directory = Components.classes["@mozilla.org/file/directory_service;1"].
               				getService(Components.interfaces.nsIProperties).
           					get(sDirectory, Components.interfaces.nsIFile);
               
      try {  
        directory.append("calendar-data");
        if (directory.exists() && directory.isDirectory()) { 
          directory.append(this.makePrettyCalendarName(aCalendar.name));
          if (directory.exists() && directory.isDirectory()) {
            let rootDirectory = directory.clone();
            directory.append(this.makePrettyCalendarName(aItem.id));
            if (directory.exists() && directory.isDirectory()) {
              directory.remove(true);
            }
            try {
              rootDirectory.remove(false);
            } 
            catch (e) {}
          }  
        }
      }
      catch (err) {
        cal.WARN("Failed to delete directory \"" + directory.path + "\"");
        cal.WARN("Error: \"" + err + "\"");
      }
    }, // End deleteAttachmentsDirectory
    
    /**
     * Clear the temporaly directory that stores attachments
     * 
     * @param calIItemBase aItem
     * @param bool aIsCached
     */
    clearAttachmentsTempDirectory: function(aItem, aCalendar, aOldItem) {
      // Defining the directory (temporary or not)
      let sDirectory = "TmpD";
      
      aCalendar = aCalendar || aItem.calendar;

      let directory = Components.classes["@mozilla.org/file/directory_service;1"].
               getService(Components.interfaces.nsIProperties).
               get(sDirectory, Components.interfaces.nsIFile);
               
      try {
        // Get item attachments
        let attachments = aItem.getAttachments({})
        let attachTable = new Array(); 
        
        // Myurl: link to download attachment
        let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mceweb2.si.minint.fr/services/download/");
        
        // How many attachments to load
        for (let attachment of attachments) { 
          if (attachment.uri.spec.indexOf(myurl) == 0) {
              var attachname = attachment.getParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME");
              if (attachname) attachTable[attachname] = attachment.hashId;
          }
        }
        
        if (aOldItem) {
          // Get old item attachments
          let oldAttachments = aOldItem.getAttachments({})
          var oldAttachTable = new Array(); 
        
          // How many attachments to load
          for (let oldAttachment of oldAttachments) { 
            if (oldAttachment.uri.spec.indexOf(myurl) == 0) {
                let attachname = oldAttachment.getParameter("X-MOZILLA-CALDAV-ATTACHMENT-NAME");
                if (attachname) oldAttachTable[attachname] = oldAttachment.hashId;
            }
          }
        }
        else return;
             
        directory.append("calendar-data");
        if (directory.exists() && directory.isDirectory()) { 
          directory.append(this.makePrettyCalendarName(aCalendar.name));
          if (directory.exists() && directory.isDirectory()) {
            let rootDirectory = directory.clone();
            directory.append(this.makePrettyCalendarName(aItem.id));
            if (directory.exists() && directory.isDirectory()) {
              // Delete attachments which does not exist
              var files = directory.directoryEntries;
              while (files.hasMoreElements()) {
                var file = files.getNext();
                file.QueryInterface(Components.interfaces.nsIFile);
                if (!attachTable[file.leafName]) {
                	file.remove(false);
                }
                // If hash id are different, remove file
                else if (aOldItem 
                        && oldAttachTable[file.leafName] 
                        && attachTable[file.leafName] != oldAttachTable[file.leafName]) {
                	file.remove(false);
                }
              }
              // Remove directory if possible
              try {
                directory.remove(false);
              } catch (e) {}
            }
            // Remove directory if possible
            try {
              rootDirectory.remove(false);
            } catch (e) {}
          }  
        }
      }
      catch (err) {
        cal.WARN("Failed to delete directory \"" + directory.path + "\"");
        cal.WARN("Error: \"" + err + "\"");
      }
    }, // End clearAttachmentsTempDirectory
	
	   
    /**
     * Turns an url into a string that can be used in UI.
     * - For a file:// url, shows the filename.
     * - For a http:// or https:// url, removes protocol and trailing slash
     * - For a imap:// or mailbox://, get filename property
     *
     * @param aUri    The uri to parse.
     * @return        A string that can be used in UI.
     */
    makePrettyName: function(aUri){
        let name = encodeURIComponent(aUri.spec);
      
        // Myurl: link to download attachment
        let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mceweb2.si.minint.fr/services/download/");
      
        if (aUri.schemeIs("file")) {
            name = aUri.spec.split("/").pop();
        } else if (aUri.schemeIs("http")) {
            name = aUri.spec.replace(/\/$/, "").replace(/^http:\/\//, "");
        } else if (aUri.schemeIs("imap")) {
            name = aUri.spec.split("filename=").pop().split("&")[0];
        } else if (aUri.schemeIs("mailbox")) {
            name = aUri.spec.split("filename=").pop().split("&")[0];
	    } else if (aUri.spec.indexOf(myurl) == 0) {
		    name = aUri.spec.split("file=").pop().split("&")[0];
	    }  else if (aUri.schemeIs("https")) {
            name = aUri.spec.replace(/\/$/, "").replace(/^https:\/\//, "");
        } 
        // CM2V3 Attachments - 18/08/2011 - Decode URI
        name = decodeURIComponent(name);
	    name = name.replace(/\*/g, '');
        // End CM2V3 Attachments

        return name;
    },

    /**
     * Format the calendar name to create the directory
     * Update: Md5 to reduce the size
     *
     * @param string aCalendarName
     * @return        A string that can be used in UI.
     */
    makePrettyCalendarName: function(aCalendarName){
		  let ch = Components.classes["@mozilla.org/security/hash;1"]
						      .createInstance(Components.interfaces.nsICryptoHash);

		  let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
							  .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
			
		  converter.charset = "UTF-8";
		  let data = converter.convertToByteArray(aCalendarName, {});

		  ch.init(ch.MD5);
		  ch.update(data, data.length);
		  let name = ch.finish(true);

	      // Replacement of characters allowed in Windows
	      name = name
			  .replace(/\//g, "")
			  .replace(/\"/g, "")
			  .replace(/\*/g, "")
			  .replace(/\</g, "")
			  .replace(/\>/g, "")
			  .replace(/\|/g, "")
			  .replace(/\?/g, "")
			  .replace(/\:/g, "");
			
	      return name;
    },
	
	  /**
     * Format the name of the attachment to remove unsupported characters
     *
     * @param string aAttachmentName
     * @return        A string that can be used in UI.
     */
    makePrettyAttachmentName: function(aAttachmentName){
		  let name = aAttachmentName;
		  // Replacement of characters allowed in Windows
		  name = name
		    .replace(/\//g, " ")
		    .replace(/\"/g, " ")
		    .replace(/\*/g, " ")
		    .replace(/\</g, " ")
		    .replace(/\>/g, " ")
		    .replace(/\|/g, " ")
		    .replace(/\?/g, " ")
		    .replace(/\:/g, " ");

		  return name;
    }
};

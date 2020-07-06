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

// CM2V3 Attachments - 22/08/2011 - Add modules to load attachments
ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
ChromeUtils.import("resource://gre/modules/pacomeAuthUtils.jsm");
// End CM2V3 Attachments

ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");

//NOTE: This module should not be loaded directly, it is available when
//including calUtils.jsm under the cal.attachments_url namespace.

this.EXPORTED_SYMBOLS = ["calattachmentsurl"]; /* exported calattachmentsurl */

var calattachmentsurl = {    

	  /**
     * Load item attachments from URL
     *
     * @param calIItemBase aItem
     * @callback aCallback
     */
    loadAttachmentsFromUrl: function(aItem, aCallback) {
	  // Attachments count to load
	  var mapAttachments = 0;
	    
      // Get item attachments
      let attachments = aItem.getAttachments({})
      
      // Myurl: link to download attachment
      let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://melanie2web.din.developpement-durable.gouv.fr/services/download/");
     
      // How many attachments to load
      for (let attachment of attachments) { 
        if (attachment.uri.spec.indexOf(myurl) == 0) {
            mapAttachments ++;
        }
      }
      
      // If no attachment to load, callback
      if (mapAttachments == 0 || !Preferences.get("calendar.attachments.active", true)) {
        aCallback();
      }
      
      // Get directory, if none callback   
      var directory = cal.attachments.createAttachmentsDirectory(aItem, false);              
      if (directory == null) {
        aCallback();
      }

      // Now download all url attachments
      for (let attachment of attachments) { 
        if (attachment.uri.spec.indexOf(myurl) == 0) {
          this.downloadAttachment(attachment, directory, true, false, function() { 
            mapAttachments --;

            if (mapAttachments == 0) {
              aCallback();
            } 
          });
	      }
      }
    }, // End loadAttachmentsFromUrl
    
    /**
     * Download the url attachment in the directory
     *
     * @param nsIAttachment aAttachment
     * @param nsIFile aDirectory
     * @callback aCallback
     */
    downloadAttachment: function (aAttachment, aDirectory, aReadOnly, aForceDownload, aCallback) {
      /**
       * Load attachment from url to local
       */
      function loadAttach (aAttachment, aUri, aReadOnly) {
          var channel = Services.io.newChannelFromURI2(aUri,
									                  null,
									                  Services.scriptSecurityManager.getSystemPrincipal(),
									                  null,
									                  Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
									                  Components.interfaces.nsIContentPolicy.TYPE_OTHER);
          NetUtil.asyncFetch(channel, function (aInputStream, aStatusCode, aRequest) {
            if (!Components.isSuccessCode(aStatusCode)) {
              aCallback(aAttachment);
            }

            // Read the binary file with a binary input stream
            var bstream = Components.classes["@mozilla.org/binaryinputstream;1"].
                  createInstance(Components.interfaces.nsIBinaryInputStream);
                
            var stringInputStream = Components.classes["@mozilla.org/io/string-input-stream;1"]
                       .createInstance(Components.interfaces.nsIStringInputStream);
            try {
              bstream.setInputStream(aInputStream); 
            
              // Open the file stream
              // Can also optionally pass a flags parameter here. It defaults to
              // FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE | FileUtils.MODE_TRUNCATE;
              var ostream = FileUtils.openSafeFileOutputStream(localFile);
              var data = bstream.readBytes(aInputStream.available());
              
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
                bstream = null;
                aInputStream = null;
                
                if (aReadOnly) localFile.permissions = 0o555;
                else localFile.permissions = 0o755;
                
                aCallback(aAttachment);
              });
            }
            catch (err) {
            	// catch une erreur
            	aCallback(aAttachment);
            }
            
          }); // end asyncFetch
      };
      
      let attachment = aAttachment;
      let filename = cal.attachments.makePrettyName(attachment.uri);
      let uri = attachment.uri;
      
      // Myurl: link to download attachment
      let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://melanie2web.din.developpement-durable.gouv.fr/services/download/");
      
      // Reduction of the name of the attachment if it exceeds 256 characters
      if ((filename.length + aDirectory.path.length) >= 256) {
        filename = "..." + filename.substring(((filename.length + aDirectory.path.length) - 253),filename.length);
      }
      
      var FileUtils = ChromeUtils.import("resource://gre/modules/FileUtils.jsm").FileUtils

      var localFile = new FileUtils.File(aDirectory.path);
      localFile.append(filename);

      try {               
        if (aForceDownload && localFile.exists()) {
        	localFile.remove(false);
        }

        var isFileExist = localFile.exists();
        if (!isFileExist) {
          if (attachment.uri.spec.indexOf(myurl) == 0) {
            this.Cm2LanceHordeAuth(attachment.uri, function (aUri) {
              loadAttach(attachment, aUri, aReadOnly);
            }); // end Cm2LanceHordeAuth
          }
          else { 
        	  aCallback(attachment); 
    	  }
        }
      }
      catch (err) {
        // catch une erreur
      }
      finally {
        // Copie l'uri de la piece jointe pour lecture
        attachment.uri = Services.io.newURI("file://" + localFile.path, null, null);
        attachment.deleteParameter("ENCODING");
        attachment.setParameter("VALUE", "BINARY");

        if (isFileExist) {
          if (!aReadOnly) {
        	  localFile.permissions = 0o755;
          }
          else {
        	  localFile.permissions = 0o555;
          }
          aCallback(attachment);
        }
      }
   }, // End downloadAttachment
	
	
	// CM2V3 Attachments - Login horde pour la récupération des pièces jointes
	/*
	* Lancement de horde avec authentification automatique basee sur authentification TB
	* aUri: uri vers le lien attach a telecharger
	* aCallback: fonction calback appelee apres l'authentification
	*/
	Cm2LanceHordeAuth: function(aUri, aCallback) {
    // Defini l'url de login de Horde pour récupérer les pièces jointes
		let login_page = Preferences.get("calendar.attachments.url.login", "https://melanie2web.din.developpement-durable.gouv.fr/login.php");
		
		try {
			//url	
			//paramètres
			let usermdp = this.Cm2GetUserMdpPrincipal();
			if (usermdp == null || usermdp["mdp"] == "") {
				aCallback(aUri);
			}
			
			//cas uid partage
			let p = usermdp["user"].indexOf(".-.");
			if (-1 != p) {
				usermdp["user"] = usermdp["user"].substring(0, p);
			}
			
			let encodeur = Components.classes["@mozilla.org/intl/texttosuburi;1"]
										.getService(Components.interfaces.nsITextToSubURI);
			
			let param = "horde_user=" + encodeur.ConvertAndEscape("ISO-8859-15", usermdp["user"]);
			param += "&horde_pass=" + encodeur.ConvertAndEscape("ISO-8859-15", usermdp["mdp"]);
			usermdp = null;
			
			let httpRequest = new XMLHttpRequest();
			
			httpRequest.open("POST", login_page, true);
			httpRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
			httpRequest.onreadystatechange = function() {
				switch (httpRequest.readyState) {
					case 4:
						let statut = 0;
						try {
							statut = httpRequest.status;
						}
						catch(ex1) {
							//v1.1.1
							let req = httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);
							statut = req.status;
						}
						
						if (statut != 200) {
							//ouverture standard
							aCallback(aUri);
						} 
						else {
							try {
								let req = httpRequest.channel.QueryInterface(Components.interfaces.nsIRequest);					
								let lienhorde = req.URI.spec;
								if (lienhorde.match(/Horde=([0-9a-zA-Z]*)?/)) {
									aUri.spec = aUri.spec + "&" + (lienhorde.match(/Horde=([0-9a-zA-Z]*)?/))[0];
									aCallback(aUri);
								} else {
								  aCallback(aUri);
								}
								
							} catch(ex1) {
								//ouverture standard
								aCallback(aUri);				  
							}
						}
						break;
				}
			};
			httpRequest.send(param);
		}
		catch (ex){
			//window.setCursor("auto");
			//ouverture standard
			cal.LOG("CalDAV: Cm2LanceHordeAuth: ex: " + ex);
			aCallback(aUri);
		}
	},

	// Recupere le user et mot de passe
	Cm2GetUserMdpPrincipal: function() {
		let cp = PacomeAuthUtils.GetComptePrincipal();
		if (cp == null){
			return null;
		}
		
		let usermdp = new Array();
		usermdp["user"] = cp.incomingServer.username;
		usermdp["mdp"] = cp.incomingServer.password;
		
		return usermdp;
	}
	// End CM2V3 Attachments
    
 
};

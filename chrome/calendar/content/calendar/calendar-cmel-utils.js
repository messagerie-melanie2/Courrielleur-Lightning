/* fonctions utilitaires pour les pièces jointes courrielleur */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://calendar/modules/utils/calL10NUtils.jsm");


/**
 * Opens the selected attachment using the external protocol service.
 * @see nsIExternalProtocolService
 */
function openAttachment() {

  try {
    // Only one file has to be selected and we don't handle base64 files at all
    let documentLink = document.getElementById("attachment-link");
    if (documentLink.selectedItems.length == 1) {
      // Change URL call
      let attachment = documentLink.getSelectedItem(0).attachment.clone();
      window.setCursor("wait");

      // Melanie2Web link to download attachment
      let myurl = Preferences.get("calendar.attachments.url.melanie2web",
                                  "https://mce.sso.gendarmerie.fr/services/download/");

      if (attachment.uri.spec.indexOf(myurl) == 0) {
        // Show message on status bar
        gEventStatusFeedback.initialize(window.parent);
        gEventStatusFeedback.showStatusString(cal.l10n.getCalString("downloadM2WebAttachment"));

        // Directory where stock attachments
        let directory = cal.attachments.createAttachmentsDirectory(window.calendarItem, false);
        let readOnly=window.calendarItem.calendar.readOnly;

        cal.attachments_url.downloadAttachment(attachment, directory, readOnly, false, function (aAttachment) {
          let channel = Services.io.newChannelFromURI2(aAttachment.uri,
                                    null,
                                    Services.scriptSecurityManager.getSystemPrincipal(),
                                    null,
                                    Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                    Components.interfaces.nsIContentPolicy.TYPE_OTHER);
          if (channel) {
            cal.LOG("CalDAV: Download aAttachment.uri.spec: " + aAttachment.uri.spec);
            let uriLoader = Components.classes["@mozilla.org/uriloader;1"]
                          .getService(Components.interfaces.nsIURILoader);
            uriLoader.openURI(channel, Components.interfaces.nsIURILoader.IS_CONTENT_PREFERRED, new nsAttachmentOpener());
            gEventStatusFeedback.showStatusString("");
            window.setCursor("auto");
          } // if channel
        });
      } else {
        let channel = Services.io.newChannelFromURI2(attachment.uri,
                                  null,
                                  Services.scriptSecurityManager.getSystemPrincipal(),
                                  null,
                                  Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                  Components.interfaces.nsIContentPolicy.TYPE_OTHER);
        if (channel) {
          cal.LOG("CalDAV: attachment.uri.spec: " + attachment.uri.spec);
          let uriLoader = Components.classes["@mozilla.org/uriloader;1"].getService(Components.interfaces.nsIURILoader);
          uriLoader.openURI(channel, Components.interfaces.nsIURILoader.IS_CONTENT_PREFERRED, new nsAttachmentOpener());
          window.setCursor("auto");
        } // if channel
      }
    }
  } catch (err) {
    window.setCursor("auto");
    cal.WARN("Attachment: openAttachment error: " + err);
    // Show message on status bar
    gEventStatusFeedback.initialize(window.parent);
    gEventStatusFeedback.showStatusString(cal.l10n.getCalString("errorOpenAttachment"));
  }
}

function nsAttachmentOpener()
{
}

nsAttachmentOpener.prototype =
{
  QueryInterface: function(iid)
  {
    if (iid.equals(Components.interfaces.nsIURIContentListener) ||
        iid.equals(Components.interfaces.nsIInterfaceRequestor) ||
        iid.equals(Components.interfaces.nsISupports))
        return this;
    throw Components.results.NS_NOINTERFACE;
  },

  onStartURIOpen: function(uri)
  {
    return false;
  },

  doContent: function(contentType, isContentPreferred, request, contentHandler)
  {
    return false;
  },

  isPreferred: function(contentType, desiredContentType)
  {
    return false;
  },

  canHandleContent: function(contentType, isContentPreferred, desiredContentType)
  {
    return false;
  },

  getInterface: function(iid)
  {
    if (iid.equals(Components.interfaces.nsIDOMWindow)) {

       return window;

    } else if (iid.equals(Components.interfaces.nsIDocShell)) {

      return window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                   .getInterface(Components.interfaces.nsIWebNavigation)
                   .QueryInterface(Components.interfaces.nsIDocShell);
    } else {

       return this.QueryInterface(iid);
    }
  },

  loadCookie: null,
  parentContentListener: null
}


/**
 * Download the selected attachment
 */
function downloadAttachment() {

  try {
    // Only one file has to be selected and we don't handle base64 files at all
    let documentLink = document.getElementById("attachment-link");
    if (documentLink.selectedItems.length == 1) {

      // Change URL call
      let attachment = documentLink.getSelectedItem(0).attachment.clone();

      // Melanie2Web link to download attachment
      let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mce.sso.gendarmerie.fr/services/download/");
      if (attachment.uri.spec.indexOf(myurl) == 0) {

        window.setCursor("wait");

        // Show message on status bar
        gEventStatusFeedback.initialize(window.parent);
        gEventStatusFeedback.showStatusString(cal.l10n.getCalString("downloadM2WebAttachment"));

        // Directory where stock attachments
        let directory = cal.attachments.createAttachmentsDirectory(window.calendarItem, false);
        let readOnly=window.calendarItem.calendar.readOnly;

        cal.attachments_url.downloadAttachment(attachment, directory, readOnly, true, function (aAttachment) {
            gEventStatusFeedback.showStatusString("");
            window.setCursor("auto");
        });
      } else{
        Services.console.logStringMessage("calendar-cmel-utils.js downloadAttachment else on fait quoi?");
      }
    }
  }
  catch (err) {
    window.setCursor("auto");
    cal.WARN("Attachment: downloadAttachment error: " + err);
    // Show message on status bar
    gEventStatusFeedback.initialize(window.parent);
    gEventStatusFeedback.showStatusString(cal.l10n.getCalString("errorOpenAttachment"));
  }
}


/**
 * Save the selected attachment
 */
function saveAsAttachment() {

  // Only one file has to be selected and we don't handle base64 files at all
  let documentLink = document.getElementById("attachment-link");
  if (1!=documentLink.selectedItems.length)
    return;

  const nsIFilePicker = Components.interfaces.nsIFilePicker;
  let fp = Components.classes["@mozilla.org/filepicker;1"]
                     .createInstance(nsIFilePicker);
  fp.init(window,
          cal.l10n.getString("calendar-event-dialog", "saveAsFile"),
          nsIFilePicker.modeSave);
  // Change URL call
  let attachment = documentLink.getSelectedItem(0).attachment.clone();

  fp.defaultString = cal.attachments.makePrettyName(attachment.uri);

  // Check for the last directory
  let lastDir = lastDirectory();
  if (lastDir) {
    fp.displayDirectory = lastDir;
  }

  fp.open(function(rv){

    if (nsIFilePicker.returnOK==rv ||
        nsIFilePicker.returnReplace==rv){

      let file=fp.file;

      try {

        window.setCursor("wait");

        let localFile = Components.classes["@mozilla.org/file/local;1"]
                                  .createInstance(Components.interfaces.nsIFile);

        // Melanie2Web link to download attachment
        let myurl = Preferences.get("calendar.attachments.url.melanie2web",
                                    "https://mce.sso.gendarmerie.fr/services/download/");

        if (attachment.uri.spec.indexOf(myurl) == 0) {
          // Show message on status bar
          gEventStatusFeedback.initialize(window.parent);
          gEventStatusFeedback.showStatusString(cal.l10n.getCalString("downloadM2WebAttachment"));

          // Directory where stock attachments
          let directory = cal.attachments.createAttachmentsDirectory(window.calendarItem, false);

          cal.attachments_url.downloadAttachment(attachment, directory, false, false, function (aAttachment) {

            gEventStatusFeedback.showStatusString(cal.l10n.getCalString("saveAsAttachmentDone"));
            window.setCursor("auto");

            let filePath = aAttachment.uri.QueryInterface(Components.interfaces.nsIFileURL).file.path;
            localFile.initWithPath(filePath);
            localFile.copyTo(file.parent, file.leafName);
          });
        }
        else {
          localFile.initWithPath(decodeURIComponent(attachment.uri.spec.replace('file://', '')));
          localFile.copyTo(file.parent, file.leafName);
          gEventStatusFeedback.showStatusString(cal.l10n.getCalString("saveAsAttachmentDone"));
        }

      } catch (err) {
        window.setCursor("auto");
        cal.WARN("Attachment: saveAsAttachment error: " + err);
        // Show message on status bar
        gEventStatusFeedback.initialize(window.parent);
        gEventStatusFeedback.showStatusString(cal.l10n.getCalString("errorOpenAttachment"));
      }
    }
  });
}

/**
 * Helper function to remember the last directory chosen when attaching files.
 * XXX This function is currently unused, will be needed when we support
 * attaching files.
 *
 * @param aFileUri    (optional) If passed, the last directory will be set and
 *                                 returned. If null, the last chosen directory
 *                                 will be returned.
 * @return            The last directory that was set with this function.
 */
function lastDirectory(aFileUri) {
  if (aFileUri) {
      // Act similar to a setter, save the passed uri.
      let uri = Services.io.newURI(aFileUri);
      let file = uri.QueryInterface(Components.interfaces.nsIFileURL).file;
      lastDirectory.mValue = file.parent.QueryInterface(Components.interfaces.nsIFile);
  }

  // In any case, return the value
  return (lastDirectory.mValue === undefined ? null : lastDirectory.mValue);
}

/**
 * Open for modify the selected attachment using the external protocol service.
 * @see nsIExternalProtocolService
 */
function modifyAttachment() {

  try {
    // Only one file has to be selected and we don't handle base64 files at all
    let documentLink = document.getElementById("attachment-link");
    if (documentLink.selectedItems.length == 1) {
      // Change URL call
      let attachment = documentLink.getSelectedItem(0).attachment;
      window.setCursor("wait");

      // Melanie2Web link to download attachment
      let myurl = Preferences.get("calendar.attachments.url.melanie2web", "https://mce.sso.gendarmerie.fr/services/download/");

      if (attachment.uri.spec.indexOf(myurl) == 0) {
        // Show message on status bar
        gEventStatusFeedback.initialize(window.parent);
        gEventStatusFeedback.showStatusString(cal.l10n.getCalString("downloadM2WebAttachment"));

        // Directory where stock attachments
        let directory = cal.attachments.createAttachmentsDirectory(window.calendarItem, false);
        cal.attachments_url.downloadAttachment (attachment, directory, false, false, function (aAttachment) {
          let channel = Services.io.newChannelFromURI2(aAttachment.uri,
                                    null,
                                    Services.scriptSecurityManager.getSystemPrincipal(),
                                    null,
                                    Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                    Components.interfaces.nsIContentPolicy.TYPE_OTHER);
          if (channel) {
            cal.LOG("CalDAV: Download aAttachment.uri.spec: " + aAttachment.uri.spec);
            let uriLoader = Components.classes["@mozilla.org/uriloader;1"].getService(Components.interfaces.nsIURILoader);
            uriLoader.openURI(channel, true, new nsAttachmentOpener());
            gEventStatusFeedback.showStatusString("");
            window.setCursor("auto");
          } // if channel
        });
      } else {
        let channel = Services.io.newChannelFromURI2(attachment.uri,
                                  null,
                                  Services.scriptSecurityManager.getSystemPrincipal(),
                                  null,
                                  Components.interfaces.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
                                  Components.interfaces.nsIContentPolicy.TYPE_OTHER);
        if (channel) {
          cal.LOG("CalDAV: attachment.uri.spec: " + attachment.uri.spec);
          let uriLoader = Components.classes["@mozilla.org/uriloader;1"].getService(Components.interfaces.nsIURILoader);
          uriLoader.openURI(channel, true, new nsAttachmentOpener());
          window.setCursor("auto");
        } // if channel
      }
    }
  } catch (err) {
    window.setCursor("auto");
    cal.WARN("Attachment: modifyAttachment error: " + err);
    // Show message on status bar
    gEventStatusFeedback.initialize(window.parent);
    gEventStatusFeedback.showStatusString(cal.l10n.getCalString("errorOpenAttachment"));
  }
}

let currentRequesterUrl;
// global background listener, controlled with an "action"-property
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("background action: " + message.action);
  console.log("sender: " + JSON.stringify(sender));


  if (message.action === "start_password_request_flow") {
    currentRequesterUrl = message.url;
    openPasswordRequestDialog(true);
    return true; 
  }
  if (message.action === "start_single_password_request_flow") {
    currentRequesterUrl = message.url;
    openPasswordRequestDialog(false);
    return true; 
  }
  else if (message.action === "request_credential") {
    fetchCredentials(message.requestIdentifier, sendResponse);
    return true;
  }
  else if (message.action === "start_link_flow") {
    openLinkWithQrCodeDialog();
    return true; 
  }
  else if (message.action === "start_unlink_flow") {
    unlinkApp().then(async _ => {
      console.log("unlink then entered");
      sendResponse();
    });
    return true; 
  }
  else if (message.action === "link_to_app") {
    linkToApp(sendResponse);
    return true; 
  }

  return false; 
});




// Callback reads runtime.lastError to prevent an unchecked error from being 
// logged when the extension attempt to register the already-registered menu 
// again. Menu registrations in event pages persist across extension restarts.
browser.contextMenus.create({
  id: "anotherpass-request",
  title: "Request credential from ANOTHERpass",
  contexts: ["password"], // or "editable"?
},
  // See https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/#event-pages-and-backward-compatibility
  // for information on the purpose of this error capture.
  () => void browser.runtime.lastError,
);


browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "anotherpass-request") {
    openPasswordRequestDialog();
  }
});

function fetchCredentials(requestIdentifier, sendResponse) {

  const request = {
    action: "request_credential",
    website: currentRequesterUrl,
    requestIdentifier: requestIdentifier
  };
  
  remoteCall(request, sendResponse);

}


function linkToApp(sendResponse) {


  console.log("linkToApp");

  getKey("client_keypair").then(async value => {
    const clientPublicKey = value.publicKey;
    const clientPublicKeyAsJWK = await publicKeyToJWK(clientPublicKey);
    const request = {
      action: "link_app",
      clientPublicKey: clientPublicKeyAsJWK
    };
    
    remoteCall(request, sendResponse);
  });
}


function openPasswordRequestDialog(autofill) {
  let createData = {
    type: "detached_panel",
    url: "popup/request_password.html?data=" + encodeURIComponent(JSON.stringify({autofill: autofill})),
    width: 650,
    height: 520,
  };

  console.log("open request password dialog");

  browser.windows.create(createData);
}


function openLinkWithQrCodeDialog() {
  
  let createData = {
    type: "detached_panel",
    url: "popup/app_link.html",
    width: 800,
    height: 765,
  };
  
  browser.windows.create(createData);
}


async function unlinkApp() {

  console.log("do unlink");
  localStorage.removeItem("linked");
  localStorage.removeItem("web_client_id");
  localStorage.removeItem("server_address");
  localStorage.removeItem("server_port");
  localStorage.removeItem("linked_vault_id");
  localStorage.removeItem("symmetric_key_length");


  await destroyAllKeys(); 
  console.log("do unlink done");

}

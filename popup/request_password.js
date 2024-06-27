const requestData = JSON.parse(new URLSearchParams(location.search).get('data'));

let _credential;

document.addEventListener("click", (e) => {

  if (e.target.id === "close") {
    destroySessionKey();
    window.close();
  }
  else if (e.target.id === "update") {

    const ip = document.getElementById("host").value;

    if (!ip || ip == "") {
      bsAlert("Error", "A host is required");
    }
    else {
      localStorage.setItem("server_address", ip);
    }

  }
  else if (e.target.id === "copy") {
    navigator.clipboard.writeText(_credential.password);
    const copyButton = document.getElementById("copy").innerText = "Copied!";
  }
});


const webClientId = localStorage.getItem("web_client_id");
const linked = localStorage.getItem("linked");

if (!linked) {
  bsAlert("Error", "Extension not linked with an app! Please link it first.").then(_ => {
    window.close();
  });
} 
else {

  const ip = localStorage.getItem("server_address");
  document.getElementById("host").value = ip;


  getKey("app_public_key").then(async value => {
    document.getElementById("web_client_id").innerText = webClientId;

    // destroy previous if still exists
    destroySessionKey();
    const sessionKey = await generateOrGetSessionKey();
    const sessionKeyAsArray = await aesKeyToArray(sessionKey);
    const sessionKeyBase64 = bytesToBase64(sessionKeyAsArray);
    console.log("Request Session Key = " + sessionKeyBase64);
    
    const baseKey = await getKey("base_key");
    const baseKeyAsArray = await aesKeyToArray(baseKey);
    const fingerprintAsArray = await hashKeys(baseKeyAsArray, sessionKeyAsArray);
    const formattedFingerprint = toShortenedFingerprint(fingerprintAsArray);

    document.getElementById("fingerprint").innerText = formattedFingerprint;


    const pollingTimeout = localStorage.getItem("polling_timeout") || 60;
    const pollingInterval = localStorage.getItem("polling_interval") || 2;


    poll(async function (progress) {
      document.getElementById("waiting_time").value = progress;
      let response = await chrome.runtime.sendMessage({
        action: "request_credential",
        requestIdentifier: sessionKeyBase64
      });
      console.debug("response = " + JSON.stringify(response));
      if (response.status == 403) {
        console.warn("Request rejected");
        document.getElementById("waiting_time").value = 0;
        document.getElementById("instruction").innerText = "Request was rejected!";
        document.getElementById("close").innerText = "Close";

        destroySessionKey();

        bsAlert("Error", "The request has been rejected in the app or the vault was locked.").then(_ => {
          window.close();
        });
        return null;
      }
      return response.response;
    }, pollingTimeout * 1000, pollingInterval * 1000).then(function (response) { 
      // polling done
      document.getElementById("waiting_time").value = 100;

      destroySessionKey();
      
      console.log("autofill " + requestData.autofill);

      if (requestData.autofill) {
        sendPasteCredentialMessage(response.password);
      }
      else {
        presentCredential(response);
      }
    }).catch(function (e) {
      console.error(e);
      document.getElementById("waiting_time").value = 0;
      document.getElementById("instruction").innerText = "Unable to receive credentials!";
      document.getElementById("close").innerText = "Close";

      destroySessionKey();

      bsAlert("Error", "You haven't opened the app in reasonable time or the host or port is wrong.").then(_ => {
        window.close();
      });
    });


    function sendPasteCredentialMessage(p) {

      browser.tabs.query({ active: true, currentWindow: false /* true for actino popup, false for request password popup */ }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "paste_credential", password: p }, function () {
          window.close();
        });
      });
    }

    function presentCredential(credential) {
      console.log("present " + JSON.stringify(credential));

      _credential = credential;


      bsConfirm(
        "Credential '" + credential.name + "'", 
        `
        <div class="container text-left">
          <div class="row">
            <div class="col">
              <div class="mb-3">
                Website:
              </div>
            </div>
            <div class="col col-sm-auto">
              <div class="mb-1">
                <a target="_blank" href="${credential.website}">${credential.website}</a>
              </div>
            </div>
            <div class="col">  
            </div>
          </div>
        </div>

        <div class="container text-left">
          <div class="row">
            <div class="col">
              <div class="mb-3">
                User:
              </div>
            </div>
            <div class="col col-sm-auto">
              <div class="mb-1">
                <b>${credential.user}</b>
              </div>
            </div>
            <div class="col">  
            </div>
          </div>
        </div>

        <div class="container text-left">
          <div class="row">
            <div class="col">
              <div class="mb-3">
                Password:
              </div>
            </div>
            <div class="col col-sm-auto">
              <div class="mb-1">
                <b class="fingerprint_small">${credential.password}</b>
              </div>
            </div>
            <div class="col">
              <div class="mb-3">
                <button type="button" id="copy" title="Copy to clipboard" class="btn btn-outline-primary rounded-0">Copy</button>
              </div>
            </div>
          </div>
        </div>

        `,
        "Import and Close",
        "Close"
      )
      .then((decision) => {
        console.log("decision:" + decision);
        if (decision === true) {
          window.close() // import the credential
        }
        else if (decision === false) {
          window.close()
        }
      });

    }
  });

}




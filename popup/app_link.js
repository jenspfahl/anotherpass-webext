const linked = localStorage.getItem("linked");

if (!linked) {

  const webClientId = generateWebClientId();

  console.log("webClientId = " + webClientId);

  const ip = localStorage.getItem("server_address");
  const port = localStorage.getItem("server_port");
  document.getElementById("instruction").innerText = "Scan this QR code with the ANOTHERpass app and enter the IP / hostname provided by the app.";
  document.getElementById("ip").value = ip;
  document.getElementById("port").value = port || 8001;


  destroyClientKeyPair(); // ensure regeneration
  generateOrGetClientKeyPair().then(async keyPair => {
    const publicKeyFingerprint = await getPublicKeyFingerprint(keyPair.publicKey);
    console.log("Fingerprint: " + publicKeyFingerprint);

    destroyBaseKey();
    const baseKey = await generateOrGetBaseKey();
    const baseKeyAsArray = await aesKeyToArray(baseKey);
    console.log("AES Base Key = " + bytesToBase64(baseKeyAsArray));

    document.getElementById("web_client_id").innerText = webClientId;

    localStorage.setItem("web_client_id", webClientId);

    await setKey("client_keypair", keyPair);


    const qrCodeInput = `${webClientId}:${bytesToBase64(baseKeyAsArray)}:${publicKeyFingerprint}`;
    generateQrCode(qrCodeInput);


    document.addEventListener("click", (e) => {

      if (e.target.id === "next") {

        // TODO check and save data
        const ip = document.getElementById("ip").value;
        const port = document.getElementById("port").value;

        if (!ip) {
          alert("A host is required");
        }
        else if (!port) {
          alert("A port is required");
        }
        else {

          localStorage.setItem("server_address", ip);
          localStorage.setItem("server_port", port);
          
          const sending = chrome.runtime.sendMessage({
            action: "link_to_app"
          }).then(async response => {
            console.log("linking response: " + response.response.serverPubKey.n)
            if (response.response == null) {
              console.log("linking error from server, see previous logs");
              alert("Cannot link with the app. Check whether the IP is correct and you have scanned the QR code with ANOTHERpass app.");
            }
            else {


              const jwk = {
                kty:"RSA",
                n: response.response.serverPubKey.n,
                e: response.response.serverPubKey.e,
                alg: "RSA-OAEP-256"
              };

        
              console.log("jwk.n64 in:", base64ToBytes(jwk.n))
              const appPublicKey = await jwkToPublicKey(jwk);
              const jwk2 = await publicKeyToJWK(appPublicKey);
                console.log("jwk.n2 out:", jwk2.n)
                console.log("jwk.n64 out:", base64ToBytes(jwk2.n))

              await setKey("app_public_key", appPublicKey);

              window.close();

              chrome.runtime.sendMessage({
                action: "continue_link_flow",
              });
            }

          },
          error => {
            console.log("unknown linking error from server: ", error);
            alert("Cannot link with the app due to an unknown problem");
          });

        }
      }
    });
  });



  function generateQrCode(input) {
    document.getElementById("loading_icon").remove();
    const qrCodeDiv = document.querySelector(".qr-code");
    var qrcode = new QRCode(qrCodeDiv, {
      text: input,
      width: 512,
      height: 512,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

}
else {
  alert("Something went wrong :(")
}

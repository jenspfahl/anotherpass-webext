const STOP_POLLING = "STOP_POLLING";

function poll(fn, timeout, interval) {
  const startTime = Number(new Date());
  const endTime = startTime + (timeout || 2000);
  const totalTime = endTime - startTime;
  interval = interval || 100;
  console.log(`endTime: ${new Date(endTime)}`);
  const checkCondition = async function (resolve, reject) {
    const nowTime = Number(new Date());
    const pastTime = nowTime - startTime;
    const progress = pastTime / totalTime;
    const result = await fn(progress);
    console.log(`result: ${JSON.stringify(result)}`);
    if (result) {
      resolve(result);
    }
    else if (result === STOP_POLLING) {
      console.log(`Polling stopped by caller`);
      reject(new Error('stopped by caller'));
    }
    else if (nowTime < endTime) {
      console.log(`new timeout: ${new Date(endTime)}`);
      setTimeout(checkCondition, interval, resolve, reject);
    }
    else {
      console.log(`Error: ${arguments}`);
      reject(new Error('timed out'));
    }
  };

  return new Promise(checkCondition);
}


function getAddress() {
  const server = localStorage.getItem("server_address");
  const port = localStorage.getItem("server_port");
  return server + ":" + port;
}

/**
 * If server public key is known: 
 * BaseKey + OneTimeKey = TransportKey
 * OneTimeKey is sent encrypted with the pubkey of the server
 * 
 * If serer public key is unknown (only in linking phase) we don't have a baseKey and use a linking sessionKey:
 * SesssionKey (generated by client) = TransportKey
 * 
 * @param {*} message 
 * @param {*} sendResponse 
 */
async function remoteCall(message, sendResponse) {
  const webClientId = localStorage.getItem("web_client_id");
  const linked = localStorage.getItem("linked");
  try {
    let request;
    let requestTransportKeyAsArray;
    if (linked) {
      const appPublicKey = await getKey("app_public_key");
      const oneTimeKey = await generateAesKey(getSupportedKeyLength());
      const oneTimeKeyAsArray = await aesKeyToArray(oneTimeKey);

      const encOneTimeKey = await encryptWithPublicKey(appPublicKey, oneTimeKeyAsArray);
  
      const baseKey = await getKey("base_key");
      const baseKeyAsArray = await aesKeyToArray(baseKey);
    
      requestTransportKeyAsArray = await hashKeys(baseKeyAsArray, oneTimeKeyAsArray); 
      const requestTransportKey = await arrayToAesKey(requestTransportKeyAsArray);
  
      const envelope = await encryptMessage(requestTransportKey, JSON.stringify(message));

      request = {
        encOneTimeKey: bytesToBase64(encOneTimeKey), 
        envelope: envelope
      };
    }
    else {
      const sessionKey = await generateOrGetSessionKey(); 

      const envelope = await encryptMessage(sessionKey, JSON.stringify(message));
      request = {
        envelope: envelope
      };
    }

    console.debug("sending plain request:", JSON.stringify(message));  
    console.debug("sending request:", JSON.stringify(request));

    const address = getAddress();
    console.debug("fetch from", address);

    const res = await fetch('http://' + address + '/', {
        method: 'POST',
        headers: { 
          "X-WebClientId": webClientId, 
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(request)
      });

    console.log("received HTTP Status: " + res.status);

    const body = await res.json();
    if (res.status != 200) {
      console.error("Unsuccessful! Reason: " + JSON.stringify(body));
      sendResponse({ response: null, status: res.status, error: body.error });
      return null;
    }


    const keyPair = await getKey("client_keypair");
    const encOneTimeKey = base64ToBytes(body.encOneTimeKey);
    const decOneTimeKeyAsArray = await decryptWithPrivateKey(keyPair.privateKey, encOneTimeKey);
    let responseTransportKeyAsArray;
    if (linked) {
      // derive reponse transport key (local base key + sent encrypted one-time key + used request transport key)
      const baseKey = await getKey("base_key");
      const baseKeyAsArray = await aesKeyToArray(baseKey);
      responseTransportKeyAsArray = await hashKeys(baseKeyAsArray, decOneTimeKeyAsArray, requestTransportKeyAsArray);
    }
    else {
      // in linking phase the client doesn't have a basekey and uses the previously shared session key as second key
      const sessionKey = await generateOrGetSessionKey(); 
      const sessionKeyAsArray = await aesKeyToArray(sessionKey);        
      // derive transport key (session key + sent encrypted one-time key)
      responseTransportKeyAsArray = await hashKeys(sessionKeyAsArray, decOneTimeKeyAsArray);
    }

    const transportKey = await arrayToAesKey(responseTransportKeyAsArray);
    // decrypt response
    const decryptedPayload = await decryptMessage(transportKey, body.envelope);

    console.debug("decrypted response", decryptedPayload);

    if (decryptedPayload == null) {
      console.error("HTTP decrypted payload is null");
      sendResponse({ response: null });
      return null;
    }

    var response;
    try {
      response = JSON.parse(decryptedPayload);
    }
    catch (e) {
      console.warn("cannot parse decryptedPayload", e)
      response = {
        "raw": res
      };
    }

    sendResponse({ response: response });

  }
  catch (e) {
    console.warn("HTTP fetch failed:", e)
    sendResponse({ response: null });
  }  
    
   
}
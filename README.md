# Intro

## Disclaimer

This extension is final. The security and communication layer is stable and the UI should be finished. Smaller bugs in the UI or wrong rendering could happen. If you encounter some problems, please report an issue. 

## Purpose

This is a browser extension to communicate with the [ANOTHERpass Android app](https://anotherpass.jepfa.de) from a browser on a different device in the same local network to access the stored credentials in the app and use them in the browser. 

The browser extension (called the extension) can be connected to an [ANOTHERpass V2 app](https://github.com/jenspfahl/ANOTHERpass) (called the app, download the latest version [here](https://anotherpass.jepfa.de/download)) running on a device which is reachable from the browser. 

To achieve this:

- the device where the app runs is connected to the same local network as the device where the browser runs
- the app acts as server, the extension as client
- used protocol is HTTP to enable the extension to access the app (HTTPS requires a valid server certificate signed by a CA, which is not available atm)
- to easily find the app in the network, the app's device can use a device name as hostname (if you administer the local network) or the device IP address is needed by the extension. A so called handle is a shortened IP address in a Base22 format, to avoid fiddling around with changing IP addresses.
- a port can be configured on both ends (default 8787)

More information about the extension can be found [here](https://anotherpass.jepfa.de/extension).

# Installing

This extension is under beta and published on AMO (addons.mozilla.org). 

<a href="https://addons.mozilla.org/en-US/firefox/addon/anotherpass-browser-extension/" target="_blank"><img src="icons/get-addon-on-moz.png"/></a>

and on Chrom Web Store as well:

<a href="https://chromewebstore.google.com/detail/anotherpass-browser-exten/hifppbgnnojjdccmikbapfofbloabefb" target="_blank"><img src="icons/get-addon-on-chrome.png"/></a>


To install this extension from the current code base you have to download this repository and use `about:debugging#/runtime/this-firefox` to temporary load this extension to Firefox by selecting the `manifest.json`. Similar works for Chrome.

# Use Cases (outline)

The use cases are implemented by utilizing the [ANOTHERpass Credential Server API](https://github.com/jenspfahl/ANOTHERpass/blob/master/SERVER-API-SPEC.md).

## Link Extension with the App

To achieve a maximum of security the extension and the app must be linked before usage. That basically means both parties exchange certain keys to ensure a secure communication.

Using HTTPS is not constructive because the server (the app) cannot provide a TLS certificate signed by a common CA. A solution could be to include the certificate in the extension (if accepted by the browsers). In any way, we don't want to rely on TLS only and want to be able to use plain HTTP as well with our own encryption layer. This will be achieved by exchanging certain keys beforehand through a secure offline-channel in a so called "linking"- step. This is feasible because a user should have physical access to the app (the server) and the extension in a browser (the client) at the same time and place.

1. The user installs the extension in the brower
2. The user clicks on the extension's action button and select "Link with app"
3. A dialog opens which displays a unique identifier and a generated QR code 
4. The user opens the app on the mobile device and starts the server
5. The user clicks on "Link new device" and a new screen is shown
6. The app asks 
    1. for a human name of the new link (e.g. "My laptop")
    2. to scan the QR code presented by the browser extension
7. Once scanned, the app displays the same unique identifier as the extension
8. The user has to enter the IP, host name or handle displayed in the app in the related field in the extension and click on "Next" button
9. The app and the extension begin to process. When done, both show a linking confirmation with a fingerprint wich should be equal
10. If the user confirms equality on both ends, the link process is completed  


## Request a password for a website

1. The user browses a website which contains a username or password field or both and the extension marks this field with an "ANOTHERpass"-button
2. The user clicks on this button
3. The extension shows a dialog which:
   - says "Open the app and accept this request"
   - contains the configured IP address / hostname / handle (see "link" flow above)
   - also contains a shortened fingerprint
   - shows a timer which runs down beginning with 60s (the request will be aborted once the timer expires)
4. The extension polls every x seconds to the configured host and port 
5. The user opens the app and unlocks the vault
6. The user turns on the server (if not automatically when unlock the vault) by clicking on a new UI switch on top of the credential list
   - if turned on, the IP address / hostname is displayed and the new UI component is red to indicate a listening server!
7. The app takes the next polling request from the extension
8. A message is shown in the app to confirm an incoming request by the user
   - the message contains the linked client name and the sent website, like e.g. "'Home-PC' wants to know credentials for github.com. Accept / Deny"
   - the message also contains a short fingerprint for verification
9. The extension keeps polling until the user accepts or denies or cancels the request
10. The user compares the short fingerprint for equality and accepts or denies the incoming request
11. The app performs a UI search with the website as search string (like how it does today when Autofilling a browser password field)
12. The user either clicks on a credential or creates a new one (similar to Autofill flow)
13. As a result the app replies to the next incoming poll with the selected credential
14. The extension stops polling and decrypts the username and password and use them for the Autfilling


## Unlink an app

To delete a linked app in the extension:

1. The user clicks on the extension's action button and select "Unlink with ANOTHERpass app"
2. A confirmation dialog is shown to get user confirmation.
3. Once confirmed, the extension deletes
   - the ip/host details
   - all exchanged secret keys

## Unlink in the app

To delete a linked extension in the app

1. Go to "Manage linked extensions"
2. Select the link by the given name and click on the Trash-icon
   - The app deletes the stored
     - Web Identifier
     - all exchanged secret keys


# Security mechanisms

## Common communication between extension and app

Each communication is secured by two layers of encryption:


1. AES encryption of the payload (request and response body) with a changing 128/256 bit **Transport Key** (`TK`)
	* `TK` is derived from:
        *  a shared and on each side persisted 128/256 bit **Base Key** (`BK`)
        *  a randomnly generated 128/256 bit **One-Time Key** (`OTK`) 
        *  `TK` is derived/generated for each communication direction:
            *  request (extension to app): **Request Transport Key** --> `TKrq = SHA256(BK + OTKrq)`
            *  response (app to extension): **Response Transport Key** --> `TKrs = SHA256(BK + OTKrs + TKrq)`

1. RSA encryption of the **One-Time Keys** (`OTKn`)
    * since the `BK` is shared and known by each side, only the `OTK` must be sent to the peer
        * `OTKrq` is encrypted with the **Public Key of the app** (`PKapp`)
        * `OTKrs` is encrypted with the **Public Key of the extension** (`PKext`)

## Linking phase

Before common communication can happen, a few information must be exchanged between the extension and the app.

* **Public Keys** (`PKn`) must be exchanged
* **Base Key** (`BK`) must be exchanged
* Both `PKn` and `BK` are securely stored on each side.

Exchange happens through these steps:

1. The extension generates:
    * a temporary AES-128bit **Session Key** (`SK`) designated to secure the linking phase
    * the **extension-side RSA key pair** (4096bit, `PKext` and `PrivKext`, latter will never leave the extension)
    * the fingerprint of `PKext` (`F`)
1. The extension sends `SK` and `F` through a secure offline channel (QR code scan) to the app
1. The user initiates a HTTP request to the app by providing the app's IP or domain name. The extension submits following content encrypted with `SK`:
    * the **Extensions Public Key** `PKext` 
1. The app imports `PKext` and
    * verifies `PKext` with `F` to mitigate MITM key substitution (fails if not valid)
    * stores `PKext` for future communication
1. The app generates:
    * the **app-side RSA key pair** (`PKapp` and `PrivKapp`, latter will never leave the app)
    * the shared **Base Key** (`BK`) and stores it for future communication (either 128 or 256 bit, depending on the app's device)
    * a **One-Time Key** (`OTKrs`)
    * a **Transport Key** derived from the previous scanned **Session Key**, since `BK` is not yet known by the extension --> `TKrs = SHA256(SK + OTKrs)`
1. Now the app responds to the extension as described in "Common communication" but with a different **Transport Key**:
    * by using `PKext` to encrypt `OTKrs` (common behaviour)
    * using derived `TKrs` to encrypt the payload (common behaviour)
    * Payload contains:
        * `PKapp`
        * `BK`
1. The extension decrypts `OTKrs` with its `PrivKext` and derives the `TKrs` by using the `SK` (instead of `BK` in the common flow)
1. The extension stores the received `PKapp` and `BK` in the browser for later usage

## Security considerations

The two layers of encryption described above ensures resilience against at least one of the following scenarios:

### Man-in-the-Middle attacks

The communication between app and extension usually happens in a local network, but there is still a risk of malicious actors in the same network. For instance an attacker could have gained access to the local network and is able to sniff any network communication.

Mitigations:

  * Each communication is encrypted as described above
  * The `PKext` used to encrypt the `OTKrs` is confirmed by using a QR-code and a fingerprint `F`. Therefor all data encrypted with `PKext` can only be decrypted  by the extension, not by any man-in-the-middle.
  * For each link request and for each credential request a shortened fingerprint is promped to the user on both ends to confirm uniquenes. This ensures that `PKapp` is indeed the public key of the app, and not from a man-in-the-middle.

### Offline observers

Meant is an attacker who is able to capture the QR code during the linking phase, either through physical presense or through getting a screenshot of the QR-Code.

Mitigations:

  * If an attacker is able to capture `SK` they won't be able to read the `BK`, since it is encrypted with a `TKrs` derived and encrypted by `PKext`. 


### Leak of stored extension secret keys

In case an attacker is able to obtain all stored secret keys from the extensions (`BK`, `PrivKExt`), e.g. through a malware on the computer or by an malicious admin decoding the local browser storage, all previous and future communication from the app back to the extension could be revealed.

Mitigations:

   * To protect the reply-communication from the app back to the extension (which might contain fetched credentials), the app response is additionally encrypted with `TKrq`, which only lives in memory on the extension side and is never stored on any device.
   * Proposal: The extension stores all secret keys encrypted. This could be achieved by the user itself (encrypting their storage) or introducing another user password required to basically use the extension, or a way to use the users keychain somehow.

### Post-Quantum consideration

Consider RSA will be broken through Quantum Computing. If so, all encrypted data, even old recorded data, with the involved RSA keys are revealed.

Mitigations:

  * Also the `BK`  is required to decrypt the Transport Keys (`TKn`)
  * The `BK` is shared during the linking phase through a confirmed and secure channel (encrypted by `SK`, which only lived for a short time in memory). As long as `SK` was not leaked, the `BK` should be safe to decrypt the `TKn`.
  
 
 ### Conclusion

 As long as only one aspect is ever leaked, at least the critical communication back to the extension, which contains the passwords, can still be considered as secure. This also applies to recorded communications.

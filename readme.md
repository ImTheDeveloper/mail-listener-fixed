# Overview

Mail-listener-fixed library for node.js based on fixes from forks at mail-listener2. Get notification when new email arrived to inbox or when message metadata (e.g. flags) changes externally. Uses IMAP protocol.

We are using these libraries: [node-imap](https://github.com/mscdex/node-imap), [mailparser](https://github.com/andris9/mailparser).

## Quick Setup

View the test.js file for quick setup.

Includes also the auto reconnection example.

## Use

Run npm install mail-listener-fixed --save

```javascript

var MailListener = require("mail-listener-fixed");

var mailListener = new MailListener({
  username: "imap-username",
  password: "imap-password",
  host: "imap-host",
  port: 993, // imap port
  tls: true,
  connTimeout: 10000, // Default by node-imap
  authTimeout: 5000, // Default by node-imap,
  debug: console.log, // Or your custom function with only one incoming argument. Default: null
  tlsOptions: { rejectUnauthorized: false },
  mailbox: "INBOX", // mailbox to monitor
  searchFilter: ["UNSEEN", "FLAGGED"], // the search filter being used after an IDLE notification has been retrieved
  markSeen: true, // all fetched email willbe marked as seen and not fetched next time
  fetchUnreadOnStart: true, // use it only if you want to get all unread email on lib start. Default is `false`,
  mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
  attachments: true, // download attachments as they are encountered to the project directory
  attachmentOptions: { directory: "attachments/" } // specify a download directory for attachments
});

mailListener.start(); // start listening

// stop listening
//mailListener.stop();

mailListener.on("server:connected", function(){
  console.log("imapConnected");
});

mailListener.on("server:disconnected", function(){
  console.log("imapDisconnected");
});

mailListener.on("error", function(err){
  console.log(err);
});

mailListener.on("mail", function(mail, seqno, attributes){
  // do something with mail object including attachments
  console.log("emailParsed", mail);
  // mail processing code goes here
});

mailListener.on("attachment", function(attachment){
  console.log(attachment.path);
});

// it's possible to access imap object from node-imap library for performing additional actions. E.x.
mailListener.imap.move(:msguids, :mailboxes, function(){})

```

That's easy!

## Attachments
Attachments can be streamed or buffered. This feature is based on how [mailparser](https://github.com/andris9/mailparser#attachments) handles attachments.
Setting `attachments: true` will download attachments as buffer objects by default to the project directory.
A specific download directory may be specified by setting `attachmentOptions: { directory: "attachments/"}`.
Attachments may also be streamed using `attachmentOptions: { stream: "true"}`. The `"attachment"` event will be fired every time an attachment is encountered.
Refer to the [mailparser docs](https://github.com/andris9/mailparser#attachment-streaming) for specifics on how to stream attachments.


## License

MIT
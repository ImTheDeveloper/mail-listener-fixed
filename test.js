var MailListener = require("./");

var mailListener = new MailListener({
    username: "xxx",
    password: "xxx",
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    mailbox: "INBOX",
    markSeen: false,
    fetchUnreadOnStart: true,
    attachments: true,
    attachmentOptions: { directory: "attachments/" },
    debug: console.log,
});

mailListener.start();

mailListener.on("server:connected", function(){
    console.log("imapConnected");
});

mailListener.on("server:disconnected", function(){
    console.log("imapDisconnected");
    setTimeout(function() {
        console.log("Trying to establish imap connection again");
        mailListener.restart();
    }, 5* 1000);
});

mailListener.on("error", function(err){
    console.log(err);
});

mailListener.on("mail", function(mail) {
let now = new Date();
    console.log(`New mail received ${now} :` + JSON.stringify(mail));
});

mailListener.on("attachment", function(attachment){
    console.log(attachment);
});
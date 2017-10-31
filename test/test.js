import MailListener from '../src'

const listener = new MailListener({
    mailbox: "INBOX",
    markSeen: false,
    fetchOnStart: true,
    imapOptions: {
        host: 'imap.gmail.com',
        password: 'xxx',
        user: 'xxx',
        port: 993,
        tls: true,
        tlsOptions: {
            rejectUnauthorized: false
        }
    },
    attachmentOptions: {
        directory: "attachments/",
        download: true
    }
});

listener.on("attachment", (data) => {
    console.log(data);
});

listener.on("disconnected", () => {
    console.log("Disconnected");
});

listener.on("connected", () => {
    console.log("Connected");
});

listener.on("error", (err) => {
    console.log(err);
});

listener.on("mail", (mail) => {
    let now = new Date();
    console.log(`New mail received ${now}: ` + JSON.stringify(mail));
});

listener.start();

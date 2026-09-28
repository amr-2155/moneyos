export class ConsoleMailer {
    async send(message) {
        console.log(`[moneyos:mailer] To: ${message.to}`);
        console.log(`[moneyos:mailer] Subject: ${message.subject}`);
        console.log(`[moneyos:mailer] Body:\n${message.text}`);
    }
}
//# sourceMappingURL=mailer.js.map
const { Resend } = require('resend');
const resend = new Resend('re_8RCWickz_DRxMPkfKq4Z9nGocP4tbjB8E');

resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'hathamtest123@gmail.com',
  subject: 'Test Email',
  html: '<p>This is a test email from Resend API</p>'
}).then(console.log).catch(console.error);

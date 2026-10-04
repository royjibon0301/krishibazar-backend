// Railway (Free/Trial/Hobby) e SMTP bondho, tai HTTPS diye email pathai.
//
// Option A (domain lagbe na): Google Apps Script relay
//    MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET
// Option B (nijer verified domain thakle): Resend
//    RESEND_API_KEY + MAIL_FROM  (e.g. "KrishiBazar <noreply@yourdomain.com>")

async function sendMail(to, subject, text) {
  if (process.env.MAIL_WEBHOOK_URL) {
    const res = await fetch(process.env.MAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        secret: process.env.MAIL_WEBHOOK_SECRET,
        to,
        subject,
        body: text,
      }),
    });
    const out = (await res.text()).trim();
    if (!res.ok || out !== 'ok') {
      throw new Error('Mail webhook failed: ' + out.slice(0, 200));
    }
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'KrishiBazar <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) throw new Error('Resend failed: ' + (await res.text()).slice(0, 200));
    return;
  }

  throw new Error('Email service configure kora nei (MAIL_WEBHOOK_URL ba RESEND_API_KEY dorkar)');
}

module.exports = { sendMail };

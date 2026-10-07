// Explainable scam rules. Each rule: id, weight (0-100 contribution), test(text) -> matches[], and a plain reason.
// Philosophy: no black box. A person must be able to read WHY something was flagged.

const BRANDS = ['barclays', 'hsbc', 'lloyds', 'natwest', 'santander', 'monzo', 'revolut', 'paypal', 'amazon', 'hmrc', 'dhl', 'royalmail'];

// edit distance, used to catch look-alike domains like "barc1ays"
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const words = (re) => (text) => [...text.matchAll(re)].map((m) => m[0]);

export const RULES = [
  { id: 'urgency', weight: 20, reason: 'Scammers rush you so you do not stop to think.', test: words(/\b(urgent(ly)?|immediately|within 24 hours|final notice|act now|last warning|expires? today|suspended|locked)\b/gi) },
  { id: 'secrets', weight: 35, reason: 'Real banks never ask for your PIN, full password or one-time code.', test: words(/\b(pin|password|one[- ]time (code|passcode)|otp|security code|cvv|verification code)\b/gi) },
  { id: 'payment-method', weight: 30, reason: 'Gift cards, crypto and wire transfers are hard to reverse, so scammers love them.', test: words(/\b(gift ?cards?|itunes|bitcoin|crypto|western union|wire transfer|bank transfer)\b/gi) },
  { id: 'money-promise', weight: 25, reason: 'Promises of easy money, prizes or refunds you did not expect are a classic lure.', test: words(/\b(you('| ha)ve won|prize|lottery|refund (of|due)|inheritance|guaranteed (returns?|profit)|double your)\b/gi) },
  { id: 'secrecy', weight: 20, reason: 'Being told to keep it secret stops friends or family from warning you.', test: words(/\b(do not tell|don't tell|keep this (private|secret)|confidential)\b/gi) },
  { id: 'short-link', weight: 20, reason: 'Short links hide where you are really going.', test: words(/\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|rb\.gy|cutt\.ly|is\.gd)\/\S+/gi) },
  { id: 'ip-link', weight: 25, reason: 'A link made of numbers instead of a name is rarely a real company.', test: words(/https?:\/\/\d{1,3}(\.\d{1,3}){3}\S*/gi) },
  {
    id: 'lookalike',
    weight: 40,
    reason: 'The web address imitates a real brand but is not the real one.',
    test: (text) => {
      const hits = [];
      for (const m of text.matchAll(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
        const host = m[1].toLowerCase();
        const label = host.split('.').slice(-2, -1)[0] ?? '';
        const sub = host.replace(/[^a-z0-9]/g, '');
        for (const b of BRANDS) {
          const fake = (label !== b && distance(label, b) <= 2 && label.length >= 4) || (sub.includes(b) && !host.endsWith(`${b}.com`) && !host.endsWith(`${b}.co.uk`) && !host.endsWith(`${b}.gov.uk`));
          if (fake) hits.push(m[0]);
        }
      }
      return [...new Set(hits)];
    },
  },
  { id: 'impersonation', weight: 15, reason: 'Claims to be from a bank, tax office or courier. Always contact them using the number on their official website instead.', test: words(/\b(your bank|fraud (team|department)|hmrc|tax (rebate|office)|royal mail|dhl|courier|amazon prime)\b/gi) },
];

export function analyse(text) {
  const findings = RULES.map((r) => ({ id: r.id, weight: r.weight, reason: r.reason, matches: r.test(text) })).filter((f) => f.matches.length);
  // diminishing returns so one repeated word does not max out the score
  const raw = findings.reduce((n, f) => n + f.weight, 0);
  const score = Math.min(100, Math.round(raw * (findings.length > 2 ? 1 : 0.9)));
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, level, findings };
}

export const ADVICE = {
  high: ['Do not reply, click links or share codes.', 'Contact the real company using the number on their official website or the back of your card.', 'Report it: forward texts to 7726 and emails to report@phishing.gov.uk (UK).', 'If you already paid or shared details, call your bank straight away.'],
  medium: ['Pause. Do not act on the message yet.', 'Check the sender through another channel, such as the official app.', 'Never click links in messages you did not expect.'],
  low: ['No obvious warning signs, but stay careful.', 'If anything feels off, trust your instincts and verify with the company directly.'],
};

export const SAMPLES = [
  { label: 'Bank text', text: 'URGENT: Your Barclays account has been suspended. Verify your PIN and security code now at http://barc1ays-secure-login.com/verify or your account will be locked within 24 hours.' },
  { label: 'Parcel text', text: 'Royal Mail: your parcel is held. Pay the £1.45 redelivery fee at bit.ly/3xParcel within 24 hours.' },
  { label: 'Investment DM', text: 'Join our crypto group. Guaranteed returns, double your money in 7 days. Do not tell your family, it is confidential.' },
  { label: 'Normal message', text: 'Hi Amara, your appointment on Friday at 3pm is confirmed. Reply YES to confirm or call us on the number on our website.' },
];

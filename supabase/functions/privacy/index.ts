// Edge Function: privacy
//
// Serves the MeeCrowd privacy policy as proper text/html. We host this in
// an Edge Function rather than in Supabase Storage because Storage forces
// `text/plain` on user-uploaded HTML (anti-XSS measure), which would make
// the page render as raw source in browsers and fail Meta's review.
//
// URL: https://<project>.supabase.co/functions/v1/privacy

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MeeCrowd — Privacy Policy</title>
  <style>
    :root {
      --bg: #0c0c12; --surface: #15151f; --text: #e8e8ec;
      --muted: #9ca3af; --accent: #7c3aed; --border: #25252f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.65;
      padding: 48px 20px;
    }
    .wrap {
      max-width: 720px; margin: 0 auto;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 40px 36px;
    }
    h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.01em; }
    .updated { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
    h2 {
      margin: 32px 0 8px; font-size: 16px;
      letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent);
    }
    p, li { color: var(--text); margin: 8px 0; }
    ul { padding-left: 20px; }
    a { color: var(--accent); }
    .footer {
      margin-top: 40px; padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 13px; color: var(--muted); text-align: center;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>MeeCrowd — Privacy Policy</h1>
    <p class="updated">Last updated: May 5, 2026</p>

    <p>This Privacy Policy explains how MeeCrowd ("we", "us") collects, uses, and protects information when you use our application.</p>

    <h2>1. Who we are</h2>
    <p>MeeCrowd is a creator-focused social platform that lets users connect their existing social media accounts to bring their content into a unified profile. The app is operated by Jaime Sanzipar.</p>
    <p>Contact: <a href="mailto:j.sanzipar@outlook.com">j.sanzipar@outlook.com</a></p>

    <h2>2. Information we collect</h2>
    <p>When you use MeeCrowd we may collect:</p>
    <ul>
      <li>Account information you provide directly: display name, username, email address, profile photo, biography.</li>
      <li>Authentication tokens you grant us via OAuth when you connect an external platform (YouTube, Twitch, Kick, Instagram, Facebook, TikTok, X, LinkedIn). These tokens let us read public information from those accounts on your behalf.</li>
      <li>Public content from connected platforms: video metadata, captions, thumbnails, view counts, comments, channel statistics. We only access content the connected platform makes available to your granted scopes.</li>
      <li>Standard application logs (IP address, device type, timestamps) used to operate and secure the service.</li>
    </ul>

    <h2>3. How we use information</h2>
    <p>We use the information to:</p>
    <ul>
      <li>Display your content on your MeeCrowd profile.</li>
      <li>Aggregate engagement statistics across the platforms you connect.</li>
      <li>Surface live and recent content to people who follow you on MeeCrowd.</li>
      <li>Operate, monitor, and improve the service.</li>
    </ul>
    <p>We do <strong>not</strong> sell personal information, and we do <strong>not</strong> use it for advertising or behavioral targeting.</p>

    <h2>4. Sharing with third parties</h2>
    <p>We share information with service providers only to operate the service:</p>
    <ul>
      <li>Supabase (database and authentication)</li>
      <li>The connected platforms themselves, when you initiate an OAuth flow with them.</li>
    </ul>
    <p>We do not share information with advertisers or data brokers.</p>

    <h2>5. Data retention</h2>
    <p>We retain account and content data for as long as your account is active. You can request deletion of your account and all associated data at any time by emailing us at the address above. Deletions are processed within 30 days.</p>

    <h2>6. Your rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>Access the personal data we hold about you.</li>
      <li>Correct or update inaccurate data.</li>
      <li>Request deletion of your account and associated data.</li>
      <li>Disconnect any linked platform at any time from in-app settings, which revokes our access to that platform.</li>
    </ul>

    <h2>7. Security</h2>
    <p>We protect data with TLS in transit, encryption at rest, and strict access controls on credentials. No system is perfectly secure, but we work to follow industry best practices.</p>

    <h2>8. Children</h2>
    <p>MeeCrowd is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

    <h2>9. Changes</h2>
    <p>We may update this Privacy Policy. We will post the updated version at the same URL with a new "Last updated" date.</p>

    <h2>10. Contact</h2>
    <p>For privacy questions or deletion requests, email us at <a href="mailto:j.sanzipar@outlook.com">j.sanzipar@outlook.com</a>.</p>

    <div class="footer">© 2026 MeeCrowd · <a href="mailto:j.sanzipar@outlook.com">j.sanzipar@outlook.com</a></div>
  </main>
</body>
</html>`;

Deno.serve(() =>
  new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  }),
);

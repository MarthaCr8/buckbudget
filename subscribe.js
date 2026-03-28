// ============================================================
//  BuckBudget — Netlify Serverless Function
//  File:    subscribe.js
//  Deploy to: netlify/functions/subscribe.js
//             (create that folder path at your Netlify site root)
//
//  What it does:
//    Receives a name + email from BuckBudget's onboarding screen
//    and adds the user to your Mailchimp audience list.
//    The API key never touches your HTML file — it lives here,
//    pulled securely from Netlify's environment variables.
//
//  Environment variables required (set in Netlify dashboard):
//    MAILCHIMP_API_KEY     — your full API key e.g. abc123def456-us21
//    MAILCHIMP_AUDIENCE_ID — your audience/list ID e.g. a1b2c3d4e5
// ============================================================

exports.handler = async function(event, context) {

  // ── 1. Only allow POST requests ──────────────────────────
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  // ── 2. Parse the request body ────────────────────────────
  let name, email;
  try {
    const body = JSON.parse(event.body);
    name  = (body.name  || '').trim();
    email = (body.email || '').trim().toLowerCase();
  } catch(e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body. Expected JSON with name and email.' })
    };
  }

  // ── 3. Validate the email ────────────────────────────────
  if (!email || !email.includes('@') || !email.includes('.')) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'A valid email address is required.' })
    };
  }

  // ── 4. Pull credentials from Netlify environment variables
  //       (you set these in: Netlify dashboard → Site config → Environment variables)
  const API_KEY     = process.env.MAILCHIMP_API_KEY;
  const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;

  // Safety check — if env vars aren't set yet, fail with a clear message
  if (!API_KEY || !AUDIENCE_ID) {
    console.error('BuckBudget subscribe.js: Missing MAILCHIMP_API_KEY or MAILCHIMP_AUDIENCE_ID environment variable.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfiguration — environment variables not set.' })
    };
  }

  // Extract the data center from the API key (the part after the dash, e.g. "us21")
  const DC = API_KEY.split('-')[1];
  if (!DC) {
    console.error('BuckBudget subscribe.js: Could not parse data center from API key. Make sure key includes the -usXX suffix.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid API key format.' })
    };
  }

  // ── 5. Build the Mailchimp API request ───────────────────
  const mailchimpUrl = `https://${DC}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members`;

  const payload = {
    email_address: email,
    status: 'subscribed',          // 'subscribed' adds directly; use 'pending' for double opt-in
    merge_fields: {
      FNAME: name || '',           // First name — maps to the FNAME merge tag in Mailchimp
    },
    tags: ['BuckBudget App']       // Automatically tags every subscriber so you know they came from the app
  };

  // Mailchimp uses HTTP Basic Auth: any string as username, API key as password
  const authHeader = 'Basic ' + Buffer.from('buckbudget:' + API_KEY).toString('base64');

  // ── 6. Call the Mailchimp API ────────────────────────────
  let mailchimpResponse, mailchimpData;
  try {
    mailchimpResponse = await fetch(mailchimpUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    mailchimpData = await mailchimpResponse.json();
  } catch(networkErr) {
    // Network-level failure (Mailchimp unreachable, DNS issue, etc.)
    console.error('BuckBudget subscribe.js: Network error calling Mailchimp:', networkErr.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not reach Mailchimp. Try again later.' })
    };
  }

  // ── 7. Handle Mailchimp's response ──────────────────────
  const status = mailchimpResponse.status;

  if (status === 200 || status === 201) {
    // ✅ Successfully added to list
    console.log(`BuckBudget: Subscribed ${email} to Mailchimp list.`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Subscribed successfully.' })
    };
  }

  if (status === 400 && mailchimpData.title === 'Member Exists') {
    // User is already on the list — treat as success so UX doesn't break
    console.log(`BuckBudget: ${email} already exists in Mailchimp list.`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, existing: true, message: 'Already subscribed.' })
    };
  }

  if (status === 400 && mailchimpData.title === 'Forgotten Email Not Subscribed') {
    // User previously unsubscribed and asked Mailchimp to forget them (GDPR)
    // We must respect this — do not re-add them
    console.log(`BuckBudget: ${email} has requested to be forgotten — not re-adding.`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      // Return success so app UX is unaffected, but don't re-subscribe them
      body: JSON.stringify({ success: true, forgotten: true })
    };
  }

  // Any other Mailchimp error (invalid audience ID, API key wrong, etc.)
  console.error('BuckBudget subscribe.js: Mailchimp API error:', status, mailchimpData);
  return {
    statusCode: status || 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: mailchimpData.detail || mailchimpData.title || 'Mailchimp error',
      mailchimp_status: status
    })
  };
};

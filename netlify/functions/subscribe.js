exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed. Use POST.' }) };
  }
  let name, email;
  try {
    const body = JSON.parse(event.body);
    name  = (body.name  || '').trim();
    email = (body.email || '').trim().toLowerCase();
  } catch(e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }
  if (!email || !email.includes('@') || !email.includes('.')) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'A valid email address is required.' }) };
  }
  const API_KEY     = process.env.MAILCHIMP_API_KEY;
  const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!API_KEY || !AUDIENCE_ID) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server misconfiguration.' }) };
  }
  const DC = API_KEY.split('-')[1];
  const authHeader = 'Basic ' + Buffer.from('buckbudget:' + API_KEY).toString('base64');
  const payload = { email_address: email, status: 'subscribed', merge_fields: { FNAME: name }, tags: ['BuckBudget App'] };
  let mailchimpResponse, mailchimpData;
  try {
    mailchimpResponse = await fetch(`https://${DC}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    mailchimpData = await mailchimpResponse.json();
  } catch(networkErr) {
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Could not reach Mailchimp.' }) };
  }
  const status = mailchimpResponse.status;
  if (status === 200 || status === 201) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
  }
  if (status === 400 && mailchimpData.title === 'Member Exists') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, existing: true }) };
  }
  return { statusCode: status || 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: mailchimpData.detail || 'Mailchimp error' }) };
};

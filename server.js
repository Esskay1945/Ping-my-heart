const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage
const linkStore = new Map();

// Send email via Resend API (delivers to Gmail!)
async function sendEmailToGmail(toEmail, subject, html, text) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Date Invite <onboarding@resend.dev>',
      to: [toEmail],
      subject: subject,
      html: html,
      text: text
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Email failed: ${error.message}`);
  }

  return await response.json();
}

// Verify on startup
(async () => {
  if (process.env.RESEND_API_KEY) {
    console.log('✅ Resend API configured - emails will be sent to Gmail inbox');
  } else {
    console.log('⚠️  RESEND_API_KEY not set - Get one at https://resend.com');
  }
})();

// Generate link endpoint
app.post('/api/generate-link', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const linkId = nanoid(10);
    const linkData = {
      id: linkId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    linkStore.set(linkId, linkData);

    console.log('✅ Generated link:', linkId);
    console.log('📊 Total links in storage:', linkStore.size);

    res.json({ 
      linkId,
      message: 'Link generated successfully!'
    });

  } catch (error) {
    console.error('Error generating link:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Get link endpoint
app.get('/api/get-link', async (req, res) => {
  try {
    const linkId = req.query.id;

    if (!linkId) {
      return res.status(400).json({ error: 'Link ID is required' });
    }

    const linkData = linkStore.get(linkId);

    if (!linkData) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    if (new Date(linkData.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    res.json({
      name: linkData.name,
      email: linkData.email
    });

  } catch (error) {
    console.error('Error fetching link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send notification endpoint
app.post('/api/send-notification', async (req, res) => {
  try {
    const { linkId, response, email, name } = req.body;

    if (!linkId || !response || !email || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (response !== 'yes' && response !== 'no') {
      return res.status(400).json({ error: 'Invalid response value' });
    }

    const isYes = response === 'yes';
    const subject = isYes ? `💖 ${name} Said YES!` : `💔 ${name} Said No`;
    const text = isYes 
      ? `Great news! ${name} accepted your date invite! 💕\n\nTime to plan that perfect date! 🥰`
      : `${name} clicked the No button after 20 attempts... but don't worry, the right person is out there! 💪`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: linear-gradient(135deg, #ffdde1, #ee9ca7);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          }
          h1 {
            color: #b30059;
            font-size: 2rem;
            margin-bottom: 20px;
            text-align: center;
          }
          .message {
            background: white;
            padding: 30px;
            border-radius: 15px;
            font-size: 1.1rem;
            color: #333;
            line-height: 1.6;
          }
          .emoji {
            font-size: 4rem;
            text-align: center;
            margin: 20px 0;
          }
          .timestamp {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #ffdde1;
            color: #666;
            font-size: 0.9rem;
            text-align: center;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #b30059;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">${isYes ? '🎉' : '😢'}</div>
          <h1>${subject}</h1>
          <div class="message">
            <p>${text}</p>
            <div class="timestamp">
              📅 ${new Date().toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
          <div class="footer">
            Made with ❤️ by Ping My Heart
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('📧 Sending email to Gmail inbox:', email);
    
    await sendEmailToGmail(email, subject, html, text);
    console.log('✅ Email delivered to Gmail!');

    const linkData = linkStore.get(linkId);
    if (linkData) {
      linkData.response = response;
      linkData.respondedAt = new Date().toISOString();
      linkStore.set(linkId, linkData);
    }

    res.json({ 
      success: true,
      message: 'Email sent to your Gmail inbox!'
    });

  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message
    });
  }
});

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/date.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'date.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email delivery: Resend → Gmail Inbox`);
  console.log(`🔑 Get your API key at: https://resend.com/api-keys`);
  console.log(`   RESEND_API_KEY=${process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing'}`);
});

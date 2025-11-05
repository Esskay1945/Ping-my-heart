const express = require('express');
const nodemailer = require('nodemailer');
const { nanoid } = require('nanoid');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (replace with database in production)
const linkStore = new Map();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// Generate link endpoint
app.post('/api/generate-link', async (req, res) => {
  try {
    const { email, name } = req.body;

    // Validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate unique link ID
    const linkId = nanoid(10);

    // Store link data
    const linkData = {
      id: linkId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    linkStore.set(linkId, linkData);

    console.log('✅ Generated link:', linkId); // Debug log
    console.log('📊 Total links in storage:', linkStore.size); // Debug log

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

    // Check if link is expired
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

    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: subject,
      text: text,
      html: `
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
              Made with ❤️ by your Cute Date Invite system
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    // Update link data with response
    const linkData = linkStore.get(linkId);
    if (linkData) {
      linkData.response = response;
      linkData.respondedAt = new Date().toISOString();
      linkStore.set(linkId, linkData);
    }

    res.json({ 
      success: true,
      message: 'Notification sent successfully!'
    });

  } catch (error) {
    console.error('Error sending notification:', error);
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
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📧 Make sure to set EMAIL_USER and EMAIL_PASS environment variables`);

});

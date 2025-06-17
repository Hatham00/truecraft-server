require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Resend } = require('resend');
const path = require('path');
const archiver = require('archiver');
const stream = require('stream');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors({
  origin: [
    'https://www.test123hatham.com',
    'https://truecraft-frontend.onrender.com'
  ]
}));

// Serve static files (optional React build support)
const DIST_DIR = path.join(__dirname, '../frontend/build');
app.use(express.static(DIST_DIR));
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// Memory storage for uploads
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Use environment variable for Resend API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to convert stream to buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Log file submissions
function logSubmission(entry) {
  fs.appendFileSync('uploads-log.jsonl', JSON.stringify(entry) + '\n');
}

// Admin route to view logs
app.get('/admin', (req, res) => {
  try {
    const data = fs.readFileSync('uploads-log.jsonl', 'utf-8')
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    res.json(data);
  } catch (err) {
    res.status(500).send('Error reading log');
  }
});

// File upload endpoint
app.post('/upload', upload.array('file', 10), async (req, res) => {
  console.log('📥 Upload endpoint hit');

  const { name, email } = req.body;
  const files = req.files;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!files || files.length === 0) {
    console.log('❌ No files uploaded');
    return res.status(400).send('No files uploaded');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveStream = new stream.PassThrough();
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(archiveStream);
  files.forEach(f => archive.append(f.buffer, { name: f.originalname }));
  archive.finalize();

  try {
    const zipBuffer = await streamToBuffer(archiveStream);
    const zipBase64 = zipBuffer.toString('base64');
    const zipName = `design-uploads-${timestamp}.zip`;

    const previewFile = files.find(f => f.mimetype.startsWith('image/'));
    const previewUrl = previewFile
      ? `data:${previewFile.mimetype};base64,${previewFile.buffer.toString('base64')}`
      : null;

    logSubmission({ name, email, ip, timestamp, fileCount: files.length });

    await resend.emails.send({
      from: 'noreply@test123hatham.com',
      to: 'hathamtest123@gmail.com',
      subject: `New Design Upload from ${name}`,
      html: `
        <div style="font-family: Arial; color: #333; max-width:600px;margin:auto;">
          <h2 style="color:#2E86C1;">📐 New Design Upload</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>IP:</strong> ${ip}</p>
          <p><strong>Time:</strong> ${timestamp}</p>
          <p><strong>Files:</strong> ${files.length}</p>
          ${previewUrl ? `<div style="margin-top:20px;"><strong>Preview:</strong><br><img src="${previewUrl}" style="max-width:100%;border:1px solid #ddd;border-radius:4px;padding:4px;"></div>` : ''}
          <hr style="margin:30px 0;border:none;border-top:1px solid #ccc;">
          <p style="font-size:14px;color:#777;">Uploaded via TrueCraft Nashville form.</p>
        </div>
      `,
      attachments: [{
        filename: zipName,
        content: zipBase64,
        contentType: 'application/zip',
        encoding: 'base64',
        disposition: 'attachment',
      }]
    });

    await resend.emails.send({
      from: 'noreply@test123hatham.com',
      to: email,
      subject: '✅ Your Design Upload Was Received',
      html: `
        <div style="font-family: Arial; color: #333; max-width:600px;margin:auto;">
          <h2 style="color:#27AE60;">Thanks for Your Submission</h2>
          <p>Hi ${name},</p>
          <p>We received your design and will review it soon. If needed, we’ll reach out at ${email}.</p>
          <br><p>Warm regards,<br>TrueCraft Nashville Team</p>
          <hr style="margin:30px 0;border:none;border-top:1px solid #ccc;">
          <p style="font-size:14px;color:#777;">Confirmation of receipt of your files.</p>
        </div>
      `
    });

    console.log('✅ Emails sent!');
    res.status(200).json({ message: 'Emails sent!' });
  } catch (err) {
    console.error('❌ Email error:', err);
    res.status(500).json({ error: 'Email sending failed.' });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

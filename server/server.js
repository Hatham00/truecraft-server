const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Resend } = require('resend');
const path = require('path');
const archiver = require('archiver');
const stream = require('stream');
const fs = require('fs');

const app = express();
const port = 3000;

// Enable CORS
app.use(cors());

// Memory storage for uploaded files
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Resend
const resend = new Resend('re_8RCWickz_DRxMPkfKq4Z9nGocP4tbjB8E');

// Helper: convert stream to buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Save log entries
function logSubmission(entry) {
  const logLine = JSON.stringify(entry) + '\n';
  fs.appendFileSync('uploads-log.jsonl', logLine);
}

// Admin route to list uploads
app.get('/admin', (req, res) => {
  try {
    const data = fs.readFileSync('uploads-log.jsonl', 'utf-8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    res.json(data);
  } catch (err) {
    res.status(500).send('Error reading log');
  }
});

// Upload endpoint for multiple files
app.post('/upload', upload.array('file', 10), async (req, res) => {
  console.log('📥 Upload endpoint hit');

  const { name, email } = req.body;
  const files = req.files;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!files || files.length === 0) {
    console.log('❌ No files uploaded');
    return res.status(400).send('No files uploaded');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Create zip archive in memory
  const archiveStream = new stream.PassThrough();
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(archiveStream);

  files.forEach((file) => {
    archive.append(file.buffer, { name: file.originalname });
  });
  archive.finalize();

  try {
    const zipBuffer = await streamToBuffer(archiveStream);
    const zipBase64 = zipBuffer.toString('base64');
    const zipName = `design-uploads-${timestamp}.zip`;

    const previewFile = files.find(f => f.mimetype.startsWith('image/'));
    const previewBase64 = previewFile ? previewFile.buffer.toString('base64') : null;
    const previewUrl = previewBase64 ? `data:${previewFile.mimetype};base64,${previewBase64}` : null;

    // Log submission
    logSubmission({ name, email, ip, timestamp, fileCount: files.length });

    // Send email to business
    await resend.emails.send({
      from: 'noreply@test123hatham.com',
      to: 'hathamtest123@gmail.com',
      subject: `New Design Upload from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
          <h2 style="color: #2E86C1;">📐 New Design Upload</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>IP Address:</strong> ${ip}</p>
          <p><strong>Upload Time:</strong> ${timestamp}</p>
          <p><strong>Total Files Uploaded:</strong> ${files.length}</p>
          ${previewUrl ? `<div style="margin-top: 20px;"><strong>Preview:</strong><br><img src="${previewUrl}" alt="Preview" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px; padding: 4px;"></div>` : ''}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ccc;">
          <p style="font-size: 14px; color: #777;">This file was uploaded via the TrueCraft Nashville design form.</p>
        </div>
      `,
      attachments: [
        {
          filename: zipName,
          content: zipBase64,
          contentType: 'application/zip',
          encoding: 'base64',
          disposition: 'attachment'
        }
      ]
    });

    // Send confirmation to user
    await resend.emails.send({
      from: 'noreply@test123hatham.com',
      to: email,
      subject: '✅ Your Design Upload Was Received',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
          <h2 style="color: #27AE60;">Thanks for Your Submission</h2>
          <p>Hi ${name},</p>
          <p>Thank you for uploading your design to TrueCraft Nashville. We've received your submission and will review it shortly.</p>
          <p>If we have any questions or need more details, we’ll reach out to you at <strong>${email}</strong>.</p>
          <p>We appreciate your interest in working with TrueCraft!</p>
          <br>
          <p>Warm regards,<br>TrueCraft Nashville Team</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ccc;">
          <p style="font-size: 14px; color: #777;">This is a confirmation that your design files were successfully received.</p>
        </div>
      `
    });

    console.log('✅ Emails sent!');
    res.status(200).json({ message: '✅ Emails sent!' });
  } catch (error) {
    console.error('❌ Email error:', error);
    res.status(500).json({ error: 'Email sending failed.' });
  }
});

// Start server for GitHub Codespaces compatibility
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

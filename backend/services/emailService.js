const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Reads and validates Brevo configuration from environment variables.
 */
function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "BREVO_API_KEY is missing. Please set BREVO_API_KEY in your backend .env file."
    );
  }
  if (!senderEmail || senderEmail.trim() === "") {
    throw new Error(
      "BREVO_SENDER_EMAIL is missing. Use the sender email verified in your Brevo account."
    );
  }

  return {
    apiKey: apiKey.trim(),
    senderEmail: senderEmail.trim(),
    senderName: (
      process.env.BREVO_SENDER_NAME ||
      process.env.APP_NAME ||
      "Chat App"
    ).trim(),
  };
}

/**
 * Escapes user-controlled text before placing it inside HTML.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates an accessible, responsive HTML email template for OTP verification.
 *
 * @param {string} username - Recipient's display name or username.
 * @param {string} otp - 6-digit one-time verification password.
 * @param {string} appName - Name of the application.
 * @returns {string} Fully styled HTML email string.
 */
function generateEmailTemplate(username, otp, appName) {
  const safeUsername = escapeHtml(username || "there");
  const safeAppName = escapeHtml(appName);
  const safeOtp = escapeHtml(otp);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - ${safeAppName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0e1621;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f5f5f5;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 560px;
      margin: 30px auto;
      background-color: #17212b;
      border: 1px solid #242f3d;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }
    .header {
      background-color: #17212b;
      padding: 32px 32px 16px 32px;
      text-align: center;
      border-bottom: 1px solid #242f3d;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background-color: #2AABEE;
      border-radius: 50%;
      margin-bottom: 14px;
    }
    .logo-svg {
      width: 30px;
      height: 30px;
      fill: #ffffff;
    }
    .app-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 14px;
    }
    .description {
      font-size: 15px;
      line-height: 1.6;
      color: #a0acba;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .otp-wrapper {
      background-color: #0e1621;
      border: 1px solid #2b5278;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin: 28px 0;
    }
    .otp-code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 38px;
      font-weight: 700;
      letter-spacing: 10px;
      color: #2AABEE;
      margin: 0;
      padding-left: 10px; /* Offset letter-spacing */
      user-select: all;
    }
    .otp-instruction {
      margin-top: 10px;
      margin-bottom: 0;
      font-size: 13px;
      color: #7d8b99;
    }
    .notice-box {
      background-color: rgba(42, 171, 238, 0.08);
      border-left: 4px solid #2AABEE;
      border-radius: 4px;
      padding: 14px 16px;
      margin: 24px 0;
    }
    .notice-box p {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: #cbd5e1;
    }
    .security-warning {
      font-size: 13px;
      line-height: 1.5;
      color: #7d8b99;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #242f3d;
    }
    .footer {
      padding: 20px 32px;
      background-color: #111a24;
      text-align: center;
      font-size: 12px;
      color: #556575;
      border-top: 1px solid #1c2734;
    }
    @media (max-width: 600px) {
      .container {
        margin: 10px;
        border-radius: 12px;
      }
      .content, .header {
        padding: 24px 20px;
      }
      .otp-code {
        font-size: 30px;
        letter-spacing: 6px;
        padding-left: 6px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-badge">
        <svg class="logo-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3 .97 4.29L2 22l5.71-.97C9 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.67-.36-3.79-.98l-.27-.16-2.85.48.48-2.85-.16-.27C5.36 14.67 5 13.38 5 12c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </div>
      <h1 class="app-title">${safeAppName}</h1>
    </div>

    <div class="content">
      <h2 class="greeting">Hello ${safeUsername},</h2>
      <p class="description">
        Thank you for joining <strong>${safeAppName}</strong>. To complete your registration and secure your account, please enter the one-time verification code below:
      </p>

      <div class="otp-wrapper">
        <p class="otp-code">${safeOtp}</p>
        <p class="otp-instruction">Enter this 6-digit code on the verification screen.</p>
      </div>

      <div class="notice-box">
        <p><strong>Notice:</strong> This code is valid for <strong>10 minutes</strong>. Once expired, you will need to request a new code.</p>
      </div>

      <p class="security-warning">
        <strong>Security Notice:</strong> Never share this code with anyone. Our team will never ask for your verification code. If you did not attempt to sign up, please disregard this email.
      </p>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${safeAppName}. All rights reserved.</p>
      <p>This is an automated system notification. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends a 6-digit OTP verification email via Brevo (Transactional Email API).
 *
 * @param {Object} params
 * @param {string} params.email - Recipient email address.
 * @param {string} [params.username] - Recipient username or display name.
 * @param {string} params.otp - 6-digit OTP string.
 * @returns {Promise<{ success: boolean, messageId: string }>}
 */
async function sendVerificationOtpEmail({ email, username, otp }) {
  if (!email) {
    throw new Error("Recipient email is required to send verification code.");
  }
  if (!otp || String(otp).length !== 6) {
    throw new Error("A valid 6-digit OTP is required.");
  }

  const { apiKey, senderEmail, senderName } = getBrevoConfig();
  const appName = process.env.APP_NAME || "Chat App";
  const toEmail = email.toLowerCase().trim();

  const subject = `Verify Your Email - ${appName}`;
  const html = generateEmailTemplate(username || "there", otp, appName);
  const text = `Welcome to ${appName}!\n\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nSecurity Notice: Never share this code with anyone. If you did not request this code, please ignore this email.`;

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("❌ Brevo API Error:", response.status, data);
      throw new Error(
        data.message || `Brevo API failed with status ${response.status}`
      );
    }

    if (!data.messageId) {
      throw new Error("Brevo did not return a message ID confirming delivery.");
    }

    console.log(
      `✉️ Verification OTP email sent to ${toEmail} (ID: ${data.messageId})`
    );
    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (err) {
    console.error(
      `❌ Failed to send verification email to ${toEmail}:`,
      err.message
    );
    throw err;
  }
}

module.exports = {
  sendVerificationOtpEmail,
  generateEmailTemplate,
};
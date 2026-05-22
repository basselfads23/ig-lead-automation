const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { initDb, dbRun, dbAll, dbGet } = require('./db');
const {
  sendInstagramDM,
  replyToInstagramComment,
  sendFacebookDM,
  replyToFacebookComment
} = require('./metaApi');
const {
  sendTikTokDM,
  replyToTikTokComment
} = require('./tiktokApi');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the React app (port 3000) can interact with it
app.use(cors());
app.use(express.json());

// Initialize Database on Startup
initDb().then(() => {
  console.log('Database initialized successfully.');
}).catch(err => {
  console.error('Error during database initialization:', err);
});

// ==========================================
// CORE WORKFLOW PROCESSING ENGINE
// ==========================================
/**
 * Processes incoming social media actions (comments and DMs) from IG, FB, and TikTok.
 * This is used for BOTH actual live webhooks and sandbox visual simulator inputs.
 */
async function processSocialEvent({ channel, sourceType, platformUserId, username, text, eventId, extraId }) {
  const normalizedText = text.trim();
  const lowerText = normalizedText.toLowerCase();

  // 1. Log raw incoming trigger
  await dbRun(
    `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
    [channel, sourceType === 'comment' ? 'comment_received' : 'dm_received', username, `Received ${sourceType}: "${normalizedText}"`, 'success']
  );

  // 2. Scan active keyword rules
  const activeRules = await dbAll('SELECT * FROM rules WHERE is_active = 1');
  let matchedRule = null;

  for (const rule of activeRules) {
    const keyword = rule.keyword.toLowerCase();
    // Match rule if the word is in the message/comment (supports substring matches like "Send me the PDF please")
    if (lowerText.includes(keyword)) {
      if (rule.channel === 'all' || rule.channel === channel) {
        matchedRule = rule;
        break;
      }
    }
  }

  if (!matchedRule) {
    await dbRun(
      `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
      [channel, 'system', username, `No matching keyword rule found for text: "${normalizedText}"`, 'info']
    );
    return { matched: false };
  }

  const keyword = matchedRule.keyword;
  const dmMessage = matchedRule.dm_message;
  const commentReply = matchedRule.comment_reply;

  let commentReplyStatus = 'skipped';
  let dmStatus = 'failed';

  // 3. Process Comment Reply automation
  if (sourceType === 'comment' && commentReply) {
    try {
      if (channel === 'instagram') {
        await replyToInstagramComment(eventId, commentReply);
      } else if (channel === 'facebook') {
        await replyToFacebookComment(eventId, commentReply);
      } else if (channel === 'tiktok') {
        await replyToTikTokComment(extraId || 'video_123', eventId, commentReply);
      }
      commentReplyStatus = 'success';
      await dbRun(
        `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
        [channel, 'reply_sent', username, `Automated reply to comment "${commentReply}" (Comment ID: ${eventId})`, 'success']
      );
    } catch (err) {
      commentReplyStatus = 'failed';
      await dbRun(
        `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
        [channel, 'error', username, `Failed to reply to comment ${eventId}: ${err.message}`, 'failed']
      );
    }
  }

  // 4. Process Direct Message (DM) automation
  try {
    if (channel === 'instagram') {
      await sendInstagramDM(platformUserId, dmMessage);
    } else if (channel === 'facebook') {
      await sendFacebookDM(platformUserId, dmMessage);
    } else if (channel === 'tiktok') {
      await sendTikTokDM(platformUserId, dmMessage);
    }
    dmStatus = 'success';
    await dbRun(
      `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
      [channel, 'reply_sent', username, `Automated DM sent: "${dmMessage}"`, 'success']
    );
  } catch (err) {
    dmStatus = 'failed';
    await dbRun(
      `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
      [channel, 'error', username, `Failed to send DM to user @${username}: ${err.message}`, 'failed']
    );
  }

  // 5. Capture Lead (avoid duplicate leads for the same user on the same channel + keyword combo)
  const existingLead = await dbGet(
    'SELECT id FROM leads WHERE platform_user_id = ? AND channel = ? AND matched_keyword = ?',
    [platformUserId, channel, keyword]
  );

  if (!existingLead) {
    // Generate clean human-readable name from username
    const formattedName = username
      .replace(/_/g, ' ')
      .replace(/\./g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    await dbRun(
      `INSERT INTO leads (platform_user_id, username, full_name, channel, source_type, matched_keyword) VALUES (?, ?, ?, ?, ?, ?)`,
      [platformUserId, username, formattedName, channel, sourceType, keyword]
    );
    await dbRun(
      `INSERT INTO logs (channel, event_type, username, details, status) VALUES (?, ?, ?, ?, ?)`,
      [channel, 'system', username, `New lead captured: ${formattedName} (@${username}) under keyword "${keyword}"`, 'success']
    );
  }

  return {
    matched: true,
    rule: matchedRule,
    commentReplyStatus,
    dmStatus,
    commentRepliedText: commentReply,
    dmSentText: dmMessage
  };
}

// ==========================================
// WEBHOOK ENDPOINTS
// ==========================================

/**
 * GET Meta webhook registration validator (Verifies subscription setup)
 */
app.get('/api/webhooks/meta', (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN || 'lead_automation_verify_token_5f7d';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook validated successfully by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn('Webhook verification failed: token mismatch.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

/**
 * POST Meta webhook receiver (Handles live IG / FB Comment & Message payloads)
 */
app.post('/api/webhooks/meta', async (req, res) => {
  const { body } = req;
  console.log('Received Meta Webhook payload:', JSON.stringify(body, null, 2));

  // Acknowledge Meta immediately to avoid retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    // 1. Process Instagram triggers
    if (body.object === 'instagram') {
      for (const entry of body.entry) {
        // A. Handle DMs
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            const senderId = msgEvent.sender.id;
            const message = msgEvent.message;

            // Avoid echo messages from the page itself
            if (message && message.text && !message.is_echo) {
              await processSocialEvent({
                channel: 'instagram',
                sourceType: 'dm',
                platformUserId: senderId,
                username: `ig_user_${senderId.slice(-4)}`, // Fallback username
                text: message.text,
                eventId: msgEvent.message.mid
              });
            }
          }
        }

        // B. Handle IG Comments
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'comments') {
              const comment = change.value;
              // Ensure we aren't replying to our own comment replies
              if (comment && comment.id && comment.text && comment.from.id !== entry.id) {
                await processSocialEvent({
                  channel: 'instagram',
                  sourceType: 'comment',
                  platformUserId: comment.from.id,
                  username: comment.from.username || `ig_user_${comment.from.id.slice(-4)}`,
                  text: comment.text,
                  eventId: comment.id
                });
              }
            }
          }
        }
      }
    }

    // 2. Process Facebook Messenger / Feed triggers
    if (body.object === 'page') {
      for (const entry of body.entry) {
        // A. Messenger DMs
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            const senderId = msgEvent.sender.id;
            const message = msgEvent.message;

            if (message && message.text && !message.is_echo) {
              await processSocialEvent({
                channel: 'facebook',
                sourceType: 'dm',
                platformUserId: senderId,
                username: `fb_user_${senderId.slice(-4)}`,
                text: message.text,
                eventId: msgEvent.message.mid
              });
            }
          }
        }

        // B. Facebook Page Comments
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'feed') {
              const value = change.value;
              // Check if event is a comment creation
              if (value && value.item === 'comment' && value.verb === 'add') {
                const commentId = value.comment_id;
                const senderId = value.from.id;
                const senderName = value.from.name || `fb_user_${senderId.slice(-4)}`;
                const message = value.message;

                // Ensure it's not our page making the comment
                if (senderId !== entry.id) {
                  await processSocialEvent({
                    channel: 'facebook',
                    sourceType: 'comment',
                    platformUserId: senderId,
                    username: senderName.toLowerCase().replace(/\s+/g, '_'),
                    text: message,
                    eventId: commentId
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing Meta Webhook payload:', error);
  }
});

/**
 * POST TikTok webhook receiver (Handles live DM and comment payloads)
 */
app.post('/api/webhooks/tiktok', async (req, res) => {
  const { body } = req;
  console.log('Received TikTok Webhook payload:', JSON.stringify(body, null, 2));

  // TikTok requires sending response back immediately
  res.status(200).send({ status: 'success' });

  try {
    const event = body.event;
    if (!event) return;

    // A. TikTok Message (DM) Webhook
    if (event === 'direct_message.receive') {
      const data = body.data;
      if (data) {
        await processSocialEvent({
          channel: 'tiktok',
          sourceType: 'dm',
          platformUserId: data.sender_open_id,
          username: `tiktok_user_${data.sender_open_id.slice(-4)}`,
          text: data.message_content?.text || '',
          eventId: data.conversation_id
        });
      }
    }

    // B. TikTok Comment Webhook
    if (event === 'comment.reply') { // Hook when a comment is added to client's video
      const data = body.data;
      if (data && data.comment_id) {
        await processSocialEvent({
          channel: 'tiktok',
          sourceType: 'comment',
          platformUserId: data.commenter_open_id,
          username: `tiktok_user_${data.commenter_open_id.slice(-4)}`,
          text: data.comment_text || '',
          eventId: data.comment_id,
          extraId: data.video_id
        });
      }
    }
  } catch (error) {
    console.error('Error processing TikTok webhook:', error);
  }
});

// ==========================================
// INTERACTIVE TESTING SANDBOX SIMULATOR
// ==========================================
/**
 * POST /api/simulator/event
 * Allows the browser frontend to inject mock triggers to test keywords and auto-replies instantly
 */
app.post('/api/simulator/event', async (req, res) => {
  const { channel, sourceType, username, text } = req.body;

  if (!channel || !sourceType || !username || !text) {
    return res.status(400).json({ error: 'Missing required parameters: channel, sourceType, username, text' });
  }

  try {
    const platformUserId = 'sim_usr_' + Math.random().toString(36).substring(2, 8);
    const eventId = 'sim_evt_' + Math.random().toString(36).substring(2, 10);
    const extraId = 'sim_post_' + Math.random().toString(36).substring(2, 10);

    const result = await processSocialEvent({
      channel,
      sourceType,
      platformUserId,
      username: username.toLowerCase().replace(/\s+/g, '_'),
      text,
      eventId,
      extraId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error in Simulator API endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// DASHBOARD APIs (CRUD for rules, lists, stats)
// ==========================================

/**
 * GET all automation rules
 */
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await dbAll('SELECT * FROM rules ORDER BY created_at DESC');
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST create a new automation rule
 */
app.post('/api/rules', async (req, res) => {
  const { keyword, channel, dm_message, comment_reply } = req.body;

  if (!keyword || !dm_message) {
    return res.status(400).json({ error: 'Keyword and DM Message are required.' });
  }

  try {
    // Format keyword to be safe and trim spaces
    const cleanKeyword = keyword.trim().toLowerCase();

    // Check uniqueness
    const exists = await dbGet('SELECT id FROM rules WHERE keyword = ?', [cleanKeyword]);
    if (exists) {
      return res.status(400).json({ error: `Rule for keyword "${cleanKeyword}" already exists.` });
    }

    const result = await dbRun(
      'INSERT INTO rules (keyword, channel, dm_message, comment_reply) VALUES (?, ?, ?, ?)',
      [cleanKeyword, channel || 'all', dm_message.trim(), comment_reply ? comment_reply.trim() : null]
    );

    await dbRun(
      `INSERT INTO logs (channel, event_type, details, status) VALUES (?, ?, ?, ?)`,
      ['system', 'system', `Created new keyword automation rule for "${cleanKeyword}"`, 'info']
    );

    res.status(201).json({ id: result.id, keyword: cleanKeyword, channel, dm_message, comment_reply, is_active: 1 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT update an automation rule
 */
app.put('/api/rules/:id', async (req, res) => {
  const { id } = req.params;
  const { keyword, channel, dm_message, comment_reply, is_active } = req.body;

  if (!keyword || !dm_message) {
    return res.status(400).json({ error: 'Keyword and DM Message are required.' });
  }

  try {
    const cleanKeyword = keyword.trim().toLowerCase();

    // Check uniqueness of keyword excluding the current rule
    const exists = await dbGet('SELECT id FROM rules WHERE keyword = ? AND id != ?', [cleanKeyword, id]);
    if (exists) {
      return res.status(400).json({ error: `Rule for keyword "${cleanKeyword}" already exists on another rule.` });
    }

    await dbRun(
      'UPDATE rules SET keyword = ?, channel = ?, dm_message = ?, comment_reply = ?, is_active = ? WHERE id = ?',
      [cleanKeyword, channel, dm_message.trim(), comment_reply ? comment_reply.trim() : null, is_active !== undefined ? is_active : 1, id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE an automation rule
 */
app.delete('/api/rules/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rule = await dbGet('SELECT keyword FROM rules WHERE id = ?', [id]);
    if (rule) {
      await dbRun('DELETE FROM rules WHERE id = ?', [id]);
      await dbRun(
        `INSERT INTO logs (channel, event_type, details, status) VALUES (?, ?, ?, ?)`,
        ['system', 'system', `Deleted automation rule for keyword "${rule.keyword}"`, 'info']
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET all captured leads
 */
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await dbAll('SELECT * FROM leads ORDER BY captured_at DESC');
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET audit trail logs
 */
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET high level statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const leadsCount = await dbGet('SELECT COUNT(*) as count FROM leads');
    const rulesCount = await dbGet('SELECT COUNT(*) as count FROM rules WHERE is_active = 1');
    const logsCount = await dbGet('SELECT COUNT(*) as count FROM logs');
    
    // Channel-specific lead breakdown
    const igLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE channel = 'instagram'");
    const fbLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE channel = 'facebook'");
    const ttLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE channel = 'tiktok'");

    // Source-specific (DM vs Comment)
    const dmLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE source_type = 'dm'");
    const commentLeads = await dbGet("SELECT COUNT(*) as count FROM leads WHERE source_type = 'comment'");

    res.json({
      totalLeads: leadsCount.count,
      activeRules: rulesCount.count,
      totalActions: logsCount.count,
      byChannel: {
        instagram: igLeads.count,
        facebook: fbLeads.count,
        tiktok: ttLeads.count
      },
      bySource: {
        dm: dmLeads.count,
        comment: commentLeads.count
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static(path.join(__dirname, '../dist')));

  app.get('*', (req, res) => {
    // Exclude API routes
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.resolve(__dirname, '../', 'dist', 'index.html'));
    }
  });
}

// Start Express Application Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🤖 Lead Automation Server is running on Port ${PORT}`);
  console.log(`⚡ API Endpoints: http://localhost:${PORT}/api`);
  console.log(`🔗 Instagram Webhook Verification: http://localhost:${PORT}/api/webhooks/meta`);
  console.log(`====================================================`);
});

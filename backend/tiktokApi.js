const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

/**
 * Checks if the TikTok API is configured.
 */
const isConfigured = () => {
  return (
    CLIENT_KEY &&
    CLIENT_KEY !== 'your_tiktok_client_key_here' &&
    CLIENT_KEY.trim() !== ''
  );
};

/**
 * Sends a Direct Message to a TikTok user.
 * Ref: https://developers.tiktok.com/doc/direct-messages-integration
 * @param {string} openId - The recipient's TikTok Open ID
 * @param {string} text - Message to send
 */
const sendTikTokDM = async (openId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK TIKTOK DM] Sent to user ${openId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    // In production, we retrieve an user access token stored in the database.
    // Here we show the standard API payload request:
    const url = 'https://open.tiktokapis.com/v2/direct_message/send/';
    const response = await axios.post(
      url,
      {
        recipient_open_id: openId,
        message_content: {
          text: text
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer YOUR_USER_ACCESS_TOKEN` // Retrieved dynamically in production
        }
      }
    );
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error sending TikTok DM:', errMsg);
    throw new Error(`TikTok API Error: ${errMsg}`);
  }
};

/**
 * Replies to a comment on a TikTok video.
 * Ref: https://developers.tiktok.com/doc/comment-reply
 * @param {string} videoId - The TikTok Video ID
 * @param {string} commentId - The ID of the comment to reply to
 * @param {string} text - The reply text
 */
const replyToTikTokComment = async (videoId, commentId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK TIKTOK COMMENT REPLY] To comment ${commentId} on video ${videoId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    const url = 'https://open.tiktokapis.com/v2/comment/reply/';
    const response = await axios.post(
      url,
      {
        video_id: videoId,
        comment_id: commentId,
        text: text
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer YOUR_USER_ACCESS_TOKEN`
        }
      }
    );
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error replying to TikTok comment:', errMsg);
    throw new Error(`TikTok API Error: ${errMsg}`);
  }
};

module.exports = {
  isConfigured,
  sendTikTokDM,
  replyToTikTokComment
};

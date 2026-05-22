const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const API_VERSION = 'v19.0';
const BASE_URL = 'https://graph.facebook.com';

/**
 * Checks if the Meta API has been fully configured by the user.
 */
const isConfigured = () => {
  return (
    PAGE_ACCESS_TOKEN &&
    PAGE_ACCESS_TOKEN !== 'your_meta_page_access_token_here' &&
    PAGE_ACCESS_TOKEN.trim() !== ''
  );
};

/**
 * Sends a Direct Message to a user on Instagram.
 * @param {string} recipientId - The Instagram-scoped User ID (IGSID)
 * @param {string} text - The message to send
 */
const sendInstagramDM = async (recipientId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK IG DM] Sent to user ${recipientId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    const url = `${BASE_URL}/${API_VERSION}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: text }
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error sending Instagram DM:', errMsg);
    throw new Error(`Meta API Error: ${errMsg}`);
  }
};

/**
 * Replies to a comment on an Instagram Post.
 * @param {string} commentId - The ID of the comment to reply to
 * @param {string} text - The text of the reply
 */
const replyToInstagramComment = async (commentId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK IG COMMENT REPLY] To comment ${commentId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    const url = `${BASE_URL}/${API_VERSION}/${commentId}/replies?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await axios.post(url, {
      message: text
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error replying to Instagram comment:', errMsg);
    throw new Error(`Meta API Error: ${errMsg}`);
  }
};

/**
 * Sends a Direct Message to a user on Facebook Messenger.
 * @param {string} recipientId - The Page-scoped User ID (PSID)
 * @param {string} text - The message to send
 */
const sendFacebookDM = async (recipientId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK FB DM] Sent to user ${recipientId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    const url = `${BASE_URL}/${API_VERSION}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: text }
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error sending Facebook DM:', errMsg);
    throw new Error(`Meta API Error: ${errMsg}`);
  }
};

/**
 * Replies to a comment on a Facebook Post.
 * @param {string} commentId - The ID of the Facebook comment
 * @param {string} text - The text of the reply
 */
const replyToFacebookComment = async (commentId, text) => {
  if (!isConfigured()) {
    console.log(`[MOCK FB COMMENT REPLY] To comment ${commentId}: "${text}"`);
    return { success: true, mock: true };
  }

  try {
    const url = `${BASE_URL}/${API_VERSION}/${commentId}/comments?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await axios.post(url, {
      message: text
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Error replying to Facebook comment:', errMsg);
    throw new Error(`Meta API Error: ${errMsg}`);
  }
};

module.exports = {
  isConfigured,
  sendInstagramDM,
  replyToInstagramComment,
  sendFacebookDM,
  replyToFacebookComment
};

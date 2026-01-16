#!/usr/bin/env node
// Usage: TELEGRAM_BOT_TOKEN=123:ABC node get_telegram_chat_id.js
// Prints discovered chat ids and usernames from bot.getUpdates

// Load .env if present so TELEGRAM_BOT_TOKEN can come from .env
try { require('dotenv').config(); } catch (e) { /* ignore */ }

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.argv[2];
  if (!token) {
    console.error('Provide token via TELEGRAM_BOT_TOKEN env or as first arg');
    process.exit(1);
  }
  const api = `https://api.telegram.org/bot${token}/getUpdates`;
  try {
    const fetchFn = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default;
    const res = await fetchFn(api);
    const j = await res.json();
    if (!j || !Array.isArray(j.result)) {
      console.error('No updates or unexpected response:', j);
      process.exit(2);
    }
    const map = new Map();
    for (const u of j.result) {
      const msg = u.message || u.channel_post || u.edited_message || u.callback_query && u.callback_query.message;
      if (!msg) continue;
      const chat = msg.chat || (msg.from ? { id: msg.from.id, username: msg.from.username, first_name: msg.from.first_name, last_name: msg.from.last_name } : null);
      if (!chat) continue;
      const id = chat.id;
      if (!map.has(id)) {
        map.set(id, { id, username: chat.username || null, first_name: chat.first_name || null, last_name: chat.last_name || null, last_message: (msg.text || msg.caption || '').slice(0,200) });
      } else {
        // update last_message
        const entry = map.get(id);
        entry.last_message = (msg.text || msg.caption || '').slice(0,200);
        map.set(id, entry);
      }
    }
    if (map.size === 0) {
      console.error('No chats found in getUpdates. Have users messaged the bot?');
      process.exit(3);
    }
    console.log('Discovered chats:');
    for (const v of map.values()) {
      console.log('---');
      console.log('chat_id:', v.id);
      if (v.username) console.log('username:', '@' + v.username);
      if (v.first_name || v.last_name) console.log('name:', `${v.first_name || ''} ${v.last_name || ''}`.trim());
      if (v.last_message) console.log('last_message:', v.last_message);
    }
  } catch (e) {
    console.error('Error fetching getUpdates:', e && e.message ? e.message : e);
    process.exit(4);
  }
})();

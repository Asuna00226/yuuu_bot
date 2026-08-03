const path = require('path');
const emojis = require(path.join(__dirname, '..', 'emojis.json'));

function getEmojiMarkup(name, { animated = false } = {}) {
  const id = emojis[name];
  if (!id) return null;
  const prefix = animated ? 'a' : '';
  return `<${prefix}:${name}:${id}>`;
}

module.exports = { getEmojiMarkup };

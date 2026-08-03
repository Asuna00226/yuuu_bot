const { SlashCommandBuilder } = require('discord.js');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emoji_text')
    .setDescription('Add a sequence of custom emojis as reactions to a target message')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text to convert to emojis (letters only)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('index')
        .setDescription('(Optional) which message from the end to target (1 = last). Defaults to 1')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const text = interaction.options.getString('text') || '';
    if (!/^[a-zA-Z]+$/.test(text)) {
      return interaction.editReply({ content: '文字僅能包含英文字母 A-Z。' });
    }

    if (text.length > 19) {
      return interaction.editReply({ content: '文字長度不可超過 19。' });
    }

    const letters = text.toLowerCase().split('');
    const counts = {};
    const keys = [];

    for (const ch of letters) {
      counts[ch] = (counts[ch] || 0) + 1;
      if (counts[ch] > 5) {
        return interaction.editReply({ content: `字母 "${ch}" 出現超過 5 次。` });
      }
      keys.push(`${ch}${counts[ch]}`);
    }

    // resolve target message: user-specified or last message in channel
    const index = interaction.options.getInteger('index') || 1;
    let targetMessage = null;

    const fetched = await interaction.channel.messages.fetch({ limit: index });
    if (fetched.size < index) {
      return interaction.editReply({ content: `在此頻道中沒有足夠的訊息可供目標（要求第 ${index} 則，實際只有 ${fetched.size} 則）。` });
    }
    const messagesArray = Array.from(fetched.values());
    targetMessage = messagesArray[index - 1];

    if (!targetMessage) {
      return interaction.editReply({ content: '無法取得目標訊息 (channel 內沒有訊息)。' });
    }

    // load delete emoji id early and disallow re-running on messages that already have
    // the delete reaction added by this bot
    const emojisData = require('../emojis.json');
    const deleteId = emojisData.delete;
    const existingDelete = targetMessage.reactions.cache.find(r => r.emoji.id === deleteId && r.me);
    if (existingDelete) {
      return interaction.editReply({ content: '不可以一次兩個~ 掉壞掉的~ ' });
    }

    const markups = [];
    for (const key of keys) {
      const markup = getEmojiMarkup(key);
      if (!markup) {
        return interaction.editReply({ content: `找不到 emojis.json 中的 ${key}，請確認已正確設定。` });
      }
      markups.push(markup);
    }
    // add reactions sequentially
    for (const m of markups) {
      try {
        await targetMessage.react(m);
      } catch (err) {
        console.error('React error', err);
        return interaction.editReply({ content: `嘗試加上 ${m} 時發生錯誤： ${err.message}` });
      }
    }

    // Append delete emoji reaction at the end
    const deleteMarkup = getEmojiMarkup('delete') || `<:delete:${deleteId}>`;

    try {
      await targetMessage.react(deleteMarkup);
    } catch (err) {
      console.error('React error (delete)', err);
      return interaction.editReply({ content: `無法加上刪除表情：${err.message}` });
    }

    // Create a reaction collector to listen for delete presses
    const filter = (reaction, user) => {
      if (user.bot) return false;
      // reaction.emoji.id for custom emoji
      return reaction.emoji.id === deleteId;
    };

    const collector = targetMessage.createReactionCollector({ filter, time: 5 * 60 * 1000 });
    collector.on('collect', async (reaction, user) => {
      try {
        await targetMessage.reactions.removeAll();
      } catch (err) {
        console.error('Failed to remove reactions', err);
      } finally {
        collector.stop();
      }
    });

    try {
      await interaction.deleteReply();
    } catch (err) {
      // ignore delete errors
    }

    return;
  },
};

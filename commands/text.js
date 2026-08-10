const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('text')
    .setDescription('將英文字母轉換成自訂表情文字')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Text to convert to emojis (letters only)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const text = interaction.options.getString('text') || '';
    if (!/^[a-zA-Z]+$/.test(text)) {
      return interaction.editReply({ content: '文字僅能包含英文字母 A-Z。' });
    }

    if (text.length > 19) {
      return interaction.editReply({ content: '文字長度不可超過 19。' });
    }

    const letters = text.toLowerCase().split('');
    const counts = {};
    const markups = [];

    for (const ch of letters) {
      counts[ch] = (counts[ch] || 0) + 1;
      if (counts[ch] > 5) {
        return interaction.editReply({ content: `字母 "${ch}" 出現超過 5 次。` });
      }

      const markup = getEmojiMarkup(`${ch}${counts[ch]}`);
      if (!markup) {
        return interaction.editReply({ content: `找不到 emojis.json 中的 ${ch}${counts[ch]}，請確認已正確設定。` });
      }
      markups.push(markup);
    }

    try {
      await interaction.channel.send({ content: markups.join('') });
    } catch (error) {
      console.error('發送 emoji 文字失敗:', error);
      return interaction.editReply({ content: `發送 emoji 文字時發生錯誤：${error.message}` });
    }

    try {
      await interaction.deleteReply();
    } catch (error) {
      // Ignore errors when deleting the ephemeral acknowledgement.
    }
  },
};

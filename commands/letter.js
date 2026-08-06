const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('letter')
        .setDescription('Send a letter emoji based on the chosen letter')
        .addStringOption(option =>
            option.setName('letter')
                .setDescription('The letter to send as an emoji (A-Z)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const letterInput = interaction.options.getString('letter');
        const letter = typeof letterInput === 'string' ? letterInput.trim().toLowerCase() : '';

        if (!/^[a-z]$/.test(letter)) {
            return interaction.reply({ content: '請提供有效的字母 (A-Z)。', flags: MessageFlags.Ephemeral });
        }

        // map single letter to emoji key in emojis.json (e.g. 'a' -> 'a1')
        const emojiKey = `${letter}1`;
        const markup = getEmojiMarkup(emojiKey);

        if (!markup) {
            return interaction.reply({ content: `找不到名為 ${emojiKey} 的自訂 emoji（emojis.json）。請確認已上傳並更新 emojis.json。`, flags: MessageFlags.Ephemeral });
        }

        await interaction.reply(markup);
    },
};

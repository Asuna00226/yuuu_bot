const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const emojis = require('../emojis.json');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');
const { COLOR_PANEL_CHANNEL_ID, colorGroups, isOwner } = require('../utils/colorSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color_system_setup')
    .setDescription('發送名字顏色選擇面板'),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: '這個指令只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
    }
    if (!isOwner(interaction)) {
      return interaction.reply({ content: '只有 OWNER 可以使用這個指令。', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    await guild.roles.fetch();
    const roleByName = new Map(guild.roles.cache.map((role) => [role.name, role]));
    const missingRoles = colorGroups.flatMap((group) => group.colors).filter((hexCode) => !roleByName.has(hexCode));
    if (missingRoles.length > 0) {
      return interaction.editReply({ content: `缺少 ${missingRoles.length} 個顏色身分組，請先執行 /color_system_role_create。` });
    }

    const channel = await guild.channels.fetch(COLOR_PANEL_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({ content: `找不到文字頻道 <#${COLOR_PANEL_CHANNEL_ID}>。` });
    }

    try {
      for (const group of colorGroups) {
        const colorMentions = group.colors.map((hexCode, index) => {
          const emojiKey = String(index + 1).padStart(2, '0');
          return `${getEmojiMarkup(emojiKey) || `:${emojiKey}:`} <@&${roleByName.get(hexCode).id}>`;
        });
        const description = `${colorMentions.slice(0, 5).join(' ')}\n${colorMentions.slice(5).join(' ')}`;
        const rows = [0, 5].map((startIndex) => new ActionRowBuilder().addComponents(
          group.colors.slice(startIndex, startIndex + 5).map((hexCode, index) => {
            const colorIndex = startIndex + index;
            const emojiKey = String(colorIndex + 1).padStart(2, '0');
            const button = new ButtonBuilder()
              .setCustomId(`color_system_${group.id}_${emojiKey}`)
              .setStyle(ButtonStyle.Secondary);
            if (emojis[emojiKey]) {
              button.setEmoji({ id: emojis[emojiKey] });
            } else {
              button.setLabel(`:${emojiKey}:`);
            }
            return button;
          })
        ));

        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle(`:${group.icon}: ${group.name}`)
            .setDescription(description)
            .setColor(Number.parseInt(group.embedColor, 16))],
          components: rows,
        });
      }
    } catch (error) {
      console.error('發送名字顏色選擇面板失敗:', error);
      return interaction.editReply({ content: '發送面板時發生錯誤，請確認我有檢視頻道與傳送訊息權限。' });
    }

    return interaction.editReply({ content: '已在指定頻道發送 9 則名字顏色選擇面板。' });
  },
};
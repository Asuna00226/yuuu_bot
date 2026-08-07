const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { COLOR_ROLE_ANCHOR_ID, colorGroups, isOwner } = require('../utils/colorSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color_system_role_create')
    .setDescription('建立名字顏色系統的所有身分組'),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: '這個指令只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
    }
    if (!isOwner(interaction)) {
      return interaction.reply({ content: '只有 OWNER 可以使用這個指令。', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    const botMember = await guild.members.fetchMe();
    const anchorRole = await guild.roles.fetch(COLOR_ROLE_ANCHOR_ID).catch(() => null);

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply({ content: '我缺少 ManageRoles 權限，無法建立身分組。' });
    }
    if (!anchorRole) {
      return interaction.editReply({ content: `找不到錨點身分組 <@&${COLOR_ROLE_ANCHOR_ID}>。` });
    }
    if (botMember.roles.highest.position <= anchorRole.position) {
      return interaction.editReply({ content: '我的最高身分組必須高於指定的錨點身分組。' });
    }

    await guild.roles.fetch();
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const hexCode of colorGroups.flatMap((group) => group.colors)) {
      try {
        let role = guild.roles.cache.find((item) => item.name === hexCode);
        if (role) {
          if (!role.editable) {
            failedCount += 1;
            continue;
          }
          await role.edit({ color: Number.parseInt(hexCode, 16), reason: 'Color system role update' });
          updatedCount += 1;
        } else {
          role = await guild.roles.create({
            name: hexCode,
            color: Number.parseInt(hexCode, 16),
            reason: 'Color system role creation',
          });
          createdCount += 1;
        }
        await role.setPosition(anchorRole.position + 1, { reason: 'Place above color system anchor role' });
      } catch (error) {
        console.error(`建立名字顏色身分組 ${hexCode} 失敗:`, error);
        failedCount += 1;
      }
    }

    return interaction.editReply({
      content: `完成：新增 ${createdCount} 個、更新 ${updatedCount} 個身分組，失敗 ${failedCount} 個。`,
    });
  },
};
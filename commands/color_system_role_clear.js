const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { colorRoleNames, isOwner } = require('../utils/colorSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color_system_role_clear')
    .setDescription('刪除名字顏色系統的所有身分組'),

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
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply({ content: '我缺少 ManageRoles 權限，無法刪除身分組。' });
    }

    await guild.roles.fetch();
    const roles = guild.roles.cache.filter((role) => colorRoleNames.has(role.name));
    let deletedCount = 0;
    let skippedCount = 0;
    for (const role of roles.values()) {
      if (!role.editable) {
        skippedCount += 1;
        continue;
      }
      try {
        await role.delete('Color system role clear');
        deletedCount += 1;
      } catch (error) {
        console.error(`刪除名字顏色身分組 ${role.name} 失敗:`, error);
        skippedCount += 1;
      }
    }

    return interaction.editReply({ content: `完成：刪除 ${deletedCount} 個身分組，略過或失敗 ${skippedCount} 個。` });
  },
};
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const allowedRoleName = process.env.RENAME_ROLE_NAME || '✔ 活躍幽靈';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('更改指定成員的暱稱')
    .addUserOption((option) =>
      option
        .setName('target')
        .setDescription('要更改暱稱的成員')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('new_name')
        .setDescription('新的暱稱，留空則重置暱稱')
        .setRequired(false)
        .setMaxLength(32)
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: '這個指令只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.member;
    const hasAllowedRole = member.roles.cache.some((role) => role.name === allowedRoleName);

    if (!hasAllowedRole) {
      return interaction.reply({
        content: `只有擁有 ${allowedRoleName} 身分組的成員可以使用這個指令。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('target');
    const newName = interaction.options.getString('new_name');

    if (!targetUser) {
      return interaction.reply({ content: '找不到指定的成員。', flags: MessageFlags.Ephemeral });
    }

    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: '我沒有 ManageNicknames 權限，無法修改暱稱。', flags: MessageFlags.Ephemeral });
    }

    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(targetUser.id);
    } catch (error) {
      return interaction.reply({ content: '指定的成員不在這個伺服器。', flags: MessageFlags.Ephemeral });
    }

    try {
      if (newName && newName.trim()) {
        await targetMember.setNickname(newName.trim());
        return interaction.reply({ content: `已成功將 ${targetMember.user.tag} 的暱稱改為 ${newName.trim()}` });
      }

      await targetMember.setNickname(null);
      return interaction.reply({ content: `已成功重置 ${targetMember.user.tag} 的暱稱` });
    } catch (error) {
      console.error('修改暱稱失敗:', error);
      return interaction.reply({ content: '修改暱稱時發生錯誤。', flags: MessageFlags.Ephemeral });
    }
  },
};

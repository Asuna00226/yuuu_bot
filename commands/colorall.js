const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getColor } = require('colorthief');

const downloadAvatar = (url, filePath) => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(downloadAvatar(response.headers.location, filePath));
        response.resume();
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`下載頭像失敗，狀態碼: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(filePath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        reject(err);
      });
    });

    request.on('error', reject);
  });
};

const getDominantColorFromAvatar = async (avatarUrl) => {
  const temporaryFile = path.join(os.tmpdir(), `colorall-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);

  try {
    await downloadAvatar(avatarUrl, temporaryFile);
    const color = await getColor(temporaryFile);
    return color ? color.hex() : '#808080';
  } finally {
    await fs.promises.rm(temporaryFile, { force: true }).catch(() => {});
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('colorall')
    .setDescription('為每個非機器人的成員建立一個依照頭像顏色的角色')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: '這個指令只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
    }

    const ownerIds = (process.env.OWNER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const isOwner = interaction.user.id === interaction.guild.ownerId || ownerIds.includes(interaction.user.id);

    if (!isOwner) {
      return interaction.reply({ content: '只有 OWNER 可以使用這個指令。', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const botMember = await guild.members.fetchMe();

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply({ content: '我缺少 ManageRoles 權限，無法建立或套用角色。' });
    }

    const colorBottomRole = guild.roles.cache.find((role) => role.name.toLowerCase() === 'color_bottom');

    if (!colorBottomRole) {
      return interaction.editReply({ content: '找不到名為 color_bottom 的角色，請先建立它。' });
    }

    if (botMember.roles.highest.position <= colorBottomRole.position) {
      return interaction.editReply({ content: '我的最高角色位置不足，無法把新角色放在 color_bottom 上方。' });
    }

    let members = [];

    try {
      const fetchedMembers = await guild.members.fetch();
      members = Array.from(fetchedMembers.values()).filter((member) => !member.user.bot);
    } catch (error) {
      console.error('取得成員清單失敗:', error);
      return interaction.editReply({ content: '取得伺服器成員清單時發生錯誤。' });
    }

    if (members.length === 0) {
      return interaction.editReply({ content: '目前沒有可處理的非機器人成員。' });
    }

    const results = [];
    const delayMs = 400;

    await interaction.editReply({ content: `開始處理 ${members.length} 位成員，請稍候...` });

    for (let index = 0; index < members.length; index += 1) {
      const member = members[index];
      if (index === 0 || index % 5 === 0 || index === members.length - 1) {
        await interaction.editReply({ content: `進度 ${index + 1}/${members.length}: 正在處理 ${member.user.tag}...` });
      }

      try {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const hexColor = await getDominantColorFromAvatar(avatarUrl);
        const roleName = `${member.user.username}`.slice(0, 100);
        const roleColor = parseInt(hexColor.replace('#', ''), 16);

        let role = guild.roles.cache.find((existingRole) => existingRole.name === roleName);

        if (!role) {
          role = await guild.roles.create({
            name: roleName,
            color: roleColor,
            reason: `Color role for ${member.user.tag}`,
          });
          await role.setPosition(colorBottomRole.position + 1);
        }

        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role, `colorall for ${member.user.tag}`);
        }

        results.push(`✅ ${member.user.tag} -> ${role.name} (${hexColor})`);
      } catch (error) {
        console.error(`處理 ${member.user.tag} 失敗:`, error);
        results.push(`⚠️ ${member.user.tag} -> ${error.message}`);
      }

      if (index < members.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const summary = `處理完成。\n${results.join('\n')}`;
    return interaction.editReply({ content: summary.length > 2000 ? `${summary.slice(0, 1997)}...` : summary });
  },
};

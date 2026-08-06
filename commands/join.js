const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('加入使用者目前所在的語音頻道。'),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: '這個指令只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: '請先加入語音頻道，再使用此指令。', flags: MessageFlags.Ephemeral });
    }

    const botVoiceChannelId = interaction.guild.members.me?.voice?.channelId;
    if (botVoiceChannelId === voiceChannel.id) {
      return interaction.reply({ content: `我已經在你的語音頻道：${voiceChannel.name}。`, flags: MessageFlags.Ephemeral });
    }

    try {
      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      return interaction.reply({ content: `已加入語音頻道：${voiceChannel.name}` });
    } catch (error) {
      console.error('join command failed:', error);
      return interaction.reply({ content: '我無法加入你的語音頻道，請確認我有加入語音頻道的權限。', flags: MessageFlags.Ephemeral });
    }
  },
};

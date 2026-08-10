const fs = require('fs');
const path = require('path');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const availableCommands = require('../utils/availableCommands');

const commandsPath = path.join(__dirname);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('列出所有可用指令與簡介'),

  async execute(interaction) {
    const commands = availableCommands
      .map((name) => require(path.join(commandsPath, `${name}.js`)))
      .filter((command) => command.data && command.execute)

    const embed = new EmbedBuilder()
      .setTitle('可用指令')
      .setDescription('以下是目前可以使用的指令：')
      .addFields(commands.map((command) => ({
        name: `/${command.data.name}`,
        value: command.data.description || '沒有提供指令簡介。',
        inline: false,
      })));

    await interaction.reply({ embeds: [embed] });
  },
};
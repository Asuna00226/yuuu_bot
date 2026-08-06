const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong and latency information!'),
    async execute(interaction) {
        await interaction.reply({ content: 'Pinging...' });
        const sent = await interaction.fetchReply();
        const pingTime = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply(`Pong! 🏓\nBot 延遲: ${pingTime}ms\nAPI 延遲: ${Math.round(interaction.client.ws.ping)}ms`);
    },
};

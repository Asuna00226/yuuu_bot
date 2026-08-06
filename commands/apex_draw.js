const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
  ComponentType,
} = require('discord.js');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');

const MAX_PLAYERS = 20;
const BACKGROUND_COLOR = 2895154;
const ACTIVE_COLOR = 3066993;
const SPECTATOR_COLOR = 15158332;

function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildEmbeds(memberEntries) {
  const activeLines = memberEntries
    .filter((entry) => entry.status === 'playing')
    .map((entry) => `${getEmojiMarkup(entry.key)} ${entry.displayName}`);

  const spectatorLines = memberEntries
    .filter((entry) => entry.status === 'watching')
    .map((entry) => `${getEmojiMarkup(entry.key)} ${entry.displayName}`);

  const addMarkup = getEmojiMarkup('add') || ':add:';
  const removeMarkup = getEmojiMarkup('remove') || ':remove:';

  return [
    {
      title: 'Apex 分隊系統',
      color: BACKGROUND_COLOR,
      fields: [],
    },
    {
      color: ACTIVE_COLOR,
      fields: [
        {
          name: `${addMarkup} 參戰中`,
          value: activeLines.length > 0 ? activeLines.join('\n') : '目前無參戰成員',
        },
      ],
    },
    {
      color: SPECTATOR_COLOR,
      fields: [
        {
          name: `${removeMarkup} 觀戰中`,
          value: spectatorLines.length > 0 ? spectatorLines.join('\n') : '目前無觀戰成員',
          inline: true,
        },
      ],
    },
    {
      color: BACKGROUND_COLOR,
      fields: [],
      footer: {
        text: '提示: 點擊下方表情切換對應編號的成員狀態。',
      },
    },
  ];
}

function buildTeamResultEmbed(teamOne, teamTwo) {
  const teamOneText = teamOne.length > 0 ? teamOne.map((entry) => entry.displayName).join('\n') : '目前無隊員';
  const teamTwoText = teamTwo.length > 0 ? teamTwo.map((entry) => entry.displayName).join('\n') : '目前無隊員';

  return {
    title: '分隊結果',
    color: BACKGROUND_COLOR,
    fields: [
      {
        name: '隊伍一',
        value: teamOneText,
        inline: true,
      },
      {
        name: ' ',
        value: ' ',
        inline: true,
      },
      {
        name: '隊伍二',
        value: teamTwoText,
        inline: true,
      },
    ],
    footer: {
      text: '提示: 恰有一人直播時，直播者不會被移動而中斷直播。',
    },
  };
}

function buildButtonRow(canMove, canReturn) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('apex_redraw')
      .setLabel('重新分隊')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId('apex_move_members')
      .setLabel('移動成員')
      .setStyle(canMove ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!canMove),
    new ButtonBuilder()
      .setCustomId('apex_return_members')
      .setLabel('返回成員')
      .setStyle(canReturn ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!canReturn),
  );
}

function splitTeams(memberEntries) {
  const activeEntries = memberEntries.filter((entry) => entry.status === 'playing');
  const activeCount = activeEntries.length;
  const liveEntries = activeEntries.filter((entry) => entry.member.voice?.streaming);
  const fixedLive = liveEntries.length === 1 ? liveEntries[0] : null;
  const remainingEntries = activeEntries.filter((entry) => entry !== fixedLive);
  const shuffled = shuffleArray(remainingEntries);
  const firstTeamSize = Math.ceil(activeCount / 2);

  const teamOne = fixedLive ? [fixedLive] : [];
  const teamOneAdditional = shuffled.slice(0, firstTeamSize - teamOne.length);
  const teamTwo = shuffled.slice(firstTeamSize - teamOne.length);

  return {
    teamOne: [...teamOne, ...teamOneAdditional],
    teamTwo,
    fixedLive,
  };
}

async function moveEntriesToChannel(entries, targetChannel) {
  for (const entry of entries) {
    try {
      if (!entry.member.voice.channel || entry.member.voice.channelId === targetChannel.id) continue;
      await entry.member.voice.setChannel(targetChannel);
    } catch (error) {
      console.error(`移動 ${entry.displayName} 時發生錯誤`, error);
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apex_draw')
    .setDescription('開啟 Apex 分隊系統，可使用反應表情切換參賽狀態。'),
  splitTeams,

  async execute(interaction) {
    const WATCH_CHANNEL_ID = process.env.APEX_WATCH_CHANNEL_ID || '1534193088489062543';
    const watchChannel = interaction.guild.channels.cache.get(WATCH_CHANNEL_ID);

    if (!watchChannel || watchChannel.type !== ChannelType.GuildVoice) {
      return interaction.reply({ content: '找不到指定的監控語音頻道，請聯絡管理員。', flags: MessageFlags.Ephemeral });
    }

    // 要求：可以在任何地方發送指令，但只有當指定頻道有人時可用
    const members = watchChannel.members.filter((member) => !member.user.bot);
    if (members.size === 0) {
      return interaction.reply({ content: `請先加入 <#${WATCH_CHANNEL_ID}> 的語音頻道。`, flags: MessageFlags.Ephemeral });
    }

    // (already checked watchChannel has members above)

    if (members.size > MAX_PLAYERS) {
      return interaction.reply({ content: `目前僅支援最多 ${MAX_PLAYERS} 位成員，請先讓部分成員離開語音頻道。`, flags: MessageFlags.Ephemeral });
    }

    const memberEntries = Array.from(members.values()).map((member, index) => {
      const key = String(index + 1).padStart(2, '0');
      return {
        id: member.id,
        member,
        displayName: member.displayName || member.user.username,
        key,
        status: 'playing',
      };
    });

    const state = {
      memberEntries,
      originalVoiceChannel: watchChannel,
      tempChannel: null,
      currentTeams: { teamOne: [], teamTwo: [] },
      resultMessage: null,
      resultCollector: null,
    };

    const startButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apex_start_split')
        .setLabel('開始分隊')
        .setStyle(ButtonStyle.Primary),
    );

    const embeds = buildEmbeds(memberEntries);
    await interaction.reply({ embeds, components: [startButtonRow] });
    const sentMessage = await interaction.fetchReply();

    for (const entry of memberEntries) {
      const emojiMarkup = getEmojiMarkup(entry.key);
      if (!emojiMarkup) {
        return interaction.followUp({ content: `找不到 ${entry.key} 的表情設定，請確認 emojis.json 已包含對應項目。`, flags: MessageFlags.Ephemeral });
      }

      try {
        await sentMessage.react(emojiMarkup);
      } catch (err) {
        console.error('Failed to add reaction', err);
        return interaction.followUp({ content: `無法加入反應 ${entry.key}：${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    let memberKeys = memberEntries.map((entry) => entry.key);

    function canMoveMembers() {
      return state.currentTeams.teamTwo.length > 0 && !state.tempChannel;
    }

    function canReturnMembers() {
      return !!state.tempChannel;
    }

    // Rebuild participant list from the monitored original voice channel, preserving statuses when possible
    async function refreshParticipants() {
      try {
        const membersNow = state.originalVoiceChannel.members.filter((m) => !m.user.bot);
        const prevById = new Map(state.memberEntries.map((e) => [e.id, e]));

        const newEntries = Array.from(membersNow.values()).map((member, index) => {
          const key = String(index + 1).padStart(2, '0');
          const prev = prevById.get(member.id);
          return {
            id: member.id,
            member,
            displayName: member.displayName || member.user.username,
            key,
            status: prev ? prev.status : 'playing',
          };
        });

        state.memberEntries = newEntries;
        memberKeys = newEntries.map((e) => e.key);

        // update original message embed and reactions
        try {
          await sentMessage.edit({ embeds: buildEmbeds(state.memberEntries), components: [startButtonRow] });
        } catch (err) {
          console.error('更新參賽名單 embed 失敗', err);
        }

        try {
          await sentMessage.reactions.removeAll();
        } catch (err) {
          // ignore
        }

        for (const entry of state.memberEntries) {
          const emojiMarkup = getEmojiMarkup(entry.key);
          if (!emojiMarkup) continue;
          try {
            await sentMessage.react(emojiMarkup);
          } catch (err) {
            console.error('重新加入反應失敗', err);
          }
        }

        // reset current teams and update result message if present
        state.currentTeams = { teamOne: [], teamTwo: [] };
        if (state.resultMessage) {
          await refreshResultMessage();
        }
      } catch (err) {
        console.error('refreshParticipants error', err);
      }
    }

    async function refreshResultMessage() {
      const teamEmbed = buildTeamResultEmbed(state.currentTeams.teamOne, state.currentTeams.teamTwo);
      const row = buildButtonRow(canMoveMembers(), canReturnMembers());

      const payload = {
        embeds: [teamEmbed],
        components: [row],
      };

      if (state.resultMessage) {
        await state.resultMessage.edit(payload);
      } else {
        state.resultMessage = await interaction.followUp(payload);
        attachResultCollector(state.resultMessage);
      }
    }

    function performSplit() {
      state.currentTeams = splitTeams(state.memberEntries);
    }

    function attachResultCollector(message) {
      if (state.resultCollector) return;

      state.resultCollector = message.createMessageComponentCollector({
        filter: (buttonInteraction) => !buttonInteraction.user.bot,
        componentType: ComponentType.Button,
        time: 12 * 60 * 60 * 1000,
      });

      state.resultCollector.on('collect', async (buttonInteraction) => {
        const customId = buttonInteraction.customId;

        if (customId === 'apex_redraw') {
          await buttonInteraction.deferUpdate();
          performSplit();
          await refreshResultMessage();
          return;
        }

        if (customId === 'apex_move_members') {
          if (!canMoveMembers()) {
            await buttonInteraction.reply({ content: '目前無法執行移動成員。', flags: MessageFlags.Ephemeral });
            return;
          }

          try {
            await buttonInteraction.deferUpdate();
            const parent = state.originalVoiceChannel.parent ?? null;
            state.tempChannel = await state.originalVoiceChannel.guild.channels.create({
              name: `${state.originalVoiceChannel.name}`,
              type: ChannelType.GuildVoice,
              parent,
              position: state.originalVoiceChannel.position + 1,
              reason: 'Apex 分隊暫時頻道',
            });

            await moveEntriesToChannel(state.currentTeams.teamTwo, state.tempChannel);
            await refreshResultMessage();
          } catch (error) {
            console.error('建立暫時語音頻道失敗', error);
            await buttonInteraction.followUp({ content: '無法建立暫時語音頻道，請確認機器人是否有建立頻道與移動成員的權限。', flags: MessageFlags.Ephemeral });
          }

          return;
        }

        if (customId === 'apex_return_members') {
          if (!canReturnMembers()) {
            await buttonInteraction.reply({ content: '目前無法執行返回成員。', flags: MessageFlags.Ephemeral });
            return;
          }

          try {
            await buttonInteraction.deferUpdate();
            await moveEntriesToChannel(state.currentTeams.teamTwo, state.originalVoiceChannel);
            const deleteChannel = state.tempChannel;
            state.tempChannel = null;
            if (deleteChannel && !deleteChannel.deleted) {
              await deleteChannel.delete('返回成員並刪除暫時頻道');
            }
            await refreshResultMessage();
          } catch (error) {
            console.error('返回成員失敗', error);
            await buttonInteraction.followUp({ content: '無法將成員移回原頻道，請確認機器人是否有移動成員的權限。', flags: MessageFlags.Ephemeral });
          }

          return;
        }
      });
    }

    // Watch voice state changes for the monitored channels and refresh participant list accordingly
    const client = interaction.client;
    let refreshQueued = false;
    const voiceHandler = (oldState, newState) => {
      try {
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        const watchId = state.originalVoiceChannel.id;
        const tempId = state.tempChannel?.id;

        const touched = [oldChannelId, newChannelId].some((id) => id === watchId || id === tempId);
        if (!touched) return;

        if (refreshQueued) return;
        refreshQueued = true;

        // Debounce bursts caused by a member moving between voice channels.
        setTimeout(async () => {
          refreshQueued = false;
          await refreshParticipants();
        }, 0);
      } catch (err) {
        console.error('voiceHandler error', err);
      }
    };

    client.on('voiceStateUpdate', voiceHandler);

    const resultCollector = sentMessage.createMessageComponentCollector({
      filter: (buttonInteraction) => !buttonInteraction.user.bot,
      componentType: ComponentType.Button,
      time: 12 * 60 * 60 * 1000,
    });

    resultCollector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.customId !== 'apex_start_split') return;

      await buttonInteraction.deferUpdate();
      performSplit();
      await refreshResultMessage();
    });

    const collector = sentMessage.createReactionCollector({
      filter: (reaction, user) => {
        if (user.bot) return false;
        const emojiName = reaction.emoji.name;
        return typeof emojiName === 'string' && memberKeys.includes(emojiName);
      },
      time: 12 * 60 * 60 * 1000, // 12 hours
    });

    collector.on('collect', async (reaction, user) => {
      const emojiName = reaction.emoji.name;
      if (!emojiName) return;

      const entry = state.memberEntries.find((item) => item.key === emojiName);
      if (!entry) return;

      entry.status = entry.status === 'playing' ? 'watching' : 'playing';

      try {
        await sentMessage.edit({ embeds: buildEmbeds(state.memberEntries) });
      } catch (err) {
        console.error('Failed to update embed', err);
      }

      try {
        await reaction.users.remove(user.id);
      } catch (err) {
        // ignore if bot cannot remove the reaction
      }
    });

    collector.on('end', async () => {
      try {
        await sentMessage.reactions.removeAll();
      } catch (err) {
        // ignore
      }

      try {
        client.off('voiceStateUpdate', voiceHandler);
      } catch (err) {
        // ignore
      }
    });
  },
};

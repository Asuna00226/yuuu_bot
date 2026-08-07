require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const { colorRoleNames, getColorFromButtonId } = require('./utils/colorSystem');

const deployCommands = async (client) => {
    try {
        const commands = [];

        const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`WARNING: The command at ${file} is missing a required 'data' or 'execute' property.`);
            }
        }

        const rest = new REST().setToken(process.env.BOT_TOKEN);
        const guildId = process.env.GUILD_ID;
        const route = guildId
            ? Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
            : Routes.applicationCommands(process.env.CLIENT_ID);

        const logLabel = guildId ? `指定伺服器 ${guildId}` : 'global';
        console.log(`正在更新所有指令到${logLabel}...`);

        const data = await rest.put(route, { body: commands });

        if (guildId) {
            const renameCommand = Array.isArray(data) ? data.find((command) => command.name === 'rename') : null;
            if (renameCommand && process.env.RENAME_ROLE_NAME) {
                const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
                if (guild) {
                    const role = guild.roles.cache.find((item) => item.name === process.env.RENAME_ROLE_NAME);
                    if (role) {
                        await rest.put(
                            Routes.guildApplicationCommandPermissions(process.env.CLIENT_ID, guildId, renameCommand.id),
                            {
                                body: {
                                    permissions: [
                                        {
                                            id: role.id,
                                            type: ApplicationCommandPermissionType.Role,
                                            permission: true,
                                        },
                                    ],
                                },
                            }
                        );
                        console.log(`已為身分組 ${role.name} 開啟 /rename 的使用權限`);
                    }
                }
            }
        }

        console.log(`已更新所有指令到${logLabel}`);
    } catch (error) {
        console.error('Error deploying commands:', error);
        throw error;
    }
}

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    MessageFlags,
    Events,
    ApplicationCommandPermissionType
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();

const APEX_WATCH_CHANNEL_ID = process.env.APEX_WATCH_CHANNEL_ID || '1534193088489062543';
const APEX_VOICE_STATUS = '/apex_draw 開啟分隊系統';

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const enteredWatchChannel = newState.channelId === APEX_WATCH_CHANNEL_ID
        && oldState.channelId !== APEX_WATCH_CHANNEL_ID;

    if (!enteredWatchChannel || newState.member?.user.bot) return;

    client.rest.put(`/channels/${APEX_WATCH_CHANNEL_ID}/voice-status`, {
        body: { status: APEX_VOICE_STATUS },
    }).then(() => {
        console.log(`已更新語音頻道狀態: ${APEX_VOICE_STATUS}`);
    }).catch((error) => {
        console.error('更新 Apex 語音頻道狀態失敗:', error);
    });
});



const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`The Command ${filePath} is missing a required "data" or "execute" property.`)
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`${client.user.tag}已上線，準備就緒！`);

    //Deploy Commandsㄋ
    try {
        await deployCommands(client);
    } catch (error) {
        console.error('指令同步失敗，停止 bot。', error);
        await client.destroy();
        process.exitCode = 1;
        return;
    }
    console.log(`指令已同步`);

    const statusType = process.env.BOT_STATUS || 'online';
    const activityType = process.env.ACTIVITY_TYPE || 'PLAYING';
    const activityName = process.env.ACTIVITY_NAME || 'Discord';

    const activityTypeMap = {
        'PLAYING': ActivityType.Playing,
        'WATCHING': ActivityType.Watching,
        'LISTENING': ActivityType.Listening,
        'STREAMING': ActivityType.Streaming,
        'COMPETING': ActivityType.Competing
    };

    const statusMap = {
        'online': PresenceUpdateStatus.Online,
        'idle': PresenceUpdateStatus.Idle,
        'dnd': PresenceUpdateStatus.DoNotDisturb,
        'invisible': PresenceUpdateStatus.Invisible
    };

    client.user.setPresence({
        status: statusMap[statusType],
        activities: [{
            name: activityName,
            type: activityTypeMap[activityType]
        }]
    });
    
    console.log(`上線狀態已設置為: ${statusType}`);
    console.log(`活動已設置為: ${activityType} ${activityName}`)
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        const selectedHexCode = getColorFromButtonId(interaction.customId);
        if (!selectedHexCode) return;

        if (!interaction.inGuild() || !interaction.guild) {
            return interaction.reply({ content: '這個按鈕只能在伺服器內使用。', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guild = interaction.guild;
            await guild.roles.fetch();
            const selectedRole = guild.roles.cache.find((role) => role.name === selectedHexCode);
            if (!selectedRole) {
                return interaction.editReply({ content: '找不到對應的顏色身分組，請通知管理員重新建立角色。' });
            }
            if (!selectedRole.editable) {
                return interaction.editReply({ content: '我無法管理這個顏色身分組，請確認機器人的角色位置。' });
            }

            const member = await guild.members.fetch(interaction.user.id);
            const currentColorRoles = member.roles.cache.filter((role) => colorRoleNames.has(role.name));
            const unmanageableRole = currentColorRoles.find((role) => role.id !== selectedRole.id && !role.editable);
            if (unmanageableRole) {
                return interaction.editReply({ content: '我無法移除你現有的顏色身分組，請通知管理員確認機器人的角色位置。' });
            }

            const rolesToRemove = currentColorRoles
                .filter((role) => role.id !== selectedRole.id)
                .map((role) => role.id);
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove, 'Color system selection');
            }
            if (!member.roles.cache.has(selectedRole.id)) {
                await member.roles.add(selectedRole, 'Color system selection');
            }

            return interaction.editReply({ content: `你的名字顏色已更換為 <@&${selectedRole.id}>。` });
        } catch (error) {
            console.error('更換名字顏色失敗:', error);
            return interaction.editReply({ content: '更換名字顏色時發生錯誤。' });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        // console.error(`No command matching ${interaction.commandName} was found.`)
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral});
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral});
        }
    }
});


const requiredEnvironmentVariables = ['BOT_TOKEN', 'CLIENT_ID'];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter((name) => !process.env[name]);

if (missingEnvironmentVariables.length > 0) {
    console.error(`缺少必要環境變數: ${missingEnvironmentVariables.join(', ')}`);
    process.exitCode = 1;
} else {
    client.login(process.env.BOT_TOKEN).catch((error) => {
        console.error('Bot 登入失敗:', error);
        process.exitCode = 1;
    });
}
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEmojiMarkup } = require('../utils/getEmojiMarkup');

const GRID_ROWS = 4;
const GRID_COLUMNS = 6;
const FRAME_DELAY_MS = 700;
const COOLDOWN_MS = 2 * 60 * 1000;
const ROW_PREFIX = '.';
const EMPTY_CELL = '';

let cooldownUntil = 0;

function getEmoji(name) {
  return getEmojiMarkup(name) || `:${name}:`;
}

function buildPath() {
  const path = [];

  for (let column = GRID_COLUMNS - 1; column >= 0; column -= 1) {
    const rows = column % 2 === 1
      ? Array.from({ length: GRID_ROWS }, (_, row) => row)
      : Array.from({ length: GRID_ROWS }, (_, row) => GRID_ROWS - 1 - row);

    for (const row of rows) {
      path.push({ row, column });
    }
  }

  return path;
}

function buildGridFrame(path, currentIndex, cloud, farmer, farmerSuffix = '') {
  const currentPosition = path[currentIndex];
  const visited = new Set(path.slice(0, currentIndex).map(({ row, column }) => `${row}:${column}`));
  const rows = [];

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const cells = [];

    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const key = `${row}:${column}`;
      const isCurrent = currentPosition?.row === row && currentPosition?.column === column;
      cells.push(isCurrent ? `${farmer}${farmerSuffix}` : visited.has(key) ? EMPTY_CELL : cloud);
    }

    rows.push(`${ROW_PREFIX}${cells.join('')}`);
  }

  return rows.join('\n');
}

function buildHeaderFrame(man, farmer, leadingSpaces, trail = '', farmerGap = '') {
  return `${ROW_PREFIX}${leadingSpaces}${man}${trail}${farmer ? `${farmerGap}${farmer}` : ''}`;
}

function buildFrame(path, currentIndex, cloud, farmer, man, farmerSuffix = '') {
  return `${ROW_PREFIX}${man}\n${buildGridFrame(path, currentIndex, cloud, farmer, farmerSuffix)}`;
}

function buildIntroFrames(cloud, farmer, man) {
  const introFrames = [
  `.${man} ${farmer}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}`,
  `.${man}𓍯𓂃 ${farmer}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}`,
  `.${man}　　　 ${farmer}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}`,
  `.${man}　　　　 ${farmer}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}`,
  `.${man}　　　　　 ${farmer}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}
.${cloud}${cloud}${cloud}${cloud}${cloud}${cloud}`,
  ];

  return introFrames;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('開始採棉花。'),
  buildFrame,
  buildPath,
  buildIntroFrames,

  async execute(interaction) {
    const now = Date.now();
    if (now < cooldownUntil) {
      const remainingSeconds = Math.ceil((cooldownUntil - now) / 1000);
      return interaction.reply({
        content: `泥溝快要過勞了，讓他休息一下。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    cooldownUntil = now + COOLDOWN_MS;

    const cloud = getEmoji('cloud');
    const farmer = getEmoji('farmer_tone5');
    const man = getEmoji('man_walking_facing_right_tone1');
    const path = buildPath();
    const frameDelay = Number(process.env.WORK_FRAME_DELAY_MS) || FRAME_DELAY_MS;
    const introFrames = buildIntroFrames(cloud, farmer, man);

    await interaction.reply({ content: introFrames[0] });
    const message = await interaction.fetchReply();

    for (const frame of introFrames.slice(1)) {
      await wait(frameDelay);
      await message.edit({ content: frame });
    }

    for (let index = 0; index < path.length; index += 1) {
      await wait(frameDelay);
      await message.edit({ content: buildFrame(path, index, cloud, farmer, man) });
    }

    await wait(frameDelay);
    await message.edit({
      content: buildFrame(path, path.length - 1, cloud, farmer, man, ' 採完了。'),
    });
  },
};

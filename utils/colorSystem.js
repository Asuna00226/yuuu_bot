const colorGroups = require('../color_roles.json');

const COLOR_ROLE_ANCHOR_ID = process.env.COLOR_SYSTEM_ROLE_ANCHOR_ID || '1533777365254148237';
const COLOR_PANEL_CHANNEL_ID = process.env.COLOR_SYSTEM_PANEL_CHANNEL_ID || '1534953992994426970';
const colorRoleNames = new Set(colorGroups.flatMap((group) => group.colors));

function isOwner(interaction) {
  const ownerIds = (process.env.OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return interaction.user.id === interaction.guild.ownerId || ownerIds.includes(interaction.user.id);
}

function getColorFromButtonId(customId) {
  const match = /^color_system_([a-z]+)_(\d{2})$/.exec(customId);
  if (!match) return null;

  const group = colorGroups.find((item) => item.id === match[1]);
  const colorIndex = Number.parseInt(match[2], 10) - 1;
  if (!group || colorIndex < 0 || colorIndex >= group.colors.length) return null;

  return group.colors[colorIndex];
}

module.exports = {
  COLOR_PANEL_CHANNEL_ID,
  COLOR_ROLE_ANCHOR_ID,
  colorGroups,
  colorRoleNames,
  getColorFromButtonId,
  isOwner,
};
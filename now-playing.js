// The "Now playing" card: posted when a song starts (and by /np), with
// buttons to control playback.
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");
const { QueueRepeatMode, useQueue } = require("discord-player");

const LOOP_LABELS = {
    [QueueRepeatMode.OFF]: "Loop off",
    [QueueRepeatMode.TRACK]: "Looping this song",
    [QueueRepeatMode.QUEUE]: "Looping the queue",
};
// The 🔁 button cycles through these
const LOOP_CYCLE = [QueueRepeatMode.OFF, QueueRepeatMode.QUEUE, QueueRepeatMode.TRACK];

function nowPlayingEmbed(queue, track, { progressBar = false } = {}) {
    const next = queue.tracks.at(0);
    const embed = new EmbedBuilder()
        .setAuthor({ name: queue.node.isPaused() ? "⏸  Paused" : "🎶  Now playing" })
        .setTitle(track.title)
        .setURL(track.url || null)
        .setThumbnail(track.thumbnail || null)
        .addFields(
            { name: "Artist", value: track.author || "Unknown", inline: true },
            { name: "Duration", value: track.duration || "Live", inline: true },
            {
                name: "Requested by",
                value: track.requestedBy ? `${track.requestedBy}` : "Unknown",
                inline: true,
            }
        )
        .setFooter({
            text: `${next ? `Up next: ${next.title}` : "Nothing up next"}  •  ${LOOP_LABELS[queue.repeatMode]}`,
        })
        .setColor("e8d5ac");
    if (progressBar) {
        // longer bars wrap next to the thumbnail
        embed.setDescription(queue.node.createProgressBar({ length: 12, queue: false }));
    }
    return embed;
}

function controls(queue) {
    const button = (id, emoji, style = ButtonStyle.Secondary) =>
        new ButtonBuilder().setCustomId(`np:${id}`).setEmoji(emoji).setStyle(style);
    return [
        new ActionRowBuilder().addComponents(
            button("previous", "⏮️").setDisabled(queue.history.isEmpty()),
            button("pause", queue.node.isPaused() ? "▶️" : "⏸️"),
            button("skip", "⏭️"),
            button(
                "loop",
                queue.repeatMode === QueueRepeatMode.TRACK ? "🔂" : "🔁",
                queue.repeatMode === QueueRepeatMode.OFF ? ButtonStyle.Secondary : ButtonStyle.Success
            ),
            button("stop", "⏹️", ButtonStyle.Danger)
        ),
    ];
}

// The latest card per server, so its buttons can be removed once it's stale
const cards = new Map();

async function retireCard(guildId) {
    const card = cards.get(guildId);
    cards.delete(guildId);
    await card?.edit({ components: [] }).catch(() => null);
}

async function postNowPlaying(queue, track) {
    await retireCard(queue.guild.id);
    const card = await queue.metadata.channel.send({
        embeds: [nowPlayingEmbed(queue, track)],
        components: controls(queue),
    });
    cards.set(queue.guild.id, card);
}

// Keeps the card's paused/loop state and "Up next" in sync after the queue
// changes. Debounced, so e.g. removing 10 songs edits the card once.
const pendingRefreshes = new Map();
function refreshCard(queue) {
    const guildId = queue.guild.id;
    clearTimeout(pendingRefreshes.get(guildId));
    pendingRefreshes.set(
        guildId,
        setTimeout(() => {
            pendingRefreshes.delete(guildId);
            const card = cards.get(guildId);
            if (!card || !queue.currentTrack) return;
            card.edit({
                embeds: [nowPlayingEmbed(queue, queue.currentTrack)],
                components: controls(queue),
            }).catch(() => null);
        }, 300)
    );
}

const notice = (text) => ({
    embeds: [new EmbedBuilder().setDescription(text).setColor("e8d5ac")],
});

async function handleButton(interaction) {
    const queue = useQueue(interaction.guild.id);
    if (!queue?.currentTrack) {
        return interaction.update({ components: [] });
    }
    if (interaction.member.voice.channelId !== queue.channel?.id) {
        return interaction.reply({
            content: "Join my voice channel to use these buttons!",
            flags: MessageFlags.Ephemeral,
        });
    }

    const action = interaction.customId.slice("np:".length);
    const user = interaction.user;
    const track = queue.currentTrack;
    switch (action) {
    case "pause":
        queue.node.setPaused(!queue.node.isPaused());
        break;
    case "loop": {
        const i = LOOP_CYCLE.indexOf(queue.repeatMode);
        queue.setRepeatMode(LOOP_CYCLE[(i + 1) % LOOP_CYCLE.length]);
        break;
    }
    case "skip":
        queue.node.skip();
        return interaction.reply(notice(`⏭️  ${user} skipped **${track.title}**`));
    case "previous":
        if (queue.history.isEmpty()) {
            return interaction.reply({
                content: "There's no previous song!",
                flags: MessageFlags.Ephemeral,
            });
        }
        await queue.history.previous();
        return interaction.reply(notice(`⏮️  ${user} went back to the previous song`));
    case "stop":
        queue.delete();
        return interaction.reply(notice(`⏹️  ${user} stopped the music`));
    default:
        return;
    }

    // pause/loop: update the message the button was on (the card or a /np
    // reply), and the card if that was a /np reply
    const isCard = cards.get(queue.guild.id)?.id === interaction.message.id;
    const progressBar = !isCard && interaction.message.embeds[0]?.description != null;
    await interaction.update({
        embeds: [nowPlayingEmbed(queue, track, { progressBar })],
        components: controls(queue),
    });
    if (!isCard) refreshCard(queue);
}

module.exports = {
    nowPlayingEmbed,
    controls,
    postNowPlaying,
    refreshCard,
    retireCard,
    handleButton,
};

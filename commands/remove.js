const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");

// Parses "1,5,9-12" into 0-indexed positions. Returns an error string if any
// part is invalid or outside 1..queueSize.
function parsePositions(input, queueSize) {
    const positions = new Set();
    for (const part of input.split(",").map((p) => p.trim()).filter(Boolean)) {
        const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) return `\`${part}\` isn't a number or range like \`9-12\``;
        const start = Number(match[1]);
        const end = Number(match[2] ?? match[1]);
        if (start > end) return `\`${part}\` is backwards, try \`${end}-${start}\``;
        if (start < 1 || end > queueSize) {
            return `\`${part}\` is outside the queue (positions 1-${queueSize})`;
        }
        for (let i = start; i <= end; i++) positions.add(i - 1);
    }
    if (positions.size === 0) return "Please give at least one position";
    return [...positions];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Removes songs from the queue")
        .addStringOption((option) =>
            option
                .setName("index")
                .setDescription(
                    "Queue positions to remove, e.g. 3 or 1,5,9-12 (queue starts at position 1)"
                )
                .setRequired(true)
        ),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue || queue.getSize() === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            "The queue is empty! Please add some songs to use this command"
                        )
                        .setColor("e8d5ac"),
                ],
            });
        }
        const positions = parsePositions(
            interaction.options.getString("index", true),
            queue.getSize()
        );
        if (typeof positions === "string") {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder().setDescription(positions).setColor("e8d5ac"),
                ],
            });
        }
        try {
            // Look the tracks up before removing any, so positions don't shift
            const tracks = queue.tracks.toArray();
            const removed = positions
                .sort((a, b) => a - b)
                .map((i) => tracks[i]);
            removed.forEach((track) => queue.removeTrack(track));

            const shown = removed.slice(0, 10).map((t) => `**${t.title}**`);
            if (removed.length > 10) shown.push(`...and ${removed.length - 10} more`);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            `Removed ${removed.length} song${removed.length === 1 ? "" : "s"} from the queue:\n${shown.join("\n")}`
                        )
                        .setColor("e8d5ac"),
                ],
            });
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

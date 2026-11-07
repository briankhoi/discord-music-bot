const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");

const reply = (interaction, text) =>
    interaction.reply({
        embeds: [new EmbedBuilder().setDescription(text).setColor("e8d5ac")],
    });

// "90", "1:30" or "1:02:30" -> milliseconds, or null if it isn't a time
function parseTime(text) {
    if (!/^\d+(:\d{1,2}){0,2}$/.test(text.trim())) return null;
    return text
        .trim()
        .split(":")
        .reduce((total, part) => total * 60 + Number(part), 0) * 1000;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Jumps to a time in the current song")
        .addStringOption((option) =>
            option
                .setName("time")
                .setDescription("Where to jump to, e.g. 1:30 or 90 (seconds)")
                .setRequired(true)
        ),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue?.currentTrack) {
            return reply(interaction, "The queue is empty! Please add some songs to use this command");
        }
        const input = interaction.options.getString("time", true);
        const ms = parseTime(input);
        const track = queue.currentTrack;
        if (ms === null) {
            return reply(interaction, `\`${input}\` isn't a time, try something like \`1:30\` or \`90\``);
        }
        if (ms >= track.durationMS) {
            return reply(interaction, `**${track.title}** is only ${track.duration} long!`);
        }
        try {
            await interaction.deferReply();
            const ok = await queue.node.seek(ms);
            return interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(ok ? `Jumped to ${input} in **${track.title}**` : "Couldn't seek in this song!")
                        .setColor("e8d5ac"),
                ],
            });
        } catch (e) {
            return interaction.followUp(`Something went wrong: ${e}`);
        }
    },
};

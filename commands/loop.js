const { QueueRepeatMode, useQueue } = require("discord-player");
const { refreshCard } = require("../now-playing");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const MODES = {
    queue: [QueueRepeatMode.QUEUE, "Looping the queue"],
    song: [QueueRepeatMode.TRACK, "Looping this song"],
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Loops the queue or the current song")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("What to loop (default: the queue)")
                .addChoices(
                    { name: "queue", value: "queue" },
                    { name: "song", value: "song" }
                )
        ),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue) {
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
        try {
            const [mode, message] = MODES[interaction.options.getString("mode") ?? "queue"];
            queue.setRepeatMode(mode);
            refreshCard(queue);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(message)
                        .setColor("e8d5ac"),
                ],
            });
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

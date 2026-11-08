const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");
const { refreshCard } = require("../now-playing");

const reply = (interaction, text) =>
    interaction.reply({
        embeds: [new EmbedBuilder().setDescription(text).setColor("e8d5ac")],
    });

module.exports = {
    data: new SlashCommandBuilder()
        .setName("swap")
        .setDescription("Swaps two songs in the queue")
        .addIntegerOption((option) =>
            option
                .setName("first")
                .setDescription("Queue position of the first song (queue starts at position 1)")
                .setMinValue(1)
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option
                .setName("second")
                .setDescription("Queue position of the second song")
                .setMinValue(1)
                .setRequired(true)
        ),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue || queue.getSize() === 0) {
            return reply(interaction, "The queue is empty! Please add some songs to use this command");
        }
        const first = interaction.options.getInteger("first", true);
        const second = interaction.options.getInteger("second", true);
        const size = queue.getSize();
        if (first > size || second > size) {
            return reply(interaction, `The queue only has ${size} song${size === 1 ? "" : "s"}!`);
        }
        if (first === second) {
            return reply(interaction, "Those are the same song!");
        }
        try {
            const tracks = queue.tracks.toArray();
            queue.node.swap(first - 1, second - 1);
            refreshCard(queue);
            return reply(
                interaction,
                `Swapped **${tracks[first - 1].title}** (${first}) and **${tracks[second - 1].title}** (${second})!`
            );
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pauses the queue"),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            "The queue is empty! Please add some songs to use this command",
                        )
                        .setColor("e8d5ac"),
                ],
            });
        }
        try {
            if (queue.node.isPaused()) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("The queue is already paused!")
                            .setColor("e8d5ac"),
                    ],
                });
            } else {
                queue.node.setPaused(true);
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("The queue has been paused!")
                            .setColor("e8d5ac"),
                    ],
                });
            }
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

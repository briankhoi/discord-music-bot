const { useQueue } = require("discord-player");
const { refreshCard } = require("../now-playing");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Loops the queue"),
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
            queue.setRepeatMode(2);
            refreshCard(queue);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("Looping the queue")
                        .setColor("e8d5ac"),
                ],
            });
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

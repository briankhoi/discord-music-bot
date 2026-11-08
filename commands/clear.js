const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");
const { refreshCard } = require("../now-playing");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Removes every song from the queue (the current song keeps playing)"),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        const count = queue?.getSize() ?? 0;
        if (count === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription("The queue is already empty!")
                        .setColor("e8d5ac"),
                ],
            });
        }
        queue.tracks.clear();
        refreshCard(queue);
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`Cleared ${count} song${count === 1 ? "" : "s"} from the queue!`)
                    .setColor("e8d5ac"),
            ],
        });
    },
};

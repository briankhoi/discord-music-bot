const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");
const { nowPlayingEmbed, controls } = require("../now-playing");
module.exports = {
    data: new SlashCommandBuilder()
        .setName("np")
        .setDescription("Displays information about the current playing song"),
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
            await interaction.deferReply();
            return interaction.followUp({
                embeds: [
                    nowPlayingEmbed(queue, queue.currentTrack, { progressBar: true }),
                ],
                components: controls(queue),
            });
        } catch (e) {
            return interaction.followUp(`Something went wrong!\n ${e}`);
        }
    },
};

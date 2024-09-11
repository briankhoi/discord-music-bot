const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips to the next track in the queue'),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            'The queue is empty! Please add some songs to use this command',
                        )
                        .setColor('e8d5ac'),
                ],
            });
        }
        try {
            const skippedTrack = queue.currentTrack.title;
            queue.node.skip();
            let endMessage = '';
            if (queue.getSize() == 0) {
                endMessage =
                    'No more songs left in queue, leaving the voice channel!';
            }
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            `Skipped **${skippedTrack}**\n${endMessage}`,
                        )
                        .setColor('e8d5ac'),
                ],
            });
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

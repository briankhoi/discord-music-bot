const { useQueue } = require('discord-player');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');


// function handleReactions(
//     interaction,
//     message,
//     collectorFilter,
//     currentPage,
//     tracks,
//     currentTrack,
//     queue,
// ) {
//     try {
//         message
//             .awaitReactions({
//                 filter: collectorFilter,
//                 max: 1,
//                 time: 15000,
//             })
//             .then(async (collected) => {
//                 // console.log('test');
//                 // console.log(collected.first());
//                 const reaction = collected.first();
//                 // need to remove user's emoji after
//                 if (reaction.emoji.name === '⏪') {
//                     currentPage = 0;
//                 } else if (reaction.emoji.name === '◀️' && currentPage > 0) {
//                     currentPage--;
//                 } else if (
//                     reaction.emoji.name === '▶️' &&
//                     currentPage < tracks.length - 1
//                 ) {
//                     currentPage++;
//                 } else if (reaction.emoji.name === '⏩') {
//                     currentPage = tracks.length - 1;
//                 } else {
//                     return;
//                 }
//                 // update the queue embed display
//                 const editedQueueDisplay = createQueueEmbed(
//                     interaction,
//                     queue,
//                     tracks,
//                     currentPage,
//                 );
//                 interaction.editReply({ embeds: [editedQueueDisplay] });
//                 handleReactions(
//                     interaction,
//                     message,
//                     collectorFilter,
//                     currentPage,
//                     tracks,
//                     currentTrack,
//                     queue,
//                 );
//             },
//             )
//             .catch((collected) => {
//                 message.reply(`reaction collector error: ${collected}`);
//                 console.log('stack trace:');
//                 console.log(collected, collected.stack);
//             });
//     } catch (e) {
//         return interaction.editReply(`Something went wrong: ${e}`);
//     }
// }

function createcurrentPageString(tracks, currentPage) {
    let page = '';
    const queueExists = tracks[currentPage]?.length ?? false;
    if (queueExists) {
        for (let i = 1; i <= tracks[currentPage].length; i++) {
            page += `**${i + currentPage * 10}**. ${tracks[currentPage][i - 1]}\n`;
        }
    }
    return page;
}

function createQueueEmbed(interaction, queue, tracks, currentPage) {
    const currentTrack = queue.currentTrack;
    const queueString = `🔊  Current Track: **${currentTrack}**\n\n🔊  Queue:\n${createcurrentPageString(
        tracks,
        currentPage,
    )}`;
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${interaction.guild.name}'s Queue`,
            // iconURL: interaction.guild.icon,
        })
        .setDescription(queueString)
        .setThumbnail(currentTrack.thumbnail)
        .setFooter({
            text: `Page ${currentPage + 1} of ${
                tracks.length
            }  |  Tracks Queued: ${queue.getSize()}  |  Total Duration: ${
                queue.durationFormatted
            }`,
        })
        .setColor('e8d5ac');
    return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Lists all the songs in the queue'),
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
            await interaction.deferReply();
            // const currentTrack = queue.currentTrack;
            const songsPerPage = 10;
            const tracks = [];
            let currentPage = 0;
            // divide the list of tracks into a 2d array with 10 songs per element
            for (let i = 0; i < queue.getSize(); i += songsPerPage) {
                const songs = queue.tracks.toArray().slice(i, i + songsPerPage);
                tracks.push(songs);
            }
            const message = await createQueueEmbed(
                interaction,
                queue,
                tracks,
                currentPage,
            );

            // reactions only work for the person who used the cmd
            const collectorFilter = (reaction, user) => {
                return (
                    ['⏪', '◀️', '▶️', '⏩'].includes(reaction.emoji.name) &&
                    user.id === interaction.user.id
                );
            };

            const collector = message.createReactionCollector({ filter: collectorFilter, time: 30000 });
            collector.on('collect', (reaction) => {
                if (reaction.emoji.name === '⏪') {
                    currentPage = 0;
                } else if (reaction.emoji.name === '◀️' && currentPage > 0) {
                    currentPage--;
                } else if (
                    reaction.emoji.name === '▶️' &&
                    currentPage < tracks.length - 1
                ) {
                    currentPage++;
                } else if (reaction.emoji.name === '⏩') {
                    currentPage = tracks.length - 1;
                }
                createQueueEmbed(interaction, queue, tracks, currentPage);
                // console.log(`Collected ${reaction.emoji.name} from ${user.tag}`);
            });
            // const message = await interaction.editReply({
            //     embeds: [queueDisplay],
            // });

            // handleReactions(
            //     interaction,
            //     message,
            //     collectorFilter,
            //     currentPage,
            //     tracks,
            //     currentTrack,
            //     queue,
            // );

            // this ensures that the reactions are always placed in order
            return message
                .react('⏪')
                .then(() => message.react('◀️'))
                .then(() => message.react('▶️'))
                .then(() => message.react('⏩'))
                .catch((e) => console.log(e));
            // const collector = message.createReactionCollector({ filter: collectorFilter, time: 15000 });
        } catch (e) {
            console.log(e);
            return await interaction.editReply(`Something went wrong: ${e}`);
        }
    },
};

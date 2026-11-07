const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
} = require("discord.js");
const { useMainPlayer, useQueue } = require("discord-player");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song in your voice channel")
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("The name or link to the song or playlist")
                .setRequired(true)
        ),
    async execute(interaction) {
        const player = useMainPlayer();
        const channel = interaction.member.voice.channel;
        if (!channel)
        {return interaction.reply({
            embeds: [
                new EmbedBuilder().setDescription(
                    "You are not connected to a voice channel!"
                ),
            ],
        });}

        // Without these, joining just times out after ~20s with no useful error
        const botPermissions = channel.permissionsFor(interaction.guild.members.me);
        if (!channel.joinable || !botPermissions?.has(PermissionFlagsBits.Speak)) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            `I don't have permission to join and speak in **${channel.name}**! Please give me View Channel, Connect and Speak there.`
                        )
                        .setColor("e8d5ac"),
                ],
            });
        }

        const query = interaction.options.getString("query", true);
        await interaction.deferReply();

        try {
            let queue = useQueue(interaction.guild.id);

            // checks size of queue before and after adding items to see if a single song was added or multiple
            const beforeSize = queue?.getSize() ?? 0;

            const { track } = await player.play(channel, query, {
                // Tags every queued track, including the one that starts playing
                // right away (the loop below misses that one for playlists)
                requestedBy: interaction.user,
                nodeOptions: {
                    metadata: interaction,
                    // No command uses volume/EQ/filters, and running that JS
                    // audio pipeline on every frame makes playback jittery.
                    disableVolume: true,
                    disableEqualizer: true,
                    disableBiquad: true,
                    disableFilterer: true,
                    disableResampler: true,
                },
            });

            // update queue after track(s) have been added
            queue = useQueue(interaction.guild.id);
            const afterSize = queue?.getSize() ?? 0;
            const songsAddedToQueue = afterSize - beforeSize;

            // first usage of player/single song added
            if (!queue || songsAddedToQueue == 0 || songsAddedToQueue == 1) {
                track.requestedBy = interaction.user;
            } else {
                // handles cases of multiple songs (playlist) being loaded at once
                for (let i = beforeSize; i < afterSize; i++) {
                    queue.tracks.toArray()[i].requestedBy = interaction.user;
                }
            }
            return interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(
                            `Added **${track.title}** to the queue!`
                        )
                        .setColor("e8d5ac"),
                ],
            });
        } catch (e) {
            return await interaction.followUp(`Something went wrong: ${e}`);
        }
    },
};

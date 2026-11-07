const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useMainPlayer, useQueue } = require("discord-player");

// YouTube titles/channels look like "Artist - Song (Official Video)" by
// "ArtistVEVO"; reduce them to plain artist and song names for the search.
function cleanTrackInfo(track) {
    const artist = track.author
        .replace(/\s*-\s*Topic$|VEVO$|\s+Official$/i, "")
        .trim();
    const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const title = track.title
        .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
        .replace(new RegExp(`^${escapedArtist}\\s*[-–]\\s*`, "i"), "")
        .trim();
    return { artist, title };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lyrics")
        .setDescription("Displays the lyrics of the current song"),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue) {
            return await interaction.reply({
                embeds: [
                    new EmbedBuilder().setDescription(
                        "The queue is empty! Please add some songs to use this command"
                    ),
                ],
            });
        }
        try {
            await interaction.deferReply();

            const { artist, title } = cleanTrackInfo(queue.currentTrack);
            const player = useMainPlayer();
            const search = (params) =>
                player.lyrics
                    .search(params)
                    .then((results) => results.find((l) => l.plainLyrics))
                    .catch(() => null);
            const lyrics =
                (await search({ trackName: title, artistName: artist })) ??
                (await search({ q: `${artist} ${title}` }));
            if (!lyrics)
            {
                return interaction.followUp({
                    content: "No lyrics found!",
                    ephemeral: false,
                });
            }

            const trimmedLyrics = lyrics.plainLyrics.substring(0, 1997);

            const embed = new EmbedBuilder()
                .setTitle(lyrics.trackName)
                .setThumbnail(queue.currentTrack.thumbnail)
                .setAuthor({ name: lyrics.artistName })
                .setDescription(
                    trimmedLyrics.length === 1997
                        ? `${trimmedLyrics}...`
                        : trimmedLyrics
                )
                .setColor("e8d5ac");

            return interaction.followUp({ embeds: [embed] });
        } catch (e) {
            return await interaction.followUp(`Something went wrong!\n ${e}`);
        }
    },
};

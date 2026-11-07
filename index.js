// Require the necessary discord.js classes
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    EmbedBuilder,
} = require("discord.js");
const { Player } = require("discord-player");
const { SpotifyExtractor } = require("@discord-player/extractor");
const { PatchedYoutubeExtractor } = require("./youtube-extractor");
const { postNowPlaying, refreshCard, retireCard, handleButton } = require("./now-playing");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config();

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        "GuildVoiceStates",
    ],
});

const player = new Player(client);

async function setupPlayer() {
    await player.extractors.register(PatchedYoutubeExtractor, {
        cookie: process.env.YT_COOKIE,
    });
    await player.extractors.register(SpotifyExtractor, {});
    // await player.extractors.loadDefault();
}

// Spotify's embed data no longer includes cover art, and tracks from Spotify
// playlists/albums get broken /tracks/<uid> links. Fix both for the song
// that's playing (one request per song, instead of one per queued track).
async function fixSpotifyTrack(track) {
    const id = track.metadata?.source?.uri?.split(":")[2];
    if (track.source !== "spotify" || !id) return;
    track.url = `https://open.spotify.com/track/${id}`;
    const res = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`,
        { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) track.thumbnail = (await res.json()).thumbnail_url ?? track.thumbnail;
}

setupPlayer().then(() => {
    player.events.on("playerStart", async (queue, track) => {
        await fixSpotifyTrack(track).catch(() => {});
        await postNowPlaying(queue, track).catch(console.error);
    });
    player.events.on("queueDelete", (queue) => retireCard(queue.guild.id));
    // Keep the card's "Up next" current as songs are added and removed
    for (const event of ["audioTrackAdd", "audioTracksAdd", "audioTrackRemove", "audioTracksRemove"]) {
        player.events.on(event, (queue) => refreshCard(queue));
    }
    // A track that can't be streamed is skipped; say so instead of failing silently
    player.events.on("playerError", (queue, error, track) => {
        console.error(`[playerError] ${track?.title}:`, error.message, error.cause ?? "");
        queue.metadata.channel
            .send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`Couldn't play **${track?.title}**, skipping!`)
                        .setColor("e8d5ac"),
                ],
            })
            .catch(() => {});
    });
    player.events.on("error", (queue, error) => {
        console.error(`[queue error] ${queue.guild.name}:`, error.message);
    });
    /*
		Dynamic command retrieval -> Looks in the commands subdirectory and filters out all the non-js files. Afterwards, set the js files as commands
		Sourced from DiscordJS documentation
	*/
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(
                `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
            );
        }
    }

    // Error handling incase something goes wrong while executing the command
    // Sourced from DiscordJS documentation
    client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isButton() && interaction.customId.startsWith("np:")) {
            return handleButton(interaction).catch(console.error);
        }
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(
            interaction.commandName
        );

        if (!command) {
            console.error(
                `No command matching ${interaction.commandName} was found.`
            );
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            // Ephemeral meaning that the message is displayed only to the user who executed the command
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }
    });

    // When the client is ready, run this code (only once)
    // We use 'c' for the event parameter to keep it separate from the already defined 'client'
    client.once(Events.ClientReady, (c) => {
        console.log(`Ready! Logged in as ${c.user.tag}`);
    });

    // Log in to Discord with your client's token
    client.login(process.env.DISCORD_TOKEN);
});

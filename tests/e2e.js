// End-to-end test: boots the real bot (index.js), joins a real voice channel,
// and runs the slash commands with simulated interactions, checking replies,
// the queue, and that audio is actually being sent.
//
// Needs E2E_GUILD_ID and E2E_VOICE_CHANNEL (a voice channel name, ideally an
// empty one) in .env. Stop the bot before running: only one connection per
// server can be in voice. Run with `npm test`.
const path = require("node:path");
const root = path.join(__dirname, "..") + "/";
process.chdir(root);
require("dotenv").config();
// discord-player's voice library (a dependency of discord-player), used to
// measure audio frame timing
const voip = require("discord-voip");

// Frame-timing instrumentation (jitter): discord-voip sends one frame per 20ms
let lastDispatch = 0;
let currentStep = "startup";
const gaps = [];
const origDispatch = voip.AudioPlayer.prototype._stepDispatch;
voip.AudioPlayer.prototype._stepDispatch = function () {
    const now = performance.now();
    if (this.state.status === "playing" && lastDispatch) {
        gaps.push(now - lastDispatch);
        if (now - lastDispatch > 30) console.log(`   [late frame] ${(now - lastDispatch).toFixed(0)}ms during: ${currentStep}`);
    }
    lastDispatch = this.state.status === "playing" ? now : 0;
    return origDispatch.call(this);
};

require(root + "index.js");
const { useMainPlayer, useQueue, QueueRepeatMode } = require("discord-player");
const player = useMainPlayer();
const client = player.client;

const GUILD_ID = process.env.E2E_GUILD_ID;
const VOICE_CHANNEL = process.env.E2E_VOICE_CHANNEL;
if (!GUILD_ID || !VOICE_CHANNEL) {
    console.error("Set E2E_GUILD_ID and E2E_VOICE_CHANNEL in .env to run the e2e test.");
    process.exit(1);
}
const LINKS = {
    letMeGo: "https://www.youtube.com/watch?v=JvrVT2VGcvg",
    playlistFromLetMeGo:
        "https://www.youtube.com/watch?v=JvrVT2VGcvg&list=PLxA687tYuMWiI-ik0cXXZupIxyOLrypaM&index=5",
    mix: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ",
    spotifyTrack: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    spotifyAlbum: "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
};

const results = [];
const sent = []; // messages the bot posted to the text channel (e.g. "Started playing")
const started = []; // playerStart events
const playerErrors = [];
player.events.on("playerStart", (q, t) => started.push(t.title));
player.events.on("playerError", (q, e, t) => playerErrors.push(`${t?.title}: ${e.message}`));

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function waitFor(cond, ms = 30000, step = 250) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await cond()) return true;
        await sleep(step);
    }
    return false;
}
const embedText = (x) => {
    if (typeof x === "string") return x;
    if (x?.embeds?.length) {
        return x.embeds
            .map((e) => {
                const d = e.data ?? e;
                return [d.author?.name && `[author] ${d.author.name}`, d.title && `[title] ${d.title}`, d.description, d.footer?.text && `[footer] ${d.footer.text}`]
                    .filter(Boolean)
                    .join(" | ");
            })
            .join("\n");
    }
    return x?.content ?? JSON.stringify(x);
};

let guild, voiceChannel, requester;
async function run(name, args = {}, channelOverride) {
    currentStep = `/${name} ${JSON.stringify(args)}`;
    const replies = [];
    const message = { react: async () => {}, createReactionCollector: () => ({ on() {} }) };
    const interaction = {
        commandName: name,
        client,
        guild,
        user: requester,
        member: { voice: { channel: channelOverride ?? voiceChannel } },
        channel: { send: async (x) => (sent.push(embedText(x)), message) },
        options: { getString: (n) => args[n] ?? null },
        replied: false,
        deferred: false,
        isChatInputCommand: () => true,
        async reply(x) { this.replied = true; replies.push(embedText(x)); return message; },
        async deferReply() { this.deferred = true; },
        async followUp(x) { replies.push(embedText(x)); return message; },
        async editReply(x) { replies.push(embedText(x)); return message; },
    };
    await client.commands.get(name).execute(interaction);
    return replies.join("\n");
}

function check(name, ok, detail = "") {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

const queue = () => useQueue(GUILD_ID);
async function audioFlowing(ms = 4000) {
    const ap = queue()?.dispatcher?.audioPlayer;
    if (!ap || ap.state.status !== "playing") return { ok: false, why: `player status ${ap?.state.status}` };
    const before = ap.state.playbackDuration;
    await sleep(ms);
    const after = ap.state.playbackDuration ?? 0;
    return { ok: after - before >= ms * 0.9, why: `${after - before}ms of audio sent in ${ms}ms, missedFrames=${ap.state.missedFrames}` };
}
async function expectStart(title, label) {
    const ok = await waitFor(() => queue()?.currentTrack?.title === title && queue()?.node.isPlaying(), 45000);
    check(`${label}: "${title}" starts playing`, ok, `current=${queue()?.currentTrack?.title}`);
    if (ok) {
        const flow = await audioFlowing();
        check(`${label}: audio is streaming`, flow.ok, flow.why);
    }
}
const titles = () => queue().tracks.toArray().map((t) => t.title);

async function main() {
    await waitFor(() => client.isReady() && client.commands?.size > 0, 30000);
    guild = await client.guilds.fetch(GUILD_ID);
    voiceChannel = guild.channels.cache.find((c) => c.name === VOICE_CHANNEL && c.isVoiceBased());
    requester = (await guild.fetchOwner()).user;
    console.log(`Bot ready; testing in voice channel "${voiceChannel.name}" as requester ${requester.username}\n`);

    // --- /play permission check (simulated channel the bot can't join)
    const noPerms = { name: "locked", joinable: false, permissionsFor: () => ({ has: () => false }) };
    let out = await run("play", { query: LINKS.letMeGo }, noPerms);
    check("/play in a channel without permission replies with a clear message", /permission to join/.test(out), out);

    // --- /play single video
    out = await run("play", { query: LINKS.letMeGo });
    check("/play single video replies 'Added'", /Added \*\*Let Me Go\*\*/.test(out), out);
    queue().options.pauseOnEmpty = false; // the test channel is empty; keep playing anyway
    if (queue().node.isPaused()) queue().node.resume();
    await expectStart("Let Me Go", "/play");
    check("'Started playing' message posted", sent.some((s) => /Started playing \*\*Let Me Go\*\*/.test(s)), sent.at(-1));

    // --- /np
    out = await run("np");
    check("/np progress bar is short enough not to wrap (12 segments)", (out.match(/▬/g) ?? []).length === 11, out.match(/┃.*┃/)?.[0]);
    out = await run("queue");
    check("/queue with only the current song says nothing else is queued", /Nothing else queued/.test(out) && /Page 1 of 1\b/.test(out), out.replace(/\n/g, " / ").slice(0, 160));
    out = await run("np");
    check("/np shows the current song, requester and progress bar", /\[title\] Let Me Go/.test(out) && out.includes(`Requested by ${requester.username}`) && /▬|─|━|=/.test(out), out);

    // --- /lyrics
    out = await run("lyrics");
    check("/lyrics finds Daniel Caesar - Let Me Go", /\[author\] Daniel Caesar/i.test(out) && /\[title\] Let Me Go/i.test(out), out.slice(0, 120));

    // --- /play playlist link starting mid-playlist
    let before = queue().getSize();
    out = await run("play", { query: LINKS.playlistFromLetMeGo });
    const added = queue().getSize() - before;
    check("/play playlist link queues all 17 songs", added === 17, `added ${added}; reply: ${out}`);
    const plTracks = queue().tracks.toArray().slice(before);
    check("playlist starts at the linked song (Let Me Go)", plTracks[0]?.title === "Let Me Go", plTracks.slice(0, 3).map((t) => t.title).join(" / "));
    check("every playlist track has artist, duration and requester",
        plTracks.every((t) => t.author && t.durationMS > 0 && t.requestedBy?.id === requester.id),
        plTracks.filter((t) => !t.author || !t.durationMS || !t.requestedBy).map((t) => t.title).join(", ") || "all ok");

    // --- /queue
    out = await run("queue");
    check("/queue lists songs with artists", /Let Me Go by Daniel Caesar/.test(out), out.split("\n").slice(0, 4).join(" / "));
    check("/queue total duration is not 0:00", !/Total Duration: 0:00\b|Total Duration: 00:00\b/.test(out) && /Total Duration: \S+/.test(out), out.match(/\[footer\].*/)?.[0]);

    // --- /play Mix and Spotify
    before = queue().getSize();
    await run("play", { query: LINKS.mix });
    check("/play YouTube Mix queues its songs", queue().getSize() - before >= 10, `added ${queue().getSize() - before}`);
    before = queue().getSize();
    out = await run("play", { query: LINKS.spotifyTrack });
    check("/play Spotify track queues it", queue().getSize() - before === 1, out);

    // --- /pause /resume
    out = await run("pause");
    check("/pause pauses", queue().node.isPaused() && /has been paused/.test(out), out);
    out = await run("pause");
    check("/pause again says already paused", /already paused/.test(out), out);
    out = await run("resume");
    check("/resume resumes", !queue().node.isPaused() && /has been resumed/.test(out), out);
    out = await run("resume");
    check("/resume again says already playing", /already playing/.test(out), out);

    // --- /front
    let t = titles();
    out = await run("front", { position: "5" });
    check("/front 5 moves song 5 to the front without duplicating it", titles()[0] === t[4] && queue().getSize() === t.length && titles().filter((x) => x === t[4]).length === t.filter((x) => x === t[4]).length, out);

    // --- /remove
    t = titles();
    out = await run("remove", { index: "1,3-4" });
    const expected = t.filter((_, i) => ![0, 2, 3].includes(i));
    check("/remove 1,3-4 removes exactly those songs", JSON.stringify(titles()) === JSON.stringify(expected), out.split("\n")[0]);
    out = await run("remove", { index: "abc" });
    check("/remove with bad input explains and removes nothing", /isn't a number/.test(out) && queue().getSize() === expected.length, out);

    // --- /shuffle
    t = titles();
    out = await run("shuffle");
    check("/shuffle keeps the same songs", JSON.stringify([...titles()].sort()) === JSON.stringify([...t].sort()), out);

    // --- /skip
    let next = titles()[0];
    out = await run("skip");
    check("/skip replies", /Skipped/.test(out), out);
    await expectStart(next, "/skip");

    // --- /loop + /skipto (skipped songs must not be lost)
    out = await run("loop");
    check("/loop sets queue repeat", queue().repeatMode === QueueRepeatMode.QUEUE, out);
    const sizeBefore = queue().getSize();
    next = titles()[2];
    out = await run("skipto", { position: "3" });
    await expectStart(next, "/skipto 3 while looping");
    await waitFor(() => queue().getSize() === sizeBefore, 5000);
    check("/skipto while looping keeps every song in the queue", queue().getSize() === sizeBefore, `size ${sizeBefore} -> ${queue().getSize()}`);
    out = await run("unloop");
    check("/unloop turns repeat off", queue().repeatMode === QueueRepeatMode.OFF, out);

    // --- Spotify playback (bridged to YouTube audio)
    const spotifyPos = queue().tracks.toArray().findIndex((x) => x.source === "spotify");
    next = titles()[spotifyPos];
    await run("skipto", { position: String(spotifyPos + 1) });
    await expectStart(next, "Spotify track");

    const spTrack = queue().currentTrack;
    const art = await waitFor(() => /spotifycdn/.test(spTrack.thumbnail), 8000);
    check("Spotify track gets its real cover art", art, spTrack.thumbnail);
    out = await run("np");
    check("/np on a Spotify track links the song", /\[title\] Never Gonna Give You Up/.test(out) && spTrack.url === LINKS.spotifyTrack, spTrack.url);

    // --- Spotify album track: these come with broken /tracks/<uid> links
    before = queue().getSize();
    await run("play", { query: LINKS.spotifyAlbum });
    const albumFirst = queue().tracks.toArray()[before];
    check("/play Spotify album queues its songs", queue().getSize() - before > 5, `added ${queue().getSize() - before}`);
    await run("skipto", { position: String(before + 1) });
    await expectStart(albumFirst.title, "Spotify album track");
    const albumArt = await waitFor(() => /spotifycdn/.test(albumFirst.thumbnail) && /open\.spotify\.com\/track\//.test(albumFirst.url), 8000);
    check("Spotify album track gets cover art and a working link", albumArt, `${albumFirst.url} | ${albumFirst.thumbnail}`);

    // --- /reload
    out = await run("reload", { command: "np" });
    check("/reload np reloads the command", /was reloaded/.test(out), out);
    out = await run("np");
    check("/np works after reload", out.includes(`[title] ${queue().currentTrack.title}`), out.slice(0, 80));

    // --- /leave, then commands with no queue
    out = await run("leave");
    await waitFor(() => !queue(), 5000);
    check("/leave stops and deletes the queue", !queue() && /Leaving/.test(out), out);
    out = await run("np");
    check("/np with nothing playing says the queue is empty", /queue is empty/.test(out), out);

    check("no track failed to stream during the run", playerErrors.length === 0, playerErrors.join("; "));
}

main()
    .catch((e) => check("test run crashed", false, e.stack))
    .finally(() => {
        gaps.sort((a, b) => a - b);
        const pct = (p) => gaps[Math.floor(gaps.length * p)]?.toFixed(1);
        const late = gaps.filter((g) => g > 30).length;
        console.log(`\nAudio frame timing over ${gaps.length} frames: p50=${pct(0.5)}ms p99=${pct(0.99)}ms max=${gaps.at(-1)?.toFixed(1)}ms, >30ms late: ${late} (${((late / Math.max(gaps.length, 1)) * 100).toFixed(2)}%)`);
        const failed = results.filter((x) => !x.ok);
        console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
        try { queue()?.delete(); } catch {}
        setTimeout(() => process.exit(failed.length ? 1 : 0), 1500);
    });

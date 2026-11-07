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
const { handleButton } = require(root + "now-playing.js");
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
const sent = []; // messages the bot posted to the text channel (e.g. "Now playing" cards)
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
                const fields = d.fields?.map((f) => `${f.name}: ${f.value}`).join(" | ");
                return [d.author?.name && `[author] ${d.author.name}`, d.title && `[title] ${d.title}`, d.description, fields, d.footer?.text && `[footer] ${d.footer.text}`]
                    .filter(Boolean)
                    .join(" | ");
            })
            .join("\n");
    }
    return x?.content ?? JSON.stringify(x);
};

// A stand-in for a Discord message the bot sent, which the bot can edit
let nextMessageId = 1;
function makeMessage(payload) {
    const message = {
        id: String(nextMessageId++),
        payload: typeof payload === "string" ? { content: payload } : payload,
        get text() { return embedText(message.payload); },
        get embeds() { return (message.payload.embeds ?? []).map((e) => e.data ?? e); },
        get components() { return message.payload.components ?? []; },
        async edit(x) { message.payload = { ...message.payload, ...x }; return message; },
        react: async () => {},
        createReactionCollector: () => ({ on() {} }),
    };
    return message;
}
const buttonIds = (message) => message.components.flatMap((row) => (row.components ?? []).map((b) => b.data?.custom_id));
const lastCard = () => sent.filter((m) => /Now playing|Paused/.test(m.text)).at(-1);

let guild, voiceChannel, requester, lastReply;
async function run(name, args = {}, channelOverride) {
    currentStep = `/${name} ${JSON.stringify(args)}`;
    const replies = [];
    const respond = (x) => { replies.push(embedText(x)); lastReply = makeMessage(x); return lastReply; };
    const interaction = {
        commandName: name,
        client,
        guild,
        user: requester,
        member: { voice: { channel: channelOverride ?? voiceChannel } },
        channel: { send: async (x) => { const m = makeMessage(x); sent.push(m); return m; } },
        options: { getString: (n) => args[n] ?? null, getInteger: (n) => args[n] ?? null },
        replied: false,
        deferred: false,
        isChatInputCommand: () => true,
        async reply(x) { this.replied = true; return respond(x); },
        async deferReply() { this.deferred = true; },
        async followUp(x) { return respond(x); },
        async editReply(x) { return respond(x); },
    };
    await client.commands.get(name).execute(interaction);
    return replies.join("\n");
}

// Presses a button on a message (the latest "Now playing" card by default)
async function press(id, { message = lastCard(), inVoice = true } = {}) {
    currentStep = `button ${id}`;
    const replies = [];
    await handleButton({
        customId: `np:${id}`,
        guild,
        user: requester,
        member: { voice: { channelId: inVoice ? voiceChannel.id : "some-other-channel" } },
        message,
        isButton: () => true,
        async update(x) { await message.edit(x); },
        async reply(x) { replies.push(embedText(x)); },
    });
    return replies.join("\n");
}

function check(name, ok, detail = "") {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

const queue = () => useQueue(GUILD_ID);
async function audioFlowing(ms = 4000) {
    await waitFor(() => queue()?.dispatcher?.audioPlayer?.state.status === "playing", 15000);
    const ap = queue()?.dispatcher?.audioPlayer;
    if (!ap || ap.state.status !== "playing") return { ok: false, why: `player status ${ap?.state.status}` };
    const before = ap.state.playbackDuration;
    const titleBefore = queue()?.currentTrack?.title;
    await sleep(ms);
    const after = queue()?.dispatcher?.audioPlayer?.state.playbackDuration ?? 0;
    const titleAfter = queue()?.currentTrack?.title;
    return { ok: after - before >= ms * 0.9, why: `${after - before}ms of audio sent in ${ms}ms, missedFrames=${ap.state.missedFrames}${titleBefore !== titleAfter ? `, track changed: ${titleBefore} -> ${titleAfter}` : ""} (started: ${started.slice(-3).join(" / ")})` };
}
// Waits for a new song to start (not just a matching title, since the next
// song can have the same title as the current one)
let seenStarts = 0;
async function expectStart(title, label) {
    const ok = await waitFor(() => started.length > seenStarts && started.at(-1) === title && queue()?.node.isPlaying(), 45000);
    seenStarts = started.length;
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
    await waitFor(() => lastCard()?.text.includes("Let Me Go"), 5000);
    let card = lastCard();
    check("'Now playing' card posted with title, artist, duration and requester",
        /\[title\] Let Me Go/.test(card?.text) && /Artist: Daniel Caesar/.test(card?.text) && /Duration: 0?3:3[78]/.test(card?.text) && card?.text.includes(`Requested by: <@${requester.id}>`),
        card?.text);
    check("card has the 5 control buttons", JSON.stringify(buttonIds(card)) === JSON.stringify(["np:previous", "np:pause", "np:skip", "np:loop", "np:stop"]), buttonIds(card).join(","));

    // --- /np
    out = await run("np");
    check("/np progress bar is short enough not to wrap (12 segments)", (out.match(/▬/g) ?? []).length === 11, out.match(/┃.*┃/)?.[0]);
    out = await run("queue");
    check("/queue with only the current song says nothing else is queued", /Nothing else queued/.test(out) && /Page 1 of 1\b/.test(out), out.replace(/\n/g, " / ").slice(0, 160));
    out = await run("np");
    check("/np shows the card with a progress bar and buttons", /\[title\] Let Me Go/.test(out) && out.includes(`Requested by: <@${requester.id}>`) && /▬/.test(out) && buttonIds(lastReply).length === 5, out);

    // --- /lyrics
    // --- /seek
    out = await run("seek", { time: "1:30" });
    const position = queue().node.getTimestamp()?.current.value;
    check("/seek 1:30 jumps to 1:30", /Jumped to 1:30/.test(out) && position >= 90000 && position < 100000, `${out} (position ${position}ms)`);
    const seekFlow = await audioFlowing();
    check("/seek: audio keeps streaming", seekFlow.ok, seekFlow.why);
    out = await run("seek", { time: "abc" });
    check("/seek with bad input explains", /isn't a time/.test(out), out);
    out = await run("seek", { time: "10:00" });
    check("/seek past the end explains", /only .* long/.test(out), out);

    out = await run("lyrics");
    check("/lyrics finds Daniel Caesar - Let Me Go", /\[author\] Daniel Caesar/i.test(out) && /\[title\] Let Me Go/i.test(out), out.slice(0, 120));

    // --- /play playlist link starting mid-playlist
    let before = queue().getSize();
    out = await run("play", { query: LINKS.playlistFromLetMeGo });
    const added = queue().getSize() - before;
    check("/play playlist link queues all 17 songs", added === 17, `added ${added}; reply: ${out}`);
    await waitFor(() => /Up next: Let Me Go/.test(lastCard()?.text), 3000);
    check("the card's 'Up next' updates when songs are queued", /Up next: Let Me Go/.test(lastCard()?.text), lastCard()?.text.match(/\[footer\].*/)?.[0]);
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

    // --- Now playing card buttons
    card = lastCard();
    await press("pause");
    check("⏸️ button pauses and the card shows Paused with a ▶️ button", queue().node.isPaused() && /Paused/.test(card.text) && card.components[0].components[1].data.emoji.name === "▶️", card.text.slice(0, 40));
    await press("pause");
    check("▶️ button resumes", !queue().node.isPaused() && /Now playing/.test(card.text), card.text.slice(0, 40));
    const modes = [];
    for (let i = 0; i < 3; i++) { await press("loop"); modes.push(queue().repeatMode); }
    check("🔁 button cycles loop: queue -> song -> off", JSON.stringify(modes) === JSON.stringify([QueueRepeatMode.QUEUE, QueueRepeatMode.TRACK, QueueRepeatMode.OFF]), JSON.stringify(modes));
    out = await press("pause", { inVoice: false });
    check("buttons only work for people in the bot's voice channel", /Join my voice channel/.test(out) && !queue().node.isPaused(), out);
    out = await run("pause");
    await waitFor(() => /Paused/.test(card.text), 3000);
    check("/pause updates the card's button too", /Paused/.test(card.text), card.text.slice(0, 40));
    await run("resume");
    const playingTitle = queue().currentTrack.title;
    const upNext = titles()[0];
    out = await press("skip");
    check("⏭️ button skips and says who did it", out.includes(`${requester}`) && out.includes(playingTitle), out);
    await expectStart(upNext, "⏭️ button");
    await waitFor(() => lastCard() !== card, 5000);
    check("the old card's buttons are removed when the next song starts", card.components.length === 0 && lastCard() !== card, `old card components: ${card.components.length}`);
    out = await press("previous");
    check("⏮️ button goes back to the previous song", /went back/.test(out), out);
    await expectStart(playingTitle, "⏮️ button");

    // --- /front
    let t = titles();
    out = await run("front", { position: "5" });
    check("/front 5 moves song 5 to the front without duplicating it", titles()[0] === t[4] && queue().getSize() === t.length && titles().filter((x) => x === t[4]).length === t.filter((x) => x === t[4]).length, out);

    // --- /remove
    t = titles();
    out = await run("remove", { index: "1,3-4" });
    const expected = t.filter((_, i) => ![0, 2, 3].includes(i));
    check("/remove 1,3-4 removes exactly those songs", JSON.stringify(titles()) === JSON.stringify(expected), out.split("\n")[0]);
    // --- /swap
    t = titles();
    out = await run("swap", { first: 1, second: 3 });
    check("/swap 1 3 swaps those songs", titles()[0] === t[2] && titles()[2] === t[0] && titles().length === t.length, out);
    out = await run("swap", { first: 1, second: 999 });
    check("/swap with a position past the end explains", /only has/.test(out) && titles()[0] === t[2], out);

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

    // --- /previous
    const previousTitle = queue().history.previousTrack?.title;
    out = await run("previous");
    check("/previous replies with the previous song", out.includes(`Going back to **${previousTitle}**`), out);
    await expectStart(previousTitle, "/previous");

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
    await waitFor(() => lastCard()?.text.includes("Never Gonna Give You Up"), 5000);
    check("Spotify song's card shows its cover art", /spotifycdn/.test(lastCard()?.embeds[0]?.thumbnail?.url), lastCard()?.embeds[0]?.thumbnail?.url);
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

    // --- /clear
    const queued = queue().getSize();
    out = await run("clear");
    check("/clear empties the queue and keeps the current song playing", queue().getSize() === 0 && queue().node.isPlaying() && out.includes(`Cleared ${queued} songs`), out);
    out = await run("clear");
    check("/clear on an empty queue says so", /already empty/.test(out), out);

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

    // --- ⏹️ button
    out = await run("play", { query: LINKS.letMeGo });
    await expectStart("Let Me Go", "/play after /leave");

    // --- /loop modes
    out = await run("loop", { mode: "song" });
    check("/loop mode:song loops the current song", queue().repeatMode === QueueRepeatMode.TRACK && /this song/.test(out), out);
    await waitFor(() => lastCard()?.text.includes("Let Me Go"), 5000);
    card = lastCard();
    out = await press("stop");
    await waitFor(() => !queue(), 5000);
    check("⏹️ button stops the music and removes the card's buttons", !queue() && /stopped the music/.test(out) && card.components.length === 0, out);

    // --- Leaving when everyone leaves the voice channel
    await run("play", { query: LINKS.letMeGo });
    await expectStart("Let Me Go", "/play after ⏹️");
    check("leaves 60s after everyone leaves the channel", queue().options.leaveOnEmpty && queue().options.leaveOnEmptyCooldown === 60000, `cooldown ${queue().options.leaveOnEmptyCooldown}ms`);
    queue().options.leaveOnEmptyCooldown = 1500; // don't make the test wait a minute
    const leaver = { id: "123", user: { bot: false } };
    player.handleVoiceState(
        { guild, member: leaver, channelId: voiceChannel.id, channel: voiceChannel },
        { guild, member: leaver, channelId: null, channel: null }
    );
    await waitFor(() => !queue(), 5000);
    check("when everyone has left, the bot leaves and says why", !queue() && sent.some((m) => /Everyone left the voice channel/.test(m.text)), sent.at(-1)?.text);

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

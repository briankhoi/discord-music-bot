const { Playlist, QueryType, Track, Util } = require("discord-player");
const { YoutubeExtractor } = require("discord-player-youtubei");
const { YTNodes } = require("youtubei.js");

// Workarounds for bugs in discord-player-youtubei 3.1.0.
class PatchedYoutubeExtractor extends YoutubeExtractor {
    // It claims every query in validate(), which shadows the Spotify extractor
    // and makes Spotify links fail. Leave Spotify queries to it.
    async validate(query, type) {
        if (typeof type === "string" && type.startsWith("spotify")) return false;
        return super.validate(query, type);
    }

    // Its playlist parsing is out of date with YouTube's current layouts:
    // - Mixes (list=RD...) come back with 0 tracks
    // - playlist tracks have no artist or duration
    // - watch?v=X&list=... ignores X and starts from track 1
    // so build playlist and Mix tracks here instead.
    async handle(query, context) {
        const ids = parsePlaylistUrl(query);
        if (!ids) return super.handle(query, context);

        const { info, nodes } = await this.fetchPlaylist(ids);
        const playlist = new Playlist(this.context.player, {
            title: info.title?.toString() ?? "YouTube Playlist",
            thumbnail: info.thumbnail,
            description: "",
            author: { name: info.author?.toString() ?? "YouTube", url: "" },
            tracks: [],
            id: ids.playlistId,
            url: query,
            type: "playlist",
            source: "youtube",
        });
        const tracks = nodes
            .map((node) => readVideoNode(node))
            .filter(Boolean)
            .map((video) => {
                const track = new Track(this.context.player, {
                    ...video,
                    description: `${video.title} by ${video.author}`,
                    requestedBy: context.requestedBy,
                    source: "youtube",
                    queryType: QueryType.YOUTUBE_VIDEO,
                });
                track.extractor = this;
                track.playlist = playlist;
                return track;
            });

        // Start at the linked video, like YouTube does; the tracks before it
        // go to the end so the whole playlist is still queued.
        const start = tracks.findIndex((track) => track.url.endsWith(`v=${ids.videoId}`));
        playlist.tracks = start > 0 ? [...tracks.slice(start), ...tracks.slice(0, start)] : tracks;
        return this.createResponse(playlist, playlist.tracks);
    }

    async fetchPlaylist({ playlistId, videoId }) {
        if (playlistId.startsWith("RD")) {
            const mix = (
                await this.innertube.getInfo(
                    new YTNodes.NavigationEndpoint({
                        continuationCommand: { playlistId, videoId },
                    })
                )
            ).playlist;
            return {
                info: { title: mix?.title, author: mix?.author },
                nodes: mix?.contents ?? [],
            };
        }
        let page = await this.innertube.getPlaylist(playlistId);
        const info = {
            title: page.info.title,
            author: page.info.author?.name,
            thumbnail: page.info.thumbnails?.[0]?.url,
        };
        const nodes = [...page.videos];
        while (page.has_continuation) {
            page = await page.getContinuation();
            nodes.push(...page.videos);
        }
        return { info, nodes };
    }
}

// Reads the fields we need from the node types YouTube uses for playlist items.
function readVideoNode(node) {
    if (node.is(YTNodes.LockupView)) {
        if (node.content_type !== "VIDEO") return null;
        const badges = (node.content_image?.overlays ?? []).flatMap((o) => o.badges ?? []);
        return {
            title: node.metadata?.title?.toString(),
            author: node.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.toString(),
            duration: badges.find((b) => /^\d+(:\d+)+$/.test(b.text ?? ""))?.text ?? "0:00",
            thumbnail: node.content_image?.image?.[0]?.url,
            url: `https://www.youtube.com/watch?v=${node.content_id}`,
        };
    }
    if (node.is(YTNodes.PlaylistVideo) || node.is(YTNodes.PlaylistPanelVideo)) {
        const author = node.is(YTNodes.PlaylistVideo) ? node.author?.name : node.author;
        const thumbnails = node.thumbnails ?? node.thumbnail;
        return {
            title: node.title?.toString(),
            author,
            duration: Util.buildTimeCode(Util.parseMS((node.duration?.seconds ?? 0) * 1000)),
            thumbnail: thumbnails?.[0]?.url,
            url: `https://www.youtube.com/watch?v=${node.id ?? node.video_id}`,
        };
    }
    return null;
}

function parsePlaylistUrl(query) {
    try {
        const url = new URL(query);
        if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return null;
        const playlistId = url.searchParams.get("list");
        if (!playlistId) return null;
        const videoId = url.searchParams.get("v");
        // A Mix is generated from a video, so it needs one
        if (playlistId.startsWith("RD") && !videoId) return null;
        return { playlistId, videoId };
    } catch {
        return null;
    }
}

module.exports = { PatchedYoutubeExtractor };

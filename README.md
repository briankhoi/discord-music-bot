# Discord Music Bot

A discord bot used to play songs from YouTube and Spotify in a discord server.

## Usage Instructions

1. Clone the repository
2. Run 'npm install .'
3. Download ffmpeg using https://ffmpeg.org/download.html, unzip it, and add the path to ffmpeg/bin to your path environment variable (for instance, mine was C:\ffmpeg\bin). If using Windows, I would recommend this guide https://blog.gregzaal.com/how-to-install-ffmpeg-on-windows/ minus Step 1 as that download is no longer supported.
4. Make a .env file in the main directory with the following contents (do not put quotes around the variable values)
    - DISCORD_TOKEN=(the token of the discord bot)
    - CLIENT_ID=(application id of the bot)
    - FFMPEG_PATH=path-to-ffmpeg-exe (when extracting the ffmpeg zip, it should be in the bins folder)
    - YT_COOKIE=(optional, a YouTube cookie string; only needed if YouTube starts blocking requests)
5. Invite the bot to your server
6. Run 'node deploy-commands.js', then 'node index.js' and enjoy

*Linting rules can be modified in .eslintrc.json and commands are stored in the commands folder.

## Running locally

`npm run dev` runs start.sh, which registers the slash commands and runs the bot with nodemon, restarting it when files change or it crashes. It needs nodemon (`npm install -g nodemon`) and `ts` for timestamps (from moreutils: `brew install moreutils` or `sudo apt install moreutils`). `npm start` just runs the bot once.

## Running on a server (e.g. an Oracle Cloud VM)

Use systemd, so the bot starts when the server boots and restarts if it crashes:
1. Install Node.js (a current LTS version, e.g. from https://github.com/nodesource/distributions) and ffmpeg (`sudo apt install ffmpeg`)
2. Clone the repository, run `npm install`, and create the .env file as above
3. Edit deploy/discord-music-bot.service so User and WorkingDirectory match your server (and the node path, if `which node` isn't /usr/bin/node)
4. Install and start it:
    ```
    sudo cp deploy/discord-music-bot.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now discord-music-bot
    ```
5. Check on it with `systemctl status discord-music-bot`, and see its logs with `journalctl -u discord-music-bot -f`. After pulling new code, run `sudo systemctl restart discord-music-bot`.

YouTube sometimes blocks requests from cloud servers ("Sign in to confirm you're not a bot"). If songs fail to play with that error, set YT_COOKIE in .env, ideally from a throwaway Google account.

## Testing

`npm test` runs an end-to-end test: it starts the bot, joins a voice channel, runs the slash commands, and checks the replies, the queue, and that audio is actually being sent. Add these to your .env first:
- E2E_GUILD_ID=(id of the server to test in)
- E2E_VOICE_CHANNEL=(name of a voice channel there, ideally an empty one)

Stop the bot before running it, since only one connection per server can be in voice.

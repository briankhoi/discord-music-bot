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
    - YT_TOKEN=(string output from `npx --no discord-player-youtubei`)
5. Invite the bot to your server
6. Run 'node deploy-commands.js', then 'node index.js' and enjoy

*Linting rules can be modified in .eslintrc.json and commands are stored in the commands folder.

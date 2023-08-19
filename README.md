# Discord Music Bot

A discord bot used to play songs from YouTube and Spotify in your server. Most of the code is sourced from the DiscordJS and Discord Player quick-start guides and documentation located at https://discordjs.guide/#before-you-begin and https://discord-player.js.org/guide/welcome/welcome.

## Usage Instructions
1. Clone the repository
2. Run 'npm install .'
3. Download ffmpeg using https://ffmpeg.org/download.html, unzip it, and add the path to ffmpeg/bin to your path environment variable (for instance, mine was C:\ffmpeg\bin). If using Windows, I would recommend this guide https://blog.gregzaal.com/how-to-install-ffmpeg-on-windows/ minus Step 1 as that download is no longer supported.
4. Make a .env file in the main directory with the following contents
    - DISCORD_TOKEN=your-token-here
    - CLIENT_ID=application-id-of-the-bot
    - GUILD_ID=id-of-your-server (this one is optional and not used by default, but can be easily changed in deploy-commands.js)
    - FFMPEG_PATH=path-to-ffmpeg-exe (when extracting the ffmpeg zip, it should be in the bins folder)
5. Invite the bot to your server
6. Run 'node deploy-commands.js' and enjoy

*Linting rules can be modified in .eslintrc.json and commands are stored in the commands folder.
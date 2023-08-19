const { useQueue } = require('discord-player');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('queue')
		.setDescription('Lists all the songs in the queue'),
	async execute(interaction) {
		const queue = useQueue(interaction.guild.id);
		const tracks = queue.tracks.toArray();
		console.log(tracks);
		const currentTrack = queue.currentTrack;
	},
};
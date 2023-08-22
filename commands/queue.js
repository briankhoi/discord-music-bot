const { useQueue } = require('discord-player');
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('queue')
		.setDescription('Lists all the songs in the queue'),
	async execute(interaction) {
		const queue = useQueue(interaction.guild.id);
		if (!queue) {
			return interaction.reply({
				embeds: [
					new EmbedBuilder().setDescription(
						"The queue is empty! Please add some songs to use this command"
					),
				],
			});
		}
		try {
			const tracks = queue.tracks.toArray();
			// console.log("+++++++++++++++++++++++");
			// console.log(tracks);
			// console.log(tracks[2]);
			const currentTrack = queue.currentTrack;
			// console.log(currentTrack)
			await interaction.reply(`Queue: ${tracks}\n\nCurrent track: ${currentTrack}`);
		} catch (e) {
			return await interaction.reply(`Something went wrong: ${e}`);
		}
	},
};
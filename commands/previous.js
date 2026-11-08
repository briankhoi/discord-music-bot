const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue } = require("discord-player");

const reply = (interaction, text) =>
    interaction.reply({
        embeds: [new EmbedBuilder().setDescription(text).setColor("e8d5ac")],
    });

module.exports = {
    data: new SlashCommandBuilder()
        .setName("previous")
        .setDescription("Goes back to the previous song"),
    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue) {
            return reply(interaction, "The queue is empty! Please add some songs to use this command");
        }
        if (queue.history.isEmpty()) {
            return reply(interaction, "There's no previous song!");
        }
        try {
            const previous = queue.history.previousTrack;
            await queue.history.previous();
            return reply(interaction, `Going back to **${previous.title}**!`);
        } catch (e) {
            return interaction.reply(`Something went wrong: ${e}`);
        }
    },
};

require("dotenv").config();
const { Colors, Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, roleMention, userMention } = require("discord.js");
const mongoose = require("mongoose");
const axios = require("axios");

// Connect to MongoDB and use "PogoMastersDB" database
mongoose.connect(process.env.MONGO_URI, {
    dbName: "Pokepolice", // Explicit database name
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ Connected to MongoDB (Pokepolice)"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

// Define User Schema (explicit collection name: "users")
const userSchema = new mongoose.Schema({
    discordId: String,
    displayName: String,
    trainerCode: String,
    trainerName: String,
}, { collection: "users" });

const scammerSchema = new mongoose.Schema({
    discordID: String,
    discordName: String,
    trainerCode: String,
    trainerName: String,
    reportedServer: String,
    reporter: String,
    reason: String,
    reportedDate: { type: Date, default: Date.now },
}, { collection: "scammers" });

const User = mongoose.model("User", userSchema);
const Scammer = mongoose.model("Scammer", scammerSchema);

// Create the bot client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});



client.once("ready", () => {
    console.log(`🚀 Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Ignore bot messages

    if (message.content.toLowerCase() === "!hi") {
        return message.reply("👋 Hello! I'm active and ready to help.");
    }

    if (!message.content.startsWith("!")) return;

    const args = message.content.split(" ");
    const command = args[0].toLowerCase();

    // Add Trainer
    if (command === "!addtrainer") {
        if (args.length < 3) return message.reply("❌ Usage: `!addtrainer <trainerCode> <trainerName>`");

        const trainerCode = args[1];
        const trainerName = args.slice(2).join(" ");

        const existingUser = await User.findOne({ discordId: message.author.id });
        if (existingUser) {
            return message.reply("❌ You have already registered!");
        }

        const newUser = new User({
            discordId: message.author.id,
            displayName: message.author.username,
            trainerCode,
            trainerName,
        });

        await newUser.save();
        message.reply("✅ Trainer details saved successfully!");
    }

    // Get Trainer
    if (command === "!gettrainer") {
        const user = await User.findOne({ discordId: message.author.id });
        if (!user) return message.reply("❌ You are not registered.");

        message.reply(`🎮 **Trainer Info:**\n- **Discord Name:** ${user.displayName}\n- **Trainer Code:** ${user.trainerCode}\n- **Trainer Name:** ${user.trainerName}`);
    }

    // Mark Scammer
    // Mark Scammer
    if (command === "!add") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Only admins can use this command.");
        }

        // Ensure the message has enough arguments
        if (args.length < 7) {
            return message.reply("❌ Usage: `!markscammer <discordID> <discordName> <trainerCode> <trainerName> <reportedServer> <reason>`\n\n*Note:* `trainerName` and `reason` can contain spaces, so wrap them in quotes.");
        }

        // Extract values correctly
        const discordID = args[1];
        const discordName = args[2];
        const trainerCode = args[3];

        // Extract trainerName and reportedServer correctly
        const trainerNameIndex = 4;
        const reportedServerIndex = 5;

        // `reason` should be everything after the reportedServer argument
        const trainerName = args[trainerNameIndex];
        const reportedServer = args[reportedServerIndex];
        const reason = args.slice(reportedServerIndex + 1).join(" "); // Join remaining arguments as reason

        // Validate inputs
        if (!discordID || !discordName || !trainerCode || !trainerName || !reportedServer || !reason) {
            return message.reply("❌ All fields are required! Please ensure you provide each detail correctly.");
        }

        // **Validate Discord ID Format**
        if (!/^\d{17,19}$/.test(discordID)) {
            return message.reply("❌ Invalid Discord ID! Please provide a valid user ID.");
        }

        try {
            // **Check if Discord ID exists in Discord API**
            const user = await client.users.fetch(discordID);
            if (!user) {
                return message.reply("❌ This Discord ID does not belong to a real user.");
            }

            // **Check if the user is already marked as a scammer**
            const existingScammer = await Scammer.findOne({ discordID });
            if (existingScammer) {
                return message.reply("⚠️ This user is already marked as a scammer.");
            }

            // **Create and save the scammer entry**
            const scammerEntry = new Scammer({
                discordID,
                discordName,
                trainerCode,
                trainerName,
                reportedServer,
                reporter: message.author.username,
                reason,
            });

            await scammerEntry.save();
            message.reply(`⚠️ **Scammer Marked Successfully!**\n- **Discord Name:** ${discordName}\n- **Trainer Code:** ${trainerCode}\n- **Trainer Name:** ${trainerName}\n- **Server:** ${reportedServer}\n- **Reason:** ${reason}\n- **Reported By:** ${message.author.username}`);

        } catch (error) {
            console.error(error);
            return message.reply("❌ The provided Discord ID does not exist or could not be fetched.");
        }
    }
    if (command === "!remove") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Only admins can use this command.");
        }

        // Ensure an ID is provided
        if (args.length < 2) {
            return message.reply("❌ Usage: `!removescammer <discordID>`");
        }

        const discordID = args[1];

        // Validate Discord ID format
        if (!/^\d{17,19}$/.test(discordID)) {
            return message.reply("❌ Invalid Discord ID! Please provide a valid user ID.");
        }

        try {
            // Check if the scammer exists in the database
            const existingScammer = await Scammer.findOne({ discordID });
            if (!existingScammer) {
                return message.reply("⚠️ This user is not marked as a scammer.");
            }

            // Remove the scammer from the database
            await Scammer.deleteOne({ discordID });

            message.reply(`✅ **User removed from scammer list!**\n- **Discord ID:** ${discordID}`);

        } catch (error) {
            console.error(error);
            return message.reply("❌ An error occurred while removing the scammer.");
        }
    }

    // Get Scammer Details by Discord ID
    if (command === "!check") {
        if (args.length < 2) {
            return message.reply("❌ Usage: `!getscammer <discordID>`");
        }

        const discordID = args[1];

        // Search the scammer database
        const scammer = await Scammer.findOne({ discordID });

        if (!scammer) {
            return message.reply(`✅ No scammer record found for **Discord ID: ${discordID}**.`);
        }

        // If found, display scammer details
        message.reply(`⚠️ **Scammer Found!**\n- **Discord Name:** ${scammer.discordName}\n- **Trainer Code:** ${scammer.trainerCode}\n- **Trainer Name:** ${scammer.trainerName}\n- **Reported Server:** ${scammer.reportedServer}\n- **Reason:** ${scammer.reason}\n- **Reported By:** ${scammer.reporter}\n- **Reported Date:** ${scammer.reportedDate.toDateString()}`);
    }
    if (command === "!find") {
        if (args.length < 2) {
            return message.reply("❌ Usage: `!userinfo <discordID>`");
        }

        const discordID = args[1];

        try {
            // Fetch user from Discord
            const user = await client.users.fetch(discordID);
            let member;
            try {
                member = await message.guild.members.fetch(discordID);
            } catch (err) {
                member = null;
            }

            // Fetch user data via Discord API to get the banner
            const userApiUrl = `https://discord.com/api/v10/users/${discordID}`;
            const userResponse = await axios.get(userApiUrl, {
                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
            });

            const userData = userResponse.data;
            let bannerUrl = null;

            // If the user has a banner, generate the URL
            if (userData.banner) {
                const extension = userData.banner.startsWith("a_") ? "gif" : "png";
                bannerUrl = `https://cdn.discordapp.com/banners/${discordID}/${userData.banner}.${extension}?size=1024`;
            }

            // Format role mentions
            const roles = member
                ? member.roles.cache
                      .filter(role => role.id !== message.guild.id) // Exclude @everyone role
                      .map(role => roleMention(role.id))
                      .join(", ") || "No Roles"
                : "Not in Server";

            // Create embed
            const embed = new EmbedBuilder()
                .setColor("#2F3136") // Dark Mode Aesthetic
                .setAuthor({ name: `${user.username}'s User Information`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription(
                    `### **General:**\n` +
                    `• **ID:** \`${user.id}\`\n` +
                    `• **Username:** @${user.username}\n` +
                    `• **Display Name:** ${user.globalName || "None"}\n` +
                    `• **Mention:** ${userMention(user.id)}\n\n` +
                    `### **Created At:**\n` +
                    `• **Date:** <t:${Math.floor(user.createdTimestamp / 1000)}:D>\n` +
                    `• **Relative:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n\n` +
                    (member
                        ? `### **Joined At:**\n` +
                          `• **Date:** <t:${Math.floor(member.joinedTimestamp / 1000)}:D>\n` +
                          `• **Relative:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n\n`
                        : "🚨 **This user is not in the server.**\n\n") +
                    `### **Roles [${member ? member.roles.cache.size - 1 : 0}]:**\n` +
                    `• ${roles}\n\n` +
                    `### **Latest Activity:**\n` +
                    `### **Key Permissions:**\n` +
                    `• No Key Permissions`
                )
                .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

            // Add banner if available
            if (bannerUrl) {
                embed.setImage(bannerUrl);
            }

            // Send embed
            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error("Error fetching user:", error);
            message.reply("❌ Could not fetch user. Make sure the ID is correct.");
        }
    }


});
client.on("guildMemberAdd", async (member) => {
    console.log(`📢 New member joined: ${member.user.tag} (ID: ${member.id})`);

    try {
        const scammer = await Scammer.findOne({ discordID: member.id });

        if (scammer) {
            const warningChannel = member.guild.systemChannel || member.guild.channels.cache.find(channel => channel.name.includes("general"));

            if (warningChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("🚨 **Scammer Alert!** 🚨")
                    .setColor(Colors.Red) // ✅ FIXED COLOR ERROR
                    .setDescription(`A known scammer has joined the server!`)
                    .addFields(
                        { name: "👤 Discord Name", value: scammer.discordName, inline: true },
                        { name: "🆔 Discord ID", value: scammer.discordID, inline: true },
                        { name: "🎮 Trainer Name", value: scammer.trainerName, inline: true },
                        { name: "🔢 Trainer Code", value: scammer.trainerCode, inline: true },
                        { name: "⚠️ Reason", value: scammer.reason, inline: false },
                        { name: "📅 Reported Server", value: scammer.reportedServer, inline: true },
                        { name: "🔍 Reported By", value: scammer.reporter, inline: true }
                    )
                    .setTimestamp();

                warningChannel.send({ content: `@everyone ⚠️ **Alert! A scammer has joined.**`, embeds: [embed] });
            }
        }
    } catch (error) {
        console.error("❌ Error checking scammer list:", error);
    }
});


// Log in the bot
client.login(process.env.DISCORD_TOKEN);

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

async function main() {
  const guildId = process.argv[2] || '948229621718056960';

  const token = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('BOT_TOKEN (или DISCORD_BOT_TOKEN) не найден в .env');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(token);
    await client.user?.fetch();

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.error(`Гильдия ${guildId} не найдена (бот не в ней, или нет доступа)`);
      process.exitCode = 2;
      return;
    }

    console.log(`Выхожу из гильдии: ${guild.name} (${guild.id})`);
    await guild.leave();
    console.log('Успешно вышел.');
  } catch (e: any) {
    console.error(`Ошибка: ${e?.message || e}`);
    process.exitCode = 3;
  } finally {
    try {
      await client.destroy();
    } catch {
      // ignore
    }
  }
}

main();

//npx -y ts-node "scripts/leave-guild.ts" 948229621718056960 
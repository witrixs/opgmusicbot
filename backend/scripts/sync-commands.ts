import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Воспроизвести трек или добавить в очередь')
      .addStringOption((option) =>
        option.setName('query').setDescription('Название трека или URL').setRequired(true),
      ),
    new SlashCommandBuilder().setName('pause').setDescription('Поставить воспроизведение на паузу'),
    new SlashCommandBuilder().setName('resume').setDescription('Возобновить воспроизведение'),
    new SlashCommandBuilder().setName('skip').setDescription('Пропустить текущий трек'),
    new SlashCommandBuilder().setName('queue').setDescription('Показать очередь треков'),
    new SlashCommandBuilder().setName('stop').setDescription('Остановить воспроизведение и отключиться'),
    new SlashCommandBuilder().setName('help').setDescription('Показать список всех команд'),
    new SlashCommandBuilder().setName('ping').setDescription('Проверить задержку бота'),
  ].map((c) => c.toJSON());
}

async function main() {
  const args = process.argv.slice(2);
  const onlyGuildId = args.find((a) => /^\d{16,20}$/.test(a)) || null;

  const token = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!token) {
    console.error('BOT_TOKEN (или DISCORD_BOT_TOKEN) не найден в .env');
    process.exitCode = 1;
    return;
  }
  if (!appId) {
    console.error('DISCORD_CLIENT_ID не найден в .env');
    process.exitCode = 1;
    return;
  }

  const commands = buildCommands();
  const rest = new REST({ version: '10' }).setToken(token);

  // 1) Всегда чистим global-команды (чтобы не было дублей global+guild)
  console.log('Очищаю global-команды...');
  await rest.put(Routes.applicationCommands(appId), { body: [] });
  console.log('Global-команды очищены (учти: в Discord это может пропасть не мгновенно, до ~1 часа).');

  // 2) Синхронизируем guild-команды
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(token);
    await client.user?.fetch();

    const guildIds = onlyGuildId ? [onlyGuildId] : client.guilds.cache.map((g) => g.id);
    if (!guildIds.length) {
      console.log('Нет гильдий для синхронизации.');
      return;
    }

    console.log(`Синхронизирую guild-команды. Гильдий: ${guildIds.length}`);
    for (const gid of guildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
        console.log(`OK: ${gid}`);
      } catch (e: any) {
        console.warn(`FAIL: ${gid}: ${e?.message || e}`);
      }
    }
  } finally {
    try {
      await client.destroy();
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});

//npx -y ts-node "scripts/sync-commands.ts" 756473480412921917
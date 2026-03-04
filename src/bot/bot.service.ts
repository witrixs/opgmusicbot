import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChatInputCommandInteraction, GuildMember, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageComponentInteraction, EmbedBuilder, Message, ActivityType } from 'discord.js';
import { MusicService } from '../music/music.service';
import { LavalinkService } from '../lavalink/lavalink.service';
import { PlayerManager } from '../music/player.manager';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Сервис для работы с Discord ботом
 * Инициализирует клиент Discord.js и обрабатывает команды
 */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private client: Client;
  private playerMessages: Map<string, string> = new Map(); // guildId -> messageId для сообщений с плеером

  private buildCommandPayload() {
    return [
      new SlashCommandBuilder()
        .setName('play')
        .setDescription('Воспроизвести трек или добавить в очередь')
        .addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Название трека или URL')
            .setRequired(true),
        ),
      new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Поставить воспроизведение на паузу'),
      new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Возобновить воспроизведение'),
      new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Пропустить текущий трек'),
      new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Показать очередь треков'),
      new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Остановить воспроизведение и отключиться'),
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Показать список всех команд'),
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Проверить задержку бота'),
    ].map((command) => command.toJSON());
  }

  constructor(
    private readonly musicService: MusicService,
    private readonly lavalinkService: LavalinkService,
    private readonly playerManager: PlayerManager,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });
  }

  /**
   * Получить Discord клиент
   * @returns {Client} Discord.js клиент
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Короткий статус бота для REST API
   */
  getStatus(): { ready: boolean; userTag: string | null; ping: number | null } {
    const ready = this.client.isReady();
    const userTag = this.client.user?.tag ?? null;
    const ping = ready ? this.client.ws.ping : null;
    return { ready, userTag, ping };
  }

  /**
   * Инициализация бота при старте модуля
   * Регистрирует команды и подключается к Discord
   */
  async onModuleInit() {
    // Инициализируем Shoukaku ДО login(), чтобы коннектор мог правильно добавить узлы
    this.lavalinkService.setDiscordClient(this.client);
    // Устанавливаем обратную связь для удаления сообщений
    this.musicService.setBotService(this);
    await this.setupEventHandlers();
    await this.login();
  }

  /**
   * Регистрация slash-команд в Discord
   */
  private async registerCommands() {
    if (!this.client.user) {
      this.logger.error('Бот не готов для регистрации команд');
      return;
    }

    const token = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      this.logger.error('Не найден BOT_TOKEN (или DISCORD_BOT_TOKEN) в .env — не могу зарегистрировать команды');
      return;
    }

    const commands = this.buildCommandPayload();

    const rest = new REST({ version: '10' }).setToken(token);

    try {
      this.logger.log('Начинаю регистрацию команд...');

      // ВАЖНО: PUT полностью перезаписывает список команд для приложения.
      // Для мульти-серверного бота используем guild-команды на КАЖДОМ сервере (обновляются мгновенно).
      // Чтобы не было дублей (global + guild), очищаем global-команды.
      await rest.put(Routes.applicationCommands(this.client.user.id), { body: [] });

      const guildIds = this.client.guilds.cache.map((g) => g.id);
      if (!guildIds.length) {
        this.logger.warn('Бот не состоит ни в одной гильдии — команды некуда регистрировать');
        return;
      }

      this.logger.log(`Регистрирую команды в гильдиях: ${guildIds.length}`);
      for (const gid of guildIds) {
        try {
          await rest.put(Routes.applicationGuildCommands(this.client.user.id, gid), { body: commands });
          this.logger.log(`Команды зарегистрированы в гильдии: ${gid}`);
        } catch (e: any) {
          this.logger.warn(`Не удалось зарегистрировать команды в гильдии ${gid}: ${e?.message || e}`);
        }
      }

      this.logger.log('Команды успешно зарегистрированы');
    } catch (error) {
      this.logger.error(`Ошибка при регистрации команд: ${error.message}`);
    }
  }

  /**
   * Регистрация команд в одной гильдии (используем при guildCreate)
   */
  private async registerCommandsForGuild(guildId: string) {
    if (!this.client.user) return;

    const token = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
    if (!token) return;

    const commands = this.buildCommandPayload();
    const rest = new REST({ version: '10' }).setToken(token);

    try {
      await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), { body: commands });
      this.logger.log(`Команды зарегистрированы в гильдии: ${guildId}`);
    } catch (e: any) {
      this.logger.warn(`Не удалось зарегистрировать команды в гильдии ${guildId}: ${e?.message || e}`);
    }
  }

  /**
   * Настройка обработчиков событий Discord
   */
  private setupEventHandlers() {
    this.client.once('clientReady', async () => {
      this.logger.log(`Бот запущен как ${this.client.user?.tag}`);

      // Статус бота: "Слушает <текст>"
      const statusText = (process.env.BOT_STATUS_TEXT || 'музыку').trim();
      try {
        this.client.user?.setPresence({
          activities: [{ name: statusText, type: ActivityType.Listening }],
          status: 'online',
        });
      } catch (error) {
        this.logger.warn(`Не удалось установить статус бота: ${error.message}`);
      }

      // Shoukaku уже инициализирован в onModuleInit
      await this.registerCommands();
    });

    // Если бота добавили на новый сервер — регистрируем команды там сразу
    this.client.on('guildCreate', async (guild) => {
      try {
        this.logger.log(`Бот добавлен в гильдию ${guild.id} — регистрирую команды только там`);
        await this.registerCommandsForGuild(guild.id);
      } catch (e: any) {
        this.logger.warn(`Не удалось зарегистрировать команды после guildCreate: ${e?.message || e}`);
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      }
    });

    // ВАЖНО: если бота кикнули/он отключился/переместили — сбрасываем сессию,
    // иначе в памяти может остаться "играющий" player и /play начнёт только добавлять в очередь.
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      const me = this.client.user;
      if (!me) return;

      const guildId = newState.guild.id;
      const guild = newState.guild;

      // Проверка: если бот остался один в канале
      if (newState.id === me.id && newState.channelId) {
        try {
          const channel = await guild.channels.fetch(newState.channelId);
          if (channel && channel.isVoiceBased()) {
            const members = channel.members.filter(member => !member.user.bot);
            if (members.size === 0) {
              // Бот остался один в канале (только боты)
              this.logger.log(`Bot is alone in voice channel ${newState.channelId} for guild ${guildId}. Disconnecting...`);
              await this.playerManager.resetGuildSession(guildId, 'bot_alone_in_channel');
              // Сообщение удаляется автоматически через onCleanupCallback
              return;
            }
          }
        } catch (error) {
          this.logger.error(`Error checking channel members: ${error.message}`);
        }
      }

      // Обработка изменений состояния бота
      if (newState.id !== me.id) {
        // Проверяем, не остался ли бот один после того, как пользователь покинул канал
        if (oldState.channelId && !newState.channelId && oldState.member && !oldState.member.user.bot) {
          // Пользователь покинул канал, проверяем, не остался ли бот один
          try {
            const oldChannel = await guild.channels.fetch(oldState.channelId);
            if (oldChannel && oldChannel.isVoiceBased()) {
              const botMember = await guild.members.fetch(me.id);
              if (botMember.voice.channelId === oldState.channelId) {
                const members = oldChannel.members.filter(member => !member.user.bot);
                if (members.size === 0) {
                  // Бот остался один в канале
                  this.logger.log(`Bot is alone in voice channel ${oldState.channelId} for guild ${guildId} after user left. Disconnecting...`);
                  await this.playerManager.resetGuildSession(guildId, 'bot_alone_in_channel');
                  // Сообщение удаляется автоматически через onCleanupCallback
                  return;
                }
              }
            }
          } catch (error) {
            this.logger.error(`Error checking channel after user left: ${error.message}`);
          }
        }
        return;
      }

      const oldChannelId = oldState.channelId;
      const newChannelId = newState.channelId;

      if (oldChannelId && !newChannelId) {
        // Кик/отключение
        this.logger.warn(`Bot left voice channel in guild ${guildId} (was ${oldChannelId}). Resetting music session...`);
        await this.playerManager.resetGuildSession(guildId, 'bot_left_voice');
        // Сообщение удаляется автоматически через onCleanupCallback
      } else if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
        // Перемещение в другой канал = новая музыкальная сессия
        this.logger.warn(`Bot moved voice channel in guild ${guildId} (${oldChannelId} -> ${newChannelId}). Resetting music session...`);
        await this.playerManager.resetGuildSession(guildId, 'bot_moved_voice');
        // Сообщение удаляется автоматически через onCleanupCallback
      }
    });

    this.client.on('error', (error) => {
      this.logger.error(`Discord client error: ${error.message}`);
    });
  }

  /**
   * Обработка slash-команд
   * @param {ChatInputCommandInteraction} interaction - Взаимодействие с командой
   */
  private async handleCommand(interaction: ChatInputCommandInteraction) {
    const { commandName, guild, member } = interaction;

    if (!guild || !member) {
      await this.safeReply(interaction, { content: '❌ Команда может быть использована только на сервере', ephemeral: true });
      return;
    }

    const guildMember = member as GuildMember;
    const voiceChannel = guildMember.voice.channel;

    // Для команд, которые могут выполняться долго, максимально рано подтверждаем interaction
    // (иначе Discord может вернуть Unknown interaction).
    const didDefer = commandName === 'play' ? await this.safeDeferReply(interaction) : false;
    if (commandName === 'play' && !didDefer) {
      // Если не смогли defer'нуть — дальше смысла нет (interaction уже протух)
      return;
    }

    // Проверка подключения пользователя к голосовому каналу
    // Команды help, ping и queue не требуют подключения к голосовому каналу
    const commandsWithoutVoiceChannel = ['help', 'ping', 'queue'];
    if (!commandsWithoutVoiceChannel.includes(commandName) && !voiceChannel) {
      if (didDefer) {
        await this.safeEditReply(interaction, { content: '❌ Вы должны быть подключены к голосовому каналу' });
      } else {
        await this.safeReply(interaction, { content: '❌ Вы должны быть подключены к голосовому каналу', ephemeral: true });
      }
      return;
    }

    // Защита: если бот уже в voice — управлять можно только из этого же канала
    // (иначе можно управлять "из любой комнаты", что обычно нежелательно).
    const isControlCommand = ['pause', 'resume', 'skip', 'stop'].includes(commandName);
    if (isControlCommand) {
      try {
        const botMember = await guild.members.fetch(this.client.user!.id);
        const botChannelId = botMember.voice.channelId;
        if (botChannelId && voiceChannel && voiceChannel.id !== botChannelId) {
          if (didDefer) {
            await this.safeEditReply(interaction, { content: '❌ Вы должны находиться в том же голосовом канале, что и бот' });
          } else {
            await this.safeReply(interaction, { content: '❌ Вы должны находиться в том же голосовом канале, что и бот', ephemeral: true });
          }
          return;
        }
      } catch {
        // ignore (если не удалось получить состояние бота — не блокируем)
      }
    }

    try {
      let response: string;

      switch (commandName) {
        case 'play': {
          const query = interaction.options.getString('query', true);
          
          // Проверяем права бота в голосовом канале
          const botMember = await guild.members.fetch(this.client.user!.id);
          const permissions = voiceChannel!.permissionsFor(botMember);
          if (!permissions?.has(['Connect', 'Speak'])) {
            response = '❌ У бота нет прав Connect/Speak в этом голосовом канале';
            break;
          }
          
          response = await this.musicService.play(
            guild.id,
            voiceChannel!.id,
            query,
            guildMember.id,
            guildMember.displayName,
          );
          break;
        }

        case 'pause': {
          response = await this.musicService.pause(guild.id);
          break;
        }

        case 'resume': {
          response = await this.musicService.resume(guild.id);
          break;
        }

        case 'skip': {
          response = await this.musicService.skip(guild.id);
          break;
        }

        case 'queue': {
          response = await this.musicService.getQueue(guild.id);
          break;
        }

        case 'stop': {
          response = await this.musicService.stop(guild.id);
          break;
        }

        case 'help': {
          // Для help используем специальную обработку с Embed
          response = ''; // Не используется, но нужна для TypeScript
          break;
        }

        case 'ping': {
          // Для ping используем ephemeral ответ
          const latency = this.client.ws.ping;
          await interaction.reply({ content: `🏓 Pong! Задержка: ${latency}ms`, ephemeral: true });
          return;
        }

        default:
          response = '❌ Неизвестная команда';
      }

      if (commandName === 'play') {
        // Добавляем кнопки только если трек начал играть (не добавлен в очередь)
        if (response.includes('▶️ Воспроизведение:')) {
          const isPaused = this.musicService.getPausedState(guild.id) ?? false;
          const components = this.createMusicControls(isPaused);
          const message = await this.safeEditReply(interaction, { content: response, components });
          // Сохраняем ID сообщения с плеером для удаления когда очередь заканчивается
          if (message) {
            this.playerMessages.set(guild.id, message.id);
          }
        } else {
          // Для "Добавлено в очередь" показываем только кнопку "Открыть Плеер"
          const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
          const playerUrl = `${frontendUrl}/dashboard`;
          const openPlayerButton = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel('🎵 Открыть Плеер')
                .setStyle(ButtonStyle.Link)
                .setURL(playerUrl),
            ),
          ];
          await this.safeEditReply(interaction, { content: response, components: openPlayerButton });
        }
      } else if (commandName === 'help') {
        // Специальная обработка для help с Embed и кнопкой
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
        const playerUrl = `${frontendUrl}/dashboard`;
        
        const embed = new EmbedBuilder()
          .setColor(0x5865F2) // Discord синий цвет
          .setTitle('📋 Справка по командам')
          .setDescription('Список всех доступных команд бота')
          .addFields(
            {
              name: '🎵 **Музыка**',
              value: 
                '`/play <запрос>` - Воспроизвести трек или добавить в очередь\n' +
                '`/pause` - Поставить воспроизведение на паузу\n' +
                '`/resume` - Возобновить воспроизведение\n' +
                '`/skip` - Пропустить текущий трек\n' +
                '`/queue` - Показать очередь треков\n' +
                '`/stop` - Остановить воспроизведение и отключиться',
              inline: false,
            },
            {
              name: '🔧 **Другое**',
              value: 
                '`/ping` - Проверить задержку бота\n' +
                '`/help` - Показать эту справку',
              inline: false,
            },
            {
              name: '🌐 **Веб-приложение**',
              value: 
                'У нас есть удобное веб-приложение с музыкальным плеером! ' +
                'Вы можете управлять музыкой прямо через браузер - переключать треки, ' +
                'просматривать очередь, ставить на паузу и многое другое.',
              inline: false,
            }
          )
          .setFooter({ text: 'Используйте кнопку ниже, чтобы открыть веб-панель' })
          .setTimestamp();

        const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🌐 Открыть веб-панель')
            .setStyle(ButtonStyle.Link)
            .setURL(playerUrl)
            .setEmoji('🎵'),
        );

        await this.safeReply(interaction, { embeds: [embed], components: [button] });
      } else {
        await this.safeReply(interaction, { content: response });
      }
    } catch (error) {
      this.logger.error(`Ошибка при выполнении команды ${commandName}: ${error.message}`);
      try {
        if (interaction.deferred || interaction.replied) {
          await this.safeEditReply(interaction, { content: `❌ Произошла ошибка: ${error.message}` });
        } else {
          await this.safeReply(interaction, { content: `❌ Произошла ошибка: ${error.message}`, ephemeral: true });
        }
      } catch (replyError) {
        this.logger.error(`Ошибка при отправке ответа: ${replyError.message}`);
      }
    }
  }

  private isUnknownInteraction(err: any): boolean {
    return err?.code === 10062 || String(err?.message || '').toLowerCase().includes('unknown interaction');
  }

  private async safeDeferReply(interaction: ChatInputCommandInteraction): Promise<boolean> {
    try {
      if (interaction.deferred || interaction.replied) return true;
      await interaction.deferReply();
      return true;
    } catch (err: any) {
      if (this.isUnknownInteraction(err)) {
        this.logger.warn(`deferReply failed: Unknown interaction (cmd=${interaction.commandName})`);
        return false;
      }
      this.logger.error(`deferReply failed: ${err?.message || err}`);
      return false;
    }
  }

  private async safeReply(interaction: ChatInputCommandInteraction, payload: any): Promise<void> {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (err: any) {
      if (this.isUnknownInteraction(err)) {
        this.logger.warn(`reply failed: Unknown interaction (cmd=${interaction.commandName})`);
        return;
      }
      this.logger.error(`reply failed: ${err?.message || err}`);
    }
  }

  private async safeEditReply(interaction: ChatInputCommandInteraction, payload: any): Promise<Message | null> {
    try {
      const result = await interaction.editReply(payload);
      return (result as any) ?? null;
    } catch (err: any) {
      if (this.isUnknownInteraction(err)) {
        this.logger.warn(`editReply failed: Unknown interaction (cmd=${interaction.commandName})`);
        return null;
      }
      this.logger.error(`editReply failed: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * Создать кнопки управления музыкой
   * @param isPaused - Состояние паузы (true = на паузе, false = играет)
   */
  private createMusicControls(isPaused: boolean = false) {
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    const playerUrl = `${frontendUrl}/dashboard`;

    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        // Одна кнопка для паузы/продолжить, которая меняется в зависимости от состояния
        new ButtonBuilder()
          .setCustomId(isPaused ? 'music_resume' : 'music_pause')
          .setLabel(isPaused ? '▶️ Продолжить' : '⏸️ Пауза')
          .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('music_skip')
          .setLabel('⏭️ Пропустить')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_queue')
          .setLabel('📋 Очередь')
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('🎵 Открыть Плеер')
          .setStyle(ButtonStyle.Link)
          .setURL(playerUrl),
      ),
    ];
  }

  /**
   * Обработка взаимодействий с кнопками
   */
  private async handleButton(interaction: MessageComponentInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: '❌ Команда может быть использована только на сервере', ephemeral: true });
      return;
    }

    const guildMember = interaction.member as GuildMember;
    const voiceChannel = guildMember.voice.channel;

    if (!voiceChannel && interaction.customId !== 'music_queue') {
      await interaction.reply({ content: '❌ Вы должны быть подключены к голосовому каналу', ephemeral: true });
      return;
    }

    // Защита: если бот в voice — кнопками управлять можно только из того же канала.
    if (interaction.customId !== 'music_queue') {
      try {
        const botMember = await interaction.guild.members.fetch(this.client.user!.id);
        const botChannelId = botMember.voice.channelId;
        if (botChannelId && voiceChannel && voiceChannel.id !== botChannelId) {
          await interaction.reply({ content: '❌ Вы должны находиться в том же голосовом канале, что и бот', ephemeral: true });
          return;
        }
      } catch {
        // ignore
      }
    }

    try {
      await interaction.deferUpdate();

      let response: string;
      let shouldDelete = false;

      switch (interaction.customId) {
        case 'music_pause':
        case 'music_resume': {
          // Используем togglePause для переключения состояния
          const result = await this.musicService.togglePause(interaction.guild.id);
          response = result.message;
          // Обновляем сообщение с новыми кнопками
          const components = this.createMusicControls(result.isPaused);
          await interaction.editReply({ content: response, components });
          return; // Выходим раньше, так как уже обновили сообщение
        }

        case 'music_skip': {
          response = await this.musicService.skip(interaction.guild.id);
          // Для skip удаляем сообщение и создаем новое
          shouldDelete = true;
          break;
        }

        case 'music_queue': {
          response = await this.musicService.getQueue(interaction.guild.id);
          break;
        }

        default:
          return;
      }

      if (shouldDelete && interaction.message) {
        // Удаляем старое сообщение
        await interaction.message.delete().catch(() => {
          // Игнорируем ошибки, если сообщение уже удалено
        });
        // Создаем новое сообщение
        const isPaused = this.musicService.getPausedState(interaction.guild.id) ?? false;
        const components = this.createMusicControls(isPaused);
        const newMessage = await interaction.channel!.send({ content: response, components });
        // Обновляем сохраненный ID сообщения с плеером
        this.playerMessages.set(interaction.guild.id, newMessage.id);
      } else {
        // Обновляем сообщение с новым текстом и кнопками
        const isPaused = this.musicService.getPausedState(interaction.guild.id) ?? false;
        const components = this.createMusicControls(isPaused);
        await interaction.editReply({ content: response, components });
        // Обновляем ID сообщения (если это очередь, мы не сохраняем, так как это не сообщение с плеером)
        if (interaction.customId !== 'music_queue' && interaction.message) {
          this.playerMessages.set(interaction.guild.id, interaction.message.id);
        }
      }
    } catch (error) {
      this.logger.error(`Ошибка при обработке кнопки ${interaction.customId}: ${error.message}`);
      try {
        await interaction.followUp({ content: `❌ Произошла ошибка: ${error.message}`, ephemeral: true });
      } catch (replyError) {
        this.logger.error(`Ошибка при отправке ответа: ${replyError.message}`);
      }
    }
  }

  /**
   * Форматировать длительность трека в мм:сс
   * @param {number} ms - Длительность в миллисекундах
   * @returns {string} Отформатированная строка
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Получить URL обложки для YouTube видео
   * @param {string} videoId - ID YouTube видео
   * @returns {string} URL обложки
   */
  private getYouTubeThumbnail(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  /**
   * Извлечь ID YouTube видео из URL или identifier
   * @param {string} uri - URI или identifier
   * @returns {string | null} ID видео или null
   */
  private extractYouTubeId(uri: string): string | null {
    const match = uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * Удалить сообщение с плеером для гильдии (вызывается когда очередь пуста)
   * @param {string} guildId - ID гильдии Discord
   */
  async deletePlayerMessage(guildId: string): Promise<void> {
    const messageId = this.playerMessages.get(guildId);
    if (!messageId) {
      return; // Сообщение не найдено или уже удалено
    }

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.playerMessages.delete(guildId);
        return;
      }

      // Ищем сообщение во всех текстовых каналах сервера
      const channels = guild.channels.cache.filter(channel => channel.isTextBased());
      
      for (const channel of channels.values()) {
        if (!channel.isTextBased()) continue;
        
        try {
          const message = await channel.messages.fetch(messageId).catch(() => null);
          if (message) {
            await message.delete();
            this.playerMessages.delete(guildId);
            this.logger.log(`Deleted player message ${messageId} for guild ${guildId}`);
            return;
          }
        } catch (error) {
          // Продолжаем поиск в других каналах
        }
      }

      // Если сообщение не найдено, удаляем из кэша
      this.playerMessages.delete(guildId);
    } catch (error) {
      this.logger.error(`Error deleting player message for guild ${guildId}: ${error.message}`);
      this.playerMessages.delete(guildId);
    }
  }

  /**
   * Получить сообщение со справкой по командам (устаревший метод, используется Embed)
   * @returns {string} Форматированное сообщение со справкой
   * @deprecated Используется Embed в handleCommand
   */
  private getHelpMessage(): string {
    return `📋 **Доступные команды:**

**Музыка:**
\`/play <запрос>\` - Воспроизвести трек или добавить в очередь
\`/pause\` - Поставить воспроизведение на паузу
\`/resume\` - Возобновить воспроизведение
\`/skip\` - Пропустить текущий трек
\`/queue\` - Показать очередь треков
\`/stop\` - Остановить воспроизведение и отключиться

**Другое:**
\`/ping\` - Проверить задержку бота
\`/help\` - Показать эту справку`;
  }

  /**
   * Подключение бота к Discord
   */
  private async login() {
    try {
      await this.client.login(process.env.BOT_TOKEN);
    } catch (error) {
      this.logger.error(`Ошибка при подключении к Discord: ${error.message}`);
      process.exit(1);
    }
  }
}

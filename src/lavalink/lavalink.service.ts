import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Shoukaku, ShoukakuOptions, Connectors, NodeOption } from 'shoukaku';
import { Client } from 'discord.js';

/**
 * Сервис для управления подключением к Lavalink серверу
 * Использует Shoukaku как клиент для взаимодействия с Lavalink
 */
@Injectable()
export class LavalinkService implements OnModuleInit {
  private readonly logger = new Logger(LavalinkService.name);
  private shoukaku: Shoukaku;
  private discordClient: Client | null = null;

  /**
   * Установить Discord клиент для Shoukaku и инициализировать Shoukaku
   * @param {Client} client - Discord.js клиент
   */
  async setDiscordClient(client: Client) {
    this.discordClient = client;
    if (!this.shoukaku) {
      await this.initialize();
    }
  }

  /**
   * Инициализация Shoukaku клиента при старте модуля
   */
  async onModuleInit() {
    // Инициализация будет выполнена после установки Discord клиента
    // Если клиент уже установлен, инициализируем сразу
    if (this.discordClient) {
      await this.initialize();
    }
  }

  /**
   * Инициализация Shoukaku клиента
   * Должна быть вызвана после установки Discord клиента
   */
  async initialize() {
    if (!this.discordClient) {
      this.logger.warn('Discord client not set, Shoukaku will be initialized without connector');
    }

    const lavalinkHost = process.env.LAVALINK_HOST || 'localhost';
    const lavalinkPort = process.env.LAVALINK_PORT || '2333';
    const lavalinkPassword = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

    // Убеждаемся, что URL не содержит протокол (Shoukaku добавляет его автоматически)
    const cleanHost = lavalinkHost.replace(/^(https?:\/\/|ws:\/\/|wss:\/\/)/, '');
    const nodeUrl = `${cleanHost}:${lavalinkPort}`;

    const nodes: NodeOption[] = [
      {
        name: 'main',
        url: nodeUrl,
        auth: lavalinkPassword,
        secure: false, // Указываем явно, что не используем SSL
      },
    ];

    this.logger.log(
      `Инициализация Shoukaku с узлом: ${nodes[0].url} (secure: ${nodes[0].secure}). ` +
        'Shoukaku 4 подключается к Lavalink v4 (путь /v4/websocket). При 404 обновите сервер Lavalink до v4.',
    );

    const options: ShoukakuOptions = {
      moveOnDisconnect: false,
      resume: false,
      resumeTimeout: 30,
      reconnectTries: 2,
      restTimeout: 10000,
      nodeResolver: (nodes) => nodes.get('main') ?? Array.from(nodes.values())[0],
    };

    // Используем Discord.js коннектор для Shoukaku, если клиент установлен
    if (this.discordClient) {
      const connector = new Connectors.DiscordJS(this.discordClient);
      this.shoukaku = new Shoukaku(connector, nodes, options);
      
      this.logger.log(`Shoukaku инициализирован. Узлов в карте сразу после создания: ${this.shoukaku.nodes.size}`);
      this.logger.log(`Shoukaku ID: ${this.shoukaku.id || 'не установлен (еще не готов)'}`);
    } else {
      // Fallback без коннектора (не рекомендуется для production)
      // Note: Shoukaku requires a connector, so this will fail at runtime
      this.logger.error('Shoukaku requires a connector. Discord client must be set.');
      throw new Error('Discord client is required for Shoukaku initialization');
    }

    this.shoukaku.on('ready', (name, reconnected) => {
      this.logger.log(`Lavalink node "${name}" connected${reconnected ? ' (reconnected)' : ''}`);
      this.logger.log(`Узлов в карте после подключения: ${this.shoukaku.nodes.size}`);
    });

    this.shoukaku.on('error', (name, error) => {
      this.logger.error(`Lavalink node "${name}" error: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
    });

    this.shoukaku.on('close', (name, code, reason) => {
      this.logger.warn(`Lavalink node "${name}" closed: ${code} ${reason}`);
    });

    this.shoukaku.on('disconnect', (name, count) => {
      this.logger.warn(`Lavalink node "${name}" disconnected. Count: ${count}`);
    });

    this.shoukaku.on('debug', (name, info) => {
      this.logger.debug(`Shoukaku debug [${name}]: ${info}`);
    });
  }

  /**
   * Получить экземпляр Shoukaku клиента
   * @returns {Shoukaku} Экземпляр Shoukaku
   */
  getClient(): Shoukaku {
    return this.shoukaku;
  }
}

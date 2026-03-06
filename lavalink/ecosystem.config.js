{
  name: 'lavalink',
  namespace: 'Java',
  script: 'Lavalink.jar',
  interpreter: '/usr/bin/java',
  interpreter_args: '-jar',
  cwd: '/root/opgmusicbot/lavalink',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '1G',
}

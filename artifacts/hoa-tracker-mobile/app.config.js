// Native binary channel selection. OTA bundles cannot change the native channel.
module.exports = ({ config }) => {
  const channel = process.env.HOA_OTA_CHANNEL || 'production';
  if (!['production', 'test'].includes(channel)) throw new Error('Unknown OTA channel.');
  const updates = { ...config.updates };
  if (channel === 'test') {
    updates.url = updates.url.replace('/production/manifest', '/test/manifest');
  }
  // Debug/Expo Go test APKs must never consume production updates.
  if (process.env.HOA_OTA_DISABLED === '1') updates.enabled = false;
  return {
    ...config,
    runtimeVersion: `${config.runtimeVersion}${channel === 'test' ? '-test' : ''}`,
    updates,
  };
};

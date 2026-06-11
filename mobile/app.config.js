const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

function withLocalhostHttpNetworkSecurity(config) {
  config = withAndroidManifest(config, (configWithManifest) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(configWithManifest.modResults);
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return configWithManifest;
  });

  return withDangerousMod(config, [
    'android',
    async (configWithMod) => {
      const xmlDir = path.join(configWithMod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<network-security-config>',
          '  <base-config cleartextTrafficPermitted="false" />',
          '  <domain-config cleartextTrafficPermitted="true">',
          '    <domain>127.0.0.1</domain>',
          '    <domain>localhost</domain>',
          '    <domain>10.0.2.2</domain>',
          '    <domain includeSubdomains="true">map.naver.com</domain>',
          '    <domain includeSubdomains="true">map.naver.net</domain>',
          '    <domain includeSubdomains="true">pstatic.net</domain>',
          '  </domain-config>',
          '</network-security-config>',
          '',
        ].join('\n'),
      );
      return configWithMod;
    },
  ]);
}

module.exports = ({ config }) => withLocalhostHttpNetworkSecurity({
  ...config,
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
  },
});

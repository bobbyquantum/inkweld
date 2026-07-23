import { isDevMode } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';

import aboutEn from '../../public/assets/i18n/en/about.json';
import adminEn from '../../public/assets/i18n/en/admin.json';
import appEn from '../../public/assets/i18n/en/app.json';
import authEn from '../../public/assets/i18n/en/auth.json';
import canvasEn from '../../public/assets/i18n/en/canvas.json';
import commonEn from '../../public/assets/i18n/en/common.json';
import dialogsEn from '../../public/assets/i18n/en/dialogs.json';
import editorEn from '../../public/assets/i18n/en/editor.json';
import homeEn from '../../public/assets/i18n/en/home.json';
import loginEn from '../../public/assets/i18n/en/login.json';
import mediaEn from '../../public/assets/i18n/en/media.json';
import messagesEn from '../../public/assets/i18n/en/messages.json';
import projectEn from '../../public/assets/i18n/en/project.json';
import publishEn from '../../public/assets/i18n/en/publish.json';
import relationshipsEn from '../../public/assets/i18n/en/relationships.json';
import settingsEn from '../../public/assets/i18n/en/settings.json';
import tagsEn from '../../public/assets/i18n/en/tags.json';
import templatesEn from '../../public/assets/i18n/en/templates.json';
import timelineEn from '../../public/assets/i18n/en/timeline.json';
import worldbuildingEn from '../../public/assets/i18n/en/worldbuilding.json';

const enTranslations = {
  ...commonEn,
  app: appEn,
  login: loginEn,
  home: homeEn,
  settings: settingsEn,
  editor: editorEn,
  project: projectEn,
  dialogs: dialogsEn,
  admin: adminEn,
  auth: authEn,
  canvas: canvasEn,
  timeline: timelineEn,
  media: mediaEn,
  worldbuilding: worldbuildingEn,
  publish: publishEn,
  about: aboutEn,
  relationships: relationshipsEn,
  tags: tagsEn,
  templates: templatesEn,
  messages: messagesEn,
};

export function translocoTestProvider() {
  return TranslocoTestingModule.forRoot({
    translocoConfig: {
      availableLangs: [{ id: 'en', label: 'English' }],
      defaultLang: 'en',
      fallbackLang: 'en',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: {
        logMissingKey: false,
        useFallbackTranslation: true,
        allowEmpty: false,
      },
      scopes: {
        autoPrefixKeys: false,
      },
    },
    preloadLangs: true,
    langs: { en: enTranslations },
  });
}
